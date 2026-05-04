const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "rust-adapter-")); });
after(() => { global.fetch = ORIG_FETCH; fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: returns manifest_path when Cargo.toml exists", () => {
  const rust = require("../../scripts/adapters/rust.js");
  assert.equal(rust.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "Cargo.toml"), "[package]\nname='x'\nversion='0.1'\n");
  assert.equal(rust.detect(CWD).manifest_path, "Cargo.toml");
});

test("listOutdated parser: handles cargo outdated --format json", () => {
  const rust = require("../../scripts/adapters/rust.js");
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/rust/sample-outdated.json"), "utf8"));
  const out = rust._parseOutdated(fixture);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { name: "serde", current: "1.0.180", latest_known: "1.0.210" });
});

test("listAvailableVersions: queries crates.io and excludes yanked", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/rust/sample-versions-serde.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /crates\.io\/api\/v1\/crates\/serde/);
    return { ok: true, json: async () => fixture };
  };
  const rust = require("../../scripts/adapters/rust.js");
  const versions = await rust.listAvailableVersions("serde");
  assert.equal(versions.length, 3); // yanked excluded
  assert.ok(!versions.some((v) => v.version === "1.0.211"));
});

test("verifyCommands: build, check, test", () => {
  const rust = require("../../scripts/adapters/rust.js");
  const cmds = rust.verifyCommands(CWD);
  assert.equal(cmds.build, "cargo build");
  assert.equal(cmds.typecheck, "cargo check");
  assert.equal(cmds.test, "cargo test");
});
