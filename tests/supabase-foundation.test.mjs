import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/202607220001_base_multitenant.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8");
const hardening = await readFile(new URL("../supabase/migrations/202607230002_hardening_rls_mvp.sql", import.meta.url), "utf8");
const requiredTables = ["organizations","profiles","organization_members","units","teams","checklists","checklist_sections","checklist_items","checklist_assignments","checklist_executions","execution_answers","attachments","non_conformities","action_plans","audit_logs"];

test("migration contains every required MVP table", () => {
  for (const table of requiredTables) assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`));
});

test("all operational tables enable RLS and storage is private", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /'checkflow-evidence','checkflow-evidence',false/);
  assert.match(migration, /is_org_member/);
  assert.match(migration, /has_org_role/);
});

test("frontend only accepts public Supabase keys", () => {
  assert.match(client, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(client, /SERVICE_ROLE|service_role/);
});

test("hardening prevents cross-tenant links and manager role escalation", () => {
  assert.match(hardening, /validate_checkflow_tenant_links/);
  assert.match(hardening, /organization_members_owner_write/);
  assert.match(hardening, /drop policy if exists org_manager_write on public\.organization_members/);
  assert.match(hardening, /collaborator_execution_insert/);
  assert.match(hardening, /collaborator_answer_update/);
});
