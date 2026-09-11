import test from "node:test";
import assert from "node:assert/strict";
import { SDR_STAGES, calculateScore, findDuplicate, importProspects, parseCsv, tierForScore } from "../lib/sdr-engine.mjs";

test("SDR score is bounded and HOT starts at 85", () => {
  const score = calculateScore({ company_name:"Bar Aurora", cidade:"Brasília", segmento:"bares", whatsapp:"61999999999", email:"oi@aurora.com", tamanho_equipe:20, campanha:"Q4", origem:"indicação" });
  assert.equal(score, 95); assert.equal(tierForScore(85), "HOT"); assert.equal(tierForScore(84), "WARM");
});
test("dedupe follows domain, phone, Instagram, then company and city", () => {
  const existing = [{company_name:"Bar Aurora",cidade:"Brasília",email:"oi@aurora.com",whatsapp:"61999999999",instagram:"@baraurora"}];
  assert.equal(findDuplicate({email:"x@aurora.com"}, existing).reason, "domínio");
  assert.equal(findDuplicate({whatsapp:"(61) 99999-9999"}, existing).reason, "telefone");
  assert.equal(findDuplicate({instagram:"baraurora"}, existing).reason, "Instagram");
  assert.equal(findDuplicate({company_name:"bar aurora",cidade:"BRASÍLIA"}, existing).reason, "nome + cidade");
});
test("dry-run reports conflicts and never adds duplicates", () => {
  const result = importProspects([{company_name:"A",cidade:"DF"},{company_name:"A",cidade:"DF"}], [], {dryRun:true});
  assert.equal(result.imported.length, 1); assert.equal(result.conflicts.length, 1); assert.equal(result.dryRun, true);
});
test("pipeline has dedicated CheckFlow stages", () => {
  assert.deepEqual(SDR_STAGES.slice(0,3), ["RAW LEAD","LEAD PESQUISADO","SDR QUALIFIED"]);
  assert.equal(SDR_STAGES.at(-1), "LOST"); assert.equal(SDR_STAGES.length, 10);
});
test("CSV parser preserves the commercial fields", () => {
  const rows = parseCsv("company_name,cidade,observacoes\nBar Aurora,Brasília,\"abre, fecha tarde\"");
  assert.deepEqual(rows[0], {company_name:"Bar Aurora",cidade:"Brasília",observacoes:"abre, fecha tarde"});
});
