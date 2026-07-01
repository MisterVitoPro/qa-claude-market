# qa-swarm Repo Extraction — Design

**Date:** 2026-06-30
**Status:** Approved

## Context

`qa-claude-market` is a multi-plugin monorepo: 6 plugins live under `plugins/`, registered in `.claude-plugin/marketplace.json` via local relative-path sources (`"source": "./plugins/<name>"`). The goal is to move this repo toward being a thin marketplace registry only, with each plugin living in its own dedicated GitHub repo.

This is cycle 1 of that migration: extract `qa-swarm` (v1.4.1) as the first plugin, to validate the pattern before repeating it for the remaining 5 plugins (code-atlas, plan-runner, jupiter, migration-runner, llm-wiki) in later cycles.

## Decisions

- **Scope:** One plugin this cycle (`qa-swarm`), not all 6.
- **History:** Fresh start — new repo gets a single initial commit, no imported git history from the monorepo.
- **Destination:** New public GitHub repo `MisterVitoPro/qa-swarm` (plugin.json's existing `repository` field already anticipated this URL).
- **Old code:** Deleted from `qa-claude-market` once the new repo is live and `marketplace.json` points externally (no transition period).
- **Tag convention:** New repo uses plain `v<version>` tags (drops the `qa-swarm/` prefix — that prefix exists only to disambiguate plugins sharing one repo).
- **Execution mode:** Full extraction done in this session; pause for explicit go-ahead immediately before the irreversible steps (`gh repo create`, `git push`, deleting `plugins/qa-swarm/` from this repo).

## A. New `qa-swarm` repo content

Plugin files move to the new repo's root (not a subdirectory):
- `.claude-plugin/plugin.json`, `agents/`, `skills/` — copied as-is from `plugins/qa-swarm/`
- `LICENSE`, `README.md` — already exist under `plugins/qa-swarm/`, copied as-is
- `docs/MASTER-SPEC.md` — new file; content comes from `docs/master-spec/CONSOLIDATED-qa-swarm.md` in this repo (qa-swarm's own jupiter-consolidated design spec, currently living at the monorepo root — it documents the plugin, so it moves with it)

No CI is added to the new repo speculatively — out of scope unless requested later.

Single fresh commit, authored by `MisterVitoPro` (existing git author config), no history import.

## B. Versioning in the new repo

- Tag the initial commit `v1.4.1` (matches the current `plugin.json` version).
- Going forward in the new repo: bump `.claude-plugin/plugin.json` version, tag `v<version>`, push. This is documented in the new repo's own README, not `qa-claude-market`'s.
- Bumping the version updates the live README badge automatically (see D) — no marketplace-side action needed for the badge. A separate, deliberate step is still needed to bump `marketplace.json`'s `ref`/`sha` so installs pick up the new version (see C).

## C. `qa-claude-market` changes

1. **`.claude-plugin/marketplace.json`** — qa-swarm entry's `source` changes from the local path to:
   ```json
   "source": {
     "source": "url",
     "url": "https://github.com/MisterVitoPro/qa-swarm.git",
     "ref": "v1.4.1",
     "sha": "<commit sha after push>"
   }
   ```
   Confirmed against the official `claude-plugins-official` marketplace.json: `"source": "url"` is correct for a plugin living at an external repo's root; `"source": "git-subdir"` is only needed when the plugin lives in a subdirectory of the external repo. `ref` pins to the tag; `sha` pins to the exact commit (added once known, post-push).

2. **Delete** `plugins/qa-swarm/` and `docs/master-spec/CONSOLIDATED-qa-swarm.md` from this repo.

3. **`.github/CODEOWNERS`** — remove the now-stale `/plugins/qa-swarm/ @MisterVitoPro` line.

4. **`.github/workflows/lint.yml`** — no change needed; it already globs `plugins/*/` and tolerates qa-swarm's absence.

5. **Root `README.md`**:
   - qa-swarm's version badge URL changes from pointing at this repo's `plugins/qa-swarm/.claude-plugin/plugin.json` to the new repo's root:
     ```
     https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-swarm%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue
     ```
     This is a live shields.io `dynamic/json` badge — it fetches `main` at render time, so it always reflects the new repo's current version with no further action needed here.
   - Versioning/install instructions section gains a note distinguishing local-path plugins (tag `<plugin-name>/v<version>` in this repo) from externally-sourced plugins (tag `v<version>` in their own repo, then bump `ref`/`sha` here).

6. **Root `CLAUDE.md`**:
   - qa-swarm's row in the Directory Map's "Current Plugins" section notes it's now externally sourced (repo link) rather than a local directory.
   - Remove qa-swarm's entry from the `plugins/` tree in the Directory Map (it's no longer local).
   - Versioning section gains the same local-vs-external distinction as the README.

## D. Verification

- `marketplace.json` is valid JSON after the edit (matches existing CI check).
- Add this local marketplace (`claude plugin marketplace add <local path>`) and run `claude plugin install qa-swarm`, confirming it installs from the new GitHub URL and that `/qa-swarm:attack` and `/qa-swarm:implement` resolve correctly.
- Spot-check the README badge renders (shields.io URL is well-formed and points at the new raw content path).

## Out of scope

- The other 5 plugins are untouched this cycle. Repeat sections B–D per plugin in future cycles once this pattern is validated.
- No CI/release automation added to the new repo.
