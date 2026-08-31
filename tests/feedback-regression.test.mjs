import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const feedback = await readFile(new URL("../app/feedback.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const actionPlans = await readFile(new URL("../app/action-plans/action-plans.tsx", import.meta.url), "utf8");
const execution = await readFile(new URL("../app/executions/[assignmentId]/checklist-execution.tsx", import.meta.url), "utf8");

test("success feedback is centralized, auto-dismisses in 3 seconds, and cleans its timer", () => {
  assert.match(feedback, /SUCCESS_FEEDBACK_DURATION_MS = 3000/);
  assert.match(feedback, /feedback\.kind !== "success"/);
  assert.match(feedback, /window\.setTimeout\(\(\) => \{/);
  assert.match(feedback, /current\?\.id === feedback\.id \? null : current/);
  assert.match(feedback, /return \(\) => window\.clearTimeout\(timer\)/);
  assert.match(feedback, /role=\{feedback\.kind === "error" \? "alert" : "status"\}/);
  assert.match(page, /useFeedback\(\)/);
  assert.match(actionPlans, /useFeedback\(\)/);
  assert.match(execution, /useFeedback\(\)/);
  assert.match(execution, /showFeedback\("Resposta salva\."\)/);
});

test("feedback supports manual close without changing the error persistence rule", () => {
  assert.match(feedback, /aria-label="Fechar mensagem"/);
  assert.match(feedback, /feedback\.kind !== "success"/);
  assert.doesNotMatch(feedback, /kind === "error"[\s\S]{0,250}setTimeout/);
  assert.match(feedback, /onClick=\{onClose\}/);
});

test("execution CTA has reserved safe-area space below fixed feedback at mobile widths", () => {
  assert.match(css, /finish-card\{text-align:center;margin-bottom:calc\(120px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /@media\(max-width:600px\)\{\.execution-page\{padding:15px 12px calc\(15px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /@media\(max-width:820px\)\{\.detail-message\{left:14px;right:14px;bottom:calc\(76px \+ env\(safe-area-inset-bottom\)\)/);
});
