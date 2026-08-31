import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const feedback = await readFile(new URL("../app/feedback.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const actionPlans = await readFile(new URL("../app/action-plans/action-plans.tsx", import.meta.url), "utf8");
const execution = await readFile(new URL("../app/executions/[assignmentId]/checklist-execution.tsx", import.meta.url), "utf8");

test("success feedback is centralized, auto-dismisses in 3 seconds, and cleans its timer", () => {
  assert.match(feedback, /setTimeout\(\(\) => \{/);
  assert.match(feedback, /\}, 3000\)/);
  assert.match(feedback, /clearTimeout\(timer\.current\)/);
  assert.match(feedback, /role=\{feedback\.kind === "error" \? "alert" : "status"\}/);
  assert.match(page, /useFeedback\(\)/);
  assert.match(actionPlans, /useFeedback\(\)/);
  assert.match(execution, /useFeedback\(\)/);
});

test("feedback supports manual close without changing the error persistence rule", () => {
  assert.match(feedback, /aria-label="Fechar mensagem"/);
  assert.match(feedback, /kind === "success" \? setTimeout/);
  assert.match(feedback, /: null;/);
  assert.match(feedback, /onClick=\{onClose\}/);
});
