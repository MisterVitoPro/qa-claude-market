"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OSV_URL = "https://api.osv.dev/v1/querybatch";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Map our ecosystem identifiers to OSV.dev's expected names.
const ECO_MAP = {
  npm: "npm",
  python: "PyPI",
  go: "Go",
  rust: "crates.io",
  java: "Maven",
  kotlin: "Maven",
  csharp: "NuGet",
};

function cacheDir() {
  return process.env.MIGRATION_RUNNER_CACHE_DIR || path.join(process.cwd(), ".migration-runner", "cache");
}

function ensureCacheDir() {
  fs.mkdirSync(cacheDir(), { recursive: true });
}

function cacheKey(queries) {
  const norm = JSON.stringify(queries.map((q) => [q.package.ecosystem, q.package.name, q.version]).sort());
  return crypto.createHash("sha256").update(norm).digest("hex");
}

function cachePath(key) {
  return path.join(cacheDir(), `osv-${key}.json`);
}

function readCache(key) {
  const p = cachePath(key);
  if (!fs.existsSync(p)) return null;
  const stat = fs.statSync(p);
  if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  ensureCacheDir();
  const tmp = cachePath(key) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, cachePath(key));
}

function normalizeSeverity(vuln) {
  // Prefer database_specific.severity (GitHub-style HIGH/CRITICAL).
  if (vuln.database_specific && vuln.database_specific.severity) {
    return String(vuln.database_specific.severity).toUpperCase();
  }
  // Fall back to deriving from CVSS.
  const sev = (vuln.severity || []).find((s) => s.type && s.score);
  if (sev) {
    const score = parseFloat(String(sev.score).replace(/^CVSS:\d\.\d\//, "").replace(/.*\b(\d+(\.\d+)?)\b.*/, "$1"));
    if (Number.isFinite(score)) {
      if (score >= 9) return "CRITICAL";
      if (score >= 7) return "HIGH";
      if (score >= 4) return "MEDIUM";
      return "LOW";
    }
  }
  return "UNKNOWN";
}

async function queryBatch(items) {
  // items: [{ ecosystem, name, version }]
  const queries = items.map((it) => ({
    package: { name: it.name, ecosystem: ECO_MAP[it.ecosystem] || it.ecosystem },
    version: it.version,
  }));
  const key = cacheKey(queries);
  const cached = readCache(key);
  if (cached) return cached;

  const resp = await fetch(OSV_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ queries }),
  });
  if (!resp.ok) {
    throw new Error(`OSV.dev returned ${resp.status}`);
  }
  const data = await resp.json();
  const results = (data.results || []).map((r) => ({
    vulns: (r.vulns || []).map((v) => ({
      id: v.id,
      severity: normalizeSeverity(v),
      summary: v.summary || "",
    })),
  }));
  writeCache(key, results);
  return results;
}

async function query(item) {
  // Single-item convenience wrapper around queryBatch.
  const results = await queryBatch([item]);
  return results[0];
}

module.exports = { query, queryBatch };

if (require.main === module) {
  (async () => {
    const sub = process.argv[2];
    if (sub === "query") {
      const stdin = fs.readFileSync(0, "utf8");
      const items = JSON.parse(stdin);
      try {
        const out = await queryBatch(items);
        process.stdout.write(JSON.stringify(out));
      } catch (e) {
        process.stderr.write(`error: ${e.message}\n`);
        process.exit(3);
      }
    } else {
      process.stderr.write("usage: osv-client.js query  (reads JSON array from stdin)\n");
      process.exit(2);
    }
  })();
}
