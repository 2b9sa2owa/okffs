// Semver helpers (#259). Pure — no imports — so unit-testable without touching
// the modules that consume them (prepare_release imports github.ts; server.ts
// pulls in the whole MCP server).

/** Bump a strict X.Y.Z version by the given level, resetting lower parts. */
export function bumpVersion(v: string, type: "patch" | "minor" | "major"): string {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Cannot parse current version "${v}".`);
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/** Whether version `a` is strictly newer than `b` (major.minor.patch, numeric). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

// Replace the first `count` occurrences of an exact substring. Throws if fewer
// than `count` occurrences exist — a partial version bump must never proceed.
export function replaceExactly(content: string, search: string, replace: string, count: number, label: string): string {
  const found = content.split(search).length - 1;
  if (found < count) {
    throw new Error(`Expected at least ${count} occurrence(s) of \`${search}\` in ${label} but found ${found}. Aborting to avoid an inconsistent version bump.`);
  }
  let out = content;
  let from = 0;
  for (let i = 0; i < count; i++) {
    const at = out.indexOf(search, from);
    out = out.slice(0, at) + replace + out.slice(at + search.length);
    from = at + replace.length;
  }
  return out;
}
