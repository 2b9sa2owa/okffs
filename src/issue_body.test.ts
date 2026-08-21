import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveIssueBody,
  extractBranchFromBody,
  extractIssueMetadata,
  mergeIssueMetadata,
} from "./issue_body.js";

test("body alone resolves cleanly", () => {
  assert.deepEqual(resolveIssueBody({ body: "text" }, "create_issue"), { ok: true, body: "text" });
});

test("description alone resolves with a deprecation warning", () => {
  const res = resolveIssueBody({ description: "text" }, "create_issue");
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.body, "text");
    assert.match(res.deprecationWarning ?? "", /deprecated/);
    assert.match(res.deprecationWarning ?? "", /^\[okffs\] create_issue:/);
  }
});

test("both params is an actionable error", () => {
  const res = resolveIssueBody({ body: "a", description: "b" }, "plan task 2");
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error, /plan task 2.*not.*combined|cannot be combined/);
});

test("neither param is an actionable error", () => {
  const res = resolveIssueBody({}, "create_issue");
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error, /required/);
});

// ── okffs-owned metadata extract/merge (#295) ───────────────────────────────

const BRANCH_LINE = "**Branch:** `42-okffs-fix-the-thing`";
const REL_SECTION = "## Relationships\n- Parent: #1\n- Blocked by #3";
const FULL_BODY = `Some description.\n\n${BRANCH_LINE}\n\n${REL_SECTION}`;

test("extractBranchFromBody reads the anchored metadata line", () => {
  assert.equal(extractBranchFromBody(FULL_BODY), "42-okffs-fix-the-thing");
  assert.equal(extractBranchFromBody(null), null);
  assert.equal(extractBranchFromBody("no metadata here"), null);
});

test("extractBranchFromBody ignores the pattern quoted mid-prose (issue #295's own body)", () => {
  const body = "- the **`**Branch:** `{branch}`** line written by create_issue\n\n" + BRANCH_LINE;
  assert.equal(extractBranchFromBody(body), "42-okffs-fix-the-thing");
  // Quoted mention only, no real line → no match at all.
  assert.equal(extractBranchFromBody("- the **`**Branch:** `{branch}`** line"), null);
});

test("extractIssueMetadata finds both blocks", () => {
  const meta = extractIssueMetadata(FULL_BODY);
  assert.equal(meta.branchLine, BRANCH_LINE);
  assert.equal(meta.relationshipsSection, REL_SECTION);
});

test("extractIssueMetadata handles absent blocks and null bodies", () => {
  assert.deepEqual(extractIssueMetadata(null), { branchLine: null, relationshipsSection: null });
  assert.deepEqual(extractIssueMetadata("plain body"), { branchLine: null, relationshipsSection: null });
});

test("extractIssueMetadata stops the Relationships section at the next heading", () => {
  const meta = extractIssueMetadata(`Intro\n\n${REL_SECTION}\n\n## Notes\nlater prose`);
  assert.equal(meta.relationshipsSection, REL_SECTION);
});

test("mergeIssueMetadata re-appends dropped blocks", () => {
  const merged = mergeIssueMetadata("Rewritten body.", extractIssueMetadata(FULL_BODY));
  assert.equal(merged.body, `Rewritten body.\n\n${BRANCH_LINE}\n\n${REL_SECTION}`);
  assert.deepEqual(merged.preserved, ["**Branch:** line", "## Relationships"]);
});

test("mergeIssueMetadata leaves blocks the new body already carries (no duplicates)", () => {
  const merged = mergeIssueMetadata(FULL_BODY, extractIssueMetadata(FULL_BODY));
  assert.equal(merged.body, FULL_BODY);
  assert.deepEqual(merged.preserved, []);
});

test("mergeIssueMetadata respects a caller-supplied Branch line pointing elsewhere", () => {
  const newBody = "New text.\n\n**Branch:** `42-okffs-renamed-branch`";
  const merged = mergeIssueMetadata(newBody, extractIssueMetadata(FULL_BODY));
  assert.equal(extractBranchFromBody(merged.body), "42-okffs-renamed-branch");
  assert.deepEqual(merged.preserved, ["## Relationships"]);
});

test("mergeIssueMetadata with no stored metadata returns the body unchanged", () => {
  const merged = mergeIssueMetadata("Anything.", extractIssueMetadata("old plain body"));
  assert.equal(merged.body, "Anything.");
  assert.deepEqual(merged.preserved, []);
});
