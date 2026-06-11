#!/usr/bin/env node
// Code Atlas SessionStart hook (read-only).
// Loads .code-atlas/atlas.json into session context, or prints a tip if missing.
// Never writes, never launches agents. Exits silently on any failure.
//
// Token hygiene: the atlas is injected as minified JSON (saves ~40% vs the
// pretty-printed file). If the minified payload exceeds MAX_INLINE_CHARS, the
// lower-value sections are dropped and a pointer to the file is added instead.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ATLAS_PATH = path.join(process.cwd(), ".code-atlas", "atlas.json");
const GRAPH_PATH = path.join(process.cwd(), ".code-atlas", "graph-schema.json");
const MAX_INLINE_CHARS = 60000;

// Sections to keep, in priority order, when the atlas must be trimmed to fit.
const TRIM_KEEP_SECTIONS = [
  "_header",
  "tech_stack",
  "architecture_pattern",
  "architecture_evidence",
  "directory_map",
  "key_files",
  "entry_points",
  "high_traffic",
  "build_commands",
];

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

function graphStatsLine() {
  try {
    if (!fs.existsSync(GRAPH_PATH)) return "";
    const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8").replace(/^\uFEFF/, ""));
    const nodes = graph?.metadata?.total_nodes;
    const edges = graph?.metadata?.total_edges;
    if (typeof nodes !== "number" || typeof edges !== "number") return "";
    return (
      `\n\nSemantic dependency graph: ${nodes} nodes, ${edges} edges in .code-atlas/graph-schema.json. ` +
      `Use /code-atlas:query for dependencies, dependents, blast-radius (transitive_dependents), and attribute filters ` +
      `before manually tracing imports.`
    );
  } catch {
    return "";
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
  let payload = raw;
  let parsed = null;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    storedCommit = parsed?._header?.baseline_commit ?? "unknown";
    generatedAt = parsed?._header?.generated_at ?? "unknown";
    payload = JSON.stringify(parsed);
  } catch {
    // proceed with the raw text if the JSON is malformed
  }

  let trimNote = "";
  if (parsed && payload.length > MAX_INLINE_CHARS) {
    const trimmed = {};
    for (const key of TRIM_KEEP_SECTIONS) {
      if (parsed[key] !== undefined) trimmed[key] = parsed[key];
    }
    payload = JSON.stringify(trimmed);
    trimNote =
      `\n\nNote: atlas.json was too large to inline in full; conventions, module boundaries, ` +
      `external/circular dependencies were omitted. Read .code-atlas/atlas.json for the complete index.`;
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
    payload +
    graphStatsLine() +
    trimNote +
    (stale
      ? `\n\nNote: Index is stale (cached commit does not match HEAD). Run /code-atlas:update to refresh.`
      : "");

  emit(block);
  process.exit(0);
} catch {
  // Stay silent on any error so the hook never blocks the session.
  process.exit(0);
}
