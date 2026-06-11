#!/usr/bin/env node
// Code Atlas query runtime (dependency-free, Node >= 18).
//
// Executes graph queries against .code-atlas/graph-schema.json and validates
// the graph schema. Invoked by /code-atlas:query for deterministic, token-free
// query execution; also runnable standalone.
//
// Usage:
//   node query.js [--graph <path>] '<json-query>'
//   node query.js [--graph <path>] --query-file <path>
//   node query.js [--graph <path>] --validate
//
// Output: a JSON result envelope on stdout, followed by a plain-text
// breakdown (suppressed with --json-only).
//
// Exit codes:
//   0  query executed successfully, or validation passed
//   1  structured failure (invalid query, module not in graph, schema invalid)
//   2  environment failure (graph file missing or unreadable)

"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_MAX_DEPTH = 2;
const MAX_ALLOWED_DEPTH = 5;
const SUPPORTED_SCHEMA_VERSION = 2;

const KNOWN_OPERATIONS = new Set([
  "dependencies_of",
  "dependents_of",
  "filter",
  "transitive_dependents",
]);

const NODE_TYPES = new Set(["module", "file"]);
const NODE_ROLES = new Set([
  "entry_point",
  "core_module",
  "utility",
  "config",
  "middleware",
  "model",
  "public_api",
  "route_definition",
  "internal",
]);
const NODE_CRITICALITIES = new Set(["critical", "high", "medium", "low"]);
const NODE_STABILITIES = new Set(["stable", "evolving", "experimental"]);
const NODE_TEST_COVERAGES = new Set(["well_tested", "partial", "untested"]);

const EDGE_TYPES = new Set([
  "direct_import",
  "dynamic_import",
  "inheritance",
  "composition",
  "configuration",
  "sideeffect",
]);
const EDGE_STRENGTHS = new Set(["core", "utility", "optional"]);
const EDGE_DIRECTIONALITIES = new Set(["required", "circular", "conditional"]);
const EDGE_IMPACTS = new Set(["breaking_change_risk", "ripple_effect_magnitude", ""]);

const FILTERABLE_FIELDS = new Set([
  "role",
  "criticality",
  "stability",
  "test_coverage",
  "type",
]);

// ---------------------------------------------------------------------------
// Parsing and validation of queries
// ---------------------------------------------------------------------------

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isFiniteInteger(value) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function parseQuery(input) {
  if (typeof input !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_QUERY",
        message: "Query input must be a string containing a JSON object.",
      },
    };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUERY",
        message: "Query input is empty.",
        hint: 'Provide a JSON object such as {"operation":"filter","conditions":{"criticality":"critical"}}',
      },
    };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUERY",
        message: `Query is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        hint: "Ensure the query is a well-formed JSON object.",
      },
    };
  }
}

function validateQuery(value) {
  if (!isObject(value)) {
    return {
      ok: false,
      error: { code: "INVALID_QUERY", message: "Query must be a JSON object." },
    };
  }

  const operation = value.operation;
  if (!isNonEmptyString(operation)) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUERY",
        message: "Query is missing required field 'operation'.",
        hint: "Valid operations: dependencies_of, dependents_of, filter, transitive_dependents",
      },
    };
  }

  if (!KNOWN_OPERATIONS.has(operation)) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_OPERATION",
        message: `Unknown operation '${operation}'.`,
        hint: "Valid operations: dependencies_of, dependents_of, filter, transitive_dependents",
      },
    };
  }

  if (operation === "filter") {
    if (!isObject(value.conditions)) {
      return {
        ok: false,
        error: {
          code: "INVALID_QUERY",
          message: "Operation 'filter' requires a 'conditions' object.",
        },
      };
    }
    return { ok: true, query: { operation: "filter", conditions: value.conditions } };
  }

  // Traversal operations
  if (!isNonEmptyString(value.module)) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUERY",
        message: `Operation '${operation}' requires a non-empty string 'module'.`,
      },
    };
  }
  if (value.max_depth !== undefined && !isFiniteInteger(value.max_depth)) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUERY",
        message: "'max_depth' must be a finite integer when provided.",
      },
    };
  }
  if (isFiniteInteger(value.max_depth) && value.max_depth < 1) {
    return {
      ok: false,
      error: { code: "INVALID_QUERY", message: "'max_depth' must be >= 1." },
    };
  }

  const query = { operation, module: value.module };
  if (isFiniteInteger(value.max_depth)) query.max_depth = value.max_depth;
  return { ok: true, query };
}

function clampDepth(requested) {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_MAX_DEPTH;
  const intVal = Math.trunc(requested);
  if (intVal < 1) return 1;
  if (intVal > MAX_ALLOWED_DEPTH) return MAX_ALLOWED_DEPTH;
  return intVal;
}

// ---------------------------------------------------------------------------
// Graph traversal
// ---------------------------------------------------------------------------

function buildAdjacency(edges) {
  const incoming = new Map();
  const outgoing = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target).push(edge);
  }
  return { incoming, outgoing };
}

function bfs({ start, maxDepth, neighbors, step }) {
  const visited = new Set([start]);
  if (maxDepth < 1) return { visited };

  let frontier = [start];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [];
    for (const current of frontier) {
      const edges = neighbors(current);
      if (!edges) continue;
      for (const edge of edges) {
        const other = step(edge, current);
        if (visited.has(other)) continue;
        visited.add(other);
        next.push(other);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return { visited };
}

function toMatchedNode(id, node) {
  return Object.assign({ id }, node);
}

function edgesTouching(edges, ids) {
  return edges.filter((e) => ids.has(e.source) || ids.has(e.target));
}

function edgesWithin(edges, ids) {
  return edges.filter((e) => ids.has(e.source) && ids.has(e.target));
}

function buildTraversalSummary(label, nodeCount, edgeCount, capped) {
  const base = `Found ${nodeCount} node${nodeCount === 1 ? "" : "s"} for ${label}, ${edgeCount} edge${edgeCount === 1 ? "" : "s"} total`;
  return capped ? `${base} (max_depth clamped to ${MAX_ALLOWED_DEPTH})` : base;
}

function runTraversal(graph, module, requestedDepth, direction, label, operation, adjacency) {
  if (!graph.nodes[module]) {
    return {
      code: "MODULE_NOT_IN_GRAPH",
      message: `Module '${module}' is not in the graph.`,
      hint: "Module not in key set or is external.",
    };
  }
  const depth = clampDepth(requestedDepth);
  const adj = adjacency || buildAdjacency(graph.edges);

  const { visited } = bfs({
    start: module,
    maxDepth: depth,
    neighbors: (id) => (direction === "outgoing" ? adj.outgoing.get(id) : adj.incoming.get(id)),
    step: (edge, current) => (direction === "outgoing" ? edge.target : edge.source),
  });

  const matchedNodes = [];
  const matchedIds = new Set();
  for (const id of visited) {
    if (id !== module && graph.nodes[id]) {
      matchedIds.add(id);
      matchedNodes.push(toMatchedNode(id, graph.nodes[id]));
    }
  }

  const matchedEdges = edgesWithin(graph.edges, visited);
  const capped = requestedDepth !== undefined && requestedDepth > MAX_ALLOWED_DEPTH;

  return {
    query: { operation, module, max_depth: depth },
    matched_nodes: matchedNodes,
    matched_edges: matchedEdges,
    summary: buildTraversalSummary(label, matchedNodes.length, matchedEdges.length, capped),
  };
}

function executeDependenciesOf(graph, module, requestedDepth, adjacency) {
  return runTraversal(
    graph, module, requestedDepth, "outgoing",
    `dependencies of ${module}`, "dependencies_of", adjacency,
  );
}

function executeDependentsOf(graph, module, requestedDepth, adjacency) {
  return runTraversal(
    graph, module, requestedDepth, "incoming",
    `dependents of ${module}`, "dependents_of", adjacency,
  );
}

function executeTransitiveDependents(graph, module, requestedDepth, adjacency) {
  return runTraversal(
    graph, module, requestedDepth, "incoming",
    `transitive dependents of ${module}`, "transitive_dependents", adjacency,
  );
}

function nodeMatchesConditions(node, conditions) {
  for (const [key, expected] of Object.entries(conditions)) {
    if (expected === undefined) continue;
    if (!FILTERABLE_FIELDS.has(key)) continue;
    if (node[key] !== expected) return false;
  }
  return true;
}

function executeFilter(graph, conditions) {
  const matchedIds = new Set();
  const matchedNodes = [];
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (nodeMatchesConditions(node, conditions)) {
      matchedIds.add(id);
      matchedNodes.push(toMatchedNode(id, node));
    }
  }
  const matchedEdges = edgesTouching(graph.edges, matchedIds);
  const noConditions = Object.keys(conditions).length === 0;
  const summary = noConditions
    ? `No conditions specified — returning all ${matchedNodes.length} nodes, ${matchedEdges.length} edges total`
    : `Found ${matchedNodes.length} node${matchedNodes.length === 1 ? "" : "s"} matching filter, ${matchedEdges.length} edge${matchedEdges.length === 1 ? "" : "s"} total`;

  return {
    query: { operation: "filter", conditions },
    matched_nodes: matchedNodes,
    matched_edges: matchedEdges,
    summary,
  };
}

function isQueryError(value) {
  return (
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    !("matched_nodes" in value)
  );
}

function executeQuery(graph, query) {
  if (!graph || !isObject(graph.nodes) || !Array.isArray(graph.edges)) {
    return {
      success: false,
      code: "GRAPH_NOT_FOUND",
      message: "graph-schema.json is not available.",
      hint: "Run /code-atlas:map to generate .code-atlas/graph-schema.json first.",
    };
  }

  const adjacency = buildAdjacency(graph.edges);
  let result;
  switch (query.operation) {
    case "dependencies_of":
      result = executeDependenciesOf(graph, query.module, query.max_depth, adjacency);
      break;
    case "dependents_of":
      result = executeDependentsOf(graph, query.module, query.max_depth, adjacency);
      break;
    case "filter":
      result = executeFilter(graph, query.conditions);
      break;
    case "transitive_dependents":
      result = executeTransitiveDependents(graph, query.module, query.max_depth, adjacency);
      break;
    default:
      return { success: false, code: "UNKNOWN_OPERATION", message: "Unhandled query operation." };
  }

  if (isQueryError(result)) return Object.assign({ success: false }, result);
  return Object.assign({ success: true }, result);
}

function runQueryFromJson(graph, jsonInput) {
  const parsed = parseQuery(jsonInput);
  if (!parsed.ok) return Object.assign({ success: false }, parsed.error);
  const validated = validateQuery(parsed.value);
  if (!validated.ok) return Object.assign({ success: false }, validated.error);
  return executeQuery(graph, validated.query);
}

// ---------------------------------------------------------------------------
// Graph schema validation
// ---------------------------------------------------------------------------

function validateGraphSchema(doc) {
  const errors = [];

  if (!isObject(doc)) {
    return { valid: false, errors: ["Document must be a JSON object."] };
  }

  const header = doc._header;
  if (!isObject(header)) {
    errors.push("Missing or invalid '_header' object.");
  } else {
    if (header.schema_version !== SUPPORTED_SCHEMA_VERSION) {
      errors.push(`_header.schema_version must be ${SUPPORTED_SCHEMA_VERSION}, got ${JSON.stringify(header.schema_version)}.`);
    }
    for (const field of ["plugin_version", "generated_at", "scan_root"]) {
      if (typeof header[field] !== "string" || header[field].length === 0) {
        errors.push(`_header.${field} must be a non-empty string.`);
      }
    }
    if (typeof header.baseline_commit !== "string") {
      errors.push("_header.baseline_commit must be a string (may be empty).");
    }
  }

  if (!isObject(doc.nodes)) {
    errors.push("Missing or invalid 'nodes' object.");
  } else {
    for (const [id, node] of Object.entries(doc.nodes)) {
      if (!isObject(node)) {
        errors.push(`Node '${id}' must be an object.`);
        continue;
      }
      if (!NODE_TYPES.has(node.type)) errors.push(`Node '${id}': invalid type '${node.type}'.`);
      if (!NODE_ROLES.has(node.role)) errors.push(`Node '${id}': invalid role '${node.role}'.`);
      if (!NODE_CRITICALITIES.has(node.criticality)) errors.push(`Node '${id}': invalid criticality '${node.criticality}'.`);
      if (!NODE_STABILITIES.has(node.stability)) errors.push(`Node '${id}': invalid stability '${node.stability}'.`);
      if (!NODE_TEST_COVERAGES.has(node.test_coverage)) errors.push(`Node '${id}': invalid test_coverage '${node.test_coverage}'.`);
      if (typeof node.description !== "string") errors.push(`Node '${id}': description must be a string.`);
      if (node.type === "module") {
        if (!Array.isArray(node.files) || node.files.some((f) => typeof f !== "string")) {
          errors.push(`Node '${id}': module nodes require a 'files' string array.`);
        }
      } else if (node.files !== undefined) {
        errors.push(`Node '${id}': file nodes must not have a 'files' array.`);
      }
    }
  }

  if (!Array.isArray(doc.edges)) {
    errors.push("Missing or invalid 'edges' array.");
  } else if (isObject(doc.nodes)) {
    doc.edges.forEach((edge, i) => {
      if (!isObject(edge)) {
        errors.push(`Edge[${i}] must be an object.`);
        return;
      }
      if (!isNonEmptyString(edge.source)) errors.push(`Edge[${i}]: 'source' must be a non-empty string.`);
      if (!isNonEmptyString(edge.target)) errors.push(`Edge[${i}]: 'target' must be a non-empty string.`);
      if (isNonEmptyString(edge.source) && !doc.nodes[edge.source]) {
        errors.push(`Edge[${i}]: source '${edge.source}' is not a key in nodes.`);
      }
      if (isNonEmptyString(edge.target) && !doc.nodes[edge.target]) {
        errors.push(`Edge[${i}]: target '${edge.target}' is not a key in nodes.`);
      }
      if (!EDGE_TYPES.has(edge.type)) errors.push(`Edge[${i}]: invalid type '${edge.type}'.`);
      if (!EDGE_STRENGTHS.has(edge.strength)) errors.push(`Edge[${i}]: invalid strength '${edge.strength}'.`);
      if (!EDGE_DIRECTIONALITIES.has(edge.directionality)) errors.push(`Edge[${i}]: invalid directionality '${edge.directionality}'.`);
      if (!EDGE_IMPACTS.has(edge.impact)) errors.push(`Edge[${i}]: invalid impact '${edge.impact}'.`);
    });
  }

  if (!isObject(doc.metadata)) {
    errors.push("Missing or invalid 'metadata' object.");
  } else {
    for (const field of ["total_nodes", "total_edges", "key_modules_analyzed", "circular_dependency_count"]) {
      if (!isFiniteInteger(doc.metadata[field]) || doc.metadata[field] < 0) {
        errors.push(`metadata.${field} must be a non-negative integer.`);
      }
    }
    if (isObject(doc.nodes) && isFiniteInteger(doc.metadata.total_nodes)) {
      const actual = Object.keys(doc.nodes).length;
      if (doc.metadata.total_nodes !== actual) {
        errors.push(`metadata.total_nodes (${doc.metadata.total_nodes}) does not match actual node count (${actual}).`);
      }
    }
    if (Array.isArray(doc.edges) && isFiniteInteger(doc.metadata.total_edges)) {
      if (doc.metadata.total_edges !== doc.edges.length) {
        errors.push(`metadata.total_edges (${doc.metadata.total_edges}) does not match actual edge count (${doc.edges.length}).`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Plain-text report
// ---------------------------------------------------------------------------

function formatTextReport(response, graph) {
  if (!response.success) {
    let text = `Query failed [${response.code}]: ${response.message}`;
    if (response.hint) text += `\nHint: ${response.hint}`;
    return text;
  }

  const q = response.query;
  const subject = q.operation === "filter" ? JSON.stringify(q.conditions) : q.module;
  const lines = [];
  lines.push(`Query: ${q.operation} ${subject}`);
  lines.push(`Graph: ${Object.keys(graph.nodes).length} nodes, ${graph.edges.length} edges available`);
  lines.push("");
  lines.push(`Results: ${response.matched_nodes.length} nodes matched, ${response.matched_edges.length} edges`);

  if (response.matched_nodes.length === 0) {
    lines.push("");
    lines.push("No results found.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("Matched modules:");
  for (const n of response.matched_nodes) {
    lines.push(`  - ${n.id}  [${n.role}] [${n.criticality}] [${n.stability}] — ${n.description}`);
  }

  if (response.matched_edges.length > 0) {
    lines.push("");
    lines.push("Key edges:");
    for (const e of response.matched_edges) {
      const impact = e.impact ? ` ${e.impact}` : "";
      lines.push(`  - ${e.source} -> ${e.target}  [${e.type}] [${e.strength}]${impact}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);
  let graphPath = path.join(process.cwd(), ".code-atlas", "graph-schema.json");
  let queryInput = null;
  let queryFile = null;
  let validateOnly = false;
  let jsonOnly = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--graph") graphPath = args[++i];
    else if (a === "--query-file") queryFile = args[++i];
    else if (a === "--validate") validateOnly = true;
    else if (a === "--json-only") jsonOnly = true;
    else queryInput = a;
  }

  if (!fs.existsSync(graphPath)) {
    process.stdout.write(JSON.stringify({
      success: false,
      code: "GRAPH_NOT_FOUND",
      message: `Graph file not found: ${graphPath}`,
      hint: "Run /code-atlas:map to generate .code-atlas/graph-schema.json first.",
    }, null, 2) + "\n");
    return 2;
  }

  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  } catch (e) {
    process.stdout.write(JSON.stringify({
      success: false,
      code: "GRAPH_NOT_FOUND",
      message: `Graph file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      hint: "Run /code-atlas:map to regenerate the graph.",
    }, null, 2) + "\n");
    return 2;
  }

  if (validateOnly) {
    const result = validateGraphSchema(graph);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return result.valid ? 0 : 1;
  }

  if (queryFile) {
    try {
      queryInput = fs.readFileSync(queryFile, "utf8");
    } catch (e) {
      process.stdout.write(JSON.stringify({
        success: false,
        code: "INVALID_QUERY",
        message: `Cannot read query file: ${e instanceof Error ? e.message : String(e)}`,
      }, null, 2) + "\n");
      return 2;
    }
  }

  if (queryInput === null) {
    process.stdout.write(JSON.stringify({
      success: false,
      code: "INVALID_QUERY",
      message: "No query provided.",
      hint: "Pass a JSON query as an argument, or use --query-file <path>, or --validate.",
    }, null, 2) + "\n");
    return 1;
  }

  const header = graph && graph._header;
  if (!isObject(header) || header.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    process.stdout.write(JSON.stringify({
      success: false,
      code: "SCHEMA_VERSION_MISMATCH",
      message: `graph-schema.json schema version ${isObject(header) ? JSON.stringify(header.schema_version) : "unknown"} is not supported. Expected ${SUPPORTED_SCHEMA_VERSION}.`,
      hint: "Run /code-atlas:map to regenerate with the current schema.",
    }, null, 2) + "\n");
    return 1;
  }

  const response = runQueryFromJson(graph, queryInput);
  process.stdout.write(JSON.stringify(response, null, 2) + "\n");
  if (!jsonOnly) {
    process.stdout.write("\n" + formatTextReport(response, graph) + "\n");
  }
  return response.success ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  DEFAULT_MAX_DEPTH,
  MAX_ALLOWED_DEPTH,
  SUPPORTED_SCHEMA_VERSION,
  parseQuery,
  validateQuery,
  clampDepth,
  buildAdjacency,
  executeDependenciesOf,
  executeDependentsOf,
  executeFilter,
  executeTransitiveDependents,
  executeQuery,
  runQueryFromJson,
  validateGraphSchema,
  formatTextReport,
  main,
};
