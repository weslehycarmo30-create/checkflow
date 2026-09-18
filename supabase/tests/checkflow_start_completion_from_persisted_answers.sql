-- P1 functional regression: execute after all migrations in an isolated local DB.
-- Covers server-side completion rejection and timestamps; all fixture data rolls back.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p1-completion-owner@local.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000952','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p1-completion-executor@local.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
insert into public.organizations (id,name,created_by) values ('10000000-0000-0000-0000-000000000951','P1 completion local','00000000-0000-0000-0000-000000000951');
insert into public.organization_members (organization_id,user_id,role,active,created_by) values
  ('10000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000951','owner',true,'00000000-0000-0000-0000-000000000951'),
  ('10000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952','collaborator',true,'00000000-0000-0000-0000-000000000951');
insert into public.checklists (id,organization_id,name,status,created_by) values ('20000000-0000-0000-0000-000000000951','10000000-0000-0000-0000-000000000951','P1 completion checklist','draft','00000000-0000-0000-0000-000000000951');
insert into public.checklist_sections (id,organization_id,checklist_id,title,created_by) values ('30000000-0000-0000-0000-000000000951','10000000-0000-0000-0000-000000000951','20000000-0000-0000-0000-000000000951','Obrigatórios','00000000-0000-0000-0000-000000000951');
insert into public.checklist_items (id,organization_id,section_id,prompt,answer_type,required,created_by) values
  ('40000000-0000-0000-0000-000000000951','10000000-0000-0000-0000-000000000951','30000000-0000-0000-0000-000000000951','Confirmar etapa','checkbox',true,'00000000-0000-0000-0000-000000000951'),
  ('40000000-0000-0000-0000-000000000952','10000000-0000-0000-0000-000000000951','30000000-0000-0000-0000-000000000951','Resposta opcional','yes_no',false,'00000000-0000-0000-0000-000000000951'),
  ('40000000-0000-0000-0000-000000000953','10000000-0000-0000-0000-000000000951','30000000-0000-0000-0000-000000000951','Resposta negativa registrada','yes_no',true,'00000000-0000-0000-0000-000000000951');
insert into public.checklist_assignments (id,organization_id,checklist_id,assigned_to,active,created_by) values ('50000000-0000-0000-0000-000000000951','10000000-0000-0000-0000-000000000951','20000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952',true,'00000000-0000-0000-0000-000000000951');
insert into public.checklist_executions (id,organization_id,assignment_id,checklist_id,executor_id,status,created_by) values ('60000000-0000-0000-0000-000000000951','10000000-0000-0000-0000-000000000951','50000000-0000-0000-0000-000000000951','20000000-0000-0000-0000-000000000951','00000000-0000-0000-0000-000000000952','in_progress','00000000-0000-0000-0000-000000000952');

-- Opening neither writes an answer nor completion fields (A, D, F).
do $$ begin
  if exists (select 1 from public.execution_answers where execution_id='60000000-0000-0000-0000-000000000951') then raise exception 'opening created an answer'; end if;
  if exists (select 1 from public.checklist_executions where id='60000000-0000-0000-0000-000000000951' and (status<>'in_progress' or completed_at is not null)) then raise exception 'opening changed execution state'; end if;
  if not jsonb_path_exists((select execution_snapshot from public.checklist_executions where id='60000000-0000-0000-0000-000000000951'),'$.sections[*].items[*] ? (@.id == "40000000-0000-0000-0000-000000000951")') then raise exception 'snapshot omitted required item'; end if;
end $$;

-- Completing without the persisted required answer is rejected and leaves no completed_at (E, F).
do $$ begin
  begin
    update public.checklist_executions set status='completed',completed_at=now(),conformity_percentage=100,summary='{}'::jsonb where id='60000000-0000-0000-0000-000000000951';
    raise exception 'completion without persisted required answer was accepted';
  exception when raise_exception then
    if sqlerrm='completion without persisted required answer was accepted' then raise; end if;
  end;
  if exists (select 1 from public.checklist_executions where id='60000000-0000-0000-0000-000000000951' and (status<>'in_progress' or completed_at is not null)) then raise exception 'rejected completion altered persisted state'; end if;
end $$;

-- A persisted false checkbox remains incomplete and the server rejects completion (B, G).
insert into public.execution_answers (organization_id,execution_id,item_id,value,created_by) values ('10000000-0000-0000-0000-000000000951','60000000-0000-0000-0000-000000000951','40000000-0000-0000-0000-000000000951','false'::jsonb,'00000000-0000-0000-0000-000000000952');
do $$ begin
  begin
    update public.checklist_executions set status='completed',completed_at=now(),conformity_percentage=0,summary='{}'::jsonb where id='60000000-0000-0000-0000-000000000951';
    raise exception 'completion with false required checkbox was accepted';
  exception when raise_exception then
    if sqlerrm='completion with false required checkbox was accepted' then raise; end if;
  end;
  if exists (select 1 from public.checklist_executions where id='60000000-0000-0000-0000-000000000951' and (status<>'in_progress' or completed_at is not null)) then raise exception 'false checkbox rejection persisted completed_at or status'; end if;
end $$;

-- True completes the required checkbox; false remains valid for optional and
-- required yes/no when its established NC requirement is met (C, D, E, H, I).
update public.execution_answers set value='true'::jsonb where execution_id='60000000-0000-0000-0000-000000000951' and item_id='40000000-0000-0000-0000-000000000951';
insert into public.execution_answers (organization_id,execution_id,item_id,value,created_by) values ('10000000-0000-0000-0000-000000000951','60000000-0000-0000-0000-000000000951','40000000-0000-0000-0000-000000000952','false'::jsonb,'00000000-0000-0000-0000-000000000952');
insert into public.execution_answers (id,organization_id,execution_id,item_id,value,observation,created_by) values ('70000000-0000-0000-0000-000000000953','10000000-0000-0000-0000-000000000951','60000000-0000-0000-0000-000000000951','40000000-0000-0000-0000-000000000953','false'::jsonb,'Não conforme','00000000-0000-0000-0000-000000000952');
insert into public.non_conformities (id,organization_id,execution_id,answer_id,item_id,executor_id,observation,created_by) values ('80000000-0000-0000-0000-000000000953','10000000-0000-0000-0000-000000000951','60000000-0000-0000-0000-000000000951','70000000-0000-0000-0000-000000000953','40000000-0000-0000-0000-000000000953','00000000-0000-0000-0000-000000000952','Não conforme','00000000-0000-0000-0000-000000000952');
update public.checklist_executions set status='completed',completed_at=now(),conformity_percentage=0,summary='{}'::jsonb where id='60000000-0000-0000-0000-000000000951';
do $$ begin
  if not exists (select 1 from public.checklist_executions where id='60000000-0000-0000-0000-000000000951' and status='completed' and completed_at is not null and summary->>'required_complete'='true' and summary->>'answered_items'='3' and conformity_percentage=33.33) then raise exception 'true checkbox or false yes/no was not interpreted correctly'; end if;
end $$;

rollback;
