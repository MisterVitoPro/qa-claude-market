---
name: jupiter:adopt
description: >
  Adopt scattered spec files into a canonical docs/master-spec/ tree organized
  by module (multi-module repos) or feature (single-module). Emits index.json
  with split-candidate flags and appends auto-generated stubs for undocumented
  public surface found in code. Incremental on re-run; --force wipes first.
argument-hint: "[--force] [--deep]"
---

You are orchestrating the Jupiter adopt pipeline. Follow these steps exactly.

## Step 0: Parse arguments

Parse `$ARGUMENTS`:
- `--force`: set `force = true`, otherwise `false`.
- `--deep`: set `deep = true`, otherwise `false`.
- Any other token: print usage and STOP.

Usage:
```
/jupiter:adopt [--force] [--deep]
  --force   Delete docs/master-spec/ and rebuild from scratch (prompts first).
  --deep    Enable behavioral-gaps pass (pass D) in the surface scanner.
```

## Step 1: Pre-flight

### 1a. Working tree check

Run `git status --porcelain`. If output is non-empty:

```
Warning: working tree has uncommitted changes:
<output>

Jupiter commits on completion. Recommend: commit or stash first.
Continue anyway? (Y/n)
```

Default N. On N, STOP.

### 1b. Detect incremental vs fresh

Check whether `docs/master-spec/index.json` exists.

- If yes and `force == false`: set `incremental = true`; read the existing index, extract `generated_at` into `index_generated_at`, and extract the set of adopted basenames by walking every `buckets[*].files[].path` (the last path segment is the basename).
- If yes and `force == true`: prompt

  ```
  --force will delete docs/master-spec/ and rebuild from scratch.
  All manually edited content inside that tree will be lost.
  Delete and rebuild? (y/N)
  ```

  Default N. On N, STOP. On y, `rm -rf docs/master-spec/` and proceed with `incremental = false`.
- If no and `force == true`: print `--force: no existing master-spec to wipe; proceeding as fresh adopt.` and set `incremental = false`.
- If no and `force == false`: `incremental = false`.

### 1c. Ensure `docs/` exists

```bash
mkdir -p docs
```

### 1d. Module detection

Evaluate these signals in order. The first matching signal decides `mode = "module"`:

1. Two or more `package.json` files exist outside the repo root: `find . -name package.json -not -path './package.json' -not -path './node_modules/*' | wc -l` >= 2
2. Two or more `plugin.json` files exist anywhere: `find . -name plugin.json -not -path './node_modules/*' | wc -l` >= 2
3. A `pnpm-workspace.yaml`, `lerna.json`, or Cargo workspace declaration with >= 2 members exists
4. Two or more top-level directories each contain their own package manifest (`package.json`, `plugin.json`, `Cargo.toml`, `pyproject.toml`, etc.)

If none match, `mode = "feature"`.

Print: `Module detection: <mode> (signal: <which signal matched, or "no signal matched">)`.

### 1e. Enumerate detected modules

Compute `detected_modules`, an ordered list of `{name, path}` objects:

- `mode == "module"`: for each directory matching any signal above, take its basename as `name` and its repo-relative path as `path`. If any `*.md` file exists at the repo root or directly under `docs/` (not under `docs/master-spec/`), also add `{"name": "shared", "path": "."}`.
- `mode == "feature"`: `[{"name": "main", "path": "."}]` (a single module covering the whole repo).

Print: `Modules: <comma-joined list of names>`.

## Step 2: Dispatch cataloger

Dispatch ONE `jupiter-spec-cataloger` agent in the foreground.

Prompt (inline the full text):

```
You are being deployed as the jupiter-spec-cataloger.

mode: <mode>
root: <absolute repo root>
glob_targets: ["docs/**/*.md", "plugins/*/docs/**/*.md", "plugins/*/README.md", "README.md"]
already_adopted: <list from 1b, or [] if fresh>
index_generated_at: <from 1b, or null if fresh>

<inline the full content of plugins/jupiter/agents/jupiter-spec-cataloger.md here>

Return only the JSON catalog, nothing else.
```

Parse the response as JSON. Validate against `plugins/jupiter/schemas/catalog.schema.json`:

```bash
python -c "
import json, sys, jsonschema
schema = json.load(open('plugins/jupiter/schemas/catalog.schema.json'))
data = json.loads(sys.stdin.read())
jsonschema.validate(data, schema)
print('OK')
" <<< "<agent output>"
```

On parse failure: retry ONCE with

```
Your previous response could not be parsed as JSON against catalog.schema.json.
Return ONLY a JSON object matching that schema, no prose, no code fences.
```

On second failure: print the raw output and STOP.

On validation failure: print the offending JSONPath and failing value, then STOP.

## Step 3: Dispatch surface scanner

Use `detected_modules` (from Step 1e) verbatim as the `modules` input. This includes modules that had no specs, so their surface still gets scanned and a `_surface.md` can be generated for them.

Dispatch ONE `jupiter-surface-scanner` agent in the foreground.

Prompt:

```
You are being deployed as the jupiter-surface-scanner.

modules: <JSON list>
deep: <bool>
root: <absolute repo root>

<inline the full content of plugins/jupiter/agents/jupiter-surface-scanner.md here>

Return only the JSON inventory, nothing else.
```

Parse + validate against `plugins/jupiter/schemas/surface.schema.json`. Same retry/STOP policy as Step 2.

## Step 4: Write phase

Compute the bucket iteration set: `all_buckets = union(keys(catalog.proposed_layout), detected_modules[].name)`. A bucket may have zero specs (from `proposed_layout`) and still appear in `all_buckets` if it was a detected module -- in which case step 4b is a no-op for that bucket but step 4c/4d still runs against its surface inventory.

For each bucket in `all_buckets`:

### 4a. Ensure bucket directory

- `mode == "module"`: `mkdir -p docs/master-spec/<bucket>/`
- `mode == "feature"`: `mkdir -p docs/master-spec/features/<bucket>/`

The leaf target path for each spec is:
- `mode == "module"`: `docs/master-spec/<bucket>/<basename>`
- `mode == "feature"`: `docs/master-spec/features/<bucket>/<basename>`

### 4b. Move specs

For each spec path in `catalog.proposed_layout[<bucket>]` (may be an empty list, in which case this step is a no-op for this bucket):

- If `incremental == true` and the spec is already under `docs/master-spec/`, skip the move.
- Compute the target path.
- If target already exists AND points to a different source, rename incoming to `<basename>-2.<ext>` (then `-3`, etc. until no collision). Log: `warn: collision at <target>, renamed incoming to <new-name>`.
- Run: `git mv <source> <target>`

### 4c. Append or refresh surface stubs

For each bucket, iterate the union of `surface.per_module[<bucket>].public_surface` + `surface.per_module[<bucket>].configs` + (if `deep`) `surface.per_module[<bucket>].behavioral_gaps`:

1. For each entry, find the best-matching spec file in that bucket:
   - Score = count of shared topic keywords (case-insensitive) between the spec's `topics` (from the catalog) and the entry's `one_line_summary` split into words + the entry's `name`.
   - Take the spec with the highest score. Ties broken by smallest `loc`.
   - Require score >= 2 to qualify. If no spec qualifies, collect the entry for `_surface.md` (see step 4d).
2. For each qualifying spec, open the file and locate the bounded block:

   ```
   <!-- jupiter:surface-begin -->
   ## Undocumented surface (auto-generated)

   ...

   <!-- jupiter:surface-end -->
   ```

   - If both markers exist: replace the content between them with the fresh list.
   - If neither marker exists: append a new marked block at end of file.
   - If only one marker exists: log `warn: corrupt markers in <path>; skipping surface append`.
3. The rendered content between markers:

   ```
   <!-- jupiter:surface-begin -->
   ## Undocumented surface (auto-generated)

   - **<name>** (`<location>`) - <one_line_summary> <!-- TODO: expand -->
   - **<name>** (`<location>`) - <one_line_summary> <!-- TODO: expand -->
   ...

   <!-- jupiter:surface-end -->
   ```

### 4d. Fallback surface file

If any entries were unmatched in step 4c step 1, write them to `<bucket-dir>/_surface.md`:

```
# Surface gaps for <bucket>

These symbols were found in code but could not be matched to an existing spec.

<!-- jupiter:surface-begin -->
## Undocumented surface (auto-generated)

- **<name>** (`<location>`) - <one_line_summary> <!-- TODO: expand -->
...

<!-- jupiter:surface-end -->
```

If `_surface.md` already exists, apply the same marker-bounded replace/append logic as step 4c.

## Step 5: Write index.json

Compute `docs/master-spec/index.json` from the catalog + surface data:

- `generated_at`: current ISO 8601 timestamp
- `jupiter_version`: read from `plugins/jupiter/.claude-plugin/plugin.json#version`
- `mode`: from Step 1
- `root`: `"docs/master-spec/"`
- `buckets[<name>]`: emit an entry for every bucket in `all_buckets`. A bucket with no specs (e.g., gamma in the multi-module fixture) still appears, with `summary = "surface-only bucket; <K> undocumented entries"` and `files: []` plus one entry for `_surface.md` (see below).
  - `summary`: for buckets that have specs, synthesize from the top 3 topics of the bucket's specs (joined with " / "). For surface-only buckets, use the string `"surface-only bucket; <K> undocumented entries"`.
  - `files[]`: for each spec in the bucket, emit
    ```json
    {
      "path": "<bucket>/<basename>",  // or "features/<bucket>/<basename>"
      "loc": <from catalog>,
      "topics": <from catalog>,
      "sections": <catalog.headings list>,
      "split_candidate": <bool>,
      "split_reason": "<string or absent>",
      "cross_refs": <from catalog>
    }
    ```
    Additionally, if `_surface.md` was written for this bucket (step 4d), append one more entry for it:
    ```json
    {
      "path": "<bucket>/_surface.md",
      "loc": <line count>,
      "topics": ["undocumented-surface"],
      "sections": [],
      "split_candidate": false,
      "cross_refs": []
    }
    ```
  - `gaps_count`: number of surface entries appended to specs in this bucket (including `_surface.md`)
- `split_candidates`: flat list of every `files[].path` where `split_candidate: true`
- `total_loc`: sum of every `files[].loc`
- `scan_summary`: counts across all modules

### Split-candidate rule

`split_candidate = true` iff:
- `loc > 800`, OR
- `sections.length >= 3` AND at least three sections each have `loc >= 150`

Set `split_reason` to a short human-readable string like `"exceeds 800 LOC"` or `"3 top-level sections >=150 LOC each"`. Omit when `split_candidate: false`.

### Validate

Before writing, validate the generated object against `plugins/jupiter/schemas/index.schema.json`. If validation fails, STOP and print the failure.

Write the object to `docs/master-spec/index.json` using 2-space indentation.

## Step 6: Commit

```bash
git add -A
```

Compose the commit message:

- Count `specs_adopted = number of git mv operations performed in Step 4b`.
- Count `buckets_count = all_buckets.length` (the union from Step 4, including surface-only buckets).

```bash
git commit -m "jupiter: adopt <specs_adopted> specs into <buckets_count> buckets (mode: <mode>)"
```

If the pre-commit hook fails:

```
Pre-commit hook failed:
<output>

Continue without committing? (Y/n)
```

On Y: leave changes uncommitted. On n: STOP.

Capture the commit SHA: `commit_sha=$(git rev-parse HEAD)`.

## Step 7: Final summary

Print:

```
jupiter:adopt complete
======================
Mode:              <mode>
Specs adopted:     <N>
Buckets:           <M>
Surface stubs:     <K entries across <M> buckets>
Split candidates:  <J>
Index:             docs/master-spec/index.json
Commit:            <short sha>
```

STOP.
