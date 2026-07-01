---
name: llm-wiki:update
description: >
  Incrementally refresh the wiki under .llm-wiki/. Diffs current file hashes against the
  state cache (git-blob OIDs, resilient to rebases and branch switches), maps changed source
  files to the pages they feed via the provenance ledger, and regenerates only stale pages --
  or does a full rebuild when changes are broad. Warns before overwriting pages edited by hand.
  Pass "full" to force a complete regenerate. Triggers on: update wiki, refresh docs, sync the
  wiki, regenerate stale pages.
argument-hint: "<optional: 'full' to force a complete rebuild>"
---

You are refreshing an existing llm-wiki. Goal: bring `.llm-wiki/` back in sync with the code at minimum cost, regenerating only the pages whose source files changed.

User arguments: **"{$ARGUMENTS}"** -- if it contains `full`, force a full rebuild (delegate to the full pipeline in `/llm-wiki:generate`).

Reference: `plugins/llm-wiki/docs/schema-reference.md`.

## Step 1: LOAD STATE

Read `.llm-wiki/state.json`.
- If it does not exist, stop and print: `No wiki found. Run /llm-wiki:generate first.`
- If `_header.schema_version` does not match the current schema (1), treat this as a forced full rebuild (schema migration).

Extract `baseline_index = state.file_index`, `pages = state.pages`, and `baseline_commit = state._header.baseline_commit`.

## Step 2: BUILD THE CURRENT FILE INDEX

Exactly as `/llm-wiki:generate` Step 1b:
1. `git ls-files -s` -> `{ path -> blob_oid }` for tracked files (free, rebase-proof hashes).
2. Glob untracked files (same exclusion list) and `shasum -a 256` them as `sha256:<hex>`.
3. Combine into `current_index`. If git is absent, hash everything with `shasum`.

## Step 3: DIFF

Compare `baseline_index` vs `current_index`:
- `added` = paths in current, not baseline
- `deleted` = paths in baseline, not current
- `changed` = in both, hash differs

Count only **source** files (exclude `documentation`, `assets`, `build_output` categories) toward the change magnitude.

If `added`, `changed`, `deleted` are all empty AND the current short commit equals `baseline_commit`, print `Wiki is up to date.` and STOP.

## Step 4: MAP CHANGED SOURCES TO STALE PAGES

Build the inverse index from the provenance ledger: for each page in `state.pages`, it is **stale** if any path in its `source_files` appears in `changed` or `deleted`. A new top-level source directory (in `added`) with no owning page is a **coverage gap** -> it needs a new page.

Compute:
- `stale_pages` = pages with a changed/deleted source file
- `orphaned_pages` = pages all of whose `source_files` were deleted (candidates for removal)
- `new_areas` = added top-level source directories not covered by any page

## Step 5: DETECT MANUAL EDITS (protect hand-tuned pages)

For each stale page, read its current file body and compute `sha256:` of it. Compare to the stored `content_hash`. If they differ, the page was edited by hand since generation. List these and ask:

```
These pages were edited by hand after generation and are now stale:
  - pages/auth.md
Overwrite with regenerated content? (y = overwrite / n = skip / d = show diff)
```

Skip any page the user declines. Never silently overwrite a hand-edited page.

## Step 6: CHOOSE STRATEGY (first match wins)

- **Up to date** -- handled in Step 3.
- **Micro / Targeted** -- `full` NOT passed AND (`stale_pages` + `new_areas`) <= 8 AND `new_areas` <= 2 AND no schema mismatch. Regenerate only the affected pages (Step 7).
- **Full rebuild** -- `full` passed, OR > 8 affected pages, OR > 2 new top-level source areas, OR schema mismatch, OR `state.pages` is empty. Invoke the full `/llm-wiki:generate` pipeline (rebuild substrate -> plan -> diagrams -> all writers -> synthesize). Stop here once it completes.

## Step 7: TARGETED REGENERATION

1. Rebuild the substrate inputs the same way `/llm-wiki:generate` Step 1c does (reuse `.code-atlas/` if present, else light scan) -- but only enough to re-derive `source_files` content, related slugs, and any diagrams for the affected pages.
2. For each page to regenerate (the approved stale pages + one new page per `new_area`), dispatch its writer (`wiki-overview-writer` / `wiki-module-writer`) with the same prompt shape as generate Step 4, in parallel waves of <=6, each owning only its one page file. For a `new_area`, first ask the planner-style question inline (or dispatch `wiki-planner` scoped to just the new area) to get the page_id/title/outline/source_files.
3. Remove `orphaned_pages` the user confirms deleting (their source is gone). Delete the file and drop it from the ledger.
4. Re-run the **wiki-index-synthesizer** over the full current page set (regenerated + untouched) so `index.md`, the nav tree, backlinks, and cross-link validation reflect reality.

## Step 8: WRITE STATE + REPORT

0. **Normalize citations** -- run `node "${CLAUDE_PLUGIN_ROOT}/scripts/normalize-citations.js" --wiki .llm-wiki` so any abbreviated `path:line` citation in a regenerated page is expanded to its full repo-relative path before hashing.
1. Rebuild `state.json` + `llms.txt` deterministically with the bundled finalizer rather than by hand: write a `.finalize-input.json` (repoRoot, current short `commit`, `generatedAt`, `pluginVersion`, project, summary, techSummary, substrate, `strategy` = `micro`|`targeted`, `agentsUsed`, `optionalIds`, and the current `navTree`) and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/finalize.js" --wiki .llm-wiki --input <that file>` (with `--llms-full` if `llms-full.txt` already exists). This recomputes `file_index`, every page's `source_hashes`/`content_hash`, and `backlinks` from the pages now on disk -- so refreshed pages get new hashes and untouched pages keep theirs. Delete the temp input file afterward.
2. (Handled by finalize.js in step 1; no separate hand-assembly.)
3. **Validate** -- run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.js" .llm-wiki`. Regenerating a subset of pages can leave a dangling cross-link (a regenerated page dropped a slug another page still links to) or a stale `page_count`; fix any ERRORs and re-run until clean before reporting success. Skip with a note if `node` is unavailable.
4. **Coverage** -- run `node "${CLAUDE_PLUGIN_ROOT}/scripts/coverage.js" --wiki .llm-wiki` and include its line in the summary, so newly added modules that still lack a page are visible.
5. Print a summary:

```
llm-wiki -- Updated
=====================
Strategy:        {micro | targeted | full}
Changed sources: {A added, C changed, D deleted}
Pages refreshed: {N}   (skipped {M} hand-edited)
Pages removed:   {N}
New pages:       {N}
Cross-links:     {ok | N broken}
Coverage:        {S/T significant source modules documented (P%); N undocumented}
```

If broken links remain, list them. If a full rebuild ran, defer to its own summary.
