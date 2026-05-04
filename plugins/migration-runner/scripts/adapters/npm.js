"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  const p = path.join(cwd, "package.json");
  return fs.existsSync(p) ? { manifest_path: "package.json" } : null;
}

function _parseOutdated(json) {
  return Object.entries(json || {}).map(([name, info]) => ({
    name,
    current: info.current,
    latest_known: info.latest,
  }));
}

function listOutdated(cwd) {
  // npm outdated exits with code 1 when outdated packages exist; capture stdout regardless.
  let stdout = "";
  try {
    stdout = execSync("npm outdated --json", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    stdout = e.stdout || "";
  }
  const json = stdout.trim() ? JSON.parse(stdout) : {};
  return _parseOutdated(json);
}

async function listAvailableVersions(name) {
  const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  if (!resp.ok) throw new Error(`npm registry returned ${resp.status} for ${name}`);
  const data = await resp.json();
  const versions = Object.keys(data.versions || {});
  return versions.map((v) => ({ version: v, released_at: (data.time || {})[v] }));
}

function applyUpgrade(cwd, name, version) {
  try {
    execSync(`npm install ${name}@${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands(cwd) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  const scripts = pkg.scripts || {};
  const cmds = {};
  cmds.build = scripts.build ? "npm run build" : null;
  cmds.test = scripts.test ? "npm test" : null;
  cmds.typecheck = fs.existsSync(path.join(cwd, "tsconfig.json")) ? "npx tsc --noEmit" : null;
  // Drop nulls to keep schema clean.
  for (const k of Object.keys(cmds)) if (cmds[k] === null) delete cmds[k];
  return cmds;
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
