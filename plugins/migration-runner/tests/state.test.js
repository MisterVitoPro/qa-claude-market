const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { read, write } = require("../scripts/state.js");

let TMP;
before(() => { TMP = fs.mkdtempSync(path.join(os.tmpdir(), "state-test-")); });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test("read: returns null when file does not exist", () => {
  assert.equal(read(path.join(TMP, "nope.json")), null);
});

test("write + read round-trips", () => {
  const p = path.join(TMP, "s.json");
  const data = { plan_generated_at: "2026-05-03T00:00:00Z", waves: [{ wave_index: 1, package: "x", status: "pending" }] };
  write(p, data);
  assert.deepEqual(read(p), data);
});

test("write: atomic via tmp-then-rename leaves no .tmp file", () => {
  const p = path.join(TMP, "atomic.json");
  write(p, { x: 1 });
  const files = fs.readdirSync(TMP);
  assert.ok(!files.some((f) => f.endsWith(".tmp")), "no .tmp leftover");
});
