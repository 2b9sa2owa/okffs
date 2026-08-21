import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOwnerRepo } from "./remote.js";

test("parseOwnerRepo handles the https form", () => {
  assert.deepEqual(parseOwnerRepo("https://github.com/neturely/okffs"), { owner: "neturely", repo: "okffs" });
});

test("parseOwnerRepo handles the ssh form", () => {
  assert.deepEqual(parseOwnerRepo("git@github.com:neturely/okffs.git"), { owner: "neturely", repo: "okffs" });
});

test("parseOwnerRepo strips a .git suffix and a trailing slash", () => {
  assert.deepEqual(parseOwnerRepo("https://github.com/neturely/okffs.git"), { owner: "neturely", repo: "okffs" });
  assert.deepEqual(parseOwnerRepo("https://github.com/neturely/okffs/"), { owner: "neturely", repo: "okffs" });
});

test("parseOwnerRepo tolerates surrounding whitespace (raw command output)", () => {
  assert.deepEqual(parseOwnerRepo("  git@github.com:neturely/okffs.git\n"), { owner: "neturely", repo: "okffs" });
});

test("parseOwnerRepo returns null for a non-GitHub remote", () => {
  assert.equal(parseOwnerRepo("https://gitlab.com/owner/repo.git"), null);
  assert.equal(parseOwnerRepo(""), null);
});
