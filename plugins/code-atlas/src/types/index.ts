/**
 * Public exports for Code Atlas v2.0 type definitions.
 *
 * graph-schema exports — structures for .code-atlas/graph-schema.json
 * query-operations exports — query language types for /code-atlas:query
 */

export type {
  // graph-schema.ts
  GraphSchema,
  GraphSchemaHeader,
  GraphNode,
  GraphNodes,
  GraphEdge,
  GraphMetadata,
  NodeType,
  NodeRole,
  NodeCriticality,
  NodeStability,
  NodeTestCoverage,
  EdgeType,
  EdgeStrength,
  EdgeDirectionality,
  EdgeImpact,
} from "./graph-schema";

export type {
  // query-operations.ts
  OperationName,
  QueryOperation,
  DependenciesOfQuery,
  DependentsOfQuery,
  FilterQuery,
  FilterConditions,
  TransitiveDependentsQuery,
  MatchedNode,
  QueryResult,
  QueryError,
  QueryErrorCode,
  QueryResponse,
} from "./query-operations";
