-- P1 checkbox completion preflight. Remote READ ONLY; no test DML.
begin read only;

with expected_migrations(version) as (
  values ('202609040001'),('202609040002'),('202609070002'),('202609180002')
), migrations as (
  select version::text,name from supabase_migrations.schema_migrations
), target_function as (
  select p.oid,p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition,
    p.prosecdef,coalesce(p.proconfig @> array['search_path=""'],false) as empty_search_path,
    coalesce(array_to_string(p.proacl,','),'') as acl
  from pg_proc p where p.pronamespace='public'::regnamespace
    and p.proname='validate_checkflow_completion_answers'
    and pg_get_function_identity_arguments(p.oid)=''
), historical_checkbox_false as (
  select e.id
  from public.checklist_executions e
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.execution_snapshot->'sections')='array' then e.execution_snapshot->'sections' else '[]'::jsonb end) section
  cross join lateral jsonb_array_elements(case when jsonb_typeof(section->'items')='array' then section->'items' else '[]'::jsonb end) item
  join public.execution_answers answer on answer.execution_id=e.id and answer.item_id=(item->>'id')::uuid
  where e.status='completed' and coalesce((item->>'required')::boolean,false)
    and item->>'answer_type'='checkbox' and answer.value='false'::jsonb
), function_dependencies as (
  select coalesce(jsonb_agg(jsonb_build_object('schema',namespace.nspname,'object',coalesce(relation.relname,procedure.proname),'type',dependency.classid::regclass::text) order by namespace.nspname,coalesce(relation.relname,procedure.proname)),'[]'::jsonb) as objects
  from pg_depend dependency
  join target_function function on function.oid=dependency.refobjid
  left join pg_class relation on relation.oid=dependency.objid
  left join pg_proc procedure on procedure.oid=dependency.objid
  left join pg_namespace namespace on namespace.oid=coalesce(relation.relnamespace,procedure.pronamespace)
  where dependency.deptype not in ('i','p')
)
select 'linked_project_expected' as check_name,'fzmzrtthmciaisygajba' as value
union all select 'migration_'||expected.version,coalesce(migration.name,'MISSING') from expected_migrations expected left join migrations migration on migration.version=expected.version
union all select 'function_signature',coalesce(function.signature,'MISSING') from target_function function
union all select 'function_security',coalesce('security_definer='||function.prosecdef||'; empty_search_path='||function.empty_search_path||'; acl='||function.acl,'MISSING') from target_function function
union all select 'function_checkbox_true_only',case when exists(select 1 from target_function where definition like '%case when item->>''answer_type''=''checkbox'' then coalesce(answer.value=''true''::jsonb,false)%') then 'YES' else 'NO' end
union all select 'trigger',coalesce((select pg_get_triggerdef(trigger.oid)||'; enabled='||trigger.tgenabled::text from pg_trigger trigger join pg_class relation on relation.oid=trigger.tgrelid where relation.relnamespace='public'::regnamespace and relation.relname='checklist_executions' and trigger.tgname='validate_checkflow_completion_answers' and not trigger.tgisinternal),'MISSING')
union all select 'function_dependencies',(select objects::text from function_dependencies)
union all select 'historical_completed_required_checkbox_false_count',(select count(*)::text from historical_checkbox_false)
union all select 'historical_completed_required_checkbox_false_fingerprint',(select md5(coalesce(string_agg(id::text,',' order by id),'')) from historical_checkbox_false);

commit;
