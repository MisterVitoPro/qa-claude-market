# MisterVitoPro Plugin Marketplace

A collection of Claude Code plugins.

## Available Plugins

| Plugin | Description | Version |
|--------|-------------|---------|
| [qa-swarm](plugins/qa-swarm/) | AI-powered code quality analyzer: specialized agents find security, performance, architecture, and correctness issues, then fix them via TDD | 1.2.1 |

## Installation

Install a specific plugin from this marketplace:

```bash
claude plugin marketplace add MisterVitoPro/qa-swarm
```

## Adding a New Plugin

1. Create a new directory under `plugins/<plugin-name>/`
2. Add a `.claude-plugin/plugin.json` manifest inside it
3. Add your agents, skills, and docs
4. Register it in `.claude-plugin/marketplace.json` by adding an entry to the `plugins` array
5. Add a README.md to your plugin directory

## License

See individual plugin directories for their respective licenses.
