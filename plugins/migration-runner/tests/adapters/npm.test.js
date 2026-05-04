const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;

let CWD;
before(() => {
  CWD = fs.mkdtempSync(path.join(os.tmpdir(), "npm-adapter-"));
  fs.writeFileSync(
    path.join(CWD, "package.json"),
    JSON.stringify({
      name: "test",
      dependencies: { axios: "^1.6.7" },
      scripts: { build: "tsc", test: "jest" },
    })
  );
});
after(() => {
  global.fetch = ORIG_FETCH;
  fs.rmSync(CWD, { recursive: true, force: true });
});

test("detect: returns manifest_path when package.json exists", () => {
  const { detect } = require("../../scripts/adapters/npm.js");
  assert.equal(detect(CWD).manifest_path, "package.json");
});

test("detect: returns null with no package.json", () => {
  const { detect } = require("../../scripts/adapters/npm.js");
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "npm-empty-"));
  assert.equal(detect(empty), null);
  fs.rmSync(empty, { recursive: true, force: true });
});

test("listOutdated: parses npm outdated --json output", () => {
  const npm = require("../../scripts/adapters/npm.js");
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/npm/sample-outdated.json"), "utf8"));
  const out = npm._parseOutdated(fixture);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: "axios", current: "1.6.7", latest_known: "1.7.4" });
  assert.deepEqual(out[1], { name: "lodash", current: "4.17.20", latest_known: "4.17.21" });
});

test("listAvailableVersions: queries npm registry and returns version+release-date", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/npm/sample-versions-axios.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /registry\.npmjs\.org\/axios/);
    return { ok: true, json: async () => fixture };
  };
  const npm = require("../../scripts/adapters/npm.js");
  const versions = await npm.listAvailableVersions("axios");
  assert.equal(versions.length, 5);
  assert.equal(versions[0].version, "1.6.7");
  assert.equal(versions[0].released_at, "2024-02-01T00:00:00.000Z");
});

test("verifyCommands: returns build+test, plus typecheck if tsconfig.json exists", () => {
  const npm = require("../../scripts/adapters/npm.js");
  fs.writeFileSync(path.join(CWD, "tsconfig.json"), "{}");
  const cmds = npm.verifyCommands(CWD);
  assert.equal(cmds.build, "npm run build");
  assert.equal(cmds.test, "npm test");
  assert.equal(cmds.typecheck, "npx tsc --noEmit");
});
