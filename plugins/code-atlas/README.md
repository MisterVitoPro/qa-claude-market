# Code Atlas

Scan a codebase and generate a comprehensive architecture index as JSON artifacts under `.code-atlas/` -- giving Claude a head start on understanding the project structure, patterns, and conventions.

Part of the [MisterVitoPro Plugin Marketplace](../../README.md).

Instead of exploring cold every session, Claude reads the architecture index at session start and already knows where things are, what patterns to follow, and how to build and test the project.

## Quick Start

```bash
# Install
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin code-atlas

# Generate the architecture index
/code-atlas:map

# After making structural changes, update incrementally
/code-atlas:update
```

## Artifacts

Running `/code-atlas:map` creates two JSON files under `.code-atlas/`:

- `atlas.json` -- curated summary (directory map, key files, tech stack, top high-traffic modules, dependency flow, build commands). Loaded into Claude's session context by the session-start hook. Target size <= 5 KB.
- `state.json` -- internal cache (per-file content hashes, complete import graph, full importer counts, raw agent outputs). Used by `/code-atlas:update` for incremental change detection.

On first run, `.code-atlas/` is appended to `.gitignore` if one exists. The cache is regenerable and should not be committed.

CLAUDE.md is never modified by this plugin. Architecture context is delivered exclusively through the session-start hook loading `atlas.json`.

## What Gets Generated

`atlas.json` (the curated summary Claude reads each session) includes:

| Section | What It Contains |
|---------|------------------|
| **Tech Stack** | Languages, frameworks, build tools, test frameworks, linters, CI |
| **Directory Map** | Every directory annotated with its purpose (up to 30 entries) |
| **Key Files** | The 10-15 most important files with roles and descriptions |
| **Conventions** | Architecture style, naming rules, testing patterns, import conventions |
| **High-Traffic Modules** | Top 10 files by importer count -- where changes have wide blast radius |
| **Dependency Flow** | One-line summary of primary dependency direction |
| **Build & Run Commands** | Dev, build, test, lint commands extracted from config files |

`state.json` (the full cache, unbounded) additionally includes the complete `file_index` (hash per file), the complete `import_graph`, the complete `importer_counts`, external dependencies, circular dependency chains, and the raw agent outputs from the last run.

See `docs/schema-reference.md` for the full JSON schema.

## How It Works

### `/code-atlas:map` -- Full Scan

```
Step 1: File Index & Categorize
  - Build hashed file index via git ls-files -s (free hashing for tracked files)
  - Compute sha256 for untracked files
  - Detect primary languages from extension counts
  - Read all config files (package.json, tsconfig.json, Cargo.toml, etc.)
  - Full-tree import extraction: run language-specific regex across EVERY source file
  - Build import_graph and importer_counts

Step 2: Parallel Agent Scan (3 Haiku agents)
  - Structure Analyst:    directory map, key files, entry points
  - Pattern Analyst:      tech stack, conventions, build commands
  - Dependency Analyst:   receives the COMPLETE import graph -- counts are exact, not sampled

Step 3: Synthesis (inline, no agent)
  - Merge agent outputs, apply size caps
  - Assemble atlas.json (curated) and state.json (full cache)

Step 4: Write Artifacts
  - mkdir -p .code-atlas
  - Write atlas.json and state.json (pretty-printed JSON)
  - Append .code-atlas/ to .gitignore if a .gitignore exists
  - Print a legacy notice if CLAUDE.md contains a v1.x <!-- code-atlas:start --> section
    (the plugin does NOT modify CLAUDE.md; the user deletes the legacy section manually)
```

### `/code-atlas:update` -- Incremental Update

Detects what changed since the last map by hash-diffing the current working tree against `state.json.file_index`. This is resilient to rebases and branch switches (no dependency on the old commit still being reachable).

| Change Magnitude | Strategy | Agents | Speed |
|------------------|----------|--------|-------|
| < 5 changed source files, no new top-level dirs | **Micro-update** -- re-extract imports, recompute counts | 0 | seconds |
| 5-30 changed files or 1-2 new top-level dirs | **Targeted update** -- re-run Structure Analyst for changed areas | 1 | ~30s |
| > 30 changed files or >= 3 new source dirs, or `full` arg | **Full re-scan** -- the complete map pipeline | 3 | ~1-2 min |

Pass `full` to force a complete re-scan: `/code-atlas:update full`

Both `atlas.json` and `state.json` are rewritten on every successful update.

### SessionStart Hook -- Read-Only Context Primer

At session start, the hook loads `.code-atlas/atlas.json` into Claude's context. It is strictly read-only:

- **Index exists** -- prints the atlas.json contents under a "## Code Atlas Architecture Index" header so Claude consults it before broad searches.
- **Cached commit != HEAD** -- appends a one-line `Note: Index is stale...` suggestion to run `/code-atlas:update`.
- **No index exists** -- prints a one-line tip to run `/code-atlas:map`.

The hook NEVER writes files, NEVER launches agents, and NEVER runs diffs. Target runtime: under 500 ms. If anything hangs or fails, the hook exits silently so the user is never blocked.

## Agent Roster

| Agent | Specialty | Model |
|-------|-----------|-------|
| Structure Analyst | Directory tree, key files, entry points, module boundaries | Haiku |
| Pattern Analyst | Tech stack, architecture patterns, naming conventions, build commands | Haiku |
| Dependency Analyst | Import graph, high-traffic modules, circular deps, external packages | Haiku |

## Example atlas.json (excerpt)

```json
{
  "_header": {
    "schema_version": 2,
    "plugin_version": "2.0.0",
    "generated_at": "2026-04-14T23:00:00Z",
    "baseline_commit": "abc1234",
    "scan_root": "."
  },
  "tech_stack": {
    "languages": ["TypeScript"],
    "framework": "Express.js 4.x",
    "build": "esbuild",
    "test": "Jest",
    "lint": "ESLint",
    "ci": "GitHub Actions",
    "package_manager": "npm"
  },
  "architecture_pattern": "Layered MVC",
  "directory_map": [
    { "path": "src/controllers", "purpose": "HTTP request handlers, one file per resource", "category": "source" },
    { "path": "src/services", "purpose": "Business logic layer", "category": "source" }
  ],
  "key_files": [
    { "path": "src/index.ts", "role": "entry_point", "description": "Server startup, middleware registration" }
  ],
  "high_traffic": [
    { "path": "src/utils/logger.ts", "importer_count": 12 }
  ],
  "dependency_flow": "routes -> controllers -> services -> models, with utils imported at all layers",
  "build_commands": [
    { "command": "npm run dev", "purpose": "Start dev server with hot reload" }
  ]
}
```

## What's New in v2.0

### graph-schema.json

v2.0 ships `graph-schema.json`: a semantic dependency graph with annotated modules/files (roles, criticality, stability, test_coverage) and dependency edges (type, strength, directionality, impact), queryable via `/code-atlas:query`.

### /code-atlas:query

A new interactive query skill lets you interrogate the architecture index without reading raw JSON:

```bash
/code-atlas:query
```

Supported query types:

| Query Type | Description |
|------------|-------------|
| `filter` | Return files or directories matching a predicate (e.g. category, path glob, role) |
| `dependencies_of` | List every module that the given file imports, transitively or direct-only |
| `dependents_of` | List every module that imports the given file (reverse dependency lookup) |
| `transitive_dependents` | Find all modules that transitively depend on a given module (full upstream consumer set) |

See [docs/query-language-reference.md](docs/query-language-reference.md) for the full query syntax.

### Example Queries

**Filter -- find all entry-point files**

```
/code-atlas:query filter role=entry_point
```

**dependencies_of -- direct imports of a module**

```
/code-atlas:query dependencies_of src/controllers/user.ts --depth 1
```

**dependents_of -- everything that depends on a shared utility**

```
/code-atlas:query dependents_of src/utils/logger.ts
```

---

## Migrating from v1.2 to v2.0

### Breaking Changes

- `_header.schema_version` is now `2` in both `atlas.json` and `state.json`. Tools that hard-code `schema_version: 1` must be updated.
- `atlas.json` no longer includes the raw `import_graph` key at the top level; it has moved exclusively to `state.json`. If you were reading `import_graph` from `atlas.json` directly, switch to `state.json` or use `/code-atlas:query`.

### Migration Steps

1. Delete your existing `.code-atlas/` directory (or run `/code-atlas:map` -- it will overwrite).
2. Run `/code-atlas:map` to regenerate both artifacts at schema v2.
3. Verify `_header.schema_version` is `2` in the new `atlas.json`.
4. If you have scripts that read `atlas.json.import_graph`, update them to read from `state.json.import_graph` instead.
5. Optionally validate the output against the new `.code-atlas/graph-schema.json`.

---

## Version

v2.0.0

## License

MIT
