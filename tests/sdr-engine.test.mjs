import test from "node:test";
import assert from "node:assert/strict";
import { SDR_STAGES, calculateScore, findDuplicate, importProspects, parseCsv, tierForScore } from "../lib/sdr-engine.mjs";
import { SDR_STORAGE_KEY, loadSdrProspects, saveSdrProspects } from "../lib/sdr-storage.mjs";
import { readFileSync } from "node:fs";

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
test("storage loads only after the client hydration step and preserves existing records", () => {
  const existing = [{ id:"p-100", company_name:"Cem Leads", timeline:[] }];
  let writes = 0;
  const storage = { getItem:key=>key===SDR_STORAGE_KEY?JSON.stringify(existing):null, setItem:()=>writes++ };
  const loaded = loadSdrProspects(storage);
  assert.equal(loaded.status, "loaded"); assert.deepEqual(loaded.prospects, existing); assert.equal(writes, 0);
});
test("empty, corrupt, unavailable and quota-failed storage never clears existing data", () => {
  const empty = { getItem:()=>null, setItem:()=>{} };
  const corrupt = { getItem:()=>"{bad", setItem:()=>{ throw new Error("must not write"); } };
  const unavailable = { getItem:()=>{ throw new Error("blocked"); }, setItem:()=>{ throw new Error("blocked"); } };
  assert.equal(loadSdrProspects(empty).status, "empty");
  assert.equal(loadSdrProspects(corrupt).status, "invalid");
  assert.equal(loadSdrProspects(unavailable).status, "unavailable");
  assert.equal(saveSdrProspects(unavailable, [{id:"new"}]).ok, false);
});
test("save then reload preserves created and edited prospects", () => {
  let raw = null;
  const storage = { getItem:()=>raw, setItem:(_key,value)=>{ raw=value; } };
  const afterCreate = [{id:"p-1",company_name:"Aurora",stage:"RAW LEAD",timeline:[]}];
  assert.equal(saveSdrProspects(storage, afterCreate).ok, true);
  const afterEdit = [{...afterCreate[0],stage:"DEMO AGENDADA",timeline:[{id:"a-1",note:"confirmada"}]}];
  assert.equal(saveSdrProspects(storage, afterEdit).ok, true);
  assert.deepEqual(loadSdrProspects(storage).prospects, afterEdit);
});
test("hydration shell is deterministic and browser storage is gated behind mount", () => {
  const source = readFileSync(new URL("../app/crm/page.tsx", import.meta.url), "utf8");
  assert.match(source, /useState<Prospect\[\]>\(\[\]\)/);
  assert.match(source, /const \[hydrated, setHydrated\] = useState\(false\)/);
  assert.match(source, /if \(!hydrated\) return <main/);
  assert.match(source, /if \(!hydrated \|\| !storageWritable\) return;\s*if \(!saveSdrProspects/s);
  assert.match(source, /setStorageWritable\(result.status === "loaded" \|\| result.status === "empty"\)/);
  assert.doesNotMatch(source, /useState<Prospect\[\]>\(\(\) =>/);
});
