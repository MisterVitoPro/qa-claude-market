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
