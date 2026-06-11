# Code Atlas Schema Reference

Defines the exact shape of the three artifacts written to `.code-atlas/` by
`/code-atlas:map` and `/code-atlas:update`.

| Artifact | Schema version | Purpose | Consumed by |
|----------|----------------|---------|-------------|
| `atlas.json` | 1 | Curated, capped summary injected at session start | SessionStart hook |
| `state.json` | 1 | Full internal cache: file index, import graph, raw agent outputs | `/code-atlas:update` |
| `graph-schema.json` | 2 | Semantic dependency graph: annotated nodes and edges | `/code-atlas:query`, `scripts/query.js` |

All three artifacts share the same `_header` shape (only `schema_version` differs):

```json
{
  "_header": {
    "schema_version": 1,
    "plugin_version": "2.1.0",
    "generated_at": "2026-06-11T00:00:00Z",
    "baseline_commit": "abc1234",
    "scan_root": "."
  }
}
```

- `schema_version` — integer format version: `1` for atlas.json and state.json, `2` for graph-schema.json
- `plugin_version` — the `version` field from this plugin's `.claude-plugin/plugin.json` at generation time
- `generated_at` — ISO 8601 UTC timestamp
- `baseline_commit` — `git rev-parse --short HEAD` at generation time; empty string if not a git repo
- `scan_root` — directory argument passed to the scan, else `"."`

---

## atlas.json

Curated summary. Every list is capped so the session-start injection stays
token-cheap. Caps: `directory_map` <= 30, `key_files` <= 15, `high_traffic` <= 10,
`module_boundaries` <= 8, `conventions` <= 10, `build_commands` <= 8.

```json
{
  "_header": { "schema_version": 1, "...": "..." },
  "tech_stack": {
    "languages": [{ "name": "TypeScript", "config": "tsconfig.json", "notes": "strict mode" }],
    "frameworks": [{ "name": "Express.js", "version": "4.x", "evidence": "package.json" }],
    "build": [{ "tool": "esbuild", "config": "package.json scripts" }],
    "test": [{ "framework": "Jest", "config": "jest.config.ts" }],
    "lint": [{ "tool": "ESLint", "config": ".eslintrc.js", "notes": "" }],
    "ci": [{ "platform": "GitHub Actions", "config": ".github/workflows/ci.yml" }],
    "package_manager": "npm"
  },
  "architecture_pattern": "Layered MVC",
  "architecture_evidence": "routes/ -> controllers/ -> services/ -> models/",
  "directory_map": [
    { "path": "src/controllers", "purpose": "HTTP request handlers, one file per resource", "category": "source" }
  ],
  "key_files": [
    { "path": "src/index.ts", "role": "entry_point", "description": "Server startup, route mounting" }
  ],
  "entry_points": ["src/index.ts"],
  "high_traffic": [
    { "path": "src/utils/logger.ts", "importer_count": 12, "description": "Logging utility used across all layers" }
  ],
  "module_boundaries": [
    { "path": "src/auth", "type": "feature", "description": "Self-contained authentication module" }
  ],
  "external_dependencies": [
    { "name": "express", "purpose": "HTTP server framework", "usage": "core" }
  ],
  "circular_dependencies": [
    { "chain": ["src/a.ts", "src/b.ts", "src/a.ts"], "severity": "minor", "description": "..." }
  ],
  "dependency_flow": "routes -> controllers -> services -> models",
  "conventions": [
    { "area": "naming", "rule": "camelCase files, PascalCase classes", "evidence": ">90% of src/" }
  ],
  "build_commands": [
    { "command": "npm run dev", "purpose": "Start development server" }
  ]
}
```

Enum values:

- `directory_map[].category` — `source | test | config | documentation | scripts | build_output | assets | migration`
- `key_files[].role` — `entry_point | config | core_module | utility | test | documentation | build_script | migration | middleware | route_definition | model | public_api`
- `external_dependencies[].usage` — `core | utility | dev_only`
- `circular_dependencies[].severity` — `critical | minor`

---

## state.json

Full cache. No caps. Never injected into context; read only by `/code-atlas:update`
for hash diffing and incremental regeneration.

```json
{
  "_header": { "schema_version": 1, "...": "..." },
  "file_index": {
    "src/index.ts": {
      "hash": "<git blob oid or sha256:<hex>>",
      "size_bytes": 1024,
      "lang": "typescript",
      "category": "source"
    }
  },
  "import_graph": {
    "src/index.ts": ["src/config.ts", "express"]
  },
  "importer_counts": {
    "src/config.ts": 7
  },
  "external_dependencies": [],
  "circular_dependencies": [],
  "raw_agent_outputs": {
    "atlas_structure": {},
    "atlas_patterns": {},
    "atlas_dependencies": {},
    "graph_synthesizer": []
  },
  "last_run": {
    "strategy": "full_scan",
    "duration_seconds": 0,
    "agents_used": 4,
    "files_scanned": 0,
    "files_hashed": 0
  }
}
```

- `file_index` keys are repo-relative paths. `hash` is the git blob OID for
  tracked files, or `sha256:<hex>` for untracked files.
- `import_graph` values mix resolved repo-relative paths (internal imports) and
  bare package names (external imports).
- `importer_counts` counts only internal imports, per distinct importing file.
- `last_run.strategy` — `full_scan | targeted | micro`

---

## graph-schema.json

Semantic dependency graph. `schema_version` is `2`. Queryable deterministically
via `node scripts/query.js` and through `/code-atlas:query`. Validate with
`node scripts/query.js --validate`.

```json
{
  "_header": { "schema_version": 2, "...": "..." },
  "nodes": {
    "src/auth": {
      "type": "module",
      "files": ["src/auth/index.ts", "src/auth/middleware.ts"],
      "role": "middleware",
      "criticality": "critical",
      "stability": "stable",
      "test_coverage": "well_tested",
      "description": "Authentication layer — JWT verification, session middleware"
    }
  },
  "edges": [
    {
      "source": "src/server",
      "target": "src/auth",
      "type": "direct_import",
      "strength": "core",
      "directionality": "required",
      "impact": "breaking_change_risk"
    }
  ],
  "metadata": {
    "total_nodes": 10,
    "total_edges": 20,
    "key_modules_analyzed": 10,
    "circular_dependency_count": 1
  }
}
```

### Node fields

| Field | Values | Notes |
|-------|--------|-------|
| `type` | `module`, `file` | `module` = directory-level subsystem; `files` lists its source files and is present ONLY for modules |
| `role` | `entry_point`, `core_module`, `utility`, `config`, `middleware`, `model`, `public_api`, `route_definition`, `internal` | Assigned by the graph-synthesizer agent |
| `criticality` | `critical` (importers >= 10), `high` (>= 5), `medium` (>= 2), `low` (< 2) | Derived from `importer_counts` |
| `stability` | `stable`, `evolving`, `experimental` | Path markers + recency |
| `test_coverage` | `well_tested`, `partial`, `untested` | Colocated/stem-matched test files |
| `description` | string, <= 80 chars | Concrete, codebase-specific |

### Edge fields

| Field | Values |
|-------|--------|
| `type` | `direct_import`, `dynamic_import`, `inheritance`, `composition`, `configuration`, `sideeffect` |
| `strength` | `core`, `utility`, `optional` |
| `directionality` | `required`, `circular`, `conditional` |
| `impact` | `breaking_change_risk`, `ripple_effect_magnitude`, `""` (no annotation) |

### Invariants (enforced by `scripts/query.js --validate`)

1. Every `edges[].source` and `edges[].target` is a key in `nodes`.
2. `metadata.total_nodes` equals the actual node count; `metadata.total_edges`
   equals the actual edge count.
3. `module` nodes have a `files` array; `file` nodes do not.
4. All enum fields use only the values listed above.

### Deterministic edge derivation (used by `/code-atlas:map`)

Edges are derived from `state.json.import_graph`, not invented:

1. Map every file in `import_graph` to its covering graph node: the file itself
   if it is a node key, else its nearest ancestor directory that is a node key.
   Files with no covering node are skipped.
2. For each resolved internal import, map the target the same way. If source
   and target map to different nodes, that is a candidate edge.
3. Deduplicate candidate edges; remember the count of underlying file-level
   imports per edge (its weight).
4. Annotate:
   - `type`: `configuration` if the target node's role is `config`; otherwise `direct_import`. (`dynamic_import`, `inheritance`, `composition`, `sideeffect` may be assigned when evidence exists in the extracted import data.)
   - `strength`: `core` if weight >= 3 or the target criticality is `critical`; `optional` if weight == 1 and target criticality is `low`; otherwise `utility`.
   - `directionality`: `circular` if the reverse edge also exists (mark both); otherwise `required`.
   - `impact`: `breaking_change_risk` if strength is `core` and target criticality is `critical` or `high`; else `ripple_effect_magnitude` if the target's importer count is >= 10; else `""`.
