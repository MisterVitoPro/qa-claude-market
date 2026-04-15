---
name: code-atlas:update
description: >
  Incrementally update the architecture index in .code-atlas/. Detects changes via
  file-hash diffing against state.json (resilient to rebases and branch switches) and
  updates only what changed. Pass "full" to force a complete re-scan. Triggers on:
  update architecture, refresh code map, sync architecture index.
argument-hint: "<optional: 'full' to force complete re-scan>"
---

You are performing an incremental update of the Code Atlas architecture index.

Arguments: **"{$ARGUMENTS}"**

Reference: `plugins/code-atlas/docs/schema-reference.md` defines the shape of `atlas.json` and `state.json`.

This skill reads and writes ONLY to `.code-atlas/`. It does NOT modify CLAUDE.md.

## Step 1: LOAD BASELINE

1. Check if `.code-atlas/state.json` exists. If not, print:
   ```
   No Code Atlas state found. Run /code-atlas:map to generate the initial index.
   ```
   Then STOP.

2. Read `.code-atlas/state.json`. Parse the JSON.

3. Check `_header.schema_version`. If it is not `1`:
   ```
   Schema version {N} is not supported by plugin v1.2.0.
   Running full re-scan...
   ```
   Invoke the full `/code-atlas:map` pipeline (Steps 1-5 from the map skill) and STOP.

4. Extract from state.json:
   - `_header.baseline_commit` -> stored_commit
   - `file_index` -> baseline_index

## Step 2: COMPUTE CURRENT INDEX

Perform the same file-index build as Step 1a of the map skill:

1. Run `git ls-files -s`. Parse into `{path -> blob_oid}`.
2. Walk untracked files (excluding the exclusion list + `.code-atlas`). Compute SHA-256 for each.
3. Build `current_index` keyed by path with the same fields as `baseline_index`.

## Step 3: HASH DIFF

Compare `baseline_index` and `current_index`:

- `added` = paths in current not in baseline
- `deleted` = paths in baseline not in current
- `changed` = paths in both where `hash` differs
- `renamed` (optional heuristic): if a deleted path and an added path share the same hash, count as rename. If this heuristic is not implemented, they count as one delete + one add.

Print:
```
Code Atlas -- Change Detection
================================
Baseline:  {stored_commit} ({N} files)
Current:   {current_commit} ({N} files)

Added:     {N} files
Deleted:   {N} files
Changed:   {N} files
Renamed:   {N} files
```

If all counts are zero AND `current_commit == stored_commit`:
```
Architecture index is up to date.
```
STOP.

## Step 4: DECIDE STRATEGY

Evaluate these rows in order; first match wins.

### Strategy A: Micro-Update (no agents)

**Conditions (ALL must hold):**

- Fewer than 5 changed source files in total (added + deleted + changed, excluding documentation, assets, build_output categories)
- No added top-level source directories
- No deleted top-level source directories
- The `full` argument was NOT passed

**Action:**

1. For each file in `added` and `changed`: re-extract imports using the same regex pass as map Step 1d. Update `state.json.import_graph` for those paths.
2. For each file in `deleted`: remove its entry from `state.json.import_graph` and decrement `importer_counts` for every path it imported.
3. Recompute `importer_counts` from the updated `import_graph` (full pass -- cheap).
4. Update `state.json.file_index` with the new entries.
5. Update `atlas.json`:
   - Recompute `high_traffic` top-10 from new `importer_counts`.
   - Update `directory_map` for any added/deleted directories (add a default "source" entry for new ones, remove entries for deleted ones).
   - Update `key_files` if any added file matches an entry-point or config filename pattern; remove entries for deleted key files.
6. Update both files' `_header.generated_at` and `_header.baseline_commit`.
7. Update `state.json.last_run`:
   - `strategy`: "micro"
   - `agents_used`: 0
   - `files_scanned`: size of `current_index`
   - `files_hashed`: same
   - `duration_seconds`: elapsed time
8. Write both files.
9. Print:
   ```
   Micro-update complete. {N} files re-indexed, no agents needed.
   ```

### Strategy B: Targeted Update (1 agent)

**Conditions (ANY):**

- 5 to 30 changed files (inclusive)
- Exactly 1 or 2 new top-level directories
- NOT superseded by Strategy C conditions

**Action:**

1. Perform all Micro-Update work above (imports, importer_counts, file_index).
2. Launch the `atlas-structure` agent scoped to the changed areas:
   - Provide the full `current_index` paths for context
   - Embed the contents of new/changed files (read first 200 lines each)
   - Read agent definition from `agents/atlas-structure.md`
3. Merge agent output with existing `state.json.raw_agent_outputs.atlas_structure`:
   - Add new directory annotations
   - Remove deleted directory annotations
   - Update `key_files` from agent output
4. Update `atlas.json.directory_map`, `atlas.json.key_files`, and `atlas.json.module_boundaries` from the merged output (applying caps).
5. Update `state.json.last_run`:
   - `strategy`: "targeted"
   - `agents_used`: 1
6. Write both files.
7. Print:
   ```
   Targeted update complete. Re-analyzed {N} changed areas.
   ```

### Strategy C: Full Re-scan (3 agents)

**Conditions (ANY):**

- More than 30 changed files total
- 3 or more new top-level source directories
- `full` argument was passed
- `_header.schema_version` in state.json did not equal 1 (handled in Step 1)

**Action:**

Run the full `/code-atlas:map` pipeline (Steps 1-5 from the map skill). This overwrites both artifacts.

## Step 5: SUMMARY

```
Code Atlas -- Update Complete
================================
Strategy:    {Micro | Targeted | Full}
Baseline:    {stored_commit} -> {current_commit}
Changes:     {N} added, {N} deleted, {N} changed, {N} renamed

{If agents were used:}
Agents:      {N}
Time:        {Xm Ys}

.code-atlas/atlas.json and .code-atlas/state.json are now current.
The session-start hook will load the updated atlas.json next session.
```
