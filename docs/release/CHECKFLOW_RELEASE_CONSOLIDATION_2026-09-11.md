# CheckFlow release consolidation — 2026-09-11

## Checkpoint and scope

- Base HEAD: `68852bd55ff67bda30da1bd40df02a61559d7d32` (`origin/main`)
- Initial/final HEAD: `e75dd86b4e9790f62bb7c29db18e91f91cf4d5a8` (expected; no divergence)
- Commits created: 0 at checkpoint; this documentation is intentionally left uncommitted for human review.
- Total local commits: 27, linear, merge-base is base. No reverts in release range; no out-of-range dependency found.

## Commit inventory and classification

| SHA | Summary | Class | Release role |
|---|---|---|---|
| 7f13b8c | lifecycle integrity | REQUIRED | migration 030001 + tests |
| 65b64e7 | assignment duplication | REQUIRED | migration 040001 + tests |
| 628cb0a | execution state | REQUIRED | migration 040002 + tests |
| 06e35ea | action failure safety | REQUIRED | migration 040003 + UI/tests |
| 3945284 | concurrency/evidence hardening | REQUIRED | migrations 070001–004 + UI/tests |
| 729ea36 | patched dependencies | SAFE SUPPORTING | build dependency security patch |
| 1b57add | local platform fail-fast | SAFE SUPPORTING | test tooling |
| d9d6eb2,1bfc764,a9841ad | readiness evidence | DOCS ONLY | audit history |
| 3c16fc0 | isolated Supabase config | TEST ONLY | local E2E/gate configuration |
| e311987 | ignore CLI state | SAFE SUPPORTING | prevents local artifacts entering Git |
| 112019c | release gate | SAFE SUPPORTING | frozen hash gate |
| d9af735 | rollout/trust docs | DOCS ONLY | prior runbook |
| 0056188 | rollout tooling tests | TEST ONLY | postflight/rollout harness |
| 0f89b59,4aaf492,4ed3331,4e2b192 | pilot docs/templates | DOCS ONLY | pilot operation |
| 02f7a2e | UI mutation hardening | REQUIRED | retry/state behavior required by new constraints |
| 6e946be,018e7b3,864e93d | commercial docs | DOCS ONLY | non-runtime collateral |
| 6ec915f | UI execution recovery | REQUIRED | handles conflict/failed mutation paths |
| b5c205e | UI recovery tests | TEST ONLY | supports 6ec915f |
| 636b8b1,e75dd86 | support/readiness docs | DOCS ONLY | pilot handoff |

No commit is classified DO NOT SHIP. Commercial collateral is release-neutral but is not required for runtime; exclude it only if a deliberately narrow technical-only release is later authorized. Recommendation: **SHIP AS-IS**; no intermediate broken/reverted commit evidence. `git diff --check origin/main...HEAD` reports pre-existing release-range whitespace in one readiness markdown and `LEADS_TEMPLATE.csv`; quality reservation, P3, not runtime risk.

## Migration safety and compatibility

The complete roster, hashes and dependency graph are in [manifest](CHECKFLOW_RELEASE_MANIFEST.md). Static review found no P0/P1 requiring a change to frozen migrations. All are forward-compatible additions/trigger replacements, but may acquire table/row locks and assume no duplicates for unique indexes. Migration 070001/070004 intentionally make contention fail/retry. RLS/SECURITY DEFINER grants are checked by postflight. No forward fix is proposed.

| Combination | Result |
|---|---|
| OLD CODE + OLD DB | SAFE |
| OLD CODE + NEW DB | DEGRADED BUT SAFE |
| NEW CODE + OLD DB | UNSAFE |
| NEW CODE + NEW DB | SAFE |

Recommended ship order: precheck → auth once → migration list → remote dry-run → STOP/A → DB push → read-only postflight → STOP/B → staging artifact → smoke → authenticated canary → STOP/C → production artifact → production smoke. STOP/D separately before Git push. Exact commands: [command sheet](CHECKFLOW_RELEASE_COMMAND_SHEET.md); unblock sequence: [Supabase runbook](SUPABASE_UNBLOCK_NEXT_STEPS.md).

## Local gate evidence

| Gate | Result |
|---|---|
| Node | PASS — v24.14.0 |
| TypeScript | PASS — `npx tsc --noEmit` |
| Build | ENVIRONMENT RESERVATION — standalone invocation created/reused ignored `dist`; full gate build failed EEXIST at `dist/.openai/drizzle` |
| Lint | PASS |
| Diff check | FAIL (non-blocking docs whitespace only, listed above) |
| Release gate | FAIL conclusively due to same ignored generated `dist` EEXIST; test suite did not run in that invocation |
| Rollout precheck | PASS, local only |
| SQL/adversarial/concurrency | ENVIRONMENT / NOT EXECUTED — no explicit isolated `CHECKFLOW_LOCAL_CONTAINER` + retained `checkflow_gate_*` target configured |
| Browser E2E | BLOCKED — known local environment |

The local Supabase container exists, but selecting/creating a target would exceed the instructed no-recovery/no-investigation boundary. No remote command, SQL, auth, storage, deploy, push, merge or PR was executed.

## Push readiness and origin simulation

`main` is ahead 27; merge-base equals `origin/main`. No branch divergence/conflict can be simulated until `origin/main` advances; the current range is linear. Overlap areas for future integration: application execution/action files, `package*.json`, Supabase config/migrations, and Site/Cloudflare build dependencies. Migration ordering is timestamp-safe if future migrations use later unique versions. Ignored artifacts include `.sites-runtime`, `.wrangler`, `dist`, `node_modules`, `supabase/.branches`, `supabase/.temp`, and `tsconfig.tsbuildinfo`; no tracked ignored files. Untracked prior-user material includes remote rollout/preflight docs, `supabase/manual-rollout`, SQL files, and `test-results`; it must be reviewed/staged deliberately, not pushed by blanket add. No `.env` or secret was surfaced by the tracked/untracked audit; command docs deliberately omit secrets. Large-file scan found no tracked ignored candidate.

## Postflight, canary, rollback

Postflight is ready: read-only SQL checks applied migrations, catalog integrity, RLS/policies/functions, legacy classification (exactly six), tenant violations, duplicates and orphan evidence placeholders; parser returns GO/REVIEW/NO-GO. Canary and production procedures are operational in [cutover](CHECKFLOW_PRODUCTION_CUTOVER.md). Rollback: before DB write **REVERSIBLE**; after DB write **FORWARD-FIX ONLY** or **MANUAL RECOVERY**; staging/pre-code deploy **REVERSIBLE**; post-code rollback only conditionally reversible by prior compatible artifact. Backup gate: **WAIVED BY HUMAN OPERATOR**, with no false PASS.

## Risks, authorizations, conclusion

P0: 0 known. P1: 0 known. P2: remote authentication/pooler and isolated SQL target unavailable. P3: release-range whitespace, stale generated `dist` blocks full gate until a clean generated-artifact workspace is supplied; commercial/docs scope is broader than runtime.

Human authorization points: A DB push; B staging deploy; C production deploy; D git push. ZERO REMOTE CONFIRMATION. ZERO DEPLOY CONFIRMATION. ZERO PUSH CONFIRMATION.

**B — RELEASE PACKAGE READY WITH NON-BLOCKING RESERVATIONS**
