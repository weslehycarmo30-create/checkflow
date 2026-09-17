# CheckFlow — manual rollout package (SQL Editor)

Project: `fzmzrtthmciaisygajba`
Frozen HEAD: `729ea36e276c660c391251ae01a718d64382b014`
Rollback owner: Wesley
Remote execution by this package: none.

## Mandatory stop before step 1

Do **not** run these migration files directly in Supabase SQL Editor yet.
They are exact copies of repository migrations and deliberately do not write
`supabase_migrations.schema_migrations`. The SQL Editor applies schema/data
changes but does not record migration history. That would leave the remote
schema ahead of its migration history, make the final postflight migration
history gate fail, and prevent a clean future CLI migration workflow.

This package is therefore prepared for human review and verification, but is
not an execution authorization until a human approves a migration-history
recording method that preserves the exact migration artifacts (for example,
an approved linked CLI migration workflow or a separately reviewed history
repair procedure). Do not invent or run a history insert from this package.

The final postflight remains:
`../preflight/p1_postflight_remote_read_only.sql`
SHA-256: `8775E2CBF99041DC1BBFBA9318AC241396F59592E80AEEEBF2158ED03F93D995`

## Frozen artifacts

| Order | Package file | Original migration | SHA-256 | Objective | Main risk | Verify |
|---:|---|---|---|---|---|---|
| 1 | `01_migration.sql` | `202609030001_checklist_structure_integrity.sql` | `4DE232E36DEE198D628F7E9827756809910562EBBF17D045130E7E0DBBFB678A` | Freeze checklist structural lifecycle and historical identity. | Structural write locking / incompatible legacy shape. | `01_verify_read_only.sql` |
| 2 | `02_migration.sql` | `202609040001_prevent_assignment_execution_duplication.sql` | `062A99DACB102C020402B695ADE88F596847AAE93907438984B78B50F040D436` | Prevent duplicate assignment/execution cycles. | Existing duplicate data or contention. | `02_verify_read_only.sql` |
| 3 | `03_migration.sql` | `202609040002_enforce_execution_state_transitions.sql` | `B9AEDD805CC0935A5AFB7AE9C3B6613A48F8D65ED3482E3B198DEFFED31477EC` | Enforce server-side execution state transitions. | Existing lifecycle/timestamp inconsistency. | `03_verify_read_only.sql` |
| 4 | `04_migration.sql` | `202609040003_make_action_workflows_failure_safe.sql` | `5550BBA4009422C96D6B05BF9CC8CE775BAFB0032412E13F476CA19AD6F14F9D` | Make action/NC/evidence workflow failure-safe. | Existing duplicate/reference conflict. | `04_verify_read_only.sql` |
| 5 | `05_migration.sql` | `202609070001_close_historical_identity_and_membership_gaps.sql` | `3537EA68E0416C3D6DAAAB9FC4E2A29361FF9C5EA1C084F2AEA3AD0F431FD233` | Close identity, membership, attachment and historical-reference gaps. | Historical/tenant relation incompatibility. | `05_verify_read_only.sql` |
| 6 | `06_migration.sql` | `202609070002_validate_completion_from_persisted_answers.sql` | `56A75CDD7197C4FFC58878897A2799B0E887A87945F3E89E72BFF3A09350503B` | Validate completion from persisted answers. | Existing completed execution violates required-answer rule. | `06_verify_read_only.sql` |
| 7 | `07_migration.sql` | `202609070003_record_non_conformity_atomically.sql` | `B01241470170332250790E68C766DCE84A48F1DB693805A868FDD18E73E84A9E` | Record a non-conformity atomically. | Existing duplicate NC per answer. | `07_verify_read_only.sql` |
| 8 | `08_migration.sql` | `202609070004_fail_fast_on_lifecycle_lock_conflicts.sql` | `B67BB69DEB8E483EDF140F100D853EF740465DED9BB2472A22DFB2287BE5C65E` | Fail fast on lifecycle lock conflicts. | Contention surfaces as intended retryable conflict. | `08_verify_read_only.sql` |

Each `NN_migration.sql` SHA-256 equals its source migration SHA-256; the
copies contain no semantic or byte-level change.

## Human sequence after the history-method gate is approved

1. Open SQL Editor for project `fzmzrtthmciaisygajba`; recheck the project ref.
2. Recheck the migration file SHA-256 against this table before every write.
3. Apply only `01_migration.sql` through the approved history-recording method.
4. Execute `01_verify_read_only.sql`. It returns one grid with `report`,
   `status`, `count_or_value`, and `interpretation`.
5. Continue to the next migration only when every result is `PASS` or
   non-material `INFO`, and migration history records exactly the applied
   version.
6. Repeat through migration 8, one migration and one verify at a time.
7. Run `../preflight/p1_postflight_remote_read_only.sql` only after all eight
   migration and verification gates pass.

## Universal STOP criteria

Stop immediately; do not apply the next migration, if any of the following
occurs:

- project ref, frozen HEAD, artifact SHA-256, or migration order differs;
- a migration reports a SQL error, timeout, cancellation, or partial state;
- its verify returns `FAIL`;
- a verify returns a material `REVIEW` without an evidence-based explanation;
- migration history is not updated by the approved method;
- the final postflight reports a new/material `FAIL` or unexplained `REVIEW`;
- the six legacy pre-snapshot executions change, receive a fabricated snapshot,
  or cease to be exactly six;
- either `.emptyFolderPlaceholder` is changed or deleted;
- a new duplicate, cross-tenant violation, or storage-reference violation is
  detected.

## Preserved known exceptions

The migration source files have been reviewed for this rollout and do not
backfill or fabricate snapshots for the six July 2026 LEGACY PRE-SNAPSHOT
executions. They do not delete or move either known zero-byte
`.emptyFolderPlaceholder`, do not perform Storage cleanup, and do not depend
on cleanup of either known exception.

The backup/restore gate remains **WAIVED BY HUMAN OPERATOR**. No fresh,
verified logical backup/restore exists for this migration window.
