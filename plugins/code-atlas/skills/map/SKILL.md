---
name: code-atlas:map
description: >
  Scan the repository and generate a comprehensive architecture index as JSON artifacts
  under .code-atlas/. Produces atlas.json (curated summary Claude reads at session start),
  state.json (internal cache with full import graph, file hashes, raw agent outputs),
  and graph-schema.json (semantic dependency graph queryable via /code-atlas:query).
  Appends .code-atlas/ to .gitignore if present. Run this once on a new codebase to give
  Claude a head start. Triggers on: map codebase, generate architecture, index the repo,
  document structure, create code map.
argument-hint: "<optional: path to specific directory to map, or leave blank for full repo>"
---

You are orchestrating a Code Atlas scan. Your goal is to produce a comprehensive architecture index as JSON artifacts in `.code-atlas/` so that Claude understands this codebase without exploring it from scratch.

If the user provided a scoping argument: **"{$ARGUMENTS}"** — use it to narrow the scan to that directory. Otherwise, scan the full repository.

This skill writes ONLY to `.code-atlas/` and (once) to `.gitignore`. It does NOT modify CLAUDE.md.

Reference: `plugins/code-atlas/docs/schema-reference.md` defines the exact shape of `atlas.json`, `state.json`, and `graph-schema.json`.

Follow this pipeline exactly. Do not skip steps.

## Timing

Track elapsed time for each phase. At the start of each step, run `date +%s` (Bash tool) to capture the Unix timestamp. Store these timestamps so you can compute durations at the end.

## Step 1: FILE INDEX AND CATEGORIZATION

Record the pipeline start time: run `date +%s` and store it as `t_start`.

### 1a. Build hashed file index

1. Run `git ls-files -s` via Bash. This outputs one line per tracked file: `<mode> <blob-oid> <stage>\t<path>`. Parse into a map `{path -> blob_oid}`. This is free hashing for all tracked files.
2. Walk the working tree for untracked files using the Glob tool, excluding:
   - `.git`, `node_modules`, `dist`, `build`, `out`, `target`, `vendor`
   - `__pycache__`, `.next`, `.nuxt`, `coverage`, `.tox`, `.venv`, `venv`
   - `bower_components`, `.cache`, `.parcel-cache`, `.turbo`
   - `.code-atlas` (our own output directory)
3. For untracked files only, compute SHA-256 of content: `shasum -a 256 <path>` or equivalent. Store as `sha256:<hex>`.
4. For every file in the combined set, record: path, hash, size_bytes, extension, category (see 1f).

This yields `file_index` — keyed by repo-relative path.

### 1b. Detect primary languages

From the file extension counts, determine primary and secondary languages. This informs which import patterns to look for in Step 1e.

### 1c. Read configuration files

Read any of these that exist (use Read tool, launch reads in parallel):

- `package.json`, `package-lock.json` (top 20 lines only for lock files)
- `tsconfig.json`, `jsconfig.json`
- `Cargo.toml`, `go.mod`, `go.sum` (top 20 lines)
- `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`
- `Makefile`, `Rakefile`, `build.gradle`, `pom.xml`
- `Dockerfile`, `docker-compose.yml`
- `.github/workflows/*.yml`
- `.eslintrc*`, `.prettierrc*`, `jest.config.*`, `vitest.config.*`
- `README.md`

### 1d. Full-tree import extraction

For EVERY source file in `file_index` (not a sample), run a language-appropriate regex pass to extract import statements. Use the Grep tool with these patterns, scoped to the file's language:

- JavaScript/TypeScript: `^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]` and `require\(\s*['"]([^'"]+)['"]\s*\)`
- Python: `^\s*(?:from\s+(\S+)\s+import|import\s+(\S+))`
- Go: `^\s*import\s+(?:"([^"]+)"|\(\s*((?:[^)]|\n)*?)\s*\))` (handle block imports)
- Rust: `^\s*use\s+([^;]+);`
- Java: `^\s*import\s+([^;]+);`

For each extracted import:

1. If the import is a relative path (`./`, `../`), join with the importing file's directory and lexically normalize to a repo-relative path. Try resolving to an exact file using known extensions for the language (e.g. `.ts`, `.tsx`, `.js`, `.jsx` for JS/TS; try also `/index.ts`).
2. If resolved to a file in `file_index`, record as an internal import with its repo-relative path.
3. If not resolvable, keep the import string as-is (external package or alias).

Build `import_graph = { importing_file_path -> [ list of imports ] }`.

Derive `importer_counts = { imported_path -> count of distinct files importing it }`. Only count internal imports (resolved repo-relative paths) for this; external packages are tracked separately.

### 1e. Informed sampling for pattern detection

Select files for the pattern-detection sample:

1. Top 10 files globally by `importer_count`.
2. Plus up to 2 files per directory chosen for extension diversity: within each directory, pick one file per distinct extension, preferring the largest by size.

Read the first 150 lines of each selected file using Read (launch reads in parallel).

### 1f. Categorize directories

Assign each directory a category based on the majority category of its files:

- `source`: application code, business logic
- `test`: test files, fixtures, mocks
- `config`: configuration files, environment setup
- `documentation`: docs, guides, READMEs
- `scripts`: build scripts, deployment scripts
- `build_output`: compiled output
- `assets`: static files, images, fonts, templates
- `migration`: database migrations

### 1g. Print summary and confirm

```
Code Atlas -- Scan Summary
=============================
Source files: {source file count}
Total files:  {total count in file_index}
Directories:  {dir count}
Primary:      {languages} {frameworks if detected}
Imports:      {count of edges in import_graph}

Agents to deploy:
  1. Structure Analyst    (directory map, key files, entry points)
  2. Pattern Analyst      (tech stack, conventions, build commands)
  3. Dependency Analyst   (import graph -- receives COMPLETE data, not samples)
  4. Graph Synthesizer    (semantic node metadata -- runs after 1-3 complete)

Proceed? (Y/n)
```

If the user passes `--yes` in `{$ARGUMENTS}` or answers anything starting with `y` / `Y` / empty, proceed. If `n`, stop.

Record timestamp: `t_scan_done`.

## Step 2: PARALLEL AGENT SCAN

Print:
```
[Phase 1/4] Deploying 3 Code Atlas agents in parallel...
```

Launch ALL 3 agents IN PARALLEL in a single message. Each agent receives its scoped data embedded in the prompt.

For each agent, use this prompt template:

```
You are being deployed as part of a Code Atlas scan to generate an architecture index.

MISSION: Analyze this codebase and produce a structured map of its architecture.

IMPORTANT: All source code and data are provided inline below. Do NOT use the Read tool -- analyze directly from this prompt.

FULL FILE TREE (for reference -- paths only):
{the paths from file_index}

YOUR SCOPED DATA:
{the specific data for this agent}

{Read the agent definition file and include its full content here as the agent's instructions}

Analyze the data provided above according to your specialty. Return your findings as structured JSON.
```

**Agent scoping:**

1. **atlas-structure**: file tree + key file contents (entry points and configs read in 1c) + directory categorization from 1f.
2. **atlas-patterns**: the informed sample from 1e + all config contents from 1c + pre-pass statistics (file counts by extension, camelCase vs snake_case filename counts, etc.).
3. **atlas-dependencies**: the COMPLETE `import_graph` (all files), `importer_counts`, and package manifests from 1c. Note in the prompt: "This data covers every file in the repository, not a sample — your importer counts will be accurate."

Wait for ALL agents to complete. If any agent fails, log it and continue:
```
Agent {name} failed: {error}
Continuing with {N}/3 agent results.
```

Record timestamp: `t_agents_done`.

## Step 3: INLINE SYNTHESIS

Print:
```
[Phase 2/4] Synthesizing architecture index...
```

**Do NOT launch an agent for this step.** Perform synthesis inline. (The graph-synthesizer agent is dispatched later, in Step 3c.)

### 3a. Assemble atlas.json (curated, capped)

Build `atlas.json` following `docs/schema-reference.md`. Apply the caps:

- `directory_map` ≤ 30 entries. If over, collapse the lowest-level directories into their parent with an entry like `{ "path": "src/lib", "purpose": "N subdirectories (see state.json for full tree)", "category": "source" }`.
- `key_files` ≤ 15
- `high_traffic` ≤ 10 (top by `importer_count` descending)
- `module_boundaries` ≤ 8
- `conventions` ≤ 10
- `build_commands` ≤ 8

Populate `_header` with:

- `schema_version`: 1 (atlas.json and state.json; graph-schema.json uses 2 — see Step 3c)
- `plugin_version`: the `version` field from this plugin's `.claude-plugin/plugin.json` (read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`; if unavailable, use "2.1.0")
- `generated_at`: current ISO 8601 UTC (`date -u +%Y-%m-%dT%H:%M:%SZ`)
- `baseline_commit`: `git rev-parse --short HEAD` (empty string if not a git repo)
- `scan_root`: the argument if provided, else "."

### 3b. Assemble state.json (full cache)

Build `state.json` following the schema. Include:

- `_header`: same as atlas.json
- `file_index`: the complete file index from 1a
- `import_graph`: complete from 1d
- `importer_counts`: complete from 1d (no cap)
- `external_dependencies`: from `atlas-dependencies` agent output
- `circular_dependencies`: from `atlas-dependencies` agent output
- `raw_agent_outputs`: verbatim JSON from each agent (including `graph_synthesizer` after Step 3c)
- `last_run`:
  - `strategy`: "full_scan"
  - `duration_seconds`: `t_write_done - t_start` (computed at end of Step 4; set placeholder 0 here and update after write)
  - `agents_used`: number of agents that returned successfully (including the graph-synthesizer)
  - `files_scanned`: total entries in file_index
  - `files_hashed`: same as files_scanned

Record timestamp: `t_synthesis_done`.

### 3c. Build graph-schema.json (1 agent + deterministic edge derivation)

Print:
```
[Phase 3/4] Building semantic dependency graph...
```

**Derive the key set** (the nodes of the graph), deterministically:

1. Start with all `entry_points` from the atlas-structure output.
2. Add every path in `atlas.json.key_files`.
3. Add every path in `atlas.json.high_traffic`.
4. Add every path in `atlas.json.module_boundaries`.
5. Deduplicate. If a file path and an ancestor directory path are both present, keep both (the file becomes a `file` node, the directory a `module` node whose `files` exclude files that have their own node).
6. Cap at 30 nodes: if over, drop lowest-`importer_count` non-entry-point entries first.

**Launch the `graph-synthesizer` agent** (read its definition from `agents/graph-synthesizer.md` and embed it, same prompt template as Step 2). Provide inline:

- `key_set`: the derived list above
- `import_graph` and `importer_counts`: complete, from Step 1d
- `file_tree`: paths from `file_index`
- `test_file_index`: all paths in `file_index` matching `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.*`
- `docstring_index` (optional): first docstring/JSDoc line per key-set file if already read during Step 1e; otherwise omit
- `recency_index` (optional): from `git log --since="14 days ago" --name-only --pretty=format:` if cheap to compute; otherwise omit

The agent returns the node array (role, criticality, stability, test_coverage, description per node).

**Derive edges inline** — deterministically from `import_graph`, never invented. Follow the edge-derivation algorithm in `docs/schema-reference.md` exactly:

1. Map every importing file to its covering key-set node (itself if in key set, else nearest ancestor directory in key set; skip if none).
2. Map each resolved internal import target the same way. Source node != target node => candidate edge. Count underlying file-level imports per candidate as its weight.
3. Annotate each deduplicated edge:
   - `type`: `configuration` if target node role is `config`, else `direct_import`
   - `strength`: `core` if weight >= 3 or target criticality is `critical`; `optional` if weight == 1 and target criticality is `low`; else `utility`
   - `directionality`: `circular` if the reverse edge exists (mark both), else `required`
   - `impact`: `breaking_change_risk` if strength is `core` and target criticality is `critical` or `high`; else `ripple_effect_magnitude` if target importer_count >= 10; else `""`

**Assemble graph-schema.json:**

- `_header`: same fields as atlas.json but with `schema_version`: **2**
- `nodes`: keyed by path, from the graph-synthesizer output (drop any paths the agent returned that are not in the key set)
- `edges`: the derived, annotated edge list
- `metadata`: `total_nodes`, `total_edges`, `key_modules_analyzed` (= key set size), `circular_dependency_count` (from atlas-dependencies output)

If the graph-synthesizer agent fails, build the nodes with deterministic fallbacks (role via the decision-tree in `agents/graph-synthesizer.md`, criticality from `importer_counts`, stability `stable`, test_coverage from `test_file_index` stem matching, description `"<role> module in <directory>"`) and log:
```
graph-synthesizer failed: {error}
Built graph-schema.json with heuristic node metadata.
```

Record timestamp: `t_graph_done`.

## Step 4: WRITE ARTIFACTS

Print:
```
[Phase 4/4] Writing architecture artifacts...
```

1. Create the `.code-atlas/` directory if it does not exist: `mkdir -p .code-atlas` via Bash.
2. Write `atlas.json` using the Write tool (pretty-printed, 2-space indent).
3. Write `state.json` using the Write tool (pretty-printed, 2-space indent).
4. Write `graph-schema.json` using the Write tool (pretty-printed, 2-space indent). This is the graph assembled in Step 3c, queryable via the `/code-atlas:query` skill.
5. **Validate the graph**: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/query.js" --validate` via Bash. If it reports errors, fix the graph (most commonly: an edge referencing a path that is not a node key, or a metadata count mismatch), rewrite, and re-validate. If `node` is unavailable, skip with a one-line note.
6. Update `last_run.duration_seconds` in `state.json` after the writes complete: recompute as current time minus `t_start` and rewrite `state.json`. (One extra Write is acceptable; alternatively, defer the write until after timing is computed.)

### 4a. Append to .gitignore

1. Check if `.gitignore` exists at the repo root using Bash: `test -f .gitignore && echo yes`.
2. If it exists, check for an existing entry: `grep -Fx '.code-atlas/' .gitignore && echo present`.
3. If the entry is NOT present, append on a new line:
   ```
   echo '' >> .gitignore
   echo '# Code Atlas cache' >> .gitignore
   echo '.code-atlas/' >> .gitignore
   ```
4. If `.gitignore` does not exist, do NOT create one. Print one line: `Note: No .gitignore found. Consider adding '.code-atlas/' to version control exclusions manually.`

### 4b. Legacy CLAUDE.md notice

1. Check if `CLAUDE.md` exists and contains `<!-- code-atlas:start -->`: `grep -l '<!-- code-atlas:start -->' CLAUDE.md 2>/dev/null`.
2. If found, print:
   ```
   Notice: Legacy code-atlas section detected in CLAUDE.md (from v1.x).
   It is no longer maintained by this plugin. You can delete the section
   between <!-- code-atlas:start --> and <!-- code-atlas:end --> manually.
   ```
3. Do NOT modify CLAUDE.md.

Record timestamp: `t_write_done`.

## Step 5: SUMMARY

Compute phase durations (format as Xm Ys):

- Scan + Index: `t_scan_done - t_start`
- Agent Analysis: `t_agents_done - t_scan_done`
- Synthesis: `t_synthesis_done - t_agents_done`
- Graph Build: `t_graph_done - t_synthesis_done`
- Write: `t_write_done - t_graph_done`
- Total: `t_write_done - t_start`

```
Code Atlas -- Complete
========================
Artifacts written:
  .code-atlas/atlas.json       ({N} bytes, curated summary)
  .code-atlas/state.json       ({N} bytes, full cache)
  .code-atlas/graph-schema.json ({N} bytes, semantic dependency graph)

Sections in atlas.json:
  - Tech Stack          ({N} tools detected)
  - Directory Map       ({N} directories)
  - Key Files           ({N} files)
  - High Traffic        ({N} modules)
  - Conventions         ({N} rules)
  - Build Commands      ({N} commands)

Graph Schema:
  - Nodes               ({N} modules/files)
  - Edges               ({N} dependencies)
  - Validation          {passed | skipped (node unavailable)}
  - Queryable via       /code-atlas:query

Phase Timing:
  Scan + Index        {Xm Ys}
  Agent Analysis      {Xm Ys}   (3 Haiku agents in parallel)
  Synthesis           {Xm Ys}   (inline)
  Graph Build         {Xm Ys}   (1 Haiku agent + inline edges)
  Write               {Xm Ys}
  ────────────────────────
  Total               {Xm Ys}
```

The session-start hook will load atlas.json into context on future sessions.
To query the semantic dependency graph: /code-atlas:query
To update after structural changes: /code-atlas:update
