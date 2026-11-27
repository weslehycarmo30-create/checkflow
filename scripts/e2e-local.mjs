// Roda o fluxo do piloto de ponta a ponta contra o Supabase LOCAL do projeto.
//
//   supabase start          (ou iniciar no Docker os contêineres supabase_*_checkflow)
//   npm run e2e:local
//
// Lê as chaves de desenvolvimento do contêiner local (sem imprimi-las), faz o build apontando
// para 127.0.0.1:55421, serve em 127.0.0.1:3000 e executa o teste no Chrome. Cada execução cria
// uma organização de teste nova no banco local. O dist/ resultante é só para teste: o deploy
// sempre refaz o build.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const apiURL = "http://127.0.0.1:55421";
const appURL = "http://127.0.0.1:3000";
const container = process.env.CHECKFLOW_LOCAL_STORAGE_CONTAINER || "supabase_storage_checkflow";

function containerEnv(name) {
  let raw;
  try { raw = execFileSync("docker", ["inspect", name, "--format", "{{json .Config.Env}}"], { stdio: ["ignore", "pipe", "ignore"] }).toString(); }
  catch { throw new Error(`Contêiner ${name} não encontrado. Suba o Supabase local do CheckFlow antes.`); }
  return Object.fromEntries(JSON.parse(raw).map(value => [value.slice(0, value.indexOf("=")), value.slice(value.indexOf("=") + 1)]));
}
const redact = text => (text || "").replace(/eyJ[A-Za-z0-9_.-]{20,}|sb_(secret|publishable)_[A-Za-z0-9_-]+/g, "<chave>");
const isUp = async url => { try { return (await fetch(url)).ok; } catch { return false; } };

const { ANON_KEY, SERVICE_KEY } = containerEnv(container);
if (!ANON_KEY || !SERVICE_KEY) throw new Error("Chaves locais não encontradas no contêiner.");
if (!(await isUp(`${apiURL}/auth/v1/health`)) && !(await fetch(`${apiURL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then(r => r.ok).catch(() => false))) {
  throw new Error(`Supabase local não responde em ${apiURL}.`);
}
if (await isUp(`${appURL}/auth`)) throw new Error("Já existe um servidor em 127.0.0.1:3000; encerre-o antes.");

const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: apiURL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY, SUPABASE_LOCAL_URL: apiURL, SUPABASE_LOCAL_ANON_KEY: ANON_KEY, SUPABASE_LOCAL_SERVICE_KEY: SERVICE_KEY };
const build = spawnSync(process.execPath, ["scripts/build-verified.mjs"], { cwd: root, env, encoding: "utf8" });
if (build.status !== 0) { console.error(redact(build.stderr).slice(-2000)); process.exit(1); }

const server = spawn(process.execPath, ["scripts/start-local.mjs"], { cwd: root, env: { ...env, PORT: "3000" }, stdio: "ignore" });
try {
  for (let attempt = 0; attempt < 100 && !(await isUp(`${appURL}/auth`)); attempt += 1) await new Promise(done => setTimeout(done, 200));
  const run = spawnSync(process.execPath, ["tests/checkflow-pilot-flow-local-e2e.mjs"], { cwd: root, env, encoding: "utf8", timeout: 300_000 });
  console.log(redact(run.stdout), redact(run.stderr).slice(-2000));
  process.exitCode = run.status ?? 1;
} finally {
  server.kill();
}
