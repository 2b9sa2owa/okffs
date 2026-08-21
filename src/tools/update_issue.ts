import { z } from "zod";
import { getIssue, updateIssue } from "../github.js";
import { extractIssueMetadata, mergeIssueMetadata } from "../issue_body.js";

export const name = "update_issue";

export const description =
  "Mutate the core fields of an EXISTING GitHub issue — title, assignees, labels, milestone, and/or body. " +
  "create_issue only sets these at creation time; this is how you change them afterward (e.g. rename an issue, " +
  "add or change an assignee) without dropping to raw `gh issue edit`. Authenticates with okffs's configured token " +
  "(GITHUB_TOKEN, or the gh CLI fallback when it's unset) and applies okffs conventions. Pass only the fields you " +
  "want to change — omitted fields are left untouched. NOTE: labels and assignees REPLACE the whole set (they do " +
  "not merge with the current values), so pass the complete desired list; an empty array [] clears them, and " +
  "milestone: null clears the milestone. A body rewrite automatically preserves okffs-owned metadata (the " +
  "**Branch:** line and the ## Relationships section) even when the new body omits them — pass " +
  "preserve_metadata: false for a genuine raw replace. For board Priority/Effort use set_issue_fields, and for " +
  "the board Status column use update_project_status — those are not issue fields.";

export const inputSchema = z.object({
  issue_number: z.number().int().positive().describe("The issue number to update"),
  title: z.string().optional().describe("New issue title"),
  body: z.string().optional().describe("New issue body. Replaces the existing body — pass the full content, not a fragment. okffs-owned metadata (the **Branch:** line, the ## Relationships section) is re-appended automatically if the new body omits it."),
  assignees: z.array(z.string()).optional().describe("GitHub usernames to assign. REPLACES the current assignees (not merged); [] clears them."),
  labels: z.array(z.string()).optional().describe("Labels to apply. REPLACES the current labels (not merged); [] clears them."),
  milestone: z.number().int().positive().nullable().optional().describe("Milestone number to assign, or null to clear the milestone."),
  preserve_metadata: z.boolean().optional().describe("Default true: a body rewrite keeps the okffs-owned **Branch:** line and ## Relationships section even when the new body omits them. Pass false only to deliberately wipe them (raw replace) — losing the **Branch:** line breaks commit_and_update / merge_pull_request / create_pull_request for the issue."),
});

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export async function handler(input: z.infer<typeof inputSchema>) {
  const { issue_number, preserve_metadata, ...fields } = input;

  // Require at least one field to change — mirrors set_issue_fields' guard so a
  // no-op call gives an actionable message instead of a silent PATCH.
  const provided = (["title", "body", "assignees", "labels", "milestone"] as const).filter(
    (k) => fields[k] !== undefined
  );
  if (provided.length === 0) {
    return text(
      "Nothing to update — pass at least one of: title, body, assignees, labels, milestone. " +
        "(For board Priority/Effort use set_issue_fields; for the Status column use update_project_status.)"
    );
  }

  // A body rewrite must not destroy okffs's own bookkeeping (#295): re-extract
  // the **Branch:** line and ## Relationships section from the current body and
  // re-append whichever ones the incoming body dropped.
  let preserved: string[] = [];
  if (fields.body !== undefined && preserve_metadata !== false) {
    let currentBody: string | null;
    try {
      currentBody = (await getIssue(issue_number)).body;
    } catch (err) {
      return text(
        `[okffs] Could not fetch issue #${issue_number} to preserve its okffs metadata (**Branch:** line, ## Relationships) — nothing was updated: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const merged = mergeIssueMetadata(fields.body, extractIssueMetadata(currentBody));
    fields.body = merged.body;
    preserved = merged.preserved;
  }

  let updated: Awaited<ReturnType<typeof updateIssue>>;
  try {
    updated = await updateIssue(issue_number, fields);
  } catch (err) {
    return text(`[okffs] Failed to update issue #${issue_number}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const lines = provided.map((k) => {
    if (k === "body") {
      if (preserved.length) return `  body → updated (preserved: ${preserved.join(", ")})`;
      return preserve_metadata === false ? "  body → replaced (preserve_metadata: false)" : "  body → updated";
    }
    const v = fields[k];
    const shown = Array.isArray(v)
      ? (v.length ? v.join(", ") : "(cleared)")
      : v === null ? "(cleared)" : String(v);
    return `  ${k} → ${shown}`;
  });

  return text(`Issue #${issue_number} updated:\n${lines.join("\n")}\n${updated.html_url}`);
}
