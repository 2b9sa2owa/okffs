import { test } from "node:test";
import assert from "node:assert/strict";
import { bumpVersion, isNewer, replaceExactly } from "./version.js";

test("bumpVersion bumps each level and resets the lower parts", () => {
  assert.equal(bumpVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(bumpVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(bumpVersion("1.2.3", "major"), "2.0.0");
  assert.equal(bumpVersion("0.9.9", "minor"), "0.10.0");
});

test("bumpVersion rejects a non-X.Y.Z version", () => {
  assert.throws(() => bumpVersion("1.2", "patch"), /Cannot parse/);
  assert.throws(() => bumpVersion("v1.2.3", "patch"), /Cannot parse/);
});

test("isNewer compares numerically, not lexically", () => {
  assert.equal(isNewer("0.10.0", "0.9.0"), true); // lexical compare would say false
  assert.equal(isNewer("0.9.0", "0.10.0"), false);
  assert.equal(isNewer("1.0.0", "0.99.99"), true);
  assert.equal(isNewer("0.11.1", "0.11.0"), true);
});

test("isNewer is strict — equal versions are not newer", () => {
  assert.equal(isNewer("1.2.3", "1.2.3"), false);
});

test("replaceExactly replaces exactly count occurrences", () => {
  assert.equal(replaceExactly("a b a b a", "a", "x", 2, "test"), "x b x b a");
});

test("replaceExactly throws when fewer occurrences exist than required", () => {
  assert.throws(() => replaceExactly("only one a here", "a", "x", 3, "package.json"), /package\.json/);
});
