-- P1-02 server-side cycle regression. The separate two-session race is recorded
-- in docs/P1-02_CONCURRENCY_2026-09-04.md; this file is deterministic and rolls back.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p102-test-owner@local.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000913','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p102-test-executor@local.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.organizations (id,name,created_by) values ('10000000-0000-0000-0000-000000000912','P1-02 test','00000000-0000-0000-0000-000000000912');
insert into public.organization_members (organization_id,user_id,role,active,created_by) values
  ('10000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000912','owner',true,'00000000-0000-0000-0000-000000000912'),
  ('10000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000913','collaborator',true,'00000000-0000-0000-0000-000000000912');
insert into public.checklists (id,organization_id,name,status,created_by) values ('20000000-0000-0000-0000-000000000912','10000000-0000-0000-0000-000000000912','P1-02 test','draft','00000000-0000-0000-0000-000000000912');
insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,active,created_by) values ('50000000-0000-0000-0000-000000000912','10000000-0000-0000-0000-000000000912','20000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000913',true,'00000000-0000-0000-0000-000000000912');

do $$ begin
  begin
    insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,active,created_by) values ('50000000-0000-0000-0000-000000000913','10000000-0000-0000-0000-000000000912','20000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000913',true,'00000000-0000-0000-0000-000000000912');
    raise exception 'duplicate operational assignment was accepted';
  exception when raise_exception then if sqlerrm='duplicate operational assignment was accepted' then raise; end if;
  end;
end $$;

insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,executor_id,status,created_by) values ('60000000-0000-0000-0000-000000000912','10000000-0000-0000-0000-000000000912','50000000-0000-0000-0000-000000000912','20000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000913','in_progress','00000000-0000-0000-0000-000000000913');
do $$ begin
  begin
    insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,executor_id,status,created_by) values ('60000000-0000-0000-0000-000000000913','10000000-0000-0000-0000-000000000912','50000000-0000-0000-0000-000000000912','20000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000913','in_progress','00000000-0000-0000-0000-000000000913');
    raise exception 'duplicate execution was accepted';
  exception when unique_violation then null;
    when raise_exception then if sqlerrm='duplicate execution was accepted' then raise; end if;
  end;
end $$;

update public.checklist_executions set status='completed', completed_at=now(), conformity_percentage=100, summary='{}'::jsonb where id='60000000-0000-0000-0000-000000000912';
insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,active,created_by) values ('50000000-0000-0000-0000-000000000914','10000000-0000-0000-0000-000000000912','20000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000913',true,'00000000-0000-0000-0000-000000000912');
do $$ begin
  if (select count(*) from public.checklist_assignments where checklist_id='20000000-0000-0000-0000-000000000912') <> 2 then raise exception 'fresh assignment after completed cycle was not accepted'; end if;
end $$;

rollback;
