# CheckFlow release manifest

Release HEAD: `e75dd86b4e9790f62bb7c29db18e91f91cf4d5a8`
Base: `origin/main` = `68852bd55ff67bda30da1bd40df02a61559d7d32`
Scope: 27 local commits; eight frozen, pending migrations. No remote action was performed.

## Frozen migration roster

| Version | File | SHA-256 | DB dependency → code/test consumer |
|---|---|---|---|
| 202609030001 | checklist_structure_integrity.sql | `4DE232E36DEE198D628F7E9827756809910562EBBF17D045130E7E0DBBFB678A` | locks/structure triggers → checklist detail and assignment/execution mutations → structural tests |
| 202609040001 | prevent_assignment_execution_duplication.sql | `062A99DACB102C020402B695ADE88F596847AAE93907438984B78B50F040D436` | assignment trigger + unique index → assignment/reassignment UI → assignment integrity tests |
| 202609040002 | enforce_execution_state_transitions.sql | `B9AEDD805CC0935A5AFB7AE9C3B6613A48F8D65ED3482E3B198DEFFED31477EC` | execution trigger → start/pause/resume/complete UI → state-machine tests |
| 202609040003 | make_action_workflows_failure_safe.sql | `5550BBA4009422C96D6B05BF9CC8CE775BAFB0032412E13F476CA19AD6F14F9D` | plan/attachment constraints, photo RPC, storage policy → action plan and photo UI → atomicity tests |
| 202609070001 | close_historical_identity_and_membership_gaps.sql | `3537EA68E0416C3D6DAAAB9FC4E2A29361FF9C5EA1C084F2AEA3AD0F431FD233` | identity/membership/evidence triggers → all execution child writes → adversarial tests |
| 202609070002 | validate_completion_from_persisted_answers.sql | `56A75CDD7197C4FFC58878897A2799B0E887A87945F3E89E72BFF3A09350503B` | completion trigger → execution completion UI → structural/adversarial tests |
| 202609070003 | record_non_conformity_atomically.sql | `B01241470170332250790E68C766DCE84A48F1DB693805A868FDD18E73E84A9E` | NC unique index + authenticated RPC → `checklist-execution.tsx` RPC → NC atomicity tests |
| 202609070004 | fail_fast_on_lifecycle_lock_conflicts.sql | `B67BB69DEB8E483EDF140F100D853EF740465DED9BB2472A22DFB2287BE5C65E` | NOWAIT lifecycle lock helper → all assignment/execution mutations → concurrency tests |

The files are immutable for this release. Order: 030001 → 040001 → 040002 → 040003 → 070001 → 070002 → 070003 → 070004.

## DB/code matrix

| Runtime pairing | Classification | Evidence / operating rule |
|---|---|---|
| OLD CODE + OLD DB | SAFE | Existing `origin/main` behavior remains unchanged. |
| OLD CODE + NEW DB | DEGRADED BUT SAFE | Old multi-request photo/NC/action flows meet stricter triggers; retries can surface validation/lock errors but do not require absent objects. Do not deploy old code after DB validation begins. |
| NEW CODE + OLD DB | UNSAFE | New UI calls `record_checkflow_non_conformity` and `record_checkflow_execution_photo_evidence`, absent before 070003/040003. |
| NEW CODE + NEW DB | SAFE | Required RPCs, grants, triggers and retry-aware UI are present. |

DB must precede code. A DB-to-code window is allowed only as degraded/retryable; code-to-DB is prohibited.

## Safety and rollback

Migrations use normal Supabase migration transactions; indexes are not concurrent, and triggers/index builds can take locks. Existing duplicate rows, invalid historical links, or blocked locks can abort a migration. Once committed they are **FORWARD-FIX ONLY** (or **MANUAL RECOVERY** under DB owner), never an improvised down migration. Backup gate: **WAIVED BY HUMAN OPERATOR**; no restore point is claimed.

Before DB write: reversible (stop). After DB write/before code: forward-fix only; keep old code temporarily only under degraded-safe observation. Before deploy: reversible. After code deploy: redeploy previous artifact is reversible only if DB compatibility holds; otherwise forward-fix/manual recovery.

## Gates and authorizations

Postflight SHA-256: `8775E2CBF99041DC1BBFBA9318AC241396F59592E80AEEEBF2158ED03F93D995`. Human authorization: A before DB write, B before staging deploy, C before production deploy, D before `git push`.

Known gaps: remote Supabase auth/pooler unavailable; SQL/adversarial/concurrency need an explicit isolated local target; browser E2E blocked. These are environmental, not product-failure evidence.
