import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const baseMigration = await readFile(new URL("../supabase/migrations/202607220001_base_multitenant.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202609280001_organization_company_details.sql", import.meta.url), "utf8");

test("company details use additive organization columns and preserve owner-only RLS", () => {
  for (const column of ["commercial_email", "whatsapp", "instagram", "phone", "address"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column} text`));
  }
  assert.match(baseMigration, /organizations_member_select[\s\S]*?for select using\(public\.is_org_member\(id\)\)/);
  assert.match(baseMigration, /organizations_owner_update[\s\S]*?for update using\(public\.has_org_role\(id,array\['owner'\]::public\.member_role\[\]\)\) with check\(public\.has_org_role\(id,array\['owner'\]::public\.member_role\[\]\)\)/);
});

test("settings loads, validates, and saves only the current organization for owners", () => {
  assert.match(dashboard, /select\("name,commercial_email,whatsapp,instagram,phone,address"\)\.eq\("id", membership\.organization_id\)/);
  assert.match(dashboard, /const canEdit=viewerRole==="owner"/);
  assert.match(dashboard, /if\(!normalized\.name\)/);
  assert.match(dashboard, /Informe um e-mail comercial válido/);
  assert.match(dashboard, /\.update\(normalized\)\.eq\("id",organizationId\)\.select\("name,commercial_email,whatsapp,instagram,phone,address"\)\.single\(\)/);
  assert.match(dashboard, /phone:form\.phone\.trim\(\),address:form\.address\.trim\(\)/);
});

test("settings is read-only for managers and collaborators without placeholder content", () => {
  assert.match(dashboard, /readOnly=\{!canEdit\}/);
  assert.match(dashboard, /!canEdit&&<p className="organization-readonly"/);
  assert.match(dashboard, /canEdit&&<button className="primary" type="submit"/);
  assert.match(dashboard, /section==="Configurações"&&<OrganizationSettings/);
  assert.doesNotMatch(dashboard.match(/function OrganizationSettings[\s\S]*?function Generic/)?.[0] ?? "", /Homologação pendente|não foi homologada/);
});
