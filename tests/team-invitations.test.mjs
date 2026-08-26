import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("team-invitation-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

function env() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-key",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

async function withFetchMock(mock, action) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await action(); } finally { globalThis.fetch = originalFetch; }
}

test("owner invitation derives the organization server-side and can create a manager", { concurrency: false }, async () => {
  const calls = [];
  const worker = await loadWorker();
  const response = await withFetchMock(async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "owner-a" });
    if (url.pathname === "/rest/v1/organization_members" && init.method !== "POST") {
      return Response.json([{ organization_id: "org-a", role: "owner" }]);
    }
    if (url.pathname === "/auth/v1/invite") return Response.json({ user: { id: "new-manager" } });
    if (url.pathname === "/rest/v1/organization_members" && init.method === "POST") return new Response(null, { status: 201 });
    throw new Error(`Unexpected request: ${url}`);
  }, () => worker.fetch(new Request("http://localhost/api/team-invitations", {
    method: "POST",
    headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
    body: JSON.stringify({ email: "manager@example.com", role: "manager", organization_id: "org-b" }),
  }), env(), { waitUntil() {}, passThroughOnException() {} }));

  assert.equal(response.status, 201);
  const membershipCall = calls.find(call => call.url.pathname === "/rest/v1/organization_members" && call.init.method === "POST");
  assert.ok(membershipCall);
  assert.deepEqual(JSON.parse(membershipCall.init.body), {
    organization_id: "org-a",
    user_id: "new-manager",
    role: "manager",
    active: true,
    created_by: "owner-a",
  });
  assert.doesNotMatch(await response.clone().text(), /owner-token|server-only-key/);
});

test("manager cannot create a manager and executor cannot invite anyone", { concurrency: false }, async () => {
  const worker = await loadWorker();
  for (const [requesterRole, requestedRole] of [["manager", "manager"], ["collaborator", "collaborator"]]) {
    let inviteCalled = false;
    const response = await withFetchMock(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") return Response.json({ id: `${requesterRole}-a` });
      if (url.pathname === "/rest/v1/organization_members") return Response.json([{ organization_id: "org-a", role: requesterRole }]);
      if (url.pathname === "/auth/v1/invite") { inviteCalled = true; return Response.json({ user: { id: "unexpected" } }); }
      throw new Error(`Unexpected request: ${url}`);
    }, () => worker.fetch(new Request("http://localhost/api/team-invitations", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ email: "person@example.com", role: requestedRole }),
    }), env(), { waitUntil() {}, passThroughOnException() {} }));
    assert.equal(response.status, 403);
    assert.equal(inviteCalled, false);
  }
});
