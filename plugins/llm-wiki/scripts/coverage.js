#!/usr/bin/env node
// llm-wiki coverage reporter.
//
// Reads .llm-wiki/state.json (file_index + pages.source_files) and reports which
// significant SOURCE directories have no owning wiki page -- so generation never
// silently drops modules (the "no silent caps" principle). Advisory, not a gate:
// it always exits 0. Dependency-free; both a library and a CLI:
//
//   node coverage.js --wiki <dir> [--min 3] [--json]
//
// A directory is "covered" when at least one source file directly in it is listed
// in some page's source_files. "Significant" = it holds >= min source files.
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_MIN = 3;

function dirname(p) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i);
}

// state: parsed state.json. Returns a coverage report object.
function analyzeCoverage(state, opts = {}) {
  const min = opts.min || DEFAULT_MIN;
  const fileIndex = (state && state.file_index) || {};
  const pages = (state && state.pages) || {};

  // every source file referenced by some page
  const covered = new Set();
  for (const pv of Object.values(pages)) {
    for (const sf of pv.source_files || []) covered.add(sf);
  }

  // group source files by their immediate directory
  const dirCount = {};
  const dirCovered = {};
  for (const [p, meta] of Object.entries(fileIndex)) {
    if (!meta || meta.category !== "source") continue;
    const d = dirname(p);
    dirCount[d] = (dirCount[d] || 0) + 1;
    if (!(d in dirCovered)) dirCovered[d] = false;
    if (covered.has(p)) dirCovered[d] = true;
  }

  const allDirs = Object.keys(dirCount);
  const coveredDirs = allDirs.filter((d) => dirCovered[d]);
  const undocumented = allDirs
    .filter((d) => !dirCovered[d] && dirCount[d] >= min)
    .map((d) => ({ dir: d, files: dirCount[d] }))
    .sort((a, b) => b.files - a.files);

  const significant = allDirs.filter((d) => dirCount[d] >= min);
  const significantCovered = significant.filter((d) => dirCovered[d]);
  const coveragePct = significant.length === 0 ? 100 : Math.round((significantCovered.length / significant.length) * 100);

  return {
    total_source_dirs: allDirs.length,
    covered_source_dirs: coveredDirs.length,
    significant_dirs: significant.length,
    significant_covered: significantCovered.length,
    coverage_pct: coveragePct,
    min,
    undocumented,
  };
}

function analyzeWiki(wikiDir, opts = {}) {
  const statePath = path.join(wikiDir, "state.json");
  if (!fs.existsSync(statePath)) return null;
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
  return analyzeCoverage(state, opts);
}

function formatReport(rep) {
  if (!rep) return "coverage: no state.json found (run /llm-wiki:generate first)";
  const lines = [];
  lines.push(
    `coverage: ${rep.significant_covered}/${rep.significant_dirs} significant source modules documented (${rep.coverage_pct}%); ` +
      `${rep.undocumented.length} undocumented (>= ${rep.min} files each)`,
  );
  for (const u of rep.undocumented.slice(0, 20)) lines.push(`  undocumented: ${u.dir} (${u.files} source files)`);
  if (rep.undocumented.length > 20) lines.push(`  ... and ${rep.undocumented.length - 20} more`);
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = {};
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--json") out.json = true;
    else if (a[i] === "--min") out.min = Number(a[++i]);
    else if (a[i] === "--wiki") out.wiki = a[++i];
    else if (!a[i].startsWith("--") && !out.wiki) out.wiki = a[i];
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  const wikiDir = path.resolve(args.wiki || ".llm-wiki");
  const rep = analyzeWiki(wikiDir, { min: args.min });
  if (args.json) {
    process.stdout.write(JSON.stringify(rep, null, 2) + "\n");
    return 0;
  }
  console.log(formatReport(rep));
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { DEFAULT_MIN, dirname, analyzeCoverage, analyzeWiki, formatReport, main };
