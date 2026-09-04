-- Behavioral gate for server-side checklist structure immutability.
-- Run only against a confirmed local Supabase stack. Everything is rolled back.

begin;

-- The disposable local database used by this repository does not preload the
-- PostgREST table grants. Grant only for this transaction so the test exercises
-- RLS plus the domain trigger as an authenticated client would.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-structural@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Owner Structural"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-structural@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Manager Structural"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'executor-structural@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Executor Structural"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b-structural@checkflow.test', '', now(), '{}'::jsonb, '{"full_name":"Owner B Structural"}'::jsonb, now(), now());

insert into public.organizations (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000101', 'Tenant Structural A', '00000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000102', 'Tenant Structural B', '00000000-0000-0000-0000-000000000104');
insert into public.organization_members (organization_id, user_id, role, active, created_by)
values
  ('10000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'owner', true, '00000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', 'manager', true, '00000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', 'collaborator', true, '00000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000104', 'owner', true, '00000000-0000-0000-0000-000000000104');

insert into public.checklists (id, organization_id, name, description, category, status, created_by)
values
  ('20000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000101', 'Checklist Draft', 'Draft original', 'Operação', 'draft', '00000000-0000-0000-0000-000000000101'),
  ('20000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000102', 'Checklist B', 'Tenant B', 'Operação', 'draft', '00000000-0000-0000-0000-000000000104'),
  ('20000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000101', 'Checklist Publicado', 'Sem assignment', 'Operação', 'draft', '00000000-0000-0000-0000-000000000101');
insert into public.checklist_sections (id, organization_id, checklist_id, title, position, created_by)
values
  ('30000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000101', 'Seção original', 1, '00000000-0000-0000-0000-000000000101'),
  ('30000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000102', 'Seção B', 1, '00000000-0000-0000-0000-000000000104'),
  ('30000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000104', 'Seção publicada', 1, '00000000-0000-0000-0000-000000000101');
insert into public.checklist_items (id, organization_id, section_id, prompt, answer_type, position, required, created_by)
values
  ('40000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000101', 'Item original', 'checkbox', 1, true, '00000000-0000-0000-0000-000000000101'),
  ('40000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000102', '30000000-0000-0000-0000-000000000102', 'Item B', 'checkbox', 1, true, '00000000-0000-0000-0000-000000000104'),
  ('40000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000104', 'Item publicado', 'checkbox', 1, true, '00000000-0000-0000-0000-000000000101');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);

-- A: manager can edit the draft before assignment.
update public.checklists set name='Checklist Draft Editado' where id='20000000-0000-0000-0000-000000000101';
update public.checklist_sections set title='Seção draft editada' where id='30000000-0000-0000-0000-000000000101';
update public.checklist_items set prompt='Item draft editado' where id='40000000-0000-0000-0000-000000000101';
insert into public.checklist_items (id, organization_id, section_id, prompt, answer_type, position, required, created_by)
values ('40000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000101', 'Item draft temporário', 'short_text', 2, false, '00000000-0000-0000-0000-000000000102');
delete from public.checklist_items where id='40000000-0000-0000-0000-000000000103';

-- Owner has the same draft write capability.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
update public.checklists set description='Draft editado pelo owner' where id='20000000-0000-0000-0000-000000000101';

-- A new draft checklist remains creatable and removable by management.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
insert into public.checklists (id, organization_id, name, status, created_by)
values ('20000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000101', 'Checklist novo', 'draft', '00000000-0000-0000-0000-000000000102');
delete from public.checklists where id='20000000-0000-0000-0000-000000000103';

-- A non-draft lifecycle state also protects structure without an assignment.
update public.checklists set status='active' where id='20000000-0000-0000-0000-000000000104';
do $$
begin
  begin update public.checklists set name='publicado não deveria aceitar' where id='20000000-0000-0000-0000-000000000104'; raise exception 'published checklist update was accepted';
  exception when raise_exception then if sqlerrm='published checklist update was accepted' then raise; end if; end;
  begin update public.checklist_sections set title='publicada não deveria aceitar' where id='30000000-0000-0000-0000-000000000104'; raise exception 'published section update was accepted';
  exception when raise_exception then if sqlerrm='published section update was accepted' then raise; end if; end;
  begin update public.checklist_items set prompt='publicado não deveria aceitar' where id='40000000-0000-0000-0000-000000000104'; raise exception 'published item update was accepted';
  exception when raise_exception then if sqlerrm='published item update was accepted' then raise; end if; end;
end $$;

-- Collaborator/executor has no structural write capability, even in draft.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
do $$
declare affected integer;
begin
  update public.checklist_sections set title='executor não deveria aceitar' where id='30000000-0000-0000-0000-000000000101';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'executor draft structural UPDATE was accepted'; end if;
end $$;

-- Assignment creates the protected state.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
insert into public.checklist_assignments (id, organization_id, checklist_id, assigned_to, active, created_by)
values ('50000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', true, '00000000-0000-0000-0000-000000000102');

-- Owner is also authorized by RLS, but the domain invariant still wins.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
do $$
begin
  begin update public.checklists set description='owner não deveria aceitar' where id='20000000-0000-0000-0000-000000000101'; raise exception 'owner protected update was accepted';
  exception when raise_exception then if sqlerrm='owner protected update was accepted' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
do $$
begin
  begin update public.checklist_sections set title='owner não deveria aceitar' where id='30000000-0000-0000-0000-000000000101'; raise exception 'owner protected section update was accepted';
  exception when raise_exception then if sqlerrm='owner protected section update was accepted' then raise; end if; end;
end $$;

-- These assertions intentionally fail on the unpatched schema when the update/insert/delete is accepted.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
do $$
declare affected integer;
begin
  begin
    update public.checklists set name='não deveria aceitar' where id='20000000-0000-0000-0000-000000000101';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'protected checklist UPDATE was accepted'; end if;
  exception when others then if sqlerrm = 'protected checklist UPDATE was accepted' then raise; end if; end;
  begin
    delete from public.checklists where id='20000000-0000-0000-0000-000000000101';
    raise exception 'protected checklist DELETE was accepted';
  exception when others then if sqlerrm = 'protected checklist DELETE was accepted' then raise; end if; end;
  begin
    insert into public.checklist_sections (id, organization_id, checklist_id, title, position, created_by)
    values ('30000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000101', 'não deveria aceitar', 3, '00000000-0000-0000-0000-000000000102');
    raise exception 'protected section INSERT was accepted';
  exception when others then if sqlerrm = 'protected section INSERT was accepted' then raise; end if; end;
  begin
    update public.checklist_sections set title='não deveria aceitar' where id='30000000-0000-0000-0000-000000000101';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'protected section UPDATE was accepted'; end if;
  exception when others then if sqlerrm = 'protected section UPDATE was accepted' then raise; end if; end;
  begin
    delete from public.checklist_sections where id='30000000-0000-0000-0000-000000000101';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'protected section DELETE was accepted'; end if;
  exception when others then if sqlerrm = 'protected section DELETE was accepted' then raise; end if; end;
  begin
    insert into public.checklist_items (id, organization_id, section_id, prompt, answer_type, position, created_by)
    values ('40000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000101', 'não deveria aceitar', 'short_text', 3, '00000000-0000-0000-0000-000000000102');
    raise exception 'protected item INSERT was accepted';
  exception when others then if sqlerrm = 'protected item INSERT was accepted' then raise; end if; end;
  begin
    update public.checklist_items set prompt='não deveria aceitar' where id='40000000-0000-0000-0000-000000000101';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'protected item UPDATE was accepted'; end if;
  exception when others then if sqlerrm = 'protected item UPDATE was accepted' then raise; end if; end;
  begin
    delete from public.checklist_items where id='40000000-0000-0000-0000-000000000101';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'protected item DELETE was accepted'; end if;
  exception when others then if sqlerrm = 'protected item DELETE was accepted' then raise; end if; end;
end $$;

-- C/D: the same structure remains protected after an execution and completion.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
insert into public.checklist_executions (id, organization_id, assignment_id, checklist_id, executor_id, created_by)
values ('60000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000101', '50000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000103');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
do $$
begin
  begin update public.checklists set category='não deveria aceitar' where id='20000000-0000-0000-0000-000000000101'; raise exception 'execution protected checklist update was accepted';
  exception when raise_exception then if sqlerrm='execution protected checklist update was accepted' then raise; end if; end;
  begin update public.checklist_sections set position=99 where id='30000000-0000-0000-0000-000000000101'; raise exception 'execution protected section update was accepted';
  exception when raise_exception then if sqlerrm='execution protected section update was accepted' then raise; end if; end;
end $$;
update public.checklist_executions set status='completed', completed_at=now() where id='60000000-0000-0000-0000-000000000101';

do $$
declare affected integer;
begin
  begin
    update public.checklist_items set position=88 where id='40000000-0000-0000-0000-000000000101';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'completed protected item UPDATE was accepted'; end if;
  exception when others then if sqlerrm = 'completed protected item UPDATE was accepted' then raise; end if; end;
end $$;

-- I/J: executor cannot structurally write, and tenant A cannot affect tenant B.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
do $$
declare affected integer;
begin
  update public.checklist_sections set title='executor não deveria aceitar' where id='30000000-0000-0000-0000-000000000101';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'executor structural UPDATE was accepted'; end if;
  begin
    insert into public.checklist_items (id, organization_id, section_id, prompt, answer_type, position, created_by)
    values ('40000000-0000-0000-0000-000000000105', '10000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000101', 'executor não deveria inserir', 'short_text', 4, '00000000-0000-0000-0000-000000000103');
    raise exception 'executor structural INSERT was accepted';
  exception when others then if sqlerrm='executor structural INSERT was accepted' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
do $$
declare affected integer;
begin
  update public.checklists set name='tenant B alterado' where id='20000000-0000-0000-0000-000000000102';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'tenant A affected tenant B'; end if;
end $$;

-- K: snapshot remains the original source model despite live-source attempts.
do $$
begin
  if (select execution_snapshot #>> '{checklist,name}' from public.checklist_executions where id='60000000-0000-0000-0000-000000000101') <> 'Checklist Draft Editado' then
    raise exception 'snapshot changed';
  end if;
end $$;

-- L: completed execution can still receive a new independent assignment.
insert into public.checklist_assignments (id, organization_id, checklist_id, assigned_to, active, created_by)
values ('50000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', true, '00000000-0000-0000-0000-000000000102');
do $$
begin
  if (select count(*) from public.checklist_assignments where checklist_id='20000000-0000-0000-0000-000000000101' and assigned_to='00000000-0000-0000-0000-000000000103') <> 2 then
    raise exception 'reassignment did not create an independent assignment';
  end if;
end $$;

rollback;
