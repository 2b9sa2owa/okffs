import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv, serializeEnv, type Collected } from "./env.js";

// parseEnv reads a file, so these tests round-trip through a temp .env — the
// quoting/migration/idempotency logic itself is pure string work (#259).

function withEnvFile(contents: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "okffs-env-test-"));
  const path = join(dir, ".env");
  try {
    writeFileSync(path, contents, "utf8");
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("parseEnv of a missing file reports exists: false", () => {
  const parsed = parseEnv(join(tmpdir(), "okffs-env-test-does-not-exist", ".env"));
  assert.equal(parsed.exists, false);
  assert.deepEqual(parsed.values, {});
});

test("parseEnv migrates okffs vars out of user content and keeps the rest verbatim", () => {
  withEnvFile("# my own note\nMY_VAR=1\nOKFFS_BASE_BRANCH=develop\n", (path) => {
    const parsed = parseEnv(path);
    assert.equal(parsed.values.OKFFS_BASE_BRANCH, "develop");
    assert.ok(parsed.known.has("OKFFS_BASE_BRANCH"));
    assert.match(parsed.preamble, /# my own note/);
    assert.match(parsed.preamble, /MY_VAR=1/);
    assert.ok(!parsed.preamble.includes("OKFFS_BASE_BRANCH"), "okffs var migrated out of the preamble");
  });
});

test("parseEnv counts a declined `# KEY=` placeholder as known but unset", () => {
  withEnvFile("# OKFFS_IDENTIFIER=\n", (path) => {
    const parsed = parseEnv(path);
    assert.ok(parsed.known.has("OKFFS_IDENTIFIER"));
    assert.equal(parsed.values.OKFFS_IDENTIFIER, undefined);
  });
});

test("parseEnv unquotes values; first occurrence wins (dotenv semantics)", () => {
  withEnvFile('OKFFS_DEFAULT_LABELS="a, b"\nOKFFS_DEFAULT_LABELS=second\n', (path) => {
    const parsed = parseEnv(path);
    assert.equal(parsed.values.OKFFS_DEFAULT_LABELS, "a, b");
  });
});

test("serializeEnv → parseEnv round-trips values, declines, and the version stamp", () => {
  const collected: Collected = {
    GITHUB_TOKEN: { state: "set", value: "ghp_test" },
    OKFFS_BASE_BRANCH: { state: "set", value: "develop" },
    OKFFS_IDENTIFIER: { state: "declined", value: "" },
    OKFFS_DEFAULT_LABELS: { state: "set", value: "okffs, needs triage" }, // needs quoting
  };
  const out = serializeEnv(collected, "# user preamble\nMY_VAR=1", "# user postamble", "0.12.0");
  withEnvFile(out, (path) => {
    const parsed = parseEnv(path);
    assert.equal(parsed.values.GITHUB_TOKEN, "ghp_test");
    assert.equal(parsed.values.OKFFS_BASE_BRANCH, "develop");
    assert.equal(parsed.values.OKFFS_DEFAULT_LABELS, "okffs, needs triage"); // quoted then unquoted
    assert.ok(parsed.known.has("OKFFS_IDENTIFIER")); // declined placeholder survives
    assert.equal(parsed.values.OKFFS_IDENTIFIER, undefined);
    assert.equal(parsed.configuredVersion, "0.12.0");
    assert.match(parsed.preamble, /MY_VAR=1/);
    assert.match(parsed.postamble, /user postamble/);
  });
});

test("serializeEnv regeneration is idempotent — the file must not grow on re-runs", () => {
  const collected: Collected = { OKFFS_BASE_BRANCH: { state: "set", value: "develop" } };
  const first = serializeEnv(collected, "# mine", "", "0.12.0");
  withEnvFile(first, (path) => {
    const parsed = parseEnv(path);
    const second = serializeEnv(collected, parsed.preamble, parsed.postamble, "0.12.0");
    assert.equal(second, first);
  });
});
