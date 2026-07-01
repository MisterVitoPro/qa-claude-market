// Contract tests for the llm-wiki coverage reporter (scripts/coverage.js).
// Dependency-free; run with:
//   node --test plugins/llm-wiki/tests/*.test.js
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { dirname, analyzeCoverage, formatReport } = require("../scripts/coverage.js");

// A synthetic state: module "alpha" (3 files, one referenced) is covered;
// module "beta" (4 files, none referenced) is undocumented; module "tiny"
// (1 file, none referenced) is below the significance threshold.
function state() {
  const src = (p) => [p, { hash: "h", size_bytes: 1, lang: "js", category: "source" }];
  return {
    file_index: Object.fromEntries([
      src("src/alpha/a.js"),
      src("src/alpha/b.js"),
      src("src/alpha/c.js"),
      src("src/beta/a.js"),
      src("src/beta/b.js"),
      src("src/beta/c.js"),
      src("src/beta/d.js"),
      src("src/tiny/a.js"),
      // a non-source file should be ignored entirely
      ["docs/readme.md", { hash: "h", size_bytes: 1, lang: "markdown", category: "documentation" }],
    ]),
    pages: {
      "pages/alpha.md": { page_id: "alpha", source_files: ["src/alpha/a.js"] },
    },
  };
}

describe("dirname", () => {
  it("returns the parent directory or '.'", () => {
    assert.equal(dirname("src/a/b.js"), "src/a");
    assert.equal(dirname("top.js"), ".");
  });
});

describe("analyzeCoverage", () => {
  it("flags significant undocumented modules and ignores covered/small ones", () => {
    const rep = analyzeCoverage(state(), { min: 3 });
    const undocDirs = rep.undocumented.map((u) => u.dir);
    assert.ok(undocDirs.includes("src/beta"), "beta is undocumented and significant");
    assert.ok(!undocDirs.includes("src/alpha"), "alpha has a referenced file -> covered");
    assert.ok(!undocDirs.includes("src/tiny"), "tiny is below the min-files threshold");
    assert.equal(rep.undocumented.find((u) => u.dir === "src/beta").files, 4);
  });

  it("computes coverage_pct over significant dirs only", () => {
    // significant dirs (>=3 files): alpha (covered) and beta (not) => 1/2 = 50%
    const rep = analyzeCoverage(state(), { min: 3 });
    assert.equal(rep.significant_dirs, 2);
    assert.equal(rep.significant_covered, 1);
    assert.equal(rep.coverage_pct, 50);
  });

  it("ignores non-source files", () => {
    const rep = analyzeCoverage(state(), { min: 1 });
    assert.ok(!rep.undocumented.some((u) => u.dir === "docs"), "docs is documentation, not source");
  });

  it("min threshold changes what counts as significant", () => {
    const rep = analyzeCoverage(state(), { min: 1 });
    // now tiny (1 file, unreferenced) becomes significant + undocumented
    assert.ok(rep.undocumented.some((u) => u.dir === "src/tiny"));
  });

  it("reports 100% when there are no significant dirs", () => {
    const rep = analyzeCoverage({ file_index: {}, pages: {} }, { min: 3 });
    assert.equal(rep.coverage_pct, 100);
    assert.deepEqual(rep.undocumented, []);
  });
});

describe("formatReport", () => {
  it("renders a human summary line with undocumented entries", () => {
    const out = formatReport(analyzeCoverage(state(), { min: 3 }));
    assert.match(out, /1\/2 significant source modules documented \(50%\)/);
    assert.match(out, /undocumented: src\/beta \(4 source files\)/);
  });
  it("handles a null report", () => {
    assert.match(formatReport(null), /no state\.json/);
  });
});
