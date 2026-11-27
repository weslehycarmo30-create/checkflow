-- Regression coverage for writes that row policies alone did not restrict.
-- Fixtures are local/transactional and are rolled back at the end.
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke delete on public.units from authenticated;

-- a1 owner A, a2 manager A, a3 executor A, b1 owner B, f1 user without company.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-0000-000000000' || suffix)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', suffix || '-privileges@local.test', '', now(), '{}', '{}', now(), now()
from unnest(array['9a1','9a2','9a3','9b1','9f1']) as suffix;
insert into public.organizations (id,name,created_by) values
  ('10000000-0000-0000-0000-0000000009a0','Privileges A','00000000-0000-0000-0000-0000000009a1'),
  ('10000000-0000-0000-0000-0000000009b0','Privileges B','00000000-0000-0000-0000-0000000009b1');
insert into public.organization_members (organization_id,user_id,role,active,created_by) values
  ('10000000-0000-0000-0000-0000000009a0','00000000-0000-0000-0000-0000000009a1','owner',true,'00000000-0000-0000-0000-0000000009a1'),
  ('10000000-0000-0000-0000-0000000009a0','00000000-0000-0000-0000-0000000009a2','manager',true,'00000000-0000-0000-0000-0000000009a1'),
  ('10000000-0000-0000-0000-0000000009a0','00000000-0000-0000-0000-0000000009a3','collaborator',true,'00000000-0000-0000-0000-0000000009a1'),
  ('10000000-0000-0000-0000-0000000009b0','00000000-0000-0000-0000-0000000009b1','owner',true,'00000000-0000-0000-0000-0000000009b1');
insert into public.checklists (id,organization_id,name,status,created_by) values ('20000000-0000-0000-0000-0000000009a0','10000000-0000-0000-0000-0000000009a0','Privileges','draft','00000000-0000-0000-0000-0000000009a1');
insert into public.checklist_sections (id,organization_id,checklist_id,title,created_by) values ('30000000-0000-0000-0000-0000000009a0','10000000-0000-0000-0000-0000000009a0','20000000-0000-0000-0000-0000000009a0','S','00000000-0000-0000-0000-0000000009a1');
insert into public.checklist_items (id,organization_id,section_id,prompt,answer_type,created_by) values ('40000000-0000-0000-0000-0000000009a0','10000000-0000-0000-0000-0000000009a0','30000000-0000-0000-0000-0000000009a0','Conforme?','yes_no','00000000-0000-0000-0000-0000000009a1');
update public.checklists set status='active' where id='20000000-0000-0000-0000-0000000009a0';
insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,active,created_by) values ('50000000-0000-0000-0000-0000000009a0','10000000-0000-0000-0000-0000000009a0','20000000-0000-0000-0000-0000000009a0','00000000-0000-0000-0000-0000000009a3',true,'00000000-0000-0000-0000-0000000009a1');
insert into storage.objects (bucket_id,name,owner_id,metadata)
select 'checkflow-evidence', '10000000-0000-0000-0000-0000000009a0/action-plans/90000000-0000-0000-0000-0000000009a0/' || name, '00000000-0000-0000-0000-0000000009a3', '{"mimetype":"image/jpeg"}'::jsonb
from unnest(array['first.jpg','second.jpg','third.jpg']) as name;

-- 1. The executor records a non-conformity only through the function, which fixes status and priority.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a3',true);
insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,executor_id,created_by)
values ('60000000-0000-0000-0000-0000000009a0','10000000-0000-0000-0000-0000000009a0','50000000-0000-0000-0000-0000000009a0','20000000-0000-0000-0000-0000000009a0','00000000-0000-0000-0000-0000000009a3','00000000-0000-0000-0000-0000000009a3');
insert into public.execution_answers (id,organization_id,execution_id,item_id,value,observation,created_by)
values ('70000000-0000-0000-0000-0000000009a0','10000000-0000-0000-0000-0000000009a0','60000000-0000-0000-0000-0000000009a0','40000000-0000-0000-0000-0000000009a0','"Não"','Falha','00000000-0000-0000-0000-0000000009a3');
do $$ begin
  begin
    insert into public.non_conformities (organization_id,execution_id,answer_id,item_id,executor_id,observation,priority,status,created_by)
    values ('10000000-0000-0000-0000-0000000009a0','60000000-0000-0000-0000-0000000009a0','70000000-0000-0000-0000-0000000009a0','40000000-0000-0000-0000-0000000009a0','00000000-0000-0000-0000-0000000009a3','Falha','low','completed','00000000-0000-0000-0000-0000000009a3');
    raise exception 'executor inserted an already closed non-conformity';
  exception when insufficient_privilege then null;
  end;
end $$;
select public.record_checkflow_non_conformity('60000000-0000-0000-0000-0000000009a0','40000000-0000-0000-0000-0000000009a0','Falha');
do $$ begin
  if not exists(select 1 from public.non_conformities where execution_id='60000000-0000-0000-0000-0000000009a0' and status='open' and priority='medium') then
    raise exception 'executor could not record an open non-conformity through the function';
  end if;
end $$;

-- 2. Once the manager approves a correction, the responsible executor cannot change it.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a2',true);
insert into public.action_plans (id,organization_id,non_conformity_id,description,responsible_user_id,due_at,status,created_by)
select '90000000-0000-0000-0000-0000000009a0',organization_id,id,'Corrigir','00000000-0000-0000-0000-0000000009a3',now()+interval '1 day','in_progress','00000000-0000-0000-0000-0000000009a2'
from public.non_conformities where execution_id='60000000-0000-0000-0000-0000000009a0';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a3',true);
update public.action_plans set correction_comment='10000000-0000-0000-0000-0000000009a0/action-plans/90000000-0000-0000-0000-0000000009a0/first.jpg', status='awaiting_validation' where id='90000000-0000-0000-0000-0000000009a0';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a2',true);
update public.action_plans set status='rejected', validated_by='00000000-0000-0000-0000-0000000009a2', validated_at=now() where id='90000000-0000-0000-0000-0000000009a0';
-- A rejected correction can still be sent again.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a3',true);
update public.action_plans set correction_comment='10000000-0000-0000-0000-0000000009a0/action-plans/90000000-0000-0000-0000-0000000009a0/second.jpg', status='awaiting_validation' where id='90000000-0000-0000-0000-0000000009a0';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a2',true);
update public.action_plans set status='completed', validated_by='00000000-0000-0000-0000-0000000009a2', validated_at=now() where id='90000000-0000-0000-0000-0000000009a0';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a3',true);
do $$ begin
  begin
    update public.action_plans set correction_comment='10000000-0000-0000-0000-0000000009a0/action-plans/90000000-0000-0000-0000-0000000009a0/third.jpg', status='awaiting_validation' where id='90000000-0000-0000-0000-0000000009a0';
    raise exception 'executor replaced the evidence of an approved correction';
  exception when raise_exception then if sqlerrm='executor replaced the evidence of an approved correction' then raise; end if;
  end;
  begin
    update public.action_plans set status='in_progress' where id='90000000-0000-0000-0000-0000000009a0';
    raise exception 'executor reopened an approved correction';
  exception when raise_exception then if sqlerrm='executor reopened an approved correction' then raise; end if;
  end;
end $$;
-- Management can still reopen it.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a2',true);
update public.action_plans set status='in_progress' where id='90000000-0000-0000-0000-0000000009a0';

-- 3. An owner cannot attach a person who already works for another company.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009b1',true);
do $$ begin
  begin
    insert into public.organization_members (organization_id,user_id,role,created_by)
    values ('10000000-0000-0000-0000-0000000009b0','00000000-0000-0000-0000-0000000009a1','collaborator','00000000-0000-0000-0000-0000000009b1');
    raise exception 'owner attached a member of another company';
  exception when raise_exception then if sqlerrm='owner attached a member of another company' then raise; end if;
  end;
end $$;
-- Someone who is not an owner gets the ordinary permission error, whoever the target is.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a3',true);
do $$ begin
  begin
    insert into public.organization_members (organization_id,user_id,role,created_by)
    values ('10000000-0000-0000-0000-0000000009b0','00000000-0000-0000-0000-0000000009a1','owner','00000000-0000-0000-0000-0000000009a3');
    raise exception 'non-owner created a membership';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009b1',true);
-- A person without a company can still be added, but the row cannot be repointed to an outsider.
insert into public.organization_members (organization_id,user_id,role,created_by)
values ('10000000-0000-0000-0000-0000000009b0','00000000-0000-0000-0000-0000000009f1','collaborator','00000000-0000-0000-0000-0000000009b1');
do $$ begin
  begin
    update public.organization_members set user_id='00000000-0000-0000-0000-0000000009a3'
    where organization_id='10000000-0000-0000-0000-0000000009b0' and user_id='00000000-0000-0000-0000-0000000009f1';
    raise exception 'owner repointed a membership to another company member';
  exception when raise_exception then if sqlerrm='owner repointed a membership to another company member' then raise; end if;
  end;
end $$;
-- An inactive row cannot be reactivated after the person starts working elsewhere.
update public.organization_members set active=false where organization_id='10000000-0000-0000-0000-0000000009b0' and user_id='00000000-0000-0000-0000-0000000009f1';
reset role;
insert into public.organization_members (organization_id,user_id,role,created_by)
values ('10000000-0000-0000-0000-0000000009a0','00000000-0000-0000-0000-0000000009f1','collaborator','00000000-0000-0000-0000-0000000009a1');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009b1',true);
do $$ begin
  begin
    update public.organization_members set active=true where organization_id='10000000-0000-0000-0000-0000000009b0' and user_id='00000000-0000-0000-0000-0000000009f1';
    raise exception 'owner reactivated a member of another company';
  exception when raise_exception then if sqlerrm='owner reactivated a member of another company' then raise; end if;
  end;
end $$;
-- Role changes and deactivation inside the owner's own company keep working.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000009a1',true);
do $$ declare changed integer; begin
  update public.organization_members set role='manager' where organization_id='10000000-0000-0000-0000-0000000009a0' and user_id='00000000-0000-0000-0000-0000000009a3';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'owner could not change a role'; end if;
  update public.organization_members set active=false where organization_id='10000000-0000-0000-0000-0000000009a0' and user_id='00000000-0000-0000-0000-0000000009a3';
  update public.organization_members set active=true where organization_id='10000000-0000-0000-0000-0000000009a0' and user_id='00000000-0000-0000-0000-0000000009a3';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'owner could not reactivate an own member'; end if;
end $$;
reset role;

rollback;
