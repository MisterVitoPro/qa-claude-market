"use strict";
const fs = require("fs");
const path = require("path");
const java = require("./java.js");

function detect(cwd) {
  return fs.existsSync(path.join(cwd, "build.gradle.kts")) ? { manifest_path: "build.gradle.kts" } : null;
}

function _parseOutdated(text) {
  return java._parseMavenOutdated(text);
}

function listOutdated(cwd) {
  return java.listOutdated(cwd);
}

function listAvailableVersions(coords) {
  return java.listAvailableVersions(coords);
}

function applyUpgrade(cwd, coords, version) {
  const file = path.join(cwd, "build.gradle.kts");
  if (!fs.existsSync(file)) return { success: false, stderr: "build.gradle.kts not found" };
  const src = fs.readFileSync(file, "utf8");
  const escaped = coords.replace(/[.+*?^$()[\]{}|\\]/g, "\\$&");
  const re = new RegExp(`(['"])${escaped}:[^'"]+\\1`, "g");
  const next = src.replace(re, (m, q) => `${q}${coords}:${version}${q}`);
  if (next === src) return { success: false, stderr: `no occurrence of ${coords} in build.gradle.kts` };
  fs.writeFileSync(file, next);
  return { success: true };
}

function verifyCommands() {
  return { build: "./gradlew assemble", test: "./gradlew test" };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
