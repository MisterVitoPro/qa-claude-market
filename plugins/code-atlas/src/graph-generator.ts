/**
 * Graph generator for Code Atlas v2.0.
 *
 * Synthesizes graph-schema.json from state.json data and semantic metadata
 * produced by the graph-synthesizer agent. Produces a GraphSchema with
 * annotated nodes, annotated edges, and aggregate metadata counts.
 */

import type {
  GraphSchema,
  GraphSchemaHeader,
  GraphNode,
  GraphNodes,
  GraphEdge,
  GraphMetadata,
  NodeRole,
  NodeCriticality,
  NodeStability,
  NodeTestCoverage,
  EdgeType,
  EdgeStrength,
  EdgeDirectionality,
  EdgeImpact,
} from "./types/graph-schema";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * A single file entry from state.json's file_index.
 */
export interface FileIndexEntry {
  hash: string;
  size_bytes: number;
  lang: string;
  category: "source" | "test" | "config" | "documentation" | "scripts" | "build_output" | "assets" | "migration";
}

/**
 * state.json structure (only the fields graph-generator consumes).
 */
export interface StateJson {
  _header: {
    schema_version: number;
    plugin_version: string;
    generated_at: string;
    baseline_commit: string;
    scan_root: string;
  };
  file_index: Record<string, FileIndexEntry>;
  import_graph: Record<string, string[]>;
  importer_counts: Record<string, number>;
  circular_dependencies: Array<{
    chain: string[];
    severity: "critical" | "minor";
    description: string;
  }>;
}

/**
 * Semantic metadata for a single module/file, as returned by the
 * graph-synthesizer agent.
 */
export interface SemanticNodeMetadata {
  path: string;
  type: "module" | "file";
  files?: string[];
  role: NodeRole;
  criticality: NodeCriticality;
  stability: NodeStability;
  test_coverage: NodeTestCoverage;
  description: string;
}

/**
 * Configuration for graph generation.
 */
export interface GraphGeneratorConfig {
  /** Semver version string for the Code Atlas plugin, e.g. "2.0.0" */
  plugin_version: string;
  /**
   * ISO 8601 UTC timestamp for the _header.generated_at field.
   * Defaults to new Date().toISOString() when omitted.
   */
  generated_at?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determine the canonical node path (without extension) that a raw
 * import path maps to, given the set of known node keys.
 *
 * Handles:
 * - exact match (e.g. "src/utils/logger.ts")
 * - extension-stripped match (e.g. "src/utils/logger")
 * - directory prefix match (the import is within a module directory)
 */
function resolveToNodeKey(
  rawImport: string,
  nodeKeys: Set<string>
): string | null {
  // Exact match
  if (nodeKeys.has(rawImport)) return rawImport;

  // Strip .ts / .tsx / .js / .jsx extension
  const stripped = rawImport.replace(/\.(tsx?|jsx?)$/, "");
  if (nodeKeys.has(stripped)) return stripped;

  // Check if any node key is a directory prefix of the import
  for (const key of nodeKeys) {
    if (rawImport.startsWith(key + "/")) return key;
    if (stripped.startsWith(key + "/")) return key;
  }

  return null;
}

/**
 * Infer edge type from import path context. Uses simple heuristics since
 * we don't have the AST — the import_graph provides raw strings only.
 *
 * Detection priority:
 * 1. Config-role target → configuration
 * 2. Model-role target → composition (data usage)
 * 3. Otherwise direct_import
 *
 * Dynamic imports would require AST analysis; they can be injected via
 * the SemanticNodeMetadata when a synthesizer agent detects them.
 */
function inferEdgeType(
  _source: string,
  targetRole: NodeRole | undefined
): EdgeType {
  if (targetRole === "config") return "configuration";
  if (targetRole === "model") return "composition";
  return "direct_import";
}

/**
 * Infer edge strength from the roles of both endpoints and the
 * importer count of the target.
 *
 * - core: target is a config, model, or middleware (foundational dependency)
 * - utility: target is a utility node or low importer count
 * - optional: target is internal/experimental or has no importers
 */
function inferEdgeStrength(
  _sourceRole: NodeRole | undefined,
  targetRole: NodeRole | undefined,
  targetImporterCount: number
): EdgeStrength {
  if (
    targetRole === "config" ||
    targetRole === "model" ||
    targetRole === "middleware" ||
    targetRole === "entry_point"
  ) {
    return "core";
  }
  if (targetRole === "core_module" || targetImporterCount >= 5) return "core";
  if (targetRole === "utility" || targetImporterCount >= 2) return "utility";
  return "optional";
}

/**
 * Determine edge directionality by checking whether a mutual dependency
 * (circular pair) exists in the circular_dependencies list.
 */
function inferEdgeDirectionality(
  source: string,
  target: string,
  circularPairs: Set<string>,
  targetRole: NodeRole | undefined
): EdgeDirectionality {
  const key = `${source}|${target}`;
  const reverseKey = `${target}|${source}`;
  if (circularPairs.has(key) || circularPairs.has(reverseKey)) return "circular";
  if (targetRole === "internal") return "conditional";
  return "required";
}

/**
 * Infer edge impact annotation.
 *
 * - breaking_change_risk: source depends on a critical target whose API
 *   shift would likely break the source
 * - ripple_effect_magnitude: target is a high-traffic hub (many importers)
 *   so a source change ripples widely
 * - "": no special annotation
 */
function inferEdgeImpact(
  _sourceRole: NodeRole | undefined,
  targetRole: NodeRole | undefined,
  targetCriticality: NodeCriticality | undefined,
  targetImporterCount: number
): EdgeImpact {
  if (
    targetCriticality === "critical" &&
    (targetRole === "config" ||
      targetRole === "middleware" ||
      targetRole === "public_api")
  ) {
    return "breaking_change_risk";
  }
  if (targetImporterCount >= 5) return "ripple_effect_magnitude";
  if (targetCriticality === "critical" || targetCriticality === "high") {
    return "breaking_change_risk";
  }
  return "";
}

/**
 * Build a Set of "source|target" string keys for all circular dependency
 * pairs detected in state.json, so edge annotation can look them up in O(1).
 */
function buildCircularPairSet(
  circularDeps: StateJson["circular_dependencies"]
): Set<string> {
  const pairs = new Set<string>();
  for (const dep of circularDeps) {
    const chain = dep.chain;
    // chain[0] and chain[last] are the same node in a cycle description;
    // record adjacent pairs throughout the chain
    for (let i = 0; i < chain.length - 1; i++) {
      pairs.add(`${chain[i]}|${chain[i + 1]}`);
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a GraphSchema from state.json data, semantic node metadata, and
 * generator configuration.
 *
 * @param state       Parsed state.json object
 * @param semanticMeta Array of SemanticNodeMetadata for each key module/file
 *                    (as returned by the graph-synthesizer agent)
 * @param config      Generator configuration (plugin version, timestamp)
 * @returns           A fully-populated GraphSchema ready to be serialised
 */
export function generateGraphSchema(
  state: StateJson,
  semanticMeta: SemanticNodeMetadata[],
  config: GraphGeneratorConfig
): GraphSchema {
  // --- 1. Build nodes -------------------------------------------------------

  const nodes: GraphNodes = {};
  const nodeRoleMap = new Map<string, NodeRole>();
  const nodeCriticalityMap = new Map<string, NodeCriticality>();

  for (const meta of semanticMeta) {
    if (!meta.path) continue; // guard against malformed entries

    const node: GraphNode = {
      type: meta.type,
      role: meta.role,
      criticality: meta.criticality,
      stability: meta.stability,
      test_coverage: meta.test_coverage,
      description: meta.description ?? "",
    };

    if (meta.type === "module" && Array.isArray(meta.files)) {
      node.files = meta.files;
    }

    nodes[meta.path] = node;
    nodeRoleMap.set(meta.path, meta.role);
    nodeCriticalityMap.set(meta.path, meta.criticality);
  }

  const nodeKeys = new Set(Object.keys(nodes));

  // --- 2. Build circular pair lookup ----------------------------------------

  const circularPairs = buildCircularPairSet(
    state.circular_dependencies ?? []
  );

  // --- 3. Build edges -------------------------------------------------------

  const edgeSet = new Set<string>(); // dedup: "source|target"
  const edges: GraphEdge[] = [];

  for (const [sourceFile, imports] of Object.entries(state.import_graph)) {
    // Resolve the source file to a node key
    const sourceKey = resolveToNodeKey(sourceFile, nodeKeys);
    if (sourceKey === null) continue; // source is not in the key set

    for (const rawImport of imports) {
      // Skip external packages (no "/" prefix and not relative)
      if (!rawImport.startsWith(".") && !rawImport.startsWith("/") && !rawImport.includes("/")) {
        // Could still be an aliased internal path like "src/utils/logger"
        // — fall through to normal resolution
      }

      const targetKey = resolveToNodeKey(rawImport, nodeKeys);
      if (targetKey === null) continue; // target not in key set or external
      if (targetKey === sourceKey) continue; // self-reference, skip

      const dedupeKey = `${sourceKey}|${targetKey}`;
      if (edgeSet.has(dedupeKey)) continue;
      edgeSet.add(dedupeKey);

      const sourceRole = nodeRoleMap.get(sourceKey);
      const targetRole = nodeRoleMap.get(targetKey);
      const targetCriticality = nodeCriticalityMap.get(targetKey);
      const targetImporterCount = state.importer_counts[targetKey] ?? 0;

      const edge: GraphEdge = {
        source: sourceKey,
        target: targetKey,
        type: inferEdgeType(sourceKey, targetRole),
        strength: inferEdgeStrength(sourceRole, targetRole, targetImporterCount),
        directionality: inferEdgeDirectionality(
          sourceKey,
          targetKey,
          circularPairs,
          targetRole
        ),
        impact: inferEdgeImpact(
          sourceRole,
          targetRole,
          targetCriticality,
          targetImporterCount
        ),
      };

      edges.push(edge);
    }
  }

  // --- 4. Build metadata ----------------------------------------------------

  // Count how many distinct source|target pairs are circular
  let circularEdgeCount = 0;
  for (const edge of edges) {
    if (edge.directionality === "circular") circularEdgeCount++;
  }
  // Each circular pair shows up twice (A→B and B→A), so divide by 2 and round up
  const circularDependencyCount = Math.ceil(circularEdgeCount / 2);

  const metadata: GraphMetadata = {
    total_nodes: Object.keys(nodes).length,
    total_edges: edges.length,
    key_modules_analyzed: semanticMeta.length,
    circular_dependency_count: circularDependencyCount,
  };

  // --- 5. Assemble header ---------------------------------------------------

  const header: GraphSchemaHeader = {
    schema_version: 2,
    plugin_version: config.plugin_version,
    generated_at: config.generated_at ?? new Date().toISOString(),
    baseline_commit: state._header.baseline_commit,
    scan_root: state._header.scan_root,
  };

  // --- 6. Return assembled schema -------------------------------------------

  return {
    _header: header,
    nodes,
    edges,
    metadata,
  };
}
