const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-adapter-")); });
after(() => { global.fetch = ORIG_FETCH; fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: returns first .csproj or .sln", () => {
  const c = require("../../scripts/adapters/csharp.js");
  assert.equal(c.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "MyApp.csproj"), "<Project/>");
  assert.equal(c.detect(CWD).manifest_path, "MyApp.csproj");
});

test("listOutdated parser: handles dotnet list --outdated --format json", () => {
  const c = require("../../scripts/adapters/csharp.js");
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/csharp/sample-outdated.json"), "utf8"));
  const out = c._parseOutdated(fixture);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { name: "Newtonsoft.Json", current: "12.0.3", latest_known: "13.0.3" });
});

test("listAvailableVersions: queries NuGet flat container; release_at is null (NuGet flat doesn't expose dates)", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/csharp/sample-versions-newtonsoft.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /api\.nuget\.org\/v3-flatcontainer\/newtonsoft\.json\/index\.json/);
    return { ok: true, json: async () => fixture };
  };
  const c = require("../../scripts/adapters/csharp.js");
  const versions = await c.listAvailableVersions("Newtonsoft.Json");
  assert.equal(versions.length, 4);
  assert.equal(versions[0].version, "12.0.0");
  assert.equal(versions[0].released_at, null);
});

test("verifyCommands: dotnet build + test", () => {
  const c = require("../../scripts/adapters/csharp.js");
  const cmds = c.verifyCommands(CWD);
  assert.equal(cmds.build, "dotnet build");
  assert.equal(cmds.test, "dotnet test");
});
