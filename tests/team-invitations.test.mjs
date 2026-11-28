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
      // The new person has no membership yet.
      return Response.json(url.searchParams.get("user_id") === "eq.owner-a" ? [{ organization_id: "org-a", role: "owner" }] : []);
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
      : init.method === "POST" ? "link"
      : url.searchParams.get("user_id") === "eq.owner-a" ? "membership" : "invited";
    calls.push(step);
    if (overrides[step]) return overrides[step]();
    if (step === "user") return Response.json({ id: "owner-a" });
    if (step === "membership") return Response.json([{ organization_id: "org-a", role: "owner" }]);
    if (step === "invite") return Response.json({ id: "new-person" });
    if (step === "invited") return Response.json([]);
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

test("a pending invitee of another company is not linked", { concurrency: false }, async () => {
  const calls = [];
  const response = await inviteRequest(await loadWorker(), upstream({ invited: () => Response.json([{ organization_id: "org-b" }]) }, calls));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /outra empresa/);
  assert.equal(calls.includes("link"), false);
});

test("nobody is linked when the invitee's memberships cannot be checked", { concurrency: false }, async () => {
  const worker = await loadWorker();
  for (const failure of [offline, serverError]) {
    const calls = [];
    const response = await inviteRequest(worker, upstream({ invited: failure }, calls));
    assert.equal(response.status, 502);
    assert.equal(calls.includes("link"), false);
  }
});

test("resending an invitation to a pending member of the same company succeeds without relinking", { concurrency: false }, async () => {
  const calls = [];
  const response = await inviteRequest(await loadWorker(), upstream({
    invited: () => Response.json([{ organization_id: "org-a", active: true }]),
    // What PostgREST answers when the membership already exists.
    link: () => new Response("duplicate key", { status: 409 }),
  }, calls));
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /Convite reenviado/);
  assert.equal(calls.includes("link"), false);
});

test("inviting someone deactivated in the company says so and links nothing", { concurrency: false }, async () => {
  const calls = [];
  const response = await inviteRequest(await loadWorker(), upstream({ invited: () => Response.json([{ organization_id: "org-a", active: false }]) }, calls));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /desativad/);
  assert.equal(calls.includes("link"), false);
});

test("an inactive membership elsewhere does not block a new invitation", { concurrency: false }, async () => {
  const response = await inviteRequest(await loadWorker(), upstream({ invited: () => Response.json([{ organization_id: "org-b", active: false }]) }));
  assert.equal(response.status, 201);
});

const memberId = "11111111-2222-4333-8444-555555555555";
// Upstream for a resend: requester, target membership, auth account and the invitation itself.
function resendUpstream({ requester = "owner", target = { role: "collaborator", active: true }, account = { email: "person@example.com" }, invite } = {}, calls = []) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "owner-a" });
    if (url.pathname === `/auth/v1/admin/users/${memberId}`) { calls.push("account"); return Response.json({ id: memberId, ...account }); }
    if (url.pathname === "/auth/v1/invite") { calls.push(["invite", JSON.parse(init.body)]); return invite ? invite() : Response.json({ id: memberId }); }
    if (url.pathname === "/rest/v1/organization_members" && init.method !== "POST") {
      if (url.searchParams.get("user_id") === "eq.owner-a") return Response.json([{ organization_id: "org-a", role: requester }]);
      calls.push(["target", url.searchParams.get("organization_id"), url.searchParams.get("user_id")]);
      return Response.json(target ? [target] : []);
    }
    throw new Error(`Unexpected request: ${init.method || "GET"} ${url}`);
  };
}

test("an invitation is resent to a pending member of the requester's company", { concurrency: false }, async () => {
  const calls = [];
  const response = await inviteRequest(await loadWorker(), resendUpstream({}, calls), { resend_user_id: memberId });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /Convite reenviado/);
  assert.doesNotMatch(body, /person@example\.com/);
  assert.deepEqual(calls, [["target", "eq.org-a", `eq.${memberId}`], "account", ["invite", { email: "person@example.com" }]]);
});

test("resending is refused for outsiders, removed people, owners, activated accounts and beyond the manager's role", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const cases = [
    [{ target: null }, 404, /não faz parte/],
    [{ target: { role: "collaborator", active: false } }, 409, /Reative/],
    [{ target: { role: "owner", active: true } }, 403, /não pode reenviar/],
    [{ requester: "manager", target: { role: "manager", active: true } }, 403, /não pode reenviar/],
    [{ requester: "collaborator" }, 403, /Apenas owner ou manager/],
    [{ account: { email: "person@example.com", email_confirmed_at: "2026-11-01T00:00:00Z" } }, 409, /já ativou a conta/],
  ];
  for (const [options, status, message] of cases) {
    const calls = [];
    const response = await inviteRequest(worker, resendUpstream(options, calls), { resend_user_id: memberId });
    assert.equal(response.status, status, JSON.stringify(options));
    assert.match((await response.json()).error, message);
    assert.equal(calls.some(call => call[0] === "invite"), false);
  }
});

test("a malformed member id never reaches Supabase", { concurrency: false }, async () => {
  const response = await inviteRequest(await loadWorker(), async () => { throw new Error("should not be called"); }, { resend_user_id: "../admin" });
  assert.equal(response.status, 400);
});

test("the e-mail rate limit is explained in both flows", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const limited = () => Response.json({ msg: "email rate limit exceeded" }, { status: 429 });
  for (const response of [
    await inviteRequest(worker, resendUpstream({ invite: limited }), { resend_user_id: memberId }),
    await inviteRequest(worker, upstream({ invite: limited })),
  ]) {
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /Aguarde alguns minutos/);
  }
});
