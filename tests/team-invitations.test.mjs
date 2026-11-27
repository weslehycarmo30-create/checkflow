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
    // Real GoTrue shape: the user object at the top level (see @supabase/auth-js _userResponse).
    if (url.pathname === "/auth/v1/invite") return Response.json({ id: "new-manager", email: "manager@example.com" });
    if (url.pathname === "/rest/v1/organization_members" && init.method === "POST") return new Response(null, { status: 201 });
    throw new Error(`Unexpected request: ${url}`);
  }, () => worker.fetch(new Request("http://localhost/api/team-invitations", {
    method: "POST",
    headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
    body: JSON.stringify({ email: "manager@example.com", role: "manager", organization_id: "org-b" }),
  }), env(), { waitUntil() {}, passThroughOnException() {} }));

  assert.equal(response.status, 201);
  const inviteCall = calls.find(call => call.url.pathname === "/auth/v1/invite");
  assert.equal(inviteCall.url.searchParams.get("redirect_to"), "http://localhost/auth?mode=reset");
  assert.deepEqual(JSON.parse(inviteCall.init.body), { email: "manager@example.com" });
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

function inviteRequest(worker, mock, body = { email: "person@example.com" }) {
  return withFetchMock(mock, () => worker.fetch(new Request("http://localhost/api/team-invitations", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env(), { waitUntil() {}, passThroughOnException() {} }));
}

// Healthy upstream, with the step under test replaced by "override".
function upstream(overrides = {}, calls = []) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    const step = url.pathname === "/auth/v1/user" ? "user"
      : url.pathname === "/auth/v1/invite" ? "invite"
      : init.method === "POST" ? "link" : "membership";
    calls.push(step);
    if (overrides[step]) return overrides[step]();
    if (step === "user") return Response.json({ id: "owner-a" });
    if (step === "membership") return Response.json([{ organization_id: "org-a", role: "owner" }]);
    if (step === "invite") return Response.json({ id: "new-person" });
    return new Response(null, { status: 201 });
  };
}
const offline = () => { throw new TypeError("fetch failed"); };
const serverError = () => new Response("upstream error", { status: 503 });

test("a wrapped invite response is still accepted", { concurrency: false }, async () => {
  const response = await inviteRequest(await loadWorker(), upstream({ invite: () => Response.json({ user: { id: "wrapped" } }) }));
  assert.equal(response.status, 201);
});

test("an outage is reported as 502 and never as a bad session or missing permission", { concurrency: false }, async () => {
  const worker = await loadWorker();
  for (const step of ["user", "membership", "invite"]) {
    for (const failure of [offline, serverError]) {
      const calls = [];
      const response = await inviteRequest(worker, upstream({ [step]: failure }, calls));
      assert.equal(response.status, 502, step);
      assert.match((await response.json()).error, /indisponível/);
      assert.equal(calls.includes("link"), false);
    }
  }
});

test("a failed link after a sent invitation is reported as such", { concurrency: false }, async () => {
  const worker = await loadWorker();
  for (const failure of [offline, serverError]) {
    const response = await inviteRequest(worker, upstream({ link: failure }));
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Convite criado, mas a associação/);
  }
});

test("rejected sessions and rejected invitations keep their own status and link nobody", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const expired = await inviteRequest(worker, upstream({ user: () => new Response("{}", { status: 401 }) }));
  assert.equal(expired.status, 401);
  const calls = [];
  const existing = await inviteRequest(worker, upstream({ invite: () => Response.json({ msg: "A user with this email address has already been registered" }, { status: 422 }) }, calls));
  assert.equal(existing.status, 400);
  assert.match((await existing.json()).error, /already been registered/);
  assert.equal(calls.includes("link"), false);
});
