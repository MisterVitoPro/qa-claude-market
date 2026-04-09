# Project Instructions

## Repository Structure

This is a **multi-plugin marketplace** repository. Each plugin lives in its own directory under `plugins/`.

### Current Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| `qa-swarm` | 1.2.1 | AI-powered code quality analyzer with parallel agent swarm and TDD-driven fixes |
| `code-atlas` | 1.0.0 | Architecture index generator for CLAUDE.md -- directory map, tech stack, patterns, dependencies |

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
