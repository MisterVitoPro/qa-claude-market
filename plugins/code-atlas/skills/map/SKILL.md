---
name: code-atlas:map
description: >
  Scan the repository and generate a comprehensive architecture index as JSON artifacts
  under .code-atlas/. Produces atlas.json (curated summary Claude reads at session start)
  and state.json (internal cache with full import graph, file hashes, raw agent outputs).
  Appends .code-atlas/ to .gitignore if present. Run this once on a new codebase to give
  Claude a head start. Triggers on: map codebase, generate architecture, index the repo,
  document structure, create code map.
argument-hint: "<optional: path to specific directory to map, or leave blank for full repo>"
---

You are orchestrating a Code Atlas scan. Your goal is to produce a comprehensive architecture index as JSON artifacts in `.code-atlas/` so that Claude understands this codebase without exploring it from scratch.

If the user provided a scoping argument: **"{$ARGUMENTS}"** — use it to narrow the scan to that directory. Otherwise, scan the full repository.

This skill writes ONLY to `.code-atlas/` and (once) to `.gitignore`. It does NOT modify CLAUDE.md.

Reference: `plugins/code-atlas/docs/schema-reference.md` defines the exact shape of `atlas.json` and `state.json`.

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
  1. Structure Analyst   (directory map, key files, entry points)
  2. Pattern Analyst     (tech stack, conventions, build commands)
  3. Dependency Analyst  (import graph -- receives COMPLETE data, not samples)

Proceed? (Y/n)
```

If the user passes `--yes` in `{$ARGUMENTS}` or answers anything starting with `y` / `Y` / empty, proceed. If `n`, stop.

Record timestamp: `t_scan_done`.

## Step 2: PARALLEL AGENT SCAN

Print:
```
[Phase 1/3] Deploying 3 Code Atlas agents in parallel...
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
[Phase 2/3] Synthesizing architecture index...
```

**Do NOT launch an agent for this step.** Perform synthesis inline.

### 3a. Assemble atlas.json (curated, capped)

Build `atlas.json` following `docs/schema-reference.md`. Apply the caps:

- `directory_map` ≤ 30 entries. If over, collapse the lowest-level directories into their parent with an entry like `{ "path": "src/lib", "purpose": "N subdirectories (see state.json for full tree)", "category": "source" }`.
- `key_files` ≤ 15
- `high_traffic` ≤ 10 (top by `importer_count` descending)
- `module_boundaries` ≤ 8
- `conventions` ≤ 10
- `build_commands` ≤ 8

Populate `_header` with:

- `schema_version`: 1
- `plugin_version`: "1.2.0"
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
- `raw_agent_outputs`: verbatim JSON from each of the three agents
- `last_run`:
  - `strategy`: "full_scan"
  - `duration_seconds`: `t_write_done - t_start` (computed at end of Step 4; set placeholder 0 here and update after write)
  - `agents_used`: number of agents that returned successfully
  - `files_scanned`: total entries in file_index
  - `files_hashed`: same as files_scanned

Record timestamp: `t_synthesis_done`.

## Step 4: WRITE ARTIFACTS

Print:
```
[Phase 3/3] Writing architecture artifacts...
```

1. Create the `.code-atlas/` directory if it does not exist: `mkdir -p .code-atlas` via Bash.
2. Write `atlas.json` using the Write tool (pretty-printed, 2-space indent).
3. Write `state.json` using the Write tool (pretty-printed, 2-space indent).
4. Update `last_run.duration_seconds` in `state.json` after the writes complete: recompute as current time minus `t_start` and rewrite `state.json`. (One extra Write is acceptable; alternatively, defer the write until after timing is computed.)

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
- Write: `t_write_done - t_synthesis_done`
- Total: `t_write_done - t_start`

```
Code Atlas -- Complete
========================
Artifacts written:
  .code-atlas/atlas.json   ({N} bytes, curated summary)
  .code-atlas/state.json   ({N} bytes, full cache)

Sections in atlas.json:
  - Tech Stack          ({N} tools detected)
  - Directory Map       ({N} directories)
  - Key Files           ({N} files)
  - High Traffic        ({N} modules)
  - Conventions         ({N} rules)
  - Build Commands      ({N} commands)

Phase Timing:
  Scan + Index        {Xm Ys}
  Agent Analysis      {Xm Ys}   (3 Haiku agents in parallel)
  Synthesis           {Xm Ys}   (inline)
  Write               {Xm Ys}
  ────────────────────────
  Total               {Xm Ys}
```

The session-start hook will load atlas.json into context on future sessions.
To update after structural changes: /code-atlas:update
