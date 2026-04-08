# Project Instructions

## Repository Structure

This is a **multi-plugin marketplace** repository. Each plugin lives in its own directory under `plugins/`.

```
plugins/
  qa-swarm/          # AI-powered code quality analyzer
    .claude-plugin/
      plugin.json    # plugin manifest (name, version, keywords)
    agents/          # agent definitions
    skills/          # user-facing skill commands
    docs/            # plugin documentation
    README.md        # plugin-specific readme
    LICENSE
```

The root `.claude-plugin/marketplace.json` is the **marketplace registry** that lists all available plugins with their `source` paths.

## Adding a New Plugin

1. Create `plugins/<plugin-name>/` with its own `.claude-plugin/plugin.json`, agents, skills, etc.
2. Add an entry to `.claude-plugin/marketplace.json` under the `plugins` array.
3. Each plugin is independently versioned via its own `plugin.json`.

## Versioning

Each plugin has its own version in `plugins/<name>/.claude-plugin/plugin.json`. When a plugin version is changed and pushed to main, create a git tag matching `<plugin-name>/v<version>` (e.g., `git tag qa-swarm/v1.2.1`) and push it (`git push origin --tags`).
