import assert from "node:assert/strict";
import { test } from "node:test";
import { isMigrationFile, migrationName, pendingMigrations } from "./migration-plan.mjs";

test("migration keys use the basename", () => {
  assert.equal(migrationName("/migrations/0002_supportpilot.sql"), "0002_supportpilot.sql");
});

test("already-applied migrations do not run again", () => {
  assert.deepEqual(
    pendingMigrations(["/migrations/0002_supportpilot.sql"], ["0002_supportpilot.sql"]),
    [],
  );
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-SQL entries are ignored", () => {
  assert.equal(isMigrationFile("README.md"), false);
  assert.deepEqual(pendingMigrations(["README.md", "nested"], []), []);
});
