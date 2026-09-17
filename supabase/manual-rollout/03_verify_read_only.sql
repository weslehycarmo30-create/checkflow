begin read only;
with rows as (
select 'trigger_enforce_checkflow_execution_state_transition' report,case when exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname='checklist_executions' and t.tgname='enforce_checkflow_execution_state_transition' and not t.tgisinternal) then 'PASS' else 'FAIL' end status,'checklist_executions' count_or_value,'P1-03 state-machine trigger.' interpretation
union all select 'execution_state_and_timestamp_violations',case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text,'Only in_progress, paused, completed with compatible timestamps/completion fields.' from public.checklist_executions where status not in ('in_progress','paused','completed') or started_at is null or (status='in_progress' and (paused_at is not null or completed_at is not null or conformity_percentage is not null)) or (status='paused' and (paused_at is null or completed_at is not null or conformity_percentage is not null)) or (status='completed' and (paused_at is not null or completed_at is null or completed_at<started_at or conformity_percentage is null or conformity_percentage not between 0 and 100 or jsonb_typeof(summary) is distinct from 'object'))
)
select report,status,count_or_value,interpretation from rows order by report;
commit;
