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

## Schema validation

Run the schema test after any schema change:

```bash
python plugins/jupiter/tests/validate_schemas.py
```

Expected: exit 0 with PASS lines for all four schemas.
