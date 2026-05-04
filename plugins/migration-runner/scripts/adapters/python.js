"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) return { manifest_path: "pyproject.toml" };
  if (fs.existsSync(path.join(cwd, "requirements.txt"))) return { manifest_path: "requirements.txt" };
  if (fs.existsSync(path.join(cwd, "Pipfile"))) return { manifest_path: "Pipfile" };
  return null;
}

function _parseOutdated(arr) {
  return (arr || []).map((it) => ({
    name: it.name,
    current: it.version,
    latest_known: it.latest_version,
  }));
}

function listOutdated(cwd) {
  let stdout = "";
  try {
    stdout = execSync("pip list --outdated --format=json", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    stdout = e.stdout || "";
  }
  return _parseOutdated(stdout.trim() ? JSON.parse(stdout) : []);
}

async function listAvailableVersions(name) {
  const resp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (!resp.ok) throw new Error(`PyPI returned ${resp.status} for ${name}`);
  const data = await resp.json();
  const out = [];
  for (const [v, files] of Object.entries(data.releases || {})) {
    const ts = (files[0] || {}).upload_time_iso_8601 || null;
    out.push({ version: v, released_at: ts });
  }
  return out;
}

function applyUpgrade(cwd, name, version) {
  try {
    execSync(`pip install -U ${name}==${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands(cwd) {
  const cmds = {};
  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) cmds.build = "python -m build";
  if (fs.existsSync(path.join(cwd, "mypy.ini"))) cmds.typecheck = "mypy .";
  cmds.test = "pytest";
  return cmds;
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
