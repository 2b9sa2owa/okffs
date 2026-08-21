import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeReviewThreads, renderReviewGateWarning } from "./review_gate.js";

const thread = (isResolved: boolean, author?: string) => ({
  isResolved,
  comments: author ? [{ author }] : [],
});

test("summarizeReviewThreads counts unresolved threads and dedupes reviewers", () => {
  const summary = summarizeReviewThreads([
    thread(false, "copilot-pull-request-reviewer"),
    thread(false, "copilot-pull-request-reviewer"),
    thread(true, "copilot-pull-request-reviewer"),
    thread(false, "human-reviewer"),
  ]);
  assert.equal(summary.unresolved, 3);
  assert.deepEqual(summary.reviewers, ["copilot-pull-request-reviewer", "human-reviewer"]);
});

test("summarizeReviewThreads tolerates a thread with no comments", () => {
  const summary = summarizeReviewThreads([thread(false)]);
  assert.equal(summary.unresolved, 1);
  assert.deepEqual(summary.reviewers, []);
});

test("renderReviewGateWarning is null when everything is resolved — no noise", () => {
  assert.equal(renderReviewGateWarning(300, summarizeReviewThreads([thread(true, "a")])), null);
  assert.equal(renderReviewGateWarning(300, summarizeReviewThreads([])), null);
});

test("renderReviewGateWarning names the PR, the count, the reviewers, and the loop", () => {
  const warning = renderReviewGateWarning(300, summarizeReviewThreads([thread(false, "copilot-pull-request-reviewer")]));
  assert.ok(warning);
  assert.match(warning, /1 unresolved review thread\(s\) from copilot-pull-request-reviewer on PR #300/);
  assert.match(warning, /list_pr_review_comments/);
  assert.match(warning, /fix_into_base/);
  assert.match(warning, /resolve threads only after the fix PR merges/);
});
