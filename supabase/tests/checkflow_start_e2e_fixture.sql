-- Fixture persistente para o roteiro Playwright local. Execute apenas em uma
-- stack Supabase local e remova ao final com e2e_cleanup.sql.
create extension if not exists pgcrypto;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-e2e@checkflow.test', crypt('Checkflow123!', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Owner E2E"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-e2e@checkflow.test', crypt('Checkflow123!', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Manager E2E"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'executor-e2e@checkflow.test', crypt('Checkflow123!', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Executor E2E"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-e2e@checkflow.test', crypt('Checkflow123!', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Outro E2E"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inactive-e2e@checkflow.test', crypt('Checkflow123!', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Inativo E2E"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'removed-e2e@checkflow.test', crypt('Checkflow123!', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Removido E2E"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b-e2e@checkflow.test', crypt('Checkflow123!', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Owner B E2E"}'::jsonb, now(), now())
on conflict (id) do update set encrypted_password=excluded.encrypted_password, email_confirmed_at=excluded.email_confirmed_at;
update auth.users
set confirmation_token='', recovery_token='', email_change_token_new='', email_change_token_current='', email_change='', reauthentication_token=''
where id in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-0000000000e6','00000000-0000-0000-0000-0000000000f1');
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select id::text, id, jsonb_build_object('sub',id::text,'email',email), 'email', now(), now()
from auth.users
where id in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-0000000000e6','00000000-0000-0000-0000-0000000000f1')
on conflict (provider_id, provider) do nothing;

insert into public.organizations (id, name, created_by)
values
  ('10000000-0000-0000-0000-0000000000e1', 'Organização E2E A', '00000000-0000-0000-0000-0000000000e1'),
  ('10000000-0000-0000-0000-0000000000f1', 'Organização E2E B', '00000000-0000-0000-0000-0000000000f1')
on conflict (id) do nothing;
insert into public.organization_members (organization_id, user_id, role, active, created_by)
values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'owner', true, '00000000-0000-0000-0000-0000000000e1'),
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', 'manager', true, '00000000-0000-0000-0000-0000000000e1'),
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'collaborator', true, '00000000-0000-0000-0000-0000000000e1'),
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e4', 'collaborator', true, '00000000-0000-0000-0000-0000000000e1'),
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e5', 'collaborator', false, '00000000-0000-0000-0000-0000000000e1'),
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e6', 'collaborator', true, '00000000-0000-0000-0000-0000000000e1'),
  ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'owner', true, '00000000-0000-0000-0000-0000000000f1')
on conflict (organization_id,user_id) do update set role=excluded.role, active=excluded.active;
