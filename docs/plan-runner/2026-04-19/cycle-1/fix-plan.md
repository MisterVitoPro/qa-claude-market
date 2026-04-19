# Code Atlas v2.0 Implementation — Fix Plan (Cycle 2)

**Input:** 3 bugs from Cycle 1  
**Goal:** Address all 3 bugs (1 P1, 2 P2) with minimal, surgical fixes

---

## Task 1: Fix NodeRole union in graph-schema.ts

**Files:**
- Modify: `plugins/code-atlas/src/types/graph-schema.ts`

**Acceptance Criteria:**
- NodeRole union type includes 'route_definition'
- TypeScript compiles cleanly (tsc --strict)
- All existing tests pass

**Change:**

In `plugins/code-atlas/src/types/graph-schema.ts`, locate the NodeRole union type definition:

```typescript
export type NodeRole = 
  | "entry_point"
  | "core_module"
  | "utility"
  | "config"
  | "middleware"
  | "model"
  | "public_api"
  | "internal";
```

Replace with:

```typescript
export type NodeRole = 
  | "entry_point"
  | "core_module"
  | "utility"
  | "config"
  | "middleware"
  | "model"
  | "public_api"
  | "route_definition"
  | "internal";
```

**Rationale:** graph-synthesizer agent describes route_definition as a semantic role for API route handlers and router definitions. This adds it to the type system to match the agent's output spec.

---

## Task 2: Fix graph-schema.json description in README

**Files:**
- Modify: `plugins/code-atlas/README.md`

**Acceptance Criteria:**
- "What's New in v2.0" section accurately describes graph-schema.json
- Description clarifies it is a semantic dependency graph, not a JSON Schema descriptor
- No other changes to README

**Change:**

In `plugins/code-atlas/README.md`, find the "What's New in v2.0" section and locate the inaccurate description of graph-schema.json:

```markdown
**graph-schema.json** — a formal JSON Schema at `.code-atlas/graph-schema.json` that describes the full shape of both `atlas.json` and `state.json`
```

Replace with:

```markdown
**graph-schema.json** — semantic dependency graph with annotated modules/files (roles, criticality, stability, test_coverage) and dependency edges (type, strength, directionality, impact), queryable via `/code-atlas:query`
```

**Rationale:** graph-schema.json contains the semantic graph, not a JSON Schema descriptor. This fix clarifies purpose and usage.

---

## Task 3: Add transitive_dependents to README query types table

**Files:**
- Modify: `plugins/code-atlas/README.md`

**Acceptance Criteria:**
- "Supported query types" table includes all 4 operations
- transitive_dependents described accurately
- No other changes to README

**Change:**

In the "What's New in v2.0" section of README, find the "Supported query types" table:

```markdown
| Query Type | Purpose |
|---|---|
| `filter` | Find modules matching specific properties (criticality, role, stability, test_coverage) |
| `dependencies_of` | Find all modules that a given module imports (dependencies) |
| `dependents_of` | Find all modules that import a given module (reverse dependencies) |
```

Add a fourth row:

```markdown
| `transitive_dependents` | Find all modules that transitively depend on a given module (full upstream consumer set) |
```

**Rationale:** transitive_dependents is fully implemented but was accidentally omitted from the README table. This makes all four operations visible to users.

---

## Testing

After fixes, run:

```bash
cd plugins/code-atlas
npm test
npm run coverage  # verify >80% coverage maintained
```

All tests should pass. No test changes needed.

---

## Files Touched

- `plugins/code-atlas/src/types/graph-schema.ts` — 1 union member added
- `plugins/code-atlas/README.md` — 2 small text edits (1 description, 1 table row)

**Total changes:** ~3 lines of code/markdown

---

## Expected Outcome

✅ All 3 bugs fixed with minimal changes  
✅ No implementation refactoring needed  
✅ Tests remain passing  
✅ Release ready for v2.0.0 tag  

---

## Cycle 2 Execution

This fix-plan requires **1 agent** (single wave):
- 1 dev agent: Apply all 3 fixes to 2 files, run tests
- 1 wave verifier: Confirm fixes work

Estimated time: <5 minutes
