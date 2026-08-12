import { z } from "zod";
import { addIssueComment, getIssue, extractBranchFromBody } from "../github.js";
import { git, gitOutput, currentBranch } from "../git.js";
import { renderAutopilotDecisions, AUTOPILOT_DECISIONS_DESCRIPTION } from "../autopilot.js";

export const name = "commit_and_update";
export const description =
  "Stage all changes, build a commit message from the provided hint (or the changed file list), commit, push to the issue branch, and post a rich progress comment to the linked issue.";

export const inputSchema = z.object({
  issue_number: z.number().int().positive().describe("The issue number this work is against"),
  hint: z.string().optional().describe("Short description of what was done — used to build the commit message and issue comment"),
  autopilot_decisions: z.array(z.string()).optional().describe(AUTOPILOT_DECISIONS_DESCRIPTION),
});

const SUBJECT_MAX = 72;

/**
 * Split a free-text hint into a git commit subject + optional body.
 *
 * - Subject: the first **non-blank** line, truncated to ~72 chars at a **word
 *   boundary** (never mid-word) — a single unbreakable word longer than the
 *   limit is the only case that gets a hard cut. Leading blank lines are skipped
 *   so a hint like "\nAdd X" doesn't produce an empty subject (#236).
 * - Body: any lines after the subject line, plus whatever overflowed past the
 *   subject, joined as blank-line-separated paragraphs. `undefined` when the
 *   hint fits entirely in the subject, so a short single-line hint behaves
 *   exactly as before (subject only). (#228)
 *
 * A whitespace-only hint has no usable subject line and returns `{ subject: "" }`
 * — the handler guards against that by treating a blank hint as absent (#236).
 */
export function splitCommitMessage(hint: string): { subject: string; body?: string } {
  const lines = hint.split("\n");
  // Take the subject from the first non-blank line, not lines[0], so leading
  // blank lines don't yield an empty subject.
  const firstIdx = lines.findIndex((l) => l.trim() !== "");
  if (firstIdx === -1) return { subject: "" };
  const firstLine = lines[firstIdx].trim();
  const rest = lines.slice(firstIdx + 1).join("\n").trim();

  let subject = firstLine;
  let overflow = "";
  if (firstLine.length > SUBJECT_MAX) {
    const slice = firstLine.slice(0, SUBJECT_MAX);
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > 0) {
      subject = firstLine.slice(0, lastSpace).trimEnd();
      overflow = firstLine.slice(lastSpace + 1).trim();
    } else {
      // A single word longer than the limit — no boundary to break on.
      subject = slice;
      overflow = firstLine.slice(SUBJECT_MAX).trim();
    }
  }

  const body = [overflow, rest].filter(Boolean).join("\n\n");
  return body ? { subject, body } : { subject };
}

export async function handler(input: z.infer<typeof inputSchema>) {
  // A GitHub API failure here must surface as a contextual tool result, not a
  // raw MCP -32603 internal error. Nothing has happened yet, so a plain error
  // message is the right shape (#284).
  let issue: Awaited<ReturnType<typeof getIssue>>;
  try {
    issue = await getIssue(input.issue_number);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{
        type: "text" as const,
        text: `commit_and_update failed: could not look up issue #${input.issue_number} (${msg}). Nothing was committed.`,
      }],
    };
  }
  const branchName = extractBranchFromBody(issue.body);

  // Without a **Branch:** line there is no issue branch to commit to — carrying
  // on would commit onto whatever branch happens to be checked out and never
  // push. Refuse early instead (PR #277 review).
  if (!branchName) {
    return {
      content: [{
        type: "text" as const,
        text: `Issue #${input.issue_number} has no associated branch (no **Branch:** line), so there's nothing to commit to. Use create_pull_request with an explicit \`branch\` to backfill the link, or add the **Branch:** line to the issue body.`,
      }],
    };
  }

  // Files changed relative to HEAD — used for the commit message and comment.
  let changedFiles: string[] = [];
  try {
    changedFiles = gitOutput(["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean);
  } catch {
    changedFiles = [];
  }

  // Trim so a whitespace-only hint (e.g. "   ") counts as absent — otherwise it
  // is truthy and yields an empty commit subject (#236).
  const hintText = (input.hint ?? "").trim();
  const filesText = changedFiles.length > 0 ? changedFiles.join(", ") : "various files";

  // Build the commit subject (and optional body) from the hint when provided,
  // else the file list. A long/multi-line hint is split into a word-boundary
  // subject plus a body rather than blindly sliced mid-word at 72 chars (#228).
  const { subject: commitMessage, body: commitBody } = hintText
    ? splitCommitMessage(hintText)
    : { subject: `chore: update ${filesText.slice(0, 60)}`, body: undefined };

  // Stage, commit, and push on the issue branch. Arguments are passed as an
  // array (no shell), so the hint and branch name can't be interpreted as
  // shell commands. The caller's original branch is restored afterward.
  const previousBranch = currentBranch();
  let commitHash = "";
  let idempotentRetry = false;
  let retrySubject = "";
  try {
    if (branchName && previousBranch !== branchName) {
      git(["checkout", branchName]);
    }
    git(["add", "-A"]);
    // Idempotent retry (#269): a clean tree means `git commit` would fail with
    // "nothing to commit". That's expected when a previous invocation actually
    // completed server-side (stage+commit+push landed) but the client timed out
    // and retried. Distinguish that from a genuine no-op call by comparing HEAD
    // to the remote branch tip: clean tree + HEAD already pushed → treat as
    // success and still post/refresh the issue comment; clean tree + HEAD not
    // on the remote → keep a friendly error (nothing was committed or pushed).
    if (gitOutput(["status", "--porcelain"]) === "") {
      const head = gitOutput(["rev-parse", "HEAD"]);
      const remoteRef = gitOutput(["ls-remote", "origin", `refs/heads/${branchName}`]);
      const remoteTip = remoteRef.split(/\s+/)[0] ?? "";
      if (remoteTip && remoteTip === head) {
        idempotentRetry = true;
        commitHash = gitOutput(["rev-parse", "--short", "HEAD"]);
        // Capture the landed commit's subject here, keyed by the full hash and
        // while still on the issue branch — a short hash can turn ambiguous as
        // history grows, and after `finally` we're back on the caller's branch
        // (PR #277 review).
        retrySubject = gitOutput(["log", "-1", "--pretty=%s", head]);
      } else {
        return {
          content: [{
            type: "text" as const,
            text: `Nothing to commit: the working tree is clean and the latest commit is not on \`origin/${branchName}\`. Make some changes first (or push the branch manually if that was the intent).`,
          }],
        };
      }
    } else {
      const commitArgs = ["commit", "-m", commitMessage];
      if (commitBody) {
        // A second -m yields a native subject + body (blank-line separated),
        // still passing every arg as an array (no shell).
        commitArgs.push("-m", commitBody);
      }
      git(commitArgs);
      if (branchName) {
        git(["push", "origin", branchName]);
      }
      commitHash = gitOutput(["rev-parse", "--short", "HEAD"]);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `commit_and_update failed: ${msg}` }],
    };
  } finally {
    if (branchName && previousBranch && previousBranch !== branchName) {
      try {
        git(["checkout", previousBranch]);
      } catch (err) {
        console.warn("[okffs] Failed to restore branch:", err instanceof Error ? err.message : err);
      }
    }
  }

  // Post rich comment to issue
  const timestamp = new Date().toISOString();
  const filesSection = changedFiles.length > 0
    ? changedFiles.map((f) => `- \`${f}\``).join("\n")
    : "- No files detected";

  // Autopilot decisions report (#238) — logged onto the issue as work progresses
  // so a decide-then-report run leaves an audit trail at each step, not only at PR.
  const decisionsSection = renderAutopilotDecisions(input.autopilot_decisions);

  // On an idempotent retry nothing was committed this call — report the subject
  // of the commit that actually landed rather than the rebuilt (unused) message.
  const reportedMessage = idempotentRetry ? retrySubject : commitMessage;

  const comment = [
    `### 🔧 Commit update${idempotentRetry ? " (idempotent retry — already committed and pushed)" : ""}`,
    ``,
    `**Commit:** \`${commitHash}\``,
    `**Message:** ${reportedMessage}`,
    `**Time:** ${timestamp}`,
    ``,
    `**Files changed:**`,
    filesSection,
    hintText ? `\n**Summary:** ${hintText}` : "",
    decisionsSection ? `\n${decisionsSection}` : "",
  ].filter((l) => l !== undefined).join("\n");

  // The commit+push above is durable — a failure posting the comment must be
  // reported as success-with-warning carrying the landed state (commit hash,
  // branch), never escape as a raw MCP -32603 that hides the partial success (#284).
  try {
    await addIssueComment(input.issue_number, comment);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const landed = idempotentRetry
      ? `Already committed and pushed as \`${commitHash}\` on \`${branchName}\` (idempotent retry)`
      : `Committed \`${commitHash}\` and pushed to \`${branchName}\``;
    return {
      content: [{
        type: "text" as const,
        text: `${landed}. Posting the progress comment to issue #${input.issue_number} failed (${msg}) — the commit is safe and does NOT need to be redone; retry just the comment with comment_issue.`,
      }],
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: idempotentRetry
        ? `Already committed and pushed as \`${commitHash}\` (idempotent retry) — refreshed issue #${input.issue_number}.`
        : `Committed \`${commitHash}\` and updated issue #${input.issue_number}.`,
    }],
  };
}
