const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

test("plan-test-author agent exists and only writes failing tests", () => {
  assert.ok(exists("agents/plan-test-author.md"), "agents/plan-test-author.md must exist");
  const f = read("agents/plan-test-author.md");
  assert.match(f, /name:\s*plan-test-author/, "frontmatter name");
  assert.match(f, /failing test/i, "must describe writing a failing test");
  assert.match(f, /do not.{0,20}implement|never.{0,20}implement|not (write|implement).{0,40}implementation/i, "must forbid writing implementation");
  assert.match(f, /test_files/, "must return test_files");
});

test("plan-analyzer classifies testable tasks and splits them in TDD mode", () => {
  const f = read("agents/plan-analyzer.md");
  assert.match(f, /tdd_enabled/, "must read a tdd_enabled flag");
  assert.match(f, /testable/i, "must classify tasks testable vs non-testable");
  assert.match(f, /non_testable_reason/, "must record a reason for non-testable tasks");
  assert.match(f, /test-author/i, "must emit a test-author node");
  assert.match(f, /tests_to_satisfy/, "impl node must point at the paired tests");
  assert.match(f, /already exist/i, "re-run: detect pre-existing tests -> impl-only");
});

test("plan-verifier supports red-gate and green-gate modes", () => {
  const f = read("agents/plan-verifier.md");
  assert.match(f, /red-gate/i, "must define red-gate behavior");
  assert.match(f, /green-gate/i, "must define green-gate behavior");
  assert.match(f, /valid_red|valid red/i, "must judge whether red is valid");
  assert.match(f, /syntax|collection/i, "syntax/collection error = invalid red");
  assert.match(f, /broken_existing/, "must flag broken pre-existing tests");
  assert.match(f, /captured_test_output|test-run output/i, "consumes orchestrator-captured test output");
});

test("plan-dev consumes tests_to_satisfy and is gated on green", () => {
  const f = read("agents/plan-dev.md");
  assert.match(f, /tests_to_satisfy/, "impl must be told which tests to satisfy");
  assert.match(f, /green gate|make.{0,30}tests pass/i, "impl must aim to make the tests pass");
});

test("SKILL pre-flight handles --no-tdd, prompts, resolves test cmd, stops if none", () => {
  const f = read("skills/run/SKILL.md");
  assert.match(f, /--no-tdd/, "must document the --no-tdd flag");
  assert.match(f, /Enable TDD/i, "must prompt to enable TDD");
  assert.match(f, /--test-cmd/, "must support a --test-cmd flag");
  assert.match(f, /package\.json|pytest|go\.mod|Cargo\.toml|csproj/i, "must list detection markers");
  assert.match(f, /baseline/i, "must capture a green baseline");
  assert.match(f, /\{file\}/, "must store a single-file invocation pattern");
  assert.match(f, /STOP[\s\S]{0,200}--no-tdd/, "must STOP (not downgrade) when no test cmd is resolved");
});
