# CheckFlow — remote preflight closure and controlled rollout

Date: 2026-09-07
Target: `fzmzrtthmciaisygajba` (`Check List Flow Project`)
Approved local HEAD: `729ea36e276c660c391251ae01a718d64382b014`

## Remote preflight evidence

The approved integrated preflight was run manually in the Supabase SQL Editor. Its initial hard stops were reconciled by subsequent read-only diagnostics.

| Finding | Evidence | Release treatment |
| --- | --- | --- |
| `completed_without_snapshot = 6` | The same six rows are all completed July 2026 executions, preceding the documented snapshot migration completion at `2026-08-28T14:37:53.122342Z`. | Preserve as **LEGACY PRE-SNAPSHOT**. Do not backfill or rebuild from mutable checklist data. |
| `snapshot_shape = 6` | The set is exactly the same six legacy rows. | No malformed/post-snapshot snapshot was shown. The postflight requires exactly these six and zero others. |
| `orphan_storage_objects = 2` | Both are unreferenced `.emptyFolderPlaceholder` records with zero size and classified `SAFE ORPHAN`. | Retain. No cleanup in this rollout. P2 operational reservation. |
| `plan_missing_correction_object = 1` | The later exact-predicate reconciliation returned `01_current_count = PASS / 0`. | **DRIFT BETWEEN READS**. Cause is unknown without audit trail; do not infer or repair. The condition is zero in the current remote state. |

The plan-reference predicate in `p1_integrated_remote_summary_read_only.sql` and `p1_remote_fail_diagnosis_read_only.sql` is semantically identical: non-null `correction_comment` and either a nonconforming action-plan prefix or no exact `storage.objects` row in `checkflow-evidence`. A `LEFT JOIN` used only to expose execution metadata does not affect selection. Therefore no current plan-reference P1 is evidenced.

## Migrations: exact order

Apply one migration at a time, committing and recording the outcome before continuing:

1. `202609030001_checklist_structure_integrity.sql`
2. `202609040001_prevent_assignment_execution_duplication.sql`
3. `202609040002_enforce_execution_state_transitions.sql`
4. `202609040003_make_action_workflows_failure_safe.sql`
5. `202609070001_close_historical_identity_and_membership_gaps.sql`
6. `202609070002_validate_completion_from_persisted_answers.sql`
7. `202609070003_record_non_conformity_atomically.sql`
8. `202609070004_fail_fast_on_lifecycle_lock_conflicts.sql`

Review conclusions:

- No pending migration updates, inserts, deletes, backfills, or reconstructs legacy snapshots.
- No pending migration deletes the two Storage placeholders or relies on their cleanup.
- P1-02, P1-04, and forward fix `202609070003` create unique indexes only after the preflight’s duplicate gates are zero.
- P1-01’s original checklist lock is superseded by `202609070004`, which changes lock acquisition to fail-fast `NO KEY UPDATE NOWAIT`; it does not alter business data.
- P1-04 and `202609070001` alter Storage policies/triggers as schema authorization work only. They never mutate Storage objects.

## Mandatory backup gate — before the first remote write

The rollout operator records a UTC `backup_id` and stores all output outside Git in a restricted directory. Do not use a prior backup as the rollback point.

1. Freeze application writes for the maintenance window and record the active frontend/Worker deployment ID, Git SHA, URL, timestamp, and operator.
2. In the Supabase Dashboard for the exact project ref, create or identify an on-demand database backup/PITR restore point. Record its dashboard identifier and UTC completion time.
3. Export current database schema and data with the authenticated official Supabase backup/export mechanism. At minimum include `public`, `storage`, and `supabase_migrations`; include Auth only in restricted storage if the operator is authorized to handle credential hashes.
4. Export a read-only inventory of `storage.objects` for `checkflow-evidence`, including path, created time, size, MIME metadata, and SHA-256 of the inventory file. Download physical objects only if separately authorized; no upload/delete/move occurs in this window.
5. Calculate SHA-256 and byte count for each backup artifact. Save a manifest containing `backup_id`, project ref, database/schema versions, UTC timestamps, filenames, sizes, hashes, operator, and storage location.
6. Restore the database export into a newly created disposable local/isolated PostgreSQL database. Run `psql -X -v ON_ERROR_STOP=1 -f <schema_dump>` followed by `psql -X -v ON_ERROR_STOP=1 -f <data_dump>`, then compare relation inventory, migration history, aggregate counts, RLS/policies, and Storage metadata to the manifest.
7. Only after restore validation is `BACKUP_VERIFIED = YES`. Missing backup ID, checksum, successful restore, or operator/rollback owner is a hard NO-GO.

## Rollout control

For each file, the operator records start/end UTC, SQL Editor job/query ID or CLI output, SHA-256 of the exact local file, affected migration history row, and server error text if any.

- Confirm the project ref in the Dashboard and confirm the eight versions are absent immediately before writing.
- Apply only the next file in the ordered list. Do not batch or skip files.
- On any SQL error, lock timeout, unexpected history row, or result different from the expected migration name: **STOP**. Do not apply the next migration and do not improvise `migration repair`.
- After all eight history rows are confirmed, run `supabase/preflight/p1_postflight_remote_read_only.sql` manually in the SQL Editor. This is read-only and returns one final grid.

## Postflight gate

Postflight artifact: `supabase/preflight/p1_postflight_remote_read_only.sql`
SHA-256: `657CDBA1A587040D1C07040500741492E42961A0F8CD429482FC143DA8683EE2`

It checks migration history, required constraints and indexes, trigger presence/catalog hash, SECURITY DEFINER/search-path/execute grants, RLS/policy catalog, duplicates, cross-tenant links, orphan/references, execution states/timestamps, plans/NCs, attachments/Storage, and the legacy snapshot exception.

GO requires:

- every migration/index/constraint/trigger/function/RLS/policy/data row is `PASS`;
- the only snapshot violations are exactly six, all completed before the documented snapshot migration marker;
- the current plan-correction reference count is zero;
- the two zero-byte placeholder records are the only accepted orphan reservation and are not mutated;
- all catalog `INFO` hashes/definitions are compared with the approved local baseline;
- every `REVIEW` has written human acceptance.

Any SQL error or `FAIL` is NO-GO. A `REVIEW` is not automatically approval.

## Rollback and restore

Git revert is not database rollback. There is no automatic SQL `DROP` rollback for this rollout.

| Condition | Response |
| --- | --- |
| Failure before a migration commits | Stop; preserve logs; no next migration. Database remains at backup-compatible state. |
| Failure after a migration commits, but a safe forward-fix exists | Stop traffic/writes as needed; use a reviewed, versioned forward-fix after human approval. Do not drop constraints, indexes, triggers, or policies ad hoc. |
| Integrity/security regression or no safe forward-fix | Declare incident; restore the verified database backup/PITR point under the named human rollback owner; then restore/validate Storage metadata and authorized physical objects from the manifest. |
| Frontend incompatibility after database success | Revert the separately recorded Cloudflare deployment only after human authorization; database rollback remains an independent decision. |

Restore requires a new isolated validation: migration history, aggregate data, RLS/policies/grants, cross-tenant checks, Storage inventory, and the legacy snapshot set. The database backup timestamp defines RPO; rollout start to stop defines potential data loss. Auth and Storage binary recovery must follow the operator’s authorized backup plan, not a database restore alone.

## Staging and human canary

1. Run the same eight migrations and postflight first in staging from a staging backup/restore point.
2. Execute authenticated smoke scenarios with a dedicated two-tenant test fixture: owner/manager assignment, executor start/pause/resume/complete, retry/double-submit behavior, required NC, photo evidence, action-plan update, history display, and denied cross-tenant access.
3. Have the named rollback owner observe error logs and database/storage metrics through the canary window. No cleanup jobs run during the window.
4. Production-like remote rollout proceeds only with the backup manifest, approved postflight grid, operator, and rollback owner present.

## Residual risks

- P0: none known from current local and remote read-only evidence.
- P1: no current plan-correction P1 evidenced; the six legacy snapshotless executions are an accepted historical exception only if postflight proves the exact bounded set.
- P2: two retained placeholder objects; unresolved non-production npm tooling advisories; Vite future-native-config warning; authenticated end-to-end smoke remains a human gate.
- P3: local Supabase configuration ergonomics and non-critical tooling modernization.

No remote write, migration, Storage operation, Auth change, deploy, or push was performed while preparing this document.

## Backup exception — 2026-09-08

The human operator explicitly accepted the risk of proceeding without a fresh verified logical backup/restore for this migration window. Rollback owner: **Wesley**. This exception does not mark the backup gate as passed, does not create a restore point, and does not authorize destructive rollback improvisation. Any migration failure still requires an assessed forward-fix or external restoration decision.
