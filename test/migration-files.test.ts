import assert from "node:assert/strict";
import test from "node:test";
import { isMigrationFile } from "../server/db.js";

test("migration loader ignores macOS metadata and accepts numbered SQL files", () => {
  assert.equal(isMigrationFile("001_initial.sql"), true);
  assert.equal(isMigrationFile("12_add-index.sql"), true);
  assert.equal(isMigrationFile("._001_initial.sql"), false);
  assert.equal(isMigrationFile("README.sql"), false);
  assert.equal(isMigrationFile("001_initial.sqlx"), false);
});
