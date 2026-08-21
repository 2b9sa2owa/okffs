// Pure GraphQL-payload → map transforms for the Projects v2 layer (#259).
// Extracted from projects.ts (which imports github.ts and can't be loaded in
// tests) so the repo-scoping shape from #257 — a shared org board's foreign
// items must never leak into a repo-scoped result — is provable by fixture.

export interface ProjectItemFields {
  status?: string;
  priority?: string; // project-native fields only (org Issue Fields aren't exposed
  effort?: string;   // on the project item — see mapOrgIssueFieldValues)
}

export interface ProjectItemNode {
  project: { id: string };
  status: { name?: string } | null;
  priority: { name?: string } | null;
  effort: { name?: string } | null;
}

export interface IssueProjectItemsNode {
  number: number;
  projectItems: {
    nodes: ProjectItemNode[];
    pageInfo: { hasNextPage: boolean };
  };
}

/** Of an issue's project items, the one on OUR board — or undefined (#257). */
export function pickProjectItem<T extends { project: { id: string } }>(
  nodes: T[],
  projectId: string
): T | undefined {
  return nodes.find((n) => n.project.id === projectId);
}

/**
 * Issue number → board Status / project-native Priority / Effort, keeping only
 * each issue's item on the given board — an item from any other project (e.g.
 * another repo's board sharing the org) never enters the result (#257).
 */
export function mapProjectFieldsByIssue(
  issues: IssueProjectItemsNode[],
  projectId: string,
  warn: (msg: string) => void = console.warn
): Map<number, ProjectItemFields> {
  const result = new Map<number, ProjectItemFields>();
  for (const issue of issues) {
    // Unrealistic (an issue on >10 boards), but announce it rather than silently
    // dropping the board we didn't page to.
    if (issue.projectItems.pageInfo.hasNextPage) {
      warn(
        `[okffs] Issue #${issue.number} is on more than 10 project boards; ` +
          "only the first 10 were checked for board fields."
      );
    }
    const item = pickProjectItem(issue.projectItems.nodes, projectId);
    if (!item) continue;
    const fields: ProjectItemFields = {};
    if (item.status?.name) fields.status = item.status.name;
    if (item.priority?.name) fields.priority = item.priority.name;
    if (item.effort?.name) fields.effort = item.effort.name;
    if (fields.status || fields.priority || fields.effort) result.set(issue.number, fields);
  }
  return result;
}

export interface IssueFieldValuesNode {
  number: number;
  issueFieldValues: {
    nodes: Array<{
      __typename?: string;
      name?: string;
      field?: { name?: string };
    }>;
  };
}

/**
 * Issue number → lowercased org Issue Field name → value (e.g. "priority" →
 * "High"). Repo-scoped by construction — the query walks repository.issues, not
 * the board — which is the same no-foreign-leakage principle as
 * mapProjectFieldsByIssue, via a different mechanism (no project.id filter
 * exists on issueFieldValues).
 */
export function mapOrgIssueFieldValues(
  issues: IssueFieldValuesNode[]
): Map<number, Map<string, string>> {
  const result = new Map<number, Map<string, string>>();
  for (const issue of issues) {
    const values = new Map<string, string>();
    for (const v of issue.issueFieldValues.nodes) {
      const fname = v.field?.name;
      if (fname && v.name) values.set(fname.toLowerCase(), v.name);
    }
    if (values.size) result.set(issue.number, values);
  }
  return result;
}
