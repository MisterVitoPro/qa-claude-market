# QA Plugin Marketplace

A collection of Claude Code plugins for code quality, architecture, and developer productivity.

## Available Plugins

### [qa-swarm](plugins/qa-swarm/) ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fqa-swarm%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

AI-powered code quality analyzer. Runs 6-12 specialized agents in parallel to find security, performance, architecture, correctness, data flow, and async issues -- then fixes them via TDD.

- 6 Sonnet core agents + up to 6 Haiku optional agents in parallel
- Findings deduplicated, ranked P0-P3, and corroborated across agents
- Fixes implemented test-first with failing tests before code changes
- Context7 MCP baseline across all agents for up-to-date framework docs

### [code-atlas](plugins/code-atlas/) ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fcode-atlas%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

Scans a codebase and generates a comprehensive architecture index with semantic graph and query capability -- directory map, key files, tech stack, patterns, dependencies, and build commands.

- 3 agents scan structure, patterns, and dependencies in parallel
- Semantic graph with queryable knowledge base via `/code-atlas:query` for dependency analysis
- Incremental updates detect changes via hash-diffing and re-scan only what changed
- SessionStart hook auto-detects stale indexes and prompts for updates

### [plan-runner](plugins/plan-runner/) ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fplan-runner%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

Takes a free-form Markdown implementation plan and runs it through a parallel agent swarm with per-wave verification, then generates a prioritized bug-fix plan for re-runs.

- Analyzes plan into file-disjoint waves of up to 6 agents each
- Dev agents implement tasks in parallel; verifier agents check acceptance criteria per wave
- Aggregator deduplicates bugs, ranks P0-P3, and produces a `fix-plan.md` for re-runs
- Per-wave git commits keep history clean and bisectable

## Installation

Add the marketplace to Claude Code and install plugins individually:

```bash
# Add the marketplace
claude plugin marketplace add MisterVitoPro/qa-claude-market

# Install plugins
claude plugin marketplace add MisterVitoPro/qa-claude-market --plugin qa-swarm
claude plugin marketplace add MisterVitoPro/qa-claude-market --plugin code-atlas
claude plugin marketplace add MisterVitoPro/qa-claude-market --plugin plan-runner
```

Or add the marketplace once, then install each plugin by name:

```bash
# Add once
claude plugin marketplace add MisterVitoPro/qa-claude-market

# Then install any plugin
claude plugin marketplace add MisterVitoPro/qa-claude-market --plugin qa-swarm
/qa-swarm:attack "find bugs in the authentication flow"
/qa-swarm:implement

claude plugin marketplace add MisterVitoPro/qa-claude-market --plugin code-atlas
/code-atlas:map
/code-atlas:update

claude plugin marketplace add MisterVitoPro/qa-claude-market --plugin plan-runner
/plan-runner:run my-plan.md
```

## Contributing a Plugin

1. Create a new directory under `plugins/<plugin-name>/`
2. Add a `.claude-plugin/plugin.json` manifest inside it
3. Add your agents, skills, and docs
4. Register it in `.claude-plugin/marketplace.json` by adding an entry to the `plugins` array
5. Add a `README.md` to your plugin directory

Each plugin is independently versioned via its own `plugin.json`. When a version is bumped and pushed to main, tag it as `<plugin-name>/v<version>` (e.g., `qa-swarm/v1.4.1`).

## License

All plugins use MIT license. See [LICENSE](LICENSE) and individual plugin directories for details.
