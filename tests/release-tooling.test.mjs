import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { classify } from "../scripts/checkflow-postflight-classify.mjs";
import { localPrecheck } from "../scripts/checkflow-remote-rollout.mjs";
const root = new URL("..", import.meta.url);
test("postflight fixtures classify deterministically", async () => {
  for (const [file, expected] of [["postflight-green.json", "GO"], ["postflight-fail.json", "NO-GO"], ["postflight-review.json", "REVIEW REQUIRED"]]) {
    const data = JSON.parse(await (await import("node:fs/promises")).readFile(new URL(`tests/fixtures/${file}`, root), "utf8"));
    assert.equal(classify(data).decision, expected);
  }
});
test("failure injection is fail-closed and does not invoke remote", () => {
  for (const mutation of ["head", "hash", "missing", "extra", "order"]) assert.ok(localPrecheck({ mutate: mutation }).length, `${mutation} escaped`);
  const result = spawnSync(process.execPath, ["scripts/checkflow-remote-rollout.mjs", "--apply"], { cwd: new URL(".", root), encoding: "utf8" });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /remote write refused/);
});
test("pilot failure handling keeps errors visible and releases busy controls", async () => {
  const { readFile } = await import("node:fs/promises");
  const execution = await readFile(new URL("../app/executions/[assignmentId]/checklist-execution.tsx", import.meta.url), "utf8");
  const detail = await readFile(new URL("../app/checklists/[id]/checklist-detail.tsx", import.meta.url), "utf8");
  assert.match(execution, /setBusy\(false\);\s*actionLock\.current\s*=\s*false/); assert.match(execution, /setError\(/);
  assert.match(detail, /finally\s*\{\s*endAction\(\)/); assert.match(detail, /setError\(/);
});
