#!/usr/bin/env node
// llm-wiki citation normalizer.
//
// Writers sometimes cite an ABBREVIATED path (`downtime/types.rs:9` or even an
// ellipsis `.../loot.rs:21`) instead of a full repo-relative path. The file and
// line are correct, but the citation is not resolvable from the repo root, so
// validate.js warns. This rewrites each abbreviated `path:line` citation to the
// unique full repo-relative path that its suffix matches. Conservative: it only
// rewrites when there is EXACTLY ONE matching file, and never touches a citation
// that already resolves. Ambiguous ones are left untouched (and reported) so a
// human / validate.js still surfaces them.
//
// Dependency-free; both a library and a CLI:
//   node normalize-citations.js --wiki <dir> [--repo <root>] [--json]
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Citation inside a backtick code span: a path containing "/" and a file
// extension, then :line or :start-end. Mirrors validate.js's extractCitations.
const CITE = /`([^`]*?\/[^`\s]*?\.[A-Za-z][A-Za-z0-9]{0,5}):(\d+)(-\d+)?`/g;

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "target", "vendor",
  "__pycache__", ".next", ".nuxt", "coverage", ".venv", "venv", ".cache",
  ".turbo", ".llm-wiki", ".code-atlas",
]);

// All repo-relative file paths (forward-slash). git when available, else a walk.
function repoFiles(root) {
  try {
    const tracked = execSync("git ls-files", { cwd: root, maxBuffer: 128 * 1024 * 1024 }).toString().split("\n");
    let untracked = [];
    try {
      untracked = execSync("git ls-files --others --exclude-standard", { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString().split("\n");
    } catch {}
    const out = [...tracked, ...untracked].map((s) => s.trim()).filter(Boolean).filter((p) => !SKIP_DIRS.has(p.split("/")[0]));
    if (out.length) return out;
  } catch {}
  const acc = [];
  walk(root, root, acc);
  return acc;
}

function walk(root, dir, acc) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, abs, acc);
    else if (e.isFile()) acc.push(path.relative(root, abs).split(path.sep).join("/"));
  }
}

function stripLeadingDots(p) {
  return p.replace(/^(?:\.+\/)+/, ""); // drop leading "../" or ".../" ellipsis runs
}

// Returns the unique full repo-relative path for an abbreviated citation path,
// or null if it already resolves, is ambiguous, or has no match.
function resolveCitation(citePath, root, files) {
  if (fs.existsSync(path.join(root, citePath))) return null; // already valid
  const candidates = [citePath, stripLeadingDots(citePath)].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const c of candidates) {
    const matches = files.filter((f) => f === c || f.endsWith("/" + c));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

// Normalize a single page body. Returns { text, expanded, unresolved[] }.
function normalizeBody(body, root, files) {
  let expanded = 0;
  const unresolved = [];
  const text = body.replace(CITE, (m, cpath, start, range) => {
    if (fs.existsSync(path.join(root, cpath))) return m; // good already
    const full = resolveCitation(cpath, root, files);
    if (full) {
      expanded++;
      return "`" + full + ":" + start + (range || "") + "`";
    }
    unresolved.push(cpath + ":" + start + (range || ""));
    return m;
  });
  return { text, expanded, unresolved };
}

function normalizeWiki(wikiDir, opts = {}) {
  const root = opts.repoRoot || path.dirname(wikiDir);
  const pagesDir = path.join(wikiDir, "pages");
  const files = repoFiles(root);
  const result = { pages_changed: 0, expanded: 0, unresolved: [], per_page: {} };
  if (!fs.existsSync(pagesDir)) return result;
  for (const f of fs.readdirSync(pagesDir).filter((x) => x.endsWith(".md"))) {
    const p = path.join(pagesDir, f);
    const body = fs.readFileSync(p, "utf8");
    const { text, expanded, unresolved } = normalizeBody(body, root, files);
    if (expanded > 0 && opts.write !== false) fs.writeFileSync(p, text);
    if (expanded > 0 || unresolved.length) result.per_page[f] = { expanded, unresolved };
    if (expanded > 0) result.pages_changed++;
    result.expanded += expanded;
    for (const u of unresolved) result.unresolved.push(`${f}: ${u}`);
  }
  return result;
}

function parseArgs(argv) {
  const out = {};
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--json") out.json = true;
    else if (a[i] === "--wiki") out.wiki = a[++i];
    else if (a[i] === "--repo") out.repo = a[++i];
    else if (!a[i].startsWith("--") && !out.wiki) out.wiki = a[i];
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  const wikiDir = path.resolve(args.wiki || ".llm-wiki");
  const res = normalizeWiki(wikiDir, { repoRoot: args.repo ? path.resolve(args.repo) : undefined });
  if (args.json) {
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    return 0;
  }
  console.log(`llm-wiki normalize-citations: ${wikiDir}`);
  console.log(`  expanded ${res.expanded} citation(s) across ${res.pages_changed} page(s); ${res.unresolved.length} left unresolved`);
  for (const u of res.unresolved.slice(0, 20)) console.log(`  unresolved: ${u}`);
  if (res.unresolved.length > 20) console.log(`  ... and ${res.unresolved.length - 20} more`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { CITE, repoFiles, stripLeadingDots, resolveCitation, normalizeBody, normalizeWiki, main };
