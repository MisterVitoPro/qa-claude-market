"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  if (fs.existsSync(path.join(cwd, "pom.xml"))) return { manifest_path: "pom.xml" };
  if (fs.existsSync(path.join(cwd, "build.gradle"))) return { manifest_path: "build.gradle" };
  if (fs.existsSync(path.join(cwd, "build.gradle.kts"))) return { manifest_path: "build.gradle.kts" };
  return null;
}

function _parseMavenOutdated(text) {
  // Format: "  group:artifact ........... oldVersion -> newVersion"
  const out = [];
  const re = /^\[INFO\]\s+([\w.\-]+:[\w.\-]+)\s+\.+\s+(\S+)\s*->\s*(\S+)\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ name: m[1], current: m[2], latest_known: m[3] });
  }
  return out;
}

function listOutdated(cwd) {
  const det = detect(cwd);
  if (!det) return [];
  if (det.manifest_path === "pom.xml") {
    let stdout = "";
    try {
      stdout = execSync("mvn versions:display-dependency-updates -q", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      stdout = e.stdout || "";
    }
    return _parseMavenOutdated(stdout);
  }
  // Gradle: requires com.github.ben-manes.versions plugin. Surface a clear error if missing.
  let stdout = "";
  try {
    stdout = execSync("./gradlew dependencyUpdates -q", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    if (/Task .*dependencyUpdates.* not found/i.test(String(e.message))) {
      throw new Error("Gradle versions plugin not configured. Add `id 'com.github.ben-manes.versions' version '0.51.0'` to build.gradle plugins block.");
    }
    stdout = e.stdout || "";
  }
  // Reuse Maven-style parser; the gradle plugin output uses the same shape in its text report.
  return _parseMavenOutdated(stdout);
}

async function listAvailableVersions(coords) {
  const [g, a] = String(coords).split(":");
  if (!g || !a) throw new Error(`expected GROUP:ARTIFACT, got ${coords}`);
  const url = `https://search.maven.org/solrsearch/select?q=g:%22${encodeURIComponent(g)}%22+AND+a:%22${encodeURIComponent(a)}%22&core=gav&rows=200&wt=json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Maven Central returned ${resp.status} for ${coords}`);
  const data = await resp.json();
  return ((data.response || {}).docs || []).map((d) => ({
    version: d.v,
    released_at: new Date(d.timestamp).toISOString(),
  }));
}

function applyUpgrade(cwd, coords, version) {
  const det = detect(cwd);
  if (!det) return { success: false, stderr: "no Java manifest" };
  try {
    if (det.manifest_path === "pom.xml") {
      execSync(`mvn versions:use-dep-version -Dincludes=${coords} -DdepVersion=${version} -DforceVersion=true -DgenerateBackupPoms=false`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } else {
      // Gradle: rewrite the version string in build.gradle / build.gradle.kts.
      const file = path.join(cwd, det.manifest_path);
      const src = fs.readFileSync(file, "utf8");
      const re = new RegExp(`(['"])${coords.replace(/[.+*?^$()[\]{}|\\]/g, "\\\\$&")}:[^'"]+\\1`, "g");
      const next = src.replace(re, (m, q) => `${q}${coords}:${version}${q}`);
      if (next === src) return { success: false, stderr: `no occurrence of ${coords} in ${det.manifest_path}` };
      fs.writeFileSync(file, next);
    }
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands(cwd) {
  const det = detect(cwd);
  if (!det) return {};
  if (det.manifest_path === "pom.xml") return { build: "mvn -q -DskipTests package", test: "mvn test" };
  return { build: "./gradlew assemble", test: "./gradlew test" };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseMavenOutdated };
