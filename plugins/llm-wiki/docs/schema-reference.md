# llm-wiki Schema Reference

Defines the exact shape of the artifacts written under `.llm-wiki/` by
`/llm-wiki:generate` and `/llm-wiki:update`.

| Artifact | Committed? | Purpose | Consumed by |
|----------|-----------|---------|-------------|
| `index.md` | yes | Curated navigation index, injected at session start | SessionStart hook, humans |
| `pages/<slug>.md` | yes | One wiki page per subsystem/concept/reference | humans, Claude on demand |
| `state.json` | no (gitignored) | Provenance ledger + file-hash cache | `/llm-wiki:update` |
| `llms.txt` | yes | llms.txt-format index export (links + summaries) | external agents/tools |
| `llms-full.txt` | no (gitignored, opt-in) | All pages concatenated for single-fetch ingestion | external agents/tools |

Unlike code-atlas (whose JSON artifacts are entirely gitignored machine output),
the llm-wiki **pages and index are the deliverable and are committed**. Only the
`state.json` cache and the heavy `llms-full.txt` export are gitignored, so a page
edited by hand survives in version control and is protected on the next update.

---

## index.md

Markdown with a small YAML frontmatter block. The frontmatter carries the
metadata the SessionStart hook needs (it strips the frontmatter and injects the
body, truncating above ~60000 chars). Keep the index lean: one line per page.

```markdown
---
llm_wiki_index: true
schema_version: 1
plugin_version: "0.1.0"
generated_at: "2026-06-26T00:00:00Z"
baseline_commit: "abc1234"
generated_from: atlas
page_count: 12
broken_link_count: 0
---

# Acme API Wiki

> One-paragraph plain-language description of the project.

Tech stack: TypeScript, Express, PostgreSQL

Consult this wiki before broad Grep/Glob exploration. To understand a subsystem,
read its linked page (each lists the source_files it documents) before re-deriving
it from source. Pages live in `.llm-wiki/pages/`; links below are relative to this index.

## Overview
- [Home](pages/home.md) -- elevator pitch and navigation hub  _(overview)_
- [Getting Started](pages/getting-started.md) -- install, configure, run  _(setup)_

## Design
- [Architecture](pages/architecture.md) -- subsystems and patterns  _(design)_

## Modules
- [Authentication](pages/auth.md) -- JWT issuance and session middleware  _(security, backend)_
```

- `baseline_commit` -- `git rev-parse --short HEAD` at generation time; empty string if not a git repo. The hook compares it to current HEAD to flag staleness.
- `generated_from` -- `atlas` if the substrate came from a code-atlas index, else `scan`.

---

## Page frontmatter (`pages/<slug>.md`)

Every page opens with this frontmatter, then the Markdown body. The frontmatter is
the cheap relevance gate an agent reads before the body, and the provenance record
that drives staleness detection.

```markdown
---
id: auth
title: Authentication
type: module
summary: >
  JWT issuance and session middleware for the API.
tags: [security, backend]
related: [architecture, session-store]
source_files: [src/auth/index.ts, src/auth/jwt.ts]
generated_from: atlas
status: stable
---

# Authentication

Issues and validates JWTs and provides the session middleware used by every
authenticated route.

## What it does
...
```

Field reference:

| Field | Values | Notes |
|-------|--------|-------|
| `id` | kebab-case slug | Equals the filename stem; stable and unique. Renames break links -- avoid. |
| `title` | string | Human-readable page title. |
| `type` | `overview`, `architecture`, `getting-started`, `data-flow`, `module`, `concept`, `reference`, `data-model`, `glossary` | Drives nav grouping. |
| `summary` | string, 1-2 sentences | The relevance gate read before the body. |
| `tags` | string array | From a loose controlled vocabulary. |
| `related` | array of slugs | Forward cross-link targets (authored). |
| `source_files` | array of repo-relative paths | The grounding contract and staleness key. |
| `generated_from` | `atlas`, `scan` | Provenance of the substrate. |
| `status` | `stub`, `draft`, `stable` | `stub` = too little material to write a real page. |

Cross-links in the body use **relative Markdown links** (`[Architecture](architecture.md)`),
never `[[wikilinks]]` -- relative links resolve to a concrete path with no resolver
step, which is the most parseable form for an agent and renders on GitHub. Backlinks
are computed by the index synthesizer, not hand-authored.

Load-bearing claims are cited with a `` `repo/relative/path.ext:line` `` code span (or a
range `` `path.ext:start-end` ``), using line numbers the writer actually read. The
validator extracts these (only inside backticks, only full repo-relative paths) and warns
on any that point to a missing file or a line past the file's length -- a deterministic
guard against hallucinated line numbers.

Because writers sometimes abbreviate a citation path (`downtime/types.rs:9` instead of the
full `api-rs/crates/core/src/downtime/types.rs:9`, or an ellipsis `.../loot.rs:21`),
`scripts/normalize-citations.js` runs before finalize and rewrites each abbreviated citation
to the repo file whose path its suffix UNIQUELY matches. It never touches an already-valid
citation and leaves ambiguous ones untouched (so validate.js still surfaces them). This keeps
the citation a real, clickable `path:line` an agent can jump to.

---

## state.json

Full cache and provenance ledger. Gitignored. Never injected into context; read
only by `/llm-wiki:update` for hash diffing and incremental regeneration.

`state.json` and `llms.txt` are built deterministically by `scripts/finalize.js`
(not hand-assembled by the LLM): it computes `file_index` (git blob OIDs for tracked
files, sha256 otherwise), per-page `source_hashes` and `content_hash`, and inverse-link
`backlinks` directly from the pages on disk. The skills pass it only the values that
cannot be derived from disk (project name, summary, commit, timestamp, nav grouping)
via a small `--input` JSON file.

```json
{
  "_header": {
    "schema_version": 1,
    "plugin_version": "0.1.0",
    "generated_at": "2026-06-26T00:00:00Z",
    "baseline_commit": "abc1234",
    "scan_root": "."
  },
  "substrate_source": "atlas",
  "file_index": {
    "src/auth/index.ts": {
      "hash": "<git blob oid or sha256:<hex>>",
      "size_bytes": 1024,
      "lang": "typescript",
      "category": "source"
    }
  },
  "pages": {
    "pages/auth.md": {
      "page_id": "auth",
      "title": "Authentication",
      "type": "module",
      "summary": "JWT issuance and session middleware.",
      "tags": ["security", "backend"],
      "source_files": ["src/auth/index.ts", "src/auth/jwt.ts"],
      "source_hashes": {
        "src/auth/index.ts": "<blob oid>",
        "src/auth/jwt.ts": "<blob oid>"
      },
      "content_hash": "sha256:<hex of the page body>",
      "cross_links": ["architecture", "session-store"],
      "backlinks": ["architecture", "overview"],
      "status": "stable",
      "generated_from_commit": "abc1234",
      "generated_at": "2026-06-26T00:00:00Z"
    }
  },
  "nav_tree": [
    { "group": "Overview", "page_ids": ["home", "getting-started"] }
  ],
  "broken_links": [],
  "last_run": {
    "strategy": "full",
    "duration_seconds": 0,
    "agents_used": 8,
    "pages_written": 12,
    "files_scanned": 0
  }
}
```

- `file_index` keys are repo-relative paths. `hash` is the git blob OID for tracked
  files, or `sha256:<hex>` for untracked files. Identity is **content hash, not mtime
  or commit SHA**, which is what makes the diff resilient to rebases and branch switches.
- `pages[].source_hashes` snapshots the hash of each source file at generation time. A
  page is stale when any of its `source_files` has a different hash in the current index.
- `pages[].content_hash` is the hash of the page body as generated. `/llm-wiki:update`
  compares the live page body against it to detect hand edits before overwriting.
- `last_run.strategy` -- `full`, `targeted`, `micro`.

---

## Staleness model (two tiers)

1. **Cheap (SessionStart hook):** compare `index.md` frontmatter `baseline_commit` to
   current `git rev-parse --short HEAD`. A mismatch surfaces a one-line "wiki may be
   stale" note. Instant; no diffing.
2. **Precise (`/llm-wiki:update`):** rebuild the file index from `git ls-files -s` +
   untracked hashes, diff against `state.file_index`, and map each changed/deleted source
   to the pages it feeds via `pages[].source_files`. Only affected pages regenerate.

---

## Validation

`scripts/validate.js` is a dependency-free deterministic validator that both
`/llm-wiki:generate` (Step 6b) and `/llm-wiki:update` run as a gate before
reporting success, and that ships with a `node --test` suite (`tests/`).

```bash
node scripts/validate.js [wikiDir]   # defaults to .llm-wiki; --json for machine output
```

It exits non-zero when any ERROR is found (WARNINGs do not fail). Checks:

| Check | Severity |
|-------|----------|
| Each page has frontmatter with `id`/`title`/`type`/`summary`/`source_files`; `id` matches filename | ERROR |
| `type` in the page-type enum; `status` in `stub`/`draft`/`stable` | ERROR |
| Every cross-link (frontmatter `related` + body `](slug.md)` links) resolves to a real page | ERROR |
| Every `index.md` link resolves; `page_count` matches pages on disk; `broken_link_count` is not understated | ERROR |
| Each Mermaid block: known diagram type, balanced `[](){}`, closed fence; flowcharts also need balanced `subgraph`/`end` and a non-empty body (structural lint, not a full parse) | ERROR |
| `state.json` is valid JSON with `schema_version` 1 and a `pages` map of `source_files` arrays | ERROR |
| Page is a `stub`; a page is not linked from the index; a `state.json` source file no longer exists (staleness) | WARN |
| A `` `path:line` `` citation points to a missing file or an out-of-range line (guards against hallucinated line numbers) | WARN |
| `llms.txt` has an H1 and a summary blockquote | WARN (blockquote) |

Mermaid checking is intentionally a **structural lint** rather than a full parse:
a complete parse would require the `mermaid` package, which would violate this
repo's no-runtime-dependency rule. The lint catches the common LLM failure modes
(unbalanced brackets, unknown diagram header, unclosed fence, unbalanced
`subgraph`/`end`, header-only flowcharts) without a dependency. It deliberately
does NOT flag "undeclared nodes": in a Mermaid flowchart a bare id used in an edge
is auto-declared, so that is valid syntax, not an error.

## llms.txt export

Spec-compliant ([llmstxt.org](https://llmstxt.org/)) index export for external agents:
H1 project name, a `>` summary blockquote, then `## <group>` sections of
`- [Title](pages/<slug>.md): summary` link lists, with a trailing `## Optional`
section for low-priority pages (glossary, deep reference) that an agent may skip under
a tight context budget. `llms-full.txt` (opt-in via `--llms-full`) inlines every page's
full Markdown after the same header.
