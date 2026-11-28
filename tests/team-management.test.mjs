import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { memberActions, setMemberActive, setMemberRole } from "../lib/team-management.mjs";

const member = (role, active = true, user_id = "other") => ({ user_id, role, active });
const none = { changeRole: false, deactivate: false, reactivate: false, resend: false };

test("only the owner changes roles and access, never of an owner or of themselves", () => {
  assert.deepEqual(memberActions("owner", "me", member("collaborator")), { changeRole: true, deactivate: true, reactivate: false, resend: true });
  assert.deepEqual(memberActions("owner", "me", member("manager", false)), { ...none, reactivate: true });
  assert.deepEqual(memberActions("owner", "me", member("owner")), none);
  assert.deepEqual(memberActions("owner", "me", member("manager", true, "me")), none);
});

test("a manager may only resend an executor's invitation; an executor does nothing", () => {
  assert.deepEqual(memberActions("manager", "me", member("collaborator")), { ...none, resend: true });
  assert.deepEqual(memberActions("manager", "me", member("manager")), none);
  assert.deepEqual(memberActions("manager", "me", member("collaborator", false)), none);
  assert.deepEqual(memberActions("collaborator", "me", member("collaborator")), none);
});

function fakeClient(result) {
  const request = { filters: [] };
  const builder = {
    update(payload) { request.payload = payload; return builder; },
    eq(column, value) { request.filters.push(["eq", column, value]); return builder; },
    neq(column, value) { request.filters.push(["neq", column, value]); return builder; },
    select() { return builder; },
    maybeSingle: async () => result,
  };
  return { request, client: { from(table) { request.table = table; return builder; } } };
}

test("changes are scoped to one person of the current company and skip owners", async () => {
  const role = fakeClient({ data: { user_id: "u" }, error: null });
  await setMemberRole(role.client, "org-a", "u", "manager");
  assert.equal(role.request.table, "organization_members");
  assert.deepEqual(role.request.payload, { role: "manager" });
  assert.deepEqual(role.request.filters, [["eq", "organization_id", "org-a"], ["eq", "user_id", "u"], ["neq", "role", "owner"]]);
  const access = fakeClient({ data: { user_id: "u" }, error: null });
  await setMemberActive(access.client, "org-a", "u", false);
  assert.deepEqual(access.request.payload, { active: false });
});

test("ownership cannot be granted and a silent refusal is reported", async () => {
  await assert.rejects(setMemberRole(fakeClient({}).client, "org-a", "u", "owner"), /Papel inválido/);
  await assert.rejects(setMemberActive(fakeClient({ data: null, error: null }).client, "org-a", "u", false), /remover o acesso/);
  await assert.rejects(setMemberActive(fakeClient({ data: null, error: { message: "Esta pessoa já está vinculada a outra empresa" } }).client, "org-a", "u", true), /outra empresa/);
  await assert.rejects(setMemberRole(fakeClient({ data: null, error: { message: "boom" } }).client, "org-a", "u", "manager"), /mudar o papel/);
});

test("the team screen lists people without access and confirms before changing anyone", async () => {
  const screen = await readFile(new URL("../app/team-management.tsx", import.meta.url), "utf8");
  assert.match(screen, /select\("user_id,role,active,updated_at"\)/);
  assert.match(screen, /memberActions\(viewerRole, viewerId, member\)/);
  assert.match(screen, /const question[\s\S]{0,300}Remover o acesso[\s\S]{0,200}window\.confirm\(question\)/);
  assert.match(screen, /resend_user_id: member\.user_id/);
});
