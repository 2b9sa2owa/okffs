// Board Priority ordering (#259). Pure — no imports.

// Board Priority order (highest first); unknown named priorities rank between the
// known set and unset, so custom option names still sort ahead of no priority.
const PRIORITY_ORDER = ["Urgent", "High", "Medium", "Low"];

export function priorityRank(p?: string): number {
  if (!p) return 99;
  const i = PRIORITY_ORDER.indexOf(p);
  return i === -1 ? 50 : i;
}
