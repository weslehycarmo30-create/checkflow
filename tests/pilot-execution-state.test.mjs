import assert from "node:assert/strict";
import test from "node:test";
import { executionProgress, isAnswered, mutationFailureMessage, requiredExecutionItems, selectReusableAssignment } from "../lib/pilot-execution-state.mjs";

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
