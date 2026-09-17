begin read only;
with expected_index(index_name) as (values ('non_conformities_one_per_answer')),
expected_rpc(proname) as (values ('record_checkflow_non_conformity')),
rows as (
select 'index_'||e.index_name report,case when i.oid is null or not x.indisvalid or not x.indisready then 'FAIL' else 'PASS' end status,coalesce(pg_get_indexdef(i.oid),'missing') count_or_value,'Forward unique NC-per-answer index.' interpretation from expected_index e left join pg_class i on i.relnamespace='public'::regnamespace and i.relname=e.index_name left join pg_index x on x.indexrelid=i.oid
union all select 'rpc_record_checkflow_non_conformity_grant',case when p.oid is not null and p.prosecdef and coalesce(p.proconfig @> array['search_path=""'],false) and has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE') then 'PASS' else 'FAIL' end,coalesce(p.oid::regprocedure::text,'missing'),'Only authenticated role receives intended NC RPC EXECUTE.' from expected_rpc e left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=e.proname
union all select 'duplicate_nc_answers',case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text,'No answer has more than one non-conformity.' from (select answer_id from public.non_conformities where answer_id is not null group by answer_id having count(*)>1) q
)
select report,status,count_or_value,interpretation from rows order by report;
commit;
