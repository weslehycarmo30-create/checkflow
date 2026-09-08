import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("SQL gate validates local Auth and Storage platform prerequisites before creating a gate database", () => {
  const source = readFileSync(new URL("../scripts/sql-local-gates.mjs", import.meta.url), "utf8");
  const capabilityCheck = source.indexOf("const platformCapabilities");
  const databaseCreation = source.indexOf("CREATE DATABASE ${database}");

  assert.ok(capabilityCheck >= 0, "platform capability check is required");
  assert.ok(databaseCreation >= 0, "isolated database creation is required");
  assert.ok(capabilityCheck < databaseCreation, "capabilities must be checked before creating a gate database");
  assert.match(source, /to_regclass\('auth\.users'\)/);
  assert.match(source, /to_regclass\('storage\.buckets'\)/);
  assert.match(source, /to_regclass\('storage\.objects'\)/);
  assert.match(source, /Local Supabase platform is incomplete/);
});
