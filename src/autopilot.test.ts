import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAutopilotDecisions } from "./autopilot.js";

test("renderAutopilotDecisions renders a heading plus one bullet per decision", () => {
  const block = renderAutopilotDecisions(["chose squash — matches base tier", "kept default labels — none specified"]);
  assert.equal(
    block,
    "## 🤖 Autopilot decisions\n- chose squash — matches base tier\n- kept default labels — none specified"
  );
});

test("renderAutopilotDecisions strips a leading bullet the caller already added (#251)", () => {
  const block = renderAutopilotDecisions(["- chose X", "* chose Y", "• chose Z"]);
  assert.equal(block, "## 🤖 Autopilot decisions\n- chose X\n- chose Y\n- chose Z");
});

test("renderAutopilotDecisions returns null when there is nothing to report", () => {
  assert.equal(renderAutopilotDecisions(undefined), null);
  assert.equal(renderAutopilotDecisions(null), null);
  assert.equal(renderAutopilotDecisions([]), null);
  assert.equal(renderAutopilotDecisions(["   ", "\t"]), null);
});
