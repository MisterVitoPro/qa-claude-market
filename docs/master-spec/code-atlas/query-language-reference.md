# Code Atlas Query Language Reference

**Schema Version:** 2  
**Plugin Version:** 2.0.0  
**Skill:** `/code-atlas:query`

This document is the complete reference for the Code Atlas query language — the JSON-based interface for exploring the semantic dependency graph stored in `.code-atlas/graph-schema.json`.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Invocation](#invocation)
- [Query Operations](#query-operations)
  - [dependencies_of](#dependencies_of)
  - [dependents_of](#dependents_of)
  - [filter](#filter)
  - [transitive_dependents](#transitive_dependents)
- [Response Format](#response-format)
- [Node Properties](#node-properties)
- [Edge Properties](#edge-properties)
- [Common Use Cases](#common-use-cases)
- [Constraints and Limitations](#constraints-and-limitations)
- [Error Handling](#error-handling)

---

## Overview

The Code Atlas query language lets Claude ask structured questions about the semantic dependency graph without manually parsing raw JSON. Queries are expressed as JSON objects with an `operation` field and operation-specific parameters. The skill reads `graph-schema.json`, executes the query, and returns a filtered subgraph (matching nodes + relevant edges) with a plain-text summary.

The graph covers the key modules of the repository — specifically, all nodes from `atlas.json`'s `key_files` (up to 15) and `high_traffic` (up to 10) lists, plus their immediate dependencies and dependents within the key set. Third-party libraries, test files, and build artifacts are excluded from the graph.

---

## Prerequisites

`graph-schema.json` must exist in `.code-atlas/` before queries can run. Generate it by running:

```
/code-atlas:map
```

If the file is missing, the skill prints a message explaining how to generate it.

---

## Invocation

Invoke the skill, then provide the query object in the message body:

```
/code-atlas:query

{
  "operation": "filter",
  "conditions": {
    "criticality": "critical"
  }
}
```

The skill accepts exactly one JSON query object per invocation.

---

## Query Operations

### `dependencies_of`

Returns all modules and files that a given module directly or transitively imports — its outbound dependency set.

**Syntax:**

```json
{
  "operation": "dependencies_of",
  "module": "<module-or-file-path>",
  "max_depth": <integer>
}
```

**Fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `operation` | string | yes | — | Must be `"dependencies_of"` |
| `module` | string | yes | — | Repo-relative path of the module to query (e.g. `"src/auth"`) |
| `max_depth` | integer | no | 2 | Maximum traversal depth (1 = direct only; max allowed: 5) |

**Traversal:** BFS following outgoing edges from `module`. At depth 1 only the immediate imports are returned. Increasing `max_depth` adds transitive dependencies hop by hop.

**Example — direct dependencies only:**

```json
{
  "operation": "dependencies_of",
  "module": "src/auth",
  "max_depth": 1
}
```

**Example — full transitive dependency tree (up to 3 hops):**

```json
{
  "operation": "dependencies_of",
  "module": "src/api",
  "max_depth": 3
}
```

---

### `dependents_of`

Returns all modules and files that import a given module — its inbound dependent set.

**Syntax:**

```json
{
  "operation": "dependents_of",
  "module": "<module-or-file-path>",
  "max_depth": <integer>
}
```

**Fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `operation` | string | yes | — | Must be `"dependents_of"` |
| `module` | string | yes | — | Repo-relative path of the module to query (e.g. `"src/utils/logger"`) |
| `max_depth` | integer | no | 2 | Maximum traversal depth (1 = direct importers only; max allowed: 5) |

**Traversal:** BFS following incoming edges toward `module`. Use `max_depth: 1` to see which modules import this one directly. Use higher values to understand how broadly a change could propagate.

**Example — who imports logger directly:**

```json
{
  "operation": "dependents_of",
  "module": "src/utils/logger",
  "max_depth": 1
}
```

**Example — full blast radius of changing a shared model:**

```json
{
  "operation": "dependents_of",
  "module": "src/models/user",
  "max_depth": 4
}
```

---

### `filter`

Returns all nodes matching a set of attribute conditions. All conditions use AND logic — a node must match every condition to be included.

**Syntax:**

```json
{
  "operation": "filter",
  "conditions": {
    "<attribute>": "<value>",
    ...
  }
}
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `operation` | string | yes | Must be `"filter"` |
| `conditions` | object | yes | One or more attribute/value pairs (AND logic) |

**Filterable attributes and allowed values:**

| Attribute | Allowed Values |
|-----------|---------------|
| `criticality` | `"critical"`, `"high"`, `"medium"`, `"low"` |
| `role` | `"entry_point"`, `"core_module"`, `"utility"`, `"config"`, `"middleware"`, `"model"`, `"public_api"`, `"internal"` |
| `stability` | `"stable"`, `"evolving"`, `"experimental"` |
| `test_coverage` | `"well_tested"`, `"partial"`, `"untested"` |
| `type` | `"module"`, `"file"` |

**Example — find all critical modules:**

```json
{
  "operation": "filter",
  "conditions": {
    "criticality": "critical"
  }
}
```

**Example — find stable core modules:**

```json
{
  "operation": "filter",
  "conditions": {
    "role": "core_module",
    "stability": "stable"
  }
}
```

**Example — identify risky targets: critical modules with no test coverage:**

```json
{
  "operation": "filter",
  "conditions": {
    "criticality": "critical",
    "test_coverage": "untested"
  }
}
```

**Example — find experimental entry points:**

```json
{
  "operation": "filter",
  "conditions": {
    "role": "entry_point",
    "stability": "experimental"
  }
}
```

The response includes all edges where either the source or the target is among the matched nodes.

---

### `transitive_dependents`

Returns all nodes reachable from a given module by following inbound edges (the transitive dependent set), up to a configurable hop limit.

**Syntax:**

```json
{
  "operation": "transitive_dependents",
  "module": "<module-or-file-path>",
  "max_depth": <integer>
}
```

**Fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `operation` | string | yes | — | Must be `"transitive_dependents"` |
| `module` | string | yes | — | Repo-relative path of the module to query |
| `max_depth` | integer | no | 2 | Maximum traversal depth (min 1; max 5) |

**Traversal:** BFS following inbound edges, stopping at `max_depth`. Visited nodes are tracked to prevent infinite loops through circular dependencies. All visited nodes and the edges traversed between them are returned.

This operation is similar to `dependents_of` but is the canonical operation for impact analysis scenarios where you want to enumerate the full transitive closure of upstream consumers.

**Example — impact analysis before changing a shared utility:**

```json
{
  "operation": "transitive_dependents",
  "module": "src/utils/config",
  "max_depth": 3
}
```

**Example — understanding the ripple effect of a middleware change:**

```json
{
  "operation": "transitive_dependents",
  "module": "src/middleware/auth",
  "max_depth": 5
}
```

---

## Response Format

All operations return the same JSON envelope:

```json
{
  "query": { "<original query object>" },
  "matched_nodes": [
    {
      "id": "<repo-relative path>",
      "type": "module|file",
      "role": "<role value>",
      "criticality": "<criticality value>",
      "stability": "<stability value>",
      "test_coverage": "<coverage value>",
      "description": "<one-line description>"
    }
  ],
  "matched_edges": [
    {
      "source": "<repo-relative path>",
      "target": "<repo-relative path>",
      "type": "<edge type>",
      "strength": "<strength value>",
      "directionality": "<directionality value>",
      "impact": "<impact value or empty string>"
    }
  ],
  "summary": "<plain-text sentence describing match count and result>"
}
```

**Response fields:**

| Field | Description |
|-------|-------------|
| `query` | Echo of the original query for traceability |
| `matched_nodes` | Array of node objects satisfying the query |
| `matched_edges` | Array of edge objects connecting matched nodes |
| `summary` | Human-readable summary (e.g. `"Found 4 modules depending on src/auth, 6 edges total"`) |

An empty result is valid — `matched_nodes` and `matched_edges` will be empty arrays and `summary` will explain why (module not in key set, no matches for conditions, etc.).

**Example response for a `dependents_of` query:**

```json
{
  "query": { "operation": "dependents_of", "module": "src/auth" },
  "matched_nodes": [
    {
      "id": "src/api",
      "type": "module",
      "role": "core_module",
      "criticality": "critical",
      "stability": "stable",
      "test_coverage": "well_tested",
      "description": "HTTP request handlers and route definitions"
    },
    {
      "id": "src/middleware",
      "type": "module",
      "role": "middleware",
      "criticality": "high",
      "stability": "stable",
      "test_coverage": "partial",
      "description": "Express middleware layer"
    }
  ],
  "matched_edges": [
    {
      "source": "src/api",
      "target": "src/auth",
      "type": "direct_import",
      "strength": "core",
      "directionality": "required",
      "impact": "breaking_change_risk"
    },
    {
      "source": "src/middleware",
      "target": "src/auth",
      "type": "direct_import",
      "strength": "core",
      "directionality": "required",
      "impact": "breaking_change_risk"
    }
  ],
  "summary": "Found 2 modules depending on src/auth, 2 edges total"
}
```

---

## Node Properties

Nodes in the graph represent modules (groups of related files, such as `src/auth/`) or standalone files. Each node carries semantic metadata inferred during the `/code-atlas:map` scan.

### `type`

| Value | Meaning |
|-------|---------|
| `module` | A logical subsystem — a directory grouping related files (e.g. `src/auth/` containing `index.ts`, `middleware.ts`, `service.ts`) |
| `file` | An individual source file included because it is referenced standalone or explicitly queried |

### `role`

How the module fits into the overall architecture. Inferred from directory naming, importer counts, and structural heuristics.

| Value | Meaning | How Assigned |
|-------|---------|-------------|
| `entry_point` | Application entry — process starts here | Directory or filename matches `main`, `index`, `server`, `app`, `cmd` heuristics |
| `core_module` | Central business logic with high fan-in | Top importers by `importer_count` |
| `utility` | Generic helpers with low criticality | Low `importer_count`, no structural role signals |
| `config` | Configuration or environment management | Filename/directory matches `config`, `env`, `settings` |
| `middleware` | Request/response pipeline layer | Directory matches `middleware`, `interceptor`, `filter` |
| `model` | Data structure or domain entity | Directory matches `models`, `entities`, `schemas`, `types` |
| `public_api` | Exported interface layer | Directory matches `api`, `endpoints`, `routes`, or top-level `index` with re-exports |
| `internal` | Internal implementation detail not intended for direct consumption | No strong signals; low importer count in non-utility context |

### `criticality`

How many modules depend on this one — its blast radius. Derived from `importer_count` in `state.json`.

| Value | Threshold | Meaning |
|-------|-----------|---------|
| `critical` | importer_count >= 10 | Changing this module risks breaking many things |
| `high` | importer_count >= 5 | Significant downstream impact |
| `medium` | importer_count >= 2 | Moderate downstream impact |
| `low` | importer_count < 2 | Limited downstream impact |

### `stability`

How likely this module is to change. Inferred from directory names and recent change patterns.

| Value | Signals | Meaning |
|-------|---------|---------|
| `stable` | No instability signals; established structure | Safe to depend on; API unlikely to change |
| `evolving` | High recent churn; active development area | In flux; downstream consumers may need updates |
| `experimental` | Directory matches `experimental/`, `beta/`, `dev/` | May be removed or redesigned; avoid hard dependencies |

### `test_coverage`

Presence of co-located test files for the module's source files.

| Value | Signal | Meaning |
|-------|--------|---------|
| `well_tested` | Both `*.test.ts` and `*.spec.ts` siblings found | Module has solid test coverage |
| `partial` | Only one test file type found | Partially covered |
| `untested` | No `*.test.ts` or `*.spec.ts` siblings | No automated tests detected |

---

## Edge Properties

Edges represent dependency relationships between nodes. Each edge is directed from `source` (the importer) to `target` (the imported module).

### `type`

The nature of the dependency.

| Value | Meaning |
|-------|---------|
| `direct_import` | Static `import` or `require` statement |
| `dynamic_import` | Runtime `import()` or `require()` inside a function body |
| `inheritance` | Class extends another class in target |
| `composition` | Module uses target's types/classes as field types or constructor parameters |
| `configuration` | Source reads or depends on a config file or settings module |
| `sideeffect` | Import has side effects (e.g. `import 'reflect-metadata'`); no direct usage |

### `strength`

How essential this dependency is to the source module's core function.

| Value | Meaning |
|-------|---------|
| `core` | Removing this dependency would break the source module's primary purpose |
| `utility` | Convenient helper — source could function without it, but loses capability |
| `optional` | Conditionally used; source can operate without it in some configurations |

### `directionality`

The flow characteristics of the dependency.

| Value | Meaning |
|-------|---------|
| `required` | Source needs target; unidirectional |
| `circular` | Source and target mutually depend on each other (A imports B and B imports A) |
| `conditional` | Source only imports target under certain runtime or build conditions |

### `impact`

The consequence if the source module changes or the target's API shifts.

| Value | Meaning |
|-------|---------|
| `breaking_change_risk` | If the target's exported API changes, the source is likely to break |
| `ripple_effect_magnitude` | A change in the source may propagate to many downstream consumers via this edge |
| `""` (empty) | No special impact annotation — standard dependency |

---

## Common Use Cases

### Find all critical modules

Identify which modules have the highest blast radius and should be changed carefully.

```json
{
  "operation": "filter",
  "conditions": {
    "criticality": "critical"
  }
}
```

### Understand what a module depends on

Before modifying `src/api`, learn what it depends on to know what might be affected upstream.

```json
{
  "operation": "dependencies_of",
  "module": "src/api",
  "max_depth": 2
}
```

### Identify consumers of a shared module

Before changing `src/utils/logger`, find every module that would be affected.

```json
{
  "operation": "dependents_of",
  "module": "src/utils/logger",
  "max_depth": 1
}
```

### Assess change impact on shared infrastructure

Determine the full transitive blast radius of modifying a config or middleware module.

```json
{
  "operation": "transitive_dependents",
  "module": "src/config",
  "max_depth": 4
}
```

### Find untested critical modules (risk hotspots)

Locate modules that are heavily depended upon but lack automated tests.

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

Modules that are both frequently imported and actively changing are high-risk areas.

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

Find application entry points to understand where execution flows begin.

```json
{
  "operation": "filter",
  "conditions": {
    "role": "entry_point"
  }
}
```

### Review experimental code dependencies

Identify which other modules depend on experimental or beta code.

```json
{
  "operation": "dependents_of",
  "module": "src/experimental/feature-x",
  "max_depth": 3
}
```

### Explore a module's full dependency surface

Understand all the code a middleware layer pulls in, to reason about bundle size or coupling.

```json
{
  "operation": "dependencies_of",
  "module": "src/middleware",
  "max_depth": 3
}
```

---

## Constraints and Limitations

### Graph scope

The graph covers only modules and files from `atlas.json`'s `key_files` (up to 15) and `high_traffic` (up to 10) lists, plus their immediate dependencies within that key set. Leaf utility files with no importers, third-party packages, test files, and build artifacts are excluded.

This means:
- A module not in the key set will return an empty result with an explanatory note ("module not in key set or is external")
- Deep dependencies beyond the key set boundary are not traversed
- External packages (npm, pip, etc.) do not appear as graph nodes

### Traversal depth

`max_depth` is capped at 5 for all traversal operations (`dependencies_of`, `dependents_of`, `transitive_dependents`). The default is 2. Requesting depth > 5 is clamped to 5.

### AND-only filter logic

The `filter` operation uses strict AND logic across all conditions. There is no OR or NOT support in v2.0. To find nodes matching any of several values, run multiple queries and combine results manually.

### Single operation per query

Each invocation accepts exactly one query object. Batch or compound queries (e.g. "find critical modules AND their dependencies") require multiple sequential invocations.

### Import extraction approximation

Edge data is derived from static import analysis. The following patterns may produce incomplete or missing edges:
- Dynamic requires inside conditionals or closures
- Macro-generated or code-generated imports
- Import aliases unresolvable without full TypeScript project analysis
- Runtime dependency injection not expressed as imports

These are the same limitations that apply to `state.json`'s `import_graph`. Edges are best-effort.

### Circular dependency handling

Edges involving circular dependencies are annotated with `"directionality": "circular"`. Traversal operations handle cycles by tracking visited nodes — each node is visited at most once regardless of the graph structure. This means not all paths through a cycle are enumerated; the BFS terminates when it revisits a node.

### No path-finding

v2.0 does not support path queries ("what is the dependency chain from A to B?"). This is planned for v2.1.

### No symbol-level granularity

The graph operates at module/file granularity. Individual classes, functions, or variables are not represented as graph nodes. Dependency analysis is at the file/directory level.

---

## Error Handling

| Situation | Behavior |
|-----------|----------|
| `graph-schema.json` not found | Skill prints a message suggesting the user run `/code-atlas:map` first |
| Malformed JSON query | Skill returns a schema hint listing valid operations and required fields |
| Unknown `operation` value | Skill returns valid operation names: `dependencies_of`, `dependents_of`, `filter`, `transitive_dependents` |
| `module` not found in graph | Empty result with note: "module not in key set or is external" |
| `conditions` object is empty | All nodes are returned (no filter applied) |
| `max_depth` exceeds 5 | Clamped to 5; note included in response summary |
| Circular dependency in traversal | Traversal continues; visited nodes tracked to prevent infinite loops |
