import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const execution = await readFile(new URL("../app/executions/[assignmentId]/checklist-execution.tsx", import.meta.url), "utf8");
const answerField = execution.slice(execution.indexOf("const answerField"), execution.indexOf("return <main className=\"execution-page\">"));

test("each item prompt has an id that its answer control is labelled by", () => {
  assert.match(execution, /<label id=\{`prompt-\$\{item\.id\}`\}>\{item\.prompt\}/);
});

test("every answer control on the mobile execution screen is named by the item prompt", () => {
  const controls = answerField.match(/<(input|select|textarea)\b[^>]*>/g) ?? [];
  assert.ok(controls.length >= 8, `expected the answer controls, found ${controls.length}`);
  const unnamed = controls.filter(tag => !/aria-labelledby=\{`prompt-\$\{item\.id\}`\}/.test(tag) && !/id=\{`observation-\$\{item\.id\}`\}/.test(tag));
  assert.deepEqual(unnamed, [], "controls without an accessible name");
});

test("the non-conformity observation keeps its visible label association", () => {
  assert.match(answerField, /<label htmlFor=\{`observation-\$\{item\.id\}`\}>/);
  assert.match(answerField, /<textarea id=\{`observation-\$\{item\.id\}`\}/);
});

test("progress is exposed as a progressbar with its current value", () => {
  assert.match(execution, /role="progressbar" aria-label="Progresso do checklist" aria-valuemin=\{0\} aria-valuemax=\{100\} aria-valuenow=\{progress\}/);
});
