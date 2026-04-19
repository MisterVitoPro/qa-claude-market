/**
 * Unit tests for the query executor.
 *
 * Uses Node's built-in `node:test` runner, which requires no external
 * dependencies. Run with:
 *   node --test --loader ts-node/esm plugins/code-atlas/src/query-executor.test.ts
 * or (preferred, once a TS build step is introduced) after compiling to JS:
 *   node --test dist/query-executor.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { GraphEdge, GraphNode, GraphSchema, QueryOperation } from "./types";
import {
  DEFAULT_MAX_DEPTH,
  MAX_ALLOWED_DEPTH,
  clampDepth,
  executeDependenciesOf,
  executeDependentsOf,
  executeFilter,
  executeQuery,
  executeTransitiveDependents,
  parseQuery,
  runQueryFromJson,
  validateQuery,
} from "./query-executor";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function node(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    type: "file",
    role: "internal",
    criticality: "low",
    stability: "stable",
    test_coverage: "untested",
    description: "",
    ...overrides,
  };
}

function edge(source: string, target: string, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    source,
    target,
    type: "direct_import",
    strength: "core",
    directionality: "required",
    impact: "",
    ...overrides,
  };
}

/**
 * Layered DAG fixture (no cycles). Structure:
 *
 *    server ──> auth ──> logger
 *       │        │
 *       ├──> api ├──> models ──> db ──> config
 *       │        │         \
 *       └──> config          └──> logger
 *                api ──> logger
 *                api ──> cache ──> config
 *
 * Plus a `public_api` that inherits from `api` and imports `auth`.
 */
function buildLayeredGraph(): GraphSchema {
  const nodes: GraphSchema["nodes"] = {
    "src/server": node({ type: "file", role: "entry_point", criticality: "critical", test_coverage: "well_tested", description: "server" }),
    "src/auth": node({ type: "module", role: "middleware", criticality: "critical", test_coverage: "well_tested", description: "auth", files: ["src/auth/index.ts"] }),
    "src/api": node({ type: "module", role: "core_module", criticality: "high", stability: "evolving", test_coverage: "partial", description: "api", files: ["src/api/index.ts"] }),
    "src/models": node({ type: "module", role: "model", criticality: "high", test_coverage: "well_tested", description: "models", files: ["src/models/user.ts"] }),
    "src/db": node({ type: "module", role: "core_module", criticality: "critical", test_coverage: "partial", description: "db", files: ["src/db/index.ts"] }),
    "src/config": node({ type: "file", role: "config", criticality: "critical", test_coverage: "untested", description: "config" }),
    "src/utils/logger": node({ type: "file", role: "utility", criticality: "medium", test_coverage: "partial", description: "logger" }),
    "src/cache": node({ type: "module", role: "utility", criticality: "medium", stability: "evolving", test_coverage: "untested", description: "cache", files: ["src/cache/index.ts"] }),
    "src/public-api": node({ type: "module", role: "public_api", criticality: "high", test_coverage: "well_tested", description: "public api", files: ["src/public-api/index.ts"] }),
    "src/events": node({ type: "module", role: "internal", criticality: "low", stability: "experimental", test_coverage: "untested", description: "events", files: ["src/events/index.ts"] }),
  };
  const edges: GraphEdge[] = [
    edge("src/server", "src/auth", { impact: "breaking_change_risk" }),
    edge("src/server", "src/api", { impact: "breaking_change_risk" }),
    edge("src/server", "src/config", { impact: "breaking_change_risk" }),
    edge("src/server", "src/db", { impact: "breaking_change_risk" }),
    edge("src/api", "src/auth", { impact: "breaking_change_risk" }),
    edge("src/api", "src/models", { impact: "ripple_effect_magnitude" }),
    edge("src/api", "src/utils/logger", { strength: "utility", impact: "" }),
    edge("src/api", "src/cache", { type: "dynamic_import", strength: "optional", directionality: "conditional", impact: "" }),
    edge("src/auth", "src/models", { impact: "ripple_effect_magnitude" }),
    edge("src/auth", "src/utils/logger", { strength: "utility", impact: "" }),
    edge("src/auth", "src/config", { impact: "breaking_change_risk" }),
    edge("src/models", "src/db", { type: "composition", impact: "breaking_change_risk" }),
    edge("src/models", "src/utils/logger", { strength: "utility", impact: "" }),
    edge("src/db", "src/config", { impact: "breaking_change_risk" }),
    edge("src/public-api", "src/api", { type: "inheritance", impact: "breaking_change_risk" }),
    edge("src/public-api", "src/auth", { impact: "breaking_change_risk" }),
    edge("src/events", "src/models", { type: "sideeffect", strength: "optional", directionality: "conditional", impact: "" }),
    edge("src/events", "src/utils/logger", { strength: "utility", impact: "" }),
    edge("src/cache", "src/config", { type: "configuration", impact: "" }),
  ];
  return {
    _header: {
      schema_version: 2,
      plugin_version: "2.0.0",
      generated_at: "2026-04-19T00:00:00.000Z",
      baseline_commit: "testcommit",
      scan_root: ".",
    },
    nodes,
    edges,
    metadata: {
      total_nodes: Object.keys(nodes).length,
      total_edges: edges.length,
      key_modules_analyzed: Object.keys(nodes).length,
      circular_dependency_count: 0,
    },
  };
}

/**
 * Graph with an explicit 3-node cycle: A -> B -> C -> A.
 * Plus D -> A so we can test bounded reverse traversal through the cycle.
 */
function buildCyclicGraph(): GraphSchema {
  const nodes: GraphSchema["nodes"] = {
    A: node({ description: "A" }),
    B: node({ description: "B" }),
    C: node({ description: "C" }),
    D: node({ description: "D" }),
  };
  const edges: GraphEdge[] = [
    edge("A", "B", { directionality: "circular" }),
    edge("B", "C", { directionality: "circular" }),
    edge("C", "A", { directionality: "circular" }),
    edge("D", "A"),
  ];
  return {
    _header: {
      schema_version: 2,
      plugin_version: "2.0.0",
      generated_at: "2026-04-19T00:00:00.000Z",
      baseline_commit: "",
      scan_root: ".",
    },
    nodes,
    edges,
    metadata: {
      total_nodes: 4,
      total_edges: edges.length,
      key_modules_analyzed: 4,
      circular_dependency_count: 1,
    },
  };
}

function nodeIds(result: { matched_nodes: Array<{ id: string }> }): string[] {
  return result.matched_nodes.map((n) => n.id).sort();
}

// ---------------------------------------------------------------------------
// parseQuery
// ---------------------------------------------------------------------------

describe("parseQuery", () => {
  it("parses well-formed JSON", () => {
    const r = parseQuery('{"operation":"filter","conditions":{"criticality":"critical"}}');
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.value, { operation: "filter", conditions: { criticality: "critical" } });
    }
  });

  it("returns INVALID_QUERY for malformed JSON", () => {
    const r = parseQuery('{"operation":');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("returns INVALID_QUERY for empty input", () => {
    const r = parseQuery("   ");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("returns INVALID_QUERY for non-string input", () => {
    // @ts-expect-error — intentional misuse
    const r = parseQuery(42);
    assert.equal(r.ok, false);
  });
});

// ---------------------------------------------------------------------------
// validateQuery
// ---------------------------------------------------------------------------

describe("validateQuery", () => {
  it("accepts a valid dependencies_of query", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "src/auth", max_depth: 2 });
    assert.equal(r.ok, true);
  });

  it("accepts a valid dependents_of query without max_depth", () => {
    const r = validateQuery({ operation: "dependents_of", module: "src/auth" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.query.operation, "dependents_of");
  });

  it("accepts a valid filter query", () => {
    const r = validateQuery({ operation: "filter", conditions: { criticality: "critical" } });
    assert.equal(r.ok, true);
  });

  it("accepts a valid transitive_dependents query", () => {
    const r = validateQuery({ operation: "transitive_dependents", module: "src/config", max_depth: 3 });
    assert.equal(r.ok, true);
  });

  it("rejects non-object inputs", () => {
    const r = validateQuery("hello");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects arrays", () => {
    const r = validateQuery([{ operation: "filter", conditions: {} }]);
    assert.equal(r.ok, false);
  });

  it("rejects missing operation", () => {
    const r = validateQuery({ module: "src/auth" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects unknown operation with UNKNOWN_OPERATION code", () => {
    const r = validateQuery({ operation: "delete_everything" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "UNKNOWN_OPERATION");
  });

  it("rejects dependencies_of missing module", () => {
    const r = validateQuery({ operation: "dependencies_of" });
    assert.equal(r.ok, false);
  });

  it("rejects dependents_of with empty module", () => {
    const r = validateQuery({ operation: "dependents_of", module: "" });
    assert.equal(r.ok, false);
  });

  it("rejects filter missing conditions object", () => {
    const r = validateQuery({ operation: "filter" });
    assert.equal(r.ok, false);
  });

  it("rejects non-integer max_depth", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "src/auth", max_depth: 2.5 });
    assert.equal(r.ok, false);
  });

  it("rejects non-numeric max_depth", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "src/auth", max_depth: "deep" });
    assert.equal(r.ok, false);
  });

  it("rejects zero max_depth", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "src/auth", max_depth: 0 });
    assert.equal(r.ok, false);
  });
});

// ---------------------------------------------------------------------------
// clampDepth
// ---------------------------------------------------------------------------

describe("clampDepth", () => {
  it("returns DEFAULT_MAX_DEPTH when undefined", () => {
    assert.equal(clampDepth(undefined), DEFAULT_MAX_DEPTH);
  });

  it("returns the requested depth when in range", () => {
    assert.equal(clampDepth(3), 3);
  });

  it("caps at MAX_ALLOWED_DEPTH", () => {
    assert.equal(clampDepth(99), MAX_ALLOWED_DEPTH);
  });

  it("floors at 1", () => {
    assert.equal(clampDepth(0), 1);
    assert.equal(clampDepth(-5), 1);
  });
});

// ---------------------------------------------------------------------------
// executeDependenciesOf
// ---------------------------------------------------------------------------

describe("executeDependenciesOf", () => {
  const graph = buildLayeredGraph();

  it("returns MODULE_NOT_IN_GRAPH for unknown module", () => {
    const r = executeDependenciesOf(graph, "src/does-not-exist", 1);
    assert.equal("code" in r, true);
    if ("code" in r) assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
  });

  it("depth 1 returns only direct dependencies", () => {
    const r = executeDependenciesOf(graph, "src/server", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.deepEqual(nodeIds(r), ["src/api", "src/auth", "src/config", "src/db"]);
      // Start node must NOT appear in matched_nodes
      assert.ok(!r.matched_nodes.some((n) => n.id === "src/server"));
    }
  });

  it("depth 2 traverses transitively", () => {
    const r = executeDependenciesOf(graph, "src/server", 2);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      // depth 1 set plus second-hop reachable: models, utils/logger, cache
      assert.ok(ids.includes("src/models"));
      assert.ok(ids.includes("src/utils/logger"));
      assert.ok(ids.includes("src/cache"));
    }
  });

  it("respects MAX_ALLOWED_DEPTH cap", () => {
    const r = executeDependenciesOf(graph, "src/server", 99);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.match(r.summary, /max_depth clamped to 5/);
    }
  });

  it("matched edges only reference visited nodes", () => {
    const r = executeDependenciesOf(graph, "src/auth", 2);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const visited = new Set<string>([...nodeIds(r), "src/auth"]);
      for (const e of r.matched_edges) {
        assert.ok(visited.has(e.source), `edge source ${e.source} not in visited set`);
        assert.ok(visited.has(e.target), `edge target ${e.target} not in visited set`);
      }
    }
  });

  it("leaf node has no dependencies", () => {
    const r = executeDependenciesOf(graph, "src/config", 3);
    assert.ok(!("code" in r));
    if (!("code" in r)) assert.equal(r.matched_nodes.length, 0);
  });
});

// ---------------------------------------------------------------------------
// executeDependentsOf
// ---------------------------------------------------------------------------

describe("executeDependentsOf", () => {
  const graph = buildLayeredGraph();

  it("returns MODULE_NOT_IN_GRAPH for unknown module", () => {
    const r = executeDependentsOf(graph, "nonsense", 1);
    assert.ok("code" in r);
    if ("code" in r) assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
  });

  it("depth 1 returns only direct dependents", () => {
    const r = executeDependentsOf(graph, "src/utils/logger", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["src/api", "src/auth", "src/events", "src/models"]);
    }
  });

  it("depth 1 for unused module returns empty", () => {
    const r = executeDependentsOf(graph, "src/server", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) assert.equal(r.matched_nodes.length, 0);
  });

  it("depth 2 finds transitive dependents", () => {
    const r = executeDependentsOf(graph, "src/db", 2);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      // direct: models, server  |  hop 2 from models: auth, api, events; from server: (none)
      assert.ok(ids.includes("src/models"));
      assert.ok(ids.includes("src/server"));
      assert.ok(ids.includes("src/auth"));
      assert.ok(ids.includes("src/api"));
    }
  });

  it("depth default is 2 when omitted", () => {
    const r = executeDependentsOf(graph, "src/config", undefined);
    assert.ok(!("code" in r));
    if (!("code" in r)) assert.match(r.summary, /depend/);
  });
});

// ---------------------------------------------------------------------------
// executeFilter
// ---------------------------------------------------------------------------

describe("executeFilter", () => {
  const graph = buildLayeredGraph();

  it("filters by single condition", () => {
    const r = executeFilter(graph, { criticality: "critical" });
    const ids = nodeIds(r);
    assert.deepEqual(ids, ["src/auth", "src/config", "src/db", "src/server"]);
  });

  it("filters by multiple conditions with AND logic", () => {
    const r = executeFilter(graph, { criticality: "critical", role: "config" });
    const ids = nodeIds(r);
    assert.deepEqual(ids, ["src/config"]);
  });

  it("empty conditions returns all nodes", () => {
    const r = executeFilter(graph, {});
    assert.equal(r.matched_nodes.length, Object.keys(graph.nodes).length);
  });

  it("non-matching conditions returns empty", () => {
    const r = executeFilter(graph, { criticality: "critical", stability: "experimental" });
    assert.equal(r.matched_nodes.length, 0);
    assert.equal(r.matched_edges.length, 0);
  });

  it("matched edges touch matched nodes on at least one endpoint", () => {
    const r = executeFilter(graph, { role: "utility" });
    const ids = new Set(r.matched_nodes.map((n) => n.id));
    for (const e of r.matched_edges) {
      assert.ok(ids.has(e.source) || ids.has(e.target));
    }
  });

  it("supports filter by type discriminator", () => {
    const r = executeFilter(graph, { type: "file" } as unknown as Parameters<typeof executeFilter>[1]);
    const ids = nodeIds(r);
    assert.ok(ids.includes("src/server"));
    assert.ok(ids.includes("src/config"));
    assert.ok(ids.includes("src/utils/logger"));
    assert.ok(!ids.includes("src/auth"));
  });
});

// ---------------------------------------------------------------------------
// executeTransitiveDependents
// ---------------------------------------------------------------------------

describe("executeTransitiveDependents", () => {
  const graph = buildLayeredGraph();

  it("returns MODULE_NOT_IN_GRAPH for unknown module", () => {
    const r = executeTransitiveDependents(graph, "unknown", 1);
    assert.ok("code" in r);
  });

  it("returns the full upstream closure within max_depth", () => {
    const r = executeTransitiveDependents(graph, "src/utils/logger", 5);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      // logger is used by auth, api, models, events; transitively by server, public-api
      for (const id of ["src/auth", "src/api", "src/models", "src/events", "src/server", "src/public-api"]) {
        assert.ok(ids.includes(id), `missing ${id}`);
      }
    }
  });

  it("depth 1 limits to direct dependents only", () => {
    const r = executeTransitiveDependents(graph, "src/models", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["src/api", "src/auth", "src/events"]);
    }
  });
});

// ---------------------------------------------------------------------------
// Circular-dependency safety
// ---------------------------------------------------------------------------

describe("circular dependency handling", () => {
  const cyclic = buildCyclicGraph();

  it("dependencies_of terminates on a 3-node cycle", () => {
    const r = executeDependenciesOf(cyclic, "A", 5);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      // From A outgoing: B, C (A not included). D is unreachable via outbound from A.
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["B", "C"]);
    }
  });

  it("dependents_of terminates on a 3-node cycle", () => {
    const r = executeDependentsOf(cyclic, "A", 5);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      // Incoming to A: C (from cycle) and D. Transitively via C <- B.
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["B", "C", "D"]);
    }
  });

  it("transitive_dependents terminates on a 3-node cycle", () => {
    const r = executeTransitiveDependents(cyclic, "A", 5);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["B", "C", "D"]);
    }
  });

  it("does not infinitely loop even at MAX_ALLOWED_DEPTH", () => {
    // Simply completing without timing out demonstrates termination.
    const r = executeDependenciesOf(cyclic, "A", MAX_ALLOWED_DEPTH);
    assert.ok(!("code" in r));
  });
});

// ---------------------------------------------------------------------------
// executeQuery dispatcher
// ---------------------------------------------------------------------------

describe("executeQuery dispatcher", () => {
  const graph = buildLayeredGraph();

  it("returns GRAPH_NOT_FOUND when graph is null", () => {
    const r = executeQuery(null, { operation: "filter", conditions: {} });
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "GRAPH_NOT_FOUND");
  });

  it("routes dependencies_of", () => {
    const q: QueryOperation = { operation: "dependencies_of", module: "src/server", max_depth: 1 };
    const r = executeQuery(graph, q);
    assert.equal(r.success, true);
    if (r.success) assert.ok(r.matched_nodes.length > 0);
  });

  it("routes dependents_of", () => {
    const q: QueryOperation = { operation: "dependents_of", module: "src/utils/logger", max_depth: 1 };
    const r = executeQuery(graph, q);
    assert.equal(r.success, true);
  });

  it("routes filter", () => {
    const q: QueryOperation = { operation: "filter", conditions: { stability: "experimental" } };
    const r = executeQuery(graph, q);
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.matched_nodes.length, 1);
      assert.equal(r.matched_nodes[0].id, "src/events");
    }
  });

  it("routes transitive_dependents", () => {
    const q: QueryOperation = { operation: "transitive_dependents", module: "src/config", max_depth: 2 };
    const r = executeQuery(graph, q);
    assert.equal(r.success, true);
  });

  it("propagates MODULE_NOT_IN_GRAPH as an error response", () => {
    const q: QueryOperation = { operation: "dependencies_of", module: "src/nope", max_depth: 1 };
    const r = executeQuery(graph, q);
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
  });
});

// ---------------------------------------------------------------------------
// runQueryFromJson end-to-end
// ---------------------------------------------------------------------------

describe("runQueryFromJson", () => {
  const graph = buildLayeredGraph();

  it("parses, validates, and executes in one shot", () => {
    const r = runQueryFromJson(
      graph,
      '{"operation":"filter","conditions":{"role":"config"}}',
    );
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.matched_nodes.length, 1);
      assert.equal(r.matched_nodes[0].id, "src/config");
    }
  });

  it("returns INVALID_QUERY for malformed JSON", () => {
    const r = runQueryFromJson(graph, "{oops");
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "INVALID_QUERY");
  });

  it("returns UNKNOWN_OPERATION for unsupported operations", () => {
    const r = runQueryFromJson(graph, '{"operation":"explode"}');
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "UNKNOWN_OPERATION");
  });
});
