# Fixture: single-module

Flat repo with one `package.json`, three loose specs, and a small `src/` tree.

## Expected adoption outcome (fresh run)

- Mode detected: `feature` (single root `package.json`, no nested manifests)
- Buckets: feature-keyed, probably `auth`, `storage`, `ui` based on dominant topics
- Specs moved:
  - `docs/auth-design.md` -> `docs/master-spec/features/auth/auth-design.md`
  - `docs/storage-design.md` -> `docs/master-spec/features/storage/storage-design.md`
  - `docs/ui-design.md` -> `docs/master-spec/features/ui/ui-design.md`
- Surface stubs include `DATABASE_URL`, `API_KEY` env vars and any exported
  functions from `src/main.js` + `src/auth.js` not mentioned in any spec

## Reset after a smoke test

```bash
git reset --hard HEAD~N
git clean -fd docs/master-spec
```
