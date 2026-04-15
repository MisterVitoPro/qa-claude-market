# Code Atlas JSON Schema Reference

Schema version: 1
Plugin version: 1.2.0

Both `atlas.json` and `state.json` live in `.code-atlas/` at the repo root. Both begin with the shared header below.

## Shared header

```json
{
  "schema_version": 1,
  "plugin_version": "1.2.0",
  "generated_at": "<ISO 8601 UTC timestamp>",
  "baseline_commit": "<short git SHA at time of scan>",
  "scan_root": "<path relative to repo root, usually '.'>"
}
```

Any `schema_version` mismatch on read invalidates the cache and forces a full re-scan.

## atlas.json

Curated summary for Claude's session context. Target size: ≤ 5 KB.

```json
{
  "_header": { /* shared header */ },
  "tech_stack": {
    "languages": ["<string>"],
    "framework": "<string or null>",
    "build": "<string or null>",
    "test": "<string or null>",
    "lint": "<string or null>",
    "ci": "<string or null>",
    "package_manager": "<string or null>"
  },
  "architecture_pattern": "<string or null>",
  "directory_map": [
    { "path": "<repo-relative path>", "purpose": "<one-line>", "category": "source|test|config|documentation|scripts|build_output|assets|migration" }
  ],
  "key_files": [
    { "path": "<repo-relative path>", "role": "entry_point|config|core_module|utility|test|documentation|build_script|migration|middleware|route_definition|model|public_api", "description": "<one-line>" }
  ],
  "high_traffic": [
    { "path": "<repo-relative path>", "importer_count": <integer> }
  ],
  "dependency_flow": "<one-line ASCII>",
  "module_boundaries": [
    { "path": "<repo-relative path>", "type": "feature|layer|shared", "description": "<one-line>" }
  ],
  "conventions": [
    { "area": "<string>", "rule": "<string>" }
  ],
  "build_commands": [
    { "command": "<string>", "purpose": "<one-line>" }
  ]
}
```

Size caps (enforced by synthesis):

- `directory_map` ≤ 30 entries (collapse leaves into parent with "N subdirectories" if over)
- `key_files` ≤ 15
- `high_traffic` ≤ 10
- `module_boundaries` ≤ 8
- `conventions` ≤ 10
- `build_commands` ≤ 8

Entries omitted due to caps still exist in `state.json`.

## state.json

Internal operational cache. Unbounded.

```json
{
  "_header": { /* shared header */ },
  "file_index": {
    "<repo-relative path>": {
      "hash": "<git blob OID for tracked files, or sha256:<hex> for untracked>",
      "size_bytes": <integer>,
      "lang": "<extension without dot, e.g. 'ts', 'py'>",
      "category": "source|test|config|documentation|scripts|build_output|assets|migration"
    }
  },
  "import_graph": {
    "<repo-relative path>": [
      "<repo-relative path for internal imports, or bare package name for external>"
    ]
  },
  "importer_counts": {
    "<repo-relative path>": <integer>
  },
  "external_dependencies": [
    { "name": "<string>", "purpose": "<string>", "usage": "core|utility|dev_only" }
  ],
  "circular_dependencies": [
    { "chain": ["<path>", "<path>"], "severity": "critical|minor", "description": "<string>" }
  ],
  "raw_agent_outputs": {
    "atlas_structure": { /* verbatim agent JSON */ },
    "atlas_patterns":  { /* verbatim agent JSON */ },
    "atlas_dependencies": { /* verbatim agent JSON */ }
  },
  "last_run": {
    "strategy": "full_scan|micro|targeted",
    "duration_seconds": <integer>,
    "agents_used": <integer>,
    "files_scanned": <integer>,
    "files_hashed": <integer>
  }
}
```

## Hashing

- For files that appear in `git ls-files -s`: use the blob OID from column 2 of that output. No file read required.
- For working-tree files not in git (untracked, respecting the exclude list): compute SHA-256 of contents and store as `sha256:<hex>`.
- Equality comparison is byte-exact string equality across runs.

## Import graph normalization

- Internal: resolved to repo-relative path including extension.
- External: bare package name (e.g. `express`, not `node_modules/express/index.js`).
- Relative: join with importing file's directory, then lexical-normalize.
- Unresolvable (e.g. aliased imports with no tsconfig): keep as-written.
