# CheckFlow — Free Plan manual logical backup and restore gate

Target project: `fzmzrtthmciaisygajba` (`Check List Flow Project`)
Scope: backup/restore validation before the eight pending database migrations.
This procedure creates no remote write. Do not run migrations until every validation step passes.

## Platform capability decision

The human Dashboard evidence confirms that the project is on the Free plan and that **Database > Backups** says the Free plan does not include project backups. Official Supabase documentation recommends recurring CLI logical exports for Free projects. PITR is an add-on for paid plans, and **Restore to a New Project** is limited to paid projects with physical backups enabled. Therefore neither `Point in time` nor `Restore to a New Project` is a usable Free-plan backup/restore control for this project.

The supported alternative is a client-side PostgreSQL logical dump plus an isolated local restore validation. This is a real rollback point only after all dump artifacts, hashes, and restore validation are complete.

## What this covers

| Component | Coverage | Rationale / limitation |
| --- | --- | --- |
| `public` schema/data | Required | Contains all application tables and all migration targets. |
| `storage` schema and `storage.objects` metadata | Required | The migrations alter policies/triggers but not object bytes. Metadata is needed to validate references. |
| `supabase_migrations` history | Required | Proves exact starting state and rollback target. |
| functions, triggers, indexes, constraints, RLS, policies, grants | Required | Captured by schema dump and compared after restore. |
| `auth` schema/data | Attempt only if the authenticated database role permits it | Store outside Git as sensitive material; it may include password hashes and identity metadata. The eight migrations do not modify Auth. |
| Storage object bytes | Not required for rollback of these eight migrations | Database backups contain only Storage metadata, not Storage API object bytes. Do not delete/overwrite objects in the rollout; retain the separate metadata inventory. |
| cluster/global role passwords | Not guaranteed | Managed-role passwords are not a safe or necessary part of this migration rollback. |

## Human: obtain connection parameters without exposing a secret

1. In the Supabase Dashboard, open project `fzmzrtthmciaisygajba` and confirm the name before proceeding.
2. Open the visible **Connect** control (or the Dashboard’s database connection panel). Choose the connection method explicitly labelled for PostgreSQL clients / `pg_dump`:
   - Prefer **Direct connection** if the backup workstation has IPv6 connectivity.
   - Otherwise use the visible **Session pooler** connection string, not transaction pooler.
3. Copy only the host, port, database name, and user into a local, non-versioned terminal session. Do not paste a connection string or password into chat, a Git-tracked file, shell history, command line, or PowerShell transcript.
4. Obtain the database password through **Database > Settings** only if the operator is authorized. Do not reset it merely to perform this backup unless that reset has separate approval.
5. Run `pg_dump` interactively: it prompts for the password without echoing it. Do not set `PGPASSWORD`, `SUPABASE_DB_PASSWORD`, or a connection URL in a script, `.env`, Git config, or terminal command history.

## Create artifacts outside Git

Create a restricted directory outside the repository, for example a user-controlled encrypted folder named `checkflow-backup-<UTC timestamp>`. Do not use a Git worktree, the `supabase/` repository directory, or a synced public folder.

From an interactive terminal with PostgreSQL client tools installed, run these commands after substituting only non-secret values:

```powershell
# Password is requested interactively by pg_dump; it is not part of the command.
pg_dump --host <HOST> --port <PORT> --username <USER> --dbname postgres --format=custom --verbose --file <RESTRICTED_DIR>\checkflow-full.dump

# Independently capture the migration target schemas and application data in portable SQL.
pg_dump --host <HOST> --port <PORT> --username <USER> --dbname postgres --schema public --schema storage --schema supabase_migrations --format=plain --verbose --file <RESTRICTED_DIR>\checkflow-schema-public-storage-history.sql
pg_dump --host <HOST> --port <PORT> --username <USER> --dbname postgres --schema public --schema storage --schema supabase_migrations --data-only --use-copy --verbose --file <RESTRICTED_DIR>\checkflow-data-public-storage-history.sql

# Attempt only if authorized and the role has access. Keep this artifact restricted.
pg_dump --host <HOST> --port <PORT> --username <USER> --dbname postgres --schema auth --format=custom --verbose --file <RESTRICTED_DIR>\checkflow-auth.dump
```

If the `auth` export is denied, record `AUTH_COVERAGE = NOT EXPORTED — permission denied` in the backup manifest. Do not retry with a service-role key; that key is not a PostgreSQL backup credential.

### Workstation capability observed in this repository

`pg_dump` is not on the current Windows host PATH. The existing local PostgreSQL Docker container provides `pg_dump 17.6`, so an authorized operator may use that client instead of installing software. First create a restricted local directory, then run the client interactively with `-it` so its password prompt is not echoed:

```powershell
# Use the Dashboard-provided host/port/user; pg_dump prompts on the terminal.
docker exec -it supabase_db_nlicelriqinhzmepjqpw pg_dump --host <HOST> --port <PORT> --username <USER> --dbname postgres --format=custom --verbose --file /tmp/checkflow-full.dump
docker cp supabase_db_nlicelriqinhzmepjqpw:/tmp/checkflow-full.dump <RESTRICTED_DIR>\checkflow-full.dump
```

Run the focused schema/data commands in the same manner, then copy artifacts out immediately. The operator must remove the temporary container copies only after hashes and the restricted local copies are verified; this is a local cleanup decision, never a remote Storage operation.

The full custom dump provides the strongest available logical capture. The focused schema/data dumps make restore validation and diffing easier. If the full dump fails because a managed schema is inaccessible, preserve its error transcript without secrets and require successful focused public/storage/history dumps; this is sufficient for the migration rollback scope only because these migrations do not mutate Auth records or object bytes.

## Integrity manifest

Immediately after successful exports, calculate byte counts and SHA-256 without printing secrets:

```powershell
Get-ChildItem <RESTRICTED_DIR> -File |
  Get-FileHash -Algorithm SHA256 |
  Format-Table Algorithm,Hash,Path
Get-ChildItem <RESTRICTED_DIR> -File |
  Select-Object Name,Length,LastWriteTimeUtc
```

Record the results, UTC timestamps, operator, artifact location, coverage, and limitations in `docs/BACKUP_MANIFEST_2026-09-07.md` locally or an approved restricted operational record. Do not commit either the artifacts or secret-bearing output.

## Isolated restore validation

Use a disposable local PostgreSQL/Supabase database, never the remote project and never a shared development database.

1. Create a fresh database named with the backup UTC timestamp.
2. Restore the focused schema dump, then focused data dump, using `psql -X -v ON_ERROR_STOP=1`. If role/default-privilege statements are rejected by the isolated target, record the exact incompatibility; do not silently remove grants from the source evidence.
3. Restore the custom full dump into a separate disposable target with `pg_restore --verbose --exit-on-error`, when the target supports the captured schemas/roles. This validates that the strongest artifact is usable.
4. Run read-only catalog/aggregate comparisons between remote-export manifest and restored target: migration history; relations; aggregate counts; constraints; indexes; functions; triggers; RLS; policies; grants; `storage.objects` metadata; and auth aggregate metadata when exported.
5. Preserve the validation transcript and mark `RESTORE_STATUS = PASS` only if the intended rollback artifact restored without unresolved corruption or schema/data mismatch.

## Go / no-go

Logical backup plus restore validation is sufficient for this rollout only when:

- focused public/storage/history schema and data artifacts exist, hash correctly, and restore successfully;
- all migration-target catalogs and aggregate counts match the capture manifest;
- the six bounded legacy executions and two retained placeholders are present in the restored metadata evidence;
- Wesley is the designated rollback owner and must have access to the restricted artifact location;
- no migration has begun before this evidence is complete.

It is **not** a full disaster-recovery substitute for Storage bytes or Auth if the auth export is unavailable. Those limitations do not prevent rollback of these eight migrations because they do not delete or overwrite Storage objects and do not modify Auth data. Any later operation that changes Auth or Storage bytes requires a new backup decision.

## References

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump)
- [Supabase Restore to a New Project](https://supabase.com/docs/guides/platform/clone-project)
