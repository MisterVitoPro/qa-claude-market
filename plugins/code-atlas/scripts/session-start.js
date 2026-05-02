#!/usr/bin/env node
// Code Atlas SessionStart hook (read-only).
// Loads .code-atlas/atlas.json into session context, or prints a tip if missing.
// Never writes, never launches agents. Exits silently on any failure.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ATLAS_PATH = path.join(process.cwd(), ".code-atlas", "atlas.json");

function emit(text) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: text,
      },
    }),
  );
}

function safeGitShortSha() {
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim() || "n/a";
  } catch {
    return "n/a";
  }
}

try {
  if (!fs.existsSync(ATLAS_PATH)) {
    emit(
      "Tip: Run /code-atlas:map to generate an architecture index and speed up Claude's navigation.",
    );
    process.exit(0);
  }

  const raw = fs.readFileSync(ATLAS_PATH, "utf8");
  let storedCommit = "unknown";
  let generatedAt = "unknown";
  try {
    const parsed = JSON.parse(raw);
    storedCommit = parsed?._header?.baseline_commit ?? "unknown";
    generatedAt = parsed?._header?.generated_at ?? "unknown";
  } catch {
    // proceed even if JSON header is missing/malformed
  }

  const currentSha = safeGitShortSha();
  const stale =
    currentSha !== "n/a" &&
    storedCommit !== "unknown" &&
    storedCommit !== currentSha;

  const block =
    `## Code Atlas Architecture Index\n\n` +
    `Cached commit: ${storedCommit}\n` +
    `Current HEAD:  ${currentSha}\n` +
    `Generated at:  ${generatedAt}\n\n` +
    `Consult this index BEFORE using the Explore agent or running broad Grep/Glob searches. ` +
    `It contains the directory map, key files, tech stack, dependency graph, and build commands for this repository.\n\n` +
    raw +
    (stale
      ? `\n\nNote: Index is stale (cached commit does not match HEAD). Run /code-atlas:update to refresh.`
      : "");

  emit(block);
  process.exit(0);
} catch {
  // Stay silent on any error so the hook never blocks the session.
  process.exit(0);
}
