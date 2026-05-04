"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  return fs.existsSync(path.join(cwd, "go.mod")) ? { manifest_path: "go.mod" } : null;
}

function _parseOutdated(text) {
  const out = [];
  // The output is concatenated JSON objects (Go's encoding/json default), one per module.
  // Split on newlines; tolerate whitespace.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.Update && obj.Update.Version && obj.Version) {
        out.push({ name: obj.Path, current: obj.Version, latest_known: obj.Update.Version });
      }
    } catch {
      /* ignore non-JSON lines from concatenated output */
    }
  }
  return out;
}

function listOutdated(cwd) {
  let stdout = "";
  try {
    stdout = execSync("go list -m -u -json all", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    stdout = e.stdout || "";
  }
  // Convert concatenated objects to JSON-lines (insert newline between }{).
  stdout = stdout.replace(/\}\s*\{/g, "}\n{");
  return _parseOutdated(stdout);
}

async function listAvailableVersions(name) {
  const base = `https://proxy.golang.org/${name}`;
  const listResp = await fetch(`${base}/@v/list`);
  if (!listResp.ok) throw new Error(`Go proxy /@v/list returned ${listResp.status}`);
  const versions = (await listResp.text()).split(/\s+/).filter(Boolean);
  const out = [];
  for (const v of versions) {
    try {
      const r = await fetch(`${base}/@v/${v}.info`);
      if (!r.ok) { out.push({ version: v, released_at: null }); continue; }
      const info = await r.json();
      out.push({ version: v, released_at: info.Time || null });
    } catch {
      out.push({ version: v, released_at: null });
    }
  }
  return out;
}

function applyUpgrade(cwd, name, version) {
  try {
    execSync(`go get ${name}@${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    execSync(`go mod tidy`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands() {
  return { build: "go build ./...", typecheck: "go vet ./...", test: "go test ./..." };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
