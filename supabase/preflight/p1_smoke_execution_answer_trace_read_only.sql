-- P1 SMOKE DEPLOY answer trace — READ ONLY. Exact target: fe0d701c-185e-4225-92de-ba760b552503.
begin read only;

with target_execution as (
  select e.id,e.organization_id,e.assignment_id,e.checklist_id,e.executor_id,e.status,e.started_at,e.completed_at,
    e.conformity_percentage,e.summary,e.execution_snapshot
  from public.checklist_executions e
  where e.id='fe0d701c-185e-4225-92de-ba760b552503'::uuid
), snapshot_items as (
  select e.id as execution_id,item
  from target_execution e
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.execution_snapshot->'sections')='array' then e.execution_snapshot->'sections' else '[]'::jsonb end) section
  cross join lateral jsonb_array_elements(case when jsonb_typeof(section->'items')='array' then section->'items' else '[]'::jsonb end) item
), answer_rows as (
  select answer.id,answer.execution_id,answer.item_id,answer.value,jsonb_typeof(answer.value) as value_json_type,
    answer.observation,answer.is_not_applicable,answer.is_conforming,answer.answered_at,answer.created_at,answer.updated_at,answer.created_by
  from public.execution_answers answer
  where answer.execution_id='fe0d701c-185e-4225-92de-ba760b552503'::uuid
), relevant_audit as (
  select log.id,log.actor_id,log.entity_type,log.entity_id,log.action,log.old_data,log.new_data,log.created_at
  from public.audit_logs log
  join target_execution e on e.organization_id=log.organization_id
  where log.entity_id=e.id
     or log.entity_id in (select id from answer_rows)
)
select 'execution' as record_type,e.id::text as record_id,
  jsonb_build_object('status',e.status,'started_at',e.started_at,'completed_at',e.completed_at,
    'conformity_percentage',e.conformity_percentage,'summary',e.summary,'executor_id',e.executor_id,
    'assignment_id',e.assignment_id,'snapshot',e.execution_snapshot)::text as detail
from target_execution e
union all
select 'answer',a.id::text,
  jsonb_build_object('execution_id',a.execution_id,'item_id',a.item_id,'value',a.value,'value_json_type',a.value_json_type,
    'observation',a.observation,'is_not_applicable',a.is_not_applicable,'is_conforming',a.is_conforming,
    'answered_at',a.answered_at,'created_at',a.created_at,'updated_at',a.updated_at,'created_by',a.created_by,
    'snapshot_item',snapshot.item,'snapshot_required',snapshot.item->>'required','snapshot_answer_type',snapshot.item->>'answer_type',
    'is_positive_checkbox_completion',(snapshot.item->>'answer_type'='checkbox' and a.value='true'::jsonb))::text
from answer_rows a left join snapshot_items snapshot on snapshot.execution_id=a.execution_id and snapshot.item->>'id'=a.item_id::text
union all
select 'audit_log',audit.id::text,
  jsonb_build_object('actor_id',audit.actor_id,'entity_type',audit.entity_type,'entity_id',audit.entity_id,
    'action',audit.action,'old_data',audit.old_data,'new_data',audit.new_data,'created_at',audit.created_at)::text
from relevant_audit audit
order by record_type,record_id;

commit;
