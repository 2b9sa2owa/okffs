import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveIssueBody } from "./issue_body.js";

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
