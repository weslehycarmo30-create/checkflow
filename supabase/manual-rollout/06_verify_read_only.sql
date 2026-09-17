begin read only;
with expected(proname) as (values ('validate_checkflow_completion_answers')),
rows as (
select 'trigger_validate_checkflow_completion_answers' report,case when exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname='checklist_executions' and t.tgname='validate_checkflow_completion_answers' and not t.tgisinternal) then 'PASS' else 'FAIL' end status,'checklist_executions' count_or_value,'Forward completion validator trigger.' interpretation
union all select 'validator_function_grant',case when p.oid is not null and p.prosecdef and coalesce(p.proconfig @> array['search_path=""'],false) and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') then 'PASS' else 'FAIL' end,coalesce(p.oid::regprocedure::text,'missing'),'Internal completion validator cannot be called directly.' from expected e left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=e.proname
)
select report,status,count_or_value,interpretation from rows order by report;
commit;
