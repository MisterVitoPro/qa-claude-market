"use strict";
const fs = require("fs");
const path = require("path");
const child_process = require("child_process");

function detect(cwd) {
  const entries = fs.readdirSync(cwd);
  const csproj = entries.find((f) => f.endsWith(".csproj"));
  if (csproj) return { manifest_path: csproj };
  const sln = entries.find((f) => f.endsWith(".sln"));
  if (sln) return { manifest_path: sln };
  return null;
}

function _parseOutdated(json) {
  const out = [];
  for (const proj of json.projects || []) {
    for (const fw of proj.frameworks || []) {
      for (const pkg of fw.topLevelPackages || []) {
        if (pkg.latestVersion && pkg.resolvedVersion && pkg.latestVersion !== pkg.resolvedVersion) {
          out.push({ name: pkg.id, current: pkg.resolvedVersion, latest_known: pkg.latestVersion });
        }
      }
    }
  }
  return out;
}

function listOutdated(cwd) {
  let stdout = "";
  try {
    stdout = child_process.execSync("dotnet list package --outdated --format json", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    stdout = e.stdout || "";
  }
  if (!stdout.trim()) return [];
  return _parseOutdated(JSON.parse(stdout));
}

async function listAvailableVersions(name) {
  // NuGet's lowercase-ID convention.
  const id = String(name).toLowerCase();
  const resp = await fetch(`https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(id)}/index.json`);
  if (!resp.ok) throw new Error(`NuGet returned ${resp.status} for ${name}`);
  const data = await resp.json();
  // Flat container does not include published dates; OSV.dev still returns them per-vuln.
  // For ranking soak-window, we treat null as "unknown" (== treated as old, so passes soak).
  return (data.versions || []).map((v) => ({ version: v, released_at: null }));
}

function applyUpgrade(cwd, name, version) {
  try {
    child_process.execSync(`dotnet add package ${name} --version ${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands() {
  return { build: "dotnet build", test: "dotnet test" };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
