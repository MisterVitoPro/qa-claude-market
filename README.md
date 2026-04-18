# MisterVitoPro Plugin Marketplace

A collection of Claude Code plugins for code quality, architecture, and developer productivity.

## Available Plugins

### [qa-swarm](plugins/qa-swarm/) ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-swarm%2Fmain%2Fplugins%2Fqa-swarm%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

AI-powered code quality analyzer. Runs 6-12 specialized agents in parallel to find security, performance, architecture, correctness, data flow, and async issues -- then fixes them via TDD.

- 6 Sonnet core agents + up to 6 Haiku optional agents in parallel
- Findings deduplicated, ranked P0-P3, and corroborated across agents
- Fixes implemented test-first with failing tests before code changes
- Context7 MCP baseline across all agents for up-to-date framework docs

```bash
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin qa-swarm
/qa-swarm:attack "find bugs in the authentication flow"
/qa-swarm:implement
```

### [code-atlas](plugins/code-atlas/) ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-swarm%2Fmain%2Fplugins%2Fcode-atlas%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

Scans a codebase and generates a comprehensive architecture index for CLAUDE.md -- directory map, key files, tech stack, patterns, dependencies, and build commands.

- 3 agents scan structure, patterns, and dependencies in parallel
- Incremental updates detect changes via `git diff` and re-scan only what changed
- SessionStart hook auto-detects stale indexes and prompts for updates

```bash
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin code-atlas
/code-atlas:map
/code-atlas:update
```

### [plan-runner](plugins/plan-runner/) ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-swarm%2Fmain%2Fplugins%2Fplan-runner%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

Takes a free-form Markdown implementation plan and runs it through a parallel agent swarm with per-wave verification, then generates a prioritized bug-fix plan for re-runs.

- Analyzes plan into file-disjoint waves of up to 6 agents each
- Dev agents implement tasks in parallel; verifier agents check acceptance criteria per wave
- Aggregator deduplicates bugs, ranks P0-P3, and produces a `fix-plan.md` for re-runs
- Per-wave git commits keep history clean and bisectable

```bash
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin plan-runner
/plan-runner:run my-plan.md
```

## Installation

Add this marketplace to Claude Code, then install plugins by name:

```bash
# Add the marketplace
claude plugin marketplace add MisterVitoPro/qa-swarm

# Install a specific plugin
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin <plugin-name>
```

Available plugins: `qa-swarm`, `code-atlas`, `plan-runner`

## Contributing a Plugin

1. Create a new directory under `plugins/<plugin-name>/`
2. Add a `.claude-plugin/plugin.json` manifest inside it
3. Add your agents, skills, and docs
4. Register it in `.claude-plugin/marketplace.json` by adding an entry to the `plugins` array
5. Add a `README.md` to your plugin directory

Each plugin is independently versioned via its own `plugin.json`. When a version is bumped and pushed to main, tag it as `<plugin-name>/v<version>` (e.g., `qa-swarm/v1.4.1`).

## License

Each plugin is individually licensed. See the respective plugin directories for details.
