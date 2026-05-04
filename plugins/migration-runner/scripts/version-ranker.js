"use strict";

// Compare two semver-ish strings: returns -1, 0, or 1.
// Tolerates non-semver tails (e.g., "1.2.3-rc.1" sorts before "1.2.3").
function cmp(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa.parts[i] !== pb.parts[i]) return pa.parts[i] < pb.parts[i] ? -1 : 1;
  }
  // pre-release: anything with a tail is "less than" the same version without one
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && pb.pre) return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
  return 0;
}

function parseSemver(v) {
  const s = String(v).replace(/^[v=]+/, "");
  const m = s.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+](.+))?$/);
  if (!m) return { parts: [0, 0, 0], pre: s };
  return {
    parts: [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)],
    pre: m[4] || null,
  };
}

function majorOf(v) {
  return parseSemver(v).parts[0];
}

function isHighOrCritical(severity) {
  const s = String(severity || "").toUpperCase();
  return s === "HIGH" || s === "CRITICAL";
}

function ageDays(releasedAt, now) {
  const t = new Date(releasedAt).getTime();
  if (Number.isNaN(t)) return Infinity; // unknown date treated as old
  return Math.floor((now.getTime() - t) / 86400000);
}

function recommend({ currentVersion, candidates, vulnsByVersion, opts }) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const soak = opts.soak_days ?? 14;
  const allowMajor = !!opts.allow_major;

  const eligible = candidates
    .filter((c) => cmp(c.version, currentVersion) > 0)
    .sort((a, b) => cmp(b.version, a.version)); // newest first

  const currentMajor = majorOf(currentVersion);
  const sameMajor = eligible.filter((c) => majorOf(c.version) === currentMajor);
  const crossMajor = eligible.filter((c) => majorOf(c.version) > currentMajor);

  const skipped = [];

  function findClean(list) {
    for (const cand of list) {
      const vulns = (vulnsByVersion[cand.version] || []).filter((v) => isHighOrCritical(v.severity));
      const age = ageDays(cand.released_at, now);
      if (vulns.length > 0) {
        skipped.push({ version: cand.version, reason: `unfixed ${vulns[0].severity} vuln ${vulns[0].id}` });
        continue;
      }
      if (age < soak) {
        skipped.push({ version: cand.version, reason: `released ${age}d ago, below ${soak}d soak floor` });
        continue;
      }
      return { cand, fixedAtLeastOne: true };
    }
    return null;
  }

  function pickFewestVulns(list) {
    let best = null;
    let bestCount = Infinity;
    let bestVulns = [];
    for (const cand of list) {
      const vulns = (vulnsByVersion[cand.version] || []).filter((v) => isHighOrCritical(v.severity));
      if (vulns.length < bestCount) {
        best = cand;
        bestCount = vulns.length;
        bestVulns = vulns;
      }
    }
    return { cand: best, vulns: bestVulns };
  }

  if (allowMajor) {
    const all = [...crossMajor, ...sameMajor].sort((a, b) => cmp(b.version, a.version));
    const clean = findClean(all);
    if (clean) {
      return {
        target: clean.cand.version,
        rationale: `latest with ${ageDays(clean.cand.released_at, now)}d soak; no unfixed HIGH/CRITICAL CVEs (allow_major)`,
        risk: "normal",
        skipped,
      };
    }
    const fallback = pickFewestVulns(all);
    if (fallback.cand) {
      const cves = fallback.vulns.map((v) => v.id).join(", ");
      return {
        target: fallback.cand.version,
        rationale: `fewest unfixed HIGH/CRITICAL vulns available: ${cves || "none specifically tagged"}`,
        risk: "elevated",
        skipped,
      };
    }
    return { target: null, rationale: "no candidates above current version", risk: "normal", skipped };
  }

  // allow_major === false
  const cleanSame = findClean(sameMajor);
  if (cleanSame) {
    return {
      target: cleanSame.cand.version,
      rationale: `${cleanSame.cand.version}: latest in ${currentMajor}.x with ${ageDays(cleanSame.cand.released_at, now)}d soak; no unfixed HIGH/CRITICAL CVEs`,
      risk: "normal",
      skipped,
    };
  }
  if (sameMajor.length > 0) {
    const fallback = pickFewestVulns(sameMajor);
    const cves = fallback.vulns.map((v) => v.id).join(", ");
    return {
      target: fallback.cand.version,
      rationale: `no clean version in ${currentMajor}.x; picking fewest unfixed HIGH/CRITICAL: ${cves || "none specifically tagged"}`,
      risk: "elevated",
      skipped,
    };
  }
  // No same-major candidates at all
  return { target: null, rationale: "no in-major candidates; pass --allow-major to consider major bumps", risk: "normal", skipped };
}

module.exports = { recommend, cmp, parseSemver, majorOf };

// CLI: node version-ranker.js recommend <input.json>
if (require.main === module) {
  const sub = process.argv[2];
  const arg = process.argv[3];
  if (sub === "recommend" && arg) {
    const input = JSON.parse(require("fs").readFileSync(arg, "utf8"));
    process.stdout.write(JSON.stringify(recommend(input)));
  } else {
    process.stderr.write("usage: version-ranker.js recommend <input.json>\n");
    process.exit(2);
  }
}
