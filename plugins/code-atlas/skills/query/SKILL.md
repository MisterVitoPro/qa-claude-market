---
name: code-atlas:query
title: Query the Code Atlas semantic dependency graph
description: >
  Query the semantic dependency graph stored in .code-atlas/graph-schema.json.
  Accepts a JSON query object with one of four operations — dependencies_of,
  dependents_of, filter, transitive_dependents — and returns a filtered
  subgraph (matched nodes + relevant edges) with a plain-text summary.
  Use for impact analysis, architecture exploration, and risk identification.
  Triggers on: query code atlas, find dependencies, who imports, blast radius,
  impact analysis, find critical modules, query graph.
model: claude-sonnet-4-5
color: cyan
argument-hint: "<optional: paste your JSON query here, or leave blank to describe what you want in plain English>"
---

You are executing a Code Atlas graph query. Your goal is to read `.code-atlas/graph-schema.json`, execute the requested query operation, and return a structured subgraph result with a plain-text summary.

Arguments: **"{$ARGUMENTS}"**

Reference: `plugins/code-atlas/docs/query-language-reference.md` is the complete specification for all operations, response format, node properties, and edge properties.

---

## Step 1: LOAD GRAPH

1. Check if `.code-atlas/graph-schema.json` exists using Bash: `test -f .code-atlas/graph-schema.json && echo yes`.
2. If the file does not exist, print:
   ```
   No graph-schema.json found in .code-atlas/.

   Run /code-atlas:map to generate the architecture index and semantic dependency graph first.
   ```
   Then STOP.
3. Read `.code-atlas/graph-schema.json` using the Read tool.
4. Verify `_header.schema_version` equals `2`. If not:
   ```
   graph-schema.json schema version {N} is not supported. Expected version 2.
   Run /code-atlas:map to regenerate with the current schema.
   ```
   Then STOP.

---

## Step 2: PARSE QUERY

Determine the query to execute:

### If `{$ARGUMENTS}` contains a JSON object:
Parse it directly as the query. Validate that `operation` is present and is one of:
- `dependencies_of`
- `dependents_of`
- `filter`
- `transitive_dependents`

### If `{$ARGUMENTS}` is plain English or empty:
Interpret the user's intent and construct the appropriate JSON query. Common mappings:
- "what does X depend on" / "dependencies of X" → `dependencies_of` with `module: "X"`
- "what imports X" / "who uses X" / "dependents of X" → `dependents_of` with `module: "X"`
- "blast radius of X" / "impact of changing X" / "ripple effect" → `transitive_dependents` with `module: "X"`
- "find all critical modules" / "show untested modules" / "filter by role/criticality/stability" → `filter` with inferred `conditions`

Show the interpreted query to the user before executing:
```
Interpreted query:
{json block}

Executing...
```

### Validation errors:
If the query cannot be parsed or is missing required fields, print:

```
Invalid query. Supported operations:

  dependencies_of       — modules that a given node imports
  dependents_of         — modules that import a given node
  filter                — nodes matching attribute conditions
  transitive_dependents — full transitive upstream consumer set

Required fields by operation:
  dependencies_of:       { "operation": "dependencies_of", "module": "<path>" }
  dependents_of:         { "operation": "dependents_of", "module": "<path>" }
  filter:                { "operation": "filter", "conditions": { ... } }
  transitive_dependents: { "operation": "transitive_dependents", "module": "<path>" }

Optional: "max_depth": <1-5> (default: 2) for traversal operations.
```

---

## Step 3: EXECUTE QUERY

Execute the validated query against the loaded graph. Apply the logic below for each operation.

### `dependencies_of`

1. Look up `module` in `graph.nodes`. If absent:
   ```
   Module "{module}" is not in the graph. It may be outside the key set, an external package, or a test/build file.
   ```
   Return empty result.
2. Apply `max_depth` (default: 2; clamp to range [1, 5]).
3. BFS traversal following **outgoing** edges from `module`:
   - At each hop, find all edges where `edge.source === current_node`.
   - Collect `edge.target` nodes (only if present in `graph.nodes`).
   - Track visited nodes to avoid cycles.
   - Stop at `max_depth` hops.
4. `matched_nodes` = all visited nodes (excluding the query `module` itself unless it appears as a dependency of itself).
5. `matched_edges` = all edges whose `source` and `target` are both in `matched_nodes` union `{module}`.

### `dependents_of`

1. Look up `module` in `graph.nodes`. If absent, return empty result with the same message as above.
2. Apply `max_depth` (default: 2; clamp to [1, 5]).
3. BFS traversal following **incoming** edges to `module`:
   - At each hop, find all edges where `edge.target === current_node`.
   - Collect `edge.source` nodes (only if present in `graph.nodes`).
   - Track visited nodes.
   - Stop at `max_depth` hops.
4. `matched_nodes` = all visited source nodes.
5. `matched_edges` = all edges in the traversal subgraph.

### `filter`

1. Validate `conditions` is a non-null object with at least one key.
2. If `conditions` is empty `{}`, return all nodes with a note: "No conditions specified — returning all nodes."
3. Iterate over every node in `graph.nodes`. Include a node if ALL of the following hold for each condition field:
   - `role`: node.role === conditions.role
   - `criticality`: node.criticality === conditions.criticality
   - `stability`: node.stability === conditions.stability
   - `test_coverage`: node.test_coverage === conditions.test_coverage
   - `type`: node.type === conditions.type
4. `matched_nodes` = all nodes passing all conditions.
5. `matched_edges` = all edges where BOTH `source` AND `target` are in `matched_nodes`.

### `transitive_dependents`

1. Look up `module` in `graph.nodes`. If absent, return empty result.
2. Apply `max_depth` (default: 2; clamp to [1, 5]).
3. BFS traversal following **incoming** edges (identical traversal logic to `dependents_of`). Visited nodes tracked to handle cycles safely.
4. `matched_nodes` = all visited nodes.
5. `matched_edges` = all edges traversed between visited nodes.
6. Note: this is the canonical operation for impact analysis. Use when you want to enumerate the full transitive closure of upstream consumers.

---

## Step 4: FORMAT AND RETURN RESULT

Return the result as a JSON block followed by a plain-text explanation.

### JSON result envelope:

```json
{
  "query": { "<echo of original query>" },
  "matched_nodes": [
    {
      "id": "<repo-relative path>",
      "type": "module|file",
      "role": "<role>",
      "criticality": "<criticality>",
      "stability": "<stability>",
      "test_coverage": "<test_coverage>",
      "description": "<one-line description>"
    }
  ],
  "matched_edges": [
    {
      "source": "<repo-relative path>",
      "target": "<repo-relative path>",
      "type": "<edge type>",
      "strength": "<strength>",
      "directionality": "<directionality>",
      "impact": "<impact or empty string>"
    }
  ],
  "summary": "<human-readable one-line summary>"
}
```

### Summary line format by operation:

| Operation | Example summary |
|-----------|----------------|
| `dependencies_of` | `"Found 4 dependencies of src/auth (depth 2), 6 edges total"` |
| `dependents_of` | `"Found 3 modules depending on src/utils/logger (depth 1), 3 edges total"` |
| `filter` | `"Found 2 nodes matching { criticality: critical, test_coverage: untested }"` |
| `transitive_dependents` | `"Found 7 transitive dependents of src/config (depth 3), 9 edges total"` |

### After the JSON block, print a structured plain-text breakdown:

```
Query: {operation} {module or conditions}
Graph: {total_nodes} nodes, {total_edges} edges available

Results: {N} nodes matched, {N} edges

Matched modules:
  - {id}  [{role}] [{criticality}] [{stability}] — {description}
  ...

Key edges:
  - {source} → {target}  [{type}] [{strength}] {impact if non-empty}
  ...

{Any warnings, e.g. max_depth clamped, module not in key set, etc.}
```

If `matched_nodes` is empty:
```
No results found.
{Reason: no nodes match the conditions / module not in key set / graph has no edges for this node}

Tip: Run /code-atlas:map to regenerate the graph if the codebase has changed significantly.
```

---

## Node Properties Reference

### `role`

| Value | Meaning |
|-------|---------|
| `entry_point` | Application entry — process starts here |
| `core_module` | Central business logic with high fan-in |
| `utility` | Generic helpers with low criticality |
| `config` | Configuration or environment management |
| `middleware` | Request/response pipeline layer |
| `model` | Data structure or domain entity |
| `public_api` | Exported interface layer |
| `internal` | Internal implementation detail |

### `criticality`

| Value | Threshold | Meaning |
|-------|-----------|---------|
| `critical` | importer_count >= 10 | Changing this risks breaking many things |
| `high` | importer_count >= 5 | Significant downstream impact |
| `medium` | importer_count >= 2 | Moderate downstream impact |
| `low` | importer_count < 2 | Limited downstream impact |

### `stability`

| Value | Meaning |
|-------|---------|
| `stable` | API unlikely to change; safe to depend on |
| `evolving` | In flux; downstream consumers may need updates |
| `experimental` | May be removed or redesigned; avoid hard dependencies |

### `test_coverage`

| Value | Meaning |
|-------|---------|
| `well_tested` | Both `*.test.*` and `*.spec.*` siblings found |
| `partial` | Only one test file type found |
| `untested` | No colocated test files detected |

---

## Edge Properties Reference

### `type`

| Value | Meaning |
|-------|---------|
| `direct_import` | Static `import` or `require` statement |
| `dynamic_import` | Runtime `import()` or `require()` inside a function |
| `inheritance` | Class extends another class in target |
| `composition` | Module uses target's types/classes as fields or constructor params |
| `configuration` | Source reads or depends on a config/settings module |
| `sideeffect` | Import for side effects only (e.g. `import 'reflect-metadata'`) |

### `strength`

| Value | Meaning |
|-------|---------|
| `core` | Removing this edge would break the source's primary purpose |
| `utility` | Convenient helper — source can function without it |
| `optional` | Conditionally used; source can operate without it in some cases |

### `directionality`

| Value | Meaning |
|-------|---------|
| `required` | Source needs target; unidirectional |
| `circular` | Source and target mutually depend on each other |
| `conditional` | Source only imports target under certain conditions |

### `impact`

| Value | Meaning |
|-------|---------|
| `breaking_change_risk` | Target API shift would likely break source |
| `ripple_effect_magnitude` | Source change propagates to many downstream consumers |
| `""` | No special impact annotation — standard dependency |

---

## Common Use Cases

### Find all critical modules

```json
{
  "operation": "filter",
  "conditions": {
    "criticality": "critical"
  }
}
```

### Understand what a module depends on

```json
{
  "operation": "dependencies_of",
  "module": "src/api",
  "max_depth": 2
}
```

### Identify consumers of a shared module

```json
{
  "operation": "dependents_of",
  "module": "src/utils/logger",
  "max_depth": 1
}
```

### Assess full change impact on shared infrastructure

```json
{
  "operation": "transitive_dependents",
  "module": "src/config",
  "max_depth": 4
}
```

### Find untested critical modules (risk hotspots)

```json
{
  "operation": "filter",
  "conditions": {
    "criticality": "critical",
    "test_coverage": "untested"
  }
}
```

### Find unstable high-traffic modules

```json
{
  "operation": "filter",
  "conditions": {
    "criticality": "high",
    "stability": "evolving"
  }
}
```

### Locate all entry points

```json
{
  "operation": "filter",
  "conditions": {
    "role": "entry_point"
  }
}
```

### Review experimental code dependencies

```json
{
  "operation": "dependents_of",
  "module": "src/experimental/feature-x",
  "max_depth": 3
}
```

### Explore a module's full dependency surface

```json
{
  "operation": "dependencies_of",
  "module": "src/middleware",
  "max_depth": 3
}
```

---

## Error Handling

| Situation | Behavior |
|-----------|----------|
| `graph-schema.json` not found | Print message suggesting `/code-atlas:map`, then STOP |
| Schema version mismatch | Print version mismatch message suggesting re-map, then STOP |
| Malformed JSON query | Print schema hint with valid operations and required fields |
| Unknown `operation` value | Print valid operation names |
| `module` not found in graph | Return empty result with explanatory note |
| `conditions` object is empty | Return all nodes with a note |
| `max_depth` exceeds 5 | Clamp to 5; include note in response summary |
| Circular dependency in traversal | Track visited nodes; continue BFS without revisiting |
