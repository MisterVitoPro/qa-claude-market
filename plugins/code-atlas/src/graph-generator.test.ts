/**
 * Unit tests for graph-generator.ts
 *
 * Tests cover:
 * - Happy-path generation: nodes, edges, metadata all populated correctly
 * - Edge annotation: type, strength, directionality, impact inferred correctly
 * - Circular dependency detection
 * - Missing/unresolvable modules handled gracefully (no crash, no phantom edges)
 * - Self-imports skipped
 * - Deduplication of edges from multiple files in the same module
 * - Empty inputs
 */

import { generateGraphSchema } from "./graph-generator";
import type {
  StateJson,
  SemanticNodeMetadata,
  GraphGeneratorConfig,
} from "./graph-generator";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<GraphGeneratorConfig> = {}): GraphGeneratorConfig {
  return {
    plugin_version: "2.0.0",
    generated_at: "2026-04-19T00:00:00.000Z",
    ...overrides,
  };
}

function makeState(overrides: Partial<StateJson> = {}): StateJson {
  return {
    _header: {
      schema_version: 1,
      plugin_version: "1.2.0",
      generated_at: "2026-04-19T00:00:00.000Z",
      baseline_commit: "abc1234",
      scan_root: ".",
    },
    file_index: {},
    import_graph: {},
    importer_counts: {},
    circular_dependencies: [],
    ...overrides,
  };
}

const AUTH_META: SemanticNodeMetadata = {
  path: "src/auth",
  type: "module",
  files: ["src/auth/index.ts", "src/auth/middleware.ts"],
  role: "middleware",
  criticality: "critical",
  stability: "stable",
  test_coverage: "well_tested",
  description: "JWT authentication middleware and session management",
};

const CONFIG_META: SemanticNodeMetadata = {
  path: "src/config",
  type: "file",
  role: "config",
  criticality: "critical",
  stability: "stable",
  test_coverage: "untested",
  description: "Application configuration — reads environment variables",
};

const LOGGER_META: SemanticNodeMetadata = {
  path: "src/utils/logger",
  type: "file",
  role: "utility",
  criticality: "medium",
  stability: "stable",
  test_coverage: "partial",
  description: "Structured logger utility",
};

const MODELS_META: SemanticNodeMetadata = {
  path: "src/models",
  type: "module",
  files: ["src/models/user.ts", "src/models/project.ts"],
  role: "model",
  criticality: "high",
  stability: "stable",
  test_coverage: "well_tested",
  description: "Data models and ORM entity definitions",
};

const SERVER_META: SemanticNodeMetadata = {
  path: "src/server",
  type: "file",
  role: "entry_point",
  criticality: "low",
  stability: "stable",
  test_coverage: "partial",
  description: "HTTP server entry point",
};

const EVENTS_META: SemanticNodeMetadata = {
  path: "src/events",
  type: "module",
  files: ["src/events/index.ts", "src/events/emitter.ts"],
  role: "internal",
  criticality: "low",
  stability: "experimental",
  test_coverage: "untested",
  description: "Experimental internal event bus",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findEdge(
  edges: ReturnType<typeof generateGraphSchema>["edges"],
  source: string,
  target: string
) {
  return edges.find((e) => e.source === source && e.target === target);
}

// ---------------------------------------------------------------------------
// Tests: header
// ---------------------------------------------------------------------------

describe("generateGraphSchema — _header", () => {
  it("populates schema_version as 2", () => {
    const schema = generateGraphSchema(makeState(), [], makeConfig());
    expect(schema._header.schema_version).toBe(2);
  });

  it("copies plugin_version from config", () => {
    const schema = generateGraphSchema(makeState(), [], makeConfig({ plugin_version: "2.1.0" }));
    expect(schema._header.plugin_version).toBe("2.1.0");
  });

  it("copies generated_at from config when provided", () => {
    const ts = "2026-01-01T12:00:00.000Z";
    const schema = generateGraphSchema(makeState(), [], makeConfig({ generated_at: ts }));
    expect(schema._header.generated_at).toBe(ts);
  });

  it("falls back to current ISO string when generated_at is omitted", () => {
    const before = Date.now();
    const schema = generateGraphSchema(makeState(), [], makeConfig({ generated_at: undefined }));
    const after = Date.now();
    const ts = Date.parse(schema._header.generated_at);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("copies baseline_commit from state._header", () => {
    const state = makeState();
    state._header.baseline_commit = "deadbeef";
    const schema = generateGraphSchema(state, [], makeConfig());
    expect(schema._header.baseline_commit).toBe("deadbeef");
  });

  it("copies scan_root from state._header", () => {
    const state = makeState();
    state._header.scan_root = "packages/backend";
    const schema = generateGraphSchema(state, [], makeConfig());
    expect(schema._header.scan_root).toBe("packages/backend");
  });
});

// ---------------------------------------------------------------------------
// Tests: nodes
// ---------------------------------------------------------------------------

describe("generateGraphSchema — nodes", () => {
  it("returns empty nodes for empty semantic metadata", () => {
    const schema = generateGraphSchema(makeState(), [], makeConfig());
    expect(Object.keys(schema.nodes)).toHaveLength(0);
  });

  it("creates a node for each semantic metadata entry", () => {
    const meta = [AUTH_META, CONFIG_META, LOGGER_META];
    const schema = generateGraphSchema(makeState(), meta, makeConfig());
    expect(Object.keys(schema.nodes)).toEqual(["src/auth", "src/config", "src/utils/logger"]);
  });

  it("sets node type correctly for module and file", () => {
    const meta = [AUTH_META, CONFIG_META];
    const schema = generateGraphSchema(makeState(), meta, makeConfig());
    expect(schema.nodes["src/auth"].type).toBe("module");
    expect(schema.nodes["src/config"].type).toBe("file");
  });

  it("includes files array for module nodes", () => {
    const meta = [AUTH_META];
    const schema = generateGraphSchema(makeState(), meta, makeConfig());
    expect(schema.nodes["src/auth"].files).toEqual([
      "src/auth/index.ts",
      "src/auth/middleware.ts",
    ]);
  });

  it("does not add files property to file nodes", () => {
    const meta = [CONFIG_META];
    const schema = generateGraphSchema(makeState(), meta, makeConfig());
    expect(Object.prototype.hasOwnProperty.call(schema.nodes["src/config"], "files")).toBe(false);
  });

  it("copies all semantic attributes (role, criticality, stability, test_coverage)", () => {
    const meta = [MODELS_META];
    const schema = generateGraphSchema(makeState(), meta, makeConfig());
    const node = schema.nodes["src/models"];
    expect(node.role).toBe("model");
    expect(node.criticality).toBe("high");
    expect(node.stability).toBe("stable");
    expect(node.test_coverage).toBe("well_tested");
  });

  it("copies description", () => {
    const meta = [LOGGER_META];
    const schema = generateGraphSchema(makeState(), meta, makeConfig());
    expect(schema.nodes["src/utils/logger"].description).toBe("Structured logger utility");
  });

  it("skips metadata entries with empty path", () => {
    const badMeta: SemanticNodeMetadata = {
      path: "",
      type: "file",
      role: "internal",
      criticality: "low",
      stability: "stable",
      test_coverage: "untested",
      description: "",
    };
    const schema = generateGraphSchema(makeState(), [badMeta], makeConfig());
    expect(Object.keys(schema.nodes)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: edges — basic generation
// ---------------------------------------------------------------------------

describe("generateGraphSchema — edges (basic)", () => {
  it("returns empty edges when import_graph is empty", () => {
    const schema = generateGraphSchema(makeState(), [AUTH_META, CONFIG_META], makeConfig());
    expect(schema.edges).toHaveLength(0);
  });

  it("creates an edge for a direct import between two key-set nodes", () => {
    const state = makeState({
      import_graph: {
        "src/auth/index.ts": ["src/config"],
      },
      importer_counts: { "src/config": 5 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/config");
    expect(edge).toBeDefined();
  });

  it("does not create edges for imports targeting external packages", () => {
    const state = makeState({
      import_graph: {
        "src/auth/index.ts": ["express", "jsonwebtoken"],
      },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig());
    expect(schema.edges).toHaveLength(0);
  });

  it("does not create edges for imports not in the key set", () => {
    const state = makeState({
      import_graph: {
        "src/auth/index.ts": ["src/unknown-module"],
      },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig());
    expect(schema.edges).toHaveLength(0);
  });

  it("resolves source file to its parent module node", () => {
    // src/auth/middleware.ts is inside the src/auth module node
    const state = makeState({
      import_graph: {
        "src/auth/middleware.ts": ["src/config"],
      },
      importer_counts: { "src/config": 3 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/config");
    expect(edge).toBeDefined();
  });

  it("resolves target import with .ts extension to extension-stripped node key", () => {
    const state = makeState({
      import_graph: {
        "src/server.ts": ["src/utils/logger.ts"],
      },
      importer_counts: { "src/utils/logger": 3 },
    });
    const schema = generateGraphSchema(state, [SERVER_META, LOGGER_META], makeConfig());
    const edge = findEdge(schema.edges, "src/server", "src/utils/logger");
    expect(edge).toBeDefined();
  });

  it("deduplicates edges from multiple files in the same module", () => {
    // Both src/auth/index.ts and src/auth/middleware.ts import src/config
    const state = makeState({
      import_graph: {
        "src/auth/index.ts": ["src/config"],
        "src/auth/middleware.ts": ["src/config"],
      },
      importer_counts: { "src/config": 2 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig());
    const edges = schema.edges.filter(
      (e) => e.source === "src/auth" && e.target === "src/config"
    );
    expect(edges).toHaveLength(1);
  });

  it("skips self-imports (source and target resolve to the same node)", () => {
    const state = makeState({
      import_graph: {
        "src/auth/index.ts": ["src/auth/middleware.ts"],
      },
    });
    const schema = generateGraphSchema(state, [AUTH_META], makeConfig());
    expect(schema.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: edge type inference
// ---------------------------------------------------------------------------

describe("generateGraphSchema — edge type inference", () => {
  it("assigns 'configuration' type when target role is config", () => {
    const state = makeState({
      import_graph: { "src/auth/index.ts": ["src/config"] },
      importer_counts: { "src/config": 8 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/config");
    expect(edge?.type).toBe("configuration");
  });

  it("assigns 'composition' type when target role is model", () => {
    const state = makeState({
      import_graph: { "src/auth/index.ts": ["src/models"] },
      importer_counts: { "src/models": 6 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, MODELS_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/models");
    expect(edge?.type).toBe("composition");
  });

  it("assigns 'direct_import' type for utility target", () => {
    const state = makeState({
      import_graph: { "src/auth/index.ts": ["src/utils/logger"] },
      importer_counts: { "src/utils/logger": 3 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, LOGGER_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/utils/logger");
    expect(edge?.type).toBe("direct_import");
  });
});

// ---------------------------------------------------------------------------
// Tests: edge strength inference
// ---------------------------------------------------------------------------

describe("generateGraphSchema — edge strength inference", () => {
  it("assigns 'core' strength when target is a config node", () => {
    const state = makeState({
      import_graph: { "src/server.ts": ["src/config"] },
      importer_counts: { "src/config": 8 },
    });
    const schema = generateGraphSchema(state, [SERVER_META, CONFIG_META], makeConfig());
    const edge = findEdge(schema.edges, "src/server", "src/config");
    expect(edge?.strength).toBe("core");
  });

  it("assigns 'core' strength when target is a middleware node", () => {
    const state = makeState({
      import_graph: { "src/server.ts": ["src/auth"] },
      importer_counts: { "src/auth": 8 },
    });
    const schema = generateGraphSchema(state, [SERVER_META, AUTH_META], makeConfig());
    const edge = findEdge(schema.edges, "src/server", "src/auth");
    expect(edge?.strength).toBe("core");
  });

  it("assigns 'utility' strength when target is a utility node with importer_count >= 2", () => {
    const state = makeState({
      import_graph: { "src/auth/index.ts": ["src/utils/logger"] },
      importer_counts: { "src/utils/logger": 3 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, LOGGER_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/utils/logger");
    expect(edge?.strength).toBe("utility");
  });

  it("assigns 'optional' strength for internal/experimental target with low importer count", () => {
    const state = makeState({
      import_graph: { "src/auth/index.ts": ["src/events"] },
      importer_counts: { "src/events": 1 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, EVENTS_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/events");
    expect(edge?.strength).toBe("optional");
  });
});

// ---------------------------------------------------------------------------
// Tests: edge directionality
// ---------------------------------------------------------------------------

describe("generateGraphSchema — edge directionality", () => {
  it("assigns 'required' for a normal one-way dependency", () => {
    const state = makeState({
      import_graph: { "src/server.ts": ["src/config"] },
      importer_counts: { "src/config": 5 },
    });
    const schema = generateGraphSchema(state, [SERVER_META, CONFIG_META], makeConfig());
    const edge = findEdge(schema.edges, "src/server", "src/config");
    expect(edge?.directionality).toBe("required");
  });

  it("assigns 'circular' for edges in a circular dependency chain", () => {
    const state = makeState({
      import_graph: {
        "src/auth/index.ts": ["src/models"],
        "src/models/user.ts": ["src/auth"],
      },
      importer_counts: { "src/models": 4, "src/auth": 6 },
      circular_dependencies: [
        {
          chain: ["src/auth", "src/models", "src/auth"],
          severity: "minor",
          description: "Auth and Models cross-reference",
        },
      ],
    });
    const schema = generateGraphSchema(state, [AUTH_META, MODELS_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/models");
    expect(edge?.directionality).toBe("circular");
  });

  it("assigns 'conditional' for imports targeting internal/experimental nodes", () => {
    const state = makeState({
      import_graph: { "src/auth/index.ts": ["src/events"] },
      importer_counts: { "src/events": 1 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, EVENTS_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/events");
    expect(edge?.directionality).toBe("conditional");
  });
});

// ---------------------------------------------------------------------------
// Tests: edge impact
// ---------------------------------------------------------------------------

describe("generateGraphSchema — edge impact", () => {
  it("assigns 'breaking_change_risk' when target is critical config", () => {
    const state = makeState({
      import_graph: { "src/auth/index.ts": ["src/config"] },
      importer_counts: { "src/config": 10 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/config");
    expect(edge?.impact).toBe("breaking_change_risk");
  });

  it("assigns 'ripple_effect_magnitude' when target has >= 5 importers and is not config/middleware/public_api", () => {
    const state = makeState({
      import_graph: { "src/server.ts": ["src/utils/logger"] },
      importer_counts: { "src/utils/logger": 12 },
    });
    const schema = generateGraphSchema(state, [SERVER_META, LOGGER_META], makeConfig());
    const edge = findEdge(schema.edges, "src/server", "src/utils/logger");
    expect(edge?.impact).toBe("ripple_effect_magnitude");
  });

  it("assigns '' for a low-criticality internal target", () => {
    const state = makeState({
      import_graph: { "src/auth/index.ts": ["src/events"] },
      importer_counts: { "src/events": 1 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, EVENTS_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/events");
    expect(edge?.impact).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Tests: metadata
// ---------------------------------------------------------------------------

describe("generateGraphSchema — metadata", () => {
  it("populates total_nodes correctly", () => {
    const meta = [AUTH_META, CONFIG_META, LOGGER_META];
    const schema = generateGraphSchema(makeState(), meta, makeConfig());
    expect(schema.metadata.total_nodes).toBe(3);
  });

  it("populates total_edges correctly", () => {
    const state = makeState({
      import_graph: {
        "src/auth/index.ts": ["src/config"],
        "src/utils/logger.ts": ["src/config"],
      },
      importer_counts: { "src/config": 5 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META, LOGGER_META], makeConfig());
    expect(schema.metadata.total_edges).toBe(2);
  });

  it("populates key_modules_analyzed as the length of semanticMeta input", () => {
    const meta = [AUTH_META, CONFIG_META];
    const schema = generateGraphSchema(makeState(), meta, makeConfig());
    expect(schema.metadata.key_modules_analyzed).toBe(2);
  });

  it("counts circular dependency pairs correctly", () => {
    const state = makeState({
      import_graph: {
        "src/auth/index.ts": ["src/models"],
        "src/models/user.ts": ["src/auth"],
      },
      importer_counts: { "src/models": 4, "src/auth": 6 },
      circular_dependencies: [
        {
          chain: ["src/auth", "src/models", "src/auth"],
          severity: "minor",
          description: "circular pair",
        },
      ],
    });
    const schema = generateGraphSchema(state, [AUTH_META, MODELS_META], makeConfig());
    // Both auth→models and models→auth edges get circular directionality
    // circular_dependency_count should be 1 (one pair)
    expect(schema.metadata.circular_dependency_count).toBe(1);
  });

  it("reports 0 circular_dependency_count when there are no circular deps", () => {
    const state = makeState({
      import_graph: { "src/server.ts": ["src/config"] },
      importer_counts: { "src/config": 5 },
    });
    const schema = generateGraphSchema(state, [SERVER_META, CONFIG_META], makeConfig());
    expect(schema.metadata.circular_dependency_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: graceful handling of missing/unresolvable modules
// ---------------------------------------------------------------------------

describe("generateGraphSchema — missing/unresolvable modules", () => {
  it("does not throw when import_graph references files not in semanticMeta", () => {
    const state = makeState({
      import_graph: {
        "src/orphan-file.ts": ["src/another-missing.ts"],
      },
    });
    expect(() =>
      generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig())
    ).not.toThrow();
  });

  it("does not create edges for source files absent from the key set", () => {
    const state = makeState({
      import_graph: {
        "src/orphan-file.ts": ["src/config"],
      },
      importer_counts: { "src/config": 2 },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig());
    expect(schema.edges).toHaveLength(0);
  });

  it("does not create edges for target modules absent from the key set", () => {
    const state = makeState({
      import_graph: {
        "src/auth/index.ts": ["src/missing-module"],
      },
    });
    const schema = generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig());
    expect(schema.edges).toHaveLength(0);
  });

  it("handles empty circular_dependencies array without error", () => {
    const state = makeState({
      circular_dependencies: [],
      import_graph: { "src/auth/index.ts": ["src/config"] },
      importer_counts: { "src/config": 4 },
    });
    expect(() =>
      generateGraphSchema(state, [AUTH_META, CONFIG_META], makeConfig())
    ).not.toThrow();
  });

  it("handles missing importer_counts entry (treats as 0)", () => {
    const state = makeState({
      import_graph: { "src/auth/index.ts": ["src/events"] },
      importer_counts: {},
    });
    const schema = generateGraphSchema(state, [AUTH_META, EVENTS_META], makeConfig());
    const edge = findEdge(schema.edges, "src/auth", "src/events");
    expect(edge).toBeDefined();
    // importer_count treated as 0 → optional strength
    expect(edge?.strength).toBe("optional");
  });

  it("handles semanticMeta entry missing description gracefully", () => {
    const metaNoDesc: SemanticNodeMetadata = {
      path: "src/server",
      type: "file",
      role: "entry_point",
      criticality: "low",
      stability: "stable",
      test_coverage: "untested",
      description: undefined as unknown as string,
    };
    const schema = generateGraphSchema(makeState(), [metaNoDesc], makeConfig());
    expect(schema.nodes["src/server"].description).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Tests: full example (reference fixture shape)
// ---------------------------------------------------------------------------

describe("generateGraphSchema — full example matching fixture shape", () => {
  it("produces a schema consistent with graph-schema-example.json fixture", () => {
    const allMeta: SemanticNodeMetadata[] = [
      {
        path: "src/server",
        type: "file",
        role: "entry_point",
        criticality: "critical",
        stability: "stable",
        test_coverage: "well_tested",
        description: "HTTP server entry point — bootstraps Express, registers routes and middleware",
      },
      {
        path: "src/auth",
        type: "module",
        files: ["src/auth/index.ts", "src/auth/middleware.ts", "src/auth/service.ts"],
        role: "middleware",
        criticality: "critical",
        stability: "stable",
        test_coverage: "well_tested",
        description: "Authentication layer — JWT verification, session middleware, user identity resolution",
      },
      {
        path: "src/models",
        type: "module",
        files: ["src/models/user.ts", "src/models/project.ts", "src/models/base.ts"],
        role: "model",
        criticality: "high",
        stability: "stable",
        test_coverage: "well_tested",
        description: "Data models and ORM entity definitions for user and project entities",
      },
      {
        path: "src/config",
        type: "file",
        role: "config",
        criticality: "critical",
        stability: "stable",
        test_coverage: "untested",
        description: "Application configuration — reads environment variables, validates required keys at startup",
      },
      {
        path: "src/utils/logger",
        type: "file",
        role: "utility",
        criticality: "medium",
        stability: "stable",
        test_coverage: "partial",
        description: "Structured logger utility — wraps pino with request correlation IDs",
      },
    ];

    const state = makeState({
      import_graph: {
        "src/server.ts": ["src/auth", "src/config"],
        "src/auth/index.ts": ["src/models", "src/config", "src/utils/logger"],
        "src/models/user.ts": ["src/utils/logger"],
      },
      importer_counts: {
        "src/auth": 3,
        "src/models": 2,
        "src/config": 10,
        "src/utils/logger": 8,
      },
      circular_dependencies: [],
    });

    const schema = generateGraphSchema(state, allMeta, makeConfig());

    // Header assertions
    expect(schema._header.schema_version).toBe(2);
    expect(schema._header.plugin_version).toBe("2.0.0");

    // All 5 nodes present
    expect(Object.keys(schema.nodes)).toHaveLength(5);
    expect(schema.nodes["src/server"]).toBeDefined();
    expect(schema.nodes["src/auth"]).toBeDefined();
    expect(schema.nodes["src/models"]).toBeDefined();
    expect(schema.nodes["src/config"]).toBeDefined();
    expect(schema.nodes["src/utils/logger"]).toBeDefined();

    // Auth is a module with files array
    expect(schema.nodes["src/auth"].files).toHaveLength(3);

    // Edges exist for declared imports
    expect(findEdge(schema.edges, "src/server", "src/auth")).toBeDefined();
    expect(findEdge(schema.edges, "src/server", "src/config")).toBeDefined();
    expect(findEdge(schema.edges, "src/auth", "src/models")).toBeDefined();
    expect(findEdge(schema.edges, "src/auth", "src/config")).toBeDefined();
    expect(findEdge(schema.edges, "src/auth", "src/utils/logger")).toBeDefined();
    expect(findEdge(schema.edges, "src/models", "src/utils/logger")).toBeDefined();

    // config target → 'configuration' type
    expect(findEdge(schema.edges, "src/server", "src/config")?.type).toBe("configuration");

    // models target → 'composition' type
    expect(findEdge(schema.edges, "src/auth", "src/models")?.type).toBe("composition");

    // logger utility → 'direct_import' type
    expect(findEdge(schema.edges, "src/auth", "src/utils/logger")?.type).toBe("direct_import");

    // config (critical + config role) → breaking_change_risk
    expect(findEdge(schema.edges, "src/server", "src/config")?.impact).toBe("breaking_change_risk");

    // logger has 8 importers → ripple_effect_magnitude
    expect(findEdge(schema.edges, "src/auth", "src/utils/logger")?.impact).toBe("ripple_effect_magnitude");

    // Metadata counts
    expect(schema.metadata.total_nodes).toBe(5);
    expect(schema.metadata.total_edges).toBe(6);
    expect(schema.metadata.key_modules_analyzed).toBe(5);
    expect(schema.metadata.circular_dependency_count).toBe(0);
  });
});
