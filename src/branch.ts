// Branch-name construction and branch-state predicates (#259). Pure over
// inputs (config only supplies the default identifier), so unit-testable
// without importing github.ts (which resolves token/repo at import time).

import { config } from "./config.js";

/** Title → kebab slug: lowercase, strip punctuation, cap at 5 words. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("-");
}

/**
 * Build the branch name for an issue.
 * Format: {issue-number}-{slug}, or {issue-number}-{identifier}-{slug}
 * when a project identifier is configured (OKFFS_IDENTIFIER).
 */
export function buildBranchName(
  issueNumber: number,
  title: string,
  identifier: string | null | undefined = config.identifier
): string {
  const slug = slugify(title);
  const idSlug = identifier ? slugify(identifier) : "";
  return idSlug ? `${issueNumber}-${idSlug}-${slug}` : `${issueNumber}-${slug}`;
}

// A branch is "untouched" when it carries no real work — either no commits ahead
// of base, or only okffs's empty init commit (create_issue under OKFFS_AUTO_PR
// pushes `chore: init branch for #N` so the branch diverges enough to open a
// draft PR). Any other commit means real work, so it must not be cleaned up.
const INIT_COMMIT_RE = /^chore: init branch for #\d+/;

export function isUntouchedBranch(commits: Array<{ commit: { message: string } }>): boolean {
  return commits.every((c) => INIT_COMMIT_RE.test(c.commit.message));
}
