import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSecretPaths, buildAutoCommitMessage } from "./staging.js";

test("matchSecretPaths catches the exact filenames from the felix incident (#265)", () => {
  const files = ["src/main.py", ".env.bak-169-creds", ".env.pre-okffs220.bak", "CLAUDE.md"];
  assert.deepEqual(matchSecretPaths(files), [".env.bak-169-creds", ".env.pre-okffs220.bak"]);
});

test("matchSecretPaths matches each deny-list pattern", () => {
  const hits = [
    ".env",
    ".env.local",
    "config/production.env",
    "certs/server.pem",
    "keys/signing.key",
    "id_rsa",
    "id_rsa.pub",
    "aws-credentials.json",
    "store.p12",
    "cert.pfx",
  ];
  assert.deepEqual(matchSecretPaths(hits), hits);
});

test("matchSecretPaths is case-insensitive on the basename", () => {
  assert.deepEqual(matchSecretPaths(["Certs/Server.PEM", "My-Credentials.txt"]), [
    "Certs/Server.PEM",
    "My-Credentials.txt",
  ]);
});

test("matchSecretPaths leaves ordinary files alone", () => {
  assert.deepEqual(
    matchSecretPaths(["src/github.ts", "README.md", "environment.md", "keyboard.ts", "envelope.txt"]),
    []
  );
});

test("buildAutoCommitMessage inlines a short file list in the subject", () => {
  assert.deepEqual(buildAutoCommitMessage(["a.ts", "b.ts"]), {
    subject: "chore: update a.ts, b.ts",
  });
});

test("buildAutoCommitMessage never truncates — long lists fall back to a count plus full body", () => {
  const files = [
    "CLAUDE.md",
    "mcp/server.py",
    "scripts/export.py",
    "src/main.py",
    "src/very/long/path/module.py",
    ".env.pre-okffs220.bak",
  ];
  const msg = buildAutoCommitMessage(files);
  assert.equal(msg.subject, "chore: update 6 files");
  for (const f of files) {
    assert.ok(msg.body?.includes(f), `body must list ${f} untruncated`);
  }
});
