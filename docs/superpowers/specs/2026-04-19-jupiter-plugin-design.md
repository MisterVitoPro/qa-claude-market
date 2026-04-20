# Jupiter Plugin - Design Spec

**Status:** Draft
**Date:** 2026-04-19
**Plugin:** `jupiter` (v0.1.0, to be created)
**Location:** `plugins/jupiter/` in this marketplace

## 1. Problem

Over the life of a project, design specs and implementation plans accumulate in scattered locations (`docs/`, `plugins/*/docs/`, per-module doc folders). In this repo we currently have roughly 4,600 lines of spec/plan content spread across:

- `plugins/qa-swarm/docs/MASTER-SPEC.md` (one plugin already consolidated)
- `plugins/qa-swarm/docs/superpowers/specs/*.md`
- `plugins/code-atlas/docs/*.md` (six separate design + reference files)
- `plugins/plan-runner/` (no consolidated spec; only skill markdown)
- `docs/plan-runner/2026-04-19/` and `docs/superpowers/specs/*.md`

New specs keep arriving in `docs/superpowers/specs/` every time a brainstorm session completes. The result: no single entry point for understanding what the system is supposed to do, and gaps between what the code does and what the specs describe.

Jupiter consolidates all scattered specs into a single canonical location, preserves them as the source of truth, generates an index for navigation, and scans the codebase to surface undocumented behavior.

## 2. Goals

1. Produce a single canonical spec tree at `docs/master-spec/`, organized to match the repo's structure.
2. Emit an `index.json` that makes the spec tree navigable and flags files that are getting too big.
3. Detect undocumented public surface and configuration, and inject stubs into the appropriate spec so gaps are impossible to miss.
4. Support incremental re-runs as new specs appear, without destroying manual edits.
5. Offer an alternative "rewrite" mode that produces a single consolidated document with an opt-in cleanup of the originals.

## 3. Non-goals

- Drift detection (specs say X, code does Y). The failure mode for this kind of check is too noisy to be worth the cost.
- Automated enforcement. Jupiter reports; it never blocks commits or fails CI.
- Owning content authorship. Jupiter moves and stubs; it does not rewrite the prose of existing specs.
- Multi-repo aggregation. Single-repo only.

## 4. Commands

Jupiter exposes two user-facing skills.

### 4.1 `/jupiter:adopt`

The primary command. Reorganizes scattered specs into `docs/master-spec/`, generates the index, and appends undocumented-surface stubs.

**Flags:**
- `--force`: wipe `docs/master-spec/` and rebuild from scratch. Requires a single `y/N` confirmation before deletion.
- `--deep`: enable the optional D pass in the surface scanner (behavioral gaps). Off by default.

**Re-run behavior:** if `docs/master-spec/index.json` already exists, Jupiter runs in incremental mode (Section 9). Without `--force` it never deletes existing content.

### 4.2 `/jupiter:rewrite`

Consolidates the master spec into a single document (per module in multi-module mode), and prompts the user whether to delete the source shards.

**Flags:** none.

**Behavior:** runs the same pipeline as adopt, then emits `CONSOLIDATED.md` (or `CONSOLIDATED-<module>.md` per module), writes a sidecar `consolidated-index.json`, and prompts `Delete the original spec files now? (y/N)`. The default is `N` - nothing destructive happens without explicit consent.

## 5. Module detection

Run once at the top of every invocation. A repo is **multi-module** if any of the following hold:

- Two or more `package.json` files exist outside the repo root.
- Two or more `plugin.json` files exist anywhere.
- A `pnpm-workspace.yaml`, `lerna.json`, or Cargo workspace with ≥2 members exists.
- Two or more top-level directories each contain their own package manifest.

Otherwise the repo is **single-module**.

Jupiter prints one log line stating which mode it picked and why (which signal triggered it). No prompt; no flag to override. If a user wants the other mode, they change their repo layout.

## 6. Output layout

```
docs/master-spec/
  index.json                           # always at this path
  <module>/                            # multi-module mode
    <spec-name>.md
    _surface.md                        # created only if no existing spec fits surface stubs
  features/<feature>/                  # single-module mode
    <spec-name>.md
  CONSOLIDATED.md                      # produced by /jupiter:rewrite
  CONSOLIDATED-<module>.md             # rewrite output, multi-module
  consolidated-index.json              # rewrite sidecar
```

File movement uses `git mv` so history is preserved. Jupiter never copies a spec - it always moves.

## 7. Pipeline

Identical shape for both commands; only the write phase differs.

```
orchestrator skill (jupiter:adopt | jupiter:rewrite)
  |
  +-- jupiter-spec-cataloger   (subagent, model: sonnet)
  |     Reads every .md under docs/ + plugins/*/docs/ + per-module doc dirs.
  |     Returns: specs catalog + proposed layout.
  |
  +-- jupiter-surface-scanner  (subagent, model: sonnet)
  |     Reads code per module. A+C pass always; D pass if --deep.
  |     Returns: undocumented-surface inventory per module.
  |
  +-- orchestrator write phase
        Adopt: git mv specs into buckets, append stubs, emit index.json, commit.
        Rewrite: concatenate specs into CONSOLIDATED.md, write consolidated-index.json,
                 prompt for cleanup, commit.
```

Only the orchestrator writes files. Subagents return JSON only; they do not modify the working tree.

## 8. Agent contracts

### 8.1 `jupiter-spec-cataloger`

**Input fields (provided by orchestrator):**
- `mode`: `"module"` or `"feature"`
- `root`: absolute repo root
- `glob_targets`: spec file globs to crawl (`docs/**/*.md`, `plugins/*/docs/**/*.md`, root README files)
- `already_adopted` (incremental only): list of basenames already under `docs/master-spec/`

**For each file, the agent extracts:**
- file path (relative to root), LOC, last git modification time
- top-level headings with their line numbers and LOC
- 3-7 inferred topic keywords
- inferred module affiliation (for multi-module) or feature affiliation (for single-module)
- cross-references: mentions of other spec files by name or path

**Returns:**

```json
{
  "mode": "module",
  "specs": [
    {
      "path": "plugins/qa-swarm/docs/MASTER-SPEC.md",
      "loc": 690,
      "mtime": "2026-04-10T12:00:00Z",
      "topics": ["qa", "agents", "tdd", "aggregation"],
      "bucket": "qa-swarm",
      "headings": [
        { "heading": "## Architecture", "line": 42, "loc": 180 }
      ],
      "cross_refs": ["plugins/code-atlas/docs/2026-04-14-v1.2-design.md"]
    }
  ],
  "proposed_layout": {
    "qa-swarm": ["plugins/qa-swarm/docs/MASTER-SPEC.md", "..."],
    "code-atlas": ["..."],
    "plan-runner": ["..."]
  },
  "cross_refs": [
    { "from": "plugins/qa-swarm/docs/MASTER-SPEC.md", "to": "plugins/code-atlas/docs/..." }
  ]
}
```

Validated against `plugins/jupiter/schemas/catalog.schema.json`. On parse failure the orchestrator retries once with a reminder prompt; on second failure it prints raw output and STOPs.

### 8.2 `jupiter-surface-scanner`

**Input fields:**
- `modules`: list of module paths from the cataloger
- `deep`: bool (true when `--deep` was set)

**Pass A - public surface (always):**
- exported functions/classes from entry files (`index.*`, `main.*`, module entry points)
- CLI scripts in `bin/`, `package.json#bin` entries
- Claude Code slash commands: `skills/*/SKILL.md` frontmatter `name`
- agent definitions: `agents/*.md` frontmatter `name`
- hook trigger names from `hooks/**/HOOK.md` frontmatter
- MCP tool names exported by the plugin

**Pass C - config/schema (always):**
- environment variable names in `.env.example` or `env.example`
- JSON schema files under `schemas/`
- non-default fields in `plugin.json`, `package.json`, `.claude-plugin/plugin.json`
- hook trigger conditions referenced in code but not in spec

**Pass D - behavioral gaps (only when `--deep`):**
- retry loops, fallbacks, error-recovery branches whose intent is not obvious from names
- nontrivial state machines or timeouts
- anything the agent tags as "code behavior unclear from names"

**Returns:**

```json
{
  "per_module": {
    "code-atlas": {
      "public_surface": [
        {
          "name": "atlas-dependencies",
          "kind": "agent",
          "location": "plugins/code-atlas/agents/atlas-dependencies.md",
          "one_line_summary": "Extracts module dependency graph from import statements",
          "confidence": "high"
        }
      ],
      "configs": [
        {
          "name": "CODE_ATLAS_MAX_DEPTH",
          "kind": "env_var",
          "location": ".env.example:12",
          "one_line_summary": "Maximum recursion depth for graph synthesis",
          "confidence": "high"
        }
      ],
      "behavioral_gaps": []
    }
  }
}
```

Validated against `plugins/jupiter/schemas/surface.schema.json`. Same retry/STOP policy as the cataloger.

## 9. Orchestrator write phase (adopt)

1. For each bucket in `proposed_layout`:
   1. Ensure the bucket directory exists.
   2. `git mv` each source spec into the bucket. If the destination path already exists, rename the incoming file with a `-N` suffix and log a warning.
   3. For each public-surface and config entry in that bucket's scanner output, pick the best-matching existing spec by **topic overlap** (count of shared keywords between the entry's inferred topics and the spec's topics; highest count wins; ties broken by smallest spec LOC). A spec must share **at least 2 topic keywords** to qualify. Append under a `## Undocumented surface (auto-generated)` heading bounded by:

      ```
      <!-- jupiter:surface-begin -->
      ## Undocumented surface (auto-generated)

      - **<name>** (`<location>`) - <one_line_summary> <!-- TODO: expand -->
      ...
      <!-- jupiter:surface-end -->
      ```

   4. If no existing spec qualifies (no spec shares at least 2 topic keywords), create `<bucket>/_surface.md` containing only the auto-generated section.
2. Write `docs/master-spec/index.json` (Section 10).
3. Stage all changes, commit with message `jupiter: adopt <N> specs into <B> buckets (mode: <module|feature>)`. If a pre-commit hook fails, surface the output and ask `Continue without committing? (Y/n)` - same pattern as plan-runner.

## 10. `index.json` schema

```json
{
  "generated_at": "2026-04-19T18:00:00Z",
  "jupiter_version": "0.1.0",
  "mode": "module",
  "root": "docs/master-spec/",
  "buckets": {
    "qa-swarm": {
      "summary": "Multi-agent QA analyzer with TDD fix pipeline",
      "files": [
        {
          "path": "qa-swarm/MASTER-SPEC.md",
          "loc": 814,
          "topics": ["agents", "bug-aggregation", "tdd"],
          "sections": [
            { "heading": "## Architecture", "line": 42, "loc": 180 }
          ],
          "split_candidate": true,
          "split_reason": "exceeds 800 LOC; 3 top-level sections >=150 LOC each",
          "cross_refs": ["../code-atlas/graph-language.md"]
        }
      ],
      "gaps_count": 7
    }
  },
  "split_candidates": ["qa-swarm/MASTER-SPEC.md"],
  "total_loc": 4603,
  "scan_summary": {
    "public_surface_found": 34,
    "configs_found": 12,
    "behavioral_gaps_found": 0
  }
}
```

**Split-candidate rule:** a file is flagged `split_candidate: true` if either:
- total LOC > 800, OR
- file has ≥3 top-level (`##`) sections each with ≥150 LOC

Thresholds are hardcoded constants in the orchestrator skill. No flags. If they prove wrong in practice, change the constants in a follow-up version.

## 11. Rewrite flow (`/jupiter:rewrite`)

1. Run cataloger + scanner (same as adopt). This works whether or not adopt has been run - rewrite is stand-alone.
2. Concatenate specs into the output file:
   - Multi-module: one file per module at `docs/master-spec/CONSOLIDATED-<module>.md`.
   - Single-module: one file at `docs/master-spec/CONSOLIDATED.md`.
3. Within each consolidated file:
   - Order: by bucket; within bucket, by **topic proximity** (specs are placed adjacent to whichever other spec in the same bucket shares the most topic keywords; ties broken by original file mtime, oldest first).
   - Each original file becomes an `<h2>` section with a `<!-- source: <original-path> -->` comment on the first line of the section for traceability.
   - Surface/config stubs appear inline per-bucket, in the same `<!-- jupiter:surface-begin -->` / `<!-- jupiter:surface-end -->` markers.
4. Write `docs/master-spec/consolidated-index.json` - same shape as `index.json` but `files[]` is replaced by `sections[]` pointing to heading anchors inside the consolidated file.
5. Prompt:

   ```
   Rewrite complete. <N> source files consolidated into <path> (<total_loc> LOC).
   Delete the original spec files now? (y/N)
   ```

   On `y`: `git rm` the originals and commit both the consolidated file and the deletions in a single commit (`jupiter: rewrite + cleanup <N> originals`).
   On `N` (default): commit only the new consolidated file (`jupiter: rewrite <N> specs (originals kept)`).

## 12. Incremental re-run model

When `/jupiter:adopt` runs and `docs/master-spec/index.json` already exists:

1. Build a set of `already_adopted` basenames from the existing index.
2. Pass that set to the cataloger, which reports only new/moved/changed specs (anything not in the set, plus any already-adopted file whose mtime is newer than the index `generated_at`).
3. Run the scanner unconditionally (code changes constantly, so the surface inventory is always re-derived).
4. Write phase:
   - Only `git mv` specs that are still outside `docs/master-spec/`.
   - For surface stubs: regenerate content between `<!-- jupiter:surface-begin -->` and `<!-- jupiter:surface-end -->` markers. Any content outside those markers is preserved, including prose that promotes a stub into real documentation above the auto-generated section.
5. Rewrite `index.json` from scratch using the fresh catalog + scan.
6. Commit.

`--force` deletes `docs/master-spec/` entirely after a single `y/N` confirmation, then runs as a fresh adopt.

## 13. Surface-stub idempotency

The auto-generated surface section is always bounded by matching markers:

```
<!-- jupiter:surface-begin -->
## Undocumented surface (auto-generated)

- **atlas-dependencies** (`plugins/code-atlas/agents/atlas-dependencies.md`) - Extracts module dependency graph from import statements <!-- TODO: expand -->

<!-- jupiter:surface-end -->
```

On re-run Jupiter replaces only the content between the markers. Anything a human wrote above `<!-- jupiter:surface-begin -->` or below `<!-- jupiter:surface-end -->` is never touched. This lets you promote a stub into polished prose by cutting it out of the marked block and expanding it above, knowing it will survive future runs.

If both markers are missing, Jupiter appends a new marked block at the end of the file. If only one marker is present, Jupiter treats the file as corrupt, logs a warning, and skips the stub append for that file.

## 14. Error handling

- **Agent returns non-JSON:** one retry with a reminder prompt. Second failure: print raw output, STOP.
- **Schema validation failure:** STOP; print the failing JSONPath and the offending value.
- **`git mv` destination collision:** rename incoming file with `-N` suffix (where N is the smallest integer that avoids collision); log a warning to the run summary.
- **Uncommitted working tree at start:** print `git status` output, warn that adopt commits on completion, prompt `Continue anyway? (Y/n)`. Same pattern as plan-runner.
- **Missing `docs/` directory:** create it silently. No error.
- **Pre-commit hook failure on final commit:** surface hook output, prompt `Continue without committing? (Y/n)`.
- **`--force` with no existing `master-spec/`:** treat as a no-op flag (don't error), proceed as a normal fresh adopt.

No retries beyond what is spelled out. Jupiter never masks a problem.

## 15. Testing

`plugins/jupiter/test-fixtures/` contains two fixture repos for manual smoke testing:

- **`fixture-multi-module/`** - mimics this marketplace: three fake plugins each with scattered specs in different locations. Verifies module-detection, layout, and `git mv`.
- **`fixture-single-module/`** - flat repo with ~5 loose specs in `docs/` and a `src/` tree with exports. Verifies feature-mode layout and surface scanning.

Manual test procedure documented in `plugins/jupiter/README.md` with expected outcomes:
- expected `index.json` bucket count and mode
- expected number of surface stubs
- expected commit messages

No automated test runner. Matches how `qa-swarm`, `code-atlas`, and `plan-runner` are tested in this repo.

## 16. Plugin layout

```
plugins/jupiter/
  .claude-plugin/
    plugin.json                         # v0.1.0, name: jupiter
  README.md                             # usage + manual test procedure
  LICENSE                               # MIT, matches siblings
  agents/
    jupiter-spec-cataloger.md
    jupiter-surface-scanner.md
  skills/
    adopt/SKILL.md                      # /jupiter:adopt
    rewrite/SKILL.md                    # /jupiter:rewrite
  schemas/
    catalog.schema.json
    surface.schema.json
    index.schema.json
    consolidated-index.schema.json
  test-fixtures/
    fixture-multi-module/
    fixture-single-module/
```

## 17. Tech stack alignment

Follows the conventions in `CLAUDE.md`:

- Agents: Markdown + YAML frontmatter (`name`, `description`, `model`, `color`)
- Skills: `skills/<name>/SKILL.md` with frontmatter; argument-hints where applicable
- Naming: kebab-case; skills as `jupiter:<name>`
- Models: Sonnet for both subagents (parity with code-atlas and plan-runner)
- Output: agents return JSON; skills produce Markdown + JSON artifacts
- License: MIT
- No runtime dependencies

## 18. Registration & versioning

1. Add `plugins/jupiter/` to `.claude-plugin/marketplace.json`.
2. Update root `README.md` and root `CLAUDE.md` "Current Plugins" table with the new entry.
3. Start at `v0.1.0`. Tag on first release as `jupiter/v0.1.0`.

## 19. Future considerations (explicitly out of scope for v0.1.0)

- Incremental `--deep` re-runs (currently `--deep` re-runs the full scan every time).
- Custom bucket overrides (user says "put everything with topic X in bucket Y").
- Non-markdown spec sources (ADRs in other formats, inline JSDoc comments).
- Multi-repo aggregation.
- Automatic split execution - currently Jupiter only flags split candidates; actually breaking a file up stays manual.
