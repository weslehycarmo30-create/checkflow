-- Behavioral RLS/Storage matrix for CHECKFLOW START P0.
-- Run only against a confirmed localhost Supabase stack after all migrations:
--   Get-Content -Raw supabase/tests/checkflow_start_p0_behavior.sql |
--     docker exec -i <LOCAL_SUPABASE_DB_CONTAINER> psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
-- The transaction rolls back all fixture data.

begin;

do $$
begin
  if to_regclass('public.organization_members') is null
     or to_regprocedure('public.can_access_checkflow_evidence(text)') is null then
    raise exception 'CHECKFLOW START migrations are not installed in this database';
  end if;
end $$;

-- Fixed fixture ids are safe because this script rolls its transaction back.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@checkflow.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-a@checkflow.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'executor-a@checkflow.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-a@checkflow.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inactive-a@checkflow.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'removed-a@checkflow.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'no-membership@checkflow.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@checkflow.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.organizations (id, name, created_by)
values
  ('10000000-0000-0000-0000-0000000000a1', 'Tenant A', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000b1', 'Tenant B', '00000000-0000-0000-0000-0000000000b1');
insert into public.organization_members (organization_id, user_id, role, active, created_by)
values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'owner', true, '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'manager', true, '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'collaborator', true, '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 'collaborator', true, '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', 'collaborator', false, '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'owner', true, '00000000-0000-0000-0000-0000000000b1');

insert into public.checklists (id, organization_id, name, status, created_by)
values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Checklist A', 'active', '00000000-0000-0000-0000-0000000000a1');
insert into public.checklist_sections (id, organization_id, checklist_id, title, created_by)
values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'Seção A', '00000000-0000-0000-0000-0000000000a1');
insert into public.checklist_items (id, organization_id, section_id, prompt, answer_type, created_by)
values ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'Foto A', 'photo', '00000000-0000-0000-0000-0000000000a1');
insert into public.checklist_assignments (id, organization_id, checklist_id, assigned_to, active, created_by)
values ('50000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', true, '00000000-0000-0000-0000-0000000000a1');
insert into public.checklist_executions (id, organization_id, assignment_id, checklist_id, executor_id, created_by)
values ('60000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3');
insert into public.execution_answers (id, organization_id, execution_id, item_id, value, created_by)
values ('70000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', '"ok"'::jsonb, '00000000-0000-0000-0000-0000000000a3');
insert into public.non_conformities (id, organization_id, execution_id, answer_id, item_id, executor_id, observation, created_by)
values ('80000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'Falha de teste', '00000000-0000-0000-0000-0000000000a3');
insert into public.action_plans (id, organization_id, non_conformity_id, description, responsible_user_id, created_by)
values ('90000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-0000000000a1', 'Correção de teste', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1');

set local role authenticated;

-- Owner can provision an executor and remove that membership. The removed user
-- is checked below separately from a user that never had an organization.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ declare changed integer; begin
  insert into public.organization_members (organization_id, user_id, role, active, created_by)
  values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a6', 'collaborator', true, '00000000-0000-0000-0000-0000000000a1');
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'owner could not create membership'; end if;
  delete from public.organization_members
  where organization_id = '10000000-0000-0000-0000-0000000000a1' and user_id = '00000000-0000-0000-0000-0000000000a6';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'owner could not remove membership'; end if;
end $$;

-- Valid executor: own tenant visible, upload and subsequent read allowed.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
do $$ begin
  if (select count(*) from public.organizations where id = '10000000-0000-0000-0000-0000000000a1') <> 1 then raise exception 'executor cannot see tenant A'; end if;
  if (select count(*) from public.organizations where id = '10000000-0000-0000-0000-0000000000b1') <> 0 then raise exception 'executor can see tenant B'; end if;
end $$;
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('checkflow-evidence', '10000000-0000-0000-0000-0000000000a1/60000000-0000-0000-0000-0000000000a1/40000000-0000-0000-0000-0000000000a1/evidence.jpg', '00000000-0000-0000-0000-0000000000a3', '{"mimetype":"image/jpeg"}'::jsonb);
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('checkflow-evidence', '10000000-0000-0000-0000-0000000000a1/action-plans/90000000-0000-0000-0000-0000000000a1/correction.jpg', '00000000-0000-0000-0000-0000000000a3', '{"mimetype":"image/jpeg"}'::jsonb);
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'checkflow-evidence') <> 2 then raise exception 'executor cannot read own evidence'; end if;
end $$;

-- Cross-tenant path is rejected even though the executor owns the execution.
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('checkflow-evidence', '10000000-0000-0000-0000-0000000000b1/60000000-0000-0000-0000-0000000000a1/40000000-0000-0000-0000-0000000000a1/cross-tenant.jpg', '00000000-0000-0000-0000-0000000000a3', '{}'::jsonb);
    raise exception 'cross-tenant upload was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Active same-tenant collaborator without the execution relationship cannot read or upload.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'checkflow-evidence') then raise exception 'unrelated same-tenant collaborator read evidence'; end if;
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('checkflow-evidence', '10000000-0000-0000-0000-0000000000a1/60000000-0000-0000-0000-0000000000a1/40000000-0000-0000-0000-0000000000a1/unauthorized.jpg', '00000000-0000-0000-0000-0000000000a4', '{}'::jsonb);
    raise exception 'same-tenant unauthorized upload was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Tenant B has no access; an inactive membership has no access either.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin if exists (select 1 from storage.objects where bucket_id = 'checkflow-evidence') then raise exception 'tenant B read tenant A evidence'; end if; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', true);
do $$ begin if exists (select 1 from public.organizations where id = '10000000-0000-0000-0000-0000000000a1') then raise exception 'inactive user read tenant A'; end if; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a6', true);
do $$ begin if exists (select 1 from public.organizations where id = '10000000-0000-0000-0000-0000000000a1') then raise exception 'removed user read tenant A'; end if; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a7', true);
do $$ begin if exists (select 1 from public.organizations where id = '10000000-0000-0000-0000-0000000000a1') then raise exception 'user without membership read tenant A'; end if; end $$;

-- Manager has read access but cannot create or promote memberships. The Worker
-- separately limits manager invitations to the collaborator role.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$ declare changed integer; begin
  if (select count(*) from storage.objects where bucket_id = 'checkflow-evidence') <> 2 then raise exception 'manager cannot read authorized evidence'; end if;
  begin
    update public.organization_members set role = 'owner'
    where organization_id = '10000000-0000-0000-0000-0000000000a1' and user_id = '00000000-0000-0000-0000-0000000000a2';
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'manager promotion was accepted'; end if;
  exception when insufficient_privilege then null;
  when raise_exception then
    if sqlerrm = 'manager promotion was accepted' then raise; end if;
  end;
end $$;

-- Executor cannot promote itself either.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
do $$ declare changed integer; begin
  begin
    update public.organization_members set role = 'owner'
    where organization_id = '10000000-0000-0000-0000-0000000000a1' and user_id = '00000000-0000-0000-0000-0000000000a3';
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'executor promotion was accepted'; end if;
  exception when insufficient_privilege then null;
  when raise_exception then
    if sqlerrm = 'executor promotion was accepted' then raise; end if;
  end;
end $$;

reset role;

-- The database trigger rejects a relation that joins a tenant-B row to tenant-A data.
do $$ begin
  begin
    insert into public.checklist_sections (organization_id, checklist_id, title, created_by)
    values ('10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000a1', 'Cross tenant', '00000000-0000-0000-0000-0000000000b1');
    raise exception 'cross-tenant relation was accepted';
  exception when raise_exception then
    if sqlerrm = 'cross-tenant relation was accepted' then raise; end if;
  end;
end $$;

rollback;
