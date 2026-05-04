const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let TMPDIR;

before(() => {
  TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), "osv-test-"));
  process.env.MIGRATION_RUNNER_CACHE_DIR = TMPDIR;
});
after(() => {
  global.fetch = ORIG_FETCH;
  delete process.env.MIGRATION_RUNNER_CACHE_DIR;
  fs.rmSync(TMPDIR, { recursive: true, force: true });
});

test("queryBatch: posts a batch query and returns parsed results", async () => {
  let captured;
  global.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return {
      ok: true,
      json: async () => ({
        results: [
          { vulns: [{ id: "GHSA-aaa", database_specific: { severity: "HIGH" }, summary: "test" }] },
          { vulns: [] },
        ],
      }),
    };
  };
  delete require.cache[require.resolve("../scripts/osv-client.js")];
  const { queryBatch } = require("../scripts/osv-client.js");
  const res = await queryBatch([
    { ecosystem: "npm", name: "lodash", version: "4.17.20" },
    { ecosystem: "npm", name: "axios", version: "1.7.2" },
  ]);
  assert.equal(captured.url, "https://api.osv.dev/v1/querybatch");
  assert.equal(captured.body.queries.length, 2);
  assert.equal(captured.body.queries[0].package.name, "lodash");
  assert.equal(captured.body.queries[0].package.ecosystem, "npm");
  assert.equal(res.length, 2);
  assert.equal(res[0].vulns[0].severity, "HIGH");
  assert.equal(res[1].vulns.length, 0);
});

test("queryBatch: maps PyPI/Go ecosystem names to OSV format", async () => {
  let captured;
  global.fetch = async (_, init) => {
    captured = JSON.parse(init.body);
    return { ok: true, json: async () => ({ results: [{ vulns: [] }, { vulns: [] }] }) };
  };
  delete require.cache[require.resolve("../scripts/osv-client.js")];
  const { queryBatch } = require("../scripts/osv-client.js");
  await queryBatch([
    { ecosystem: "python", name: "requests", version: "2.0.0" },
    { ecosystem: "go", name: "golang.org/x/text", version: "v0.3.0" },
  ]);
  assert.equal(captured.queries[0].package.ecosystem, "PyPI");
  assert.equal(captured.queries[1].package.ecosystem, "Go");
});

test("queryBatch: caches identical queries", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ results: [{ vulns: [] }] }) };
  };
  delete require.cache[require.resolve("../scripts/osv-client.js")];
  const { queryBatch } = require("../scripts/osv-client.js");
  const q = [{ ecosystem: "npm", name: "left-pad", version: "1.0.0" }];
  await queryBatch(q);
  await queryBatch(q);
  assert.equal(calls, 1, "second call should hit cache");
});

test("query: single-item wrapper returns first result", async () => {
  let captured;
  global.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return {
      ok: true,
      json: async () => ({
        results: [
          { vulns: [{ id: "GHSA-bbb", database_specific: { severity: "CRITICAL" }, summary: "critical vuln" }] },
        ],
      }),
    };
  };
  delete require.cache[require.resolve("../scripts/osv-client.js")];
  const { query } = require("../scripts/osv-client.js");
  const res = await query({ ecosystem: "npm", name: "express", version: "4.17.1" });
  assert.equal(captured.url, "https://api.osv.dev/v1/querybatch");
  assert.equal(captured.body.queries.length, 1);
  assert.equal(captured.body.queries[0].package.name, "express");
  assert.ok(res.vulns, "result has vulns property");
  assert.equal(res.vulns[0].severity, "CRITICAL");
});
