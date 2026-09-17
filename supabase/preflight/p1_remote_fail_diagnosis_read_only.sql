-- CheckFlow remote preflight FAIL diagnosis — MANUAL READ ONLY execution only.
-- Target: fzmzrtthmciaisygajba. One final result set. No application functions are invoked.
-- The documented remote deployment completion for 202608260002 is retained only as a
-- comparison marker; schema_migrations does not record an applied_at timestamp.

begin read only;

with
context as (
  select
    exists (select 1 from supabase_migrations.schema_migrations where version::text='202608260002') snapshot_migration_recorded,
    '2026-08-28T14:37:53.122342Z'::timestamptz documented_snapshot_migration_completed_at
),
snapshot_failures as (
  select
    e.id, e.organization_id, e.status, e.created_at, e.started_at, e.completed_at,
    e.assignment_id, e.checklist_id, e.executor_id,
    e.execution_snapshot is null as snapshot_is_null,
    case when e.execution_snapshot is null then null else jsonb_typeof(e.execution_snapshot) end as snapshot_json_type,
    case when e.execution_snapshot is null then null else e.execution_snapshot->>'version' end as snapshot_version,
    case when e.execution_snapshot is null then null else jsonb_typeof(e.execution_snapshot->'sections') end as sections_json_type,
    case when e.execution_snapshot is null then null else e.execution_snapshot#>>'{checklist,id}' end as snapshot_checklist_id,
    case when e.execution_snapshot is null then null else e.execution_snapshot#>>'{executor,id}' end as snapshot_executor_id,
    case when e.execution_snapshot is null then null else e.execution_snapshot#>>'{assignment,id}' end as snapshot_assignment_id,
    md5(coalesce(e.execution_snapshot::text,'')) as snapshot_hash
  from public.checklist_executions e
  where e.status='completed' and e.execution_snapshot is null
     or e.execution_snapshot is null
     or jsonb_typeof(e.execution_snapshot) is distinct from 'object'
     or jsonb_typeof(e.execution_snapshot->'sections') is distinct from 'array'
     or e.execution_snapshot->>'version' is distinct from '1'
     or e.execution_snapshot#>>'{checklist,id}' is distinct from e.checklist_id::text
     or e.execution_snapshot#>>'{executor,id}' is distinct from e.executor_id::text
     or e.execution_snapshot#>>'{assignment,id}' is distinct from e.assignment_id::text
),
completed_without_snapshot as (
  select id from public.checklist_executions where status='completed' and execution_snapshot is null
),
snapshot_shape_failures as (
  select id from public.checklist_executions
  where execution_snapshot is null
     or jsonb_typeof(execution_snapshot) is distinct from 'object'
     or jsonb_typeof(execution_snapshot->'sections') is distinct from 'array'
     or execution_snapshot->>'version' is distinct from '1'
     or execution_snapshot#>>'{checklist,id}' is distinct from checklist_id::text
     or execution_snapshot#>>'{executor,id}' is distinct from executor_id::text
     or execution_snapshot#>>'{assignment,id}' is distinct from assignment_id::text
),
broken_plans as (
  select
    p.id, p.organization_id, p.non_conformity_id, p.status, p.created_at, p.updated_at,
    p.correction_comment,
    left(p.correction_comment, length(p.organization_id::text||'/action-plans/'||p.id::text||'/')) = p.organization_id::text||'/action-plans/'||p.id::text||'/' as expected_prefix,
    exists (select 1 from storage.objects o where o.bucket_id='checkflow-evidence' and o.name=p.correction_comment) as exact_object_exists,
    exists (select 1 from public.attachments a where a.storage_path=p.correction_comment) as attachment_uses_same_path,
    n.execution_id,
    exists (
      select 1 from storage.objects o
      where o.bucket_id='checkflow-evidence'
        and o.name like p.organization_id::text||'/action-plans/'||p.id::text||'/%'
    ) as object_exists_under_expected_prefix,
    (select count(*) from storage.objects o
      where o.bucket_id='checkflow-evidence'
        and o.name like p.organization_id::text||'/action-plans/'||p.id::text||'/%') as objects_under_expected_prefix
  from public.action_plans p
  left join public.non_conformities n on n.id=p.non_conformity_id
  where p.correction_comment is not null
    and (
      left(p.correction_comment, length(p.organization_id::text||'/action-plans/'||p.id::text||'/')) <> p.organization_id::text||'/action-plans/'||p.id::text||'/'
      or not exists (select 1 from storage.objects o where o.bucket_id='checkflow-evidence' and o.name=p.correction_comment)
    )
),
orphan_objects as (
  select
    o.bucket_id, o.name, o.created_at, o.updated_at, o.owner_id,
    o.metadata->>'size' as size_bytes,
    coalesce(o.metadata->>'mimetype',o.metadata->>'contentType') as mime_type,
    exists (select 1 from public.attachments a where a.storage_path=o.name) as direct_attachment_reference,
    exists (select 1 from public.action_plans p where p.correction_comment=o.name) as direct_plan_reference,
    exists (select 1 from public.action_plans p where o.name like p.organization_id::text||'/action-plans/'||p.id::text||'/%') as matches_any_action_plan_namespace,
    exists (select 1 from public.attachments a join public.checklist_executions e on e.id=a.execution_id where o.name like e.organization_id::text||'/'||e.id::text||'/%') as matches_any_execution_namespace
  from storage.objects o
  where o.bucket_id='checkflow-evidence'
    and not exists (select 1 from public.attachments a where a.storage_path=o.name)
    and not exists (select 1 from public.action_plans p where p.correction_comment=o.name)
),
rows as (
  select
    '01_context' report,
    case when snapshot_migration_recorded then 'INFO' else 'FAIL' end status,
    'snapshot_migration_recorded='||snapshot_migration_recorded||'; documented_completed_at='||documented_snapshot_migration_completed_at::text count_or_value,
    'schema_migrations has no applied_at; use the documented timestamp only as an external comparison marker.' interpretation
  from context

  union all
  select
    '02_snapshot_set_comparison',
    case when (select count(*) from completed_without_snapshot)=(select count(*) from snapshot_shape_failures)
              and not exists ((select id from completed_without_snapshot) except (select id from snapshot_shape_failures))
              and not exists ((select id from snapshot_shape_failures) except (select id from completed_without_snapshot))
         then 'PASS' else 'REVIEW' end,
    'completed_without_snapshot='||(select count(*) from completed_without_snapshot)||'; snapshot_shape='||(select count(*) from snapshot_shape_failures)||'; overlap='||(select count(*) from (select id from completed_without_snapshot intersect select id from snapshot_shape_failures) x),
    'PASS proves both preflight failures identify exactly the same execution set.'

  union all
  select
    '03_snapshot_execution_'||s.id::text,
    case
      when s.snapshot_is_null and s.created_at < c.documented_snapshot_migration_completed_at then 'INFO'
      when s.snapshot_is_null then 'REVIEW'
      when s.snapshot_json_type <> 'object' or s.sections_json_type <> 'array' then 'FAIL'
      when s.snapshot_version <> '1' then 'FAIL'
      when s.snapshot_checklist_id is distinct from s.checklist_id::text
        or s.snapshot_executor_id is distinct from s.executor_id::text
        or s.snapshot_assignment_id is distinct from s.assignment_id::text then 'FAIL'
      else 'REVIEW'
    end,
    'classification='||case
      when s.snapshot_is_null and s.created_at < c.documented_snapshot_migration_completed_at then 'LEGACY PRE-SNAPSHOT'
      when s.snapshot_is_null then 'UNEXPECTED'
      when s.snapshot_json_type <> 'object' or s.sections_json_type <> 'array' then 'INCOMPLETE'
      when s.snapshot_version <> '1' or s.snapshot_checklist_id is distinct from s.checklist_id::text
        or s.snapshot_executor_id is distinct from s.executor_id::text
        or s.snapshot_assignment_id is distinct from s.assignment_id::text then 'CORRUPTED'
      else 'UNEXPECTED'
    end||'; status='||s.status::text||'; created_at='||s.created_at::text||'; started_at='||s.started_at::text||'; completed_at='||coalesce(s.completed_at::text,'NULL')||'; organization_id='||s.organization_id::text||'; assignment_id='||coalesce(s.assignment_id::text,'NULL')||'; checklist_id='||s.checklist_id::text||'; executor_id='||s.executor_id::text||'; snapshot_null='||s.snapshot_is_null||'; snapshot_type='||coalesce(s.snapshot_json_type,'NULL')||'; version='||coalesce(s.snapshot_version,'NULL')||'; sections_type='||coalesce(s.sections_json_type,'NULL')||'; snapshot_checklist_id='||coalesce(s.snapshot_checklist_id,'NULL')||'; snapshot_executor_id='||coalesce(s.snapshot_executor_id,'NULL')||'; snapshot_assignment_id='||coalesce(s.snapshot_assignment_id,'NULL')||'; snapshot_hash='||s.snapshot_hash,
    'Technical identifiers and shape metadata only; snapshot, answers, and user content are not returned.'
  from snapshot_failures s cross join context c

  union all
  select
    '04_broken_action_plan_'||p.id::text,
    case when p.exact_object_exists then 'REVIEW' else 'FAIL' end,
    'classification='||case
      when p.exact_object_exists then 'FALSE POSITIVE DO PREFLIGHT'
      when not p.expected_prefix and not p.object_exists_under_expected_prefix then 'LEGACY FORMAT'
      when not p.expected_prefix then 'WRONG PREFIX'
      else 'MISSING STORAGE OBJECT'
    end||'; organization_id='||p.organization_id::text||'; non_conformity_id='||p.non_conformity_id::text||'; execution_id='||coalesce(p.execution_id::text,'NULL')||'; status='||p.status::text||'; created_at='||p.created_at::text||'; updated_at='||p.updated_at::text||'; correction_comment='||p.correction_comment||'; expected_prefix='||p.expected_prefix||'; exact_object_exists='||p.exact_object_exists||'; objects_under_expected_prefix='||p.objects_under_expected_prefix||'; attachment_uses_same_path='||p.attachment_uses_same_path,
    'No file content returned. Inspect whether an alternate object exists under the expected namespace before proposing any repair.'
  from broken_plans p

  union all
  select
    '05_orphan_object_'||md5(o.name),
    case when o.matches_any_action_plan_namespace or o.matches_any_execution_namespace then 'REVIEW' else 'INFO' end,
    'classification='||case when o.matches_any_action_plan_namespace or o.matches_any_execution_namespace then 'POSSIBLE LEGACY REFERENCE' else 'SAFE ORPHAN' end||'; bucket='||o.bucket_id||'; path='||o.name||'; created_at='||o.created_at::text||'; updated_at='||o.updated_at::text||'; owner_id='||coalesce(o.owner_id,'NULL')||'; size_bytes='||coalesce(o.size_bytes,'NULL')||'; mime_type='||coalesce(o.mime_type,'NULL')||'; direct_attachment_reference='||o.direct_attachment_reference||'; direct_plan_reference='||o.direct_plan_reference||'; action_plan_namespace_match='||o.matches_any_action_plan_namespace||'; execution_namespace_match='||o.matches_any_execution_namespace,
    'No deletion. REVIEW requires a human to inspect legacy provenance and consent before any cleanup.'
  from orphan_objects o

  union all
  select
    '06_correlation',
    'INFO',
    'snapshot_failures='||(select count(*) from snapshot_failures)||'; broken_plans='||(select count(*) from broken_plans)||'; orphan_objects='||(select count(*) from orphan_objects)||'; broken_plans_linked_to_snapshot_failure='||(select count(*) from broken_plans p join snapshot_failures s on s.id=p.execution_id)||'; orphan_paths_equal_broken_plan_path='||(select count(*) from orphan_objects o join broken_plans p on p.correction_comment=o.name),
    'Counts determine whether the four findings share a direct execution or object-path link.'

  union all
  select
    '07_decision_rule' as report,
    'INFO' as status,
    'No mutation was performed. Do not backfill a legacy snapshot unless faithful reconstruction is proven from immutable source evidence.' as count_or_value,
    'Any post-migration snapshot failure is a P1 stop; legacy no-snapshot history is preserved, not fabricated. Missing storage references and candidate orphans require backup plus explicit human authorization before remediation.' as interpretation
)
select report,status,count_or_value,interpretation
from rows
order by report;

commit;
