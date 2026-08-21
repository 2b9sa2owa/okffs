// Git-remote parsing (#259). Pure — no imports. Previously duplicated in
// github.ts and cli/probe.ts; this is the single shared copy.

/**
 * Parse owner/repo from a GitHub remote URL (https or ssh form). Tolerates a
 * `.git` suffix and a trailing slash.
 */
export function parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const m = remoteUrl.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}
