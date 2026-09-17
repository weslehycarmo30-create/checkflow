begin read only;
with f as (select p.oid,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proconfig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='lock_checkflow_checklist'),
rows as (
select 'lock_checkflow_checklist_fail_fast' report,case when count(*)=1 and bool_and(prosecdef and coalesce(proconfig @> array['search_path=""'],false) and definition ilike '%for no key update nowait%') then 'PASS' else 'FAIL' end status,count(*)::text count_or_value,'Forward fix must use NO KEY UPDATE NOWAIT, not blocking FOR UPDATE.' interpretation from f
union all select 'lock_helper_client_grants',case when count(*)=1 and bool_and(not has_function_privilege('anon',oid,'EXECUTE') and not has_function_privilege('authenticated',oid,'EXECUTE') and not has_function_privilege('service_role',oid,'EXECUTE')) then 'PASS' else 'FAIL' end,count(*)::text,'Lock helper remains trigger-internal.' from f
)
select report,status,count_or_value,interpretation from rows order by report;
commit;
