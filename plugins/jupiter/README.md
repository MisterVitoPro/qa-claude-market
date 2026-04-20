# Jupiter

Consolidate scattered spec files into a canonical `docs/master-spec/` tree, emit a navigable `index.json`, and append stubs for undocumented public surface found in the code.

## Commands

### `/jupiter:adopt [--force] [--deep]`

Primary command. Reorganizes every spec Jupiter can find into `docs/master-spec/`, organized by module (for multi-module repos) or feature (for single-module repos). Moves files with `git mv` so history is preserved.

- `--force`: wipe `docs/master-spec/` and rebuild (prompts first; default N).
- `--deep`: enable the optional behavioral-gaps pass (pass D) in the surface scanner. Off by default.

Re-running without `--force` is incremental: already-adopted specs are skipped; only new or changed specs are moved; surface stubs inside `<!-- jupiter:surface-begin -->` markers are regenerated; content outside those markers is preserved.

### `/jupiter:rewrite`

Consolidates the master spec into a single file (per module in multi-module mode) and prompts whether to delete the source files. Default answer is keep. Never deletes on blank input.

## Output layout

```
docs/master-spec/
  index.json                             # emitted by /jupiter:adopt
  <module>/<spec>.md                     # multi-module layout
  features/<feature>/<spec>.md           # single-module layout
  _surface.md                            # stubs that matched no existing spec
  CONSOLIDATED.md                        # emitted by /jupiter:rewrite (single-module)
  CONSOLIDATED-<module>.md               # emitted by /jupiter:rewrite (multi-module)
  consolidated-index.json                # rewrite sidecar
```

## Surface stub markers

Jupiter only rewrites content between these markers on incremental re-runs:

```
<!-- jupiter:surface-begin -->
## Undocumented surface (auto-generated)

- **name** (`location`) - summary <!-- TODO: expand -->

<!-- jupiter:surface-end -->
```

Anything above or below is never touched. To promote a stub into real prose, cut it out of the block, expand it above the opening marker, and it will survive future runs.

## Smoke testing

Two fixtures under `test-fixtures/`:

### Multi-module

```bash
cd plugins/jupiter/test-fixtures/fixture-multi-module
claude
# inside claude:
/jupiter:adopt
```

Expected:
- Module detection prints `Module detection: module (signal: 2)` (three `plugin.json` files trip signal 2)
- `docs/master-spec/index.json` exists and validates against `schemas/index.schema.json`
- Four buckets: `alpha`, `beta`, `gamma`, `shared`
- `docs/master-spec/gamma/_surface.md` exists (no existing spec in gamma)
- One commit named `jupiter: adopt 3 specs into 4 buckets (mode: module)` (or similar)

Incremental re-run:
```bash
# add a new spec
echo "# New alpha spec\n\n## Overview" > plugins/alpha/docs/2026-04-20-extra.md
# inside claude:
/jupiter:adopt
```
Expected: only the new file is moved; existing adopted specs are untouched.

Force:
```bash
# inside claude:
/jupiter:adopt --force
# answer y to the deletion prompt
```
Expected: `docs/master-spec/` wiped and rebuilt from scratch.

### Single-module

```bash
cd plugins/jupiter/test-fixtures/fixture-single-module
claude
# inside claude:
/jupiter:adopt
```

Expected:
- Module detection prints `Module detection: feature (signal: no signal matched)` (single root `package.json`, no nested manifests)
- Buckets use `features/<name>/` layout
- `rotateKey`, `DATABASE_URL`, `API_KEY`, and `LOG_LEVEL` appear as surface stubs
- `healthCheck` appears as a stub (not mentioned in ui-design.md)

### Rewrite

```bash
cd plugins/jupiter/test-fixtures/fixture-multi-module
# inside claude:
/jupiter:rewrite
# answer N when prompted -- keep originals
```

Expected:
- Three `docs/master-spec/CONSOLIDATED-*.md` files created (one per non-empty bucket)
- `docs/master-spec/consolidated-index.json` validates against the schema
- Original spec files still present under `plugins/*/docs/`

### Reset between tests

```bash
git reset --hard HEAD~N
git clean -fd docs/master-spec
```

Where N is the number of commits Jupiter made during the test.

## Schema validation

Run the schema test after any schema change:

```bash
python plugins/jupiter/tests/validate_schemas.py
```

Expected: exit 0 with PASS lines for all four schemas.
