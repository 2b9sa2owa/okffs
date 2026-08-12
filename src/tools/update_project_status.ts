import { z } from "zod";
import { config } from "../config.js";
import { getProjectItemForIssue, getProjectMetadata, setProjectFieldValue } from "../projects.js";

export const name = "update_project_status";

export const description =
  "Move an issue between GitHub Project board columns: Backlog, Ready, In Progress, or Review. " +
  "Done is intentionally NOT settable here — it is owned by native GitHub board automation on PR merge / issue close. " +
  "Drive this conversationally during the dev workflow: after create_issue places an issue on the board, offer to move " +
  'it to "In Progress" when work starts, and to "Review" when a PR goes up. ' +
  "Requires OKFFS_PROJECT_ENABLED and the issue to already be on the board.";

const STATUSES = ["Backlog", "Ready", "In Progress", "Review"] as const;

export const inputSchema = z.object({
  // `issue_number` is the canonical name, matching every other issue-taking
  // tool (#278). `issue` — this tool's original name — stays as a deprecated
  // alias for one release so hosts with a cached schema don't hard-break.
  issue_number: z.number().int().positive().optional().describe("Issue number to move"),
  issue: z.number().int().positive().optional().describe("DEPRECATED alias for issue_number — use issue_number"),
  status: z
    .enum(STATUSES)
    .describe('Target column: "Backlog", "Ready", "In Progress", or "Review" (Done is owned by native automation)'),
});

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export async function handler(input: z.infer<typeof inputSchema>) {
  const issueNumber = input.issue_number ?? input.issue;
  if (!issueNumber) {
    return text("[okffs] update_project_status needs an issue_number (which issue to move).");
  }

  if (!config.projectEnabled) {
    return text("OKFFS_PROJECT_ENABLED is not set — project status updates are disabled.");
  }

  const itemId = await getProjectItemForIssue(issueNumber);
  if (!itemId) {
    return text(
      `Issue #${issueNumber} is not on the project board. Add it first (create_issue with ` +
        "OKFFS_PROJECT_AUTO_ADD=true, or add it to the board manually)."
    );
  }

  const meta = await getProjectMetadata();
  if (!meta.statusFieldId) {
    return text("The board has no Status field — cannot update the column.");
  }

  const optionId = meta.statusOptions.get(input.status);
  if (!optionId) {
    const opts = [...meta.statusOptions.keys()].join(", ") || "none";
    return text(`The board has no "${input.status}" column. Available columns: ${opts}.`);
  }

  await setProjectFieldValue(itemId, meta.statusFieldId, optionId);
  return text(`Issue #${issueNumber} moved to "${input.status}".`);
}
