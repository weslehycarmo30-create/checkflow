import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildOperationalReport, reportToCsv } from "../lib/operational-report.mjs";

const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const now = new Date("2026-11-16T12:00:00.000Z");
const daysAgo = days => new Date(now.getTime() - days * 86_400_000).toISOString();
const history = [
  { id: "1", checklist_name: "Abertura do bar", executor_name: "Ana", completed_at: daysAgo(1), conformity_percentage: 100 },
  { id: "2", checklist_name: "Abertura do bar", executor_name: "Bruno", completed_at: daysAgo(3), conformity_percentage: 60 },
  { id: "3", checklist_name: "Fechamento do bar", executor_name: "Ana", completed_at: daysAgo(10), conformity_percentage: 90 },
  { id: "4", checklist_name: "Fechamento do bar", executor_name: "Ana", completed_at: daysAgo(40), conformity_percentage: 20 },
  { id: "5", checklist_name: "Operação do evento", executor_name: "Bruno", completed_at: daysAgo(2), conformity_percentage: null },
  { id: "6", checklist_name: "Sem data", executor_name: "Ana", completed_at: "", conformity_percentage: 100 },
];

test("report only counts completions inside the selected period", () => {
  assert.equal(buildOperationalReport(history, { days: 7, now }).completions, 3);
  assert.equal(buildOperationalReport(history, { days: 30, now }).completions, 4);
  assert.equal(buildOperationalReport(history, { days: 90, now }).completions, 5);
});

test("average conformity ignores executions without a percentage and flags low ones", () => {
  const report = buildOperationalReport(history, { days: 7, now });
  assert.equal(report.average_conformity, 80);
  assert.equal(report.below_threshold, 1);
  assert.equal(buildOperationalReport([], { days: 7, now }).average_conformity, null);
});

test("report groups by checklist and by executor, busiest first", () => {
  const report = buildOperationalReport(history, { days: 30, now });
  assert.deepEqual(report.by_checklist.map(row => [row.name, row.completions, row.average_conformity]), [
    ["Abertura do bar", 2, 80],
    ["Fechamento do bar", 1, 90],
    ["Operação do evento", 1, null],
  ]);
  assert.deepEqual(report.by_executor.map(row => [row.name, row.completions]), [["Ana", 2], ["Bruno", 2]]);
  assert.equal(report.by_checklist[0].last_completed_at, daysAgo(1));
});

test("CSV export quotes cells and neutralizes spreadsheet formulas", () => {
  const report = buildOperationalReport([
    { id: "x", checklist_name: '=HYPERLINK("http://x")', executor_name: 'Ana "Chefe"', completed_at: daysAgo(1), conformity_percentage: 75 },
  ], { days: 7, now });
  const [header, row] = reportToCsv(report).split("\r\n");
  assert.equal(header, '"Checklist";"Executor";"Concluído em";"Conformidade (%)"');
  assert.ok(row.startsWith(`"'=HYPERLINK(""http://x"")";"Ana ""Chefe"""`), row);
  assert.ok(row.endsWith('"75"'));
});

test("models and reports menus are shown only to owners and managers; reports use real history", () => {
  assert.match(dashboard, /\["Relatórios","chart"\]/);
  assert.match(dashboard, /managerOnlySections = new Set<string>\(\["Modelos","Relatórios"\]\)/);
  assert.match(dashboard, /nav\.filter\(\(\[label\]\)=>!managerOnlySections\.has\(label\)\|\|\(viewerRole!==""&&viewerRole!=="collaborator"\)\)/);
  assert.match(dashboard, /section==="Relatórios" && <OperationalReport history=\{history\}/);
  assert.match(dashboard, /section!=="Relatórios"&&<Generic/);
});
