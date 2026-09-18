import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { executionProgress, executionSectionsFromSnapshot, isAnswered, mutationFailureMessage, requiredExecutionItems, selectReusableAssignment } from "../lib/pilot-execution-state.mjs";

test("execution state treats rating zero as persisted and computes mobile progress", () => {
  const items = [{ id: "zero", required: true, answer_type: "rating" }, { id: "note", required: true, answer_type: "long_text" }];
  assert.equal(isAnswered(0), true);
  assert.equal(executionProgress(items, { zero: 0, note: "" }), 50);
  assert.deepEqual(requiredExecutionItems(items, { zero: 0, note: "" }, {}, []), [items[1]]);
});

test("required no answer blocks completion until observation and NC both persist", () => {
  const item = { id: "bar", required: true, answer_type: "yes_no" };
  assert.equal(requiredExecutionItems([item], { bar: "Não" }, { bar: "Sem gelo" }, []).length, 1);
  assert.equal(requiredExecutionItems([item], { bar: "Não" }, { bar: "Sem gelo" }, ["bar"]).length, 0);
});

test("one unanswered required item stays at zero progress and is not eligible for completion", () => {
  const items = [{ id: "required", required: true, answer_type: "checkbox" }];
  assert.equal(executionProgress(items, {}), 0);
  assert.deepEqual(requiredExecutionItems(items, {}, {}, []), items);
  assert.equal(isAnswered(false, "checkbox"), false);
  assert.equal(executionProgress(items, { required: false }), 0);
  assert.deepEqual(requiredExecutionItems(items, { required: false }, {}, []), items);
  assert.equal(executionProgress(items, { required: true }), 100);
  assert.equal(requiredExecutionItems(items, { required: true }, {}, []).length, 0);
});

test("partial persisted answers produce proportional progress and rendering does not mutate them", () => {
  const items = [
    { id: "one", required: true, answer_type: "checkbox" },
    { id: "two", required: true, answer_type: "checkbox" },
    { id: "three", required: false, answer_type: "long_text" },
  ];
  const answers = { one: true, two: false };
  assert.equal(executionProgress(items, answers), 33);
  assert.equal(requiredExecutionItems(items, answers, {}, []).length, 1);
  assert.deepEqual(answers, { one: true, two: false });
});

test("optional checkbox false does not block completion, while yes/no false remains a response", () => {
  const optionalCheckbox = { id: "optional", required: false, answer_type: "checkbox" };
  const requiredYesNo = { id: "yes-no", required: true, answer_type: "yes_no" };
  assert.equal(executionProgress([optionalCheckbox], { optional: false }), 0);
  assert.equal(requiredExecutionItems([optionalCheckbox], { optional: false }, {}, []).length, 0);
  assert.equal(isAnswered(false, "yes_no"), true);
  assert.equal(requiredExecutionItems([requiredYesNo], { "yes-no": false }, { "yes-no": "Não conforme" }, ["yes-no"]).length, 0);
});

test("an existing execution renders its persisted snapshot rather than live checklist sections", () => {
  const snapshotSections = [{ id: "saved", checklist_items: [{ id: "required", required: true }] }];
  assert.equal(executionSectionsFromSnapshot({ version: 1, sections: snapshotSections }), snapshotSections);
  assert.equal(executionSectionsFromSnapshot({ version: 1 }), null);
});

test("database regression explicitly rejects completion without persisted required answers", async () => {
  const sql = await readFile(new URL("../supabase/tests/checkflow_start_completion_from_persisted_answers.sql", import.meta.url), "utf8");
  assert.match(sql, /completion without persisted required answer was accepted/);
  assert.match(sql, /completion with false required checkbox was accepted/);
  assert.match(sql, /false checkbox rejection persisted completed_at or status/);
  assert.match(sql, /rejected completion altered persisted state/);
  assert.match(sql, /true checkbox or false yes\/no was not interpreted correctly/);
});

test("completed cycles are never selected for reuse", () => {
  const completed = { id: "completed" }, active = { id: "active" }, unused = { id: "unused" };
  const executions = new Map([[completed.id, [{ status: "completed" }]], [active.id, [{ status: "paused" }]]]);
  assert.equal(selectReusableAssignment([completed, active, unused], executions), active);
  assert.equal(selectReusableAssignment([completed], executions), null);
});

test("post-persistence refresh failure is fail-safe and does not invite a duplicate retry", () => {
  assert.match(mutationFailureMessage(true, "Plano criado"), /Atualize antes de tentar novamente/);
  assert.match(mutationFailureMessage(false, "Criar o plano"), /Verifique a conexão/);
});
