# Repository Instructions

This repository publishes the same external plugin catalog to Claude Code and Codex.

- `.claude-plugin/marketplace.json` is the Claude Code catalog and the canonical source for plugin names and release pins.
- `.agents/plugins/marketplace.json` is the Codex catalog. Keep every plugin's `name`, `source.url`, `source.ref`, and `source.sha` identical to the Claude catalog.
- Codex entries must include `policy.installation`, `policy.authentication`, and `category`.
- Each external plugin must ship both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` before documenting it as usable on both hosts.
- Run the marketplace validation steps from `.github/workflows/lint.yml` after changing either catalog.

Do not add plugin implementations to this repository. Each plugin lives in its own `MisterVitoPro/<plugin-name>` repository.
