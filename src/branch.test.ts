import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, buildBranchName, isUntouchedBranch } from "./branch.js";

// config.identifier may be set by the repo's own .env, so every buildBranchName
// call passes the identifier explicitly rather than relying on the default.

test("slugify lowercases, strips punctuation, and caps at 5 words", () => {
  assert.equal(slugify("Add hero section to the homepage!"), "add-hero-section-to-the");
  assert.equal(slugify("Fix: crash on load"), "fix-crash-on-load");
  assert.equal(slugify("UPPER Case Title"), "upper-case-title");
});

test("slugify keeps hyphens and collapses whitespace", () => {
  assert.equal(slugify("re-use  the   helper"), "re-use-the-helper");
});

test("slugify of punctuation-only input is empty", () => {
  assert.equal(slugify("!!! ???"), "");
});

test("buildBranchName without an identifier", () => {
  assert.equal(buildBranchName(42, "Add hero section to homepage", null), "42-add-hero-section-to-homepage");
});

test("buildBranchName slugifies the identifier too", () => {
  assert.equal(buildBranchName(42, "Add hero section", "My App"), "42-my-app-add-hero-section");
});

test("isUntouchedBranch: only init commits (or none) count as untouched", () => {
  const init = { commit: { message: "chore: init branch for #42" } };
  const work = { commit: { message: "fix: the actual bug" } };
  assert.equal(isUntouchedBranch([]), true);
  assert.equal(isUntouchedBranch([init]), true);
  assert.equal(isUntouchedBranch([init, work]), false);
  assert.equal(isUntouchedBranch([work]), false);
});
