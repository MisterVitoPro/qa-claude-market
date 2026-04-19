/**
 * Tests for validateGraphSchema.
 *
 * Test suite covers:
 * - Valid fixture (graph-schema-example.json from wave 1)
 * - Missing top-level fields
 * - Header field violations (wrong type, wrong schema_version, bad timestamp)
 * - Node field violations (missing required, bad enum values, module without files)
 * - Edge field violations (missing required, bad enum values, unknown node refs)
 * - Metadata field violations (missing, non-integer, negative)
 * - Completely invalid input (null, array, string)
 */

import { validateGraphSchema, type ValidationResult } from "./schema-validator";
import fixture from "../test-fixtures/graph-schema-example.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone the fixture so mutations never bleed between tests. */
function cloneFixture(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;
}

function expectValid(result: ValidationResult): void {
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
}

function expectInvalid(result: ValidationResult, ...substrings: string[]): void {
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
  for (const sub of substrings) {
    expect(result.errors.some((e) => e.includes(sub))).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Valid fixture
// ---------------------------------------------------------------------------

describe("validateGraphSchema — valid fixture", () => {
  it("accepts the wave-1 graph-schema-example.json fixture unchanged", () => {
    expectValid(validateGraphSchema(fixture));
  });
});

// ---------------------------------------------------------------------------
// Root-level structural violations
// ---------------------------------------------------------------------------

describe("validateGraphSchema — root-level violations", () => {
  it("rejects null", () => {
    expectInvalid(validateGraphSchema(null), "root");
  });

  it("rejects a plain array", () => {
    expectInvalid(validateGraphSchema([]), "root");
  });

  it("rejects a string", () => {
    expectInvalid(validateGraphSchema("not an object"), "root");
  });

  it("rejects when _header is missing", () => {
    const s = cloneFixture();
    delete s["_header"];
    expectInvalid(validateGraphSchema(s), "_header");
  });

  it("rejects when nodes is missing", () => {
    const s = cloneFixture();
    delete s["nodes"];
    expectInvalid(validateGraphSchema(s), "nodes");
  });

  it("rejects when edges is missing", () => {
    const s = cloneFixture();
    delete s["edges"];
    expectInvalid(validateGraphSchema(s), "edges");
  });

  it("rejects when metadata is missing", () => {
    const s = cloneFixture();
    delete s["metadata"];
    expectInvalid(validateGraphSchema(s), "metadata");
  });
});

// ---------------------------------------------------------------------------
// Header validation
// ---------------------------------------------------------------------------

describe("validateGraphSchema — _header", () => {
  it("rejects when _header is not an object", () => {
    const s = cloneFixture();
    s["_header"] = "bad";
    expectInvalid(validateGraphSchema(s), "_header");
  });

  it("rejects schema_version !== 2", () => {
    const s = cloneFixture();
    (s["_header"] as Record<string, unknown>)["schema_version"] = 1;
    expectInvalid(validateGraphSchema(s), "schema_version");
  });

  it("rejects schema_version as a string '2'", () => {
    const s = cloneFixture();
    (s["_header"] as Record<string, unknown>)["schema_version"] = "2";
    expectInvalid(validateGraphSchema(s), "schema_version");
  });

  it("rejects missing schema_version", () => {
    const s = cloneFixture();
    delete (s["_header"] as Record<string, unknown>)["schema_version"];
    expectInvalid(validateGraphSchema(s), "schema_version");
  });

  it("rejects empty plugin_version", () => {
    const s = cloneFixture();
    (s["_header"] as Record<string, unknown>)["plugin_version"] = "";
    expectInvalid(validateGraphSchema(s), "plugin_version");
  });

  it("rejects missing plugin_version", () => {
    const s = cloneFixture();
    delete (s["_header"] as Record<string, unknown>)["plugin_version"];
    expectInvalid(validateGraphSchema(s), "plugin_version");
  });

  it("rejects non-ISO generated_at", () => {
    const s = cloneFixture();
    (s["_header"] as Record<string, unknown>)["generated_at"] = "not-a-date";
    expectInvalid(validateGraphSchema(s), "generated_at");
  });

  it("rejects numeric generated_at", () => {
    const s = cloneFixture();
    (s["_header"] as Record<string, unknown>)["generated_at"] = 12345;
    expectInvalid(validateGraphSchema(s), "generated_at");
  });

  it("rejects missing generated_at", () => {
    const s = cloneFixture();
    delete (s["_header"] as Record<string, unknown>)["generated_at"];
    expectInvalid(validateGraphSchema(s), "generated_at");
  });

  it("rejects missing baseline_commit", () => {
    const s = cloneFixture();
    delete (s["_header"] as Record<string, unknown>)["baseline_commit"];
    expectInvalid(validateGraphSchema(s), "baseline_commit");
  });

  it("accepts empty-string baseline_commit (unavailable SHA)", () => {
    const s = cloneFixture();
    (s["_header"] as Record<string, unknown>)["baseline_commit"] = "";
    expectValid(validateGraphSchema(s));
  });

  it("rejects empty scan_root", () => {
    const s = cloneFixture();
    (s["_header"] as Record<string, unknown>)["scan_root"] = "   ";
    expectInvalid(validateGraphSchema(s), "scan_root");
  });

  it("rejects missing scan_root", () => {
    const s = cloneFixture();
    delete (s["_header"] as Record<string, unknown>)["scan_root"];
    expectInvalid(validateGraphSchema(s), "scan_root");
  });
});

// ---------------------------------------------------------------------------
// Node validation
// ---------------------------------------------------------------------------

describe("validateGraphSchema — nodes", () => {
  it("rejects when nodes is an array instead of object", () => {
    const s = cloneFixture();
    s["nodes"] = [];
    expectInvalid(validateGraphSchema(s), "nodes");
  });

  it("rejects a node missing required type field", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    delete nodes["src/server"]["type"];
    expectInvalid(validateGraphSchema(s), 'nodes["src/server"].type');
  });

  it("rejects a node with invalid type value", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    nodes["src/server"]["type"] = "directory";
    expectInvalid(validateGraphSchema(s), 'nodes["src/server"].type');
  });

  it("rejects a module node with no files array", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    delete nodes["src/auth"]["files"];
    expectInvalid(validateGraphSchema(s), 'nodes["src/auth"].files');
  });

  it("rejects a module node with empty files array", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    nodes["src/auth"]["files"] = [];
    expectInvalid(validateGraphSchema(s), 'nodes["src/auth"].files');
  });

  it("rejects a node with invalid role", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    nodes["src/server"]["role"] = "router";
    expectInvalid(validateGraphSchema(s), 'nodes["src/server"].role');
  });

  it("rejects a node missing role", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    delete nodes["src/server"]["role"];
    expectInvalid(validateGraphSchema(s), 'nodes["src/server"].role');
  });

  it("rejects a node with invalid criticality", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    nodes["src/server"]["criticality"] = "extreme";
    expectInvalid(validateGraphSchema(s), 'nodes["src/server"].criticality');
  });

  it("rejects a node with invalid stability", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    nodes["src/server"]["stability"] = "deprecated";
    expectInvalid(validateGraphSchema(s), 'nodes["src/server"].stability');
  });

  it("rejects a node with invalid test_coverage", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    nodes["src/server"]["test_coverage"] = "fully_tested";
    expectInvalid(validateGraphSchema(s), 'nodes["src/server"].test_coverage');
  });

  it("rejects a node missing description", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    delete nodes["src/server"]["description"];
    expectInvalid(validateGraphSchema(s), 'nodes["src/server"].description');
  });

  it("rejects a node with non-string description", () => {
    const s = cloneFixture();
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    nodes["src/server"]["description"] = 42;
    expectInvalid(validateGraphSchema(s), 'nodes["src/server"].description');
  });
});

// ---------------------------------------------------------------------------
// Edge validation
// ---------------------------------------------------------------------------

describe("validateGraphSchema — edges", () => {
  it("rejects when edges is an object instead of array", () => {
    const s = cloneFixture();
    s["edges"] = {};
    expectInvalid(validateGraphSchema(s), "edges");
  });

  it("rejects an edge missing source", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    delete edges[0]["source"];
    expectInvalid(validateGraphSchema(s), "edges[0].source");
  });

  it("rejects an edge with source referencing a non-existent node", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    edges[0]["source"] = "src/nonexistent";
    expectInvalid(validateGraphSchema(s), 'edges[0].source', "nonexistent");
  });

  it("rejects an edge missing target", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    delete edges[0]["target"];
    expectInvalid(validateGraphSchema(s), "edges[0].target");
  });

  it("rejects an edge with target referencing a non-existent node", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    edges[0]["target"] = "src/ghost";
    expectInvalid(validateGraphSchema(s), 'edges[0].target', "ghost");
  });

  it("rejects an edge with invalid type", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    edges[0]["type"] = "unknown_import";
    expectInvalid(validateGraphSchema(s), "edges[0].type");
  });

  it("rejects an edge missing type", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    delete edges[0]["type"];
    expectInvalid(validateGraphSchema(s), "edges[0].type");
  });

  it("rejects an edge with invalid strength", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    edges[0]["strength"] = "weak";
    expectInvalid(validateGraphSchema(s), "edges[0].strength");
  });

  it("rejects an edge with invalid directionality", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    edges[0]["directionality"] = "bidirectional";
    expectInvalid(validateGraphSchema(s), "edges[0].directionality");
  });

  it("rejects an edge with invalid impact value", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    edges[0]["impact"] = "high_risk";
    expectInvalid(validateGraphSchema(s), "edges[0].impact");
  });

  it("accepts an edge with empty-string impact", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    // Find an edge that already has empty impact to confirm it passes
    const emptyImpactEdge = edges.find((e) => e["impact"] === "");
    expect(emptyImpactEdge).toBeDefined();
    expectValid(validateGraphSchema(s));
  });

  it("rejects an edge missing impact", () => {
    const s = cloneFixture();
    const edges = s["edges"] as Array<Record<string, unknown>>;
    delete edges[0]["impact"];
    expectInvalid(validateGraphSchema(s), "edges[0].impact");
  });
});

// ---------------------------------------------------------------------------
// Metadata validation
// ---------------------------------------------------------------------------

describe("validateGraphSchema — metadata", () => {
  it("rejects when metadata is an array", () => {
    const s = cloneFixture();
    s["metadata"] = [];
    expectInvalid(validateGraphSchema(s), "metadata");
  });

  it("rejects missing total_nodes", () => {
    const s = cloneFixture();
    delete (s["metadata"] as Record<string, unknown>)["total_nodes"];
    expectInvalid(validateGraphSchema(s), "metadata.total_nodes");
  });

  it("rejects non-integer total_nodes", () => {
    const s = cloneFixture();
    (s["metadata"] as Record<string, unknown>)["total_nodes"] = 3.5;
    expectInvalid(validateGraphSchema(s), "metadata.total_nodes");
  });

  it("rejects negative total_edges", () => {
    const s = cloneFixture();
    (s["metadata"] as Record<string, unknown>)["total_edges"] = -1;
    expectInvalid(validateGraphSchema(s), "metadata.total_edges");
  });

  it("rejects missing key_modules_analyzed", () => {
    const s = cloneFixture();
    delete (s["metadata"] as Record<string, unknown>)["key_modules_analyzed"];
    expectInvalid(validateGraphSchema(s), "metadata.key_modules_analyzed");
  });

  it("rejects string circular_dependency_count", () => {
    const s = cloneFixture();
    (s["metadata"] as Record<string, unknown>)["circular_dependency_count"] = "1";
    expectInvalid(validateGraphSchema(s), "metadata.circular_dependency_count");
  });

  it("accepts circular_dependency_count of 0", () => {
    const s = cloneFixture();
    (s["metadata"] as Record<string, unknown>)["circular_dependency_count"] = 0;
    expectValid(validateGraphSchema(s));
  });
});

// ---------------------------------------------------------------------------
// Multiple simultaneous violations
// ---------------------------------------------------------------------------

describe("validateGraphSchema — multiple violations", () => {
  it("collects all errors across sections", () => {
    const s = cloneFixture();
    // Break header
    (s["_header"] as Record<string, unknown>)["schema_version"] = 99;
    // Break a node
    const nodes = s["nodes"] as Record<string, Record<string, unknown>>;
    nodes["src/server"]["criticality"] = "extreme";
    // Break metadata
    (s["metadata"] as Record<string, unknown>)["total_nodes"] = -5;

    const result = validateGraphSchema(s);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.errors.some((e) => e.includes("schema_version"))).toBe(true);
    expect(result.errors.some((e) => e.includes("criticality"))).toBe(true);
    expect(result.errors.some((e) => e.includes("total_nodes"))).toBe(true);
  });
});
