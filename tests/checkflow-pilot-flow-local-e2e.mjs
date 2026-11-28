// Fluxo do piloto de ponta a ponta contra o Supabase LOCAL (nunca remoto).
//
//   1. subir o stack local do CheckFlow (API em 127.0.0.1:55421)
//   2. buildar com NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY apontando para ele
//   3. PORT=3000 npm start
//   4. SUPABASE_LOCAL_SERVICE_KEY=... SUPABASE_LOCAL_ANON_KEY=... node tests/checkflow-pilot-flow-local-e2e.mjs
//
// Não é coletado por `npm test` (não termina em .test.mjs). Qualquer requisição para host
// que não seja local é bloqueada.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const appURL = process.env.CHECKFLOW_E2E_BASE_URL || "http://127.0.0.1:3000";
const apiURL = process.env.SUPABASE_LOCAL_URL || "http://127.0.0.1:55421";
const anon = process.env.SUPABASE_LOCAL_ANON_KEY;
const service = process.env.SUPABASE_LOCAL_SERVICE_KEY;
const chromePath = process.env.CHECKFLOW_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const local = url => ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
if (!anon || !service) throw new Error("Defina SUPABASE_LOCAL_ANON_KEY e SUPABASE_LOCAL_SERVICE_KEY (chaves do stack local).");
if (!local(appURL) || !local(apiURL)) throw new Error("Este teste só roda contra endereços locais.");

const run = Date.now();
const password = `Local-${run}-x!`;
const admin = async (path, body, method = "POST") => {
  const response = await fetch(`${apiURL}${path}`, { method, headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body && JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

const owner = await admin("/auth/v1/admin/users", { email: `dono-${run}@checkflow.test`, password, email_confirm: true, user_metadata: { organization_name: `Bar E2E ${run}`, full_name: "Dona Teste" } });
const executor = await admin("/auth/v1/admin/users", { email: `executor-${run}@checkflow.test`, password, email_confirm: true, user_metadata: { full_name: "Executor Teste" } });
const [{ organization_id: organizationId }] = await admin(`/rest/v1/organization_members?select=organization_id&user_id=eq.${owner.id}`, undefined, "GET");
await admin("/rest/v1/organization_members", { organization_id: organizationId, user_id: executor.id, role: "collaborator", active: true, created_by: owner.id });

const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const problems = [];
const steps = [];
const blocked = new Set();

async function session(label, email, viewport) {
  const context = await browser.newContext({ viewport });
  await context.route("**/*", route => {
    if (local(route.request().url())) return route.continue();
    blocked.add(new URL(route.request().url()).hostname);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("response", async response => {
    if (!response.url().startsWith(apiURL) || response.status() < 400) return;
    const detail = await response.text().catch(() => "");
    problems.push(`[${label}] ${response.request().method()} ${new URL(response.url()).pathname} -> ${response.status()} ${detail.slice(0, 220)}`);
  });
  page.on("pageerror", error => problems.push(`[${label}] pageerror ${error.message.slice(0, 200)}`));
  await page.goto(`${appURL}/auth`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(url => !url.pathname.startsWith("/auth"));
  return page;
}
const step = async (name, page, action) => {
  try { await action(); steps.push(`OK    ${name}`); }
  catch (error) {
    steps.push(`FALHA ${name}: ${error.message.split("\n")[0]}`);
    await page.screenshot({ path: `test-results/pilot-flow-falha-${steps.length}.png`, fullPage: true }).catch(() => {});
    throw error;
  }
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const photo = { name: "evidencia.png", mimeType: "image/png", buffer: png };

try {
  const manager = await session("dono", owner.email, { width: 1366, height: 900 });
  let checklistId;

  await step("criar checklist pelo modelo Operação do evento", manager, async () => {
    await manager.locator("nav button", { hasText: "Modelos" }).click();
    await manager.locator(".template-card", { hasText: "Operação do evento" }).getByRole("button", { name: "Usar modelo" }).click();
    await manager.getByRole("button", { name: "Criar checklist com modelo" }).click();
    await manager.getByText("Checklist criado com 12 itens do modelo.").waitFor();
    await manager.locator("button.data-row", { hasText: "Operação do evento" }).click();
    await manager.waitForURL(/\/checklists\//);
    checklistId = manager.url().split("/").pop();
  });

  await step("duplicar o checklist", manager, async () => {
    await manager.getByRole("button", { name: "Duplicar" }).click();
    await manager.waitForURL(url => url.pathname.startsWith("/checklists/") && !url.pathname.endsWith(checklistId));
    await manager.getByRole("heading", { name: "Cópia de Operação do evento" }).waitFor();
    assert.equal(await manager.locator(".checklist-item").count(), 12);
  });

  await step("adicionar item de foto e atribuir ao executor", manager, async () => {
    const section = manager.locator(".checklist-section").last();
    await section.locator(".item-create input").fill("Foto da estação");
    await section.getByLabel("Tipo de resposta").selectOption("photo");
    await section.getByRole("button", { name: "Adicionar item" }).click();
    await manager.getByText("Foto da estação").first().waitFor();
    await manager.getByLabel("Colaborador").selectOption(executor.id);
    await manager.getByRole("button", { name: "Atribuir ao colaborador" }).click();
    await manager.getByText("Sem unidade · sem prazo").waitFor();
  });

  const worker = await session("executor", executor.email, { width: 390, height: 844 });
  await step("executor abre e inicia o checklist no celular", worker, async () => {
    await worker.locator("button.recent-row, button.data-row", { hasText: "Cópia de Operação do evento" }).first().click();
    await worker.waitForURL(/\/executions\//);
    await worker.getByRole("button", { name: "Iniciar checklist" }).click();
    await worker.locator(".execution-item").first().waitFor();
  });

  await step("responder, registrar não conformidade e anexar foto", worker, async () => {
    const yesNo = worker.locator(".conditional-answer > select");
    const total = await yesNo.count();
    assert.equal(total, 9);
    await yesNo.nth(0).selectOption("Não");
    await worker.locator(".failure-details textarea").fill("Equipe incompleta no horário");
    await worker.getByRole("button", { name: "Registrar não conformidade" }).click();
    await worker.getByText("Ocorrência registrada e visível para a gestão.").waitFor();
    for (let index = 1; index < total; index += 1) {
      // Sem esperar o salvamento anterior: é assim que a pessoa toca no celular.
      await yesNo.nth(index).selectOption("Sim");
    }
    await worker.waitForFunction(() => [...document.querySelectorAll(".conditional-answer > select")].slice(1).every(select => select.value === "Sim" && !select.disabled));
    await worker.getByLabel("Dê uma nota de 0 a 10 para a estação.").selectOption("0");
    await worker.waitForLoadState("networkidle");
    const time = worker.getByLabel("Horário da última conferência.");
    await time.fill("22:30");
    await time.blur();
    await worker.waitForLoadState("networkidle");
    await worker.locator('.photo-answer input[type="file"]').setInputFiles(photo);
    await worker.locator(".photo-answer img").waitFor();
    await worker.waitForLoadState("networkidle");
  });

  await step("concluir e conferir que as respostas persistem", worker, async () => {
    await worker.reload({ waitUntil: "networkidle" });
    assert.equal(await worker.getByLabel("Dê uma nota de 0 a 10 para a estação.").inputValue(), "0");
    await worker.locator(".photo-answer img").waitFor();
    await worker.getByRole("button", { name: "Finalizar checklist" }).click();
    await worker.getByText("Finalizado", { exact: true }).waitFor();
  });

  await step("gestor vê o histórico com a foto", manager, async () => {
    await manager.goto(`${appURL}/dashboard`, { waitUntil: "networkidle" });
    await manager.locator("nav button", { hasText: "Histórico" }).click();
    await manager.locator("button.history-row", { hasText: "Cópia de Operação do evento" }).click();
    await manager.waitForURL(/\/history\//);
    await manager.getByText("Equipe incompleta no horário").first().waitFor();
    await manager.locator("img[src*='/storage/v1/']").first().waitFor();
  });

  await step("gestor cria o plano de ação", manager, async () => {
    await manager.goto(`${appURL}/action-plans`, { waitUntil: "networkidle" });
    await manager.getByLabel("Responsável").selectOption(executor.id);
    const due = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
    await manager.getByLabel("Prazo").fill(due);
    await manager.getByRole("button", { name: "Criar plano" }).click();
    await manager.getByRole("button", { name: "Criar plano" }).waitFor({ state: "detached" });
    await manager.waitForLoadState("networkidle");
  });

  await step("executor envia a foto da correção", worker, async () => {
    await worker.goto(`${appURL}/action-plans`, { waitUntil: "networkidle" });
    await worker.locator('label.photo-upload input[type="file"]').setInputFiles(photo);
    await worker.waitForLoadState("networkidle");
    await worker.locator("img").last().waitFor();
  });

  await step("correção reprovada continua contando como pendência aberta", manager, async () => {
    await manager.reload({ waitUntil: "networkidle" });
    const reject = manager.getByRole("button", { name: "Reprovar" });
    await reject.click();
    await reject.waitFor({ state: "detached" });
    await manager.goto(`${appURL}/dashboard`, { waitUntil: "networkidle" });
    await manager.getByText("Checklists operacionais").waitFor();
    const pending = manager.getByRole("button", { name: "Abrir Planos de ação: Não conformidades abertas" }).locator("strong");
    assert.equal(await pending.innerText(), "1", "a pendência reprovada sumiu do painel");
    await worker.goto(`${appURL}/action-plans`, { waitUntil: "networkidle" });
    await worker.locator('label.photo-upload input[type="file"]').setInputFiles(photo);
    await worker.getByText("Correção enviada para validação do gestor.").waitFor();
    await manager.goto(`${appURL}/action-plans`, { waitUntil: "networkidle" });
  });

  await step("gestor aprova a correção", manager, async () => {
    await manager.reload({ waitUntil: "networkidle" });
    const approve = manager.getByRole("button", { name: "Aprovar correção" });
    await approve.click();
    await approve.waitFor({ state: "detached" });
  });

  await step("relatório mostra a conclusão", manager, async () => {
    await manager.goto(`${appURL}/dashboard`, { waitUntil: "networkidle" });
    await manager.locator("nav button", { hasText: "Relatórios" }).click();
    await manager.locator(".report-row", { hasText: "Cópia de Operação do evento" }).waitFor();
    await manager.locator(".report-row", { hasText: "Executor Teste" }).waitFor();
  });
} catch {
  process.exitCode = 1;
} finally {
  await browser.close();
  console.log(steps.join("\n"));
  console.log(`Respostas de erro da API (${problems.length}):\n${problems.join("\n") || "nenhuma"}`);
  console.log(`Hosts externos bloqueados: ${[...blocked].join(", ") || "nenhum"}`);
}
