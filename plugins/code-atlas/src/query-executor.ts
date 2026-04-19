/**
 * Query executor for the Code Atlas graph-schema.json query language (v2.0).
 *
 * Parses JSON query strings into QueryOperation objects, validates them, and
 * routes to operation-specific handlers that traverse or filter a GraphSchema.
 *
 * Supported operations:
 *   - dependencies_of       : BFS following outgoing edges from a module
 *   - dependents_of         : BFS following incoming edges toward a module
 *   - filter                : attribute-match query (AND semantics)
 *   - transitive_dependents : bounded reverse-reachability from a module
 *
 * All traversal handlers track visited nodes so circular dependencies never
 * cause infinite loops.
 */

import type {
  FilterConditions,
  FilterQuery,
  GraphEdge,
  GraphNode,
  GraphSchema,
  MatchedNode,
  QueryError,
  QueryErrorCode,
  QueryOperation,
  QueryResponse,
  QueryResult,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default BFS depth used when a traversal query omits `max_depth`. */
export const DEFAULT_MAX_DEPTH = 2;

/** Hard upper bound on BFS depth to prevent runaway traversals. */
export const MAX_ALLOWED_DEPTH = 5;

/** Supported operation names as a Set for O(1) validation. */
const KNOWN_OPERATIONS: ReadonlySet<string> = new Set<QueryOperation["operation"]>([
  "dependencies_of",
  "dependents_of",
  "filter",
  "transitive_dependents",
]);

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Build a structured error response with the `success: false` discriminant
 * so callers can narrow against {@link QueryResponse}.
 */
function makeError(
  code: QueryErrorCode,
  message: string,
  hint?: string,
): { success: false } & QueryError {
  const err: QueryError = hint ? { code, message, hint } : { code, message };
  return { success: false, ...err };
}

// ---------------------------------------------------------------------------
// parseQuery
// ---------------------------------------------------------------------------

export interface ParseSuccess {
  ok: true;
  value: unknown;
}

export interface ParseFailure {
  ok: false;
  error: QueryError;
}

export type ParseResult = ParseSuccess | ParseFailure;

/**
 * Parse a JSON-encoded query string. Returns the raw parsed value (which
 * must still be validated via {@link validateQuery}) or a structured error if
 * the string is not valid JSON.
 */
export function parseQuery(input: string): ParseResult {
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
    const parsed: unknown = JSON.parse(trimmed);
    return { ok: true, value: parsed };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: {
        code: "INVALID_QUERY",
        message: `Query is not valid JSON: ${detail}`,
        hint: "Ensure the query is a well-formed JSON object.",
      },
    };
  }
}

// ---------------------------------------------------------------------------
// validateQuery
// ---------------------------------------------------------------------------

export interface ValidateSuccess {
  ok: true;
  query: QueryOperation;
}

export interface ValidateFailure {
  ok: false;
  error: QueryError;
}

export type ValidateResult = ValidateSuccess | ValidateFailure;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Validate a parsed value as a well-formed {@link QueryOperation}.
 *
 * Returns an `ok: true` result carrying a strongly typed query, or an error
 * with `INVALID_QUERY` / `UNKNOWN_OPERATION` describing the problem.
 */
export function validateQuery(value: unknown): ValidateResult {
  if (!isObject(value)) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUERY",
        message: "Query must be a JSON object.",
      },
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

  switch (operation) {
    case "dependencies_of":
    case "dependents_of":
    case "transitive_dependents": {
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
          error: {
            code: "INVALID_QUERY",
            message: "'max_depth' must be >= 1.",
          },
        };
      }
      return {
        ok: true,
        query: {
          operation,
          module: value.module,
          ...(isFiniteInteger(value.max_depth) ? { max_depth: value.max_depth } : {}),
        } as QueryOperation,
      };
    }

    case "filter": {
      if (!isObject(value.conditions)) {
        return {
          ok: false,
          error: {
            code: "INVALID_QUERY",
            message: "Operation 'filter' requires a 'conditions' object.",
          },
        };
      }
      return {
        ok: true,
        query: {
          operation: "filter",
          conditions: value.conditions as FilterConditions,
        } satisfies FilterQuery,
      };
    }
  }

  // Exhaustiveness guard — unreachable given KNOWN_OPERATIONS check above.
  return {
    ok: false,
    error: {
      code: "UNKNOWN_OPERATION",
      message: `Unhandled operation '${operation}'.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Depth clamping
// ---------------------------------------------------------------------------

/**
 * Clamp the `max_depth` value to the range `[1, MAX_ALLOWED_DEPTH]`.
 * Returns {@link DEFAULT_MAX_DEPTH} when the input is undefined.
 */
export function clampDepth(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_MAX_DEPTH;
  if (!Number.isFinite(requested)) return DEFAULT_MAX_DEPTH;
  const intVal = Math.trunc(requested);
  if (intVal < 1) return 1;
  if (intVal > MAX_ALLOWED_DEPTH) return MAX_ALLOWED_DEPTH;
  return intVal;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function toMatchedNode(id: string, node: GraphNode): MatchedNode {
  return { id, ...node };
}

/**
 * Collect every edge whose source or target is contained in `ids`.
 * Used by `filter` to return edges touching matched nodes.
 */
function edgesTouching(edges: readonly GraphEdge[], ids: ReadonlySet<string>): GraphEdge[] {
  return edges.filter((e) => ids.has(e.source) || ids.has(e.target));
}

/**
 * Collect every edge whose both source and target are contained in `ids`.
 * Used by traversals so the returned subgraph contains only edges whose
 * endpoints were both visited.
 */
function edgesWithin(edges: readonly GraphEdge[], ids: ReadonlySet<string>): GraphEdge[] {
  return edges.filter((e) => ids.has(e.source) && ids.has(e.target));
}

// ---------------------------------------------------------------------------
// Adjacency maps
// ---------------------------------------------------------------------------

interface AdjacencyMaps {
  /** target -> list of edges pointing AT target (incoming) */
  incoming: Map<string, GraphEdge[]>;
  /** source -> list of edges leaving source (outgoing) */
  outgoing: Map<string, GraphEdge[]>;
}

function buildAdjacency(edges: readonly GraphEdge[]): AdjacencyMaps {
  const incoming = new Map<string, GraphEdge[]>();
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    let out = outgoing.get(edge.source);
    if (!out) {
      out = [];
      outgoing.set(edge.source, out);
    }
    out.push(edge);

    let inc = incoming.get(edge.target);
    if (!inc) {
      inc = [];
      incoming.set(edge.target, inc);
    }
    inc.push(edge);
  }
  return { incoming, outgoing };
}

// ---------------------------------------------------------------------------
// BFS core
// ---------------------------------------------------------------------------

interface BfsOptions {
  start: string;
  maxDepth: number;
  /** Return the neighbor-edges from a given node. */
  neighbors: (nodeId: string) => GraphEdge[] | undefined;
  /** Given an edge and the current node, return the "other" endpoint. */
  step: (edge: GraphEdge, current: string) => string;
}

interface BfsResult {
  visited: Set<string>;
}

/**
 * Bounded BFS that tracks visited nodes to safely handle cycles.
 * The starting node is treated as depth 0 and is always visited but not
 * included in the traversal's returned "reached" set in callers; callers
 * decide whether to include the start node in results.
 */
function bfs(options: BfsOptions): BfsResult {
  const { start, maxDepth, neighbors, step } = options;
  const visited = new Set<string>([start]);
  if (maxDepth < 1) return { visited };

  let frontier: string[] = [start];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: string[] = [];
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

// ---------------------------------------------------------------------------
// Operation handlers
// ---------------------------------------------------------------------------

/**
 * BFS following outgoing edges: return all nodes reachable from `module`
 * along import direction (source -> target), up to `max_depth` hops.
 *
 * The starting module is NOT included in `matched_nodes` — callers asking
 * "what does X depend on" do not expect X itself back.
 */
export function executeDependenciesOf(
  graph: GraphSchema,
  module: string,
  requestedDepth: number | undefined,
  adjacency?: AdjacencyMaps,
): QueryResult | QueryError {
  if (!graph.nodes[module]) {
    return {
      code: "MODULE_NOT_IN_GRAPH",
      message: `Module '${module}' is not in the graph.`,
      hint: "Module not in key set or is external.",
    };
  }
  const depth = clampDepth(requestedDepth);
  const adj = adjacency ?? buildAdjacency(graph.edges);

  const { visited } = bfs({
    start: module,
    maxDepth: depth,
    neighbors: (id) => adj.outgoing.get(id),
    step: (edge) => edge.target,
  });

  // Exclude the starting module from matched_nodes.
  const matchedIds = new Set<string>();
  for (const id of visited) {
    if (id !== module && graph.nodes[id]) matchedIds.add(id);
  }

  const matchedNodes: MatchedNode[] = [];
  for (const id of matchedIds) {
    matchedNodes.push(toMatchedNode(id, graph.nodes[id]));
  }

  // Include edges whose source AND target are within the traversal set
  // (including the start node, so the immediate outbound edges are shown).
  const allVisited = new Set<string>(visited);
  const matchedEdges = edgesWithin(graph.edges, allVisited);

  const capped = requestedDepth !== undefined && requestedDepth > MAX_ALLOWED_DEPTH;
  const summary = buildTraversalSummary(
    `dependencies of ${module}`,
    matchedNodes.length,
    matchedEdges.length,
    capped,
  );

  return {
    query: buildEchoQuery("dependencies_of", module, depth),
    matched_nodes: matchedNodes,
    matched_edges: matchedEdges,
    summary,
  };
}

/**
 * BFS following incoming edges: return all nodes that reach `module`
 * along import direction (target <- source), up to `max_depth` hops.
 */
export function executeDependentsOf(
  graph: GraphSchema,
  module: string,
  requestedDepth: number | undefined,
  adjacency?: AdjacencyMaps,
): QueryResult | QueryError {
  if (!graph.nodes[module]) {
    return {
      code: "MODULE_NOT_IN_GRAPH",
      message: `Module '${module}' is not in the graph.`,
      hint: "Module not in key set or is external.",
    };
  }
  const depth = clampDepth(requestedDepth);
  const adj = adjacency ?? buildAdjacency(graph.edges);

  const { visited } = bfs({
    start: module,
    maxDepth: depth,
    neighbors: (id) => adj.incoming.get(id),
    step: (edge) => edge.source,
  });

  const matchedIds = new Set<string>();
  for (const id of visited) {
    if (id !== module && graph.nodes[id]) matchedIds.add(id);
  }

  const matchedNodes: MatchedNode[] = [];
  for (const id of matchedIds) {
    matchedNodes.push(toMatchedNode(id, graph.nodes[id]));
  }

  const allVisited = new Set<string>(visited);
  const matchedEdges = edgesWithin(graph.edges, allVisited);

  const capped = requestedDepth !== undefined && requestedDepth > MAX_ALLOWED_DEPTH;
  const summary = buildTraversalSummary(
    `dependents of ${module}`,
    matchedNodes.length,
    matchedEdges.length,
    capped,
  );

  return {
    query: buildEchoQuery("dependents_of", module, depth),
    matched_nodes: matchedNodes,
    matched_edges: matchedEdges,
    summary,
  };
}

/**
 * Return every node whose properties match every condition in `conditions`.
 * Empty conditions => all nodes. Unknown condition keys are ignored — this
 * keeps the executor forward-compatible with future attributes.
 */
export function executeFilter(
  graph: GraphSchema,
  conditions: FilterConditions,
): QueryResult {
  const matchedIds = new Set<string>();
  const matchedNodes: MatchedNode[] = [];

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (nodeMatchesConditions(node, conditions)) {
      matchedIds.add(id);
      matchedNodes.push(toMatchedNode(id, node));
    }
  }

  const matchedEdges = edgesTouching(graph.edges, matchedIds);

  const summary = `Found ${matchedNodes.length} node${matchedNodes.length === 1 ? "" : "s"} matching filter, ${matchedEdges.length} edge${matchedEdges.length === 1 ? "" : "s"} total`;

  return {
    query: { operation: "filter", conditions } satisfies FilterQuery,
    matched_nodes: matchedNodes,
    matched_edges: matchedEdges,
    summary,
  };
}

/**
 * Semantically identical to `dependents_of` but is the canonical operation
 * name for impact-analysis scenarios. Duplicated as a distinct handler so
 * the operation surface stays flexible if future versions diverge.
 */
export function executeTransitiveDependents(
  graph: GraphSchema,
  module: string,
  requestedDepth: number | undefined,
  adjacency?: AdjacencyMaps,
): QueryResult | QueryError {
  if (!graph.nodes[module]) {
    return {
      code: "MODULE_NOT_IN_GRAPH",
      message: `Module '${module}' is not in the graph.`,
      hint: "Module not in key set or is external.",
    };
  }
  const depth = clampDepth(requestedDepth);
  const adj = adjacency ?? buildAdjacency(graph.edges);

  const { visited } = bfs({
    start: module,
    maxDepth: depth,
    neighbors: (id) => adj.incoming.get(id),
    step: (edge) => edge.source,
  });

  const matchedIds = new Set<string>();
  for (const id of visited) {
    if (id !== module && graph.nodes[id]) matchedIds.add(id);
  }

  const matchedNodes: MatchedNode[] = [];
  for (const id of matchedIds) {
    matchedNodes.push(toMatchedNode(id, graph.nodes[id]));
  }

  const allVisited = new Set<string>(visited);
  const matchedEdges = edgesWithin(graph.edges, allVisited);

  const capped = requestedDepth !== undefined && requestedDepth > MAX_ALLOWED_DEPTH;
  const summary = buildTraversalSummary(
    `transitive dependents of ${module}`,
    matchedNodes.length,
    matchedEdges.length,
    capped,
  );

  return {
    query: buildEchoQuery("transitive_dependents", module, depth),
    matched_nodes: matchedNodes,
    matched_edges: matchedEdges,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nodeMatchesConditions(node: GraphNode, conditions: FilterConditions): boolean {
  const entries = Object.entries(conditions) as Array<
    [keyof FilterConditions, FilterConditions[keyof FilterConditions]]
  >;
  for (const [key, expected] of entries) {
    if (expected === undefined) continue;
    // `type` is allowed per the reference doc but not in the FilterConditions
    // type; guard against arbitrary keys by looking it up directly.
    const actual = (node as unknown as Record<string, unknown>)[key];
    if (actual !== expected) return false;
  }
  // Special-case: type filter (documented in query-language-reference.md)
  const typeCondition = (conditions as Record<string, unknown>).type;
  if (typeCondition !== undefined && node.type !== typeCondition) {
    return false;
  }
  return true;
}

function buildEchoQuery(
  operation: "dependencies_of" | "dependents_of" | "transitive_dependents",
  module: string,
  depth: number,
): QueryOperation {
  return { operation, module, max_depth: depth } as QueryOperation;
}

function buildTraversalSummary(
  label: string,
  nodeCount: number,
  edgeCount: number,
  capped: boolean,
): string {
  const base = `Found ${nodeCount} node${nodeCount === 1 ? "" : "s"} for ${label}, ${edgeCount} edge${edgeCount === 1 ? "" : "s"} total`;
  return capped ? `${base} (max_depth clamped to ${MAX_ALLOWED_DEPTH})` : base;
}

// ---------------------------------------------------------------------------
// executeQuery (dispatcher)
// ---------------------------------------------------------------------------

/**
 * Validate the given graph and route a validated {@link QueryOperation} to
 * its handler. This is the primary high-level entry point used by the
 * `/code-atlas:query` skill.
 */
export function executeQuery(
  graph: GraphSchema | undefined | null,
  query: QueryOperation,
): QueryResponse {
  if (!graph || !graph.nodes || !graph.edges) {
    return makeError(
      "GRAPH_NOT_FOUND",
      "graph-schema.json is not available.",
      "Run /code-atlas:map to generate .code-atlas/graph-schema.json first.",
    );
  }

  const adjacency = buildAdjacency(graph.edges);

  switch (query.operation) {
    case "dependencies_of": {
      const r = executeDependenciesOf(graph, query.module, query.max_depth, adjacency);
      return isQueryError(r)
        ? makeError(r.code, r.message, r.hint)
        : { success: true, ...r };
    }
    case "dependents_of": {
      const r = executeDependentsOf(graph, query.module, query.max_depth, adjacency);
      return isQueryError(r)
        ? makeError(r.code, r.message, r.hint)
        : { success: true, ...r };
    }
    case "filter": {
      const r = executeFilter(graph, query.conditions);
      return { success: true, ...r };
    }
    case "transitive_dependents": {
      const r = executeTransitiveDependents(graph, query.module, query.max_depth, adjacency);
      return isQueryError(r)
        ? makeError(r.code, r.message, r.hint)
        : { success: true, ...r };
    }
    default: {
      // Exhaustiveness guard
      const _never: never = query;
      void _never;
      return makeError("UNKNOWN_OPERATION", "Unhandled query operation.");
    }
  }
}

function isQueryError(value: QueryResult | QueryError): value is QueryError {
  return typeof (value as QueryError).code === "string" &&
    typeof (value as QueryError).message === "string" &&
    !("matched_nodes" in value);
}

// ---------------------------------------------------------------------------
// Convenience one-shot entry point
// ---------------------------------------------------------------------------

/**
 * Parse a JSON query string, validate it, and execute it against `graph`.
 * Returns the full discriminated {@link QueryResponse}.
 */
export function runQueryFromJson(graph: GraphSchema, jsonInput: string): QueryResponse {
  const parsed = parseQuery(jsonInput);
  if (!parsed.ok) return makeError(parsed.error.code, parsed.error.message, parsed.error.hint);
  const validated = validateQuery(parsed.value);
  if (!validated.ok) {
    return makeError(validated.error.code, validated.error.message, validated.error.hint);
  }
  return executeQuery(graph, validated.query);
}
