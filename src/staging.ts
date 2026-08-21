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
 * Template/sample files (basename ending .example / .sample / .template, e.g.
 * this repo's own .env.example) are exempt — they document config, they don't
 * hold it (PR #289 review).
 *
 * Returns the subset of `files` that match.
 */
const TEMPLATE_SUFFIXES = [".example", ".sample", ".template"];

export function matchSecretPaths(files: string[]): string[] {
  return files.filter((file) => {
    const base = (file.split("/").pop() ?? file).toLowerCase();
    if (TEMPLATE_SUFFIXES.some((s) => base.endsWith(s))) return false;
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

const SUBJECT_MAX = 72;

/**
 * Split a free-text commit message into a git subject + optional body.
 * (Moved here from commit_and_update.ts in #259 so it's unit-testable.)
 *
 * - Subject: the first **non-blank** line, truncated to ~72 chars at a **word
 *   boundary** (never mid-word) — a single unbreakable word longer than the
 *   limit is the only case that gets a hard cut. Leading blank lines are skipped
 *   so a message like "\nAdd X" doesn't produce an empty subject (#236).
 * - Body: any lines after the subject line, plus whatever overflowed past the
 *   subject, joined as blank-line-separated paragraphs. `undefined` when the
 *   message fits entirely in the subject, so a short single-line message behaves
 *   exactly as before (subject only). (#228)
 *
 * A whitespace-only message has no usable subject line and returns
 * `{ subject: "" }` — the handler guards against that by treating a blank
 * message as absent (#236).
 */
export function splitCommitMessage(message: string): { subject: string; body?: string } {
  const lines = message.split("\n");
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
