# CheckFlow backup manifest — complete before remote migration

This template is an operational record. Store backup artifacts outside Git and do not place credentials, connection strings, tokens, or secrets here.

| Field | Value |
| --- | --- |
| PROJECT_REF | fzmzrtthmciaisygajba |
| PROJECT_NAME | Check List Flow Project |
| BACKUP_TYPE |  |
| BACKUP_ID_OR_RESTORE_POINT |  |
| UTC_CREATED |  |
| UTC_COMPLETED |  |
| OPERATOR |  |
| ROLLBACK_OWNER | Wesley |
| ARTIFACT_LOCATION |  |
| BYTE_COUNT |  |
| SHA256 |  |
| DATABASE_COVERAGE |  |
| STORAGE_METADATA_COVERAGE |  |
| AUTH_COVERAGE |  |
| LIMITATIONS |  |
| RESTORE_TARGET |  |
| RESTORE_STATUS |  |
| RESTORE_VALIDATION_TIMESTAMP |  |
| RESTORE_VALIDATION_RESULT |  |

## Required attachments/evidence

- Backup/restore-point identifier from the Supabase Dashboard or official export workflow.
- Restricted artifact manifest listing each artifact’s path, byte count, and SHA-256.
- Successful isolated restore transcript with no secret values.
- Aggregate validation of migration history, relations, RLS/policies, constraints, indexes, functions/triggers, and Storage metadata.
- Named rollback owner and a reachable escalation method.

Leave `RESTORE_STATUS` as incomplete until the backup has been restored into an isolated target and the validation evidence is attached.

## Free-plan path

Native scheduled backups and PITR are unavailable for the confirmed Free-plan project. Use the logical-dump and isolated-restore procedure in `FREE_PLAN_MANUAL_LOGICAL_BACKUP_RUNBOOK_2026-09-08.md`. `BACKUP_TYPE` must identify the actual artifact set (for example, `logical pg_dump custom + focused public/storage/history schema/data`), not a native backup that does not exist.
