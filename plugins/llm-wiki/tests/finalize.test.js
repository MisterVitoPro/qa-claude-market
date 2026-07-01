// Contract tests for the llm-wiki finalize step (scripts/finalize.js).
// Dependency-free; run with:
//   node --test plugins/llm-wiki/tests/*.test.js
"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { sha256, langOf, catOf, isSkipped, computeBacklinks, finalize } = require("../scripts/finalize.js");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-fin-"));
}

function page(fm, body) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) lines.push(`${k}: [${v.join(", ")}]`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---", "", body || "# Title", "");
  return lines.join("\n");
}

// Build a non-git wiki (forces sha256 hashing path) and return { root, wiki }.
function writeWiki(root) {
  const wiki = path.join(root, ".llm-wiki");
  const pages = path.join(wiki, "pages");
  fs.mkdirSync(pages, { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "module.exports = 1;\n");
  fs.writeFileSync(path.join(root, "src", "b.js"), "module.exports = 2;\n");

  fs.writeFileSync(
    path.join(pages, "home.md"),
    page(
      { id: "home", title: "Home", type: "overview", summary: "Hub.", tags: "[overview]", related: "[alpha, beta]", source_files: "[src/a.js]", status: "stable" },
      "# Home\n",
    ),
  );
  fs.writeFileSync(
    path.join(pages, "alpha.md"),
    page(
      { id: "alpha", title: "Alpha", type: "module", summary: "A.", tags: "[backend]", related: "[home]", source_files: "[src/a.js, src/b.js]", status: "stable" },
      "# Alpha\n",
    ),
  );
  fs.writeFileSync(
    path.join(pages, "beta.md"),
    page(
      { id: "beta", title: "Beta", type: "module", summary: "B.", tags: "[frontend]", related: "[home, alpha]", source_files: "[src/missing.js]", status: "stable" },
      "# Beta\n",
    ),
  );
  return { root, wiki };
}

describe("helpers", () => {
  it("sha256 returns a prefixed hex digest", () => {
    assert.match(sha256(Buffer.from("x")), /^sha256:[0-9a-f]{64}$/);
  });
  it("langOf and catOf classify by extension/path", () => {
    assert.equal(langOf("a/b.rs"), "rust");
    assert.equal(catOf("src/x.js"), "source");
    assert.equal(catOf("src/x.test.js"), "test");
    assert.equal(catOf("docs/y.md"), "documentation");
    // media files are assets, not source (else they pollute coverage)
    assert.equal(catOf("public/audio/sfx/vote.mp3"), "assets");
    assert.equal(catOf("public/video/intro.mp4"), "assets");
    assert.equal(catOf("public/img/logo.png"), "assets");
  });
  it("isSkipped excludes the wiki's own and code-atlas output dirs", () => {
    assert.equal(isSkipped(".llm-wiki/pages/home.md"), true);
    assert.equal(isSkipped(".code-atlas/atlas.json"), true);
    assert.equal(isSkipped("node_modules/x/index.js"), true);
    assert.equal(isSkipped("src/a.js"), false);
  });
  it("computeBacklinks inverts related links", () => {
    const back = computeBacklinks([
      { id: "home", related: ["alpha", "beta"] },
      { id: "alpha", related: ["home"] },
      { id: "beta", related: ["home", "alpha"] },
    ]);
    assert.deepEqual(back.home.sort(), ["alpha", "beta"]);
    assert.deepEqual(back.alpha.sort(), ["beta", "home"]);
    assert.deepEqual(back.beta, ["home"]);
  });
});

describe("finalize", () => {
  let root, wiki;
  before(() => {
    root = mkTmp();
    ({ wiki } = writeWiki(root));
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  it("writes a valid state.json with hashes, backlinks, and provenance", () => {
    const res = finalize(wiki, {
      repoRoot: root,
      commit: "abc1234",
      generatedAt: "2026-06-27T00:00:00Z",
      pluginVersion: "0.1.0",
      project: "Test",
      summary: "A test project.",
      techSummary: "Node",
      substrate: "scan",
      navTree: [
        { group: "Overview", page_ids: ["home"] },
        { group: "Modules", page_ids: ["alpha", "beta"] },
      ],
      optionalIds: [],
    });
    const state = JSON.parse(fs.readFileSync(path.join(wiki, "state.json"), "utf8"));
    assert.equal(state._header.schema_version, 1);
    assert.equal(state._header.baseline_commit, "abc1234");
    assert.equal(Object.keys(state.pages).length, 3);

    const alpha = state.pages["pages/alpha.md"];
    assert.deepEqual(alpha.source_files, ["src/a.js", "src/b.js"]);
    assert.ok(alpha.source_hashes["src/a.js"], "source hash present");
    assert.match(alpha.content_hash, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(alpha.backlinks.sort(), ["beta", "home"]);

    // file_index covers the real sources
    assert.ok(state.file_index["src/a.js"]);
    assert.equal(state.file_index["src/a.js"].category, "source");
    // ...and does not pollute itself with the wiki's own pages
    assert.ok(!Object.keys(state.file_index).some((k) => k.startsWith(".llm-wiki/")), "file_index must not include wiki pages");

    // missing source surfaced, not fatal
    assert.equal(res.stats.missing_sources.length, 1);
    assert.equal(res.stats.missing_sources[0].source, "src/missing.js");
  });

  it("writes a spec-shaped llms.txt with H1, blockquote, and grouped links", () => {
    finalize(wiki, {
      repoRoot: root,
      commit: "abc1234",
      generatedAt: "2026-06-27T00:00:00Z",
      project: "Test",
      summary: "A test project.",
      navTree: [{ group: "Overview", page_ids: ["home"] }, { group: "Modules", page_ids: ["alpha", "beta"] }],
      optionalIds: ["beta"],
    });
    const llms = fs.readFileSync(path.join(wiki, "llms.txt"), "utf8");
    assert.match(llms, /^# Test\n/);
    assert.match(llms, /\n> A test project\./);
    assert.match(llms, /## Overview\n\n- \[Home\]\(pages\/home\.md\): Hub\./);
    // beta is optional -> appears under Optional, not Modules
    assert.match(llms, /## Optional\n\n- \[Beta\]\(pages\/beta\.md\)/);
  });

  it("falls back to grouping by type when no navTree is given", () => {
    const res = finalize(wiki, { repoRoot: root, commit: "x", generatedAt: "t", project: "T", summary: "s", write: false });
    const groups = res.state.nav_tree.map((g) => g.group).sort();
    assert.ok(groups.includes("overview"));
    assert.ok(groups.includes("module"));
  });

  it("emits llms-full.txt when requested, with page bodies inlined", () => {
    const res = finalize(wiki, { repoRoot: root, commit: "x", generatedAt: "t", project: "T", summary: "s", emitLlmsFull: true });
    assert.ok(res.llmsFull && res.llmsFull.includes("# Alpha"));
    assert.ok(fs.existsSync(path.join(wiki, "llms-full.txt")));
  });
});
