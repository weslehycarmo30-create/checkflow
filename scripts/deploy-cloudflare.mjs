// Publica o CheckFlow na Cloudflare (Worker + assets).
//
//   npm run deploy:cloudflare            -> build + dry-run (nada é publicado)
//   npm run deploy:cloudflare -- --apply -> build + publicação real em produção
//
// Requer `wrangler login` (ou CLOUDFLARE_API_TOKEN) feito pelo responsável.
// As variáveis públicas do Supabase vêm do .env.local (o wrangler oculta os valores no log).
// Nada é versionado e a service_role nunca passa por aqui.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const apply = process.argv.includes("--apply");

function readEnvFile(path) {
  const values = {};
  let text = "";
  try { text = readFileSync(path, "utf8"); } catch { return values; }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

const env = { ...readEnvFile(resolve(root, ".env.local")), ...process.env };
const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const problems = [];
if (!env.NEXT_PUBLIC_SUPABASE_URL) problems.push("NEXT_PUBLIC_SUPABASE_URL ausente (.env.local)");
if (!publicKey) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausente (.env.local)");
if (/^eyJ/.test(publicKey || "") && /service_role/.test(Buffer.from((publicKey.split(".")[1] || ""), "base64url").toString("utf8"))) {
  problems.push("a chave pública parece ser uma service_role; use apenas a Publishable/anon key");
}
if (problems.length) {
  console.error(`Deploy interrompido:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("1/2 Build verificado...");
run("npm", ["run", "build"]);

console.log(apply ? "2/2 Publicando em PRODUÇÃO (checkflow.tec.br)..." : "2/2 Dry-run (use --apply para publicar)...");
run("npx", [
  "wrangler", "deploy",
  "--config", "deploy/wrangler.production.jsonc",
  "--var", `NEXT_PUBLIC_SUPABASE_URL:${env.NEXT_PUBLIC_SUPABASE_URL}`,
  "--var", `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:${publicKey}`,
  ...(apply ? [] : ["--dry-run"]),
]);
