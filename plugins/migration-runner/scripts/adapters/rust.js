"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  return fs.existsSync(path.join(cwd, "Cargo.toml")) ? { manifest_path: "Cargo.toml" } : null;
}

function _parseOutdated(json) {
  return (json.dependencies || [])
    .filter((d) => d.project && d.latest && d.project !== d.latest)
    .map((d) => ({ name: d.name, current: d.project, latest_known: d.latest }));
}

function listOutdated(cwd) {
  let stdout = "";
  try {
    stdout = execSync("cargo outdated --format json", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    if (/not found|unrecognized subcommand/i.test(String(e.message))) {
      throw new Error("cargo-outdated not installed; run `cargo install cargo-outdated` and retry.");
    }
    stdout = e.stdout || "";
  }
  return _parseOutdated(stdout.trim() ? JSON.parse(stdout) : { dependencies: [] });
}

async function listAvailableVersions(name) {
  const resp = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`, {
    headers: { "user-agent": "migration-runner (https://github.com/MisterVitoPro/qa-claude-market)" },
  });
  if (!resp.ok) throw new Error(`crates.io returned ${resp.status} for ${name}`);
  const data = await resp.json();
  return (data.versions || [])
    .filter((v) => !v.yanked)
    .map((v) => ({ version: v.num, released_at: v.created_at }));
}

function applyUpgrade(cwd, name, version) {
  try {
    execSync(`cargo update -p ${name} --precise ${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands() {
  return { build: "cargo build", typecheck: "cargo check", test: "cargo test" };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
