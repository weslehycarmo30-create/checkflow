// Confere um CheckFlow publicado, sem alterar nada.
//
//   npm run verify:deploy                              -> https://checkflow.tec.br
//   npm run verify:deploy -- https://outro.endereco    -> outro endereço
//
// Faz apenas requisições que não gravam dados: páginas, /api/supabase-config e um POST sem
// sessão em /api/team-invitations (recusado antes de qualquer escrita). Nenhuma chave é impressa.
import { pathToFileURL } from "node:url";

export const DEFAULT_URL = "https://checkflow.tec.br";
const TIMEOUT_MS = 20_000;

export function isSecretKey(key) {
  if (typeof key !== "string" || !key) return false;
  if (key.startsWith("sb_secret_")) return true;
  if (!key.startsWith("eyJ")) return false;
  try {
    return JSON.parse(Buffer.from(key.split(".")[1] || "", "base64url").toString("utf8")).role === "service_role";
  } catch {
    return false;
  }
}

/** @returns {Promise<{name:string,status:"ok"|"falha"|"aviso",detail:string}[]>} */
export async function verifyDeploy(baseUrl, fetchImpl = fetch) {
  const base = new URL(baseUrl);
  const results = [];
  const add = (name, status, detail = "") => results.push({ name, status, detail });
  const request = (path, init = {}) => fetchImpl(new URL(path, base), { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  const check = async (name, run) => {
    try { await run(); } catch (error) { add(name, "falha", `sem resposta: ${error?.cause?.code || error?.message || error}`); }
  };

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  add("endereço usa HTTPS", base.protocol === "https:" ? "ok" : local ? "aviso" : "falha", base.protocol === "https:" ? "" : "sem HTTPS");

  await check("página inicial", async () => {
    const response = await request("/");
    const html = await response.text();
    if (response.status !== 200) return add("página inicial", "falha", `HTTP ${response.status}`);
    add("página inicial", html.includes("CheckFlow") ? "ok" : "falha", html.includes("CheckFlow") ? "" : "resposta não parece ser o CheckFlow");
  });

  await check("tela de login", async () => {
    const response = await request("/auth");
    add("tela de login", response.status === 200 ? "ok" : "falha", response.status === 200 ? "" : `HTTP ${response.status}`);
  });

  await check("configuração pública do Supabase", async () => {
    const name = "configuração pública do Supabase";
    const response = await request("/api/supabase-config");
    if (response.status !== 200) return add(name, "falha", `HTTP ${response.status} (variáveis públicas ausentes no Worker?)`);
    const config = await response.json().catch(() => null);
    if (!config?.url || !config?.publicKey) return add(name, "falha", "resposta sem url ou chave pública");
    if (isSecretKey(config.publicKey)) return add(name, "falha", "CHAVE SECRETA EXPOSTA: troque a chave no Supabase e publique de novo");
    if (!local && !String(config.url).startsWith("https://")) return add(name, "falha", "URL do Supabase sem HTTPS");
    add(name, "ok", new URL(config.url).hostname);
  });

  await check("convites de equipe", async () => {
    const name = "convites de equipe";
    const response = await request("/api/team-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (response.status === 401) return add(name, "ok", "secret configurado; pedido sem sessão recusado");
    if (response.status === 503) return add(name, "aviso", "SUPABASE_SERVICE_ROLE_KEY não configurada: convites desativados");
    add(name, "falha", `esperado 401 sem sessão, veio HTTP ${response.status}`);
  });

  await check("CRM interno bloqueado", async () => {
    const name = "CRM interno bloqueado";
    const response = await request("/crm");
    if (response.status === 404) return add(name, "ok");
    add(name, local ? "aviso" : "falha", `/crm respondeu HTTP ${response.status}${local ? " (liberado no ambiente local)" : ""}`);
  });

  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2] || DEFAULT_URL;
  console.log(`Verificando ${target} ...`);
  const results = await verifyDeploy(target);
  for (const result of results) console.log(`${result.status.toUpperCase().padEnd(5)} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
  const failures = results.filter(result => result.status === "falha").length;
  console.log(failures ? `${failures} falha(s).` : "Nenhuma falha.");
  process.exitCode = failures ? 1 : 0;
}
