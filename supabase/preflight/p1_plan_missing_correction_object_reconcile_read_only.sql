-- CheckFlow reconciliation of plan_missing_correction_object — manual READ ONLY only.
-- Target: fzmzrtthmciaisygajba. The predicate below is copied from the consolidated preflight.

begin read only;

with matching_plans as (
  select
    p.id,
    p.organization_id,
    p.status,
    p.created_at,
    p.updated_at,
    p.correction_comment,
    p.organization_id::text||'/action-plans/'||p.id::text||'/' as expected_prefix,
    left(p.correction_comment, length(p.organization_id::text||'/action-plans/'||p.id::text||'/')) = p.organization_id::text||'/action-plans/'||p.id::text||'/' as prefix_is_expected,
    exists (
      select 1 from storage.objects o
      where o.bucket_id='checkflow-evidence' and o.name=p.correction_comment
    ) as exact_object_exists,
    (
      select count(*) from storage.objects o
      where o.bucket_id='checkflow-evidence'
        and o.name like p.organization_id::text||'/action-plans/'||p.id::text||'/%'
    ) as objects_under_expected_namespace,
    exists (
      select 1 from public.attachments a where a.storage_path=p.correction_comment
    ) as attachment_uses_same_path,
    p.non_conformity_id,
    n.execution_id
  from public.action_plans p
  left join public.non_conformities n on n.id=p.non_conformity_id
  where p.correction_comment is not null
    and (
      left(p.correction_comment, length(p.organization_id::text||'/action-plans/'||p.id::text||'/')) <> p.organization_id::text||'/action-plans/'||p.id::text||'/'
      or not exists (
        select 1 from storage.objects o
        where o.bucket_id='checkflow-evidence' and o.name=p.correction_comment
      )
    )
),
rows as (
  select
    '01_current_count'::text as report,
    case when count(*)=0 then 'PASS' else 'FAIL' end::text as status,
    count(*)::text as count_or_value,
    'Exact consolidated-preflight predicate; zero means no currently matching action plan.'::text as interpretation
  from matching_plans

  union all

  select
    '02_action_plan_'||p.id::text as report,
    'FAIL'::text as status,
    'classification='||case
      when p.exact_object_exists then 'FALSE POSITIVE'
      when not p.prefix_is_expected and p.objects_under_expected_namespace=0 then 'LEGACY FORMAT'
      when not p.prefix_is_expected then 'WRONG PREFIX'
      else 'MISSING STORAGE OBJECT'
    end||'; organization_id='||p.organization_id::text||'; status='||p.status::text||'; created_at='||p.created_at::text||'; updated_at='||p.updated_at::text||'; correction_comment='||p.correction_comment||'; expected_prefix='||p.expected_prefix||'; prefix_is_expected='||p.prefix_is_expected||'; exact_object_exists='||p.exact_object_exists||'; objects_under_expected_namespace='||p.objects_under_expected_namespace||'; attachment_uses_same_path='||p.attachment_uses_same_path||'; non_conformity_id='||p.non_conformity_id::text||'; execution_id='||coalesce(p.execution_id::text,'NULL') as count_or_value,
    'Technical identifiers and Storage metadata only; no file content or execution answers are returned.'::text as interpretation
  from matching_plans p
)
select report,status,count_or_value,interpretation
from rows
order by report;

commit;
