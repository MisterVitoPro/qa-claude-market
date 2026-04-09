# MisterVitoPro Plugin Marketplace

A collection of Claude Code plugins for code quality, architecture, and developer productivity.

## Available Plugins

### [qa-swarm](plugins/qa-swarm/) `v1.2.1`

AI-powered code quality analyzer. Runs 4-10 specialized agents in parallel to find security, performance, architecture, and correctness issues -- then fixes them via TDD.

- Parallel analysis across security, performance, architecture, and correctness
- Findings deduplicated, ranked P0-P3, and corroborated across agents
- Fixes implemented test-first with failing tests before code changes

```bash
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin qa-swarm
/qa-swarm:attack "find bugs in the authentication flow"
```

### [code-atlas](plugins/code-atlas/) `v1.0.0`

Scans a codebase and generates a comprehensive architecture index for CLAUDE.md -- directory map, key files, tech stack, patterns, dependencies, and build commands.

- 3 Haiku agents scan structure, patterns, and dependencies in parallel
- Incremental updates detect changes via `git diff` and re-scan only what changed
- SessionStart hook auto-detects stale indexes

```bash
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin code-atlas
/code-atlas:map
```

## Installation

Install a specific plugin from this marketplace:

```bash
# Install a plugin by name
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin <plugin-name>
```

Available plugins: `qa-swarm`, `code-atlas`

## Contributing a Plugin

1. Create a new directory under `plugins/<plugin-name>/`
2. Add a `.claude-plugin/plugin.json` manifest inside it
3. Add your agents, skills, and docs
4. Register it in `.claude-plugin/marketplace.json` by adding an entry to the `plugins` array
5. Add a `README.md` to your plugin directory

Each plugin is independently versioned via its own `plugin.json`. When a version is bumped and pushed to main, tag it as `<plugin-name>/v<version>` (e.g., `qa-swarm/v1.2.1`).

## License

Each plugin is individually licensed. See the respective plugin directories for details.
