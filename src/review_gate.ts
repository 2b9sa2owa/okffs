// Promotion-gate review summarization (#302). Pure — no imports — so the
// "does the gate PR have unaddressed review feedback?" logic is unit-testable.
//
// okffs requests a (possibly billable) review on the promotion PR but MCP can't
// push a notification when the feedback lands — so the tools an agent already
// calls (promote_branch re-runs, list_issues) surface it via these helpers.

export interface GateThreadLike {
  isResolved: boolean;
  comments: Array<{ author: string }>;
}

export interface ReviewGateSummary {
  unresolved: number;
  /** Distinct authors of the first comment of each unresolved thread, in order. */
  reviewers: string[];
}

export function summarizeReviewThreads(threads: GateThreadLike[]): ReviewGateSummary {
  const open = threads.filter((t) => !t.isResolved);
  const reviewers = [...new Set(open.map((t) => t.comments[0]?.author).filter((a): a is string => Boolean(a)))];
  return { unresolved: open.length, reviewers };
}

/**
 * The warning + call-to-action for a gate PR with unresolved review threads —
 * or null when there is nothing to act on, so callers add no noise.
 */
export function renderReviewGateWarning(prNumber: number, summary: ReviewGateSummary): string | null {
  if (summary.unresolved === 0) return null;
  const from = summary.reviewers.length > 0 ? ` from ${summary.reviewers.join(", ")}` : "";
  return (
    `⚠️ ${summary.unresolved} unresolved review thread(s)${from} on PR #${prNumber}. ` +
    `Address them now (the address_pr_review loop): list_pr_review_comments → fix the valid ones on a scratch branch off the head branch → ` +
    `fix_into_base to land the fix → reply_to_review_comment per thread → resolve threads only after the fix PR merges.`
  );
}
