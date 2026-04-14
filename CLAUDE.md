# Project Instructions

## Codebase Exploration

Before using the Explore agent or doing broad codebase searches, **always consult the Architecture section in this file first** (Directory Map, Key Files, Module Dependencies). The architecture index below contains a pre-built map of the entire repository -- directory purposes, key files, tech stack, patterns, and dependency graph. Use it to orient yourself and target your exploration rather than scanning blindly. When spawning an Explore agent, include relevant atlas context in its prompt so it starts informed.

## Repository Structure

This is a **multi-plugin marketplace** repository. Each plugin lives in its own directory under `plugins/`.

### Current Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| `qa-swarm` | 1.4.1 | AI-powered code quality analyzer: 6 Sonnet core agents + optional Haiku, 3-agent parallel TDD, fresh-context subagent handoff, Context7 MCP baseline across all agents |
| `code-atlas` | 1.1.0 | Architecture index generator for CLAUDE.md -- directory map, tech stack, patterns, dependencies |

### Directory Layout

```
.claude-plugin/
  marketplace.json     # marketplace registry -- lists all plugins with source paths
plugins/
  qa-swarm/            # AI-powered code quality analyzer
    .claude-plugin/
      plugin.json      # plugin manifest (name, version, keywords)
    agents/            # agent definitions
    skills/            # user-facing skill commands
    docs/              # plugin documentation
    README.md
    LICENSE
  code-atlas/          # Architecture index generator
    .claude-plugin/
      plugin.json
    agents/
    skills/
    hooks/             # SessionStart hook for auto-staleness detection
    README.md
    LICENSE
```

## Adding a New Plugin

1. Create `plugins/<plugin-name>/` with its own `.claude-plugin/plugin.json`, agents, skills, etc.
2. Add an entry to `.claude-plugin/marketplace.json` under the `plugins` array.
3. Add a `README.md` to the plugin directory.
4. Update the root `README.md` with the new plugin listing.
5. Each plugin is independently versioned via its own `plugin.json`.

## Versioning

Each plugin has its own version in `plugins/<name>/.claude-plugin/plugin.json`. When a plugin version is changed and pushed to main, create a git tag matching `<plugin-name>/v<version>` (e.g., `git tag qa-swarm/v1.2.1`) and push it (`git push origin --tags`).

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
  code-atlas/               # Architecture index generator (v1.0.0)
    .claude-plugin/         # Plugin manifest and metadata
    agents/                 # 3 analysis agents (structure, patterns, dependencies)
    skills/                 # User-facing commands: map (full scan), update (incremental)
    hooks/                  # SessionStart hook for auto-staleness detection
```

### Key Files
| File | Role | Description |
|------|------|-------------|
| `.claude-plugin/marketplace.json` | Config | Central plugin registry -- lists all plugins with names, sources, and categories |
| `CLAUDE.md` | Config | Project instructions, repository structure, versioning strategy |
| `plugins/qa-swarm/.claude-plugin/plugin.json` | Config | QA Swarm manifest (v1.4.1, keywords, license) |
| `plugins/qa-swarm/skills/attack/SKILL.md` | Entry point | Orchestrates QA swarm: setup, deploy 6-12 agents, aggregate, plan fixes, auto-handoff to implement in fresh-context subagent |
| `plugins/qa-swarm/skills/implement/SKILL.md` | Entry point | Implements fixes from attack output via TDD (red-green loop) |
| `plugins/qa-swarm/agents/qa-aggregator.md` | Core module | Merges findings, applies P0-P3 ranking, confidence tags, corroboration scoring |
| `plugins/qa-swarm/agents/qa-fix-planner.md` | Core module | Produces implementation spec and TDD test plan from ranked report |
| `plugins/qa-swarm/docs/MASTER-SPEC.md` | Documentation | Comprehensive QA Swarm specification |
| `plugins/code-atlas/.claude-plugin/plugin.json` | Config | Code Atlas manifest (v1.0.0, keywords, license) |
| `plugins/code-atlas/skills/map/SKILL.md` | Entry point | Full architecture scan: deploy 3 agents, synthesize, write to CLAUDE.md |
| `plugins/code-atlas/skills/update/SKILL.md` | Entry point | Incremental update: detect changes, micro/targeted/full re-scan |
| `plugins/code-atlas/hooks/session-start/HOOK.md` | Middleware | Auto-checks CLAUDE.md staleness at session start, suggests or triggers updates |
| `plugins/code-atlas/agents/atlas-structure.md` | Core module | Directory tree analysis, key file identification, module boundaries |
| `plugins/code-atlas/agents/atlas-patterns.md` | Core module | Tech stack detection, naming conventions, architectural patterns |
| `plugins/code-atlas/agents/atlas-dependencies.md` | Core module | Import graph, high-traffic modules, circular dependency detection |

### Patterns & Conventions
- **Architecture:** Multi-plugin marketplace -- each plugin is self-contained with manifest, agents, skills, and docs
- **Agent definitions:** Markdown files with YAML frontmatter (`name`, `description`, `model`, `color`) + task instructions in body
- **Skill definitions:** Markdown in `skills/<name>/SKILL.md` with frontmatter (`name`, `description`, `argument-hint`)
- **Hook definitions:** Markdown in `hooks/<name>/HOOK.md` with `trigger` field in frontmatter
- **Naming:** kebab-case for plugin/directory names; kebab-case with colon prefix for skill names (`qa-swarm:attack`)
- **Model assignment:** Sonnet for core analysis agents; Haiku for optional analysis agents; Sonnet for aggregation/planning; Opus for implementation
- **Orchestration:** Skills deploy multiple agents in parallel, aggregate results inline or via dedicated agent
- **Output format:** Agents return structured JSON; skills produce Markdown reports with specs/plans
- **Versioning:** Independent per-plugin in `plugin.json`; git tags as `<plugin-name>/v<version>`
- **Licensing:** MIT for all plugins

### Module Dependencies
```
marketplace.json -> [qa-swarm, code-atlas]

qa-swarm pipeline:
  skills/attack -> agents (6 core + up to 6 optional, parallel)
               -> inline aggregation
               -> agents/qa-fix-planner (spec + tests)
               -> docs/qa-swarm/{date}-*.md (output files)
               -> fresh-context subagent (auto-handoff) -> skills/implement
  skills/implement -> docs/qa-swarm/{date}-*.md (input files)
                  -> 3 parallel qa-tdd agents (test writing, file-partitioned)
                  -> Context7 MCP (optional, for current framework docs)

code-atlas pipeline:
  skills/map -> agents (3 in parallel: structure, patterns, dependencies)
             -> inline synthesis
             -> CLAUDE.md (output)
  skills/update -> CLAUDE.md (read + write)
  hooks/session-start -> CLAUDE.md (staleness check)
                      -> skills/update or skills/map (suggested)
```

No circular dependencies detected.

### Build & Run Commands
| Command | Purpose |
|---------|---------|
| `claude plugin marketplace add MisterVitoPro/qa-swarm` | Add the marketplace to Claude Code |
| `claude plugin marketplace add MisterVitoPro/qa-swarm --plugin qa-swarm` | Install qa-swarm plugin |
| `claude plugin marketplace add MisterVitoPro/qa-swarm --plugin code-atlas` | Install code-atlas plugin |
| `git tag <plugin-name>/v<version>` | Tag a plugin release |
| `git push origin --tags` | Push release tags to remote |

<!-- code-atlas:end -->
