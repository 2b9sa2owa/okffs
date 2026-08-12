import { z } from "zod";
import { addIssueComment, upsertIssueCommentByMarker, owner, repo } from "../github.js";

export const name = "comment_issue";

export const description =
  "Post a comment to a GitHub issue. Use after committing to a working branch to log what was done. " +
  "Pass a marker to UPSERT instead: the comment carrying that hidden marker is edited in place, or created if absent — " +
  "use for a single running status comment per issue rather than an append-only thread.";

// The marker is embedded inside an HTML comment; restrict its charset so it
// can't break out of the tag (e.g. a "-->" inside the marker).
const MARKER_RE = /^[A-Za-z0-9._-]+$/;

export const inputSchema = z.object({
  issue_number: z.number().int().positive(),
  comment: z.string().describe("Comment body to post to the issue"),
  marker: z
    .string()
    .optional()
    .describe(
      "Optional upsert key (letters, digits, dot, dash, underscore). When set, the existing comment carrying this marker is edited in place instead of appending; created if none exists."
    ),
});

export async function handler(input: z.infer<typeof inputSchema>) {
  // Note: commenting intentionally does not trigger CHANGELOG updates — it is
  // too frequent to be a meaningful changelog event. create_pull_request is the
  // single source of auto-changelog entries.
  if (input.marker !== undefined) {
    if (!MARKER_RE.test(input.marker)) {
      return {
        content: [{
          type: "text" as const,
          text: `[okffs] comment_issue: invalid marker "${input.marker}" — use only letters, digits, ".", "-", "_".`,
        }],
      };
    }
    const res = await upsertIssueCommentByMarker(input.issue_number, input.marker, input.comment);
    return {
      content: [{
        type: "text" as const,
        text: `Comment ${res.action} on issue #${input.issue_number} (marker \`${input.marker}\`).\n${res.url}`,
      }],
    };
  }

  await addIssueComment(input.issue_number, input.comment);

  return {
    content: [
      {
        type: "text" as const,
        text: `Comment posted to issue #${input.issue_number}.\nhttps://github.com/${owner}/${repo}/issues/${input.issue_number}`,
      },
    ],
  };
}
