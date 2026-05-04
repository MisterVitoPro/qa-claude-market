const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "java-adapter-")); });
after(() => { global.fetch = ORIG_FETCH; fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: prefers pom.xml, then build.gradle", () => {
  const j = require("../../scripts/adapters/java.js");
  assert.equal(j.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "build.gradle"), "");
  assert.equal(j.detect(CWD).manifest_path, "build.gradle");
  fs.writeFileSync(path.join(CWD, "pom.xml"), "<project/>");
  assert.equal(j.detect(CWD).manifest_path, "pom.xml");
});

test("listOutdated parser: handles Maven versions plugin text output", () => {
  const j = require("../../scripts/adapters/java.js");
  const text = fs.readFileSync(path.join(__dirname, "../../test-fixtures/java/sample-outdated.txt"), "utf8");
  const out = j._parseMavenOutdated(text);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: "com.google.guava:guava", current: "31.1-jre", latest_known: "33.3.0-jre" });
});

test("listAvailableVersions: queries Maven Central search", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/java/sample-versions-guava.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /search\.maven\.org/);
    return { ok: true, json: async () => fixture };
  };
  const j = require("../../scripts/adapters/java.js");
  const versions = await j.listAvailableVersions("com.google.guava:guava");
  assert.equal(versions.length, 3);
  assert.equal(versions.find((v) => v.version === "33.3.0-jre").released_at, "2024-07-31T00:00:00.000Z");
});

test("verifyCommands: mvn for pom.xml, gradle for build.gradle", () => {
  const j = require("../../scripts/adapters/java.js");
  const pomDir = fs.mkdtempSync(path.join(os.tmpdir(), "pom-")); fs.writeFileSync(path.join(pomDir, "pom.xml"), "");
  const gradleDir = fs.mkdtempSync(path.join(os.tmpdir(), "gradle-")); fs.writeFileSync(path.join(gradleDir, "build.gradle"), "");
  assert.equal(j.verifyCommands(pomDir).test, "mvn test");
  assert.equal(j.verifyCommands(gradleDir).test, "./gradlew test");
  fs.rmSync(pomDir, { recursive: true }); fs.rmSync(gradleDir, { recursive: true });
});
