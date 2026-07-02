# Claude Code Plugin Marketplace

Six production-grade plugins for [Claude Code](https://docs.claude.com/en/docs/claude-code/overview): multi-agent code review, queryable architecture maps, parallel plan execution, spec consolidation, vulnerability-aware dependency upgrades, and a generated codebase wiki.

```bash
# One-time: add the marketplace
claude plugin marketplace add MisterVitoPro/qa-claude-market

# Then install whichever plugins you want (see per-plugin sections below)
claude plugin install qa-swarm@mistervitopro-plugin-marketplace
```

---

## Plugins

### qa-swarm  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-swarm%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**A swarm of specialist agents reviews your code, then fixes the bugs test-first.**

Six Sonnet core reviewers (security, correctness, performance, architecture, data-flow, async) run in parallel, optionally joined by up to six Haiku specialists (config/env, supply chain, type safety, state mgmt, logging, backwards-compat). Findings are deduplicated, ranked P0–P3, and corroborated across agents. The `implement` skill picks up the report and fixes issues with a 3-agent TDD loop (failing test → minimal fix → verify).

```bash
claude plugin install qa-swarm@mistervitopro-plugin-marketplace
/qa-swarm:attack "audit the authentication flow for security and correctness"
/qa-swarm:implement
```

→ [Plugin docs](https://github.com/MisterVitoPro/qa-swarm)

---

### code-atlas  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fcode-atlas%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Stops Claude from re-exploring your repo every session.**

Three analyst agents scan your codebase in parallel and a graph synthesizer annotates the key modules, producing a curated architecture index (directory map, key files, tech stack, patterns, dependencies, build commands) plus a semantic dependency graph. Graph queries (dependencies, dependents, blast radius, risk filters) run deterministically through a bundled Node script. A `SessionStart` hook injects the index as context at session start so Claude navigates straight to the right files instead of grepping. Incremental updates re-scan only what changed.

```bash
claude plugin install code-atlas@mistervitopro-plugin-marketplace
/code-atlas:map                   # full first-time scan
/code-atlas:update                # incremental refresh
/code-atlas:query "what calls AuthService.login?"
```

→ [Plugin docs](https://github.com/MisterVitoPro/code-atlas)

---

### plan-runner  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fplan-runner%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Take a Markdown implementation plan, run it through a parallel agent swarm.**

The analyzer breaks your plan into file-disjoint waves (≤6 agents per wave). Dev agents implement tasks in parallel; verifier agents check acceptance criteria per wave; the aggregator dedupes bugs and emits a `fix-plan.md` for re-runs. Per-wave git commits keep history bisectable. TDD red-green mode on by default (`--no-tdd` to disable). Auto-detects Claude Code Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, v2.1.178+) for token-lean orchestration, with a transparent subagent fallback. Every dispatched subagent's token usage is tallied (best-effort) into `manifest.json` under `token_usage` and shown in the dashboards, final summary, and PR stats so you can see what a cycle cost. At the end it pushes the branch and opens/updates a proper PR (conventional title, structured body, draft when bugs remain) via the bundled `plan-runner:pr` skill.

```bash
claude plugin install plan-runner@mistervitopro-plugin-marketplace
/plan-runner:run path/to/implementation-plan.md
```

→ [Plugin docs](https://github.com/MisterVitoPro/plan-runner)

---

### jupiter  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fjupiter%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Consolidates scattered specs into a single canonical tree, and stubs out the docs you forgot to write.**

`adopt` reorganizes spec files in place, grouped by module (multi-module repos) or feature (single-module). `rewrite` collapses everything to one file with optional source cleanup. The surface scanner walks your code and appends stubs for undocumented agents, skills, CLIs, and configs so nothing slips through.

```bash
claude plugin install jupiter@mistervitopro-plugin-marketplace
/jupiter:adopt          # reorganize specs in place
/jupiter:rewrite        # collapse to single master file
```

→ [Plugin docs](https://github.com/MisterVitoPro/jupiter)

---

### migration-runner  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fmigration-runner%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems.**

Scans for outdated packages (npm, Python, Go, Rust, Java, Kotlin, C#), queries OSV.dev for CVEs, recommends the safest-yet-most-recent target version per package, then executes wave-by-wave with build/typecheck/test verification and clean git rollback on failure. The two-step flow (`detect` then `run`) lets you review the plan before any code is touched.

```bash
claude plugin install migration-runner@mistervitopro-plugin-marketplace
/migration-runner:detect
/migration-runner:run
```

→ [Plugin docs](https://github.com/MisterVitoPro/migration-runner)

---

### llm-wiki  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fllm-wiki%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Turns your codebase into a navigable wiki -- written for both new engineers and Claude's per-task context.**

A planner decides the page set, writer agents fill one page each in parallel waves, a diagram author derives Mermaid diagrams from the dependency graph, and a synthesizer builds a session-loaded index with validated cross-links. It is the prose layer that complements code-atlas: where code-atlas is a machine-first dependency graph, llm-wiki writes the human-and-agent-readable "how and why" -- consuming the code-atlas index as ground truth when present, else self-scanning. Pure static Markdown (no embeddings), per-page `source_files` provenance, and git-blob hash-diff staleness detection that regenerates only stale pages. A `SessionStart` hook loads the index so Claude reads one page per task instead of grepping.

```bash
claude plugin install llm-wiki@mistervitopro-plugin-marketplace
/code-atlas:map                   # optional but recommended -- llm-wiki reuses the graph
/llm-wiki:generate                # build the wiki under .llm-wiki/
/llm-wiki:update                  # incrementally refresh stale pages
```

→ [Plugin docs](https://github.com/MisterVitoPro/llm-wiki)

---

## Troubleshooting

If `/plugin` shows errors after installing:

```bash
claude --debug                      # shows plugin load errors
/plugin                             # opens the plugin manager UI
```

`code-atlas`, `plan-runner`, and `llm-wiki` ship Node.js SessionStart hooks; Node must be on `PATH`.

## Contributing

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`, `agents/`, `skills/`, and a `README.md`.
2. Register in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).
3. Tag releases as `<plugin-name>/v<version>` (e.g. `migration-runner/v0.1.0`) and push the tag — Claude Code uses tags as the version cache key. Plugins sourced from their own repo (e.g. `qa-swarm`, `code-atlas`, `plan-runner`) instead tag plain `v<version>` in that repo, then bump `ref`/`sha` on the plugin's `source` entry in this repo's `marketplace.json`.

See [CLAUDE.md](CLAUDE.md) for repo conventions.

## License

MIT. See [LICENSE](LICENSE).
