#!/usr/bin/env node
// llm-wiki SessionStart hook (read-only).
// Loads .llm-wiki/index.md into session context as a navigation primer, or prints a
// tip if missing. Never writes, never launches agents. Exits silently on any failure.
//
// The index is Markdown with a small YAML frontmatter block carrying baseline_commit
// and page_count. The frontmatter is stripped from the injected body; the commit is
// compared against current HEAD to surface a staleness note. If the body exceeds
// MAX_INLINE_CHARS it is truncated with a pointer to the full file.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const INDEX_PATH = path.join(process.cwd(), ".llm-wiki", "index.md");
const MAX_INLINE_CHARS = 60000;

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
    return (
      execSync("git rev-parse --short HEAD", {
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000,
      })
        .toString()
        .trim() || "n/a"
    );
  } catch {
    return "n/a";
  }
}

// Minimal frontmatter parse: returns { meta, body }. Only flat `key: value` pairs are read.
function splitFrontmatter(raw) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: match[2] };
}

try {
  if (!fs.existsSync(INDEX_PATH)) {
    emit(
      "Tip: Run /llm-wiki:generate to build a navigable wiki for this codebase so Claude can read one page per task instead of grepping from scratch.",
    );
    process.exit(0);
  }

  const raw = fs.readFileSync(INDEX_PATH, "utf8");
  const { meta, body } = splitFrontmatter(raw);
  const storedCommit = meta.baseline_commit || "unknown";
  const generatedAt = meta.generated_at || "unknown";
  const pageCount = meta.page_count || "?";

  let payload = body.trim();
  let trimNote = "";
  if (payload.length > MAX_INLINE_CHARS) {
    payload = payload.slice(0, MAX_INLINE_CHARS);
    trimNote =
      `\n\nNote: the wiki index was too large to inline in full; it was truncated. ` +
      `Read .llm-wiki/index.md for the complete navigation, then the linked page under .llm-wiki/pages/.`;
  }

  const currentSha = safeGitShortSha();
  const stale =
    currentSha !== "n/a" &&
    storedCommit !== "unknown" &&
    storedCommit !== "" &&
    storedCommit !== currentSha;

  const block =
    `## llm-wiki -- Codebase Wiki Index\n\n` +
    `Cached commit: ${storedCommit}\n` +
    `Current HEAD:  ${currentSha}\n` +
    `Generated at:  ${generatedAt}\n` +
    `Pages:         ${pageCount}\n\n` +
    `Consult this wiki BEFORE broad Grep/Glob exploration. To understand a subsystem, ` +
    `read its page under .llm-wiki/pages/ (each lists the source files it documents) before ` +
    `re-deriving it from source.\n\n` +
    payload +
    trimNote +
    (stale
      ? `\n\nNote: the wiki is stale (cached commit does not match HEAD). Run /llm-wiki:update to refresh affected pages.`
      : "");

  emit(block);
  process.exit(0);
} catch {
  // Stay silent on any error so the hook never blocks the session.
  process.exit(0);
}
