-- P1 incident evidence collection — READ ONLY. Do not run against production
-- until the incident owner approves the exact time window and checklist name.
begin read only;

with migration_state as (
  select version::text, name
  from supabase_migrations.schema_migrations
  where version::text in ('202609040001','202609040002','202609070002','202609180002')
), executions as (
  select e.id,e.assignment_id,e.status,e.created_at,e.started_at,e.completed_at,e.conformity_percentage,e.summary,
    e.execution_snapshot,
    count(answer.id) as persisted_answer_rows,
    count(answer.id) filter (where answer.value is not null and answer.value not in ('null'::jsonb,'""'::jsonb)) as persisted_answered_rows
  from public.checklist_executions e
  join public.checklists checklist on checklist.id=e.checklist_id
  left join public.execution_answers answer on answer.execution_id=e.id
  where checklist.name='SMOKE DEPLOY'
  group by e.id
), snapshot_items as (
  select e.id,item,
    answer.id as answer_id,answer.value,answer.observation,
    exists(select 1 from public.non_conformities nc where nc.execution_id=e.id and nc.answer_id=answer.id) as has_nc
  from executions e
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.execution_snapshot->'sections')='array' then e.execution_snapshot->'sections' else '[]'::jsonb end) section
  cross join lateral jsonb_array_elements(case when jsonb_typeof(section->'items')='array' then section->'items' else '[]'::jsonb end) item
  left join public.execution_answers answer on answer.execution_id=e.id and answer.item_id=(item->>'id')::uuid
), required_answer_gaps as (
  select id,count(*) as required_without_valid_persisted_answer
  from snapshot_items
  where coalesce((item->>'required')::boolean,false)
    and (value is null or value in ('null'::jsonb,'""'::jsonb)
      or (item->>'answer_type'='yes_no' and value in ('"Não"'::jsonb,'false'::jsonb)
        and (nullif(btrim(observation),'') is null or not has_nc)))
  group by id
)
select 'migration' as evidence_type,version as execution_id,name as value
from migration_state
union all
select 'execution',e.id::text,
  jsonb_build_object('status',e.status,'created_at',e.created_at,'started_at',e.started_at,'completed_at',e.completed_at,
    'conformity_percentage',e.conformity_percentage,'summary',e.summary,'snapshot_sections_type',jsonb_typeof(e.execution_snapshot->'sections'),
    'persisted_answer_rows',e.persisted_answer_rows,'persisted_answered_rows',e.persisted_answered_rows,
    'required_without_valid_persisted_answer',coalesce(g.required_without_valid_persisted_answer,0))::text
from executions e left join required_answer_gaps g on g.id=e.id
order by evidence_type,execution_id;

commit;
