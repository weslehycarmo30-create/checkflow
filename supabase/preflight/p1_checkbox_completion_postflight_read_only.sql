-- P1 checkbox completion postflight. Remote READ ONLY; compare historical
-- count/fingerprint against the approved preflight output.
begin read only;

with expected_migrations(version) as (
  values ('202609040001'),('202609040002'),('202609070002'),('202609180002')
), migrations as (
  select version::text,name from supabase_migrations.schema_migrations
), target_function as (
  select p.oid,pg_get_functiondef(p.oid) as definition,p.prosecdef,
    coalesce(p.proconfig @> array['search_path=""'],false) as empty_search_path,
    coalesce(array_to_string(p.proacl,','),'') as acl
  from pg_proc p where p.pronamespace='public'::regnamespace
    and p.proname='validate_checkflow_completion_answers'
    and pg_get_function_identity_arguments(p.oid)=''
), historical_checkbox_false as (
  select e.id from public.checklist_executions e
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.execution_snapshot->'sections')='array' then e.execution_snapshot->'sections' else '[]'::jsonb end) section
  cross join lateral jsonb_array_elements(case when jsonb_typeof(section->'items')='array' then section->'items' else '[]'::jsonb end) item
  join public.execution_answers answer on answer.execution_id=e.id and answer.item_id=(item->>'id')::uuid
  where e.status='completed' and coalesce((item->>'required')::boolean,false)
    and item->>'answer_type'='checkbox' and answer.value='false'::jsonb
)
select 'migration_'||expected.version as check_name,coalesce(migration.name,'MISSING') as value from expected_migrations expected left join migrations migration on migration.version=expected.version
union all select 'function_checkbox_true_only',case when exists(select 1 from target_function where definition like '%case when item->>''answer_type''=''checkbox'' then coalesce(answer.value=''true''::jsonb,false)%') then 'YES' else 'NO' end
union all select 'function_security',coalesce((select 'security_definer='||prosecdef||'; empty_search_path='||empty_search_path||'; acl='||acl from target_function),'MISSING')
union all select 'trigger',coalesce((select pg_get_triggerdef(trigger.oid)||'; enabled='||trigger.tgenabled::text from pg_trigger trigger join pg_class relation on relation.oid=trigger.tgrelid where relation.relnamespace='public'::regnamespace and relation.relname='checklist_executions' and trigger.tgname='validate_checkflow_completion_answers' and not trigger.tgisinternal),'MISSING')
union all select 'historical_completed_required_checkbox_false_count',(select count(*)::text from historical_checkbox_false)
union all select 'historical_completed_required_checkbox_false_fingerprint',(select md5(coalesce(string_agg(id::text,',' order by id),'')) from historical_checkbox_false);

commit;
