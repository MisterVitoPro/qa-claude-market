// Contract tests for the llm-wiki validator (scripts/validate.js).
// Dependency-free; run with:
//   node --test plugins/llm-wiki/tests/*.test.js
"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseFrontmatter,
  lintMermaid,
  extractCitations,
  extractPageLinks,
  validateWiki,
} = require("../scripts/validate.js");

// ---- helpers ---------------------------------------------------------------

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-test-"));
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

// Build a minimal but VALID wiki under <root>/.llm-wiki and return the wiki dir.
function writeValidWiki(root) {
  const wiki = path.join(root, ".llm-wiki");
  const pages = path.join(wiki, "pages");
  fs.mkdirSync(pages, { recursive: true });
  // a real source file so state.json provenance resolves
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.js"), "module.exports = 1;\n");

  fs.writeFileSync(
    path.join(pages, "home.md"),
    page(
      { id: "home", title: "Home", type: "overview", summary: "Hub.", tags: "[overview]", related: "[alpha]", source_files: "[src/a.js]", status: "stable" },
      "# Home\n\nSee [Alpha](alpha.md).\n",
    ),
  );
  fs.writeFileSync(
    path.join(pages, "alpha.md"),
    page(
      { id: "alpha", title: "Alpha", type: "module", summary: "A module.", tags: "[backend]", related: "[home]", source_files: "[src/a.js]", status: "stable" },
      "# Alpha\n\nBack to [Home](home.md).\n\n```mermaid\nflowchart TD\n  a[A] --> b[B]\n```\n",
    ),
  );

  const indexFm = [
    "---",
    "llm_wiki_index: true",
    "schema_version: 1",
    'plugin_version: "0.1.0"',
    'generated_at: "2026-06-27T00:00:00Z"',
    "baseline_commit: abc1234",
    "generated_from: scan",
    "page_count: 2",
    "broken_link_count: 0",
    "---",
    "",
    "# Test Wiki",
    "",
    "> A test.",
    "",
    "## Overview",
    "- [Home](pages/home.md) -- hub",
    "- [Alpha](pages/alpha.md) -- a module",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(wiki, "index.md"), indexFm);

  const state = {
    _header: { schema_version: 1, plugin_version: "0.1.0", generated_at: "2026-06-27T00:00:00Z", baseline_commit: "abc1234", scan_root: "." },
    substrate_source: "scan",
    file_index: { "src/a.js": { hash: "deadbeef", size_bytes: 18, lang: "javascript", category: "source" } },
    pages: {
      "pages/home.md": { page_id: "home", source_files: ["src/a.js"], source_hashes: { "src/a.js": "deadbeef" }, content_hash: "sha256:abc", status: "stable" },
      "pages/alpha.md": { page_id: "alpha", source_files: ["src/a.js"], source_hashes: { "src/a.js": "deadbeef" }, content_hash: "sha256:def", status: "stable" },
    },
    nav_tree: [{ group: "Overview", page_ids: ["home", "alpha"] }],
    broken_links: [],
    last_run: { strategy: "full", duration_seconds: 0, agents_used: 4, pages_written: 2, files_scanned: 1 },
  };
  fs.writeFileSync(path.join(wiki, "state.json"), JSON.stringify(state, null, 2));
  fs.writeFileSync(path.join(wiki, "llms.txt"), "# Test Wiki\n\n> A test.\n\n## Overview\n\n- [Home](pages/home.md): hub\n");
  return wiki;
}

// ---- unit tests ------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses scalars, folded blocks, and inline arrays", () => {
    const { fm, body } = parseFrontmatter("---\nid: x\nsummary: >\n  one two\ntags: [a, b]\n---\n# Body\n");
    assert.equal(fm.id, "x");
    assert.equal(fm.summary, "one two");
    assert.deepEqual(fm.tags, ["a", "b"]);
    assert.match(body, /# Body/);
  });
  it("returns null fm when no frontmatter", () => {
    assert.equal(parseFrontmatter("# no frontmatter\n").fm, null);
  });
});

describe("extractPageLinks", () => {
  it("finds slug.md and pages/slug.md links and strips anchors", () => {
    const links = extractPageLinks("see [a](alpha.md) and [b](pages/beta.md#sec) and [ext](https://x.md)");
    assert.deepEqual(links.sort(), ["alpha", "beta"]);
  });
});

describe("extractCitations", () => {
  it("extracts backticked path:line and path:start-end citations", () => {
    const cites = extractCitations("see `src/auth/jwt.rs:42` and `web/src/App.js:10-25` for details");
    assert.equal(cites.length, 2);
    assert.deepEqual(cites[0], { raw: "src/auth/jwt.rs:42", path: "src/auth/jwt.rs", start: 42, end: null });
    assert.deepEqual(cites[1], { raw: "web/src/App.js:10-25", path: "web/src/App.js", start: 10, end: 25 });
  });
  it("ignores prose colons, bare filenames, rust paths, and URLs", () => {
    const cites = extractCitations("crate::module, `App.js:5`, http://host:443/x, see line 12: foo, arxiv 1706.03762");
    assert.deepEqual(cites, [], JSON.stringify(cites));
  });
});

describe("lintMermaid", () => {
  it("passes a well-formed block", () => {
    assert.deepEqual(lintMermaid("```mermaid\nflowchart TD\n  a[A] --> b[B]\n```"), []);
  });
  it("flags unbalanced brackets", () => {
    const issues = lintMermaid("```mermaid\nflowchart TD\n  a[A --> b[B]\n```");
    assert.ok(issues.some((i) => /unbalanced/.test(i)));
  });
  it("flags an unknown diagram type", () => {
    const issues = lintMermaid("```mermaid\nbogusDiagram\n  a --> b\n```");
    assert.ok(issues.some((i) => /unknown diagram type/.test(i)));
  });
  it("flags an unclosed fence", () => {
    const issues = lintMermaid("```mermaid\nflowchart TD\n  a --> b\n");
    assert.ok(issues.some((i) => /unclosed/.test(i)));
  });
  it("passes a balanced subgraph/end flowchart", () => {
    const src = "```mermaid\nflowchart TD\n  subgraph A [Group A]\n    a[A] --> b[B]\n  end\n  b --> c[C]\n```";
    assert.deepEqual(lintMermaid(src), []);
  });
  it("flags an unclosed subgraph (missing end)", () => {
    const src = "```mermaid\nflowchart TD\n  subgraph A\n    a --> b\n```";
    const issues = lintMermaid(src);
    assert.ok(issues.some((i) => /unclosed subgraph/.test(i)), issues.join("; "));
  });
  it("flags a stray end with no subgraph", () => {
    const src = "```mermaid\nflowchart TD\n  a --> b\n  end\n```";
    const issues = lintMermaid(src);
    assert.ok(issues.some((i) => /stray 'end'/.test(i)), issues.join("; "));
  });
  it("flags a header-only flowchart with no nodes or edges", () => {
    const issues = lintMermaid("```mermaid\nflowchart TD\n```");
    assert.ok(issues.some((i) => /no nodes or edges/.test(i)), issues.join("; "));
  });
  it("does not apply subgraph checks to sequence diagrams", () => {
    // 'end' appears legitimately in sequenceDiagram alt/loop blocks; must not be flagged
    const src = "```mermaid\nsequenceDiagram\n  A->>B: hi\n  alt ok\n    B-->>A: yes\n  end\n```";
    assert.deepEqual(lintMermaid(src), []);
  });
});

// ---- integration tests -----------------------------------------------------

describe("validateWiki", () => {
  let root;
  before(() => {
    root = mkTmp();
    writeValidWiki(root);
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  it("passes a well-formed wiki with zero errors", () => {
    const res = validateWiki(path.join(root, ".llm-wiki"));
    assert.deepEqual(res.errors, [], "expected no errors: " + res.errors.join("; "));
    assert.equal(res.stats.pages, 2);
    assert.equal(res.stats.mermaid_diagrams, 1);
    assert.equal(res.stats.dangling_cross_links, 0);
  });

  it("errors when a cross-link dangles", () => {
    const tmp = mkTmp();
    writeValidWiki(tmp);
    const p = path.join(tmp, ".llm-wiki", "pages", "alpha.md");
    fs.writeFileSync(p, fs.readFileSync(p, "utf8") + "\nSee [Ghost](ghost.md).\n");
    const res = validateWiki(path.join(tmp, ".llm-wiki"));
    assert.ok(res.errors.some((e) => /dangling cross-link to "ghost"/.test(e)));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("errors when page_count disagrees with disk", () => {
    const tmp = mkTmp();
    writeValidWiki(tmp);
    const idx = path.join(tmp, ".llm-wiki", "index.md");
    fs.writeFileSync(idx, fs.readFileSync(idx, "utf8").replace("page_count: 2", "page_count: 5"));
    const res = validateWiki(path.join(tmp, ".llm-wiki"));
    assert.ok(res.errors.some((e) => /page_count 5 does not match 2/.test(e)));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("errors on an invalid page type and broken mermaid", () => {
    const tmp = mkTmp();
    writeValidWiki(tmp);
    const p = path.join(tmp, ".llm-wiki", "pages", "alpha.md");
    fs.writeFileSync(
      p,
      page(
        { id: "alpha", title: "Alpha", type: "nonsense", summary: "x", tags: "[a]", related: "[home]", source_files: "[src/a.js]", status: "stable" },
        "# Alpha\n\n```mermaid\nflowchart TD\n  a[A --> b\n```\n",
      ),
    );
    const res = validateWiki(path.join(tmp, ".llm-wiki"));
    assert.ok(res.errors.some((e) => /invalid type "nonsense"/.test(e)));
    assert.ok(res.errors.some((e) => /unbalanced/.test(e)));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("warns on out-of-range and missing-file path:line citations, but not valid ones", () => {
    const tmp = mkTmp();
    writeValidWiki(tmp); // src/a.js has 2 lines
    const p = path.join(tmp, ".llm-wiki", "pages", "alpha.md");
    fs.writeFileSync(
      p,
      fs.readFileSync(p, "utf8") + "\nValid `src/a.js:1`, out of range `src/a.js:99`, missing `src/ghost.js:3`.\n",
    );
    const res = validateWiki(path.join(tmp, ".llm-wiki"));
    assert.deepEqual(res.errors, [], "citations are advisory, never errors");
    assert.ok(res.warnings.some((w) => /citation "src\/a\.js:99" is out of range/.test(w)), res.warnings.join("; "));
    assert.ok(res.warnings.some((w) => /citation "src\/ghost\.js:3" points to a missing file/.test(w)));
    assert.ok(!res.warnings.some((w) => /src\/a\.js:1/.test(w)), "valid citation must not warn");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("warns (not errors) when a state.json source file is missing", () => {
    const tmp = mkTmp();
    writeValidWiki(tmp);
    fs.rmSync(path.join(tmp, "src", "a.js"));
    const res = validateWiki(path.join(tmp, ".llm-wiki"));
    assert.deepEqual(res.errors, [], "missing source should warn, not error");
    assert.ok(res.warnings.some((w) => /missing source file/.test(w)));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("errors when the wiki directory is absent", () => {
    const res = validateWiki(path.join(os.tmpdir(), "definitely-not-a-wiki-" + Date.now()));
    assert.ok(res.errors.length >= 1);
  });
});
