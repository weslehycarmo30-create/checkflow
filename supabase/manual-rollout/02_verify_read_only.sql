begin read only;
with expected(index_name) as (values ('checklist_executions_one_per_assignment')),
rows as (
select 'index_'||e.index_name report,case when i.oid is null or not x.indisvalid or not x.indisready then 'FAIL' else 'PASS' end status,coalesce(pg_get_indexdef(i.oid),'missing') count_or_value,'P1-02 assignment-scoped execution unique index.' interpretation from expected e left join pg_class i on i.relnamespace='public'::regnamespace and i.relname=e.index_name left join pg_index x on x.indexrelid=i.oid
union all select 'trigger_enforce_checkflow_assignment_cycle',case when exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname='checklist_assignments' and t.tgname='enforce_checkflow_assignment_cycle' and not t.tgisinternal) then 'PASS' else 'FAIL' end,'checklist_assignments','P1-02 duplicate-cycle trigger.'
union all select 'duplicate_operational_assignment_groups',case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text,'No duplicate active operational assignment cycle.' from (select 1 from public.checklist_assignments a where a.active and (not exists(select 1 from public.checklist_executions e where e.assignment_id=a.id) or exists(select 1 from public.checklist_executions e where e.assignment_id=a.id and e.status not in ('completed','cancelled'))) group by a.organization_id,a.checklist_id,a.assigned_to having count(*)>1) q
union all select 'duplicate_execution_assignment_groups',case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text,'No assignment owns more than one execution.' from (select 1 from public.checklist_executions where assignment_id is not null group by assignment_id having count(*)>1) q
)
select report,status,count_or_value,interpretation from rows order by report;
commit;
