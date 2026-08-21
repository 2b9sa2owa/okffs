import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickProjectItem,
  mapProjectFieldsByIssue,
  mapOrgIssueFieldValues,
  type IssueProjectItemsNode,
} from "./projects_transform.js";

const OUR_BOARD = "PVT_ours";
const FOREIGN_BOARD = "PVT_foreign";

// Shared fixture (#257): a shared org board means an issue's projectItems can
// carry items from OTHER repos' boards — and a foreign repo's issue #N can be on
// our numbering. The transforms must be repo/board-scoped by construction.
const item = (projectId: string, status?: string, priority?: string, effort?: string) => ({
  project: { id: projectId },
  status: status ? { name: status } : null,
  priority: priority ? { name: priority } : null,
  effort: effort ? { name: effort } : null,
});

const FIXTURE: IssueProjectItemsNode[] = [
  {
    // On both boards with CONFLICTING values — only ours may win.
    number: 7,
    projectItems: {
      nodes: [item(FOREIGN_BOARD, "Done", "Low"), item(OUR_BOARD, "In Progress", "High", "Medium")],
      pageInfo: { hasNextPage: false },
    },
  },
  {
    // Only on the foreign board — must not appear in the result at all.
    number: 8,
    projectItems: { nodes: [item(FOREIGN_BOARD, "Ready", "Urgent")], pageInfo: { hasNextPage: false } },
  },
  {
    // On our board with no field values set — nothing to report, omitted.
    number: 9,
    projectItems: { nodes: [item(OUR_BOARD)], pageInfo: { hasNextPage: false } },
  },
];

test("pickProjectItem selects the item on our board, or undefined (#257)", () => {
  const nodes = FIXTURE[0].projectItems.nodes;
  assert.equal(pickProjectItem(nodes, OUR_BOARD)?.status?.name, "In Progress");
  assert.equal(pickProjectItem(FIXTURE[1].projectItems.nodes, OUR_BOARD), undefined);
});

test("mapProjectFieldsByIssue never leaks a foreign board's item into the result (#257)", () => {
  const map = mapProjectFieldsByIssue(FIXTURE, OUR_BOARD, () => {});
  assert.deepEqual(map.get(7), { status: "In Progress", priority: "High", effort: "Medium" });
  assert.equal(map.has(8), false); // foreign-only issue excluded entirely
  assert.equal(map.has(9), false); // no field values → omitted
  assert.equal(map.size, 1);
});

test("mapProjectFieldsByIssue announces an unpaged >10-board issue via the warn callback", () => {
  const warnings: string[] = [];
  const issues: IssueProjectItemsNode[] = [
    { number: 5, projectItems: { nodes: [item(OUR_BOARD, "Ready")], pageInfo: { hasNextPage: true } } },
  ];
  const map = mapProjectFieldsByIssue(issues, OUR_BOARD, (m) => warnings.push(m));
  assert.equal(map.get(5)?.status, "Ready");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /#5.*more than 10 project boards/);
});

test("mapOrgIssueFieldValues keys by lowercased field name and skips valueless nodes", () => {
  const map = mapOrgIssueFieldValues([
    {
      number: 12,
      issueFieldValues: {
        nodes: [
          { __typename: "IssueFieldSingleSelectValue", name: "High", field: { name: "Priority" } },
          { __typename: "IssueFieldSingleSelectValue", name: "Medium", field: { name: "Effort" } },
          { __typename: "IssueFieldTextValue" }, // no name/field — ignored
        ],
      },
    },
    { number: 13, issueFieldValues: { nodes: [] } }, // no values → omitted
  ]);
  assert.deepEqual(map.get(12), new Map([["priority", "High"], ["effort", "Medium"]]));
  assert.equal(map.has(13), false);
});
