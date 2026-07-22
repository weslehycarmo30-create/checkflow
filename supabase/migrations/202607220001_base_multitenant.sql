-- CheckFlow: base multiempresa, autenticação e armazenamento.
-- Seguro para reaplicação: objetos são criados/atualizados sem apagar dados.

create extension if not exists pgcrypto;

do $$ begin create type public.member_role as enum ('owner','manager','collaborator'); exception when duplicate_object then null; end $$;
do $$ begin create type public.checklist_status as enum ('draft','active','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.recurrence_type as enum ('none','daily','weekly','monthly'); exception when duplicate_object then null; end $$;
do $$ begin create type public.answer_type as enum ('checkbox','yes_no','short_text','long_text','number','date','time','single_select','photo','rating'); exception when duplicate_object then null; end $$;
do $$ begin create type public.execution_status as enum ('pending','in_progress','paused','completed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.non_conformity_status as enum ('open','in_progress','awaiting_validation','completed','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.priority_level as enum ('low','medium','high','critical'); exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, full_name text, avatar_url text, phone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role public.member_role not null default 'collaborator', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), unique(organization_id,user_id)
);
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, address text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null, name text not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), unique(team_id,user_id)
);
create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
  name text not null, description text, category text, status public.checklist_status not null default 'draft', is_template boolean not null default false,
  unit_id uuid references public.units(id) on delete set null, responsible_user_id uuid references auth.users(id) on delete set null,
  due_at timestamptz, recurrence public.recurrence_type not null default 'none', source_template_id uuid references public.checklists(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.checklist_sections (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade, title text not null, position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
  section_id uuid not null references public.checklist_sections(id) on delete cascade, prompt text not null, answer_type public.answer_type not null,
  position integer not null default 0, required boolean not null default false, allow_not_applicable boolean not null default false,
  options jsonb not null default '[]'::jsonb, nonconformity_on_no boolean not null default false, require_observation_on_failure boolean not null default true,
  require_photo_on_failure boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.checklist_assignments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade, assigned_to uuid not null references auth.users(id), unit_id uuid references public.units(id),
  due_at timestamptz, recurrence public.recurrence_type not null default 'none', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.checklist_executions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid references public.checklist_assignments(id) on delete set null, checklist_id uuid not null references public.checklists(id), unit_id uuid references public.units(id),
  executor_id uuid not null references auth.users(id), status public.execution_status not null default 'in_progress', started_at timestamptz not null default now(), paused_at timestamptz,
  completed_at timestamptz, conformity_percentage numeric(5,2), summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.execution_answers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_id uuid not null references public.checklist_executions(id) on delete cascade, item_id uuid not null references public.checklist_items(id),
  value jsonb, observation text, is_not_applicable boolean not null default false, is_conforming boolean,
  answered_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), unique(execution_id,item_id)
);
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_id uuid references public.checklist_executions(id) on delete cascade, answer_id uuid references public.execution_answers(id) on delete cascade,
  storage_path text not null, file_name text, mime_type text, size_bytes bigint,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.non_conformities (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_id uuid not null references public.checklist_executions(id), answer_id uuid references public.execution_answers(id), item_id uuid not null references public.checklist_items(id),
  unit_id uuid references public.units(id), executor_id uuid not null references auth.users(id), observation text not null, priority public.priority_level not null default 'medium',
  responsible_user_id uuid references auth.users(id), due_at timestamptz, status public.non_conformity_status not null default 'open',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  non_conformity_id uuid not null references public.non_conformities(id) on delete cascade, description text not null, responsible_user_id uuid references auth.users(id),
  due_at timestamptz, status public.non_conformity_status not null default 'open', correction_comment text, validation_comment text, validated_by uuid references auth.users(id), validated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id), entity_type text not null, entity_id uuid, action text not null, old_data jsonb, new_data jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create index if not exists organization_members_user_idx on public.organization_members(user_id,organization_id);
create index if not exists checklist_assignments_assignee_idx on public.checklist_assignments(organization_id,assigned_to,due_at);
create index if not exists checklist_executions_org_status_idx on public.checklist_executions(organization_id,status,started_at desc);
create index if not exists non_conformities_org_status_idx on public.non_conformities(organization_id,status,due_at);
create index if not exists audit_logs_entity_idx on public.audit_logs(organization_id,entity_type,entity_id,created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['organizations','profiles','organization_members','units','teams','team_members','checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions','execution_answers','attachments','non_conformities','action_plans','audit_logs'] loop execute format('drop trigger if exists set_updated_at on public.%I',t); execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t); end loop; end $$;

create or replace function public.is_org_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=auth.uid() and m.active) $$;
create or replace function public.has_org_role(org uuid, roles public.member_role[]) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=auth.uid() and m.active and m.role=any(roles)) $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare org_id uuid; org_name text;
begin
  insert into public.profiles(id,full_name,created_by) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.id) on conflict(id) do nothing;
  org_name:=nullif(trim(new.raw_user_meta_data->>'organization_name'),'');
  if org_name is not null then
    insert into public.organizations(name,slug,created_by) values(org_name,lower(regexp_replace(org_name,'[^a-zA-Z0-9]+','-','g'))||'-'||substr(new.id::text,1,8),new.id) returning id into org_id;
    insert into public.organization_members(organization_id,user_id,role,created_by) values(org_id,new.id,'owner',new.id);
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

do $$ declare t text; begin foreach t in array array['organizations','profiles','organization_members','units','teams','team_members','checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions','execution_answers','attachments','non_conformities','action_plans','audit_logs'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

drop policy if exists organizations_member_select on public.organizations;
create policy organizations_member_select on public.organizations for select using(public.is_org_member(id));
drop policy if exists organizations_owner_update on public.organizations;
create policy organizations_owner_update on public.organizations for update using(public.has_org_role(id,array['owner']::public.member_role[])) with check(public.has_org_role(id,array['owner']::public.member_role[]));
drop policy if exists profiles_self_or_colleague on public.profiles;
create policy profiles_self_or_colleague on public.profiles for select using(id=auth.uid() or exists(select 1 from public.organization_members mine join public.organization_members theirs on theirs.organization_id=mine.organization_id where mine.user_id=auth.uid() and theirs.user_id=profiles.id and mine.active and theirs.active));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());

do $$ declare t text; begin foreach t in array array['organization_members','units','teams','team_members','checklists','checklist_sections','checklist_items'] loop
  execute format('drop policy if exists org_member_select on public.%I',t);
  execute format('create policy org_member_select on public.%I for select using(public.is_org_member(organization_id))',t);
end loop; end $$;
do $$ declare t text; begin foreach t in array array['organization_members','units','teams','team_members','checklists','checklist_sections','checklist_items','checklist_assignments','checklist_executions','execution_answers','attachments','non_conformities','action_plans','audit_logs'] loop
  execute format('drop policy if exists org_manager_write on public.%I',t);
  execute format('create policy org_manager_write on public.%I for all using(public.has_org_role(organization_id,array[''owner'',''manager'']::public.member_role[])) with check(public.has_org_role(organization_id,array[''owner'',''manager'']::public.member_role[]))',t);
end loop; end $$;
do $$ declare t text; begin foreach t in array array['checklist_assignments','checklist_executions','execution_answers','attachments','non_conformities','action_plans','audit_logs'] loop
  execute format('drop policy if exists org_member_select on public.%I',t);
  execute format('drop policy if exists org_manager_select on public.%I',t);
  execute format('create policy org_manager_select on public.%I for select using(public.has_org_role(organization_id,array[''owner'',''manager'']::public.member_role[]))',t);
end loop; end $$;

drop policy if exists collaborator_assignment_select on public.checklist_assignments;
create policy collaborator_assignment_select on public.checklist_assignments for select using(assigned_to=auth.uid() and public.is_org_member(organization_id));
drop policy if exists collaborator_execution_write on public.checklist_executions;
create policy collaborator_execution_write on public.checklist_executions for all using(executor_id=auth.uid() and public.is_org_member(organization_id)) with check(executor_id=auth.uid() and public.is_org_member(organization_id));
drop policy if exists collaborator_answer_write on public.execution_answers;
create policy collaborator_answer_write on public.execution_answers for all using(public.is_org_member(organization_id) and exists(select 1 from public.checklist_executions e where e.id=execution_id and e.executor_id=auth.uid())) with check(public.is_org_member(organization_id) and exists(select 1 from public.checklist_executions e where e.id=execution_id and e.executor_id=auth.uid()));
drop policy if exists collaborator_attachment_select on public.attachments;
create policy collaborator_attachment_select on public.attachments for select using(public.is_org_member(organization_id) and exists(select 1 from public.checklist_executions e where e.id=execution_id and e.executor_id=auth.uid()));
drop policy if exists collaborator_attachment_insert on public.attachments;
create policy collaborator_attachment_insert on public.attachments for insert with check(created_by=auth.uid() and public.is_org_member(organization_id) and exists(select 1 from public.checklist_executions e where e.id=execution_id and e.executor_id=auth.uid()));
drop policy if exists collaborator_nonconformity_insert on public.non_conformities;
create policy collaborator_nonconformity_insert on public.non_conformities for insert with check(executor_id=auth.uid() and created_by=auth.uid() and public.is_org_member(organization_id));
drop policy if exists collaborator_nonconformity_select on public.non_conformities;
create policy collaborator_nonconformity_select on public.non_conformities for select using(public.is_org_member(organization_id) and (executor_id=auth.uid() or responsible_user_id=auth.uid()));
drop policy if exists collaborator_action_plan_access on public.action_plans;
create policy collaborator_action_plan_access on public.action_plans for select using(public.is_org_member(organization_id) and responsible_user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('checkflow-evidence','checkflow-evidence',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists evidence_member_read on storage.objects;
create policy evidence_member_read on storage.objects for select using(bucket_id='checkflow-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid));
drop policy if exists evidence_member_insert on storage.objects;
create policy evidence_member_insert on storage.objects for insert with check(bucket_id='checkflow-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid));
drop policy if exists evidence_owner_or_manager_delete on storage.objects;
create policy evidence_owner_or_manager_delete on storage.objects for delete using(bucket_id='checkflow-evidence' and public.has_org_role((storage.foldername(name))[1]::uuid,array['owner','manager']::public.member_role[]));
