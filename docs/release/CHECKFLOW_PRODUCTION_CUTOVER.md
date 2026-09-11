# CheckFlow production cutover

No command here is authorized by this document. Never expose a secret.

| Phase | COMMAND / ACTION | EXPECTED / GO | STOP | ROLLBACK |
|---|---|---|---|---|
| BEFORE | Verify manifest HEAD/hashes; `node scripts/checkflow-remote-rollout.mjs --precheck` | PASS and recorded authorization A | Any hash/head failure | REVERSIBLE: stop |
| DB read | Authenticate once; `npx supabase migration list`; `npx supabase db push --dry-run` | baseline + exactly 8 pending | Drift/auth error | REVERSIBLE: stop |
| DB write | After A: `npx supabase db push` | 8 applied in manifest order | First CLI error/timeout | FORWARD-FIX ONLY; no repair/down migration |
| POSTFLIGHT | Run `p1_postflight_remote_read_only.sql`; classify JSON | GO; mandatory PASS, legacy=6, accepted storage review only | FAIL or unaccepted REVIEW | MANUAL RECOVERY / forward fix; freeze deploy |
| STAGING | After B deploy artifact; staging smoke | HTTP/assets/config PASS | Smoke failure | REVERSIBLE: redeploy previous staging artifact |
| CANARY | Owner + executor follow steps below | all critical flows PASS | tenant leak, lost answer, corruption, duplicate cycle/NC | stop; redeploy code if needed; DB remains forward-only |
| PRODUCTION | After C deploy identical approved artifact | health/smoke/canary stable | Any critical error | redeploy prior artifact only if compatible; otherwise FORWARD-FIX ONLY |
| AFTER | Record versions, outputs, incidents; run postflight/read-only smoke | evidence complete | missing evidence | no further change without owner |

Backup gate: **WAIVED BY HUMAN OPERATOR**. This increases the consequence of DB write; it is not a PASS.

## Staging human canary — execute in order

1. Owner login: correct organization/dashboard. STOP on wrong tenant/session.
2. Executor login: only assigned work appears. STOP on cross-tenant data.
3. Owner creates checklist with required yes/no and photo item, then assignment. Expected persisted assignment.
4. Executor starts, answers, pauses, reloads, resumes. Expected persisted state.
5. Executor sends photo and completes. Expected linked evidence and completion; STOP on lost answer/unrecoverable state.
6. Owner/manager opens history. Expected original cycle, answers, NC and evidence.
7. Owner registers a no/observation NC and creates/assigns action plan. Expected exactly one NC/plan.
8. Reassign same checklist and start again. Expected new clean cycle, not copied answers.
9. With second test tenant/account, confirm no visibility or mutation across tenants. STOP immediately on any exposure.

Record timestamp, route, non-secret IDs and screenshots for every failure; use the pilot support console and incident template.
