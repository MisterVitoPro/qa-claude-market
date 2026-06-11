# Code Atlas Query Language Reference

Complete specification for querying `.code-atlas/graph-schema.json`. The
canonical executor is `scripts/query.js` (dependency-free Node, tested under
`tests/`); `/code-atlas:query` invokes it and falls back to in-model execution
only when Node or the script is unavailable.

## Invocation

```bash
node scripts/query.js '<json-query>'                 # graph defaults to .code-atlas/graph-schema.json
node scripts/query.js --graph <path> '<json-query>'  # explicit graph path
node scripts/query.js --query-file <path>            # read the JSON query from a file (robust quoting)
node scripts/query.js --validate                     # validate the graph schema instead of querying
node scripts/query.js --json-only '<json-query>'     # suppress the plain-text breakdown
```

Exit codes: `0` success / validation passed; `1` structured failure (invalid
query, module not in graph, schema invalid); `2` environment failure (graph
file missing or unreadable).

## Operations

| Operation | Required fields | Optional | Semantics |
|-----------|----------------|----------|-----------|
| `dependencies_of` | `module` | `max_depth` | BFS following OUTGOING edges: what `module` imports, up to `max_depth` hops |
| `dependents_of` | `module` | `max_depth` | BFS following INCOMING edges: what imports `module`, up to `max_depth` hops |
| `filter` | `conditions` | — | All nodes matching every condition (AND semantics) |
| `transitive_dependents` | `module` | `max_depth` | Same traversal as `dependents_of`; the canonical operation for impact analysis / blast radius |

### `max_depth`

- Default: `2`. Clamped to the range `[1, 5]`.
- Values above 5 are clamped and noted in the summary; values below 1 are rejected at validation.

### `filter` conditions

Any combination of: `role`, `criticality`, `stability`, `test_coverage`, `type`.
Exact string equality, AND semantics. Unknown keys are ignored (forward
compatibility). Empty `conditions` returns all nodes with a note.

Allowed values per field are listed in
[schema-reference.md](schema-reference.md) (Node fields table).

## Response envelope

Success:

```json
{
  "success": true,
  "query": { "operation": "dependents_of", "module": "src/utils/logger", "max_depth": 2 },
  "matched_nodes": [
    {
      "id": "src/api",
      "type": "module",
      "files": ["src/api/index.ts"],
      "role": "core_module",
      "criticality": "high",
      "stability": "evolving",
      "test_coverage": "partial",
      "description": "REST API route definitions"
    }
  ],
  "matched_edges": [
    {
      "source": "src/api",
      "target": "src/utils/logger",
      "type": "direct_import",
      "strength": "utility",
      "directionality": "required",
      "impact": ""
    }
  ],
  "summary": "Found 1 node for dependents of src/utils/logger, 1 edge total"
}
```

Failure:

```json
{
  "success": false,
  "code": "MODULE_NOT_IN_GRAPH",
  "message": "Module 'src/ghost' is not in the graph.",
  "hint": "Module not in key set or is external."
}
```

### Result-set rules

- Traversal operations EXCLUDE the starting module from `matched_nodes`.
- Traversal `matched_edges` contains only edges whose source AND target were
  both visited (the start node counts as visited, so its immediate edges appear).
- `filter` `matched_edges` contains every edge touching at least one matched
  node (source OR target).
- Cycles are handled by visited-node tracking; traversals always terminate.

## Error codes

| Code | Meaning |
|------|---------|
| `INVALID_QUERY` | Not valid JSON, not an object, missing/ill-typed required fields |
| `UNKNOWN_OPERATION` | `operation` is not one of the four supported values |
| `MODULE_NOT_IN_GRAPH` | `module` is not a key in `nodes` (outside key set, external package, or test/build file) |
| `GRAPH_NOT_FOUND` | graph file missing, unreadable, or missing `nodes`/`edges` |
| `SCHEMA_VERSION_MISMATCH` | `_header.schema_version` is not `2` |

## Plain-text breakdown format

Printed after the JSON envelope (unless `--json-only`):

```
Query: {operation} {module or conditions}
Graph: {total_nodes} nodes, {total_edges} edges available

Results: {N} nodes matched, {N} edges

Matched modules:
  - {id}  [{role}] [{criticality}] [{stability}] — {description}

Key edges:
  - {source} -> {target}  [{type}] [{strength}] {impact if non-empty}
```

## Recipes

```json
{ "operation": "filter", "conditions": { "criticality": "critical" } }
```
All critical modules.

```json
{ "operation": "filter", "conditions": { "criticality": "critical", "test_coverage": "untested" } }
```
Risk hotspots: critical and untested.

```json
{ "operation": "transitive_dependents", "module": "src/config", "max_depth": 4 }
```
Full blast radius of changing `src/config`.

```json
{ "operation": "dependencies_of", "module": "src/api", "max_depth": 2 }
```
What `src/api` is built on.

```json
{ "operation": "filter", "conditions": { "role": "entry_point" } }
```
Locate all entry points.
