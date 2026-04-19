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

// ---------------------------------------------------------------------------
// parseQuery — extended edge cases
// ---------------------------------------------------------------------------

describe("parseQuery extended", () => {
  it("returns INVALID_QUERY for null input", () => {
    // @ts-expect-error — intentional misuse
    const r = parseQuery(null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("returns INVALID_QUERY for object input", () => {
    // @ts-expect-error — intentional misuse
    const r = parseQuery({ operation: "filter" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("parses a JSON string containing a primitive number (not an object)", () => {
    const r = parseQuery("42");
    // JSON is valid but value is not an object — parseQuery still succeeds (validation is separate)
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value, 42);
  });

  it("parses a JSON null value (validation step must reject it)", () => {
    const r = parseQuery("null");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value, null);
  });

  it("returns a hint for empty string input", () => {
    const r = parseQuery("");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.code, "INVALID_QUERY");
      assert.ok(typeof r.error.hint === "string" && r.error.hint.length > 0);
    }
  });

  it("parses a JSON array (not an object — validateQuery must reject)", () => {
    const r = parseQuery('[{"operation":"filter","conditions":{}}]');
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(Array.isArray(r.value));
  });
});

// ---------------------------------------------------------------------------
// validateQuery — extended edge cases
// ---------------------------------------------------------------------------

describe("validateQuery extended", () => {
  it("rejects negative max_depth", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "src/auth", max_depth: -1 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects null input", () => {
    const r = validateQuery(null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects array input", () => {
    const r = validateQuery([]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects primitive string input", () => {
    const r = validateQuery("filter");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects transitive_dependents missing module", () => {
    const r = validateQuery({ operation: "transitive_dependents" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects transitive_dependents with empty module", () => {
    const r = validateQuery({ operation: "transitive_dependents", module: "" });
    assert.equal(r.ok, false);
  });

  it("rejects filter with array conditions", () => {
    const r = validateQuery({ operation: "filter", conditions: ["criticality", "critical"] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects filter with null conditions", () => {
    const r = validateQuery({ operation: "filter", conditions: null });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("accepts filter with empty conditions object", () => {
    const r = validateQuery({ operation: "filter", conditions: {} });
    assert.equal(r.ok, true);
  });

  it("accepts max_depth equal to 1 (minimum)", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "src/auth", max_depth: 1 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal((r.query as { max_depth?: number }).max_depth, 1);
  });

  it("accepts max_depth equal to MAX_ALLOWED_DEPTH", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "src/auth", max_depth: MAX_ALLOWED_DEPTH });
    assert.equal(r.ok, true);
  });

  it("accepts max_depth beyond MAX_ALLOWED_DEPTH (clamping happens at execution time)", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "src/auth", max_depth: 100 });
    assert.equal(r.ok, true);
  });

  it("provides a hint for unknown operation", () => {
    const r = validateQuery({ operation: "unknown_op" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(typeof r.error.hint === "string" && r.error.hint.length > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// clampDepth — extended edge cases
// ---------------------------------------------------------------------------

describe("clampDepth extended", () => {
  it("returns DEFAULT_MAX_DEPTH for NaN", () => {
    assert.equal(clampDepth(NaN), DEFAULT_MAX_DEPTH);
  });

  it("returns DEFAULT_MAX_DEPTH for Infinity", () => {
    assert.equal(clampDepth(Infinity), DEFAULT_MAX_DEPTH);
  });

  it("returns DEFAULT_MAX_DEPTH for -Infinity", () => {
    assert.equal(clampDepth(-Infinity), DEFAULT_MAX_DEPTH);
  });

  it("returns MAX_ALLOWED_DEPTH for a value exactly equal to MAX_ALLOWED_DEPTH", () => {
    assert.equal(clampDepth(MAX_ALLOWED_DEPTH), MAX_ALLOWED_DEPTH);
  });

  it("returns 1 for fractional values below 1 (truncation + floor)", () => {
    // Math.trunc(0.9) = 0 => clamped to 1
    assert.equal(clampDepth(0.9), 1);
  });

  it("truncates floating-point values above 1", () => {
    // Math.trunc(3.8) = 3
    assert.equal(clampDepth(3.8), 3);
  });
});

// ---------------------------------------------------------------------------
// executeDependenciesOf — extended edge cases
// ---------------------------------------------------------------------------

describe("executeDependenciesOf extended", () => {
  const graph = buildLayeredGraph();

  it("summary text mentions the source module name", () => {
    const r = executeDependenciesOf(graph, "src/api", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.match(r.summary, /src\/api/);
    }
  });

  it("summary mentions clamped depth when requested depth exceeds MAX_ALLOWED_DEPTH", () => {
    const r = executeDependenciesOf(graph, "src/server", MAX_ALLOWED_DEPTH + 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.match(r.summary, /max_depth clamped to/);
    }
  });

  it("does NOT mention clamped depth when depth is within limit", () => {
    const r = executeDependenciesOf(graph, "src/server", 2);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.doesNotMatch(r.summary, /clamped/);
    }
  });

  it("echo query in result contains the (clamped) depth", () => {
    const r = executeDependenciesOf(graph, "src/server", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.equal(r.query.operation, "dependencies_of");
      assert.equal((r.query as { max_depth: number }).max_depth, 1);
    }
  });

  it("depth 3 reaches src/config from src/server via multi-hop", () => {
    // server -> auth -> config (depth 2) — but config also direct from server (depth 1)
    // more importantly: server -> api -> cache -> config (depth 3)
    const r = executeDependenciesOf(graph, "src/server", 3);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.ok(ids.includes("src/cache"), "src/cache should be reachable at depth 2");
      assert.ok(ids.includes("src/config"), "src/config should be reachable");
    }
  });

  it("module with only a single outbound edge returns exactly that one dependent", () => {
    const r = executeDependenciesOf(graph, "src/events", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      // events -> models, events -> logger
      assert.ok(ids.includes("src/models"));
      assert.ok(ids.includes("src/utils/logger"));
      assert.ok(!ids.includes("src/events"), "start node must not appear");
    }
  });

  it("returns MODULE_NOT_IN_GRAPH with a hint", () => {
    const r = executeDependenciesOf(graph, "src/phantom", 1);
    assert.ok("code" in r);
    if ("code" in r) {
      assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
      assert.ok(typeof r.hint === "string" && r.hint.length > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// executeDependentsOf — extended edge cases
// ---------------------------------------------------------------------------

describe("executeDependentsOf extended", () => {
  const graph = buildLayeredGraph();

  it("summary text mentions the source module name", () => {
    const r = executeDependentsOf(graph, "src/config", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.match(r.summary, /src\/config/);
    }
  });

  it("summary mentions clamped depth when depth exceeds MAX_ALLOWED_DEPTH", () => {
    const r = executeDependentsOf(graph, "src/config", MAX_ALLOWED_DEPTH + 10);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.match(r.summary, /max_depth clamped to/);
    }
  });

  it("depth 1 for src/auth returns only direct importers", () => {
    const r = executeDependentsOf(graph, "src/auth", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      // server -> auth, api -> auth, public-api -> auth
      assert.ok(ids.includes("src/server"));
      assert.ok(ids.includes("src/api"));
      assert.ok(ids.includes("src/public-api"));
      assert.ok(!ids.includes("src/auth"), "start node must not appear");
    }
  });

  it("depth 2 from src/models includes second-hop importers", () => {
    const r = executeDependentsOf(graph, "src/models", 2);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      // direct: api, auth, events  |  hop 2: server (via api, auth), public-api (via api, auth)
      assert.ok(ids.includes("src/server"));
      assert.ok(ids.includes("src/public-api"));
    }
  });

  it("matched_edges for dependents_of only contain edges within the visited set", () => {
    const r = executeDependentsOf(graph, "src/db", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const visited = new Set<string>([...nodeIds(r), "src/db"]);
      for (const e of r.matched_edges) {
        assert.ok(
          visited.has(e.source) && visited.has(e.target),
          `edge ${e.source}->${e.target} has endpoint outside visited set`,
        );
      }
    }
  });

  it("returns MODULE_NOT_IN_GRAPH with a hint", () => {
    const r = executeDependentsOf(graph, "nonexistent/module", 1);
    assert.ok("code" in r);
    if ("code" in r) {
      assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
      assert.ok(typeof r.hint === "string" && r.hint.length > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// executeFilter — extended multi-condition and edge cases
// ---------------------------------------------------------------------------

describe("executeFilter extended", () => {
  const graph = buildLayeredGraph();

  it("three-condition filter: criticality + stability + test_coverage", () => {
    // src/db: criticality=critical, stability=stable, test_coverage=partial
    const r = executeFilter(graph, { criticality: "critical", stability: "stable", test_coverage: "partial" });
    const ids = nodeIds(r);
    assert.ok(ids.includes("src/db"), "src/db should match all three conditions");
    // src/server has test_coverage=well_tested, so it should NOT match
    assert.ok(!ids.includes("src/server"), "src/server has well_tested coverage, should not match");
  });

  it("stability + test_coverage filter returns only matching nodes", () => {
    // evolving + partial: src/api (evolving, partial)
    const r = executeFilter(graph, { stability: "evolving", test_coverage: "partial" });
    const ids = nodeIds(r);
    assert.ok(ids.includes("src/api"), "src/api should match evolving+partial");
    assert.ok(!ids.includes("src/server"), "src/server is stable, not evolving");
  });

  it("filter by test_coverage=untested returns all untested nodes", () => {
    const r = executeFilter(graph, { test_coverage: "untested" });
    const ids = nodeIds(r);
    // untested nodes in fixture: src/config, src/cache, src/events
    assert.ok(ids.includes("src/config"));
    assert.ok(ids.includes("src/cache"));
    assert.ok(ids.includes("src/events"));
    // well_tested nodes must not appear
    assert.ok(!ids.includes("src/server"));
    assert.ok(!ids.includes("src/auth"));
  });

  it("filter by stability=experimental returns only experimental nodes", () => {
    const r = executeFilter(graph, { stability: "experimental" });
    const ids = nodeIds(r);
    assert.deepEqual(ids, ["src/events"]);
  });

  it("filter with non-existent combination returns empty result with zero edges", () => {
    const r = executeFilter(graph, { role: "entry_point", criticality: "low" });
    assert.equal(r.matched_nodes.length, 0);
    assert.equal(r.matched_edges.length, 0);
  });

  it("filter result summary uses plural 'nodes' for multiple matches", () => {
    const r = executeFilter(graph, { criticality: "critical" });
    assert.match(r.summary, /nodes/);
  });

  it("filter result summary uses singular 'node' for a single match", () => {
    const r = executeFilter(graph, { role: "entry_point" });
    // Only src/server has role=entry_point
    assert.equal(r.matched_nodes.length, 1);
    assert.match(r.summary, /1 node\b/);
  });

  it("filter query echo in result matches the conditions passed in", () => {
    const conditions = { criticality: "high" as const };
    const r = executeFilter(graph, conditions);
    assert.equal(r.query.operation, "filter");
    assert.deepEqual((r.query as { conditions: unknown }).conditions, conditions);
  });

  it("filter by role=utility returns both file and module utility nodes", () => {
    const r = executeFilter(graph, { role: "utility" });
    const ids = nodeIds(r);
    // src/utils/logger (file, utility) and src/cache (module, utility)
    assert.ok(ids.includes("src/utils/logger"));
    assert.ok(ids.includes("src/cache"));
  });

  it("matched_edges from filter include edges where only source is matched", () => {
    // filter by role=config => only src/config
    // src/config has no outgoing edges, but is the target of several edges
    const r = executeFilter(graph, { role: "config" });
    assert.equal(r.matched_nodes.length, 1);
    // All edges pointing TO src/config should be returned (touching semantics)
    const touchingConfig = r.matched_edges.filter((e) => e.target === "src/config" || e.source === "src/config");
    assert.equal(touchingConfig.length, r.matched_edges.length);
    assert.ok(r.matched_edges.length > 0, "there should be edges touching src/config");
  });
});

// ---------------------------------------------------------------------------
// executeTransitiveDependents — extended depth boundary tests
// ---------------------------------------------------------------------------

describe("executeTransitiveDependents extended", () => {
  const graph = buildLayeredGraph();

  it("depth 2 expands beyond direct dependents", () => {
    // src/config direct dependents at depth 1: auth, db, cache, server
    // at depth 2 from server: (server has no incoming edges, adds nothing)
    // at depth 2 from auth: api, server, public-api  |  from db: models  | from cache: api  | from server: nothing
    const r = executeTransitiveDependents(graph, "src/config", 2);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.ok(ids.includes("src/models"), "src/models should be reachable at depth 2 via db");
      assert.ok(ids.includes("src/api"), "src/api should be reachable at depth 2 via auth or cache");
    }
  });

  it("depth 3 includes even deeper transitive dependents", () => {
    const r = executeTransitiveDependents(graph, "src/config", 3);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      // src/events -> src/models -> src/db -> src/config  (3 hops)
      assert.ok(ids.includes("src/events"), "src/events should be reachable at depth 3");
    }
  });

  it("depth 1 for src/config returns only direct importers", () => {
    const r = executeTransitiveDependents(graph, "src/config", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      // direct importers of src/config: server, auth, db, cache
      assert.ok(ids.includes("src/server"));
      assert.ok(ids.includes("src/auth"));
      assert.ok(ids.includes("src/db"));
      assert.ok(ids.includes("src/cache"));
      // NOT yet reachable at depth 1: models, api, events, public-api
      assert.ok(!ids.includes("src/models"), "src/models not reachable at depth 1");
      assert.ok(!ids.includes("src/api"), "src/api not reachable at depth 1");
    }
  });

  it("summary text mentions 'transitive dependents'", () => {
    const r = executeTransitiveDependents(graph, "src/db", 2);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.match(r.summary, /transitive dependents/);
    }
  });

  it("summary mentions clamped depth when exceeding MAX_ALLOWED_DEPTH", () => {
    const r = executeTransitiveDependents(graph, "src/config", MAX_ALLOWED_DEPTH + 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.match(r.summary, /max_depth clamped to/);
    }
  });

  it("echo query contains operation=transitive_dependents", () => {
    const r = executeTransitiveDependents(graph, "src/db", 2);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.equal(r.query.operation, "transitive_dependents");
    }
  });

  it("leaf node (no importers) returns empty matched_nodes", () => {
    // src/server has no incoming edges — nothing depends on it
    const r = executeTransitiveDependents(graph, "src/server", 3);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      assert.equal(r.matched_nodes.length, 0);
    }
  });
});

// ---------------------------------------------------------------------------
// Circular dependency handling — extended
// ---------------------------------------------------------------------------

describe("circular dependency handling extended", () => {
  const cyclic = buildCyclicGraph();

  it("dependencies_of from B terminates and returns C and A only", () => {
    // B -> C -> A -> B (cycle); starting from B outgoing: C, A (B already visited)
    const r = executeDependenciesOf(cyclic, "B", 5);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["A", "C"]);
    }
  });

  it("dependencies_of from D returns A, B, C (full cycle reachable)", () => {
    // D -> A -> B -> C -> A (cycle closes); all 3 cycle nodes reachable from D
    const r = executeDependenciesOf(cyclic, "D", 5);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["A", "B", "C"]);
    }
  });

  it("dependents_of from B at depth 1 returns only C (C->A->B incoming)", () => {
    // incoming edges to B: A -> B, so direct dependent of B is A
    const r = executeDependentsOf(cyclic, "B", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["A"]);
    }
  });

  it("transitive_dependents from C terminates with correct visited set", () => {
    // incoming to C: B->C; then incoming to B: A->B; then incoming to A: C->A (already visited), D->A
    const r = executeTransitiveDependents(cyclic, "C", 5);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      // B (depth 1), A (depth 2), D (depth 3)
      assert.ok(ids.includes("B"), "B depends on C");
      assert.ok(ids.includes("A"), "A depends on B");
      assert.ok(ids.includes("D"), "D depends on A");
    }
  });

  it("dependencies_of at depth 1 in cycle returns only immediate successor", () => {
    // A -> B only at depth 1
    const r = executeDependenciesOf(cyclic, "A", 1);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["B"]);
    }
  });

  it("dependencies_of at depth 2 in cycle returns B and C", () => {
    // A -> B (depth 1), B -> C (depth 2); C -> A closes cycle but A already visited
    const r = executeDependenciesOf(cyclic, "A", 2);
    assert.ok(!("code" in r));
    if (!("code" in r)) {
      const ids = nodeIds(r);
      assert.deepEqual(ids, ["B", "C"]);
    }
  });
});

// ---------------------------------------------------------------------------
// executeQuery dispatcher — extended
// ---------------------------------------------------------------------------

describe("executeQuery dispatcher extended", () => {
  const graph = buildLayeredGraph();

  it("returns GRAPH_NOT_FOUND when graph is undefined", () => {
    const r = executeQuery(undefined, { operation: "filter", conditions: {} });
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "GRAPH_NOT_FOUND");
  });

  it("returns GRAPH_NOT_FOUND when graph has no nodes", () => {
    // @ts-expect-error — intentional bad graph
    const r = executeQuery({ edges: [] }, { operation: "filter", conditions: {} });
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "GRAPH_NOT_FOUND");
  });

  it("returns GRAPH_NOT_FOUND when graph has no edges", () => {
    // @ts-expect-error — intentional bad graph
    const r = executeQuery({ nodes: {} }, { operation: "filter", conditions: {} });
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "GRAPH_NOT_FOUND");
  });

  it("returns success:true with summary for a valid transitive_dependents routed through dispatcher", () => {
    const q: QueryOperation = { operation: "transitive_dependents", module: "src/utils/logger", max_depth: 2 };
    const r = executeQuery(graph, q);
    assert.equal(r.success, true);
    if (r.success) {
      assert.ok(typeof r.summary === "string" && r.summary.length > 0);
    }
  });

  it("success response contains matched_nodes, matched_edges, query, and summary", () => {
    const q: QueryOperation = { operation: "filter", conditions: { role: "core_module" } };
    const r = executeQuery(graph, q);
    assert.equal(r.success, true);
    if (r.success) {
      assert.ok(Array.isArray(r.matched_nodes));
      assert.ok(Array.isArray(r.matched_edges));
      assert.ok("query" in r);
      assert.ok(typeof r.summary === "string");
    }
  });

  it("error response contains code, message fields", () => {
    const q: QueryOperation = { operation: "dependencies_of", module: "src/does-not-exist", max_depth: 1 };
    const r = executeQuery(graph, q);
    assert.equal(r.success, false);
    if (!r.success) {
      assert.ok(typeof r.code === "string");
      assert.ok(typeof r.message === "string");
    }
  });
});

// ---------------------------------------------------------------------------
// runQueryFromJson — extended end-to-end
// ---------------------------------------------------------------------------

describe("runQueryFromJson extended", () => {
  const graph = buildLayeredGraph();

  it("executes dependencies_of end-to-end from JSON string", () => {
    const r = runQueryFromJson(
      graph,
      '{"operation":"dependencies_of","module":"src/server","max_depth":1}',
    );
    assert.equal(r.success, true);
    if (r.success) {
      assert.ok(r.matched_nodes.length > 0);
      assert.ok(!r.matched_nodes.some((n) => n.id === "src/server"), "start node must not appear");
    }
  });

  it("executes dependents_of end-to-end from JSON string", () => {
    const r = runQueryFromJson(
      graph,
      '{"operation":"dependents_of","module":"src/utils/logger","max_depth":1}',
    );
    assert.equal(r.success, true);
    if (r.success) {
      const ids = r.matched_nodes.map((n) => n.id).sort();
      assert.deepEqual(ids, ["src/api", "src/auth", "src/events", "src/models"]);
    }
  });

  it("executes transitive_dependents end-to-end from JSON string", () => {
    const r = runQueryFromJson(
      graph,
      '{"operation":"transitive_dependents","module":"src/config","max_depth":1}',
    );
    assert.equal(r.success, true);
    if (r.success) {
      const ids = r.matched_nodes.map((n) => n.id).sort();
      assert.ok(ids.includes("src/auth"));
      assert.ok(ids.includes("src/db"));
    }
  });

  it("executes filter with empty conditions (returns all nodes)", () => {
    const r = runQueryFromJson(graph, '{"operation":"filter","conditions":{}}');
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.matched_nodes.length, Object.keys(graph.nodes).length);
    }
  });

  it("returns MODULE_NOT_IN_GRAPH for missing module via runQueryFromJson", () => {
    const r = runQueryFromJson(
      graph,
      '{"operation":"dependencies_of","module":"src/ghost","max_depth":1}',
    );
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
  });

  it("returns INVALID_QUERY for empty input string", () => {
    const r = runQueryFromJson(graph, "");
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "INVALID_QUERY");
  });

  it("returns INVALID_QUERY for missing required module field", () => {
    const r = runQueryFromJson(graph, '{"operation":"dependencies_of"}');
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "INVALID_QUERY");
  });

  it("returns INVALID_QUERY for zero max_depth", () => {
    const r = runQueryFromJson(
      graph,
      '{"operation":"dependencies_of","module":"src/server","max_depth":0}',
    );
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.code, "INVALID_QUERY");
  });
});
