/**
 * Schema validator for graph-schema.json (Code Atlas v2.0).
 *
 * Validates the structure and content of a GraphSchema document, checking:
 * - Header fields and types
 * - Node required fields and allowed enum values
 * - Edge required fields and allowed enum values
 * - Metadata counts and types
 * - Cross-references: edge source/target keys must exist in nodes
 */

import type {
  GraphSchema,
  GraphSchemaHeader,
  GraphNode,
  GraphEdge,
  GraphMetadata,
} from "./types/graph-schema";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Allowed enum value sets (mirrors graph-schema.ts)
// ---------------------------------------------------------------------------

const NODE_TYPES = new Set(["module", "file"]);
const NODE_ROLES = new Set([
  "entry_point",
  "core_module",
  "utility",
  "config",
  "middleware",
  "model",
  "public_api",
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIso8601(value: string): boolean {
  // Minimal check: must parse as a valid Date
  const d = new Date(value);
  return !isNaN(d.getTime()) && value.trim() !== "";
}

// ---------------------------------------------------------------------------
// Section validators
// ---------------------------------------------------------------------------

function validateHeader(
  header: unknown,
  errors: string[]
): void {
  const prefix = "_header";

  if (!isObject(header)) {
    errors.push(`${prefix}: must be an object`);
    return;
  }

  // schema_version must be exactly 2
  if (header["schema_version"] === undefined) {
    errors.push(`${prefix}.schema_version: required field missing`);
  } else if (header["schema_version"] !== 2) {
    errors.push(
      `${prefix}.schema_version: expected 2, got ${JSON.stringify(header["schema_version"])}`
    );
  }

  // plugin_version: non-empty string
  if (header["plugin_version"] === undefined) {
    errors.push(`${prefix}.plugin_version: required field missing`);
  } else if (typeof header["plugin_version"] !== "string" || header["plugin_version"].trim() === "") {
    errors.push(`${prefix}.plugin_version: must be a non-empty string`);
  }

  // generated_at: ISO 8601 string
  if (header["generated_at"] === undefined) {
    errors.push(`${prefix}.generated_at: required field missing`);
  } else if (typeof header["generated_at"] !== "string") {
    errors.push(`${prefix}.generated_at: must be a string`);
  } else if (!isIso8601(header["generated_at"] as string)) {
    errors.push(`${prefix}.generated_at: must be a valid ISO 8601 timestamp`);
  }

  // baseline_commit: string (may be empty per spec)
  if (header["baseline_commit"] === undefined) {
    errors.push(`${prefix}.baseline_commit: required field missing`);
  } else if (typeof header["baseline_commit"] !== "string") {
    errors.push(`${prefix}.baseline_commit: must be a string`);
  }

  // scan_root: non-empty string
  if (header["scan_root"] === undefined) {
    errors.push(`${prefix}.scan_root: required field missing`);
  } else if (typeof header["scan_root"] !== "string" || header["scan_root"].trim() === "") {
    errors.push(`${prefix}.scan_root: must be a non-empty string`);
  }
}

function validateNode(
  key: string,
  node: unknown,
  errors: string[]
): void {
  const prefix = `nodes["${key}"]`;

  if (!isObject(node)) {
    errors.push(`${prefix}: must be an object`);
    return;
  }

  // type
  if (node["type"] === undefined) {
    errors.push(`${prefix}.type: required field missing`);
  } else if (!NODE_TYPES.has(node["type"] as string)) {
    errors.push(
      `${prefix}.type: invalid value "${node["type"]}", must be one of: ${[...NODE_TYPES].join(", ")}`
    );
  }

  // files — required when type === "module", must be non-empty string array
  if (node["type"] === "module") {
    if (node["files"] === undefined) {
      errors.push(`${prefix}.files: required when type is "module"`);
    } else if (!Array.isArray(node["files"])) {
      errors.push(`${prefix}.files: must be an array`);
    } else if ((node["files"] as unknown[]).length === 0) {
      errors.push(`${prefix}.files: must contain at least one entry`);
    } else {
      (node["files"] as unknown[]).forEach((f, i) => {
        if (typeof f !== "string" || (f as string).trim() === "") {
          errors.push(`${prefix}.files[${i}]: must be a non-empty string`);
        }
      });
    }
  }

  // role
  if (node["role"] === undefined) {
    errors.push(`${prefix}.role: required field missing`);
  } else if (!NODE_ROLES.has(node["role"] as string)) {
    errors.push(
      `${prefix}.role: invalid value "${node["role"]}", must be one of: ${[...NODE_ROLES].join(", ")}`
    );
  }

  // criticality
  if (node["criticality"] === undefined) {
    errors.push(`${prefix}.criticality: required field missing`);
  } else if (!NODE_CRITICALITIES.has(node["criticality"] as string)) {
    errors.push(
      `${prefix}.criticality: invalid value "${node["criticality"]}", must be one of: ${[...NODE_CRITICALITIES].join(", ")}`
    );
  }

  // stability
  if (node["stability"] === undefined) {
    errors.push(`${prefix}.stability: required field missing`);
  } else if (!NODE_STABILITIES.has(node["stability"] as string)) {
    errors.push(
      `${prefix}.stability: invalid value "${node["stability"]}", must be one of: ${[...NODE_STABILITIES].join(", ")}`
    );
  }

  // test_coverage
  if (node["test_coverage"] === undefined) {
    errors.push(`${prefix}.test_coverage: required field missing`);
  } else if (!NODE_TEST_COVERAGES.has(node["test_coverage"] as string)) {
    errors.push(
      `${prefix}.test_coverage: invalid value "${node["test_coverage"]}", must be one of: ${[...NODE_TEST_COVERAGES].join(", ")}`
    );
  }

  // description
  if (node["description"] === undefined) {
    errors.push(`${prefix}.description: required field missing`);
  } else if (typeof node["description"] !== "string") {
    errors.push(`${prefix}.description: must be a string`);
  }
}

function validateNodes(
  nodes: unknown,
  errors: string[]
): Set<string> {
  const nodeKeys = new Set<string>();

  if (!isObject(nodes)) {
    errors.push("nodes: must be an object");
    return nodeKeys;
  }

  for (const key of Object.keys(nodes)) {
    nodeKeys.add(key);
    validateNode(key, (nodes as Record<string, unknown>)[key], errors);
  }

  return nodeKeys;
}

function validateEdge(
  index: number,
  edge: unknown,
  nodeKeys: Set<string>,
  errors: string[]
): void {
  const prefix = `edges[${index}]`;

  if (!isObject(edge)) {
    errors.push(`${prefix}: must be an object`);
    return;
  }

  // source
  if (edge["source"] === undefined) {
    errors.push(`${prefix}.source: required field missing`);
  } else if (typeof edge["source"] !== "string" || (edge["source"] as string).trim() === "") {
    errors.push(`${prefix}.source: must be a non-empty string`);
  } else if (!nodeKeys.has(edge["source"] as string)) {
    errors.push(
      `${prefix}.source: "${edge["source"]}" does not reference a known node key`
    );
  }

  // target
  if (edge["target"] === undefined) {
    errors.push(`${prefix}.target: required field missing`);
  } else if (typeof edge["target"] !== "string" || (edge["target"] as string).trim() === "") {
    errors.push(`${prefix}.target: must be a non-empty string`);
  } else if (!nodeKeys.has(edge["target"] as string)) {
    errors.push(
      `${prefix}.target: "${edge["target"]}" does not reference a known node key`
    );
  }

  // type
  if (edge["type"] === undefined) {
    errors.push(`${prefix}.type: required field missing`);
  } else if (!EDGE_TYPES.has(edge["type"] as string)) {
    errors.push(
      `${prefix}.type: invalid value "${edge["type"]}", must be one of: ${[...EDGE_TYPES].join(", ")}`
    );
  }

  // strength
  if (edge["strength"] === undefined) {
    errors.push(`${prefix}.strength: required field missing`);
  } else if (!EDGE_STRENGTHS.has(edge["strength"] as string)) {
    errors.push(
      `${prefix}.strength: invalid value "${edge["strength"]}", must be one of: ${[...EDGE_STRENGTHS].join(", ")}`
    );
  }

  // directionality
  if (edge["directionality"] === undefined) {
    errors.push(`${prefix}.directionality: required field missing`);
  } else if (!EDGE_DIRECTIONALITIES.has(edge["directionality"] as string)) {
    errors.push(
      `${prefix}.directionality: invalid value "${edge["directionality"]}", must be one of: ${[...EDGE_DIRECTIONALITIES].join(", ")}`
    );
  }

  // impact
  if (edge["impact"] === undefined) {
    errors.push(`${prefix}.impact: required field missing`);
  } else if (!EDGE_IMPACTS.has(edge["impact"] as string)) {
    errors.push(
      `${prefix}.impact: invalid value "${edge["impact"]}", must be one of: ${[...EDGE_IMPACTS].join(", ")} (or empty string)`
    );
  }
}

function validateEdges(
  edges: unknown,
  nodeKeys: Set<string>,
  errors: string[]
): void {
  if (!Array.isArray(edges)) {
    errors.push("edges: must be an array");
    return;
  }

  (edges as unknown[]).forEach((edge, i) => {
    validateEdge(i, edge, nodeKeys, errors);
  });
}

function validateMetadata(
  metadata: unknown,
  errors: string[]
): void {
  const prefix = "metadata";

  if (!isObject(metadata)) {
    errors.push(`${prefix}: must be an object`);
    return;
  }

  const numericFields: Array<keyof GraphMetadata> = [
    "total_nodes",
    "total_edges",
    "key_modules_analyzed",
    "circular_dependency_count",
  ];

  for (const field of numericFields) {
    if (metadata[field] === undefined) {
      errors.push(`${prefix}.${field}: required field missing`);
    } else if (typeof metadata[field] !== "number" || !Number.isInteger(metadata[field] as number) || (metadata[field] as number) < 0) {
      errors.push(
        `${prefix}.${field}: must be a non-negative integer, got ${JSON.stringify(metadata[field])}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Validate a parsed graph-schema.json document.
 *
 * @param schema - Parsed JSON value (unknown to allow runtime validation of
 *                 untrusted input).
 * @returns `{ valid: true, errors: [] }` on success, or
 *          `{ valid: false, errors: string[] }` listing all violations.
 */
export function validateGraphSchema(schema: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(schema)) {
    return { valid: false, errors: ["root: must be a JSON object"] };
  }

  // Check top-level required keys
  const requiredTopLevelKeys = ["_header", "nodes", "edges", "metadata"] as const;
  for (const key of requiredTopLevelKeys) {
    if (schema[key] === undefined) {
      errors.push(`root: required top-level field "${key}" is missing`);
    }
  }

  // Only proceed with deep validation for sections that are present
  validateHeader(schema["_header"], errors);
  const nodeKeys = validateNodes(schema["nodes"], errors);
  validateEdges(schema["edges"], nodeKeys, errors);
  validateMetadata(schema["metadata"], errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}
