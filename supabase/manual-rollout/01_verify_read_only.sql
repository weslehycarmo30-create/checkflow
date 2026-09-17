begin read only;
with expected(table_name, trigger_name) as (values ('checklists','enforce_checkflow_structure_immutability'),('checklist_sections','enforce_checkflow_structure_immutability'),('checklist_items','enforce_checkflow_structure_immutability'),('checklist_assignments','before_checkflow_lifecycle_lock'),('checklist_executions','before_checkflow_lifecycle_lock')),
rows as (
select 'function_'||p.proname report,case when p.oid is null or not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'],false) or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') then 'FAIL' else 'PASS' end status,coalesce(p.oid::regprocedure::text,'missing') count_or_value,'P1-01 SECURITY DEFINER helper with empty search_path and no client EXECUTE.' interpretation from (values ('lock_checkflow_checklist'),('checkflow_checklist_is_protected'),('enforce_checkflow_structure_immutability'),('lock_checkflow_lifecycle_checklist')) e(proname) left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=e.proname
union all select 'trigger_'||e.table_name||'.'||e.trigger_name,case when t.oid is null then 'FAIL' else 'PASS' end,coalesce(pg_get_triggerdef(t.oid),'missing'),'P1-01 structure/lifecycle trigger.' from expected e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.table_name left join pg_trigger t on t.tgrelid=c.oid and t.tgname=e.trigger_name and not t.tgisinternal
union all select 'null_checklist_status',case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text,'Null status is incompatible with structural freeze.' from public.checklists where status is null
)
select report,status,count_or_value,interpretation from rows order by report;
commit;
