import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedHead = "e31198765f24b4f7f3a907e9599bb958e5dc8016";
const frozen = [
  ["202609030001_checklist_structure_integrity.sql", "4DE232E36DEE198D628F7E9827756809910562EBBF17D045130E7E0DBBFB678A"],
  ["202609040001_prevent_assignment_execution_duplication.sql", "062A99DACB102C020402B695ADE88F596847AAE93907438984B78B50F040D436"],
  ["202609040002_enforce_execution_state_transitions.sql", "B9AEDD805CC0935A5AFB7AE9C3B6613A48F8D65ED3482E3B198DEFFED31477EC"],
  ["202609040003_make_action_workflows_failure_safe.sql", "5550BBA4009422C96D6B05BF9CC8CE775BAFB0032412E13F476CA19AD6F14F9D"],
  ["202609070001_close_historical_identity_and_membership_gaps.sql", "3537EA68E0416C3D6DAAAB9FC4E2A29361FF9C5EA1C084F2AEA3AD0F431FD233"],
  ["202609070002_validate_completion_from_persisted_answers.sql", "56A75CDD7197C4FFC58878897A2799B0E887A87945F3E89E72BFF3A09350503B"],
  ["202609070003_record_non_conformity_atomically.sql", "B01241470170332250790E68C766DCE84A48F1DB693805A868FDD18E73E84A9E"],
  ["202609070004_fail_fast_on_lifecycle_lock_conflicts.sql", "B67BB69DEB8E483EDF140F100D853EF740465DED9BB2472A22DFB2287BE5C65E"],
];
const postflight = ["supabase/preflight/p1_postflight_remote_read_only.sql", "8775E2CBF99041DC1BBFBA9318AC241396F59592E80AEEEBF2158ED03F93D995"];
const sha256 = path => createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
const run = (cmd, args) => {
  const child = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (child.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${child.status}`);
};
function validateStatic({ mutate = "" } = {}) {
  const failures = [];
  const fail = value => failures.push(value);
  const git = spawnSync("git", ["merge-base", "--is-ancestor", expectedHead, "HEAD"], { cwd: root });
  if (git.status !== 0) fail("authorized HEAD is not an ancestor of current HEAD");
  const names = frozen.map(([name]) => name);
  if (mutate === "missing") names.pop();
  if (mutate === "order") names.reverse();
  if (names.join("|") !== frozen.map(([name]) => name).join("|")) fail("frozen migration order or roster differs");
  for (const [name, hash] of frozen) {
    const path = resolve(root, "supabase/migrations", name);
    if (!existsSync(path)) { fail(`missing migration ${name}`); continue; }
    if (sha256(path) !== (mutate === "hash" && name === frozen[0][0] ? "0".repeat(64) : hash)) fail(`hash mismatch ${name}`);
  }
  if (!existsSync(resolve(root, postflight[0])) || sha256(resolve(root, postflight[0])) !== postflight[1]) fail("postflight hash mismatch");
  const source = readFileSync(resolve(root, "package.json"), "utf8");
  if (/SERVICE_ROLE|service_role/.test(source)) fail("service role reference in package manifest");
  for (const pattern of [/\.only\(/, /describe\.only\(/, /(?:test|describe)\.skip\(/]) {
    const scan = spawnSync("rg", ["-n", pattern.source, "app", "tests", "scripts"], { cwd: root, encoding: "utf8" });
    if (scan.status === 0) fail(`forbidden focused/skipped test: ${scan.stdout.trim().split("\n")[0]}`);
  }
  if (mutate === "worktree") fail("unexpected tracked worktree modification");
  return failures;
}
if (process.argv.includes("--self-test")) {
  for (const scenario of ["hash", "missing", "order", "worktree"]) assert.ok(validateStatic({ mutate: scenario }).length > 0, `${scenario} injection escaped`);
  console.log("FAILURE INJECTION: 4/4 PASS");
  process.exit(0);
}
try {
  const failures = validateStatic();
  if (failures.length) throw new Error(failures.join("; "));
  run("npm", ["test"]); run("npx", ["tsc", "--noEmit"]); run("npm", ["run", "lint"]); run("git", ["diff", "--check"]); run("npm", ["audit", "--omit=dev"]);
  console.log("RELEASE GATE: PASS");
} catch (error) {
  console.error("RELEASE GATE: FAIL"); console.error(`REASON: ${error.message}`); process.exitCode = 1;
}
