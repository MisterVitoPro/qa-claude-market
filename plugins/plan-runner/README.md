# plan-runner

![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fplan-runner%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

Take a free-form Markdown implementation plan and execute it through a parallel agent swarm with built-in verification and bug-driven re-planning.

## What it does

1. **Analyze.** A `plan-analyzer` agent reads your plan and buckets tasks into waves of file-disjoint work (max 6 agents per wave, ordered as a DAG).
2. **Confirm.** You see the wave plan and approve before any dev work runs.
3. **Execute per wave.** For each wave: dispatch up to 6 `plan-dev` agents in parallel, then dispatch one `plan-verifier` per dev agent in parallel, then commit the wave with verifier status in the message.
4. **Aggregate.** A `plan-aggregator` agent collects every verifier-flagged bug, deduplicates, ranks by severity (P0-P3), and writes both a `bugs.md` audit and a `fix-plan.md` (a new plan ready for re-runs).
5. **Re-run prompt.** You decide whether to auto-handoff to a fresh-context subagent that runs `/plan-runner:run <fix-plan.md>` for cycle 2.

## Install

```bash
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin plan-runner
```

## Usage

```bash
/plan-runner:run docs/foo/feature-plan.md
```

The plan can be any Markdown file with task content. There is no required schema -- the analyzer reads it heuristically.

## TDD red-green mode

By default `/plan-runner:run` asks whether to enable a Test-Driven Development
red-green workflow for the run:

- **Testable tasks** are split into a *test-author* step (writes a failing test)
  and an *impl* step (makes it pass). The orchestrator runs the test command at
  two checkpoints and records proven evidence in `manifest.json` under `tdd`:
  a `red_run` (the new test failed before implementation) and a `green_run`
  (it passed after).
- **Non-testable tasks** (docs, config, schemas) run as before, with static
  verification only. The analyzer labels them and shows the reason in the wave
  plan.
- The **red gate** requires the new tests to fail for a genuine reason
  (import / not-implemented / assertion) while pre-existing tests stay green;
  a syntax/collection error is an invalid red and is flagged as a bug.
- Gate failures are not retried inline -- they become bugs that flow through the
  existing aggregate -> fix-plan -> re-run loop. Because every impl wave ends on
  a green full-suite check, **each committed wave is green**.

The test command is resolved as: `--test-cmd "<cmd>"` flag, else auto-detection
from repo markers (`package.json`, `pytest`, `go.mod`, `Cargo.toml`, `*.csproj`,
...), else a one-time prompt. If none can be resolved the run **stops** and
points you to `--no-tdd`.

**Flags:**
- `--no-tdd` -- skip the prompt and run the classic (non-TDD) pipeline.
- `--test-cmd "<cmd>"` -- supply the test command explicitly; use `{file}` for
  single-file runs (e.g. `pytest {file}`).

## Output

Per cycle, output lives at:

```
docs/plan-runner/{DATE}/cycle-{N}/
  wave-plan.json         # analyzer output
  bugs/
    wave-W-agent-A.json  # one per verifier
  bugs.md                # aggregator's human-readable summary
  fix-plan.md            # aggregator's next-cycle input
  manifest.json          # pipeline metadata
```

## Requirements

- Clean working tree (you can override, but commits are per-wave)
- Optional: Context7 MCP server for current framework docs (auto-detected; skipped if absent)

## Auto-Setup

On first session start, a hook automatically adds `docs/plan-runner/` to `.gitignore` (if a `.gitignore` exists). Generated output is not committed and remains local to the working tree.

## Design

Full design spec at `docs/superpowers/specs/2026-04-15-plan-runner-design.md` (in the source repo).

## License

MIT
