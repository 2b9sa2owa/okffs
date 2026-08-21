import { z } from "zod";
import { isUntouchedBranch } from "../branch.js";
import {
  closeIssue,
  getIssue,
  addIssueComment,
  extractBranchFromBody,
  getOpenPullRequestForBranch,
  getBranchCommits,
  getDefaultBranch,
  closePullRequest,
  deleteBranch,
  owner,
  repo,
} from "../github.js";
import { config } from "../config.js";

export const name = "close_issue";

export const description =
  "Close a GitHub issue by issue number. Under OKFFS_AUTO_PR, if the issue's branch still has only an untouched auto-created draft PR (no real commits beyond okffs's init commit), that empty draft PR is also closed and the branch deleted. A ready PR, or any branch with real work, is left untouched.";

export const inputSchema = z.object({
  issue_number: z.number().int().positive().describe("The issue number to close"),
});

// isUntouchedBranch lives in branch.ts (pure, unit-testable — #259).

export async function handler(input: z.infer<typeof inputSchema>) {
  const issue = await getIssue(input.issue_number);
  const branchName = extractBranchFromBody(issue.body);

  await closeIssue(input.issue_number);

  // Under OKFFS_AUTO_PR, create_issue opens a draft PR at branch-creation time.
  // If the issue is closed with no work done, that empty draft PR + branch would
  // linger (#162). Clean them up — but ONLY when it's a *draft* PR over an
  // untouched branch. A ready PR, or any branch with real commits, is left alone.
  let cleanedUp = false;
  if (branchName && config.autoPR) {
    try {
      const pr = await getOpenPullRequestForBranch(branchName);
      if (pr && pr.draft) {
        const base = await getDefaultBranch();
        const commits = await getBranchCommits(branchName, base);
        if (isUntouchedBranch(commits)) {
          await closePullRequest(pr.number);
          await deleteBranch(branchName);
          await addIssueComment(
            input.issue_number,
            `Issue closed with no work on \`${branchName}\` — closed the empty draft PR #${pr.number} and deleted the branch.`
          );
          cleanedUp = true;
        }
      }
    } catch (err) {
      // Non-fatal: the issue is closed regardless; cleanup is best-effort.
      console.warn(
        `[okffs] Failed to clean up auto-PR for #${input.issue_number}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Without OKFFS_AUTO_PR there's no draft PR to reconcile; if a branch exists,
  // just note that it's left untouched (unchanged behaviour).
  if (branchName && !config.autoPR) {
    const comment = [
      `Issue closed. Branch \`${branchName}\` remains open — https://github.com/${owner}/${repo}/tree/${branchName}`,
      ``,
      `No action has been taken on the branch.`,
    ].join("\n");
    await addIssueComment(input.issue_number, comment);
  }

  // Closing no longer triggers a CHANGELOG update. create_pull_request is the
  // single source of auto-changelog entries — firing here too produced
  // duplicates (the PR already logged the change).

  const note = cleanedUp ? " Empty draft PR and branch cleaned up." : "";
  return {
    content: [{ type: "text" as const, text: `Issue #${input.issue_number} closed.${note}\n\n💡 Tip: run /clear to reset Claude Code context and save tokens before starting the next issue.` }],
  };
}
