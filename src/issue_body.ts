/**
 * Canonical issue-body param resolution (#282). `body` is the canonical name
 * (matching GitHub's own REST/GraphQL field and update_issue); `description` is
 * a deprecated alias kept for one release, per the #279 rename pattern. Pure —
 * no imports — so it is unit-testable.
 */
export type IssueBodyResolution =
  | { ok: true; body: string; deprecationWarning?: string }
  | { ok: false; error: string };

export function resolveIssueBody(
  args: { body?: string; description?: string },
  context: string
): IssueBodyResolution {
  if (args.body !== undefined && args.description !== undefined) {
    return {
      ok: false,
      error: `[okffs] ${context}: pass the issue body as \`body\` only — \`description\` is a deprecated alias and cannot be combined with it.`,
    };
  }
  if (args.body !== undefined) return { ok: true, body: args.body };
  if (args.description !== undefined) {
    return {
      ok: true,
      body: args.description,
      deprecationWarning: `[okffs] ${context}: \`description\` is deprecated — use \`body\`. The alias will be removed in a future release.`,
    };
  }
  return { ok: false, error: `[okffs] ${context}: an issue body is required — pass it as \`body\`.` };
}
