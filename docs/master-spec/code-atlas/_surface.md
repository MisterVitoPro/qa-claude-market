# Surface gaps for code-atlas

These symbols were found in code but could not be matched to an existing spec.

<!-- jupiter:surface-begin -->
## Undocumented surface (auto-generated)

- **atlas-patterns** (`plugins/code-atlas/agents/atlas-patterns.md`) - Haiku agent: detects tech stack, frameworks, architectural patterns, naming conventions from code samples <!-- TODO: expand -->
- **atlas-structure** (`plugins/code-atlas/agents/atlas-structure.md`) - Haiku agent: scans file tree to produce annotated directory map, key files, entry points, module boundaries <!-- TODO: expand -->
- **graph-synthesizer** (`plugins/code-atlas/agents/graph-synthesizer.md`) - Haiku agent: assigns role/criticality/stability/test_coverage to nodes; synthesizes one-line descriptions <!-- TODO: expand -->
- **validateQuery** (`plugins/code-atlas/src/query-executor.ts:160`) - Validates a parsed query value; returns ValidateSuccess or ValidateFailure <!-- TODO: expand -->
- **clampDepth** (`plugins/code-atlas/src/query-executor.ts:273`) - Clamps a requested graph traversal depth to [0, MAX_ALLOWED_DEPTH] <!-- TODO: expand -->
- **executeDependenciesOf** (`plugins/code-atlas/src/query-executor.ts:398`) - Executes a dependencies_of query over a GraphSchema, returning matched nodes and edges <!-- TODO: expand -->
- **executeDependentsOf** (`plugins/code-atlas/src/query-executor.ts:457`) - Executes a dependents_of query over a GraphSchema, returning matched nodes and edges <!-- TODO: expand -->
- **executeFilter** (`plugins/code-atlas/src/query-executor.ts:514`) - Executes a filter query over a GraphSchema using FilterConditions predicates <!-- TODO: expand -->
- **executeTransitiveDependents** (`plugins/code-atlas/src/query-executor.ts:545`) - Executes a transitive_dependents traversal over a GraphSchema up to a clamped depth <!-- TODO: expand -->
- **executeQuery** (`plugins/code-atlas/src/query-executor.ts:647`) - Routes a validated QueryOperation to the appropriate executor; returns QueryResponse <!-- TODO: expand -->
- **runQueryFromJson** (`plugins/code-atlas/src/query-executor.ts:707`) - End-to-end: parses JSON input, validates, executes query against a GraphSchema, returns QueryResponse <!-- TODO: expand -->
- **validateGraphSchema** (`plugins/code-atlas/src/schema-validator.ts:358`) - Validates structure and content of a GraphSchema document; returns ValidationResult with errors list <!-- TODO: expand -->
- **DEFAULT_MAX_DEPTH** (`plugins/code-atlas/src/query-executor.ts:36`) - Default graph traversal depth constant (value: 2) <!-- TODO: expand -->
- **MAX_ALLOWED_DEPTH** (`plugins/code-atlas/src/query-executor.ts:39`) - Maximum allowed graph traversal depth constant (value: 5) <!-- TODO: expand -->
- **keywords** (`plugins/code-atlas/.claude-plugin/plugin.json:6`) - 12-entry keyword array for marketplace discoverability (architecture, graph-schema, knowledge-graph, etc.) <!-- TODO: expand -->
- **repository** (`plugins/code-atlas/.claude-plugin/plugin.json:20`) - GitHub repository URL: https://github.com/MisterVitoPro/qa-swarm <!-- TODO: expand -->
- **skills** (`plugins/code-atlas/.claude-plugin/plugin.json:21`) - Explicit skills list in manifest: [map, update, query] <!-- TODO: expand -->

<!-- jupiter:surface-end -->
