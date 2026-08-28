import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseURL = process.env.CHECKFLOW_E2E_BASE_URL || "http://127.0.0.1:3000";
const chromePath = process.env.CHECKFLOW_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const password = "Checkflow123!";
const users = {
  owner: "owner-e2e@checkflow.test",
  manager: "manager-e2e@checkflow.test",
  executor: "executor-e2e@checkflow.test",
};
const checks = [];
const evidenceDir = new URL("../test-results/", import.meta.url);
const evidencePath = name => fileURLToPath(new URL(name, evidenceDir));

function check(name, condition, detail = "") {
  assert.ok(condition, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push({ name, result: "PASS", detail });
}

async function login(page, email) {
  console.log(`LOGIN ${email}`);
  await page.goto(`${baseURL}/auth`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await passwordInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.getByRole("button", { name: "Entrar" }).click({ force: true });
  await page.waitForURL(`${baseURL}/`, { timeout: 120000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(5_000);
  await page.locator(".workspace").filter({ hasText: "Organização E2E A" }).waitFor({ state: "visible", timeout: 30_000 });
}

async function logout(page) {
  await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".workspace").waitFor({ state: "visible", timeout: 30_000 });
  const mobileMenu = page.getByRole("button", { name: "Abrir menu" });
  if (await mobileMenu.count()) {
    await mobileMenu.waitFor({ state: "visible", timeout: 30_000 });
    await mobileMenu.click();
    await page.locator(".sidebar.open").waitFor({ state: "visible", timeout: 30_000 });
  }
  const logoutButtons = page.locator('.sidebar.open button[aria-label="Sair do CheckFlow"], .sidebar:not(.open) button[aria-label="Sair do CheckFlow"]');
  for (let index = 0; index < await logoutButtons.count(); index += 1) {
    const button = logoutButtons.nth(index);
    if (await button.isVisible()) {
      await button.scrollIntoViewIfNeeded();
      await button.click();
      break;
    }
  }
  await page.waitForURL(/\/auth$/, { timeout: 120000 });
}

async function noHorizontalScroll(page, viewport) {
  const widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  check(`sem rolagem horizontal em ${viewport}`, widths.scroll <= widths.inner + 1, JSON.stringify(widths));
}

async function main() {
  console.log(`START ${baseURL}`);
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  await page.goto(`${baseURL}/auth`, { waitUntil: "domcontentloaded" });
  console.log("AUTH READY");
  check("login compreensível", await page.getByRole("heading", { name: "Entrar" }).isVisible());
  await login(page, users.owner);
  check("organização e usuário owner visíveis", await page.locator(".workspace").filter({ hasText: "Organização E2E A" }).isVisible());
  check("owner encontra criação de checklist", await page.getByRole("button", { name: /Novo checklist/ }).isVisible());
  await page.getByRole("button", { name: /Novo checklist/ }).click();
  console.log("OWNER DASHBOARD");
  await page.getByLabel("Nome do checklist").fill("Ronda mobile original");
  await page.getByLabel("Área da operação").selectOption({ label: "Bar" });
  await page.getByRole("button", { name: "Criar checklist" }).click();
  await page.getByText("Ronda mobile original", { exact: true }).first().click();
  await page.waitForURL(/\/checklists\//);
  await page.getByPlaceholder("Nome da nova seção").fill("Abertura");
  await page.getByRole("button", { name: "Adicionar seção" }).click();
  const section = page.locator(".checklist-section").first();
  const itemInput = section.getByPlaceholder("Novo item obrigatório");
  await itemInput.fill("Porta conferida");
  await section.getByRole("combobox", { name: "Tipo de resposta" }).selectOption("yes_no");
  await section.getByRole("button", { name: "Adicionar item" }).click();
  await itemInput.fill("Temperatura conferida");
  await section.getByRole("combobox", { name: "Tipo de resposta" }).selectOption("yes_no");
  await section.getByRole("button", { name: "Adicionar item" }).click();
  await itemInput.fill("Foto da bancada");
  await section.getByRole("combobox", { name: "Tipo de resposta" }).selectOption("photo");
  await section.getByRole("button", { name: "Adicionar item" }).click();
  await page.locator(".checklist-item").nth(2).waitFor({ state: "visible" });
  check("itens criados e inicialmente não marcados", await page.locator(".checklist-item").count() === 3 && await page.locator(".item-unanswered").count() === 3);
  await page.locator(".assignment-card select").first().selectOption({ label: "Executor E2E" });
  await page.getByRole("button", { name: "Atribuir ao colaborador" }).click();
  console.log("CHECKLIST ASSIGNED");
  await page.locator(".current-assignments").getByText("Executor E2E", { exact: true }).waitFor({ state: "visible" });
  check("atribuição persistida", true);
  await page.screenshot({ path: evidencePath("owner-checklist-360.png"), fullPage: true });
  await logout(page);

  await login(page, users.executor);
  console.log("EXECUTOR DASHBOARD");
  check("executor encontra tarefa sem orientação", await page.getByText("Ronda mobile original", { exact: true }).isVisible());
  await page.getByText("Ronda mobile original", { exact: true }).first().click();
  await page.waitForURL(/\/executions\//);
  const startButton = page.getByRole("button", { name: "Iniciar checklist" });
  await startButton.waitFor({ state: "visible" });
  check("poucos passos até iniciar", await startButton.isVisible());
  await page.getByRole("button", { name: "Iniciar checklist" }).click();
  console.log("EXECUTION STARTED");
  await page.waitForTimeout(400);
  const answerSelects = page.locator(".execution-item select");
  check("itens ainda não começam marcados", await answerSelects.count() === 2 && await answerSelects.nth(0).inputValue() === "" && await answerSelects.nth(1).inputValue() === "");
  check("progresso inicial mostra pendências", (await page.locator(".progress-label").innerText()).includes("0%"));
  await answerSelects.nth(0).selectOption("Sim");
  await page.getByText("Resposta salva.").waitFor();
  await page.getByRole("button", { name: "Pausar" }).click();
  await page.waitForTimeout(300);
  check("pausar confirma preservação", await page.getByText("Execução pausada. Suas respostas foram preservadas.").isVisible());
  await page.reload({ waitUntil: "domcontentloaded" });
  check("continuar não perde resposta", await answerSelects.nth(0).inputValue() === "Sim");
  await page.getByRole("button", { name: "Continuar checklist" }).click();
  await answerSelects.nth(1).selectOption("Não");
  const observation = page.locator("textarea").first();
  check("falha obrigatória impede avanço", await page.getByRole("button", { name: "Finalizar checklist" }).isDisabled());
  await observation.fill("Temperatura acima do limite");
  await page.getByRole("button", { name: "Registrar não conformidade" }).click();
  const photoInput = page.locator('input[type="file"]').first();
  await photoInput.setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("não é uma foto") });
  check("upload inválido não produz falso sucesso", await page.getByText(/Formato inválido/).isVisible());
  await photoInput.setInputFiles({ name: "bancada.jpg", mimeType: "image/jpeg", buffer: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2w==", "base64") });
  const photoSuccess = page.getByText(/Fotografia salva e vinculada/);
  await photoSuccess.waitFor({ state: "visible", timeout: 30000 });
  check("foto adicionada facilmente", await photoSuccess.isVisible());
  await page.getByRole("button", { name: "Finalizar checklist" }).click();
  console.log("EXECUTION COMPLETED");
  const completedHeading = page.getByRole("heading", { name: "Checklist finalizado", exact: true });
  await completedHeading.waitFor({ state: "visible", timeout: 30_000 });
  check("conclusão inequívoca", await completedHeading.isVisible());
  await page.screenshot({ path: evidencePath("executor-completed-360.png"), fullPage: true });
  await logout(page);

  await login(page, users.manager);
  console.log("MANAGER DASHBOARD");
  check("manager não recebe CTA de execução", await page.getByRole("button", { name: "Iniciar checklist" }).count() === 0);
  await page.goto(`${baseURL}/action-plans`, { waitUntil: "domcontentloaded" });
  const unplannedHeading = page.getByRole("heading", { name: "Não conformidades sem plano", exact: true });
  await unplannedHeading.waitFor({ state: "visible", timeout: 30_000 });
  check("gestor acompanha não conformidade", await unplannedHeading.isVisible());
  const unplanned = page.locator(".unplanned-card").first();
  await unplanned.locator("select").selectOption({ label: "Executor E2E" });
  await unplanned.locator('input[type="datetime-local"]').fill("2030-01-01T12:00");
  await unplanned.getByRole("button", { name: "Criar plano" }).click();
  const planCreated = page.getByText("Plano de ação criado e atribuído.", { exact: true });
  await planCreated.waitFor({ state: "visible", timeout: 30_000 });
  check("ação corretiva com responsável e prazo", await planCreated.isVisible());
  await logout(page);

  await login(page, users.executor);
  await page.goto(`${baseURL}/action-plans`, { waitUntil: "domcontentloaded" });
  const plan = page.locator(".plan-card").first();
  await plan.locator('input[type="file"]').setInputFiles({ name: "correcao.jpg", mimeType: "image/jpeg", buffer: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2w==", "base64") });
  const correctionSent = page.getByText("Correção enviada para validação do gestor.", { exact: true });
  await correctionSent.waitFor({ state: "visible", timeout: 30_000 });
  check("executor envia correção", await correctionSent.isVisible());
  await logout(page);

  await login(page, users.manager);
  await page.goto(`${baseURL}/action-plans`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Aprovar correção" }).click();
  console.log("CORRECTION VALIDATED");
  const correctionApproved = page.getByText("Correção aprovada.", { exact: true });
  await correctionApproved.waitFor({ state: "visible", timeout: 30_000 });
  check("gestor valida correção", await correctionApproved.isVisible());
  await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
  const currentChecklist = page.locator(".tasks-panel .recent-row").filter({ hasText: "Ronda mobile original" }).first();
  await currentChecklist.click();
  await page.waitForURL(/\/checklists\//);
  await page.getByRole("button", { name: "Editar" }).click();
  const nameInput = page.locator('.edit-form input').first();
  await nameInput.fill("Ronda mobile V2");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  const v2Name = page.getByText("Ronda mobile V2", { exact: true });
  await v2Name.waitFor({ state: "visible", timeout: 30_000 });
  check("gestor altera o template para V2", await v2Name.isVisible());
  const v2Section = page.locator(".checklist-section").first();
  await v2Section.getByPlaceholder("Novo item obrigatório").fill("Lacre conferido V2");
  await v2Section.getByRole("button", { name: "Adicionar item" }).click();
  const v2Item = page.getByText("Lacre conferido V2", { exact: true });
  await v2Item.waitFor({ state: "visible", timeout: 30_000 });
  check("template V2 recebe estrutura nova", await v2Item.isVisible());
  await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ver histórico" }).click();
  await page.getByText("Ronda mobile original", { exact: true }).last().click();
  await page.waitForURL(/\/history\//);
  const historyName = page.getByText("Ronda mobile original", { exact: true });
  const historyItem = page.getByText("Temperatura conferida", { exact: true });
  await historyName.waitFor({ state: "visible", timeout: 30_000 });
  await historyItem.waitFor({ state: "visible", timeout: 30_000 });
  check("histórico mostra snapshot correto", await historyName.isVisible() && await historyItem.isVisible());
  check("histórico V1 não recebe item da V2", !(await page.getByText("Lacre conferido V2", { exact: true }).count()));
  check("conclusão deixa de aparecer como iniciar", !(await page.getByRole("button", { name: "Iniciar checklist" }).count()));
  await page.screenshot({ path: evidencePath("manager-history-360.png"), fullPage: true });
  await noHorizontalScroll(page, "360x800");

  await logout(page);
  await login(page, users.executor);
  check("executor vê template V2 após alteração", await page.getByText("Ronda mobile V2", { exact: true }).isVisible());
  await page.screenshot({ path: evidencePath("executor-v2-360.png"), fullPage: true });
  await logout(page);

  for (const viewport of [{ width: 390, height: 844, name: "390x844" }, { width: 412, height: 915, name: "412x915" }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${baseURL}/auth`, { waitUntil: "domcontentloaded" });
    await noHorizontalScroll(page, viewport.name);
    check(`login legível em ${viewport.name}`, await page.getByRole("heading", { name: "Entrar" }).isVisible());
  }

  await browser.close();
  await writeFile(new URL("e2e-mobile-results.json", evidenceDir), JSON.stringify({ baseURL, viewports: ["360x800", "390x844", "412x915"], checks }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, passed: checks.length, viewports: ["360x800", "390x844", "412x915"] }));
}

main().catch(async error => {
  console.error(error);
  process.exitCode = 1;
});
