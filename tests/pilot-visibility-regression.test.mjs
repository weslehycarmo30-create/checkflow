import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isFailureLocked, requiredExecutionItems } from "../lib/pilot-execution-state.mjs";
import { OPEN_NON_CONFORMITY_STATUSES } from "../lib/non-conformity-status.mjs";
import { HISTORY_LIMIT, limitHistory, reportMayBeIncomplete } from "../lib/operational-report.mjs";

const item = { id: "bar", required: true, answer_type: "yes_no" };

test("a 'no' that was not registered blocks completion even when an older occurrence exists", () => {
  assert.deepEqual(requiredExecutionItems([item], { bar: "Não" }, { bar: "Sem gelo" }, ["bar"], ["bar"]), [item]);
  const optional = { ...item, required: false };
  assert.deepEqual(requiredExecutionItems([optional], { bar: "Não" }, {}, [], ["bar"]), [optional]);
  assert.deepEqual(requiredExecutionItems([item], { bar: "Não" }, { bar: "Sem gelo" }, ["bar"], []), []);
});

test("a registered non-conformity locks the 'no' answer", () => {
  assert.equal(isFailureLocked("bar", "Não", ["bar"], []), true);
  assert.equal(isFailureLocked("bar", "Não", ["bar"], ["bar"]), false);
  assert.equal(isFailureLocked("bar", "Não", [], []), false);
  assert.equal(isFailureLocked("bar", "Sim", ["bar"], []), false);
});

test("a rejected correction still counts as an open non-conformity", async () => {
  const schema = await readFile(new URL("../supabase/migrations/202607220001_base_multitenant.sql", import.meta.url), "utf8");
  const all = schema.match(/non_conformity_status as enum \(([^)]*)\)/)[1].match(/'[a-z_]+'/g).map(value => value.slice(1, -1));
  assert.deepEqual([...OPEN_NON_CONFORMITY_STATUSES].sort(), all.filter(status => status !== "completed").sort());
  const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /\.in\("status",\s*OPEN_NON_CONFORMITY_STATUSES\)/);
});

const completed = count => Array.from({ length: count }, (_, index) => ({ completed_at: new Date(Date.UTC(2026, 10, 27, 12) - index * 3_600_000).toISOString() }));

test("history keeps the newest rows and knows when something was left out", () => {
  assert.deepEqual(limitHistory(completed(HISTORY_LIMIT)), { rows: completed(HISTORY_LIMIT), truncated: false });
  const over = limitHistory(completed(HISTORY_LIMIT + 1));
  assert.equal(over.truncated, true);
  assert.deepEqual(over.rows, completed(HISTORY_LIMIT));
});

test("the report warns only when the selected period reaches beyond the loaded rows", () => {
  const now = new Date(Date.UTC(2026, 10, 27, 13));
  const rows = completed(HISTORY_LIMIT); // oldest is about two days old
  assert.equal(reportMayBeIncomplete(rows, true, { days: 7, now }), true);
  assert.equal(reportMayBeIncomplete(rows, true, { days: 1, now }), false);
  assert.equal(reportMayBeIncomplete(rows, false, { days: 90, now }), false);
});
