#!/usr/bin/env node
// llm-wiki deterministic validator.
//
// Checks a generated .llm-wiki/ directory for structural integrity so the
// generate/update skills can gate on it (mirrors code-atlas's query.js --validate).
// Dependency-free. Both a library (module.exports) and a CLI:
//
//   node validate.js [wikiDir] [--json]
//
// Exit code 0 when there are no ERRORS (warnings are allowed); 1 otherwise.
//
// Mermaid checking is a dependency-free STRUCTURAL LINT (diagram-type header,
// balanced brackets, closed fences) -- not a full Mermaid parse, which would
// require the mermaid package and violate this repo's no-runtime-deps rule.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PAGE_TYPES = [
  "overview",
  "architecture",
  "getting-started",
  "data-flow",
  "module",
  "concept",
  "reference",
  "data-model",
  "glossary",
];
const STATUSES = ["stub", "draft", "stable"];
const MERMAID_KEYWORDS = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "erDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "gantt",
  "pie",
  "journey",
  "mindmap",
  "timeline",
  "gitGraph",
  "quadrantChart",
];

// Minimal YAML frontmatter parse: returns { fm, body }. Handles flat scalars,
// `>`/`|` folded blocks, inline `[a, b]` arrays, and `-` block lists.
function parseFrontmatter(raw) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: null, body: text };
  const lines = m[1].split(/\r?\n/);
  const fm = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    if (val === ">" || val === "|") {
      const buf = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) buf.push(lines[++i].trim());
      fm[key] = buf.join(" ");
    } else if (val.startsWith("[")) {
      fm[key] = val
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (val === "") {
      const buf = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) buf.push(lines[++i].replace(/^\s*-\s+/, "").trim());
      fm[key] = buf.length ? buf : "";
    } else {
      fm[key] = val.replace(/^["']|["']$/g, "");
    }
  }
  return { fm, body: m[2] };
}

// Structural lint of all ```mermaid blocks in a Markdown body.
// Returns an array of issue strings (empty = clean).
function lintMermaid(body) {
  const issues = [];
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let fenceLang = "";
  let block = [];
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```(\w*)\s*$/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceLang = fence[1];
        block = [];
        startLine = i + 1;
      } else {
        if (fenceLang === "mermaid") issues.push(...lintMermaidBlock(block, startLine));
        inFence = false;
        fenceLang = "";
      }
    } else if (inFence) {
      block.push(lines[i]);
    }
  }
  if (inFence) issues.push(`unclosed code fence opened at line ${startLine}`);
  return issues;
}

function lintMermaidBlock(block, startLine) {
  const issues = [];
  const nonEmpty = block.filter((l) => l.trim() !== "");
  if (nonEmpty.length === 0) {
    issues.push(`empty mermaid block at line ${startLine}`);
    return issues;
  }
  const first = nonEmpty[0].trim();
  const ok = MERMAID_KEYWORDS.some((k) => first === k || first.startsWith(k + " ") || first.startsWith(k));
  if (!ok) issues.push(`mermaid block at line ${startLine} has unknown diagram type: "${first.slice(0, 40)}"`);
  const text = block.join("\n");
  const pairs = [
    ["[", "]"],
    ["(", ")"],
    ["{", "}"],
  ];
  for (const [open, close] of pairs) {
    const o = (text.match(new RegExp("\\" + open, "g")) || []).length;
    const c = (text.match(new RegExp("\\" + close, "g")) || []).length;
    if (o !== c) issues.push(`mermaid block at line ${startLine} has unbalanced ${open}${close} (${o} vs ${c})`);
  }

  // Flowchart/graph-specific structural checks. Note: a bare id used in an edge
  // is auto-declared in Mermaid, so "undeclared node" is NOT a real error and is
  // deliberately not flagged. These are checks for genuine parse failures.
  if (/^(flowchart|graph)\b/.test(first)) {
    // subgraph blocks must each be closed by a standalone `end`
    let opens = 0;
    let closes = 0;
    let bodyLines = 0;
    for (let i = 1; i < nonEmpty.length; i++) {
      const t = nonEmpty[i].trim();
      if (/^subgraph\b/.test(t)) opens++;
      else if (/^end$/i.test(t)) closes++;
      else bodyLines++;
    }
    if (opens > closes) issues.push(`mermaid flowchart at line ${startLine} has ${opens - closes} unclosed subgraph block(s) (missing 'end')`);
    else if (closes > opens) issues.push(`mermaid flowchart at line ${startLine} has ${closes - opens} stray 'end' with no matching subgraph`);
    if (bodyLines === 0) issues.push(`mermaid flowchart at line ${startLine} has no nodes or edges (header only -- likely truncated)`);
  }
  return issues;
}

// Extract `path:line` (or `path:start-end`) source citations from a Markdown body.
// Only matches inside backtick code spans (citations are code spans), requires a
// repo-relative path (contains a "/") ending in a file extension, so prose colons
// and bare filenames are not treated as citations. Returns [{ raw, path, start, end }].
function extractCitations(body) {
  const out = [];
  const re = /`([^`]*?\/[^`\s]*?\.[A-Za-z][A-Za-z0-9]{0,5}):(\d+)(?:-(\d+))?`/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push({ raw: m[0].replace(/`/g, ""), path: m[1], start: Number(m[2]), end: m[3] ? Number(m[3]) : null });
  }
  return out;
}

// Extract intra-wiki link slugs from a Markdown body: ](slug.md) or ](pages/slug.md).
function extractPageLinks(body) {
  const out = [];
  const re = /\]\((?:\.\/)?(?:pages\/)?([A-Za-z0-9_-]+)\.md(?:#[^)]*)?\)/g;
  let m;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out;
}

function validateWiki(wikiDir) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);

  const indexPath = path.join(wikiDir, "index.md");
  const pagesDir = path.join(wikiDir, "pages");

  if (!fs.existsSync(wikiDir)) {
    err(`wiki directory not found: ${wikiDir}`);
    return { errors, warnings, stats: {} };
  }
  if (!fs.existsSync(indexPath)) err("index.md is missing");
  if (!fs.existsSync(pagesDir) || !fs.statSync(pagesDir).isDirectory()) {
    err("pages/ directory is missing");
    return { errors, warnings, stats: {} };
  }

  const repoRoot = path.dirname(wikiDir);
  const lineCountCache = {};
  function fileLineCount(rel) {
    if (rel in lineCountCache) return lineCountCache[rel];
    let n = -1; // -1 = file missing
    try {
      n = fs.readFileSync(path.join(repoRoot, rel), "utf8").split(/\r?\n/).length;
    } catch {}
    lineCountCache[rel] = n;
    return n;
  }

  // Pages
  const pageFiles = fs.readdirSync(pagesDir).filter((f) => f.endsWith(".md")).sort();
  if (pageFiles.length === 0) err("pages/ contains no .md pages");
  const slugs = new Set(pageFiles.map((f) => f.replace(/\.md$/, "")));
  let mermaidCount = 0;
  let citationCount = 0;
  const crossLinkTargets = {}; // slug -> Set of targets it links to (for backlink/orphan checks)

  for (const f of pageFiles) {
    const slug = f.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(pagesDir, f), "utf8");
    const { fm, body } = parseFrontmatter(raw);
    if (!fm) {
      err(`${f}: missing or malformed YAML frontmatter`);
      continue;
    }
    for (const req of ["id", "title", "type", "summary", "source_files"]) {
      if (fm[req] === undefined || fm[req] === "" || (Array.isArray(fm[req]) && fm[req].length === 0)) {
        err(`${f}: frontmatter missing required field "${req}"`);
      }
    }
    if (fm.id && fm.id !== slug) err(`${f}: frontmatter id "${fm.id}" does not match filename slug "${slug}"`);
    if (fm.type && !PAGE_TYPES.includes(fm.type)) err(`${f}: invalid type "${fm.type}"`);
    if (fm.status && !STATUSES.includes(fm.status)) err(`${f}: invalid status "${fm.status}"`);
    if (fm.status === "stub") warn(`${f}: page is a stub (had thin source material)`);
    if (!fm.status) warn(`${f}: frontmatter missing "status"`);

    // mermaid lint
    const mIssues = lintMermaid(body);
    mermaidCount += (body.match(/```mermaid/g) || []).length;
    for (const mi of mIssues) err(`${f}: ${mi}`);

    // path:line citations -- guard against hallucinated line numbers (advisory)
    for (const c of extractCitations(body)) {
      citationCount++;
      const lines = fileLineCount(c.path);
      if (lines === -1) warn(`${f}: citation "${c.raw}" points to a missing file`);
      else if (c.start < 1 || c.start > lines || (c.end && c.end > lines)) {
        warn(`${f}: citation "${c.raw}" is out of range (${c.path} has ${lines} lines)`);
      }
    }

    // cross-links: from frontmatter related + body links
    const related = Array.isArray(fm.related) ? fm.related : [];
    const bodyLinks = extractPageLinks(body);
    const targets = new Set([...related, ...bodyLinks]);
    targets.delete(slug); // self-links are harmless, ignore
    crossLinkTargets[slug] = targets;
    for (const t of targets) {
      if (!slugs.has(t)) err(`${f}: dangling cross-link to "${t}" (no such page)`);
    }
    if (related.length === 0 && fm.type !== "glossary" && fm.type !== "overview") {
      warn(`${f}: no "related" cross-links (risk of an orphan page)`);
    }
  }

  // Index
  let declaredPageCount = null;
  let declaredBroken = null;
  if (fs.existsSync(indexPath)) {
    const { fm, body } = parseFrontmatter(fs.readFileSync(indexPath, "utf8"));
    if (!fm) {
      err("index.md: missing or malformed YAML frontmatter");
    } else {
      for (const req of ["llm_wiki_index", "schema_version", "baseline_commit", "page_count", "broken_link_count"]) {
        if (fm[req] === undefined) err(`index.md: frontmatter missing "${req}"`);
      }
      declaredPageCount = fm.page_count !== undefined ? Number(fm.page_count) : null;
      declaredBroken = fm.broken_link_count !== undefined ? Number(fm.broken_link_count) : null;
      if (declaredPageCount !== null && declaredPageCount !== pageFiles.length) {
        err(`index.md: page_count ${declaredPageCount} does not match ${pageFiles.length} pages on disk`);
      }
      // every index link must resolve; every page should be linked from the index
      const indexLinks = new Set(extractPageLinks(body));
      for (const t of indexLinks) if (!slugs.has(t)) err(`index.md: dangling link to "${t}"`);
      for (const s of slugs) if (!indexLinks.has(s)) warn(`index.md: page "${s}" is not linked from the index`);
    }
  }

  // broken_link_count honesty: recompute total dangling cross-links
  let actualBroken = 0;
  for (const [s, targets] of Object.entries(crossLinkTargets)) {
    for (const t of targets) if (!slugs.has(t)) actualBroken++;
  }
  if (declaredBroken !== null && declaredBroken < actualBroken) {
    err(`index.md: broken_link_count says ${declaredBroken} but ${actualBroken} dangling cross-links were found`);
  }

  // state.json (optional; gitignored cache)
  const statePath = path.join(wikiDir, "state.json");
  if (fs.existsSync(statePath)) {
    let state;
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch (e) {
      err(`state.json: invalid JSON (${e.message})`);
    }
    if (state) {
      if (!state._header || state._header.schema_version !== 1) err("state.json: _header.schema_version must be 1");
      if (!state.pages || typeof state.pages !== "object") err("state.json: missing pages map");
      else {
        for (const [pk, pv] of Object.entries(state.pages)) {
          if (!Array.isArray(pv.source_files)) {
            err(`state.json: ${pk} has no source_files array`);
            continue;
          }
          if (pv.content_hash && !/^sha256:[0-9a-f]+$/.test(pv.content_hash)) {
            warn(`state.json: ${pk} content_hash is not a sha256:<hex> value`);
          }
          for (const sf of pv.source_files) {
            if (!fs.existsSync(path.join(repoRoot, sf))) warn(`state.json: ${pk} references missing source file "${sf}" (page may be stale)`);
          }
        }
      }
    }
  }

  // llms.txt (optional)
  const llmsPath = path.join(wikiDir, "llms.txt");
  if (fs.existsSync(llmsPath)) {
    const t = fs.readFileSync(llmsPath, "utf8");
    if (!/^\s*#\s+\S/.test(t)) err("llms.txt: missing H1 title line");
    if (!/\n>\s+\S/.test("\n" + t)) warn("llms.txt: missing a summary blockquote (recommended by the llms.txt spec)");
  }

  return {
    errors,
    warnings,
    stats: {
      pages: pageFiles.length,
      mermaid_diagrams: mermaidCount,
      citations: citationCount,
      dangling_cross_links: actualBroken,
      has_state: fs.existsSync(statePath),
      has_llms_txt: fs.existsSync(llmsPath),
    },
  };
}

function main(argv) {
  const args = argv.slice(2).filter((a) => a !== "--json");
  const asJson = argv.includes("--json");
  const wikiDir = path.resolve(args[0] || ".llm-wiki");
  const res = validateWiki(wikiDir);
  if (asJson) {
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    return res.errors.length ? 1 : 0;
  }
  const { errors, warnings, stats } = res;
  console.log(`llm-wiki validate: ${wikiDir}`);
  if (stats.pages !== undefined) {
    console.log(
      `  pages=${stats.pages} mermaid=${stats.mermaid_diagrams} citations=${stats.citations} dangling_links=${stats.dangling_cross_links} ` +
        `state=${stats.has_state ? "yes" : "no"} llms.txt=${stats.has_llms_txt ? "yes" : "no"}`,
    );
  }
  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  if (errors.length === 0) console.log(`  OK (${warnings.length} warning${warnings.length === 1 ? "" : "s"})`);
  else console.log(`  FAILED: ${errors.length} error${errors.length === 1 ? "" : "s"}`);
  return errors.length ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  PAGE_TYPES,
  STATUSES,
  MERMAID_KEYWORDS,
  parseFrontmatter,
  lintMermaid,
  lintMermaidBlock,
  extractCitations,
  extractPageLinks,
  validateWiki,
  main,
};
