import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canManageUnits,
  createCurrentOrganizationUnit,
  deactivateCurrentOrganizationUnit,
  listCurrentOrganizationUnits,
} from "../lib/unit-management.mjs";

const baseMigration = await readFile(new URL("../supabase/migrations/202607220001_base_multitenant.sql", import.meta.url), "utf8");
const hardeningMigration = await readFile(new URL("../supabase/migrations/202607230002_hardening_rls_mvp.sql", import.meta.url), "utf8");
const snapshotMigration = await readFile(new URL("../supabase/migrations/202608260002_execution_historical_snapshot.sql", import.meta.url), "utf8");
const assignmentScreen = await readFile(new URL("../app/checklists/[id]/checklist-detail.tsx", import.meta.url), "utf8");
const teamScreen = await readFile(new URL("../app/team-management.tsx", import.meta.url), "utf8");

function fakeClient({ role = "owner", organizationId = "org-a", userId = "user-a", units = [] } = {}) {
  const requests = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table) {
      const request = { table, action: "select", filters: [], payload: null };
      requests.push(request);
      const builder = {
        select(columns) { request.columns = columns; return builder; },
        eq(column, value) { request.filters.push([column, value]); return builder; },
        limit(value) { request.limit = value; return builder; },
        order(column, options) {
          request.order = [column, options];
          const organizationFilter = request.filters.find(([field]) => field === "organization_id")?.[1];
          const visibleUnits = units.filter(unit => !organizationFilter || unit.organization_id === organizationFilter);
          return Promise.resolve(table === "units" ? { data: visibleUnits, error: null } : { data: [], error: null });
        },
        maybeSingle() {
          if (table === "organization_members") {
            const requestedOrganization = request.filters.find(([field]) => field === "organization_id")?.[1];
            return Promise.resolve({
              data: requestedOrganization === organizationId ? { organization_id: organizationId, role } : null,
              error: null,
            });
          }
          if (request.action === "update") return Promise.resolve({ data: { id: "unit-a" }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        insert(payload) { request.action = "insert"; request.payload = payload; return builder; },
        update(payload) { request.action = "update"; request.payload = payload; return builder; },
        single() { return Promise.resolve({ data: { id: "unit-new", ...request.payload }, error: null }); },
      };
      return builder;
    },
  };
  return { client, requests };
}

test("unit mutations recognize only owner and manager as managers", () => {
  assert.equal(canManageUnits("owner"), true);
  assert.equal(canManageUnits("manager"), true);
  assert.equal(canManageUnits("collaborator"), false);
  assert.equal(canManageUnits(""), false);
});

test("owner creates a normalized unit in the authenticated membership organization", async () => {
  const { client, requests } = fakeClient({ role: "owner", organizationId: "org-a", userId: "owner-a" });
  await createCurrentOrganizationUnit(client, "org-a", { name: "  Loja Centro  ", address: "  Rua Um  " });
  const insert = requests.find(request => request.table === "units");
  assert.equal(insert.action, "insert");
  assert.deepEqual(insert.payload, {
    organization_id: "org-a",
    created_by: "owner-a",
    name: "Loja Centro",
    address: "Rua Um",
    active: true,
  });
});

test("manager can create a unit and omitted address is stored as null", async () => {
  const { client, requests } = fakeClient({ role: "manager" });
  await createCurrentOrganizationUnit(client, "org-a", { name: "Unidade 1" });
  const insert = requests.find(request => request.table === "units");
  assert.equal(insert.payload.organization_id, "org-a");
  assert.equal(insert.payload.address, null);
});

test("collaborator cannot create or deactivate units, even by calling the data layer directly", async () => {
  const { client, requests } = fakeClient({ role: "collaborator" });
  await assert.rejects(createCurrentOrganizationUnit(client, "org-a", { name: "Sem permissão" }), /não tem permissão/i);
  await assert.rejects(deactivateCurrentOrganizationUnit(client, "org-a", "unit-a"), /não tem permissão/i);
  assert.equal(requests.some(request => request.table === "units"), false);
});

test("unit reads and writes are scoped to the authenticated user's organization", async () => {
  const { client, requests } = fakeClient({
    role: "owner",
    organizationId: "org-a",
    units: [
      { id: "unit-a", organization_id: "org-a", name: "A", active: true },
      { id: "unit-b", organization_id: "org-b", name: "B", active: true },
    ],
  });
  const visible = await listCurrentOrganizationUnits(client, "org-a");
  await createCurrentOrganizationUnit(client, "org-a", { name: "Loja A" });
  assert.deepEqual(visible.map(unit => unit.id), ["unit-a"]);
  const unitRequests = requests.filter(request => request.table === "units");
  assert.equal(unitRequests.length, 2);
  assert.ok(unitRequests[0].filters.some(([column, value]) => column === "organization_id" && value === "org-a"));
  assert.equal(unitRequests[1].payload.organization_id, "org-a");
});

test("a client-supplied organization context is rejected unless it is an active membership", async () => {
  const { client, requests } = fakeClient({ role: "owner", organizationId: "org-a" });
  await assert.rejects(listCurrentOrganizationUnits(client, "org-b"), /confirmar sua organização/i);
  await assert.rejects(createCurrentOrganizationUnit(client, "org-b", { name: "Não deve criar" }), /confirmar sua organização/i);
  assert.equal(requests.some(request => request.table === "units"), false);
});

test("deactivation is a soft update scoped by unit, organization, and active state", async () => {
  const { client, requests } = fakeClient({ role: "manager", organizationId: "org-a" });
  await deactivateCurrentOrganizationUnit(client, "org-a", "unit-a");
  const update = requests.find(request => request.table === "units");
  assert.equal(update.action, "update");
  assert.deepEqual(update.payload, { active: false });
  assert.ok(update.filters.some(([column, value]) => column === "id" && value === "unit-a"));
  assert.ok(update.filters.some(([column, value]) => column === "organization_id" && value === "org-a"));
  assert.ok(update.filters.some(([column, value]) => column === "active" && value === true));
  assert.doesNotMatch(teamScreen, /\.from\("units"\)\.delete/);
  assert.match(teamScreen, /unitActionInFlight\.current/);
});

test("unit UI requires a name, supports optional address, confirms deactivation, and keeps collaborator read-only", () => {
  assert.match(teamScreen, /Nome da unidade<input required/);
  assert.match(teamScreen, /Endereço <small>Opcional<\/small>/);
  assert.match(teamScreen, /window\.confirm\(/);
  assert.match(teamScreen, /canManage \? <form className="unit-form"/);
  assert.match(teamScreen, /Visualização somente leitura/);
  assert.match(teamScreen, /type="submit" disabled=\{unitBusy/);
});

test("inactive units leave new assignment choices but remain named in existing assignment and history views", () => {
  assert.match(assignmentScreen, /from\("units"\)\.select\("id,name,active"\)\.eq\("organization_id", current\.organization_id\)\.order\("name"\)/);
  assert.match(assignmentScreen, /const unitNames = new Map\(loadedUnits\.map\(unit => \[unit\.id, unit\.name\]\)\)/);
  assert.match(assignmentScreen, /setUnits\(loadedUnits\.filter\(unit => unit\.active\)\)/);
  assert.match(baseMigration, /unit_id uuid references public\.units\(id\)/);
  assert.match(snapshotMigration, /'unit_id', assignment_row\.unit_id/);
  assert.match(snapshotMigration, /from public\.units unit[\s\S]*?unit\.id = execution_row\.unit_id and unit\.organization_id = execution_row\.organization_id/);
});

test("versioned RLS allows unit reads to organization members and writes only to owner or manager", () => {
  assert.match(baseMigration, /array\['organization_members','units','teams'/);
  assert.match(baseMigration, /create policy org_member_select on public\.%I for select using\(public\.is_org_member\(organization_id\)\)/);
  assert.match(baseMigration, /public\.has_org_role\(organization_id,array\[''owner'',''manager''\]::public\.member_role\[\]\)/);
  assert.doesNotMatch(hardeningMigration, /collaborator_unit_write|collaborator_units_write/);
});
