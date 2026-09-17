-- CheckFlow P1-01 remote preflight — READ ONLY.
-- Target selected manually in Supabase SQL Editor: fzmzrtthmciaisygajba.
-- This script contains only BEGIN READ ONLY, SELECT/WITH, and COMMIT.
-- It does not run the migration, change settings, write data, or use FOR UPDATE.
-- Ordinary SELECT access-share locks may be held only while each query runs.

begin read only;

-- 01. Execution context. No credentials, JWTs, user data, or emails are returned.
select
  '01_context' as report,
  current_database() as database_name,
  current_user as sql_editor_role,
  version() as postgres_version,
  now() at time zone 'utc' as checked_at_utc;

-- 02. Migration history: all six baseline migrations must be present.
with expected(version, name) as (
  values
    ('202607220001', 'base_multitenant'),
    ('202607230002', 'hardening_rls_mvp'),
    ('202607230003', 'action_plan_minimal_rls'),
    ('202608260001', 'checkflow_start_p0_provisioning_storage'),
    ('202608260002', 'execution_historical_snapshot'),
    ('202608280001', 'security_definer_execute_hardening')
), history as (
  select version::text, name
  from supabase_migrations.schema_migrations
), summary as (
  select
    count(*) filter (where h.version is null) as missing_baseline,
    count(*) filter (where h.version is not null) as present_baseline,
    (select count(*) from history h where h.version not in (select version from expected)) as unexpected_remote_versions,
    exists (select 1 from history h where h.version = '202609030001') as p1_01_already_recorded
  from expected e
  left join history h on h.version = e.version
)
select
  '02_migration_history' as report,
  case
    when missing_baseline > 0 then 'FAIL'
    when p1_01_already_recorded then 'REVIEW'
    when unexpected_remote_versions > 0 then 'REVIEW'
    else 'PASS'
  end as gate_status,
  present_baseline,
  missing_baseline,
  unexpected_remote_versions,
  p1_01_already_recorded,
  case
    when missing_baseline > 0 then 'Do not apply P1-01: baseline migration is missing.'
    when p1_01_already_recorded then 'Stop: P1-01 may already be applied; use postflight review instead.'
    when unexpected_remote_versions > 0 then 'Compare unexpected versions with the approved schema before applying.'
    else 'Expected baseline present and P1-01 is pending.'
  end as interpretation
from summary;

with expected(version, expected_name) as (
  values
    ('202607220001', 'base_multitenant'),
    ('202607230002', 'hardening_rls_mvp'),
    ('202607230003', 'action_plan_minimal_rls'),
    ('202608260001', 'checkflow_start_p0_provisioning_storage'),
    ('202608260002', 'execution_historical_snapshot'),
    ('202608280001', 'security_definer_execute_hardening'),
    ('202609030001', 'checklist_structure_integrity')
)
select
  '02_migration_history_detail' as report,
  e.version,
  e.expected_name,
  h.name as remote_name,
  case
    when h.version is null and e.version = '202609030001' then 'PASS_PENDING'
    when h.version is null then 'FAIL_MISSING'
    when h.name is distinct from e.expected_name then 'REVIEW_NAME_MISMATCH'
    else 'PASS_PRESENT'
  end as status
from expected e
left join supabase_migrations.schema_migrations h on h.version::text = e.version
order by e.version;

-- 03. Required relations. These are the direct dependencies of P1-01 plus
-- execution_answers, which is needed to assess the historical snapshot path.
with required(schema_name, relation_name) as (
  values
    ('public', 'organizations'),
    ('public', 'organization_members'),
    ('public', 'checklists'),
    ('public', 'checklist_sections'),
    ('public', 'checklist_items'),
    ('public', 'checklist_assignments'),
    ('public', 'checklist_executions'),
    ('public', 'execution_answers')
)
select
  '03_required_relations' as report,
  r.schema_name || '.' || r.relation_name as relation,
  case when c.oid is null then 'FAIL' else 'PASS' end as gate_status,
  coalesce(c.relkind::text, 'missing') as relation_kind,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as force_rls,
  coalesce(pg_get_userbyid(c.relowner), 'missing') as owner
from required r
left join pg_namespace n on n.nspname = r.schema_name
left join pg_class c on c.relnamespace = n.oid and c.relname = r.relation_name
order by relation;

-- 04. Required columns. The migration needs the P1-01 columns; snapshot and
-- organization fields are included as lifecycle/multi-tenant prerequisites.
with required(table_name, column_name) as (
  values
    ('checklists', 'id'),
    ('checklists', 'organization_id'),
    ('checklists', 'status'),
    ('checklist_sections', 'id'),
    ('checklist_sections', 'organization_id'),
    ('checklist_sections', 'checklist_id'),
    ('checklist_items', 'id'),
    ('checklist_items', 'organization_id'),
    ('checklist_items', 'section_id'),
    ('checklist_assignments', 'id'),
    ('checklist_assignments', 'organization_id'),
    ('checklist_assignments', 'checklist_id'),
    ('checklist_assignments', 'assigned_to'),
    ('checklist_assignments', 'active'),
    ('checklist_executions', 'id'),
    ('checklist_executions', 'organization_id'),
    ('checklist_executions', 'assignment_id'),
    ('checklist_executions', 'checklist_id'),
    ('checklist_executions', 'executor_id'),
    ('checklist_executions', 'status'),
    ('checklist_executions', 'execution_snapshot'),
    ('execution_answers', 'execution_id'),
    ('execution_answers', 'item_id')
)
select
  '04_required_columns' as report,
  r.table_name,
  r.column_name,
  case when c.column_name is null then 'FAIL' else 'PASS' end as gate_status,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable
from required r
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = r.table_name
 and c.column_name = r.column_name
order by r.table_name, r.column_name;

-- 05. Relevant PK/FK constraints. No user rows or identifiers are returned.
with required(kind, source_table, source_column, target_table, expected_delete_rule) as (
  values
    ('PK', 'checklists', 'id', null::text, null::text),
    ('PK', 'checklist_sections', 'id', null::text, null::text),
    ('PK', 'checklist_items', 'id', null::text, null::text),
    ('PK', 'checklist_assignments', 'id', null::text, null::text),
    ('PK', 'checklist_executions', 'id', null::text, null::text),
    ('FK', 'checklist_sections', 'checklist_id', 'checklists', 'CASCADE'),
    ('FK', 'checklist_items', 'section_id', 'checklist_sections', 'CASCADE'),
    ('FK', 'checklist_assignments', 'checklist_id', 'checklists', 'CASCADE'),
    ('FK', 'checklist_executions', 'checklist_id', 'checklists', 'NO ACTION'),
    ('FK', 'checklist_executions', 'assignment_id', 'checklist_assignments', 'SET NULL')
), observed as (
  select
    con.conname,
    src.relname as source_table,
    tgt.relname as target_table,
    con.contype,
    con.confdeltype,
    array_agg(src_attr.attname::text order by src_key.ordinality) as source_columns
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  left join pg_class tgt on tgt.oid = con.confrelid
  left join unnest(con.conkey) with ordinality as src_key(attnum, ordinality) on true
  left join pg_attribute src_attr on src_attr.attrelid = src.oid and src_attr.attnum = src_key.attnum
  join pg_namespace ns on ns.oid = src.relnamespace and ns.nspname = 'public'
  where src.relname in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions')
  group by con.conname, src.relname, tgt.relname, con.contype, con.confdeltype
)
select
  '05_relevant_constraints' as report,
  r.kind,
  r.source_table,
  r.source_column,
  r.target_table,
  r.expected_delete_rule,
  case when exists (
    select 1
    from observed o
    where o.source_table = r.source_table
      and o.contype = case r.kind when 'PK' then 'p' when 'FK' then 'f' end
      and o.source_columns = array[r.source_column]
      and (r.target_table is null or o.target_table = r.target_table)
      and (
        r.expected_delete_rule is null
        or (r.expected_delete_rule = 'CASCADE' and o.confdeltype = 'c')
        or (r.expected_delete_rule = 'SET NULL' and o.confdeltype = 'n')
        or (r.expected_delete_rule = 'NO ACTION' and o.confdeltype = 'a')
      )
  ) then 'PASS' else 'FAIL' end as gate_status
from required r
order by r.source_table, r.source_column, r.kind;

select
  '05_constraint_inventory' as report,
  c.relname as table_name,
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions')
order by table_name, con.conname;

-- 06. Potential P1-01 function conflicts. Before the migration, zero exact
-- functions is PASS; any existing function is REVIEW, never an automatic drop.
with p1_functions(proname, identity_arguments) as (
  values
    ('lock_checkflow_checklist', 'p_checklist_id uuid'),
    ('checkflow_checklist_is_protected', 'p_checklist_id uuid'),
    ('enforce_checkflow_structure_immutability', ''),
    ('lock_checkflow_lifecycle_checklist', '')
), observed as (
  select
    p.oid::regprocedure::text as signature,
    p.proname,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer,
    p.provolatile as volatility,
    coalesce(p.proconfig @> array['search_path=""'], false) as has_empty_search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'lock_checkflow_checklist',
      'checkflow_checklist_is_protected',
      'enforce_checkflow_structure_immutability',
      'lock_checkflow_lifecycle_checklist'
    )
)
select
  '06_p1_function_conflicts' as report,
  f.proname,
  f.identity_arguments,
  case when exists (
    select 1 from observed o
    where o.proname = f.proname and o.identity_arguments = f.identity_arguments
  ) then 'REVIEW' else 'PASS' end as gate_status,
  coalesce((
    select o.signature from observed o
    where o.proname = f.proname and o.identity_arguments = f.identity_arguments
    limit 1
  ), 'absent') as observed_signature
from p1_functions f
order by f.proname;

select
  '06_p1_function_conflict_detail' as report,
  signature,
  owner,
  security_definer,
  volatility,
  has_empty_search_path
from (
  select
    p.oid::regprocedure::text as signature,
    pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer,
    p.provolatile as volatility,
    coalesce(p.proconfig @> array['search_path=""'], false) as has_empty_search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'lock_checkflow_checklist',
      'checkflow_checklist_is_protected',
      'enforce_checkflow_structure_immutability',
      'lock_checkflow_lifecycle_checklist'
    )
) functions
order by signature;

-- 07. Trigger conflicts and required historical/tenant triggers.
with p1_targets(table_name, trigger_name) as (
  values
    ('checklists', 'enforce_checkflow_structure_immutability'),
    ('checklist_sections', 'enforce_checkflow_structure_immutability'),
    ('checklist_items', 'enforce_checkflow_structure_immutability'),
    ('checklist_assignments', 'before_checkflow_lifecycle_lock'),
    ('checklist_executions', 'before_checkflow_lifecycle_lock'),
    ('checklist_assignments', 'lock_checkflow_lifecycle_checklist'),
    ('checklist_executions', 'lock_checkflow_lifecycle_checklist')
)
select
  '07_p1_trigger_conflicts' as report,
  p.table_name,
  p.trigger_name,
  case when t.oid is null then 'PASS' else 'REVIEW' end as gate_status,
  coalesce(pg_get_triggerdef(t.oid), 'absent') as observed_definition
from p1_targets p
left join pg_class c on c.relname = p.table_name and c.relnamespace = 'public'::regnamespace
left join pg_trigger t on t.tgrelid = c.oid and t.tgname = p.trigger_name and not t.tgisinternal
order by p.table_name, p.trigger_name;

with expected(table_name, trigger_name) as (
  values
    ('checklist_executions', 'capture_and_protect_execution_snapshot'),
    ('checklist_sections', 'validate_tenant_links'),
    ('checklist_items', 'validate_tenant_links'),
    ('checklist_assignments', 'validate_tenant_links'),
    ('checklist_executions', 'validate_tenant_links')
)
select
  '07_required_existing_triggers' as report,
  e.table_name,
  e.trigger_name,
  case when t.oid is null then 'FAIL' else 'PASS' end as gate_status,
  coalesce(pg_get_triggerdef(t.oid), 'absent') as observed_definition
from expected e
left join pg_class c on c.relname = e.table_name and c.relnamespace = 'public'::regnamespace
left join pg_trigger t on t.tgrelid = c.oid and t.tgname = e.trigger_name and not t.tgisinternal
order by e.table_name, e.trigger_name;

select
  '07_trigger_inventory' as report,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions')
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 08. RLS and policies. P1-01 does not replace these policies.
with required(table_name) as (
  values
    ('checklists'),
    ('checklist_sections'),
    ('checklist_items'),
    ('checklist_assignments'),
    ('checklist_executions')
)
select
  '08_rls' as report,
  r.table_name,
  case
    when c.oid is null then 'FAIL'
    when not c.relrowsecurity then 'FAIL'
    when c.relforcerowsecurity then 'REVIEW'
    else 'PASS'
  end as gate_status,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as force_rls,
  coalesce(pg_get_userbyid(c.relowner), 'missing') as table_owner
from required r
left join pg_class c on c.relname = r.table_name and c.relnamespace = 'public'::regnamespace
order by r.table_name;

with expected(table_name, policy_name) as (
  values
    ('checklists', 'org_member_select'),
    ('checklists', 'org_manager_write'),
    ('checklist_sections', 'org_member_select'),
    ('checklist_sections', 'org_manager_write'),
    ('checklist_items', 'org_member_select'),
    ('checklist_items', 'org_manager_write'),
    ('checklist_assignments', 'org_manager_select'),
    ('checklist_assignments', 'org_manager_write'),
    ('checklist_assignments', 'collaborator_assignment_select'),
    ('checklist_executions', 'org_manager_select'),
    ('checklist_executions', 'org_manager_write'),
    ('checklist_executions', 'collaborator_execution_select'),
    ('checklist_executions', 'collaborator_execution_insert'),
    ('checklist_executions', 'collaborator_execution_update')
)
select
  '08_expected_policies' as report,
  e.table_name,
  e.policy_name,
  case when p.policyname is null then 'FAIL' else 'PASS' end as gate_status,
  p.cmd,
  p.roles
from expected e
left join pg_policies p
  on p.schemaname = 'public'
 and p.tablename = e.table_name
 and p.policyname = e.policy_name
order by e.table_name, e.policy_name;

select
  '08_policy_inventory' as report,
  tablename as table_name,
  policyname as policy_name,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions')
order by tablename, policyname;

-- 09. Required application roles for the REVOKE statements in P1-01.
with required(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
)
select
  '09_required_roles' as report,
  r.role_name,
  case when p.rolname is null then 'FAIL' else 'PASS' end as gate_status
from required r
left join pg_roles p on p.rolname = r.role_name
order by r.role_name;

-- 10. Aggregate data volume and lifecycle compatibility. No checklist names,
-- user IDs, assignments, executions, or snapshots are returned.
with lifecycle as (
  select
    c.id,
    c.status,
    exists (select 1 from public.checklist_assignments a where a.checklist_id = c.id) as has_assignment,
    exists (select 1 from public.checklist_executions e where e.checklist_id = c.id) as has_execution
  from public.checklists c
)
select
  '10_lifecycle_compatibility' as report,
  count(*) as checklists_total,
  count(*) filter (where status = 'draft' and not has_assignment and not has_execution) as editable_drafts,
  count(*) filter (where status = 'draft' and (has_assignment or has_execution)) as protected_drafts_with_lifecycle,
  count(*) filter (where status <> 'draft' and not has_assignment and not has_execution) as protected_non_draft_without_lifecycle,
  count(*) filter (where status <> 'draft' and (has_assignment or has_execution)) as protected_non_draft_with_lifecycle,
  count(*) filter (where status is null) as null_status,
  case
    when count(*) filter (where status is null) > 0 then 'FAIL'
    else 'PASS'
  end as gate_status,
  'All non-draft or lifecycle-linked checklists will become structurally immutable; nonzero protected counts are expected and require operational awareness, not data rewrite.' as interpretation
from lifecycle;

select
  '10_primary_counts' as report,
  (select count(*) from public.checklists) as checklists,
  (select count(*) from public.checklist_assignments) as assignments,
  (select count(*) from public.checklist_executions) as executions,
  (select count(*) from public.checklist_sections) as sections,
  (select count(*) from public.checklist_items) as items,
  (select count(*) from public.execution_answers) as execution_answers;

select
  '10_checklist_status_distribution' as report,
  status::text as checklist_status,
  count(*) as checklist_count
from public.checklists
group by status
order by checklist_status;

select
  '10_execution_status_distribution' as report,
  status::text as execution_status,
  count(*) as execution_count
from public.checklist_executions
group by status
order by execution_status;

-- 11. Orphans and invalid references. Every nonzero result is a hard stop.
with checks(gate_name, violation_count) as (
  select 'orphan_sections', count(*)
  from public.checklist_sections s
  left join public.checklists c on c.id = s.checklist_id
  where c.id is null
  union all
  select 'orphan_items', count(*)
  from public.checklist_items i
  left join public.checklist_sections s on s.id = i.section_id
  where s.id is null
  union all
  select 'orphan_assignments', count(*)
  from public.checklist_assignments a
  left join public.checklists c on c.id = a.checklist_id
  where c.id is null
  union all
  select 'orphan_executions', count(*)
  from public.checklist_executions e
  left join public.checklists c on c.id = e.checklist_id
  where c.id is null
  union all
  select 'orphan_execution_assignment_links', count(*)
  from public.checklist_executions e
  left join public.checklist_assignments a on a.id = e.assignment_id
  where e.assignment_id is not null and a.id is null
  union all
  select 'orphan_execution_answers', count(*)
  from public.execution_answers answer
  left join public.checklist_executions e on e.id = answer.execution_id
  where e.id is null
  union all
  select 'answers_outside_execution_checklist', count(*)
  from public.execution_answers answer
  join public.checklist_executions e on e.id = answer.execution_id
  left join public.checklist_items i on i.id = answer.item_id
  left join public.checklist_sections s on s.id = i.section_id
  where i.id is null or s.checklist_id is distinct from e.checklist_id
)
select
  '11_orphans_and_invalid_references' as report,
  gate_name,
  case when violation_count = 0 then 'PASS' else 'FAIL' end as gate_status,
  violation_count
from checks
order by gate_name;

-- 12. Cross-tenant and execution-assignment identity links. Nonzero is a stop.
with checks(gate_name, violation_count) as (
  select 'section_checklist_org_mismatch', count(*)
  from public.checklist_sections s
  join public.checklists c on c.id = s.checklist_id
  where s.organization_id is distinct from c.organization_id
  union all
  select 'item_section_org_mismatch', count(*)
  from public.checklist_items i
  join public.checklist_sections s on s.id = i.section_id
  where i.organization_id is distinct from s.organization_id
  union all
  select 'assignment_checklist_org_mismatch', count(*)
  from public.checklist_assignments a
  join public.checklists c on c.id = a.checklist_id
  where a.organization_id is distinct from c.organization_id
  union all
  select 'execution_checklist_org_mismatch', count(*)
  from public.checklist_executions e
  join public.checklists c on c.id = e.checklist_id
  where e.organization_id is distinct from c.organization_id
  union all
  select 'execution_assignment_org_or_checklist_mismatch', count(*)
  from public.checklist_executions e
  join public.checklist_assignments a on a.id = e.assignment_id
  where e.assignment_id is not null
    and (e.organization_id is distinct from a.organization_id
         or e.checklist_id is distinct from a.checklist_id)
  union all
  select 'execution_assignment_executor_mismatch', count(*)
  from public.checklist_executions e
  join public.checklist_assignments a on a.id = e.assignment_id
  where e.assignment_id is not null
    and e.executor_id is distinct from a.assigned_to
  union all
  select 'answer_execution_org_mismatch', count(*)
  from public.execution_answers answer
  join public.checklist_executions e on e.id = answer.execution_id
  where answer.organization_id is distinct from e.organization_id
  union all
  select 'checklists_without_organization', count(*)
  from public.checklists
  where organization_id is null
)
select
  '12_cross_tenant_and_identity_links' as report,
  gate_name,
  case when violation_count = 0 then 'PASS' else 'FAIL' end as gate_status,
  violation_count
from checks
order by gate_name;

-- 13. Duplicate lifecycle records. These do not block the DDL by themselves,
-- but must be reviewed because they can affect operational assignment selection.
with duplicate_groups as (
  select count(*) as assignment_count
  from public.checklist_assignments
  where active
  group by organization_id, checklist_id, assigned_to
  having count(*) > 1
), summary as (
  select
    count(*) as duplicate_groups,
    coalesce(sum(assignment_count - 1), 0) as excess_assignments,
    coalesce(max(assignment_count), 0) as maximum_group_size
  from duplicate_groups
)
select
  '13_duplicate_active_assignments' as report,
  case when duplicate_groups = 0 then 'PASS' else 'REVIEW' end as gate_status,
  duplicate_groups,
  excess_assignments,
  maximum_group_size,
  case when duplicate_groups = 0
    then 'No duplicate active assignment groups.'
    else 'Review against the approved re-assignment behavior from 68852bd; no IDs are emitted.'
  end as interpretation
from summary;

with duplicate_groups as (
  select count(*) as execution_count
  from public.checklist_executions
  where assignment_id is not null
  group by assignment_id
  having count(*) > 1
), summary as (
  select
    count(*) as duplicate_groups,
    coalesce(sum(execution_count - 1), 0) as excess_executions,
    coalesce(max(execution_count), 0) as maximum_group_size
  from duplicate_groups
)
select
  '13_duplicate_executions_per_assignment' as report,
  case when duplicate_groups = 0 then 'PASS' else 'REVIEW' end as gate_status,
  duplicate_groups,
  excess_executions,
  maximum_group_size,
  case when duplicate_groups = 0
    then 'No assignment has multiple executions.'
    else 'Review before rollout; P1-01 does not change execution cardinality.'
  end as interpretation
from summary;

-- 14. Historical snapshot compatibility. A completed execution without a
-- snapshot is incompatible with the approved historical baseline.
select
  '14_historical_snapshot' as report,
  case when count(*) filter (where status = 'completed' and execution_snapshot is null) = 0
       then 'PASS' else 'FAIL' end as gate_status,
  count(*) filter (where status = 'completed') as completed_executions,
  count(*) filter (where status = 'completed' and execution_snapshot is null) as completed_without_snapshot,
  count(*) filter (where execution_snapshot is null) as all_executions_without_snapshot
from public.checklist_executions;

-- 15. One compact decision row. Every FAIL is a stop. REVIEW requires explicit
-- human review; it is not permission to apply the migration automatically.
with gate_results(gate_name, gate_status) as (
  select 'baseline_migrations', case when count(*) = 6 then 'PASS' else 'FAIL' end
  from supabase_migrations.schema_migrations
  where version::text in ('202607220001','202607230002','202607230003','202608260001','202608260002','202608280001')
  union all
  select 'p1_migration_pending', case when exists (
    select 1 from supabase_migrations.schema_migrations where version::text = '202609030001'
  ) then 'REVIEW' else 'PASS' end
  union all
  select 'required_relations', case when count(*) = 8 then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('organizations','organization_members','checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions','execution_answers')
  union all
  select 'required_columns', case when count(*) = 23 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema = 'public'
    and (table_name, column_name) in (
      ('checklists','id'), ('checklists','organization_id'), ('checklists','status'),
      ('checklist_sections','id'), ('checklist_sections','organization_id'), ('checklist_sections','checklist_id'),
      ('checklist_items','id'), ('checklist_items','organization_id'), ('checklist_items','section_id'),
      ('checklist_assignments','id'), ('checklist_assignments','organization_id'), ('checklist_assignments','checklist_id'), ('checklist_assignments','assigned_to'), ('checklist_assignments','active'),
      ('checklist_executions','id'), ('checklist_executions','organization_id'), ('checklist_executions','assignment_id'), ('checklist_executions','checklist_id'), ('checklist_executions','executor_id'), ('checklist_executions','status'), ('checklist_executions','execution_snapshot'),
      ('execution_answers','execution_id'), ('execution_answers','item_id')
    )
  union all
  select 'required_constraints', case when
    (select count(*)
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions')
       and con.contype = 'p'
       and array_length(con.conkey, 1) = 1
       and (select attname::text from pg_attribute where attrelid = c.oid and attnum = con.conkey[1]) = 'id') = 5
    and
    (select count(*)
     from (
       values
         ('checklist_sections', 'checklists', 'c'),
         ('checklist_items', 'checklist_sections', 'c'),
         ('checklist_assignments', 'checklists', 'c'),
         ('checklist_executions', 'checklists', 'a'),
         ('checklist_executions', 'checklist_assignments', 'n')
     ) required(source_table, target_table, delete_type)
     where exists (
       select 1
       from pg_constraint con
       join pg_class src on src.oid = con.conrelid
       join pg_class tgt on tgt.oid = con.confrelid
       join pg_namespace n on n.oid = src.relnamespace
       where n.nspname = 'public'
         and con.contype = 'f'
         and src.relname = required.source_table
         and tgt.relname = required.target_table
         and con.confdeltype = required.delete_type
     )) = 5
    then 'PASS' else 'FAIL' end
  union all
  select 'rls_enabled', case when count(*) = 5 then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions')
    and c.relrowsecurity
  union all
  select 'force_rls_compatibility', case when count(*) = 0 then 'PASS' else 'REVIEW' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions')
    and c.relforcerowsecurity
  union all
  select 'expected_policies', case when count(*) = 14 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public'
    and (tablename, policyname) in (
      ('checklists','org_member_select'), ('checklists','org_manager_write'),
      ('checklist_sections','org_member_select'), ('checklist_sections','org_manager_write'),
      ('checklist_items','org_member_select'), ('checklist_items','org_manager_write'),
      ('checklist_assignments','org_manager_select'), ('checklist_assignments','org_manager_write'), ('checklist_assignments','collaborator_assignment_select'),
      ('checklist_executions','org_manager_select'), ('checklist_executions','org_manager_write'),
      ('checklist_executions','collaborator_execution_select'), ('checklist_executions','collaborator_execution_insert'), ('checklist_executions','collaborator_execution_update')
    )
  union all
  select 'required_roles', case when count(*) = 3 then 'PASS' else 'FAIL' end
  from pg_roles where rolname in ('anon','authenticated','service_role')
  union all
  select 'p1_function_conflicts', case when count(*) = 0 then 'PASS' else 'REVIEW' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname, pg_get_function_identity_arguments(p.oid)) in (
      ('lock_checkflow_checklist','p_checklist_id uuid'),
      ('checkflow_checklist_is_protected','p_checklist_id uuid'),
      ('enforce_checkflow_structure_immutability',''),
      ('lock_checkflow_lifecycle_checklist','')
    )
  union all
  select 'p1_trigger_conflicts', case when count(*) = 0 then 'PASS' else 'REVIEW' end
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and (
      (c.relname in ('checklists','checklist_sections','checklist_items') and t.tgname = 'enforce_checkflow_structure_immutability')
      or (c.relname in ('checklist_assignments','checklist_executions') and t.tgname in ('before_checkflow_lifecycle_lock','lock_checkflow_lifecycle_checklist'))
    )
  union all
  select 'required_historical_and_tenant_triggers', case when count(*) = 5 then 'PASS' else 'FAIL' end
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and (c.relname, t.tgname) in (
      ('checklist_executions','capture_and_protect_execution_snapshot'),
      ('checklist_sections','validate_tenant_links'), ('checklist_items','validate_tenant_links'),
      ('checklist_assignments','validate_tenant_links'), ('checklist_executions','validate_tenant_links')
    )
  union all
  select 'orphan_and_cross_tenant_data', case when
    (select count(*) from public.checklist_sections s left join public.checklists c on c.id=s.checklist_id where c.id is null) +
    (select count(*) from public.checklist_items i left join public.checklist_sections s on s.id=i.section_id where s.id is null) +
    (select count(*) from public.checklist_assignments a left join public.checklists c on c.id=a.checklist_id where c.id is null) +
    (select count(*) from public.checklist_executions e left join public.checklists c on c.id=e.checklist_id where c.id is null) +
    (select count(*) from public.checklist_sections s join public.checklists c on c.id=s.checklist_id where s.organization_id is distinct from c.organization_id) +
    (select count(*) from public.checklist_items i join public.checklist_sections s on s.id=i.section_id where i.organization_id is distinct from s.organization_id) +
    (select count(*) from public.checklist_assignments a join public.checklists c on c.id=a.checklist_id where a.organization_id is distinct from c.organization_id) +
    (select count(*) from public.checklist_executions e join public.checklists c on c.id=e.checklist_id where e.organization_id is distinct from c.organization_id)
    = 0 then 'PASS' else 'FAIL' end
  union all
  select 'completed_snapshots', case when not exists (
    select 1 from public.checklist_executions where status='completed' and execution_snapshot is null
  ) then 'PASS' else 'FAIL' end
  union all
  select 'duplicate_active_assignments', case when exists (
    select 1 from public.checklist_assignments
    where active
    group by organization_id, checklist_id, assigned_to
    having count(*) > 1
  ) then 'REVIEW' else 'PASS' end
  union all
  select 'duplicate_executions_per_assignment', case when exists (
    select 1 from public.checklist_executions
    where assignment_id is not null
    group by assignment_id
    having count(*) > 1
  ) then 'REVIEW' else 'PASS' end
)
select
  '15_preflight_decision' as report,
  case
    when count(*) filter (where gate_status = 'FAIL') > 0 then 'FAIL'
    when count(*) filter (where gate_status = 'REVIEW') > 0 then 'REVIEW'
    else 'PASS'
  end as overall_status,
  count(*) filter (where gate_status = 'PASS') as pass_gates,
  count(*) filter (where gate_status = 'REVIEW') as review_gates,
  count(*) filter (where gate_status = 'FAIL') as fail_gates,
  string_agg(gate_name || '=' || gate_status, ', ' order by gate_name) as gate_summary,
  case
    when count(*) filter (where gate_status = 'FAIL') > 0 then 'STOP: fix or formally investigate the failing baseline/data gate before any migration.'
    when count(*) filter (where gate_status = 'REVIEW') > 0 then 'STOP: obtain explicit review for every REVIEW item before any migration.'
    else 'Schema/data preflight PASS. This does not apply P1-01 and does not replace backup/approval.'
  end as interpretation
from gate_results;

commit;
