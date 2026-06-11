// Contract tests for the Code Atlas query runtime (scripts/query.js).
// Dependency-free; run with:
//   node --test plugins/code-atlas/tests/

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const {
  DEFAULT_MAX_DEPTH,
  MAX_ALLOWED_DEPTH,
  parseQuery,
  validateQuery,
  clampDepth,
  executeDependenciesOf,
  executeDependentsOf,
  executeFilter,
  executeTransitiveDependents,
  executeQuery,
  runQueryFromJson,
  validateGraphSchema,
} = require("../scripts/query.js");

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function node(overrides = {}) {
  return Object.assign(
    {
      type: "file",
      role: "internal",
      criticality: "low",
      stability: "stable",
      test_coverage: "untested",
      description: "",
    },
    overrides,
  );
}

function edge(source, target, overrides = {}) {
  return Object.assign(
    {
      source,
      target,
      type: "direct_import",
      strength: "core",
      directionality: "required",
      impact: "",
    },
    overrides,
  );
}

function graph(nodes, edges) {
  return {
    _header: {
      schema_version: 2,
      plugin_version: "2.1.0",
      generated_at: "2026-06-11T00:00:00Z",
      baseline_commit: "abc1234",
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

// A small chain: a -> b -> c -> d, with u importing b too.
function chainGraph() {
  return graph(
    {
      a: node({ role: "entry_point" }),
      b: node({ role: "core_module", criticality: "high" }),
      c: node({ role: "utility", criticality: "medium" }),
      d: node({ role: "config", criticality: "critical" }),
      u: node({ role: "internal" }),
    },
    [edge("a", "b"), edge("b", "c"), edge("c", "d"), edge("u", "b")],
  );
}

// Cycle: x -> y -> z -> x
function cycleGraph() {
  return graph(
    {
      x: node(),
      y: node(),
      z: node(),
    },
    [
      edge("x", "y", { directionality: "circular" }),
      edge("y", "z", { directionality: "circular" }),
      edge("z", "x", { directionality: "circular" }),
    ],
  );
}

// ---------------------------------------------------------------------------
// parseQuery
// ---------------------------------------------------------------------------

describe("parseQuery", () => {
  it("parses a valid JSON object string", () => {
    const r = parseQuery('{"operation":"filter","conditions":{}}');
    assert.equal(r.ok, true);
    assert.equal(r.value.operation, "filter");
  });

  it("rejects empty input", () => {
    const r = parseQuery("   ");
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects malformed JSON", () => {
    const r = parseQuery("{operation: filter}");
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects non-string input", () => {
    const r = parseQuery(42);
    assert.equal(r.ok, false);
  });
});

// ---------------------------------------------------------------------------
// validateQuery
// ---------------------------------------------------------------------------

describe("validateQuery", () => {
  it("rejects non-object values", () => {
    const r = validateQuery([1, 2]);
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects a missing operation field", () => {
    const r = validateQuery({ module: "src/a" });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "INVALID_QUERY");
  });

  it("rejects unknown operations", () => {
    const r = validateQuery({ operation: "explode" });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "UNKNOWN_OPERATION");
  });

  it("requires module for traversal operations", () => {
    for (const operation of ["dependencies_of", "dependents_of", "transitive_dependents"]) {
      const r = validateQuery({ operation });
      assert.equal(r.ok, false, operation);
    }
  });

  it("rejects non-integer max_depth", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "a", max_depth: 1.5 });
    assert.equal(r.ok, false);
  });

  it("rejects max_depth below 1", () => {
    const r = validateQuery({ operation: "dependencies_of", module: "a", max_depth: 0 });
    assert.equal(r.ok, false);
  });

  it("requires conditions object for filter", () => {
    const r = validateQuery({ operation: "filter" });
    assert.equal(r.ok, false);
  });

  it("accepts a valid traversal query", () => {
    const r = validateQuery({ operation: "dependents_of", module: "src/a", max_depth: 3 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.query, { operation: "dependents_of", module: "src/a", max_depth: 3 });
  });

  it("accepts a valid filter query", () => {
    const r = validateQuery({ operation: "filter", conditions: { criticality: "critical" } });
    assert.equal(r.ok, true);
  });
});

// ---------------------------------------------------------------------------
// clampDepth
// ---------------------------------------------------------------------------

describe("clampDepth", () => {
  it("defaults when undefined", () => {
    assert.equal(clampDepth(undefined), DEFAULT_MAX_DEPTH);
  });
  it("clamps above the maximum", () => {
    assert.equal(clampDepth(99), MAX_ALLOWED_DEPTH);
  });
  it("clamps below 1", () => {
    assert.equal(clampDepth(0), 1);
  });
  it("passes through valid values", () => {
    assert.equal(clampDepth(3), 3);
  });
});

// ---------------------------------------------------------------------------
// executeDependenciesOf
// ---------------------------------------------------------------------------

describe("executeDependenciesOf", () => {
  it("returns direct and depth-2 dependencies, excluding the start node", () => {
    const r = executeDependenciesOf(chainGraph(), "a", 2);
    const ids = r.matched_nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ["b", "c"]);
  });

  it("respects max_depth 1", () => {
    const r = executeDependenciesOf(chainGraph(), "a", 1);
    assert.deepEqual(r.matched_nodes.map((n) => n.id), ["b"]);
  });

  it("reaches the full chain at higher depth", () => {
    const r = executeDependenciesOf(chainGraph(), "a", 5);
    const ids = r.matched_nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ["b", "c", "d"]);
  });

  it("returns matched edges only within the visited set", () => {
    const r = executeDependenciesOf(chainGraph(), "a", 1);
    assert.deepEqual(r.matched_edges, [edge("a", "b")]);
  });

  it("errors for a module not in the graph", () => {
    const r = executeDependenciesOf(chainGraph(), "nope", 2);
    assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
  });

  it("terminates on cycles", () => {
    const r = executeDependenciesOf(cycleGraph(), "x", 5);
    const ids = r.matched_nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ["y", "z"]);
  });
});

// ---------------------------------------------------------------------------
// executeDependentsOf / executeTransitiveDependents
// ---------------------------------------------------------------------------

describe("executeDependentsOf", () => {
  it("returns importers of a module", () => {
    const r = executeDependentsOf(chainGraph(), "b", 1);
    const ids = r.matched_nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ["a", "u"]);
  });

  it("walks upstream transitively", () => {
    const r = executeDependentsOf(chainGraph(), "d", 5);
    const ids = r.matched_nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ["a", "b", "c", "u"]);
  });

  it("terminates on cycles", () => {
    const r = executeDependentsOf(cycleGraph(), "x", 5);
    const ids = r.matched_nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ["y", "z"]);
  });
});

describe("executeTransitiveDependents", () => {
  it("matches dependents_of traversal semantics", () => {
    const a = executeTransitiveDependents(chainGraph(), "d", 5);
    const b = executeDependentsOf(chainGraph(), "d", 5);
    assert.deepEqual(
      a.matched_nodes.map((n) => n.id).sort(),
      b.matched_nodes.map((n) => n.id).sort(),
    );
    assert.equal(a.query.operation, "transitive_dependents");
  });
});

// ---------------------------------------------------------------------------
// executeFilter
// ---------------------------------------------------------------------------

describe("executeFilter", () => {
  it("matches on a single condition", () => {
    const r = executeFilter(chainGraph(), { criticality: "critical" });
    assert.deepEqual(r.matched_nodes.map((n) => n.id), ["d"]);
  });

  it("requires all conditions to hold (AND semantics)", () => {
    const r = executeFilter(chainGraph(), { criticality: "critical", role: "utility" });
    assert.equal(r.matched_nodes.length, 0);
  });

  it("supports the type condition", () => {
    const g = graph(
      { m: node({ type: "module", files: ["m/a.ts"] }), f: node({ type: "file" }) },
      [],
    );
    const r = executeFilter(g, { type: "module" });
    assert.deepEqual(r.matched_nodes.map((n) => n.id), ["m"]);
  });

  it("returns all nodes for empty conditions", () => {
    const r = executeFilter(chainGraph(), {});
    assert.equal(r.matched_nodes.length, 5);
    assert.match(r.summary, /No conditions specified/);
  });

  it("returns edges touching matched nodes", () => {
    const r = executeFilter(chainGraph(), { criticality: "high" });
    assert.deepEqual(r.matched_nodes.map((n) => n.id), ["b"]);
    assert.equal(r.matched_edges.length, 3);
  });
});

// ---------------------------------------------------------------------------
// executeQuery / runQueryFromJson
// ---------------------------------------------------------------------------

describe("executeQuery", () => {
  it("rejects a missing graph", () => {
    const r = executeQuery(null, { operation: "filter", conditions: {} });
    assert.equal(r.success, false);
    assert.equal(r.code, "GRAPH_NOT_FOUND");
  });

  it("dispatches all four operations", () => {
    const g = chainGraph();
    assert.equal(executeQuery(g, { operation: "dependencies_of", module: "a" }).success, true);
    assert.equal(executeQuery(g, { operation: "dependents_of", module: "b" }).success, true);
    assert.equal(executeQuery(g, { operation: "filter", conditions: {} }).success, true);
    assert.equal(executeQuery(g, { operation: "transitive_dependents", module: "d" }).success, true);
  });

  it("surfaces module-not-found as a structured failure", () => {
    const r = executeQuery(chainGraph(), { operation: "dependencies_of", module: "ghost" });
    assert.equal(r.success, false);
    assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
  });
});

describe("runQueryFromJson", () => {
  it("runs a full parse-validate-execute round trip", () => {
    const r = runQueryFromJson(chainGraph(), '{"operation":"dependents_of","module":"b","max_depth":1}');
    assert.equal(r.success, true);
    assert.equal(r.matched_nodes.length, 2);
  });

  it("propagates parse errors", () => {
    const r = runQueryFromJson(chainGraph(), "not json");
    assert.equal(r.success, false);
    assert.equal(r.code, "INVALID_QUERY");
  });

  it("propagates validation errors", () => {
    const r = runQueryFromJson(chainGraph(), '{"operation":"warp"}');
    assert.equal(r.success, false);
    assert.equal(r.code, "UNKNOWN_OPERATION");
  });
});

// ---------------------------------------------------------------------------
// validateGraphSchema
// ---------------------------------------------------------------------------

describe("validateGraphSchema", () => {
  it("accepts a well-formed graph", () => {
    const r = validateGraphSchema(chainGraph());
    assert.deepEqual(r, { valid: true, errors: [] });
  });

  it("accepts the shipped example fixture", () => {
    const fixturePath = path.join(__dirname, "..", "test-fixtures", "graph-schema-example.json");
    const doc = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const r = validateGraphSchema(doc);
    assert.deepEqual(r.errors, []);
    assert.equal(r.valid, true);
  });

  it("accepts the route_definition role", () => {
    const g = graph({ r: node({ role: "route_definition" }) }, []);
    const r = validateGraphSchema(g);
    assert.equal(r.valid, true);
  });

  it("rejects an unsupported schema version", () => {
    const g = chainGraph();
    g._header.schema_version = 1;
    const r = validateGraphSchema(g);
    assert.equal(r.valid, false);
    assert.match(r.errors.join("\n"), /schema_version/);
  });

  it("rejects invalid node enums", () => {
    const g = graph({ bad: node({ role: "wizard" }) }, []);
    const r = validateGraphSchema(g);
    assert.equal(r.valid, false);
    assert.match(r.errors.join("\n"), /invalid role 'wizard'/);
  });

  it("rejects edges referencing unknown nodes", () => {
    const g = graph({ a: node() }, [edge("a", "ghost")]);
    g.metadata.total_edges = 1;
    const r = validateGraphSchema(g);
    assert.equal(r.valid, false);
    assert.match(r.errors.join("\n"), /target 'ghost' is not a key in nodes/);
  });

  it("rejects module nodes without a files array", () => {
    const g = graph({ m: node({ type: "module" }) }, []);
    const r = validateGraphSchema(g);
    assert.equal(r.valid, false);
    assert.match(r.errors.join("\n"), /'files' string array/);
  });

  it("rejects metadata count mismatches", () => {
    const g = chainGraph();
    g.metadata.total_nodes = 99;
    const r = validateGraphSchema(g);
    assert.equal(r.valid, false);
    assert.match(r.errors.join("\n"), /total_nodes/);
  });
});
