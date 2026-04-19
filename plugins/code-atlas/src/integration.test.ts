/**
 * Integration tests for the Code Atlas query executor.
 *
 * Loads the reference fixture from test-fixtures/graph-schema-example.json
 * (the wave-1 canonical fixture) and exercises all four query operations
 * end-to-end through the full parse -> validate -> execute pipeline.
 *
 * Run with:
 *   node --test --loader ts-node/esm plugins/code-atlas/src/integration.test.ts
 * or after compiling:
 *   node --test dist/integration.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { GraphSchema } from "./types";
import { executeQuery, runQueryFromJson } from "./query-executor";

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

let fixture: GraphSchema;

before(() => {
  const fixturePath = resolve(
    __dirname,
    "..",
    "test-fixtures",
    "graph-schema-example.json",
  );
  const raw = readFileSync(fixturePath, "utf-8");
  fixture = JSON.parse(raw) as GraphSchema;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeIds(nodes: Array<{ id: string }>): string[] {
  return nodes.map((n) => n.id).sort();
}

// ---------------------------------------------------------------------------
// Fixture sanity
// ---------------------------------------------------------------------------

describe("fixture integrity", () => {
  it("loads and has the expected node count", () => {
    assert.ok(fixture, "fixture must be loaded");
    assert.equal(Object.keys(fixture.nodes).length, fixture.metadata.total_nodes);
  });

  it("has the expected edge count", () => {
    assert.equal(fixture.edges.length, fixture.metadata.total_edges);
  });

  it("contains the expected module keys", () => {
    const expectedKeys = [
      "src/server",
      "src/auth",
      "src/api",
      "src/models",
      "src/utils/logger",
      "src/config",
      "src/db",
      "src/cache",
      "src/events",
      "src/public-api",
    ];
    for (const key of expectedKeys) {
      assert.ok(Object.prototype.hasOwnProperty.call(fixture.nodes, key), `missing node: ${key}`);
    }
  });
});

// ---------------------------------------------------------------------------
// dependents_of
// ---------------------------------------------------------------------------

describe("integration: dependents_of", () => {
  it("returns direct dependents of src/utils/logger at depth 1", () => {
    const r = executeQuery(fixture, {
      operation: "dependents_of",
      module: "src/utils/logger",
      max_depth: 1,
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // api, auth, events, models all directly import logger
      assert.ok(ids.includes("src/api"), "src/api should be a direct dependent");
      assert.ok(ids.includes("src/auth"), "src/auth should be a direct dependent");
      assert.ok(ids.includes("src/events"), "src/events should be a direct dependent");
      assert.ok(ids.includes("src/models"), "src/models should be a direct dependent");
      // start node must not appear
      assert.ok(!ids.includes("src/utils/logger"), "start node must not appear in results");
    }
  });

  it("returns transitive dependents of src/config at depth 2", () => {
    const r = executeQuery(fixture, {
      operation: "dependents_of",
      module: "src/config",
      max_depth: 2,
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // direct: auth, db, cache, server
      // hop 2 from auth: api, public-api; from db: models, server (server already at hop 1)
      assert.ok(ids.includes("src/auth"), "src/auth imports src/config directly");
      assert.ok(ids.includes("src/db"), "src/db imports src/config directly");
      assert.ok(ids.includes("src/cache"), "src/cache imports src/config directly");
      assert.ok(ids.includes("src/server"), "src/server imports src/config directly");
      assert.ok(ids.length >= 4, `expected at least 4 dependents, got ${ids.length}`);
    }
  });

  it("returns empty when no node depends on src/server", () => {
    const r = executeQuery(fixture, {
      operation: "dependents_of",
      module: "src/server",
      max_depth: 2,
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.matched_nodes.length, 0, "nothing imports src/server");
    }
  });

  it("returns MODULE_NOT_IN_GRAPH for a missing module", () => {
    const r = executeQuery(fixture, {
      operation: "dependents_of",
      module: "src/does-not-exist",
      max_depth: 1,
    });
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
    }
  });

  it("matched edges only connect nodes in the result + start set", () => {
    const r = executeQuery(fixture, {
      operation: "dependents_of",
      module: "src/models",
      max_depth: 2,
    });
    assert.equal(r.success, true);
    if (r.success) {
      const visited = new Set<string>([...r.matched_nodes.map((n) => n.id), "src/models"]);
      for (const e of r.matched_edges) {
        assert.ok(
          visited.has(e.source) && visited.has(e.target),
          `edge ${e.source} -> ${e.target} has endpoint outside visited set`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// dependencies_of
// ---------------------------------------------------------------------------

describe("integration: dependencies_of", () => {
  it("returns direct dependencies of src/server at depth 1", () => {
    const r = executeQuery(fixture, {
      operation: "dependencies_of",
      module: "src/server",
      max_depth: 1,
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // server -> auth, api, config, db
      assert.ok(ids.includes("src/auth"), "src/server -> src/auth");
      assert.ok(ids.includes("src/api"), "src/server -> src/api");
      assert.ok(ids.includes("src/config"), "src/server -> src/config");
      assert.ok(ids.includes("src/db"), "src/server -> src/db");
      assert.ok(!ids.includes("src/server"), "start node must not appear");
    }
  });

  it("depth 2 from src/server includes second-hop nodes", () => {
    const r = executeQuery(fixture, {
      operation: "dependencies_of",
      module: "src/server",
      max_depth: 2,
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // hop 2: auth -> models, logger, config; api -> models, logger, cache, events
      assert.ok(ids.includes("src/models"), "src/models reachable at depth 2");
      assert.ok(ids.includes("src/utils/logger"), "src/utils/logger reachable at depth 2");
      assert.ok(ids.includes("src/cache"), "src/cache reachable at depth 2");
    }
  });

  it("returns empty dependencies for leaf node src/config", () => {
    const r = executeQuery(fixture, {
      operation: "dependencies_of",
      module: "src/config",
      max_depth: 3,
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.matched_nodes.length, 0, "src/config has no outgoing edges");
    }
  });

  it("returns MODULE_NOT_IN_GRAPH for a missing module", () => {
    const r = executeQuery(fixture, {
      operation: "dependencies_of",
      module: "src/nonexistent",
      max_depth: 1,
    });
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
    }
  });

  it("matched edges are within the traversal subgraph", () => {
    const r = executeQuery(fixture, {
      operation: "dependencies_of",
      module: "src/api",
      max_depth: 2,
    });
    assert.equal(r.success, true);
    if (r.success) {
      const visited = new Set<string>([...r.matched_nodes.map((n) => n.id), "src/api"]);
      for (const e of r.matched_edges) {
        assert.ok(
          visited.has(e.source) && visited.has(e.target),
          `edge ${e.source} -> ${e.target} has endpoint outside visited set`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// filter
// ---------------------------------------------------------------------------

describe("integration: filter", () => {
  it("filters by criticality=critical", () => {
    const r = executeQuery(fixture, {
      operation: "filter",
      conditions: { criticality: "critical" },
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // server, auth, config, db are all critical in the fixture
      assert.ok(ids.includes("src/server"), "src/server is critical");
      assert.ok(ids.includes("src/auth"), "src/auth is critical");
      assert.ok(ids.includes("src/config"), "src/config is critical");
      assert.ok(ids.includes("src/db"), "src/db is critical");
      // all returned nodes must actually be critical
      for (const n of r.matched_nodes) {
        assert.equal(n.criticality, "critical", `${n.id} has unexpected criticality`);
      }
    }
  });

  it("filters by stability=experimental", () => {
    const r = executeQuery(fixture, {
      operation: "filter",
      conditions: { stability: "experimental" },
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      assert.ok(ids.includes("src/events"), "src/events is experimental");
      for (const n of r.matched_nodes) {
        assert.equal(n.stability, "experimental", `${n.id} has unexpected stability`);
      }
    }
  });

  it("AND-combines multiple conditions", () => {
    const r = executeQuery(fixture, {
      operation: "filter",
      conditions: { criticality: "critical", role: "config" },
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      assert.deepEqual(ids, ["src/config"]);
    }
  });

  it("returns all nodes on empty conditions", () => {
    const r = executeQuery(fixture, {
      operation: "filter",
      conditions: {},
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(
        r.matched_nodes.length,
        Object.keys(fixture.nodes).length,
        "empty filter must return all nodes",
      );
    }
  });

  it("returns empty result for non-matching conditions", () => {
    const r = executeQuery(fixture, {
      operation: "filter",
      conditions: { criticality: "critical", stability: "experimental" },
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.matched_nodes.length, 0);
      assert.equal(r.matched_edges.length, 0);
    }
  });

  it("matched edges touch at least one matched node", () => {
    const r = executeQuery(fixture, {
      operation: "filter",
      conditions: { test_coverage: "untested" },
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = new Set(r.matched_nodes.map((n) => n.id));
      for (const e of r.matched_edges) {
        assert.ok(
          ids.has(e.source) || ids.has(e.target),
          `edge ${e.source} -> ${e.target} does not touch any matched node`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// transitive_dependents
// ---------------------------------------------------------------------------

describe("integration: transitive_dependents", () => {
  it("returns full upstream closure of src/utils/logger at depth 5", () => {
    const r = executeQuery(fixture, {
      operation: "transitive_dependents",
      module: "src/utils/logger",
      max_depth: 5,
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // Direct importers: api, auth, events, models
      // Transitive (via auth): server, api, public-api
      // Transitive (via models): server, api, auth, events
      const expected = ["src/api", "src/auth", "src/events", "src/models", "src/server", "src/public-api"];
      for (const id of expected) {
        assert.ok(ids.includes(id), `missing transitively dependent node: ${id}`);
      }
      assert.ok(
        !ids.includes("src/utils/logger"),
        "start node must not appear in transitive_dependents result",
      );
    }
  });

  it("depth 1 limits to only direct dependents", () => {
    const r = executeQuery(fixture, {
      operation: "transitive_dependents",
      module: "src/models",
      max_depth: 1,
    });
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // Direct importers of models: api, auth, events
      assert.deepEqual(ids, ["src/api", "src/auth", "src/events"]);
    }
  });

  it("returns MODULE_NOT_IN_GRAPH for a missing module", () => {
    const r = executeQuery(fixture, {
      operation: "transitive_dependents",
      module: "src/phantom",
      max_depth: 2,
    });
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
    }
  });

  it("returns empty when no node depends on the target", () => {
    const r = executeQuery(fixture, {
      operation: "transitive_dependents",
      module: "src/server",
      max_depth: 3,
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.matched_nodes.length, 0, "nothing transitively depends on src/server");
    }
  });

  it("matched edges are within the traversal subgraph", () => {
    const r = executeQuery(fixture, {
      operation: "transitive_dependents",
      module: "src/db",
      max_depth: 3,
    });
    assert.equal(r.success, true);
    if (r.success) {
      const visited = new Set<string>([...r.matched_nodes.map((n) => n.id), "src/db"]);
      for (const e of r.matched_edges) {
        assert.ok(
          visited.has(e.source) && visited.has(e.target),
          `edge ${e.source} -> ${e.target} has endpoint outside visited set`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// runQueryFromJson end-to-end (full pipeline via the fixture)
// ---------------------------------------------------------------------------

describe("integration: runQueryFromJson full pipeline", () => {
  it("executes a dependents_of JSON query against the fixture", () => {
    const r = runQueryFromJson(
      fixture,
      JSON.stringify({ operation: "dependents_of", module: "src/config", max_depth: 1 }),
    );
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // Direct importers: auth, cache, db, server
      assert.ok(ids.includes("src/auth"));
      assert.ok(ids.includes("src/db"));
      assert.ok(ids.includes("src/server"));
    }
  });

  it("executes a dependencies_of JSON query against the fixture", () => {
    const r = runQueryFromJson(
      fixture,
      JSON.stringify({ operation: "dependencies_of", module: "src/auth", max_depth: 2 }),
    );
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // depth 1: models, logger, config; depth 2: db (via models), db -> config already visited
      assert.ok(ids.includes("src/models"), "auth -> models");
      assert.ok(ids.includes("src/utils/logger"), "auth -> logger");
      assert.ok(ids.includes("src/config"), "auth -> config");
    }
  });

  it("executes a filter JSON query against the fixture", () => {
    const r = runQueryFromJson(
      fixture,
      JSON.stringify({ operation: "filter", conditions: { role: "entry_point" } }),
    );
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.matched_nodes.length, 1);
      assert.equal(r.matched_nodes[0].id, "src/server");
    }
  });

  it("executes a transitive_dependents JSON query against the fixture", () => {
    const r = runQueryFromJson(
      fixture,
      JSON.stringify({ operation: "transitive_dependents", module: "src/auth", max_depth: 2 }),
    );
    assert.equal(r.success, true);
    if (r.success) {
      const ids = nodeIds(r.matched_nodes);
      // Direct importers: api, server, public-api
      assert.ok(ids.includes("src/api"), "api imports auth");
      assert.ok(ids.includes("src/server"), "server imports auth");
      assert.ok(ids.includes("src/public-api"), "public-api imports auth");
    }
  });

  it("returns MODULE_NOT_IN_GRAPH for unknown module via JSON pipeline", () => {
    const r = runQueryFromJson(
      fixture,
      JSON.stringify({ operation: "dependencies_of", module: "src/ghost", max_depth: 1 }),
    );
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.code, "MODULE_NOT_IN_GRAPH");
    }
  });

  it("returns INVALID_QUERY for malformed JSON", () => {
    const r = runQueryFromJson(fixture, "{ not valid json");
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.code, "INVALID_QUERY");
    }
  });

  it("returns UNKNOWN_OPERATION for unsupported operation", () => {
    const r = runQueryFromJson(fixture, JSON.stringify({ operation: "obliterate" }));
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.code, "UNKNOWN_OPERATION");
    }
  });
});
