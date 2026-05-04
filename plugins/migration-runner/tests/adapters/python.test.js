const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;

before(() => {
  CWD = fs.mkdtempSync(path.join(os.tmpdir(), "py-adapter-"));
});
after(() => {
  global.fetch = ORIG_FETCH;
  fs.rmSync(CWD, { recursive: true, force: true });
});

test("detect: prefers pyproject.toml, then requirements.txt, else null", () => {
  const py = require("../../scripts/adapters/python.js");
  assert.equal(py.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "requirements.txt"), "requests==2.28.0\n");
  assert.equal(py.detect(CWD).manifest_path, "requirements.txt");
  fs.writeFileSync(path.join(CWD, "pyproject.toml"), "[project]\nname='x'\n");
  assert.equal(py.detect(CWD).manifest_path, "pyproject.toml");
});

test("listOutdated parser: handles pip list --outdated --format=json", () => {
  const py = require("../../scripts/adapters/python.js");
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/python/sample-outdated.json"), "utf8"));
  const out = py._parseOutdated(fixture);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: "requests", current: "2.28.0", latest_known: "2.32.3" });
});

test("listAvailableVersions: queries PyPI JSON and returns version+release-date", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/python/sample-versions-requests.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /pypi\.org\/pypi\/requests\/json/);
    return { ok: true, json: async () => fixture };
  };
  const py = require("../../scripts/adapters/python.js");
  const versions = await py.listAvailableVersions("requests");
  assert.equal(versions.length, 4);
  assert.equal(versions.find((v) => v.version === "2.32.3").released_at, "2024-05-29T00:00:00.000Z");
});

test("verifyCommands: returns pytest if pytest installed, mypy if mypy.ini present", () => {
  const py = require("../../scripts/adapters/python.js");
  fs.writeFileSync(path.join(CWD, "mypy.ini"), "[mypy]\n");
  const cmds = py.verifyCommands(CWD);
  assert.equal(cmds.typecheck, "mypy .");
  assert.equal(cmds.test, "pytest");
});
