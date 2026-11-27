// Papéis, isolamento entre empresas, relatórios, unidades e quedas de conexão, contra o Supabase LOCAL.
// Executado por `npm run e2e:local`. Cada passo é independente o bastante para continuar após uma falha.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const appURL = process.env.CHECKFLOW_E2E_BASE_URL || "http://127.0.0.1:3000";
const apiURL = process.env.SUPABASE_LOCAL_URL || "http://127.0.0.1:55421";
const service = process.env.SUPABASE_LOCAL_SERVICE_KEY;
const chromePath = process.env.CHECKFLOW_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const local = url => ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
if (!service) throw new Error("Defina SUPABASE_LOCAL_SERVICE_KEY (chave do stack local).");
if (!local(appURL) || !local(apiURL)) throw new Error("Este teste só roda contra endereços locais.");

const run = Date.now();
const password = `Local-${run}-x!`;
const admin = async (path, body, method = "POST") => {
  const response = await fetch(`${apiURL}${path}`, { method, headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body && JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};
const rows = path => admin(`/rest/v1/${path}`, undefined, "GET");
const user = async (slug, name, organization) => admin("/auth/v1/admin/users", { email: `${slug}-${run}@checkflow.test`, password, email_confirm: true, user_metadata: { full_name: name, ...(organization ? { organization_name: organization } : {}) } });

const owner = await user("papel-dono", "Dona Teste", `Bar Papeis ${run}`);
const manager = await user("papel-gestor", "Gestor Teste");
const executor = await user("papel-executor", "Executor Teste");
const outsider = await user("papel-outro", "Outra Empresa", `Empresa B ${run}`);
const [{ organization_id: organizationId }] = await rows(`organization_members?select=organization_id&user_id=eq.${owner.id}`);
for (const [member, role] of [[manager, "manager"], [executor, "collaborator"]]) {
  await admin("/rest/v1/organization_members", { organization_id: organizationId, user_id: member.id, role, active: true, created_by: owner.id });
}

const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const steps = [];
const pageErrors = [];
const blocked = new Set();

async function session(label, email, viewport = { width: 1366, height: 900 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.route("**/*", route => {
    if (local(route.request().url())) return route.continue();
    blocked.add(new URL(route.request().url()).hostname);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", error => pageErrors.push(`[${label}] ${error.message.slice(0, 200)}`));
  await page.goto(`${appURL}/auth`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(url => !url.pathname.startsWith("/auth"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  return page;
}
const step = async (name, page, action) => {
  try { await action(); steps.push(`OK    ${name}`); }
  catch (error) {
    process.exitCode = 1;
    steps.push(`FALHA ${name}: ${error.message.split("\n").slice(0, 3).join(" ").slice(0, 260)}`);
    await page?.context().setOffline(false).catch(() => {});
    await page?.screenshot({ path: `test-results/roles-falha-${steps.length}.png`, fullPage: true }).catch(() => {});
  }
};
const nav = (page, label) => page.locator("nav button", { hasText: label });
const open = async (page, path) => { await page.goto(`${appURL}${path}`, { waitUntil: "networkidle" }); };
const fromTemplate = async (page, template, items) => {
  await open(page, "/dashboard");
  await nav(page, "Modelos").click();
  await page.locator(".template-card", { hasText: template }).getByRole("button", { name: "Usar modelo" }).click();
  await page.getByRole("button", { name: "Criar checklist com modelo" }).click();
  await page.getByText(`Checklist criado com ${items} itens do modelo.`).waitFor();
  await page.locator("button.data-row", { hasText: template }).first().click();
  await page.waitForURL(/\/checklists\//);
  return page.url().split("/").pop();
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const photo = { name: "evidencia.png", mimeType: "image/png", buffer: png };

let checklistId;
let assignmentId;
let executionId;
try {
  const boss = await session("dono", owner.email);
  const lead = await session("gestor", manager.email);
  const phone = await session("executor", executor.email, { width: 390, height: 844 });
  const other = await session("outra-empresa", outsider.email);

  await step("unidade: dono cadastra uma vez e desativa", boss, async () => {
    await open(boss, "/dashboard");
    await nav(boss, "Equipe e unidades").click();
    await boss.getByLabel("Nome da unidade").fill("Loja Centro");
    await boss.getByRole("button", { name: "Cadastrar unidade" }).click();
    await boss.getByText("Unidade cadastrada com sucesso.").waitFor();
    await boss.getByLabel("Nome da unidade").fill("Loja Norte");
    await boss.getByRole("button", { name: "Cadastrar unidade" }).click();
    await boss.locator(".unit-row", { hasText: "Loja Norte" }).waitFor();
    boss.once("dialog", dialog => dialog.accept());
    await boss.locator(".unit-row", { hasText: "Loja Norte" }).getByRole("button", { name: "Desativar" }).click();
    await boss.locator(".unit-row.is-inactive", { hasText: "Loja Norte" }).waitFor();
    assert.equal((await rows(`units?select=name&organization_id=eq.${organizationId}`)).length, 2);
  });

  await step("gestor cria pelo modelo, adiciona foto e atribui com unidade ativa", lead, async () => {
    checklistId = await fromTemplate(lead, "Abertura do bar", 8);
    const section = lead.locator(".checklist-section").last();
    await section.locator(".item-create input").fill("Foto da estação");
    await section.getByLabel("Tipo de resposta").selectOption("photo");
    await section.getByRole("button", { name: "Adicionar item" }).click();
    await lead.getByText("Foto da estação").first().waitFor();
    const units = await lead.getByLabel("Unidade").locator("option").allInnerTexts();
    assert.deepEqual(units, ["Sem unidade", "Loja Centro"]);
    await lead.getByLabel("Colaborador").selectOption(executor.id);
    await lead.getByLabel("Unidade").selectOption({ label: "Loja Centro" });
    await lead.getByRole("button", { name: "Atribuir ao colaborador" }).click();
    await lead.getByText("Loja Centro · sem prazo").waitFor();
    [{ id: assignmentId }] = await rows(`checklist_assignments?select=id&checklist_id=eq.${checklistId}`);
  });

  await step("gestor convida apenas executor (sem escolha de papel)", lead, async () => {
    await open(lead, "/dashboard");
    await nav(lead, "Equipe e unidades").click();
    await lead.getByRole("button", { name: "Enviar convite" }).waitFor();
    assert.equal(await lead.getByLabel("Papel").count(), 0);
    assert.equal(await nav(lead, "Relatórios").count(), 1);
  });

  await step("executor não vê ações de gestão no painel", phone, async () => {
    await open(phone, "/dashboard");
    await phone.getByRole("button", { name: "Abrir menu" }).click();
    assert.equal(await nav(phone, "Relatórios").count(), 0, "Relatórios visível para executor");
    assert.equal(await phone.getByRole("button", { name: "Novo checklist" }).count(), 0, "Novo checklist visível");
    assert.equal(await nav(phone, "Modelos").count(), 0, "menu Modelos visível para executor, que não pode criar checklists");
  });

  await step("executor não edita o checklist pela URL", phone, async () => {
    await open(phone, `/checklists/${checklistId}`);
    for (const name of ["Duplicar", "Editar", "Adicionar item", "Atribuir ao colaborador"]) {
      assert.equal(await phone.getByRole("button", { name }).count(), 0, `botão "${name}" visível`);
    }
  });

  await step("executor vê unidades só para leitura e não vê a equipe", phone, async () => {
    await open(phone, "/dashboard");
    await phone.getByRole("button", { name: "Abrir menu" }).click();
    await nav(phone, "Equipe e unidades").click();
    await phone.getByText("Visualização somente leitura.", { exact: false }).waitFor();
    assert.equal(await phone.getByRole("button", { name: "Enviar convite" }).count(), 0);
  });

  const offline = value => phone.context().setOffline(value);
  const finish = () => phone.getByRole("button", { name: "Finalizar checklist" });
  await step("sem conexão ao iniciar: avisa e permite tentar de novo", phone, async () => {
    await open(phone, `/executions/${assignmentId}`);
    await offline(true);
    await phone.getByRole("button", { name: "Iniciar checklist" }).click();
    await phone.getByRole("alert").filter({ hasText: "EXECUTION_START_FAILED" }).waitFor({ timeout: 30_000 });
    await offline(false);
    await phone.getByRole("button", { name: "Iniciar checklist" }).click();
    await phone.locator(".conditional-answer > select").first().waitFor();
    [{ id: executionId }] = await rows(`checklist_executions?select=id&assignment_id=eq.${assignmentId}`);
  });

  const answers = () => rows(`execution_answers?select=value&execution_id=eq.${executionId}`);
  await step("sem conexão ao responder: não marca como salvo e recupera", phone, async () => {
    const first = phone.locator(".conditional-answer > select").first();
    await offline(true);
    await first.selectOption("Sim");
    await phone.getByRole("alert").filter({ hasText: "ANSWER_SAVE_FAILED" }).waitFor({ timeout: 30_000 });
    assert.equal(await first.inputValue(), "", "resposta aparece como salva sem conexão");
    assert.equal(await first.isEnabled(), true, "campo travado após a falha");
    await offline(false);
    assert.equal((await answers()).length, 0);
    await first.selectOption("Sim");
    await phone.waitForFunction(() => { const select = document.querySelector(".conditional-answer > select"); return select.value === "Sim" && !select.disabled; });
    assert.equal((await answers()).length, 1);
  });

  await step("texto digitado sem conexão não se perde e é salvo ao voltar", phone, async () => {
    const text = phone.getByLabel("Nome do responsável que liberou a abertura.");
    await offline(true);
    await text.fill("Maria da Silva");
    await text.blur();
    await phone.getByRole("alert").filter({ hasText: "ANSWER_SAVE_FAILED" }).waitFor({ timeout: 30_000 });
    assert.equal(await text.inputValue(), "Maria da Silva", "texto digitado foi apagado");
    await offline(false);
    await text.focus();
    await text.blur();
    await phone.waitForTimeout(2_000);
    assert.ok((await answers()).some(answer => answer.value === "Maria da Silva"), "texto não foi salvo depois que a conexão voltou");
  });

  await step("sem conexão ao registrar não conformidade: libera o botão e registra uma vez", phone, async () => {
    const second = phone.locator(".conditional-answer > select").nth(1);
    await second.selectOption("Não");
    await phone.locator(".failure-details textarea").fill("Extintor sem lacre");
    const register = phone.getByRole("button", { name: "Registrar não conformidade" });
    await offline(true);
    await register.click();
    await phone.getByRole("alert").first().waitFor({ timeout: 30_000 });
    await phone.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "Registrar não conformidade" && !button.disabled), undefined, { timeout: 30_000 });
    await offline(false);
    await register.click();
    await phone.getByText("Ocorrência registrada e visível para a gestão.").waitFor();
    assert.equal((await rows(`non_conformities?select=id&execution_id=eq.${executionId}`)).length, 1);
  });

  await step("sem conexão ao enviar foto: avisa e o reenvio funciona", phone, async () => {
    const input = phone.locator('.photo-answer input[type="file"]');
    await offline(true);
    await input.setInputFiles(photo);
    await phone.getByRole("alert").filter({ hasText: "UPLOAD_FAILED" }).waitFor({ timeout: 30_000 });
    assert.equal(await phone.locator(".photo-answer img").count(), 0);
    await offline(false);
    await input.setInputFiles([]);
    await input.setInputFiles(photo);
    await phone.locator(".photo-answer img").waitFor();
  });

  await step("sem conexão ao finalizar: não conclui, e conclui ao voltar", phone, async () => {
    const selects = phone.locator(".conditional-answer > select");
    for (let index = 2; index < await selects.count(); index += 1) await selects.nth(index).selectOption("Sim");
    const number = phone.getByLabel("Registre a temperatura da geladeira ou freezer (°C).");
    await number.fill("4");
    await number.blur();
    await phone.waitForFunction(() => !document.querySelector(".finish-card button").disabled, undefined, { timeout: 30_000 });
    await offline(true);
    await finish().click();
    await phone.getByRole("alert").filter({ hasText: "EXECUTION_COMPLETE_FAILED" }).waitFor({ timeout: 30_000 });
    assert.equal(await phone.getByText("Finalizado", { exact: true }).count(), 0);
    await offline(false);
    await finish().click();
    await phone.getByText("Finalizado", { exact: true }).waitFor();
  });

  await step("relatório e CSV batem com o banco", lead, async () => {
    const [saved] = await rows(`checklist_executions?select=conformity_percentage,status&id=eq.${executionId}`);
    assert.equal(saved.status, "completed");
    await open(lead, "/dashboard");
    await nav(lead, "Relatórios").click();
    await lead.locator(".report-row", { hasText: "Abertura do bar" }).waitFor();
    const kpis = await lead.locator(".report-kpi strong").allInnerTexts();
    const average = Math.round(Number(saved.conformity_percentage));
    assert.deepEqual(kpis, ["1", `${average}%`, average < 80 ? "1" : "0"]);
    const [download] = await Promise.all([lead.waitForEvent("download"), lead.getByRole("button", { name: "Exportar CSV" }).click()]);
    const csv = await readFile(await download.path(), "utf8");
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.match(csv, /"Abertura do bar";"Executor Teste";/);
    assert.equal(csv.trim().split("\r\n").length, 2);
  });

  await step("duplicar checklist já executado preserva o original", boss, async () => {
    await open(boss, `/checklists/${checklistId}`);
    await boss.getByRole("button", { name: "Duplicar" }).click();
    await boss.waitForURL(url => url.pathname.startsWith("/checklists/") && !url.pathname.endsWith(checklistId));
    await boss.getByRole("heading", { name: "Cópia de Abertura do bar" }).waitFor();
    assert.equal(await boss.locator(".checklist-item").count(), 9);
    assert.equal(await boss.getByText("Estrutura bloqueada", { exact: false }).count(), 0);
    assert.equal((await rows(`checklist_assignments?select=id&checklist_id=eq.${boss.url().split("/").pop()}`)).length, 0);
    assert.equal((await rows(`checklist_executions?select=id&checklist_id=eq.${checklistId}`)).length, 1);
  });

  await step("outra empresa não acessa nada pela URL", other, async () => {
    for (const path of [`/checklists/${checklistId}`, `/executions/${assignmentId}`, `/history/${executionId}`, "/action-plans", "/dashboard"]) {
      await open(other, path);
      await other.waitForTimeout(1_000);
      const text = await other.locator("body").innerText();
      for (const secret of ["Abertura do bar", "Extintor sem lacre", "Maria da Silva", "Executor Teste", "Loja Centro"]) {
        assert.ok(!(path === "/dashboard" ? "" : text).includes(secret), `${path} mostra "${secret}"`);
      }
      assert.ok(!/Executor Teste|Extintor sem lacre|Maria da Silva|Loja Centro/.test(text), `${path} vaza dados`);
      assert.ok(text.trim().length > 0, `${path} ficou em branco`);
    }
  });

  await step("executor desativado perde o acesso", phone, async () => {
    await admin(`/rest/v1/organization_members?user_id=eq.${executor.id}&organization_id=eq.${organizationId}`, { active: false }, "PATCH");
    await open(phone, "/dashboard");
    await phone.getByText("Organização do usuário não encontrada.").first().waitFor();
    await open(phone, `/executions/${assignmentId}`);
    await phone.waitForTimeout(1_500);
    const text = await phone.locator("body").innerText();
    assert.ok(!text.includes("Maria da Silva") && !text.includes("Extintor sem lacre"), "desativado ainda vê a execução");
    assert.ok(text.trim().length > 0, "tela em branco");
  });
} finally {
  await browser.close();
  console.log(steps.join("\n"));
  console.log(`Erros de página (${pageErrors.length}):\n${pageErrors.join("\n") || "nenhum"}`);
  console.log(`Hosts externos bloqueados: ${[...blocked].join(", ") || "nenhum"}`);
}
