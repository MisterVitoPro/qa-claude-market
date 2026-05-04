const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "go-adapter-")); });
after(() => { global.fetch = ORIG_FETCH; fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: returns manifest_path when go.mod exists", () => {
  const go = require("../../scripts/adapters/go.js");
  assert.equal(go.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "go.mod"), "module x\ngo 1.22\n");
  assert.equal(go.detect(CWD).manifest_path, "go.mod");
});

test("listOutdated parser: handles JSON-lines from `go list -m -u -json all`", () => {
  const go = require("../../scripts/adapters/go.js");
  const text = fs.readFileSync(path.join(__dirname, "../../test-fixtures/go/sample-outdated.txt"), "utf8");
  const out = go._parseOutdated(text);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: "golang.org/x/text", current: "v0.3.0", latest_known: "v0.16.0" });
});

test("listAvailableVersions: queries Go proxy list and per-version info", async () => {
  global.fetch = async (url) => {
    if (url.endsWith("/@v/list")) return { ok: true, text: async () => "v0.3.0\nv0.16.0\n" };
    if (url.endsWith("/v0.3.0.info")) return { ok: true, json: async () => ({ Version: "v0.3.0", Time: "2018-01-01T00:00:00Z" }) };
    if (url.endsWith("/v0.16.0.info")) return { ok: true, json: async () => ({ Version: "v0.16.0", Time: "2024-06-13T00:00:00Z" }) };
    throw new Error("unexpected URL " + url);
  };
  const go = require("../../scripts/adapters/go.js");
  const versions = await go.listAvailableVersions("golang.org/x/text");
  assert.equal(versions.length, 2);
  assert.equal(versions.find((v) => v.version === "v0.16.0").released_at, "2024-06-13T00:00:00Z");
});

test("verifyCommands: build, vet, test", () => {
  const go = require("../../scripts/adapters/go.js");
  fs.writeFileSync(path.join(CWD, "go.mod"), "module x\n");
  const cmds = go.verifyCommands(CWD);
  assert.equal(cmds.build, "go build ./...");
  assert.equal(cmds.typecheck, "go vet ./...");
  assert.equal(cmds.test, "go test ./...");
});
