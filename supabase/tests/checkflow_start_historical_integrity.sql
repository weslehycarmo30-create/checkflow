-- Behavioral integrity gate for CHECKFLOW START.
-- Run only against a confirmed localhost Supabase stack after migrations through
-- 202608260002_execution_historical_snapshot.sql. Fixture data is rolled back.

begin;

do $$
begin
  if to_regprocedure('public.build_execution_snapshot(public.checklist_executions)') is null then
    raise exception 'Historical snapshot migration is not installed';
  end if;
end $$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a-history@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Owner A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-a-history@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Manager A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'executor-a-history@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Executor A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-a-history@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Outro A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inactive-a-history@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Inativo A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'removed-a-history@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Removido A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b-history@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Owner B"}'::jsonb, now(), now());

insert into public.organizations (id, name, created_by)
values
  ('10000000-0000-0000-0000-0000000000c1', 'Tenant Histórico A', '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-0000000000d1', 'Tenant Histórico B', '00000000-0000-0000-0000-0000000000d1');
insert into public.organization_members (organization_id, user_id, role, active, created_by)
values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'owner', true, '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'manager', true, '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3', 'collaborator', true, '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c4', 'collaborator', true, '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c5', 'collaborator', false, '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c6', 'collaborator', true, '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'owner', true, '00000000-0000-0000-0000-0000000000d1');

insert into public.checklists (id, organization_id, name, description, category, status, responsible_user_id, created_by)
values ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'Abertura original', 'Conteúdo original', 'Bar', 'active', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2');
insert into public.checklist_sections (id, organization_id, checklist_id, title, position, created_by)
values
  ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', 'Preparação', 10, '00000000-0000-0000-0000-0000000000c2'),
  ('30000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', 'Verificação', 20, '00000000-0000-0000-0000-0000000000c2');
insert into public.checklist_items (id, organization_id, section_id, prompt, answer_type, position, required, nonconformity_on_no, require_observation_on_failure, require_photo_on_failure, created_by)
values
  ('40000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c1', 'Bancada higienizada?', 'yes_no', 10, true, false, true, false, '00000000-0000-0000-0000-0000000000c2'),
  ('40000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c2', 'Temperatura adequada?', 'yes_no', 20, true, true, true, true, '00000000-0000-0000-0000-0000000000c2'),
  ('40000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c2', 'Item removível', 'short_text', 30, false, false, true, false, '00000000-0000-0000-0000-0000000000c2');
insert into public.checklist_assignments (id, organization_id, checklist_id, assigned_to, due_at, active, created_by)
values ('50000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3', now() + interval '1 day', true, '00000000-0000-0000-0000-0000000000c2');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);

-- Executor starts an assigned execution. The database captures the complete source model now.
insert into public.checklist_executions (id, organization_id, assignment_id, checklist_id, executor_id, created_by)
values ('60000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c3');
do $$ begin
  if (select execution_snapshot #>> '{checklist,name}' from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1') <> 'Abertura original' then raise exception 'snapshot did not capture original checklist name'; end if;
  if jsonb_array_length((select execution_snapshot->'sections' from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1')) <> 2 then raise exception 'snapshot did not capture original sections'; end if;
end $$;
insert into public.execution_answers (id, organization_id, execution_id, item_id, value, observation, is_conforming, created_by)
values
  ('70000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '60000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', 'true'::jsonb, 'OK registrado', true, '00000000-0000-0000-0000-0000000000c3'),
  ('70000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', '60000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c2', 'false'::jsonb, 'Temperatura fora da faixa', false, '00000000-0000-0000-0000-0000000000c3');
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('checkflow-evidence', '10000000-0000-0000-0000-0000000000c1/60000000-0000-0000-0000-0000000000c1/40000000-0000-0000-0000-0000000000c2/evidence.jpg', '00000000-0000-0000-0000-0000000000c3', '{"mimetype":"image/jpeg"}'::jsonb);
insert into public.attachments (id, organization_id, execution_id, answer_id, storage_path, file_name, mime_type, size_bytes, created_by)
values ('71000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '60000000-0000-0000-0000-0000000000c1', '70000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1/60000000-0000-0000-0000-0000000000c1/40000000-0000-0000-0000-0000000000c2/evidence.jpg', 'evidence.jpg', 'image/jpeg', 42, '00000000-0000-0000-0000-0000000000c3');
insert into public.non_conformities (id, organization_id, execution_id, answer_id, item_id, executor_id, observation, priority, responsible_user_id, due_at, created_by)
values ('80000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '60000000-0000-0000-0000-0000000000c1', '70000000-0000-0000-0000-0000000000c2', '40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', 'Temperatura fora da faixa', 'high', '00000000-0000-0000-0000-0000000000c2', now() + interval '2 days', '00000000-0000-0000-0000-0000000000c3');
update public.checklist_executions set status='completed', completed_at=now(), conformity_percentage=50, summary='{"ok":1,"not_ok":1}'::jsonb where id='60000000-0000-0000-0000-0000000000c1';

-- Manager adds the allowed operational action plan after completion.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
insert into public.action_plans (id, organization_id, non_conformity_id, description, responsible_user_id, due_at, created_by)
values ('90000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '80000000-0000-0000-0000-0000000000c1', 'Refrigerar imediatamente', '00000000-0000-0000-0000-0000000000c2', now() + interval '3 days', '00000000-0000-0000-0000-0000000000c2');

-- Source changes are permitted, but must not rewrite what was executed.
update public.checklists set name='Checklist alterado', description='Conteúdo alterado', category='Outro', status='archived' where id='20000000-0000-0000-0000-0000000000c1';
update public.checklist_sections set title='Ordem alterada', position=99 where id='30000000-0000-0000-0000-0000000000c1';
update public.checklist_items set prompt='Pergunta alterada', position=99 where id='40000000-0000-0000-0000-0000000000c2';
insert into public.checklist_items (id, organization_id, section_id, prompt, answer_type, position, created_by)
values ('40000000-0000-0000-0000-0000000000c4', '10000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c2', 'Item novo', 'short_text', 1, '00000000-0000-0000-0000-0000000000c2');
delete from public.checklist_items where id='40000000-0000-0000-0000-0000000000c3';
do $$ begin
  if (select execution_snapshot #>> '{checklist,name}' from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1') <> 'Abertura original' then raise exception 'source rename rewrote snapshot'; end if;
  if jsonb_path_exists((select execution_snapshot from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1'), '$.sections[*].items[*] ? (@.prompt == "Pergunta alterada" || @.prompt == "Item novo")') then raise exception 'source item mutation rewrote snapshot'; end if;
  if not jsonb_path_exists((select execution_snapshot from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1'), '$.sections[*].items[*] ? (@.prompt == "Item removível")') then raise exception 'removed source item disappeared from snapshot'; end if;
  if (select count(*) from public.execution_answers where execution_id='60000000-0000-0000-0000-0000000000c1' and observation='Temperatura fora da faixa') <> 1 then raise exception 'historical answer or observation was lost'; end if;
  if (select count(*) from public.attachments where execution_id='60000000-0000-0000-0000-0000000000c1') <> 1 then raise exception 'historical evidence was lost'; end if;
  if not exists(select 1 from storage.objects where bucket_id='checkflow-evidence' and name='10000000-0000-0000-0000-0000000000c1/60000000-0000-0000-0000-0000000000c1/40000000-0000-0000-0000-0000000000c2/evidence.jpg') then raise exception 'stored evidence was lost'; end if;
  if (select count(*) from public.non_conformities where execution_id='60000000-0000-0000-0000-0000000000c1') <> 1 then raise exception 'historical non-conformity was lost'; end if;
  if (select count(*) from public.action_plans where non_conformity_id='80000000-0000-0000-0000-0000000000c1' and description='Refrigerar imediatamente') <> 1 then raise exception 'historical action plan was lost'; end if;
end $$;

-- Even a manager, who normally has broad write access, cannot rewrite completed evidence or answers.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
do $$ begin
  begin update public.execution_answers set observation='alterada' where id='70000000-0000-0000-0000-0000000000c2'; raise exception 'completed answer update was accepted';
  exception when raise_exception then if sqlerrm='completed answer update was accepted' then raise; end if; end;
  begin update public.attachments set storage_path='alterado.jpg' where id='71000000-0000-0000-0000-0000000000c1'; raise exception 'completed attachment update was accepted';
  exception when raise_exception then if sqlerrm='completed attachment update was accepted' then raise; end if; end;
  begin update public.checklist_executions set execution_snapshot='{}'::jsonb where id='60000000-0000-0000-0000-0000000000c1'; raise exception 'snapshot update was accepted';
  exception when raise_exception then if sqlerrm='snapshot update was accepted' then raise; end if; end;
  begin delete from public.checklists where id='20000000-0000-0000-0000-0000000000c1'; raise exception 'referenced checklist delete was accepted';
  exception when foreign_key_violation then null;
  when raise_exception then if sqlerrm='referenced checklist delete was accepted' then raise; end if; end;
end $$;

-- Both management roles can read their permitted tenant record; unrelated users cannot.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$ begin if (select count(*) from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1') <> 1 then raise exception 'owner cannot read history'; end if; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', true);
do $$ begin if exists(select 1 from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1') then raise exception 'unrelated same-tenant user read history'; end if; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
do $$ begin if exists(select 1 from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1') then raise exception 'tenant B read tenant A history'; end if; end $$;

-- Inactive and removed memberships cannot read the completed record.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', true);
do $$ begin if exists(select 1 from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1') then raise exception 'inactive user read history'; end if; end $$;
reset role;
delete from public.organization_members where organization_id='10000000-0000-0000-0000-0000000000c1' and user_id='00000000-0000-0000-0000-0000000000c6';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c6', true);
do $$ begin if exists(select 1 from public.checklist_executions where id='60000000-0000-0000-0000-0000000000c1') then raise exception 'removed user read history'; end if; end $$;

reset role;
-- Cross-tenant relation remains rejected by the existing link validator.
do $$ begin
  begin
    insert into public.checklist_executions (organization_id, assignment_id, checklist_id, executor_id, created_by)
    values ('10000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c3');
    raise exception 'cross-tenant execution was accepted';
  exception when raise_exception then if sqlerrm='cross-tenant execution was accepted' then raise; end if; end;
end $$;

rollback;
