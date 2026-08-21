/**
 * Canonical issue-body param resolution (#282). `body` is the canonical name
 * (matching GitHub's own REST/GraphQL field and update_issue). The `description`
 * alias shipped in 0.11.0 as a one-release deprecation and was removed in #297.
 * Pure — no imports — so it is unit-testable.
 */
export type IssueBodyResolution =
  | { ok: true; body: string }
  | { ok: false; error: string };

export function resolveIssueBody(
  args: { body?: string },
  context: string
): IssueBodyResolution {
  if (args.body !== undefined) return { ok: true, body: args.body };
  return {
    ok: false,
    error: `[okffs] ${context}: an issue body is required — pass it as \`body\`. (The old \`description\` alias was removed in 0.12.0.)`,
  };
}

// ── okffs-owned issue-body metadata (#295) ──────────────────────────────────
// okffs writes two blocks into issue bodies that callers never author and must
// not lose on a body rewrite: the "**Branch:** `{name}`" line (create_issue &
// friends) and the "## Relationships" section (link_issues). Pure — no imports
// — so extract/merge are unit-testable without touching github.ts.

// Anchored to a line start so a body that merely *quotes* the pattern mid-line
// (e.g. issue #295 itself quoting "**Branch:** `{branch}`" in prose) is not
// mistaken for the real metadata line.
const BRANCH_LINE_RE = /^\*\*Branch:\*\*[ \t]+`([^`\n]+)`[ \t]*$/m;

export function extractBranchFromBody(body: string | null): string | null {
  if (!body) return null;
  const match = body.match(BRANCH_LINE_RE);
  return match ? match[1] : null;
}

export interface IssueBodyMetadata {
  branchLine: string | null; // the full "**Branch:** `{name}`" line
  relationshipsSection: string | null; // the full "## Relationships" section, heading included
}

export function extractIssueMetadata(body: string | null): IssueBodyMetadata {
  const result: IssueBodyMetadata = { branchLine: null, relationshipsSection: null };
  if (!body) return result;

  const branchMatch = body.match(BRANCH_LINE_RE);
  if (branchMatch) result.branchLine = branchMatch[0].trimEnd();

  const relMatch = body.match(/^## Relationships[ \t]*$/m);
  if (relMatch && relMatch.index !== undefined) {
    let section = body.slice(relMatch.index);
    // The section runs until the next "## " heading (or a **Branch:** line,
    // which create_issue may have appended after it) — or the end of the body.
    const end = section.slice("## Relationships".length).search(/\n## |\n\*\*Branch:\*\*[ \t]+`/);
    if (end !== -1) section = section.slice(0, "## Relationships".length + end);
    result.relationshipsSection = section.trimEnd();
  }

  return result;
}

// Re-append okffs-owned metadata blocks that the new body dropped. A block the
// new body already carries (even modified — e.g. a caller-supplied Branch line
// pointing elsewhere) is left alone, so no duplicates. Returns the merged body
// plus human-readable labels of what was re-appended.
export function mergeIssueMetadata(
  newBody: string,
  metadata: IssueBodyMetadata
): { body: string; preserved: string[] } {
  let body = newBody;
  const preserved: string[] = [];

  if (metadata.branchLine && !BRANCH_LINE_RE.test(body)) {
    body = `${body.trimEnd()}\n\n${metadata.branchLine}`;
    preserved.push("**Branch:** line");
  }
  if (metadata.relationshipsSection && !/^## Relationships[ \t]*$/m.test(body)) {
    body = `${body.trimEnd()}\n\n${metadata.relationshipsSection}`;
    preserved.push("## Relationships");
  }

  return { body, preserved };
}
