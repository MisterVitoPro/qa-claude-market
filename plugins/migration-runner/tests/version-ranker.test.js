const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recommend } = require("../scripts/version-ranker.js");

const NOW = new Date("2026-05-03T00:00:00Z");
const days = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

test("recommend: picks latest in same major with no HIGH/CRITICAL CVE and >=14d soak", () => {
  const out = recommend({
    currentVersion: "1.6.0",
    candidates: [
      { version: "1.7.4", released_at: days(3) },   // too fresh
      { version: "1.7.3", released_at: days(20) },  // has CVE
      { version: "1.7.2", released_at: days(40) },  // winner
      { version: "1.6.5", released_at: days(90) },
    ],
    vulnsByVersion: {
      "1.7.3": [{ id: "CVE-2026-5678", severity: "HIGH" }],
    },
    opts: { soak_days: 14, allow_major: false, now: NOW },
  });
  assert.equal(out.target, "1.7.2");
  assert.equal(out.risk, "normal");
  assert.match(out.rationale, /1\.7\.2/);
  assert.equal(out.skipped.find((s) => s.version === "1.7.4").reason.includes("soak"), true);
  assert.equal(out.skipped.find((s) => s.version === "1.7.3").reason.includes("HIGH"), true);
});

test("recommend: elevated risk when no clean version exists in major", () => {
  const out = recommend({
    currentVersion: "1.0.0",
    candidates: [
      { version: "1.2.0", released_at: days(30) },
      { version: "1.1.0", released_at: days(60) },
    ],
    vulnsByVersion: {
      "1.2.0": [{ id: "CVE-A", severity: "CRITICAL" }],
      "1.1.0": [{ id: "CVE-A", severity: "CRITICAL" }, { id: "CVE-B", severity: "HIGH" }],
    },
    opts: { soak_days: 14, allow_major: false, now: NOW },
  });
  assert.equal(out.target, "1.2.0");
  assert.equal(out.risk, "elevated");
  assert.match(out.rationale, /CVE-A/);
});

test("recommend: with allow_major, considers cross-major candidates", () => {
  const out = recommend({
    currentVersion: "1.5.0",
    candidates: [
      { version: "2.0.0", released_at: days(30) },
      { version: "1.6.0", released_at: days(60) },
    ],
    vulnsByVersion: {},
    opts: { soak_days: 14, allow_major: true, now: NOW },
  });
  assert.equal(out.target, "2.0.0");
  assert.equal(out.risk, "normal");
});

test("recommend: without allow_major, surfaces majors separately and picks within current major", () => {
  const out = recommend({
    currentVersion: "1.5.0",
    candidates: [
      { version: "2.0.0", released_at: days(30) },
      { version: "1.6.0", released_at: days(60) },
    ],
    vulnsByVersion: {},
    opts: { soak_days: 14, allow_major: false, now: NOW },
  });
  assert.equal(out.target, "1.6.0");
  assert.equal(out.risk, "normal");
});

test("recommend: returns null target when no candidates >= current", () => {
  const out = recommend({
    currentVersion: "1.7.0",
    candidates: [
      { version: "1.6.0", released_at: days(30) },
    ],
    vulnsByVersion: {},
    opts: { soak_days: 14, allow_major: false, now: NOW },
  });
  assert.equal(out.target, null);
  assert.equal(out.risk, "normal");
});
