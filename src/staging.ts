/**
 * Pure staging-safety helpers for commit_and_update (#265). Kept free of git/
 * GitHub imports so they can be unit-tested — github.ts resolves its token and
 * repo at import time and cannot be imported in tests (see src/github_errors.ts
 * for the same pattern).
 */

/**
 * Secrets deny-list applied at the tool boundary, GitHub-push-protection style:
 * filenames that overwhelmingly indicate credentials are refused even when not
 * gitignored. Matched case-insensitively against the basename:
 *
 *   .env*  *.env  *.pem  *.key  id_rsa*  *credentials*  *.p12  *.pfx
 *
 * Returns the subset of `files` that match.
 */
export function matchSecretPaths(files: string[]): string[] {
  return files.filter((file) => {
    const base = (file.split("/").pop() ?? file).toLowerCase();
    return (
      base.startsWith(".env") ||
      base.endsWith(".env") ||
      base.endsWith(".pem") ||
      base.endsWith(".key") ||
      base.startsWith("id_rsa") ||
      base.includes("credentials") ||
      base.endsWith(".p12") ||
      base.endsWith(".pfx")
    );
  });
}

/**
 * Auto-generated commit message that never truncates the file list mid-name
 * (#265 — the old `chore: update <files>.slice(0, 60)` cut filenames in half,
 * which is how swept secret files stayed invisible). A short list is inlined in
 * the subject; a long one falls back to a count with the full list in the body.
 */
export function buildAutoCommitMessage(
  files: string[],
  subjectMax = 72
): { subject: string; body?: string } {
  const inline = `chore: update ${files.join(", ")}`;
  if (inline.length <= subjectMax) return { subject: inline };
  return {
    subject: `chore: update ${files.length} files`,
    body: files.map((f) => `- ${f}`).join("\n"),
  };
}
