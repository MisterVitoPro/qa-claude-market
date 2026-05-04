const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "kotlin-adapter-")); });
after(() => { fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: returns build.gradle.kts when present", () => {
  const k = require("../../scripts/adapters/kotlin.js");
  assert.equal(k.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "build.gradle.kts"), "");
  assert.equal(k.detect(CWD).manifest_path, "build.gradle.kts");
});

test("listOutdated parser: handles versions plugin text output", () => {
  const k = require("../../scripts/adapters/kotlin.js");
  const text = fs.readFileSync(path.join(__dirname, "../../test-fixtures/kotlin/sample-outdated.txt"), "utf8");
  const out = k._parseOutdated(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "org.jetbrains.kotlin:kotlin-stdlib");
});

test("applyUpgrade: rewrites version string in build.gradle.kts", () => {
  const k = require("../../scripts/adapters/kotlin.js");
  const file = path.join(CWD, "build.gradle.kts");
  fs.writeFileSync(file, 'dependencies { implementation("org.jetbrains.kotlin:kotlin-stdlib:1.8.22") }\n');
  const r = k.applyUpgrade(CWD, "org.jetbrains.kotlin:kotlin-stdlib", "2.0.20");
  assert.equal(r.success, true);
  assert.match(fs.readFileSync(file, "utf8"), /kotlin-stdlib:2\.0\.20/);
});

test("verifyCommands: ./gradlew test", () => {
  const k = require("../../scripts/adapters/kotlin.js");
  fs.writeFileSync(path.join(CWD, "build.gradle.kts"), "");
  assert.equal(k.verifyCommands(CWD).test, "./gradlew test");
});
