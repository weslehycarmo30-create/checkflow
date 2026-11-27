import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createSerialQueue, retryOnLockConflict, executionProgress, executionSectionsFromSnapshot, isAnswered, mutationFailureMessage, requiredExecutionItems, selectReusableAssignment } from "../lib/pilot-execution-state.mjs";

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
  // Shape written by public.build_execution_snapshot: items live under "items".
  const snapshotSections = [
    { id: "second", position: 1, items: [{ id: "b", position: 0 }] },
    { id: "saved", position: 0, items: [{ id: "optional", position: 1 }, { id: "required", position: 0, required: true }] },
  ];
  const sections = executionSectionsFromSnapshot({ version: 1, sections: snapshotSections });
  assert.deepEqual(sections.map(section => [section.id, section.checklist_items.map(item => item.id)]), [["saved", ["required", "optional"]], ["second", ["b"]]]);
  assert.deepEqual(executionSectionsFromSnapshot({ version: 1, sections: [{ id: "empty", position: 0 }] })[0].checklist_items, []);
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

test("the snapshot key written by the database matches what the screen reads", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608260002_execution_historical_snapshot.sql", import.meta.url), "utf8");
  assert.match(sql, /'items', coalesce\(\(/);
});

test("writes run one at a time and a failure does not block the next", async () => {
  const queue = createSerialQueue();
  const events = [];
  let running = 0;
  const job = (name, fail) => async () => {
    assert.equal(running, 0, "two writes overlapped");
    running += 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    running -= 1;
    events.push(name);
    if (fail) throw new Error(name);
    return name;
  };
  const results = await Promise.allSettled([queue(job("a")), queue(job("b", true)), queue(job("c"))]);
  assert.deepEqual(events, ["a", "b", "c"]);
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "rejected", "fulfilled"]);
});

test("only lock conflicts are retried, and only a few times", async () => {
  const wait = async () => {};
  const attempts = outcomes => { let count = 0; return { run: () => Promise.resolve(outcomes[Math.min(count++, outcomes.length - 1)]), count: () => count }; };
  const conflict = { error: { code: "55P03" } };

  const recovers = attempts([conflict, conflict, { error: null }]);
  assert.deepEqual(await retryOnLockConflict(recovers.run, { wait }), { error: null });
  assert.equal(recovers.count(), 3);

  const stuck = attempts([conflict]);
  assert.deepEqual(await retryOnLockConflict(stuck.run, { wait }), conflict);
  assert.equal(stuck.count(), 4);

  const denied = attempts([{ error: { code: "42501" } }]);
  await retryOnLockConflict(denied.run, { wait });
  assert.equal(denied.count(), 1);
});

test("the execution screen sends every write through the queue and signs only photo answers", async () => {
  const screen = await readFile(new URL("../app/executions/[assignmentId]/checklist-execution.tsx", import.meta.url), "utf8");
  assert.equal((screen.match(/await write\(\(\)=>supabase/g) ?? []).length, 5);
  assert.doesNotMatch(screen, /await supabase\.(rpc\(|from\("checklist_executions"\)\.update|from\("execution_answers"\)\.upsert)/);
  assert.match(screen, /photoItemIds\.has\(answer\.item_id\)/);
});
