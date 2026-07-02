# Project Instructions

## Overview

Multi-plugin marketplace repository. Every plugin is now sourced from its own dedicated repository (each with its own `.claude-plugin/plugin.json`, agents, skills, and docs); this repo is purely the central registry that lists them (see `.claude-plugin/marketplace.json`). There are no local plugins under `plugins/`. See Architecture section for tech stack, directory map, key files, and conventions.

### Current Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| `qa-swarm` | 1.4.1 | AI-powered code quality analyzer: 6 Sonnet core agents + optional Haiku, 3-agent parallel TDD, fresh-context subagent handoff, Context7 MCP baseline across all agents. Sourced externally from [github.com/MisterVitoPro/qa-swarm](https://github.com/MisterVitoPro/qa-swarm). |
| `code-atlas` | 2.1.0 | Architecture index generator with semantic graph -- writes .code-atlas/atlas.json, state.json, and graph-schema.json, loaded by session-start hook. Deterministic graph queries + validation via bundled scripts/query.js (/code-atlas:query). Directory map, tech stack, patterns, dependencies. Sourced externally from [github.com/MisterVitoPro/code-atlas](https://github.com/MisterVitoPro/code-atlas). |
| `plan-runner` | 1.6.0 | Run a Markdown implementation plan through a parallel agent swarm: analyze into waves, dispatch dev + verifier agents, aggregate bugs into a fix-plan, re-run on demand. TDD red-green mode on by default (--no-tdd to disable). Auto-detects Claude Code Agent Teams (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) for token-lean orchestration; subagent fallback otherwise. Tallies best-effort per-subagent token usage into manifest.json token_usage (grand total + honest coverage counters), rendered as an end-of-run per-phase Token Report with top consumers, plus dashboards and PR stats. On the teams backend each wave is verifier-gated: the lead waits on the verifier's actual task result (never self-verifies) and a coverage gate before aggregation backfills any missing verdict, so a PR cannot open while a verifier is still outstanding. git is optional -- all git operations (clean-tree check, per-wave commits, PR) are skipped when git is absent. Before the PR, syncs a code-atlas index (runs /code-atlas:update when .code-atlas/ is present). Final step opens/updates a proper PR via the plan-runner:pr skill. Sourced externally from [github.com/MisterVitoPro/plan-runner](https://github.com/MisterVitoPro/plan-runner). |
| `jupiter` | 0.1.1 | Consolidate scattered specs into a canonical master-spec tree -- adopt command reorganizes in place; rewrite command consolidates to single file with optional cleanup; index.json flags split candidates; surface scanner appends stubs for undocumented agents/skills/CLIs/configs. Sourced externally from [github.com/MisterVitoPro/jupiter](https://github.com/MisterVitoPro/jupiter). |
| `migration-runner` | 0.1.0 | Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems (npm, Python, Go, Rust, Java, Kotlin, C#) -- detect produces a vuln-aware plan; run executes wave-by-wave with verifier + git rollback. Sourced externally from [github.com/MisterVitoPro/migration-runner](https://github.com/MisterVitoPro/migration-runner). |
| `llm-wiki` | 0.1.0 | Generate a navigable multi-page Markdown wiki under .llm-wiki/, engineered for on-demand retrieval as Claude's context while staying human-readable. Two-pass outline-then-fill across a swarm (wiki-planner, wiki-diagram-author, wiki-overview-writer, wiki-module-writer, wiki-index-synthesizer); consumes a code-atlas index as ground truth when present, else self-scans. Pure static Markdown (no embeddings), Mermaid diagrams from the dependency graph, per-page source provenance, git-blob hash-diff staleness detection (only stale pages regenerate). Pages + index are committed; state.json cache is gitignored. SessionStart hook loads index.md. Bundled dependency-free deterministic validator (scripts/validate.js: frontmatter, cross-link resolution, Mermaid structural lint, index honesty) gates both skills, with a node --test suite. Sourced externally from [github.com/MisterVitoPro/llm-wiki](https://github.com/MisterVitoPro/llm-wiki). |

### Directory Layout

```
.claude-plugin/marketplace.json              # central registry -- every plugin sourced externally: qa-swarm, code-atlas, plan-runner, jupiter, migration-runner, llm-wiki (each at github.com/MisterVitoPro/<name>)
```

## Adding a Plugin

1. Create a standalone repo at `github.com/MisterVitoPro/<name>` with `.claude-plugin/plugin.json`, `agents/`, `skills/`, and `README.md` at its root; tag it `v<version>`.
2. Register it in `.claude-plugin/marketplace.json` with a `url` source pointing at the repo, plus the tag `ref` and commit `sha`.
3. Update root README.md (per-plugin section, version badge, docs link).

## Versioning

Every plugin lives in its own repo: bump that repo's `.claude-plugin/plugin.json`, tag it plain `v<version>`, then bump the `ref`/`sha` on the plugin's `source` entry in `.claude-plugin/marketplace.json` here.

<!-- code-atlas:start -->
<!-- generated: 2026-04-09 | commit: d9feed2 | plugin: code-atlas v1.0.0 -->

## Architecture

### Tech Stack
- **Language(s):** Markdown (agent/skill/hook definitions), JSON (plugin manifests, marketplace config)
- **Framework:** Claude Code plugin system (multi-plugin marketplace)
- **Package Manager:** None (metadata-driven plugin system -- no runtime dependencies)
- **CI:** GitHub (git tag-based releases, `<plugin-name>/v<version>` tagging convention)

### Directory Map
```
.claude-plugin/             # Marketplace registry -- lists every plugin with its external source repo
                            # (no local plugins/ dir: each plugin lives in its own repo at
                            #  github.com/MisterVitoPro/<name> -- qa-swarm, code-atlas, plan-runner,
                            #  jupiter, migration-runner, llm-wiki)
```

### Key Files
| File | Role |
|------|------|
| `.claude-plugin/marketplace.json` | Plugin registry (all six plugins, each pointing at its external source repo) |
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
No circular dependencies. Each plugin is independent; marketplace.json registers all six.

### Build & Run Commands
```bash
# Add this marketplace, then install any plugin from it
claude plugin marketplace add MisterVitoPro/qa-claude-market
claude plugin install <plugin-name>@mistervitopro-plugin-marketplace

# Releasing: tag v<version> in the plugin's OWN repo, then bump ref/sha on its
# source entry in .claude-plugin/marketplace.json here (see Versioning above)
```

<!-- code-atlas:end -->
