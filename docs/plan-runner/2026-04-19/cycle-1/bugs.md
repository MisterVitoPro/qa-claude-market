# Code Atlas v2.0 Implementation — Bug Report (Cycle 1)

**Total Bugs Found:** 3
**P0:** 0 | **P1:** 1 | **P2:** 2

---

## P1 (1 bug)

### BUG-W2-1: graph-schema.json README description misleading

**File:** `plugins/code-atlas/README.md`  
**Wave:** 2  
**Agent:** wave-2-agent-6

**Issue:**
The "What's New in v2.0" section incorrectly describes graph-schema.json as "a formal JSON Schema at .code-atlas/graph-schema.json that describes the full shape of both atlas.json and state.json". This is factually wrong.

**Reality:**
graph-schema.json is the **semantic dependency graph** containing:
- Annotated nodes (modules/files with roles, criticality, stability, test_coverage)
- Annotated edges (dependencies with type, strength, directionality, impact)

**Impact:**
Users reading the README will misunderstand what graph-schema.json contains and how to use it.

**Fix:**
Replace the misleading description with accurate text explaining graph-schema.json as a semantic dependency graph with node and edge metadata, queryable via `/code-atlas:query`.

---

## P2 (2 bugs)

### BUG-W1-1: NodeRole union missing 'route_definition' value

**File:** `plugins/code-atlas/src/types/graph-schema.ts`  
**Wave:** 1  
**Agent:** wave-1-agent-2 (graph-synthesizer.md) / wave-1-agent-1 (graph-schema.ts)

**Issue:**
The graph-synthesizer agent defines `route_definition` as a valid role value in its decision heuristics, but the NodeRole TypeScript union in graph-schema.ts does not include it.

**Current NodeRole values:**
```
'entry_point' | 'core_module' | 'utility' | 'config' | 'middleware' | 'model' | 'public_api' | 'internal'
```

**Expected:**
```
'entry_point' | 'core_module' | 'utility' | 'config' | 'middleware' | 'model' | 'public_api' | 'route_definition' | 'internal'
```

**Impact:**
When the synthesizer agent outputs a node with `role: "route_definition"`, TypeScript validation will fail.

**Fix:**
Add `'route_definition'` to the NodeRole union in graph-schema.ts.

---

### BUG-W2-2: transitive_dependents operation missing from README query types table

**File:** `plugins/code-atlas/README.md`  
**Wave:** 2  
**Agent:** wave-2-agent-6

**Issue:**
The "What's New in v2.0" section lists a "Supported query types" table with only 3 operations: `filter`, `dependencies_of`, `dependents_of`. The fourth operation `transitive_dependents` is omitted.

**Reality:**
`transitive_dependents` is fully implemented in query-executor.ts and documented in query/SKILL.md.

**Impact:**
Users reading the README will not know that transitive_dependents exists.

**Fix:**
Add row to the query types table:
```
| `transitive_dependents` | List all modules that transitively depend on the given file (upstream consumer set) |
```

---

## Wave Summary

| Wave | Agents | Status | Bugs | Notes |
|------|--------|--------|------|-------|
| 1 | 6 | DONE | 1 P2 | Types, semantic analyzer, docs, fixture, manifest, skill updates |
| 2 | 6 | DONE | 1 P1 + 1 P2 | Generator, executor, validator, query skill, update docs, README |
| 3 | 2 | CLEAN | 0 | Extended tests (60+ cases), integration test (30 cases) |
| 4 | 1 | CLEAN | 0 | Final verification, tag, push |

**Total:** 15 agents, 3 bugs (all documentation or cross-agent schema)

---

## Files Created/Modified

**New:** 15 files (types, implementations, tests, skills, docs, fixtures)
**Modified:** 2 files (plugin manifest, README)
**Total changes:** 23 files, ~5500 lines added

---

## Recommendation for Cycle 2

All bugs are **fixable without re-implementation**:
- P1 (README): 1-line description fix
- P2 (NodeRole): 1 union member addition
- P2 (README): 1 table row addition

Cycle 2 can be run with a minimal fix-plan targeting these 3 quick changes.
