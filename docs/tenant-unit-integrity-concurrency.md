# Tenant and unit integrity: concurrency review

## Finding

The original `202610020001_tenant_unit_integrity_and_privileges.sql` checked a
unit's organization with an ordinary `SELECT`, while the unit-move trigger
checked for existing child rows with ordinary `EXISTS` queries. Those checks
were not serialized. A two-connection local test reproduced the race: one
transaction changed a unit from organization A to B and paused before commit;
a second transaction inserted an organization A team referencing that unit.
Both committed, leaving the team and unit in different organizations.

The same pattern could affect checklist and assignment writes. An unassigned
execution could also race a unit move. In addition, an assignment identity
update could pass the older identity guard before waiting for a concurrent
execution insert, then commit after that execution existed.

## Protection added

The migration now adds a `SECURITY DEFINER` row trigger that takes
transaction-scoped advisory locks for the logical links touched by each write.
Keys are sorted lexically before locking, with namespaces for assignment,
checklist, execution, and unit identities. This gives all relevant writes the
same lock order and keeps locks until the transaction ends.

The lock trigger covers teams, checklists, assignments, executions,
non-conformities, and unit organization changes. Assignment updates are
rechecked after acquiring their lock, because the existing record-identity
trigger runs earlier and its initial existence check can be stale under
concurrency. Checklist tenant moves remain blocked when assignments or
executions still reference them. Existing RLS policies and the existing
tenant-link validation triggers remain in place.

Hash collisions can serialize unrelated rows, causing extra waiting but not
weaker validation. As with other transaction locks, callers should use normal
timeouts and retry handling. Multi-row writes can still encounter PostgreSQL
deadlock detection if they acquire ordinary row locks in conflicting orders;
the advisory keys themselves are acquired in a consistent order per row.

## Local verification

The following scripts connect only to the named local Supabase container and
create uniquely identified fixtures that they remove in a `finally` cleanup:

```powershell
node scripts/test-tenant-unit-integrity-concurrency.mjs
node scripts/test-tenant-unit-integrity-local.mjs
```

The concurrency suite uses separate `psql` processes and overlaps transactions
in both orders. It covers unit moves against team, checklist, assignment, and
unassigned-execution inserts; checklist moves against assignment inserts; and
assignment deactivation and identity updates against execution inserts. The integrity/RLS suite
checks valid and invalid links, organization visibility for an authenticated
user, valid and invalid authenticated writes, and effective `TRUNCATE`
privileges.

## Production migration history

At the time of this review, production history lists
`202609280001_organization_company_details` and
`202610020001_tenant_unit_integrity_and_privileges` as the only local
migrations not recorded remotely. The five commercial columns already exist
remotely as nullable `text` columns without defaults, matching the commercial
migration. This is a schema-present/history-missing state; metadata alone does
not establish how those columns were created. No remote repair or migration was
performed.

Before a future release, recheck the project, both migration statuses, and the
commercial column metadata. Run `supabase db push --linked --dry-run` and
confirm it lists exactly `202609280001` followed by `202610020001`. After a
separate release authorization, `supabase db push --linked` can apply exactly
that reviewed pair in timestamp order: the commercial migration is
`ADD COLUMN IF NOT EXISTS` and reconciles the missing history entry, then the
security migration installs the validated integrity protection. Stop if the
dry run lists any other version. Repeat the read-only tenant/unit preflight
immediately before the actual push. The CLI's `migration up` does not select a
single version, so it should not be used to attempt an isolated target apply.
Confirm a usable backup or PITR point and retain a logical backup before the
release. The security migration changes no rows, but its trigger DDL and
privilege changes should run in a low-traffic window with a tested rollback
script and operational regression checks ready.
