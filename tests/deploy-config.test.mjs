import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(new URL("../deploy/wrangler.production.jsonc", import.meta.url), "utf8");
const script = await readFile(new URL("../scripts/deploy-cloudflare.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const runbook = await readFile(new URL("../docs/DEPLOY_CLOUDFLARE.md", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");

test("production Worker config provides every binding the Worker reads and serves the official domain", () => {
  assert.match(config, /"images":\s*\{\s*"binding":\s*"IMAGES"/);
  assert.match(config, /"binding":\s*"ASSETS"/);
  assert.match(config, /"pattern":\s*"checkflow\.tec\.br",\s*"custom_domain":\s*true/);
  assert.match(config, /"main":\s*"\.\.\/dist\/server\/index\.js"/);
  assert.match(worker, /env\.IMAGES/);
  assert.match(worker, /env\.ASSETS/);
});

test("production config holds no secrets or keys", () => {
  assert.doesNotMatch(config, /eyJ[A-Za-z0-9_-]{10,}|sb_(publishable|secret)_|service_role_key\s*"/i);
  assert.doesNotMatch(config, /"vars"/);
});

test("deploy script is a dry-run unless --apply is passed and blocks a service_role as public key", () => {
  assert.match(script, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(script, /\.\.\.\(apply \? \[\] : \["--dry-run"\]\)/);
  assert.match(script, /service_role/);
  assert.equal(packageJson.scripts["deploy:cloudflare"], "node scripts/deploy-cloudflare.mjs");
});

test("deploy script never reads or forwards the service role secret", () => {
  assert.doesNotMatch(script, /process\.env\.SUPABASE_SERVICE_ROLE_KEY|env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(script, /--var[^\n]*SERVICE_ROLE/);
});

test("runbook covers database parity, DNS, login, secret and rollback", () => {
  for (const topic of [/migration list/, /Registro\.br/, /wrangler login/, /secret put SUPABASE_SERVICE_ROLE_KEY/, /wrangler rollback/, /dry-run/]) {
    assert.match(runbook, topic);
  }
});
