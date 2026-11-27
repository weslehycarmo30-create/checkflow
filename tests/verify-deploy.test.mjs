import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_URL, isSecretKey, verifyDeploy } from "../scripts/verify-deploy.mjs";

const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.assinatura`;

function site(overrides = {}) {
  const calls = [];
  const routes = {
    "/": () => new Response("<title>CheckFlow</title>"),
    "/auth": () => new Response("login"),
    "/api/supabase-config": () => Response.json({ url: "https://exemplo.supabase.co", publicKey: "sb_publishable_exemplo" }),
    "/api/team-invitations": () => new Response("{}", { status: 401 }),
    "/crm": () => new Response("Not Found", { status: 404 }),
    ...overrides,
  };
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, method: init.method || "GET", headers: init.headers || {} });
    return routes[url.pathname]();
  };
  return { calls, fetchImpl };
}
const statusOf = (results, name) => results.find(result => result.name === name)?.status;

test("a healthy publication passes every check against the official domain by default", async () => {
  assert.equal(DEFAULT_URL, "https://checkflow.tec.br");
  const { fetchImpl } = site();
  const results = await verifyDeploy(DEFAULT_URL, fetchImpl);
  assert.equal(results.length, 6);
  assert.deepEqual(results.filter(result => result.status !== "ok"), []);
});

test("the verification never authenticates and only posts to the invitation route without a session", async () => {
  const { calls, fetchImpl } = site();
  await verifyDeploy(DEFAULT_URL, fetchImpl);
  assert.deepEqual(calls.filter(call => call.method !== "GET").map(call => [call.method, call.path]), [["POST", "/api/team-invitations"]]);
  for (const call of calls) assert.equal(Object.keys(call.headers).some(header => /authorization|apikey/i.test(header)), false);
});

test("a secret key served as public configuration is a failure and is never echoed", async () => {
  for (const key of ["sb_secret_abc123", jwt("service_role")]) {
    const { fetchImpl } = site({ "/api/supabase-config": () => Response.json({ url: "https://exemplo.supabase.co", publicKey: key }) });
    const results = await verifyDeploy(DEFAULT_URL, fetchImpl);
    assert.equal(statusOf(results, "configuração pública do Supabase"), "falha");
    assert.equal(JSON.stringify(results).includes(key), false);
  }
  assert.equal(isSecretKey(jwt("anon")), false);
  assert.equal(isSecretKey("sb_publishable_abc"), false);
});

test("missing invitation secret warns, exposed CRM and missing public config fail", async () => {
  const { fetchImpl } = site({
    "/api/team-invitations": () => new Response("{}", { status: 503 }),
    "/crm": () => new Response("crm"),
    "/api/supabase-config": () => new Response("{}", { status: 503 }),
  });
  const results = await verifyDeploy(DEFAULT_URL, fetchImpl);
  assert.equal(statusOf(results, "convites de equipe"), "aviso");
  assert.equal(statusOf(results, "CRM interno bloqueado"), "falha");
  assert.equal(statusOf(results, "configuração pública do Supabase"), "falha");
});

test("an unreachable site or plain HTTP fails instead of throwing", async () => {
  const results = await verifyDeploy("http://checkflow.tec.br", async () => { throw Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } }); });
  assert.ok(results.every(result => result.status === "falha"));
  assert.match(results.at(-1).detail, /ENOTFOUND/);
});

test("the runbook and package scripts expose the verification", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const runbook = await readFile(new URL("../docs/DEPLOY_CLOUDFLARE.md", import.meta.url), "utf8");
  assert.equal(packageJson.scripts["verify:deploy"], "node scripts/verify-deploy.mjs");
  assert.match(runbook, /npm run verify:deploy/);
});

test("the Worker answers instead of crashing when the runtime provides no bindings object", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(worker, /env\.(NEXT_PUBLIC_SUPABASE_[A-Z_]+|SUPABASE_SERVICE_ROLE_KEY)/);
});

test("the browser client consumes failed config responses so requests do not stay open", async () => {
  const client = await readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8");
  assert.match(client, /await response\.body\?\.cancel\(\);/);
});
