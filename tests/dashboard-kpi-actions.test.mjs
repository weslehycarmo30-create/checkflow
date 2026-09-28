import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("dashboard operational metric cards point to existing destinations", () => {
  assert.match(dashboard, /label:"Checklists disponíveis"[\s\S]*?open:\(\)=>setSection\("Operação"\)/);
  assert.match(dashboard, /label:"Em execução ou pausados"[\s\S]*?open:\(\)=>setSection\("Operação"\)/);
  assert.match(dashboard, /label:"Conformidade média"[\s\S]*?open:\(\)=>setSection\("Histórico"\)/);
  assert.match(dashboard, /label:"Não conformidades abertas"[\s\S]*?window\.location\.href="\/action-plans"/);
});

test("dashboard metric cards retain their indicators and use accessible button semantics", () => {
  assert.match(dashboard, /value:String\(checklists\.length\)/);
  assert.match(dashboard, /value:String\(active\)/);
  assert.match(dashboard, /value:conformity===null\?"—":`\$\{conformity\}%`/);
  assert.match(dashboard, /value:String\(nonConformities\)/);
  assert.match(dashboard, /<button type="button" className="kpi"[\s\S]*?aria-label=\{`Abrir \$\{k\.destination\}: \$\{k\.label\}`\}/);
  assert.match(styles, /\.kpi:focus-visible\{outline:3px solid #7fc7ca/);
});
