#!/usr/bin/env node
/**
 * Controlled remote rollout runner.  It intentionally performs no network I/O
 * unless --apply is supplied together with both explicit human authorization
 * environment variables.  --precheck is the only mode exercised locally.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const approvedHead = "e31198765f24b4f7f3a907e9599bb958e5dc8016";
const migrations = [
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
const sha256 = file => createHash("sha256").update(readFileSync(file)).digest("hex").toUpperCase();
const git = args => spawnSync("git", args, { cwd: root, encoding: "utf8" });

export function localPrecheck({ mutate = "" } = {}) {
  const failures = [];
  const roster = mutate === "missing" ? migrations.slice(0, -1) : mutate === "extra" ? [...migrations, ["999999999999_unapproved.sql", "0".repeat(64)]] : mutate === "order" ? [...migrations].reverse() : migrations;
  if (roster.map(([name]) => name).join("|") !== migrations.map(([name]) => name).join("|")) failures.push("migration roster/order is not exactly the frozen eight");
  if (mutate === "head" || git(["merge-base", "--is-ancestor", approvedHead, "HEAD"]).status !== 0) failures.push("approved HEAD is not an ancestor of HEAD");
  const status = git(["status", "--porcelain"]);
  if (status.status !== 0) failures.push("cannot read git worktree");
  for (const [name, expected] of migrations) {
    const path = resolve(root, "supabase/migrations", name);
    if (!existsSync(path)) { failures.push(`missing migration: ${name}`); continue; }
    const actual = sha256(path);
    if (actual !== (mutate === "hash" && name === migrations[0][0] ? "0".repeat(64) : expected)) failures.push(`migration hash mismatch: ${name}`);
  }
  const postflightPath = resolve(root, postflight[0]);
  if (!existsSync(postflightPath) || sha256(postflightPath) !== postflight[1]) failures.push("postflight hash mismatch");
  return failures;
}

function assertLocal() { const failures = localPrecheck(); if (failures.length) throw new Error(failures.join("; ")); }
function futureRemote(args) {
  // This branch is deliberately unreachable without two explicit operator gates.
  if (process.env.CHECKFLOW_REMOTE_WRITE_AUTHORIZED !== "true" || process.env.CHECKFLOW_REMOTE_HUMAN_GATE !== "APPROVED") {
    throw new Error("remote write refused: require --apply plus CHECKFLOW_REMOTE_WRITE_AUTHORIZED=true and CHECKFLOW_REMOTE_HUMAN_GATE=APPROVED");
  }
  assertLocal();
  const result = spawnSync("npx", ["supabase", ...args], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`remote command failed (${result.status})`);
}

const mode = process.argv.slice(2).find(value => ["--precheck", "--dry-run", "--apply", "--postflight", "--staging-smoke"].includes(value)) || "--precheck";
try {
  if (mode === "--precheck") { assertLocal(); console.log("ROLLOUT PRECHECK: PASS (local only; no remote command was attempted)"); }
  else if (mode === "--dry-run") { assertLocal(); console.log("DRY RUN READY: future operator must inspect migration history, confirm exactly 8 pending migrations, then run db push --dry-run. No remote command was attempted."); }
  else if (mode === "--postflight" || mode === "--staging-smoke") { assertLocal(); console.log(`${mode.slice(2).toUpperCase()} READY: invoke the dedicated future harness with an explicit target. No remote command was attempted.`); }
  else futureRemote(["db", "push"]);
} catch (error) { console.error(`ROLLOUT: FAIL — ${error.message}`); process.exitCode = 1; }
