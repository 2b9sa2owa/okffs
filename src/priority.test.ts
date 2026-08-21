import { test } from "node:test";
import assert from "node:assert/strict";
import { priorityRank } from "./priority.js";

test("priorityRank orders Urgent → High → Medium → Low", () => {
  const ranks = ["Urgent", "High", "Medium", "Low"].map((p) => priorityRank(p));
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks);
});

test("priorityRank puts unknown named priorities between the known set and unset", () => {
  assert.ok(priorityRank("Low") < priorityRank("Sev-0"));
  assert.ok(priorityRank("Sev-0") < priorityRank(undefined));
});
