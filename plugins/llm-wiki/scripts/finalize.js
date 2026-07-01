#!/usr/bin/env node
// llm-wiki deterministic finalize step.
//
// Builds .llm-wiki/state.json (file_index + per-page provenance ledger) and
// .llm-wiki/llms.txt (and optionally llms-full.txt) from the pages already on
// disk -- so the generate/update skills no longer hand-assemble hashes (a
// correctness risk). Dependency-free; both a library and a CLI:
//
//   node finalize.js --wiki <dir> --input <input.json> [--llms-full]
//
// input.json carries the LLM-produced values that are NOT derivable from disk:
//   { repoRoot, commit, generatedAt, pluginVersion, project, summary,
//     techSummary, substrate, navTree, optionalIds }
// Everything else (hashes, backlinks, file_index, page metadata) is derived
// deterministically from the repo and the page frontmatter.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { parseFrontmatter } = require("./validate.js");

const SCHEMA_VERSION = 1;

function sha256(buf) {
  return "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");
}

function langOf(p) {
  const e = p.split(".").pop().toLowerCase();
  return (
    {
      rs: "rust",
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      mjs: "javascript",
      cjs: "javascript",
      py: "python",
      go: "go",
      java: "java",
      kt: "kotlin",
      cs: "csharp",
      rb: "ruby",
      php: "php",
      styl: "stylus",
      css: "css",
      scss: "scss",
      md: "markdown",
      json: "json",
      toml: "toml",
      yml: "yaml",
      yaml: "yaml",
    }[e] || e
  );
}

function catOf(p) {
  if (/(^|\/)(__tests__|tests?)\//.test(p) || /\.(test|spec)\./.test(p)) return "test";
  if (/\.(styl|css|scss|png|svg|jpe?g|ico|webp|woff2?|ttf|gif|mp3|wav|ogg|m4a|flac|aac|mp4|webm|mov|avi|mkv)$/.test(p)) return "assets";
  if (/^docs\//.test(p) || /\.mdx?$/.test(p)) return "documentation";
  if (/(^|\/)\.github\//.test(p)) return "config";
  if (/\.(toml|ya?ml|json)$|(^|\/)\.env/.test(p)) return "config";
  return "source";
}

function gitAvailable(root) {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd: root, stdio: ["ignore", "pipe", "ignore"], timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

// Build the file_index for an entire repo: git blob OIDs for tracked files
// (free, rebase-proof), sha256 for untracked or when git is unavailable.
function buildFileIndex(root) {
  const index = {};
  const tracked = new Set();
  if (gitAvailable(root)) {
    const out = execSync("git ls-files -s", { cwd: root, maxBuffer: 128 * 1024 * 1024 }).toString();
    for (const line of out.split("\n")) {
      const m = line.match(/^\d+\s+([0-9a-f]+)\s+\d+\t(.+)$/);
      if (!m) continue;
      const [, oid, p] = m;
      tracked.add(p);
      let size = 0;
      try {
        size = fs.statSync(path.join(root, p)).size;
      } catch {}
      index[p] = { hash: oid, size_bytes: size, lang: langOf(p), category: catOf(p) };
    }
    // untracked working-tree files (excluding our own and code-atlas output, which
    // are committed-but-untracked here and must not pollute the source file_index)
    try {
      const unt = execSync("git ls-files --others --exclude-standard", { cwd: root, maxBuffer: 64 * 1024 * 1024 })
        .toString()
        .split("\n")
        .filter(Boolean);
      for (const p of unt) if (!isSkipped(p)) hashUntracked(root, p, index);
    } catch {}
  } else {
    walk(root, root, index);
  }
  return index;
}

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "__pycache__",
  ".next",
  ".nuxt",
  "coverage",
  ".venv",
  "venv",
  ".cache",
  ".turbo",
  ".llm-wiki",
  ".code-atlas",
]);

function isSkipped(rel) {
  const first = rel.split("/")[0];
  return SKIP_DIRS.has(first);
}

function hashUntracked(root, rel, index) {
  const abs = path.join(root, rel);
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return;
    index[rel] = { hash: sha256(fs.readFileSync(abs)), size_bytes: st.size, lang: langOf(rel), category: catOf(rel) };
  } catch {}
}

function walk(root, dir, index) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && SKIP_DIRS.has(e.name)) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, abs, index);
    else if (e.isFile()) hashUntracked(root, path.relative(root, abs).split(path.sep).join("/"), index);
  }
}

// Read every page, returning ordered metadata + raw content.
function readPages(pagesDir) {
  const files = fs
    .readdirSync(pagesDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(pagesDir, f), "utf8");
    const { fm } = parseFrontmatter(raw);
    const id = (fm && fm.id) || f.replace(/\.md$/, "");
    return {
      file: f,
      id,
      title: (fm && fm.title) || id,
      type: (fm && fm.type) || "module",
      summary: (fm && fm.summary) || "",
      tags: fm && Array.isArray(fm.tags) ? fm.tags : [],
      related: fm && Array.isArray(fm.related) ? fm.related : [],
      source_files: fm && Array.isArray(fm.source_files) ? fm.source_files : [],
      status: (fm && fm.status) || "stable",
      content_hash: sha256(Buffer.from(raw, "utf8")),
    };
  });
}

// Inverse of `related`: who links TO each page.
function computeBacklinks(pages) {
  const back = {};
  for (const p of pages) back[p.id] = [];
  for (const p of pages) {
    for (const t of p.related) {
      if (back[t] && !back[t].includes(p.id) && t !== p.id) back[t].push(p.id);
    }
  }
  return back;
}

function finalize(wikiDir, opts = {}) {
  const pagesDir = path.join(wikiDir, "pages");
  const repoRoot = opts.repoRoot || path.dirname(wikiDir);
  const commit = opts.commit || "";
  const generatedAt = opts.generatedAt || "1970-01-01T00:00:00Z";
  const pluginVersion = opts.pluginVersion || "0.1.0";
  const project = opts.project || "Project";
  const summary = opts.summary || "";
  const techSummary = opts.techSummary || "";
  const substrate = opts.substrate || "scan";
  const optionalIds = Array.isArray(opts.optionalIds) ? opts.optionalIds : [];
  const write = opts.write !== false;

  const fileIndex = buildFileIndex(repoRoot);
  const pages = readPages(pagesDir);
  const backlinks = computeBacklinks(pages);
  const byId = {};
  for (const p of pages) byId[p.id] = p;

  // nav_tree: use provided grouping, else fall back to grouping by type.
  let navTree = Array.isArray(opts.navTree) && opts.navTree.length ? opts.navTree : null;
  if (!navTree) {
    const groups = {};
    for (const p of pages) (groups[p.type] = groups[p.type] || []).push(p.id);
    navTree = Object.entries(groups).map(([group, page_ids]) => ({ group, page_ids }));
  }

  const missingSources = [];
  const pagesMap = {};
  for (const p of pages) {
    const sourceHashes = {};
    for (const s of p.source_files) {
      if (fileIndex[s]) sourceHashes[s] = fileIndex[s].hash;
      else missingSources.push({ page: p.id, source: s });
    }
    pagesMap["pages/" + p.file] = {
      page_id: p.id,
      title: p.title,
      type: p.type,
      summary: p.summary,
      tags: p.tags,
      source_files: p.source_files,
      source_hashes: sourceHashes,
      content_hash: p.content_hash,
      cross_links: p.related,
      backlinks: backlinks[p.id] || [],
      status: p.status,
      generated_from_commit: commit,
      generated_at: generatedAt,
    };
  }

  const state = {
    _header: { schema_version: SCHEMA_VERSION, plugin_version: pluginVersion, generated_at: generatedAt, baseline_commit: commit, scan_root: opts.scanRoot || "." },
    substrate_source: substrate,
    file_index: fileIndex,
    pages: pagesMap,
    nav_tree: navTree,
    broken_links: [],
    last_run: {
      strategy: opts.strategy || "full",
      duration_seconds: opts.durationSeconds || 0,
      agents_used: opts.agentsUsed || 0,
      pages_written: pages.length,
      files_scanned: Object.keys(fileIndex).length,
    },
  };

  // llms.txt
  const optional = new Set(optionalIds);
  let llms = `# ${project}\n\n> ${summary}\n\n`;
  if (techSummary) llms += `Tech stack: ${techSummary}\n\n`;
  for (const grp of navTree) {
    const ids = grp.page_ids.filter((id) => byId[id] && !optional.has(id));
    if (!ids.length) continue;
    llms += `## ${grp.group}\n\n`;
    for (const id of ids) llms += `- [${byId[id].title}](pages/${id}.md): ${byId[id].summary}\n`;
    llms += "\n";
  }
  const optIds = [...optional].filter((id) => byId[id]);
  if (optIds.length) {
    llms += `## Optional\n\n`;
    for (const id of optIds) llms += `- [${byId[id].title}](pages/${id}.md): ${byId[id].summary}\n`;
    llms += "\n";
  }

  let llmsFull = null;
  if (opts.emitLlmsFull) {
    llmsFull = llms + "\n---\n\n";
    for (const p of pages) {
      llmsFull += `# ${p.title}\n\n` + fs.readFileSync(path.join(pagesDir, p.file), "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") + "\n\n";
    }
  }

  if (write) {
    fs.writeFileSync(path.join(wikiDir, "state.json"), JSON.stringify(state, null, 2));
    fs.writeFileSync(path.join(wikiDir, "llms.txt"), llms);
    if (llmsFull !== null) fs.writeFileSync(path.join(wikiDir, "llms-full.txt"), llmsFull);
  }

  return {
    state,
    llms,
    llmsFull,
    stats: {
      pages: pages.length,
      files_indexed: Object.keys(fileIndex).length,
      missing_sources: missingSources,
      backlinks_total: Object.values(backlinks).reduce((n, a) => n + a.length, 0),
    },
  };
}

function parseArgs(argv) {
  const out = { _: [] };
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--llms-full") out.emitLlmsFull = true;
    else if (a[i].startsWith("--")) out[a[i].slice(2)] = a[++i];
    else out._.push(a[i]);
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  const wikiDir = path.resolve(args.wiki || args._[0] || ".llm-wiki");
  let opts = { emitLlmsFull: !!args.emitLlmsFull };
  if (args.input) {
    try {
      opts = Object.assign(JSON.parse(fs.readFileSync(args.input, "utf8")), opts);
    } catch (e) {
      console.error(`finalize: cannot read --input ${args.input}: ${e.message}`);
      return 1;
    }
  }
  if (!fs.existsSync(path.join(wikiDir, "pages"))) {
    console.error(`finalize: no pages/ under ${wikiDir}`);
    return 1;
  }
  const res = finalize(wikiDir, opts);
  console.log(`llm-wiki finalize: ${wikiDir}`);
  console.log(
    `  pages=${res.stats.pages} files_indexed=${res.stats.files_indexed} backlinks=${res.stats.backlinks_total} ` +
      `missing_sources=${res.stats.missing_sources.length}`,
  );
  for (const m of res.stats.missing_sources) console.log(`  WARN missing source ${m.source} (page ${m.page})`);
  console.log(`  wrote state.json, llms.txt${res.llmsFull !== null ? ", llms-full.txt" : ""}`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  SCHEMA_VERSION,
  sha256,
  langOf,
  catOf,
  isSkipped,
  buildFileIndex,
  readPages,
  computeBacklinks,
  finalize,
  main,
};
