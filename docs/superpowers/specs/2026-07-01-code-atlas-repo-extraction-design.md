# code-atlas Repo Extraction — Design

**Date:** 2026-07-01
**Status:** Approved

## Context

`qa-claude-market` is moving toward being a thin marketplace registry, with each plugin living in its own dedicated GitHub repo. `qa-swarm` was extracted in cycle 1 (2026-06-30) to validate the pattern. This is cycle 2: extract `code-atlas` (v2.1.0), the next plugin in the migration.

Unlike qa-swarm, code-atlas's `plugin.json` currently has `repository` pointing back at this monorepo (`https://github.com/MisterVitoPro/qa-claude-market`) rather than a pre-anticipated dedicated repo URL — that field gets updated as part of this extraction.

## Decisions

- **Scope:** One plugin this cycle (`code-atlas`), not the remaining local plugins (plan-runner, jupiter, migration-runner, llm-wiki).
- **History:** Fresh start — new repo gets a single initial commit, no imported git history from the monorepo.
- **Destination:** New public GitHub repo `MisterVitoPro/code-atlas`.
- **Old code:** Deleted from `qa-claude-market` once the new repo is live and `marketplace.json` points externally (no transition period).
- **Tag convention:** New repo uses plain `v<version>` tags, per this repo's existing policy for externally-sourced plugins.
- **Execution mode:** Full extraction done in this session; pause for explicit go-ahead immediately before the irreversible steps (`gh repo create`, `git push`, deleting `plugins/code-atlas/` from this repo).

## A. New `code-atlas` repo content

Plugin files move to the new repo's root (not a subdirectory):
- `.claude-plugin/plugin.json`, `agents/`, `skills/`, `hooks/`, `scripts/`, `docs/`, `test-fixtures/`, `tests/` — copied as-is from `plugins/code-atlas/`
- `LICENSE`, `README.md` — already exist under `plugins/code-atlas/`, copied as-is

Unlike qa-swarm, there is no `docs/master-spec/CONSOLIDATED-*.md` merge needed for the new repo's content — code-atlas's docs (`schema-reference.md`, `query-language-reference.md`) already live inside the plugin itself, not at the monorepo root.

`scripts/query.js` and `scripts/session-start.js` are dependency-free Node ≥18 (no `package.json` needed) — this stays true after the move.

No CI is added to the new repo speculatively — out of scope unless requested later.

Single fresh commit, authored by `MisterVitoPro` (existing git author config), no history import.

## B. Versioning in the new repo

- Tag the initial commit `v2.1.0` (matches the current `plugin.json` version).
- Going forward in the new repo: bump `.claude-plugin/plugin.json` version, tag `v<version>`, push. This is documented in the new repo's own README, not `qa-claude-market`'s.
- Bumping the version updates the live README badge automatically — no marketplace-side action needed for the badge. A separate, deliberate step is still needed to bump `marketplace.json`'s `ref`/`sha` so installs pick up the new version (see C).

## C. `qa-claude-market` changes

1. **`.claude-plugin/marketplace.json`** — code-atlas entry's `source` changes from the local path to:
   ```json
   "source": {
     "source": "url",
     "url": "https://github.com/MisterVitoPro/code-atlas.git",
     "ref": "v2.1.0",
     "sha": "<commit sha after push>"
   }
   ```
   Matches the `"source": "url"` form already used for qa-swarm (plugin lives at the external repo's root).

2. **Delete** `plugins/code-atlas/` and `docs/master-spec/CONSOLIDATED-code-atlas.md` from this repo.

3. **`.github/CODEOWNERS`** — remove the now-stale `/plugins/code-atlas/ @MisterVitoPro` line.

4. **`.github/workflows/lint.yml`** — no change needed; it already globs `plugins/*/` and tolerates code-atlas's absence.

5. **Root `README.md`**:
   - code-atlas's version badge URL changes from pointing at this repo's `plugins/code-atlas/.claude-plugin/plugin.json` to the new repo's root:
     ```
     https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fcode-atlas%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue
     ```
   - The existing "Plugins sourced from their own repo (e.g. `qa-swarm`)" versioning note is already generic policy language and needs no edit.

6. **Root `CLAUDE.md`**:
   - code-atlas's row in the "Current Plugins" table notes it's now externally sourced (repo link), mirroring qa-swarm's row.
   - Remove code-atlas's entry from the `plugins/` tree in the Directory Layout / Directory Map sections (it's no longer local).
   - The `<!-- code-atlas:start -->...<!-- code-atlas:end -->` block (code-atlas's own generated architecture-index output for this repo) is unrelated to where the plugin's source code lives and needs no change.

## D. Verification

- `marketplace.json` is valid JSON after the edit (matches existing CI check).
- Add this local marketplace (`claude plugin marketplace add <local path>`) and run `claude plugin install code-atlas`, confirming it installs from the new GitHub URL and that `/code-atlas:map`, `/code-atlas:query`, and `/code-atlas:update` resolve correctly.
- Run code-atlas's own `node --test` suite (`tests/query.test.js`) before deleting the local copy, to confirm nothing breaks in transit.
- Spot-check the README badge renders (shields.io URL is well-formed and points at the new raw content path).

## Out of scope

- The remaining local plugins (plan-runner, jupiter, migration-runner, llm-wiki) are untouched this cycle. Repeat sections B–D per plugin in future cycles.
- No CI/release automation added to the new repo.
