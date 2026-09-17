# CheckFlow remote rollout — GO / NO-GO

Only `PASS`, `FAIL`, and `PENDING` are valid gate values. A migration window may start only when every prerequisite through `POSTFLIGHT READY` is `PASS` and the named humans are present.

| Gate | Status | Evidence required |
| --- | --- | --- |
| BACKUP CREATED | PENDING | Fresh backup/restore-point ID, UTC timestamp, artifact location. |
| BACKUP VERIFIED | PENDING | Artifact manifest, byte counts, SHA-256, coverage and limitations. |
| RESTORE VALIDATED | PENDING | Successful restore in isolated target plus aggregate validation transcript. |
| ROLLBACK OWNER DEFINED | PASS | Wesley designated; backup/restore point remains PENDING. |
| REMOTE PREFLIGHT ACCEPTED | PASS | Human read-only evidence: six bounded July legacy snapshots, two retained placeholders, plan-reference reconciliation `PASS / 0`. |
| P0 = 0 | PASS | Local gates and read-only remote evidence. |
| P1 = 0 | PASS | No current P1; legacy snapshots are bounded and not fabricated. |
| MIGRATION ORDER VERIFIED | PASS | Eight SHA-256-pinned files in `RELEASE_MANIFEST_2026-09-07.md`. |
| POSTFLIGHT READY | PASS | `p1_postflight_remote_read_only.sql`, locally syntax-validated. |
| STAGING READY | PENDING | Staging backup, migration/postflight window, two-tenant smoke evidence. |
| HUMAN CANARY READY | PENDING | Named operator/rollback owner, observability, approved canary tenant and stop criteria. |

## Human backup waiver — 2026-09-08

The human operator explicitly waived the fresh logical-backup/restore gate for this migration window. This is an accepted operational risk, **not** a PASS and not evidence that a backup or restore point exists. `BACKUP CREATED`, `BACKUP VERIFIED`, and `RESTORE VALIDATED` remain `PENDING`. Rollback owner: **Wesley**. The risk is that no fresh verified logical backup/restore artifact exists if a later migration requires restoration.

## Decision rule

- Any `FAIL`: **NO-GO**; stop and investigate.
- Any `PENDING`: migration rollout cannot begin.
- `PASS` on backup and restore gates does not authorize deployment; staging and human canary remain separate gates.

## Human dashboard checklist

1. Sign in to Supabase Dashboard and confirm project ref `fzmzrtthmciaisygajba` and project name before opening backup controls.
2. Open the platform’s Database backup/PITR area. Record the most recent backup/restore-point ID, timestamp, retention, and stated coverage.
3. If the Dashboard offers an on-demand backup or restore point, create one for this maintenance window; wait for completion and record its ID and UTC completion time. Do not run SQL or migrations here.
4. Confirm whether the backup can restore into an isolated target and what it covers: database, Auth, Storage metadata, and Storage object bytes.
5. Assign and record the rollback owner plus escalation channel. The owner must have access to invoke the recorded restore point.
6. Export/obtain the authorized artifacts only through official controls, save them outside Git, calculate SHA-256/byte counts, and complete `BACKUP_MANIFEST_2026-09-07.md`.
7. Restore to an isolated target, validate it, attach the result to the manifest, then change the first four gate rows only to `PASS` when evidence is complete.
