import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildQualifiedSalesWhatsAppUrl, getSalesWhatsAppUrl } from "../lib/sales-contact.ts";

const landing = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const pilotCta = await readFile(new URL("../components/landing-pilot-cta.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const auth = await readFile(new URL("../app/auth/page.tsx", import.meta.url), "utf8");
const publicCopy = landing + pilotCta;

test("public landing presents the pilot and only supported operational capabilities", () => {
  assert.match(landing, /Sua operação<br \/><em>sob controle\.<\/em>/);
  assert.match(landing, /href="#demonstracao"/);
  assert.match(landing, /id="piloto"/);
  assert.match(landing, /não conformidades/i);
  assert.match(landing, /planos? de ação/i);
  assert.match(landing, /testa durante 14 dias/);
  assert.match(landing, /<li>14 dias<\/li>/);
  assert.match(landing, /1 organização/);
  assert.match(landing, /até 48 horas/);
  assert.doesNotMatch(publicCopy, /15 dias/i);
  assert.doesNotMatch(publicCopy, /inteligência artificial|offline completo|QR Code|integrações/i);
});

test("landing exposes search metadata for the official domain", () => {
  assert.match(landing, /metadataBase: new URL\(siteUrl\)/);
  assert.match(landing, /const siteUrl = "https:\/\/checkflow\.tec\.br"/);
  assert.match(landing, /alternates: \{ canonical: "\/" \}/);
  assert.match(landing, /\/brand\/checkflow-og\.png/);
  assert.match(landing, /application\/ld\+json/);
  assert.match(landing, /replace\(\/<\/g, "\\u003c"\)/);
});

test("root is public while app entry remains protected at dashboard", () => {
  assert.doesNotMatch(landing, /PrivateRouteGuard/);
  assert.match(dashboard, /PrivateRouteGuard/);
  assert.match(auth, /window\.location\.replace\("\/dashboard"\)/);
});

test("pilot contact uses a valid configured WhatsApp destination or a safe signup fallback", async () => {
  const contact = await readFile(new URL("../lib/sales-contact.ts", import.meta.url), "utf8");
  assert.match(landing, /NEXT_PUBLIC_CHECKFLOW_SALES_WHATSAPP/);
  assert.match(pilotCta, /NEXT_PUBLIC_CHECKFLOW_SALES_WHATSAPP/);
  assert.match(pilotCta, /if \(!salesAvailable\) \{\s*return <a className=\{className\} href="\/auth">Criar conta da empresa/);
  assert.match(pilotCta, /Começar meu piloto/);
  assert.match(pilotCta, /role="dialog" aria-modal="true"/);
  assert.match(pilotCta, /event\.key === "Escape"/);
  assert.match(pilotCta, /opener\?\.focus\(\)/);
  assert.match(pilotCta, /Continuar explorando/);
  assert.match(contact, /https:\/\/wa\.me/);
  assert.match(contact, /encodeURIComponent\(pilotMessage\)/);
  assert.match(contact, /piloto de 14 dias/);
  assert.doesNotMatch(contact, /15 dias/i);
  assert.equal(getSalesWhatsAppUrl(undefined), null);
  assert.equal(getSalesWhatsAppUrl(""), null);
  assert.equal(getSalesWhatsAppUrl("123"), null);
  const message = "Olá! Quero conhecer o CheckFlow e entender como funciona o piloto de 14 dias para minha operação.";
  const expected = `https://wa.me/5561986428650?text=${encodeURIComponent(message)}`;
  assert.equal(getSalesWhatsAppUrl("5561986428650"), expected);
  assert.equal(getSalesWhatsAppUrl("+55 (61) 98642-8650"), expected);
  assert.equal(new URL(expected).searchParams.get("text"), message);
  assert.match(pilotCta, /buildQualifiedSalesWhatsAppUrl/);
  assert.match(pilotCta, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
  assert.match(pilotCta, /maxLength=\{180\}/);
  assert.equal((landing.match(/<PilotCta[ />]/g) ?? []).length, 2);
  assert.match(landing, /href="#como-funciona"/);
  assert.match(landing, /href="\/auth"/);
  assert.doesNotMatch(landing, /href="#"/);
  assert.doesNotMatch(landing, /href="#contato"/);
});

test("qualification stays local and safely encodes the commercial WhatsApp message", () => {
  const qualification = { name: "Ana\nSilva", company: "Café & Co", operation: "Restaurante", process: "Abertura & higiene" };
  const url = buildQualifiedSalesWhatsAppUrl("+55 (61) 98642-8650", qualification);
  assert.ok(url);
  const message = new URL(url).searchParams.get("text");
  assert.match(message, /Nome: Ana Silva/);
  assert.match(message, /Empresa: Café & Co/);
  assert.match(message, /Primeiro processo: Abertura & higiene/);
  assert.equal(buildQualifiedSalesWhatsAppUrl("5561986428650", { ...qualification, process: " " }), null);
  assert.equal(buildQualifiedSalesWhatsAppUrl(undefined, qualification), null);
  assert.doesNotMatch(publicCopy, /fetch\(|supabase|insert\(/i);
});

test("the landing page does not promise recurring routines, which the product does not have yet", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /recorrente|automaticamente|agendad|lembrete/i);
});
