---
name: migration-runner:detect
description: >
  Scan the repo for outdated dependencies across all detected ecosystems (npm, Python,
  Go, Rust, Java, Kotlin, C#), query OSV.dev for vulnerabilities, and produce a
  vulnerability-aware upgrade plan at docs/migration-runner/migration-plan.md and plan.json.
  Recommends "latest with no unfixed HIGH/CRITICAL CVE and >=14d soak" within the current
  major; surfaces cross-major upgrades separately unless --allow-major is passed.
argument-hint: "[--allow-major] [--ecosystem npm,python,go,rust,java,kotlin,csharp]"
---

You are orchestrating a `migration-runner:detect` run. Follow these steps exactly.

## Step 0: Parse arguments

Parse `$ARGUMENTS` for:
- `--allow-major` (boolean flag, default false)
- `--ecosystem <comma-separated-list>` (optional; default = auto-detect all)

## Step 1: Read optional config

If `.migration-runner.json` exists at the repo root, read it. Extract:
- `soak_days` (default 14)
- `ignore` (array of package-name globs; default [])
- `allow_major` (override for the flag if not passed on CLI)

## Step 2: Detect present ecosystems

For each of `npm`, `python`, `go`, `rust`, `java`, `kotlin`, `csharp` (or only those in `--ecosystem` if provided), run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/adapter.js" <ecosystem> detect
```
Collect the set of ecosystems where this returns non-empty output.

## Step 3: Dispatch detector agents in parallel

For each detected ecosystem, dispatch a `migration-detector` agent (use the Agent tool, one call per ecosystem, all in a single message for parallelism).

Each detector returns:
```json
{ "ecosystem": "...", "manifest_path": "...", "outdated": [...] }
```

## Step 4: Dispatch the planner

Pass the merged detector outputs to a single `migration-planner` agent dispatch. Include in the prompt:
- DETECTOR_OUTPUTS (the array)
- ALLOW_MAJOR (resolved boolean)
- IGNORE (from config, or [])
- SOAK_DAYS (from config, or 14)

The planner writes `docs/migration-runner/plan.json` and `migration-plan.md` to the user's repo and returns a JSON summary.

## Step 5: Summarize for the user

Read `docs/migration-runner/migration-plan.md` (just the first ~100 lines for context) and write a short message to the user:

> Found N outdated packages across <ecosystems>. Wrote plan to `docs/migration-runner/migration-plan.md`.
> - X waves planned (normal: A, elevated: B)
> - Y major upgrades available (not planned; pass --allow-major to include)
>
> Next: `/migration-runner:run` to execute.

If the planner returned an error, surface it verbatim and stop.

## Rules

- Do not edit any files yourself. The planner writes the plan files.
- Do not run upgrades. This is detect-only.
- Always finish by pointing the user at the plan file.
