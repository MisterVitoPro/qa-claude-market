// Contract tests for the llm-wiki citation normalizer (scripts/normalize-citations.js).
// Dependency-free; run with:
//   node --test plugins/llm-wiki/tests/*.test.js
"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { stripLeadingDots, resolveCitation, normalizeBody, normalizeWiki } = require("../scripts/normalize-citations.js");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-norm-"));
}

// A repo with deep files so abbreviated suffixes resolve uniquely; "mod.rs"
// appears twice (ambiguous) to test the safety guard.
function writeRepo(root) {
  const mk = (rel, body) => {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body || "x\n".repeat(300));
  };
  mk("api-rs/crates/core/src/downtime/types.rs");
  mk("api-rs/crates/core/src/monster/encounter/mod.rs");
  mk("api-rs/crates/lambda/src/routes/loot.rs");
  mk("api-rs/crates/core/src/loot/mod.rs"); // makes bare "mod.rs" ambiguous with encounter/mod.rs
  // two files sharing the 2-segment suffix "data/models.rs" -> ambiguous with a slash
  mk("api-rs/crates/core/src/faction/data/models.rs");
  mk("api-rs/crates/core/src/rumor/data/models.rs");
  return root;
}

describe("stripLeadingDots", () => {
  it("removes leading ellipsis/relative runs", () => {
    assert.equal(stripLeadingDots(".../loot.rs"), "loot.rs");
    assert.equal(stripLeadingDots("../a/b.rs"), "a/b.rs");
    assert.equal(stripLeadingDots("a/b.rs"), "a/b.rs");
  });
});

describe("resolveCitation", () => {
  let root;
  before(() => {
    root = mkTmp();
    writeRepo(root);
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = () => require("../scripts/normalize-citations.js").repoFiles(root);

  it("expands a clean abbreviated suffix to the unique full path", () => {
    assert.equal(resolveCitation("downtime/types.rs", root, files()), "api-rs/crates/core/src/downtime/types.rs");
    assert.equal(resolveCitation("encounter/mod.rs", root, files()), "api-rs/crates/core/src/monster/encounter/mod.rs");
  });
  it("strips a leading ellipsis then resolves", () => {
    assert.equal(resolveCitation(".../loot.rs", root, files()), "api-rs/crates/lambda/src/routes/loot.rs");
  });
  it("returns null for an already-valid full path (no change)", () => {
    assert.equal(resolveCitation("api-rs/crates/core/src/downtime/types.rs", root, files()), null);
  });
  it("returns null for an ambiguous suffix (multiple matches)", () => {
    // bare "mod.rs" matches both encounter/mod.rs and loot/mod.rs -> ambiguous -> leave it
    assert.equal(resolveCitation("mod.rs", root, files()), null);
  });
});

describe("normalizeBody", () => {
  let root, files;
  before(() => {
    root = mkTmp();
    writeRepo(root);
    files = require("../scripts/normalize-citations.js").repoFiles(root);
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  it("expands abbreviated citations, keeps good ones, reports unresolved", () => {
    const body =
      "good `api-rs/crates/core/src/downtime/types.rs:9-78`, " +
      "abbrev `downtime/types.rs:9`, " +
      "ellipsis `.../loot.rs:21-25`, " +
      "ambiguous `data/models.rs:3`, " +
      "prose crate::module and http://h:80/x";
    const { text, expanded, unresolved } = normalizeBody(body, root, files);
    assert.equal(expanded, 2, "two abbreviated citations expanded");
    assert.match(text, /`api-rs\/crates\/core\/src\/downtime\/types\.rs:9`/);
    assert.match(text, /`api-rs\/crates\/lambda\/src\/routes\/loot\.rs:21-25`/);
    // the already-good citation is unchanged and not double-counted
    assert.ok(text.includes("`api-rs/crates/core/src/downtime/types.rs:9-78`"));
    // ambiguous one is left as-is and reported
    assert.ok(unresolved.some((u) => /data\/models\.rs:3/.test(u)), unresolved.join("; "));
    assert.ok(text.includes("`data/models.rs:3`"));
  });

  it("is idempotent (a second pass changes nothing)", () => {
    const body = "abbrev `downtime/types.rs:9`";
    const once = normalizeBody(body, root, files).text;
    const twice = normalizeBody(once, root, files);
    assert.equal(twice.expanded, 0);
    assert.equal(twice.text, once);
  });
});

describe("normalizeWiki", () => {
  it("rewrites pages on disk and returns a summary", () => {
    const root = mkTmp();
    writeRepo(root);
    const pages = path.join(root, ".llm-wiki", "pages");
    fs.mkdirSync(pages, { recursive: true });
    fs.writeFileSync(path.join(pages, "a.md"), "see `downtime/types.rs:9` and `encounter/mod.rs:21`");
    fs.writeFileSync(path.join(pages, "b.md"), "no citations here");
    const res = normalizeWiki(path.join(root, ".llm-wiki"));
    assert.equal(res.expanded, 2);
    assert.equal(res.pages_changed, 1);
    const a = fs.readFileSync(path.join(pages, "a.md"), "utf8");
    assert.match(a, /api-rs\/crates\/core\/src\/downtime\/types\.rs:9/);
    assert.match(a, /api-rs\/crates\/core\/src\/monster\/encounter\/mod\.rs:21/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
