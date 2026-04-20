# Project Instructions

## Overview

Multi-plugin marketplace repository. Each plugin lives under `plugins/` with its own `.claude-plugin/plugin.json`, agents, skills, and docs. See Architecture section for tech stack, directory map, key files, and conventions.

### Current Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| `qa-swarm` | 1.4.1 | AI-powered code quality analyzer: 6 Sonnet core agents + optional Haiku, 3-agent parallel TDD, fresh-context subagent handoff, Context7 MCP baseline across all agents |
| `code-atlas` | 2.0.0 | Architecture index generator with semantic graph -- writes .code-atlas/atlas.json, state.json, and graph-schema.json, loaded by session-start hook. Queryable via /code-atlas:query. Directory map, tech stack, patterns, dependencies. |
| `plan-runner` | 0.4.0 | Run a Markdown implementation plan through a parallel agent swarm: analyze into waves, dispatch dev + verifier agents, aggregate bugs into a fix-plan, re-run on demand |
| `jupiter` | 0.1.1 | Consolidate scattered specs into a canonical master-spec tree -- adopt command reorganizes in place; rewrite command consolidates to single file with optional cleanup; index.json flags split candidates; surface scanner appends stubs for undocumented agents/skills/CLIs/configs |

### Directory Layout

```
.claude-plugin/marketplace.json              # central registry
plugins/
  qa-swarm/.claude-plugin/plugin.json        # manifest (v1.4.1)
  code-atlas/.claude-plugin/plugin.json      # manifest (v2.0.0)
  plan-runner/.claude-plugin/plugin.json     # manifest (v0.4.0)
  jupiter/.claude-plugin/plugin.json         # manifest (v0.1.1)
```

## Adding a Plugin

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`, agents/, skills/, README.md
2. Register in `.claude-plugin/marketplace.json`
3. Update root README.md

## Versioning

Bump `plugins/<name>/.claude-plugin/plugin.json` before pushing. Tag as `<plugin-name>/v<version>` and push with `git push origin --tags`.

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
.claude-plugin/             # Marketplace registry -- lists all plugins with source paths
plugins/                    # Root directory containing all plugins
  qa-swarm/                 # AI-powered code quality analyzer (v1.4.1)
    .claude-plugin/         # Plugin manifest and metadata
    agents/                 # 16 QA agent definitions (security, perf, correctness, architecture, data flow, async, etc.)
    skills/                 # User-facing commands: attack (analyze), implement (fix)
    docs/                   # Master spec, design plans, implementation plans
  code-atlas/               # Architecture index generator with semantic graph (v2.0.0)
    .claude-plugin/         # Plugin manifest and metadata
    agents/                 # 4 analysis agents (structure, patterns, dependencies, graph synthesizer)
    skills/                 # User-facing commands: map (full scan), update (incremental), query (graph interrogation)
    hooks/                  # SessionStart hook for auto-staleness detection
  plan-runner/                # Plan-driven parallel agent orchestrator (v0.4.0)
    .claude-plugin/
    agents/                   # 4 agents (analyzer, dev, verifier, aggregator)
    skills/                   # User-facing command: run
    schemas/                  # JSON Schemas for agent contracts
    test-fixtures/            # Reference plans for smoke testing
  jupiter/                  # Spec consolidation + codebase surface scanner (v0.1.1)
    .claude-plugin/         # Plugin manifest and metadata
    agents/                 # 2 pipeline agents (spec-cataloger, surface-scanner)
    skills/                 # User-facing commands: adopt, rewrite
    schemas/                # JSON Schemas for agent and index contracts
    test-fixtures/          # Reference fixtures for smoke testing
```

### Key Files
| File | Role |
|------|------|
| `.claude-plugin/marketplace.json` | Plugin registry |
| `plugins/*/skills/*.md` | Skill entry points |
| `plugins/*/agents/*.md` | Agent definitions |
| `plugins/qa-swarm/docs/MASTER-SPEC.md` | QA Swarm spec |

### Patterns & Conventions
- Agents: Markdown + YAML frontmatter (`name`, `description`, `model`, `color`)
- Skills: `skills/<name>/SKILL.md` with frontmatter
- Hooks: `hooks/<name>/HOOK.md` with `trigger`
- Naming: kebab-case; skills as `plugin:name`
- Models: Sonnet (core/aggregation), Haiku (optional), Opus (impl)
- Output: Agents return JSON; skills produce Markdown
- License: MIT

### Dependencies
No circular dependencies. Each plugin is independent; marketplace.json registers all three.

### Build & Run Commands
```bash
claude plugin marketplace add MisterVitoPro/qa-claude-market
claude plugin marketplace add MisterVitoPro/qa-claude-market --plugin <qa-swarm|code-atlas|plan-runner>
git tag <plugin-name>/v<version>
git push origin --tags
```

<!-- code-atlas:end -->
