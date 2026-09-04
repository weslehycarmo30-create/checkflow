-- P1-03 behavioral state-machine regression. Uses the local P1-02 fixture IDs
-- only while run manually; every state mutation below is rolled back.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000932','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p103-owner@local.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000933','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p103-executor@local.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.organizations (id,name,created_by) values ('10000000-0000-0000-0000-000000000932','P1-03 local','00000000-0000-0000-0000-000000000932');
insert into public.organization_members (organization_id,user_id,role,active,created_by) values
  ('10000000-0000-0000-0000-000000000932','00000000-0000-0000-0000-000000000932','owner',true,'00000000-0000-0000-0000-000000000932'),
  ('10000000-0000-0000-0000-000000000932','00000000-0000-0000-0000-000000000933','collaborator',true,'00000000-0000-0000-0000-000000000932');
insert into public.checklists (id,organization_id,name,status,created_by) values ('20000000-0000-0000-0000-000000000932','10000000-0000-0000-0000-000000000932','P1-03 checklist','draft','00000000-0000-0000-0000-000000000932');
insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,active,created_by) values ('50000000-0000-0000-0000-000000000932','10000000-0000-0000-0000-000000000932','20000000-0000-0000-0000-000000000932','00000000-0000-0000-0000-000000000933',true,'00000000-0000-0000-0000-000000000932');
insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,executor_id,status,created_by) values ('60000000-0000-0000-0000-000000000932','10000000-0000-0000-0000-000000000932','50000000-0000-0000-0000-000000000932','20000000-0000-0000-0000-000000000932','00000000-0000-0000-0000-000000000933','in_progress','00000000-0000-0000-0000-000000000933');

do $$
begin
  if to_regprocedure('public.enforce_checkflow_execution_state_transition()') is null then
    raise exception 'P1-03 state-machine migration is not installed';
  end if;
end $$;

-- in_progress -> paused -> in_progress is the approved pause/resume flow.
update public.checklist_executions
set status='paused', paused_at=now()
where id='60000000-0000-0000-0000-000000000932';

do $$
begin
  begin
    update public.checklist_executions
    set status='completed', completed_at=now(), conformity_percentage=100, summary='{}'::jsonb
    where id='60000000-0000-0000-0000-000000000932';
    raise exception 'paused to completed was accepted';
  exception when raise_exception then
    if sqlerrm='paused to completed was accepted' then raise; end if;
  end;
end $$;

update public.checklist_executions
set status='in_progress', paused_at=null
where id='60000000-0000-0000-0000-000000000932';

do $$
begin
  begin
    update public.checklist_executions
    set status='pending'
    where id='60000000-0000-0000-0000-000000000932';
    raise exception 'pending transition was accepted';
  exception when raise_exception then
    if sqlerrm='pending transition was accepted' then raise; end if;
  end;
  begin
    update public.checklist_executions
    set status='completed', completed_at=now(), conformity_percentage=null, summary='{}'::jsonb
    where id='60000000-0000-0000-0000-000000000932';
    raise exception 'completion without conformity was accepted';
  exception when raise_exception then
    if sqlerrm='completion without conformity was accepted' then raise; end if;
  end;
end $$;

update public.checklist_executions
set status='completed', completed_at=now(), conformity_percentage=0, summary='{"required_complete":true}'::jsonb
where id='60000000-0000-0000-0000-000000000932';

do $$
begin
  begin
    update public.checklist_executions
    set status='in_progress', completed_at=null, conformity_percentage=null
    where id='60000000-0000-0000-0000-000000000932';
    raise exception 'completed to in_progress was accepted';
  exception when raise_exception then
    if sqlerrm='completed to in_progress was accepted' then raise; end if;
  end;
  begin
    update public.checklist_executions
    set status='completed', completed_at=clock_timestamp() + interval '1 second'
    where id='60000000-0000-0000-0000-000000000932';
    raise exception 'duplicate completion with different timestamp was accepted';
  exception when raise_exception then
    if sqlerrm='duplicate completion with different timestamp was accepted' then raise; end if;
  end;
end $$;

rollback;
