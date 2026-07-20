# Claude Code and Codex Plugin Marketplace

Seven development plugins published through synchronized Claude Code and Codex catalogs: idea-to-spec elicitation interviews, multi-agent code review, queryable architecture maps, parallel plan execution, spec consolidation, vulnerability-aware dependency upgrades, and a generated codebase wiki.

The repository carries two synchronized catalogs:

- `.claude-plugin/marketplace.json` for Claude Code
- `.agents/plugins/marketplace.json` for Codex

Each plugin is implemented in its own repository. A catalog entry becomes installable in Codex once that source repository ships a valid `.codex-plugin/plugin.json`; until then, Codex may omit or reject that individual entry while the Claude package remains available.

## Installation

### Claude Code

```bash
# One-time: add the marketplace
claude plugin marketplace add MisterVitoPro/qa-claude-market

# Then install whichever plugins you want (see per-plugin sections below)
claude plugin install qa-swarm@mistervitopro-plugin-marketplace
```

---

### Codex

```bash
# One-time: add the marketplace
codex plugin marketplace add MisterVitoPro/qa-claude-market

# Inspect available entries, then install a Codex-enabled plugin
codex plugin list
codex plugin add <plugin-name>@mistervitopro-plugin-marketplace
```

Start a new Codex session after installing so bundled skills and tools are loaded. If a plugin includes lifecycle hooks, review and trust them with `/hooks` before expecting them to run.

---

## Plugins

### qa-swarm  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-swarm%2Fv1.5.0%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&prefix=v&color=blue)

**A swarm of specialist agents reviews your code, then fixes the bugs test-first.**

**Claude Code and Codex ready.** Version 1.5.0 ships both manifests, Codex-valid skills, host-neutral user gates, and portable bundled-role loading for native subagent dispatch.

Six Sonnet core reviewers (security, correctness, performance, architecture, data-flow, async) run in parallel, optionally joined by up to six Haiku specialists (config/env, supply chain, type safety, state mgmt, logging, backwards-compat). Findings are deduplicated, ranked P0–P3, and corroborated across agents. The `implement` skill picks up the report and fixes issues with a 3-agent TDD loop (failing test → minimal fix → verify).

```bash
# Claude Code
claude plugin install qa-swarm@mistervitopro-plugin-marketplace
/qa-swarm:attack "audit the authentication flow for security and correctness"
/qa-swarm:implement

# Codex
codex plugin add qa-swarm@mistervitopro-plugin-marketplace
$qa-swarm:attack "audit the authentication flow for security and correctness"
$qa-swarm:implement
```

→ [Plugin docs](https://github.com/MisterVitoPro/qa-swarm)

---

### code-atlas  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fcode-atlas%2Fv2.3.0%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&prefix=v&color=blue)

**Stops Claude Code and Codex from re-exploring your repo every session.**

**Claude Code and Codex ready.** Version 2.3.0 ships both client manifests, Codex-valid skills, and a shared SessionStart hook. Codex users must review and trust the bundled hook with `/hooks` before automatic index injection begins.

Three analyst agents scan your codebase in parallel and a graph synthesizer annotates the key modules, producing a curated architecture index (directory map, key files, tech stack, patterns, dependencies, build commands) plus a semantic dependency graph. Graph queries (dependencies, dependents, blast radius, risk filters) run deterministically through a bundled Node script. A `SessionStart` hook injects the index as context, and the map skill upserts a short marker-delimited usage block into `CLAUDE.md` / `AGENTS.md` so later sessions consult the atlas instead of grepping from scratch. Incremental updates re-scan only what changed.

```bash
# Claude Code
claude plugin install code-atlas@mistervitopro-plugin-marketplace
/code-atlas:map                   # full first-time scan
/code-atlas:update                # incremental refresh
/code-atlas:query "what calls AuthService.login?"

# Codex
codex plugin add code-atlas@mistervitopro-plugin-marketplace
$code-atlas:map
$code-atlas:update
$code-atlas:query "what calls AuthService.login?"
```

→ [Plugin docs](https://github.com/MisterVitoPro/code-atlas)

---

### plan-runner  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fplan-runner%2Fv1.14.0%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&prefix=v&color=blue)

**Take a Markdown implementation plan, run it through a parallel agent swarm.**

**Claude Code and Codex ready.** Version 1.14.0 pipelines verification off the critical path and loads bundled analyzer, developer, verifier, and aggregator roles relative to the active skill. Codex uses native subagents; Claude Code can additionally opt into Agent Teams.

The analyzer breaks your plan into file-disjoint waves (≤6 agents per wave). Dev agents implement tasks in parallel; each wave commits, then its verifier checks acceptance criteria against a snapshot of that commit while the next wave's agents are already running -- every verdict still lands before aggregation, and `--sync-verify` restores blocking verification. The aggregator dedupes bugs and emits a `fix-plan.md` for re-runs. Per-wave git commits keep history bisectable. TDD red-green mode is on by default (`--no-tdd` to disable), with one shared full-suite run per wave for the regression diff. Large plans (over 4 waves) split into sequential phases checkpointed to `run-state.json`; `--resume` picks an interrupted run back up at the last completed wave. Claude Code can auto-detect Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, v2.1.178+); other Claude sessions and Codex use native subagents. Every dispatched subagent's token usage is tallied best-effort into `manifest.json`, with explicit lower-bound coverage when the host exposes incomplete usage data. At the end it can push the branch and open or update a structured pull request through the bundled PR skill.

```bash
# Claude Code
claude plugin install plan-runner@mistervitopro-plugin-marketplace
/plan-runner:run path/to/implementation-plan.md

# Codex
codex plugin add plan-runner@mistervitopro-plugin-marketplace
$plan-runner:run path/to/implementation-plan.md
```

Pairs with the `ideas` plugin as the pipeline's front door: its interview skill produces an audited spec and emits a plan-runner-ready plan for this skill to execute.

→ [Plugin docs](https://github.com/MisterVitoPro/plan-runner)

---

### jupiter  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fjupiter%2Fv0.1.1%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&prefix=v&color=blue)

**Consolidates scattered specs into a single canonical tree, and stubs out the docs you forgot to write.**

`adopt` reorganizes spec files in place, grouped by module (multi-module repos) or feature (single-module). `rewrite` collapses everything to one file with optional source cleanup. The surface scanner walks your code and appends stubs for undocumented agents, skills, CLIs, and configs so nothing slips through.

```bash
claude plugin install jupiter@mistervitopro-plugin-marketplace
/jupiter:adopt          # reorganize specs in place
/jupiter:rewrite        # collapse to single master file
```

→ [Plugin docs](https://github.com/MisterVitoPro/jupiter)

---

### migration-runner  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fmigration-runner%2Fv0.1.0%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&prefix=v&color=blue)

**Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems.**

Scans for outdated packages (npm, Python, Go, Rust, Java, Kotlin, C#), queries OSV.dev for CVEs, recommends the safest-yet-most-recent target version per package, then executes wave-by-wave with build/typecheck/test verification and clean git rollback on failure. The two-step flow (`detect` then `run`) lets you review the plan before any code is touched.

```bash
claude plugin install migration-runner@mistervitopro-plugin-marketplace
/migration-runner:detect
/migration-runner:run
```

→ [Plugin docs](https://github.com/MisterVitoPro/migration-runner)

---

### llm-wiki  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fllm-wiki%2Fv0.1.0%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&prefix=v&color=blue)

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

### ideas  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fideas%2Fv0.7.0%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&prefix=v&color=blue)

**Interviews you into an audited design spec before any code gets written — then hands plan-runner its input.**

**Claude Code and Codex ready.** Version 0.7.0 ships both client manifests, Codex-valid skills,
host-neutral structured-question handling, and portable auditor/critic subagent loading.

A scope-sized interview (S/M/L triage, batched multiple-choice waves, hard cap of 5 question calls) pins the existing-system baseline from your repo first, then records every answer in an on-disk ledger — `decided` / `assumed` / `open` — so the run survives `/clear` and resumes from the file alone. A category-coverage elicitation floor sweeps the ambiguity taxonomy (non-functionals, lifecycle, and interfaces weighted first) so interviews can't close with critical ground unasked, and every unconfirmed item becomes a binding default welded into an acceptance criterion or a blocking open question — never a passive flag a builder can ignore. Two read-only agents gate the draft: a binding ledger audit (every spec claim traces to a decision; a model guess is never recorded as a user decision) and a biggest-miss critic. Output: a committed spec with EARS acceptance criteria, brownfield change deltas, and optional MADR-lite ADRs that later interviews read to skip already-decided questions. After approval, "Approve + generate plan" (or `/ideas:plan` run standalone against an approved spec) emits a plan-runner-ready plan — contracts only, full criterion text per task — and `/ideas:tickets` projects it to GitHub as a parent tracking issue plus one linked sub-issue per task behind a Definition-of-Ready gate (gh CLI only). It complements `plan-runner`, it does not replace it: interview -> spec -> plan here, execution there. Interview behavior is benchmark-tuned against a paired simulated-user harness ([ideas-bench](https://github.com/MisterVitoPro/ideas-bench)).

```bash
# Claude Code
claude plugin install ideas@mistervitopro-plugin-marketplace
/ideas:interview "your rough idea here"
/ideas:plan docs/specs/approved-spec.md
/ideas:tickets docs/plans/approved-spec.plan.md

# Codex
codex plugin add ideas@mistervitopro-plugin-marketplace
$ideas:interview "your rough idea here"
$ideas:plan docs/specs/approved-spec.md
$ideas:tickets docs/plans/approved-spec.plan.md
```

→ [Plugin docs](https://github.com/MisterVitoPro/ideas)

---

## Troubleshooting

For Claude Code, if `/plugin` shows errors after installing:

```bash
claude --debug                      # shows plugin load errors
/plugin                             # opens the plugin manager UI
```

`code-atlas`, `plan-runner`, and `llm-wiki` ship Node.js SessionStart hooks; Node must be on `PATH`.

For Codex, inspect the configured marketplace and plugin state:

```bash
codex plugin marketplace list
codex plugin list
```

If a catalog entry is missing, confirm that its pinned source contains `.codex-plugin/plugin.json`. Start a new session after installing or updating a plugin.

## Contributing

1. Create a standalone plugin repository with both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`, plus its agents, skills, hooks, scripts, and documentation as applicable.
2. Register the same URL, release `ref`, and commit `sha` in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) and [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json). Add the required Codex installation/authentication policies and category.
3. Tag the release as plain `v<version>` in the plugin repository, then update both catalog pins together. CI rejects catalog drift.
4. Keep client-specific surfaces honest: Claude-only features may remain documented as such until an equivalent Codex skill, MCP server, or hook is provided.

See [CLAUDE.md](CLAUDE.md) for repo conventions.

## License

MIT. See [LICENSE](LICENSE).
