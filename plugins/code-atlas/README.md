# Code Atlas

Architecture index generator for Claude Code. Scans a repository once, writes a
compact JSON index plus a queryable semantic dependency graph, and injects the
index into every future session — so Claude navigates straight to the right
files instead of re-exploring the repo from scratch.

## What it produces

All artifacts live in `.code-atlas/` (auto-appended to `.gitignore`):

| Artifact | What it is | Who reads it |
|----------|-----------|--------------|
| `atlas.json` | Curated, capped summary: tech stack, directory map, key files, high-traffic modules, conventions, build commands | SessionStart hook (every session) |
| `state.json` | Full cache: per-file hashes, complete import graph, importer counts, raw agent outputs | `/code-atlas:update` (hash diffing) |
| `graph-schema.json` | Semantic dependency graph: nodes annotated with role/criticality/stability/test-coverage, edges with type/strength/impact | `/code-atlas:query` and `scripts/query.js` |

## Commands

```
/code-atlas:map                 # full first-time scan (3 parallel analysts + 1 graph synthesizer)
/code-atlas:update              # incremental refresh via file-hash diffing (micro / targeted / full strategies)
/code-atlas:update full         # force a complete re-scan
/code-atlas:query <json|text>   # query the semantic graph (JSON query or plain English)
```

### Query examples

```
/code-atlas:query what is the blast radius of changing src/config?
/code-atlas:query {"operation":"filter","conditions":{"criticality":"critical","test_coverage":"untested"}}
/code-atlas:query {"operation":"dependents_of","module":"src/utils/logger","max_depth":1}
```

Four operations: `dependencies_of`, `dependents_of`, `filter`,
`transitive_dependents` (blast radius). Full spec:
[docs/query-language-reference.md](docs/query-language-reference.md).

Queries execute deterministically through `scripts/query.js` — a
dependency-free Node script with exact BFS semantics — not by having the model
walk the graph by hand. The same script validates graph artifacts
(`--validate`), and both `:map` and `:update` run that validation gate after
writing.

## How a scan works

1. **Index** — `git ls-files -s` gives free content hashes for tracked files;
   untracked files are SHA-256 hashed. A regex pass extracts imports from every
   source file (not a sample), producing the full import graph and exact
   importer counts.
2. **Analyze** — three Haiku agents run in parallel: structure (directory map,
   key files, entry points), patterns (tech stack, conventions, build
   commands), dependencies (module graph, circular deps, external deps).
3. **Synthesize** — the orchestrator assembles `atlas.json` (capped) and
   `state.json` (complete) inline, then dispatches the graph-synthesizer agent
   to annotate the key modules with semantic metadata; edges are derived
   deterministically from the import graph.
4. **Write + validate** — artifacts are written and the graph is checked with
   `scripts/query.js --validate`.

Incremental updates diff file hashes against `state.json` (resilient to rebases
and branch switches) and pick the cheapest strategy: micro (no agents),
targeted (2 agents), or full re-scan.

## Session start

A `SessionStart` hook injects `atlas.json` (minified) into context with a
staleness check against the current HEAD, plus a one-line pointer to the
semantic graph and `/code-atlas:query`. Oversized indexes are trimmed to the
high-value sections with a pointer to the full file. Requires Node on `PATH`.

## Schemas

Artifact shapes, enums, caps, and the deterministic edge-derivation algorithm
are specified in [docs/schema-reference.md](docs/schema-reference.md).
`test-fixtures/graph-schema-example.json` is a validated reference graph.

## Tests

```
node --test plugins/code-atlas/tests/query.test.js
```

Dependency-free (`node:test`, Node >= 18). Covers query parsing/validation,
all four operations, cycle safety, depth clamping, schema validation, and the
shipped fixture.

## License

MIT
