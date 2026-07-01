---
name: llm-wiki:generate
description: >
  Generate a navigable, multi-page Markdown wiki for this codebase under .llm-wiki/.
  Builds a shared substrate once (reusing a code-atlas index when present, else self-scanning),
  plans a file-disjoint page set, fans out writer agents in parallel waves to author one page
  each, derives Mermaid diagrams from the dependency graph, then synthesizes a session-loaded
  index with validated cross-links and a provenance cache for incremental updates. Pages are
  committed; the state cache is gitignored. Triggers on: build wiki, generate docs, document
  the codebase, create a knowledge base, wiki the repo, onboarding docs.
argument-hint: "<optional: subdirectory to scope, --review for an accuracy pass, --llms-full to also emit llms-full.txt, --yes to skip confirm>"
---

You are orchestrating an llm-wiki generation run. Your goal is to produce a navigable, human-and-agent-readable Markdown wiki under `.llm-wiki/` so Claude can read one page per task instead of re-exploring the repo, and so new engineers can onboard.

User arguments: **"{$ARGUMENTS}"**
- A bare path scopes the scan to that subdirectory (else the full repo).
- `--llms-full` also emits `.llm-wiki/llms-full.txt` (all pages concatenated).
- `--yes` skips the confirmation prompt.

This skill writes ONLY under `.llm-wiki/` and (once) appends one line to `.gitignore`. It does NOT modify CLAUDE.md.

Reference: `plugins/llm-wiki/docs/schema-reference.md` defines the exact shape of `index.md`, page frontmatter, and `state.json`.

Follow this pipeline exactly. Do not skip steps.

## Timing

At the start of each phase, run `date +%s` (Bash) and store the timestamp so you can report phase durations at the end. If `date` is unavailable, skip timing silently.

## Step 1: SETUP -- BUILD THE SHARED SUBSTRATE (inline, no agents)

Record `t_start` (`date +%s`).

### 1a. Detect git

Run `git rev-parse --short HEAD` via Bash. If it fails, git is absent/this is not a repo: set `baseline_commit = ""`, and later skip the `.gitignore` and hash steps that need git (fall back to content hashing via `shasum`/`sha256sum` for provenance).

### 1b. Build the hashed file index

1. If git is present, run `git ls-files -s` -> parse `<mode> <blob-oid> <stage>\t<path>` into `{ path -> blob_oid }`. Free hashing for tracked files.
2. Walk untracked/working-tree files with Glob, excluding: `.git`, `node_modules`, `dist`, `build`, `out`, `target`, `vendor`, `__pycache__`, `.next`, `.nuxt`, `coverage`, `.venv`, `venv`, `.cache`, `.turbo`, `.llm-wiki`, `.code-atlas`.
3. For untracked files (or all files if no git), hash content with `shasum -a 256 <path>` (or `sha256sum`); store as `sha256:<hex>`.
4. Record per file: path, hash, size_bytes, lang (from extension), category. This is `file_index`.

### 1c. Reuse a code-atlas index if present (the preferred path)

Check for `.code-atlas/atlas.json` and `.code-atlas/graph-schema.json` via Bash (`test -f`).

- **If present:** Read both. Use them as the substrate ground truth -- set `substrate_source = "atlas"`. From `atlas.json` take: `tech_stack`, `architecture_pattern`, `directory_map`, `key_files`, `high_traffic`, `module_boundaries`, `external_dependencies`, `build_commands`. From `graph-schema.json` take the `nodes` (with role/criticality) and `edges` -- this is the diagram and dependency ground truth. Do NOT recompute the import graph; the atlas already has it.
  - **Schema tolerance:** atlas artifacts vary by the code-atlas version that produced them (check `_header.plugin_version`). Older schemas differ in shape -- e.g. `tech_stack` may be an array of `{category, tools}` rather than an object; `module_boundaries` entries may be `{name, modules, responsibility}` rather than `{path, type, description}`; `high_traffic` entries may carry a `role` string instead of a description; and `graph-schema.json` may be absent entirely. Map fields by MEANING, not exact key, and tell the planner and diagram author the concrete shape you found so they adapt. If `graph-schema.json` is missing, plan and diagram from `module_boundaries` + `high_traffic` + `directory_map` at subsystem granularity (coarser, but still grounded).
- **If absent:** set `substrate_source = "scan"` and self-scan: detect primary languages from extension counts; read manifests/config (`package.json`, `tsconfig.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Makefile`, `Dockerfile`, `.github/workflows/*`, `README.md`) in parallel; treat each significant top-level source directory as a module boundary; do a light import-extraction pass (Grep) over source files to get an `import_graph` and `importer_counts` for the diagram author. Keep this lean -- if the user wants a richer graph, suggest running `/code-atlas:map` first.

### 1d. Print substrate summary and confirm

```
llm-wiki -- Generation Plan
=============================
Substrate:    {atlas | self-scan}
Source files: {count}
Modules:      {module boundary count}
Primary:      {languages/frameworks}

Pipeline:
  1. Wiki Planner       (page set + file-disjoint waves)
  2. Diagram Author     (Mermaid from the dependency graph)
  3. Page Writers       (1 agent per page, <=6 per wave, parallel)
  4. Index Synthesizer  (nav index + cross-link validation)

Proceed? (Y/n)
```

If `--yes`, or the user answers empty / starting with `y`/`Y`, proceed. If `n`, stop. Record `t_setup_done`.

## Step 2: PLAN (1 agent, foreground)

Print `[Phase 1/4] Planning the wiki...`.

Dispatch the **wiki-planner** agent (read `agents/wiki-planner.md` and embed its full content as instructions, same inline-data convention as below). Provide inline: the file tree (paths), the module boundaries, `key_files`, `high_traffic`, `tech_stack`, and -- if `substrate_source == "atlas"` -- the graph nodes with criticality. Tell it whether the substrate is `atlas` or `scan`.

It returns the page plan: `pages[]` (each with page_id, title, type, writer, output_path, summary, tags, source_files, section_outline, related, depends_on, wave), `diagrams_needed`, `nav_tree`, and `project_summary`. Validate: every `source_files` path exists in `file_index`; page_ids are unique; no wave exceeds 6 pages. Drop or fix any invalid entry. Record `t_plan_done`.

## Step 3: DIAGRAMS (1 agent, foreground)

Print `[Phase 2/4] Deriving diagrams...`.

Dispatch the **wiki-diagram-author** agent. Provide inline: `diagrams_needed`, the dependency graph (atlas `nodes`+`edges` if present, else the extracted `import_graph`/`importer_counts`), the module/criticality list, and `project_summary`. It returns `diagrams[]` keyed by `page_id`.

Index the returned diagrams by `page_id` so each can be threaded into the owning writer's prompt in Step 4. If the agent fails or returns nothing, continue without diagrams (pages are still written). Record `t_diagrams_done`.

## Step 4: WRITE PAGES (parallel waves)

Print `[Phase 3/4] Writing pages...`.

### Backend detection

Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`. If `=1`, you may use the Agent Teams backend (lead + teammates self-claiming page tasks, reading results from the task list without pulling every page's full JSON into lead context). Otherwise use the subagent backend (`Agent` tool, `run_in_background: true`, await completions). Either way the wave/file-ownership rules below are identical.

### Per wave

Process waves in ascending `wave` order. For each wave, **launch ALL of that wave's writer agents IN PARALLEL in a single message**. For each page, dispatch its `writer` (`wiki-overview-writer` or `wiki-module-writer`; read the matching `agents/*.md` and embed it, or pass its absolute path for the agent to read) with a prompt containing:

```
You are writing ONE page of an llm-wiki for this repository.

REPO ROOT: {absolute repo root}
PAGE: {page_id} -- "{title}" (type: {type})
OWNED OUTPUT FILE (write ONLY this, absolute path): {repo root}/{output_path}
SUMMARY: {summary}
TAGS: {tags}
SECTION OUTLINE: {section_outline}
ALL VALID PAGE SLUGS (cross-link as `slug.md`): {every page_id in the plan}
RELATED PAGES: {related}
SUBSTRATE SOURCE: {atlas | scan}
PROJECT SUMMARY: {project_summary}
TECH STACK: {one-line tech summary}

SOURCE FILES (Read these yourself, capped ~400 lines each, head/middle/tail for larger):
{the list of source_files paths for this page}

DIAGRAMS TO EMBED (verbatim, in a ```mermaid fence):
{any diagram blocks for this page_id from Step 3, else "none"}

{the full wiki-overview-writer.md or wiki-module-writer.md content}
```

**Pass source files as PATHS, not inlined contents.** Each writer reads only its own scoped `source_files` directly with the Read tool (bounded, parallel-safe) -- inlining every source file into prompts does not scale beyond small repos, and a writer reading its own ~4-8 files keeps each agent's context small. Writers may also Read a sibling file or list a directory to ground a claim, but must not crawl the whole repo. Each writer writes its single owned `.md` page and returns a status JSON. Wait for the whole wave to finish before starting the next (per-wave barrier). If a writer fails, log `Page {id} failed: {error}` and continue; record the page as missing.

```
Wave {n}/{total}: {k} pages written ({m} failed)
```

Record `t_writers_done` after the last wave.

## Step 4b: ACCURACY REVIEW (optional, only when `--review` is passed)

Skip this entire step unless the user passed `--review`. It roughly doubles agent count, so it is opt-in -- but it is the strongest guard against a confidently-wrong page, which misleads every agent that later trusts the wiki.

1. Dispatch the **wiki-reviewer** agent (read `agents/wiki-reviewer.md` and embed it) once per written page, in parallel waves of <=6. Give each only its `page_id`, `output_path`, and declared `source_files`; the reviewer reads the page and those sources itself and returns findings JSON (verdict, `unsupported_count`, `findings[]` with severity/category/evidence).
2. Collect findings. For every page with a `high`-severity `unsupported` or `contradicted` finding, **re-dispatch that page's writer** (`wiki-overview-writer`/`wiki-module-writer`) with the original page spec PLUS the reviewer's findings appended as "CORRECT THESE INACCURACIES", so it rewrites its one owned file grounded correctly. Re-review the rewritten page once; do not loop more than twice per page.
3. Keep a tally for the summary: pages reviewed, pages with issues, high-severity claims corrected. Pages with only `low` findings are left as-is but logged.

Record `t_review_done` (only if review ran).

## Step 5: SYNTHESIZE INDEX (1 agent, foreground)

Print `[Phase 4/4] Building the index...`.

Dispatch the **wiki-index-synthesizer** agent. Provide inline: `project_summary`, `nav_tree`, the full planned page list, every writer's returned status JSON, the one-line tech summary, `baseline_commit`, `generated_at` (`date -u +%Y-%m-%dT%H:%M:%SZ`), `plugin_version` (read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, else `0.1.0`), and `generated_from` (= `substrate_source`).

It writes `.llm-wiki/index.md` and returns `pages` (provenance map), `nav_tree`, and `broken_links`. If it fails, build a minimal `index.md` inline as a fallback (header frontmatter + a flat bulleted list of every written page grouped by type) and synthesize the `pages` map yourself from the writer outputs. Record `t_index_done`.

## Step 6: WRITE STATE CACHE + EXPORTS (deterministic)

Do NOT hand-assemble `state.json`, hashes, backlinks, or `llms.txt` -- the bundled
`scripts/finalize.js` derives all of that deterministically from the pages on disk
and the repo (git blob OIDs for tracked files, sha256 otherwise). The LLM only
supplies the values that are not derivable from disk.

0. **Normalize citations first** -- run `node "${CLAUDE_PLUGIN_ROOT}/scripts/normalize-citations.js" --wiki .llm-wiki`. Writers sometimes cite an abbreviated `path:line` (e.g. `downtime/types.rs:9` or an ellipsis `.../loot.rs:21`) instead of a full repo-relative path; this rewrites each to the unique matching repo file BEFORE hashing -- so `content_hash` reflects final content and the validator's citation check stays clean. It only rewrites unambiguous suffix matches and reports any it leaves alone (those become validate.js warnings for a human to fix). Run this before finalize.
1. Ensure `.llm-wiki/` exists (`mkdir -p .llm-wiki`).
2. Write a small JSON file (e.g. `.llm-wiki/.finalize-input.json`, or a temp path) with the
   non-derivable values:
   ```json
   {
     "repoRoot": "<absolute repo root>",
     "commit": "<git rev-parse --short HEAD, or empty>",
     "generatedAt": "<date -u +%Y-%m-%dT%H:%M:%SZ>",
     "pluginVersion": "<version from ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json, else 0.1.0>",
     "project": "<project name>",
     "summary": "<project_summary>",
     "techSummary": "<one-line tech summary>",
     "substrate": "<atlas | scan>",
     "strategy": "full",
     "agentsUsed": <count>,
     "optionalIds": ["glossary", "<low-priority page ids>"],
     "navTree": <the synthesizer's nav_tree>
   }
   ```
3. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/finalize.js" --wiki .llm-wiki --input <that file>` (add `--llms-full` if the user passed `--llms-full`). This writes `.llm-wiki/state.json` (file_index, per-page `source_hashes` + `content_hash` + computed `backlinks`, provenance) and `.llm-wiki/llms.txt` (and `llms-full.txt`). It prints any `missing source` warnings -- surface them. Delete the temp input file afterward.
4. If `node` is unavailable, fall back to assembling `state.json` and `llms.txt` by hand per `docs/schema-reference.md` (last resort only).

### 6a. Append to .gitignore (only the cache + full export)

The wiki pages and index ARE meant to be committed; only the cache and the heavy full export are ignored.
1. `test -f .gitignore && echo yes`.
2. If it exists and lacks the entries, append:
   ```
   echo '' >> .gitignore
   echo '# llm-wiki cache (the wiki pages themselves are committed)' >> .gitignore
   echo '.llm-wiki/state.json' >> .gitignore
   echo '.llm-wiki/llms-full.txt' >> .gitignore
   ```
3. If `.gitignore` does not exist, do NOT create one. Print: `Note: No .gitignore found. Add '.llm-wiki/state.json' to your VCS exclusions manually.`

### 6b. Validate (deterministic gate)

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.js" .llm-wiki` via Bash. This deterministically checks: every page's frontmatter and `type`/`status` enums; that every cross-link (frontmatter `related` + body links) and every index link resolves to a real page; that `index.md` `page_count`/`broken_link_count` are honest; that every Mermaid block has a known diagram type, balanced brackets, and a closed fence; and that `state.json`/`llms.txt` are well-formed.

- If it reports ERRORs, FIX them and re-run until clean: a dangling link means a writer referenced a slug that was never written (drop or repoint the link); a Mermaid error means re-emit that block; a `page_count` mismatch means re-run the synthesizer or correct the index header. Do NOT finish with outstanding errors -- a wiki that fails validation will mislead the agent that loads it.
- WARNINGs (stub pages, an unlinked page, a `state.json` source file that no longer exists) are advisory; surface them in the summary but they do not block.
- If `node` is unavailable, skip with a one-line note.

### 6c. Coverage report (no silent caps)

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/coverage.js" --wiki .llm-wiki`. This reads
`state.json` and reports which significant source modules (directories with >= 3 source
files) have no owning wiki page -- the modules the page cap left undocumented. Capture
its output for the summary. It is advisory (always exits 0), but you MUST surface it:
silently dropping modules makes the wiki look complete when it is not. If many high-value
modules are undocumented, tell the user they can raise the page cap or run a scoped
`/llm-wiki:generate <subdir>` to document them.

Record `t_write_done`.

## Step 7: SUMMARY

Compute phase durations (`Xm Ys`). Print (include the coverage line from Step 6c):

```
llm-wiki -- Complete
======================
Artifacts:
  .llm-wiki/index.md        ({N} pages indexed)
  .llm-wiki/pages/          ({N} pages, {M} stubs)
  .llm-wiki/state.json      (provenance cache, gitignored)
  .llm-wiki/llms.txt        (agent-facing index export)
  {.llm-wiki/llms-full.txt  (if --llms-full)}

Cross-links:     {ok | N broken -- listed below}
Coverage:        {S/T significant source modules documented (P%); N undocumented}
{Review:          {P reviewed, I had issues, H high-severity claims corrected}   (only if --review ran)}
Substrate:       {code-atlas index | self-scan}

Phase Timing:
  Setup + Index    {Xm Ys}
  Plan             {Xm Ys}
  Diagrams         {Xm Ys}
  Page Writers     {Xm Ys}   ({N} pages across {W} waves)
  Index + Write    {Xm Ys}
  ----------------------------
  Total            {Xm Ys}
```

List any `broken_links` so the user can fix them. The SessionStart hook will load `index.md` into context on future sessions. To refresh after code changes: `/llm-wiki:update`.

If the substrate was a self-scan, note: `Tip: run /code-atlas:map first for a richer dependency graph; llm-wiki will reuse it.`
