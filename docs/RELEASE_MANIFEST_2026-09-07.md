# CheckFlow release manifest — frozen local baseline

- Project ref: `fzmzrtthmciaisygajba`
- Approved HEAD: `729ea36e276c660c391251ae01a718d64382b014`
- `origin/main`: `68852bd55ff67bda30da1bd40df02a61559d7d32`
- Local commits ahead: `7f13b8c`, `65b64e7`, `628cb0a`, `06e35ea`, `3945284`, `729ea36`
- Status: **PENDING HUMAN BACKUP EVIDENCE**. Hashes are SHA-256 of the exact files below.

| Artifact | Type | SHA-256 | Status | Order |
| --- | --- | --- | --- | ---: |
| `202609030001_checklist_structure_integrity.sql` | migration | `4DE232E36DEE198D628F7E9827756809910562EBBF17D045130E7E0DBBFB678A` | PENDING | 1 |
| `202609040001_prevent_assignment_execution_duplication.sql` | migration | `062A99DACB102C020402B695ADE88F596847AAE93907438984B78B50F040D436` | PENDING | 2 |
| `202609040002_enforce_execution_state_transitions.sql` | migration | `B9AEDD805CC0935A5AFB7AE9C3B6613A48F8D65ED3482E3B198DEFFED31477EC` | PENDING | 3 |
| `202609040003_make_action_workflows_failure_safe.sql` | migration | `5550BBA4009422C96D6B05BF9CC8CE775BAFB0032412E13F476CA19AD6F14F9D` | PENDING | 4 |
| `202609070001_close_historical_identity_and_membership_gaps.sql` | forward fix | `3537EA68E0416C3D6DAAAB9FC4E2A29361FF9C5EA1C084F2AEA3AD0F431FD233` | PENDING | 5 |
| `202609070002_validate_completion_from_persisted_answers.sql` | forward fix | `56A75CDD7197C4FFC58878897A2799B0E887A87945F3E89E72BFF3A09350503B` | PENDING | 6 |
| `202609070003_record_non_conformity_atomically.sql` | forward fix | `B01241470170332250790E68C766DCE84A48F1DB693805A868FDD18E73E84A9E` | PENDING | 7 |
| `202609070004_fail_fast_on_lifecycle_lock_conflicts.sql` | forward fix | `B67BB69DEB8E483EDF140F100D853EF740465DED9BB2472A22DFB2287BE5C65E` | PENDING | 8 |
| `p1_integrated_remote_summary_read_only.sql` | accepted remote preflight | `452E13A9B8CD4FFF80C525026FE44A1024A0C0B560B08432762DAE0CE19CD909` | EXECUTED BY HUMAN | — |
| `p1_remote_fail_diagnosis_read_only.sql` | accepted remote diagnosis | `3AC52682938C7ED3F03E22995ACE23902DC6F8053ADAE7FB24BF6E1B2AFBF4D6` | EXECUTED BY HUMAN | — |
| `p1_postflight_remote_read_only.sql` | postflight | `8775E2CBF99041DC1BBFBA9318AC241396F59592E80AEEEBF2158ED03F93D995` | READY | — |

## Sequential execution roster — after authorization only

Apply one file at a time during a write-frozen maintenance window. After each commit, confirm its exact migration-history row and capture the SQL Editor/CLI result before starting the next file. Do not combine all eight files into one transaction: each migration has its own transaction semantics and sequential confirmation narrows rollback/forward-fix scope.

| Order | Objective | Dependencies and locks | Success / stop | Rollback posture |
| ---: | --- | --- | --- | --- |
| 1 | Freeze checklist structure after lifecycle begins. | Baseline tables/triggers; checklist lock. | Required functions/triggers created; stop on lock/DDL error. | Forward-fix preferred; restore for integrity incident. |
| 2 | One operational assignment cycle and execution per assignment. | 1; checklist lock and unique index. | Duplicate gates remain zero; stop on index creation error. | Do not drop unique index ad hoc. |
| 3 | Enforce execution state transitions server-side. | 1/2; execution trigger. | State trigger exists; stop on incompatible data/DDL error. | Forward-fix or restore. |
| 4 | Unique plans/evidence and atomic workflow primitives. | 1–3; unique indexes/policies. | Indexes/functions/policy recorded; stop on duplicate/index error. | Forward-fix or restore; never Storage cleanup. |
| 5 | Preserve historical identity and evidence ownership. | 1–4; execution `NO KEY UPDATE NOWAIT`, Storage metadata row lock only on future writes. | Guards/triggers created; stop on DDL/policy error. | Forward-fix or restore. |
| 6 | Validate completion from persisted answers. | 5; execution trigger. | Completion validator created; stop on trigger error. | Forward-fix or restore. |
| 7 | Atomic non-conformity RPC and uniqueness. | 5/6; unique index. | NC uniqueness precondition remains zero; stop on index error. | Forward-fix or restore. |
| 8 | Fail fast on lifecycle lock contention. | 1–7; replaces helper implementation. | Lock helper updated; stop on function error. | Forward-fix or restore. |

After order 8, execute `p1_postflight_remote_read_only.sql`, analyze every row, then proceed to staging and a human canary only if GO/NO-GO gates are all `PASS`.

## Local revalidation record

No product source or migration changed after the final local gate run. Evidence reused from the current approved HEAD:

- isolated local SQL migration gate: 14/14 migration files applied; 8/8 SQL gate files passed;
- adversarial suite: 6/6 passed;
- independent-session concurrency suite: 12/12 passed;
- Node suite: 36/36 passed; TypeScript and production build passed;
- lint: 0 errors, 7 known navigation warnings; `git diff --check` passed;
- dependency audit: `npm audit --omit=dev` found 0 production vulnerabilities; full audit retains 16 tooling/development findings (P2).

The current postflight file was syntax-validated locally in a read-only transaction after its final grant/trigger coverage revision. It has a single final result-set query.
