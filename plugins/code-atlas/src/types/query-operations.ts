/**
 * Type definitions for the /code-atlas:query JSON query language (v2.0).
 *
 * Claude generates a QueryOperation object to ask questions about the
 * semantic dependency graph stored in graph-schema.json. The query executor
 * parses and routes each operation to the appropriate handler and returns a
 * QueryResult.
 *
 * Supported operations:
 *   - dependencies_of       : modules/files that a given node imports
 *   - dependents_of         : modules/files that import a given node
 *   - filter                : nodes matching a set of property conditions
 *   - transitive_dependents : nodes reachable by following inbound edges up
 *                             to max_depth hops
 */

import type {
  GraphEdge,
  GraphNode,
  NodeCriticality,
  NodeRole,
  NodeStability,
  NodeTestCoverage,
} from "./graph-schema";

// ---------------------------------------------------------------------------
// Operation discriminants
// ---------------------------------------------------------------------------

export type OperationName =
  | "dependencies_of"
  | "dependents_of"
  | "filter"
  | "transitive_dependents";

// ---------------------------------------------------------------------------
// Individual query types
// ---------------------------------------------------------------------------

/**
 * Return all nodes that `module` directly or transitively imports.
 *
 * Traversal follows edges in the outgoing direction (source → target),
 * stopping when max_depth hops are exhausted.
 *
 * @example
 * ```json
 * { "operation": "dependencies_of", "module": "src/auth" }
 * ```
 */
export interface DependenciesOfQuery {
  operation: "dependencies_of";
  /** Path of the node whose dependencies are requested */
  module: string;
  /**
   * Maximum BFS traversal depth.
   * Defaults to 2 when omitted; capped at 5.
   */
  max_depth?: number;
}

/**
 * Return all nodes that directly or transitively import `module`.
 *
 * Traversal follows edges in the incoming direction (target ← source),
 * stopping when max_depth hops are exhausted.
 *
 * @example
 * ```json
 * { "operation": "dependents_of", "module": "src/utils/logger" }
 * ```
 */
export interface DependentsOfQuery {
  operation: "dependents_of";
  /** Path of the node whose dependents are requested */
  module: string;
  /**
   * Maximum BFS traversal depth.
   * Defaults to 2 when omitted; capped at 5.
   */
  max_depth?: number;
}

/**
 * Filter conditions for the `filter` operation.
 * All specified conditions are combined with AND logic.
 * Omit a field to leave it unconstrained.
 */
export interface FilterConditions {
  role?: NodeRole;
  criticality?: NodeCriticality;
  stability?: NodeStability;
  test_coverage?: NodeTestCoverage;
}

/**
 * Return all nodes whose attributes match every condition provided.
 *
 * Matching is strict: each specified field must equal the node's attribute
 * value. Unspecified fields are not checked.
 *
 * @example
 * ```json
 * {
 *   "operation": "filter",
 *   "conditions": { "criticality": "critical", "role": "core_module" }
 * }
 * ```
 */
export interface FilterQuery {
  operation: "filter";
  /** One or more attribute conditions that matched nodes must satisfy */
  conditions: FilterConditions;
}

/**
 * Return all nodes reachable from `module` by following inbound edges
 * (i.e. nodes that transitively depend on `module`), up to `max_depth` hops.
 *
 * This is a bounded reverse-reachability query. Visited nodes are tracked to
 * handle circular dependencies safely.
 *
 * @example
 * ```json
 * {
 *   "operation": "transitive_dependents",
 *   "module": "src/models",
 *   "max_depth": 3
 * }
 * ```
 */
export interface TransitiveDependentsQuery {
  operation: "transitive_dependents";
  /** Path of the node from which reverse traversal begins */
  module: string;
  /**
   * Maximum number of hops to follow.
   * Defaults to 2 when omitted; capped at 5.
   */
  max_depth?: number;
}

// ---------------------------------------------------------------------------
// Union discriminant
// ---------------------------------------------------------------------------

/**
 * Any valid query operation. Use the `operation` discriminant to narrow to
 * the specific query type.
 */
export type QueryOperation =
  | DependenciesOfQuery
  | DependentsOfQuery
  | FilterQuery
  | TransitiveDependentsQuery;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * A matched node returned within a QueryResult, extending GraphNode with
 * the node's path identifier so callers don't need to re-key the record.
 */
export interface MatchedNode extends GraphNode {
  /** The node's key/path as it appears in graph-schema.json `nodes` record */
  id: string;
}

/**
 * Successful result returned by the query executor.
 */
export interface QueryResult {
  /** The original query that produced this result */
  query: QueryOperation;
  /** Nodes matching the query */
  matched_nodes: MatchedNode[];
  /** Edges whose source or target is among the matched nodes */
  matched_edges: GraphEdge[];
  /** Human-readable one-line summary, e.g. "Found 3 nodes, 5 edges" */
  summary: string;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Failure codes returned by the query executor.
 *
 * - GRAPH_NOT_FOUND     : graph-schema.json is absent; suggest /code-atlas:map
 * - INVALID_QUERY       : JSON could not be parsed or required fields are missing
 * - MODULE_NOT_IN_GRAPH : referenced module does not exist as a node in the graph
 * - UNKNOWN_OPERATION   : `operation` field is not one of the supported names
 */
export type QueryErrorCode =
  | "GRAPH_NOT_FOUND"
  | "INVALID_QUERY"
  | "MODULE_NOT_IN_GRAPH"
  | "UNKNOWN_OPERATION";

export interface QueryError {
  code: QueryErrorCode;
  message: string;
  /** Optional hint for the caller on how to resolve the error */
  hint?: string;
}

// ---------------------------------------------------------------------------
// Combined executor return
// ---------------------------------------------------------------------------

/**
 * Discriminated union returned by `executeQuery`.
 * Check `success` to determine whether the result is a `QueryResult` or
 * `QueryError`.
 */
export type QueryResponse =
  | ({ success: true } & QueryResult)
  | ({ success: false } & QueryError);
