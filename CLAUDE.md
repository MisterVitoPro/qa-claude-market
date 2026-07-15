# Project Instructions

## Overview

Multi-client plugin marketplace repository. Every plugin is sourced from its own dedicated repository; this repo is purely the central registry. Keep the Claude catalog at `.claude-plugin/marketplace.json` and the Codex catalog at `.agents/plugins/marketplace.json` synchronized by plugin name, URL, release ref, and commit SHA. There are no local plugins under `plugins/`. A plugin is Codex-installable only after its source repository includes `.codex-plugin/plugin.json`.

### Current Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| `qa-swarm` | 1.4.1 | AI-powered code quality analyzer: 6 Sonnet core agents + optional Haiku, 3-agent parallel TDD, fresh-context subagent handoff, Context7 MCP baseline across all agents. Sourced externally from [github.com/MisterVitoPro/qa-swarm](https://github.com/MisterVitoPro/qa-swarm). |
| `code-atlas` | 2.2.0 | Dual-client Claude Code and Codex architecture index generator with semantic graph -- writes .code-atlas/atlas.json, state.json, and graph-schema.json, loaded by a shared session-start hook. Deterministic graph queries and validation use the bundled scripts/query.js. Directory map, tech stack, patterns, dependencies. Sourced externally from [github.com/MisterVitoPro/code-atlas](https://github.com/MisterVitoPro/code-atlas). |
| `plan-runner` | 1.11.0 | Run a Markdown implementation plan through a parallel agent swarm: analyze into waves, dispatch dev + verifier agents, aggregate bugs into a fix-plan, re-run on demand. TDD red-green mode on by default (--no-tdd to disable). Auto-detects Claude Code Agent Teams (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) for token-lean orchestration; subagent fallback otherwise. Tallies best-effort per-subagent token usage into manifest.json token_usage (grand total + honest coverage counters), rendered as an end-of-run per-phase Token Report with top consumers, plus dashboards and PR stats. When the harness exposes no usage figure, v1.11.0 uses the agent's last in-band self-report as a labeled lower bound, never an estimate. On the teams backend each wave is verifier-gated: the lead waits on the verifier's actual task result (never self-verifies) and a coverage gate before aggregation backfills any missing verdict, so a PR cannot open while a verifier is still outstanding. git is optional -- all git operations (clean-tree check, per-wave commits, PR) are skipped when git is absent. Before the PR, syncs a code-atlas index (runs /code-atlas:update when .code-atlas/ is present). Final step opens/updates a proper PR via the plan-runner:pr skill. Sourced externally from [github.com/MisterVitoPro/plan-runner](https://github.com/MisterVitoPro/plan-runner). |
| `jupiter` | 0.1.1 | Consolidate scattered specs into a canonical master-spec tree -- adopt command reorganizes in place; rewrite command consolidates to single file with optional cleanup; index.json flags split candidates; surface scanner appends stubs for undocumented agents/skills/CLIs/configs. Sourced externally from [github.com/MisterVitoPro/jupiter](https://github.com/MisterVitoPro/jupiter). |
| `migration-runner` | 0.1.0 | Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems (npm, Python, Go, Rust, Java, Kotlin, C#) -- detect produces a vuln-aware plan; run executes wave-by-wave with verifier + git rollback. Sourced externally from [github.com/MisterVitoPro/migration-runner](https://github.com/MisterVitoPro/migration-runner). |
| `llm-wiki` | 0.1.0 | Generate a navigable multi-page Markdown wiki under .llm-wiki/, engineered for on-demand retrieval as Claude's context while staying human-readable. Two-pass outline-then-fill across a swarm (wiki-planner, wiki-diagram-author, wiki-overview-writer, wiki-module-writer, wiki-index-synthesizer); consumes a code-atlas index as ground truth when present, else self-scans. Pure static Markdown (no embeddings), Mermaid diagrams from the dependency graph, per-page source provenance, git-blob hash-diff staleness detection (only stale pages regenerate). Pages + index are committed; state.json cache is gitignored. SessionStart hook loads index.md. Bundled dependency-free deterministic validator (scripts/validate.js: frontmatter, cross-link resolution, Mermaid structural lint, index honesty) gates both skills, with a node --test suite. Sourced externally from [github.com/MisterVitoPro/llm-wiki](https://github.com/MisterVitoPro/llm-wiki). |
| `ideas` | 0.6.0 | Turn a raw idea into an audited design spec through a token-conscious interview, then emit a plan-runner-ready plan -- /ideas:interview pins an existing-system baseline from the repo, runs S/M/L-sized batched question waves (max 5 calls pre-checkpoint) with a category-coverage elicitation floor (non-functionals/lifecycle/interfaces weighted first), records answers in a three-status on-disk ledger (decided/assumed/open, resumable after /clear), gates the draft with a binding read-only ledger audit (spec-auditor) plus a biggest-miss critic (spec-critic), and emits a spec with EARS acceptance criteria, binding defaults welded into criteria (reversal-cost tagged) or blocking open questions, brownfield change deltas, and optional MADR-lite ADRs. "Approve + generate plan" / --plan-runner re-entry emits a contracts-only plan for /plan-runner:run -- complements plan-runner, does not replace it. Benchmark-tuned via the ideas-bench harness. Honesty invariants: model guesses never recorded as user decisions; audit never overridden; failed audit/critic announced, never hidden. Sourced externally from [github.com/MisterVitoPro/ideas](https://github.com/MisterVitoPro/ideas). |

### Directory Layout

```
.claude-plugin/marketplace.json              # central registry -- every plugin sourced externally: qa-swarm, code-atlas, plan-runner, jupiter, migration-runner, llm-wiki, ideas (each at github.com/MisterVitoPro/<name>)
.agents/plugins/marketplace.json             # Codex registry -- mirrors each source URL/ref/sha and adds policy/category metadata
```

## Adding a Plugin

1. Create a standalone repo at `github.com/MisterVitoPro/<name>` with `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, agents, skills, and `README.md` at its root; tag it `v<version>`.
2. Register it in both marketplace catalogs with the same URL, tag `ref`, and commit `sha`. Add Codex `policy.installation`, `policy.authentication`, and `category` metadata.
3. Update root README.md (per-plugin section, version badge, docs link) and run the catalog validation workflow locally where possible.

## Versioning

Every plugin lives in its own repo: bump its client manifests, tag it plain `v<version>`, then bump the `ref`/`sha` on the plugin's source entry in both marketplace catalogs here.

<!-- code-atlas:start -->
<!-- generated: 2026-04-09 | commit: d9feed2 | plugin: code-atlas v1.0.0 -->

## Architecture

### Tech Stack
- **Language(s):** Markdown (agent/skill/hook definitions), JSON (plugin manifests, marketplace config)
- **Framework:** Claude Code and Codex plugin systems (dual-catalog marketplace)
- **Package Manager:** None (metadata-driven plugin system -- no runtime dependencies)
- **CI:** GitHub (git tag-based releases, `<plugin-name>/v<version>` tagging convention)

### Directory Map
```
.claude-plugin/             # Marketplace registry -- lists every plugin with its external source repo
.agents/plugins/            # Codex marketplace registry -- mirrors pins and adds Codex policy metadata
                            # (no local plugins/ dir: each plugin lives in its own repo at
                            #  github.com/MisterVitoPro/<name> -- qa-swarm, code-atlas, plan-runner,
                            #  jupiter, migration-runner, llm-wiki)
```

### Key Files
| File | Role |
|------|------|
| `.claude-plugin/marketplace.json` | Claude Code plugin registry (all seven plugins, each pointing at its external source repo) |
| `.agents/plugins/marketplace.json` | Codex plugin registry with synchronized source pins and Codex policy metadata |
| `README.md` | Per-plugin overviews, install commands, and links to each plugin's docs repo |
| Each plugin's own repo (`skills/*.md`, `agents/*.md`) | Skill entry points and agent definitions live in the external repos |
| [`docs/MASTER-SPEC.md`](https://github.com/MisterVitoPro/qa-swarm/blob/main/docs/MASTER-SPEC.md) (external qa-swarm repo) | QA Swarm spec |

### Patterns & Conventions
- Agents: Markdown + YAML frontmatter (`name`, `description`, `model`, `color`)
- Skills: `skills/<name>/SKILL.md` with frontmatter
- Hooks: `hooks/<name>/HOOK.md` with `trigger`
- Naming: kebab-case; skills as `plugin:name`
- Models: Sonnet (core/aggregation), Haiku (optional), Opus (impl)
- Output: Agents return JSON; skills produce Markdown
- License: MIT

### Dependencies
No circular dependencies. Each plugin is independent; both marketplace catalogs register all seven.

### Build & Run Commands
```bash
# Add this marketplace, then install any plugin from it
claude plugin marketplace add MisterVitoPro/qa-claude-market
claude plugin install <plugin-name>@mistervitopro-plugin-marketplace

codex plugin marketplace add MisterVitoPro/qa-claude-market
codex plugin add <plugin-name>@mistervitopro-plugin-marketplace

# Releasing: tag v<version> in the plugin's OWN repo, then bump ref/sha in both
# marketplace catalogs here (see Versioning above)
```

<!-- code-atlas:end -->
