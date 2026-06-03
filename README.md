# Claude Code Plugin Marketplace

Five production-grade plugins for [Claude Code](https://docs.claude.com/en/docs/claude-code/overview): multi-agent code review, queryable architecture maps, parallel plan execution, spec consolidation, and vulnerability-aware dependency upgrades.

```bash
# One-time: add the marketplace
claude plugin marketplace add MisterVitoPro/qa-claude-market

# Then install whichever plugins you want (see per-plugin sections below)
claude plugin install qa-swarm@mistervitopro-plugin-marketplace
```

---

## Plugins

### qa-swarm  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fqa-swarm%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**A swarm of specialist agents reviews your code, then fixes the bugs test-first.**

Six Sonnet core reviewers (security, correctness, performance, architecture, data-flow, async) run in parallel, optionally joined by up to six Haiku specialists (config/env, supply chain, type safety, state mgmt, logging, backwards-compat). Findings are deduplicated, ranked P0–P3, and corroborated across agents. The `implement` skill picks up the report and fixes issues with a 3-agent TDD loop (failing test → minimal fix → verify).

```bash
claude plugin install qa-swarm@mistervitopro-plugin-marketplace
/qa-swarm:attack "audit the authentication flow for security and correctness"
/qa-swarm:implement
```

→ [Plugin docs](plugins/qa-swarm/README.md)

---

### code-atlas  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fcode-atlas%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Stops Claude from re-exploring your repo every session.**

Three agents scan your codebase in parallel and produce a curated architecture index (directory map, key files, tech stack, patterns, dependencies, build commands) plus a queryable semantic graph. A `SessionStart` hook injects the index as context at session start so Claude navigates straight to the right files instead of grepping. Incremental updates re-scan only what changed.

```bash
claude plugin install code-atlas@mistervitopro-plugin-marketplace
/code-atlas:map                   # full first-time scan
/code-atlas:update                # incremental refresh
/code-atlas:query "what calls AuthService.login?"
```

---

### plan-runner  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fplan-runner%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Take a Markdown implementation plan, run it through a parallel agent swarm.**

The analyzer breaks your plan into file-disjoint waves (≤6 agents per wave). Dev agents implement tasks in parallel; verifier agents check acceptance criteria per wave; the aggregator dedupes bugs and emits a `fix-plan.md` for re-runs. Per-wave git commits keep history bisectable. Optional TDD red-green mode.

```bash
claude plugin install plan-runner@mistervitopro-plugin-marketplace
/plan-runner:run path/to/implementation-plan.md
```

---

### jupiter  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fjupiter%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Consolidates scattered specs into a single canonical tree, and stubs out the docs you forgot to write.**

`adopt` reorganizes spec files in place, grouped by module (multi-module repos) or feature (single-module). `rewrite` collapses everything to one file with optional source cleanup. The surface scanner walks your code and appends stubs for undocumented agents, skills, CLIs, and configs so nothing slips through.

```bash
claude plugin install jupiter@mistervitopro-plugin-marketplace
/jupiter:adopt          # reorganize specs in place
/jupiter:rewrite        # collapse to single master file
```

---

### migration-runner  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fmigration-runner%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems.**

Scans for outdated packages (npm, Python, Go, Rust, Java, Kotlin, C#), queries OSV.dev for CVEs, recommends the safest-yet-most-recent target version per package, then executes wave-by-wave with build/typecheck/test verification and clean git rollback on failure. The two-step flow (`detect` then `run`) lets you review the plan before any code is touched.

```bash
claude plugin install migration-runner@mistervitopro-plugin-marketplace
/migration-runner:detect
/migration-runner:run
```

---

## Why a marketplace?

Each plugin is independently versioned and installable. Add the marketplace once; mix and match. All four work standalone — no cross-dependencies.

## Troubleshooting

If `/plugin` shows errors after installing:

```bash
claude --debug                      # shows plugin load errors
/plugin                             # opens the plugin manager UI
```

`code-atlas` and `plan-runner` ship Node.js SessionStart hooks; Node must be on `PATH`.

## Contributing

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`, `agents/`, `skills/`, and a `README.md`.
2. Register in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).
3. Tag releases as `<plugin-name>/v<version>` (e.g. `qa-swarm/v1.4.1`) and push the tag — Claude Code uses tags as the version cache key.

See [CLAUDE.md](CLAUDE.md) for repo conventions.

## License

MIT. See [LICENSE](LICENSE).
