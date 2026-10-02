-- CheckFlow: enforce tenant/unit consistency on new or changed operational links.
-- Existing rows are deliberately not rewritten or validated by this migration.
-- Run the read-only p1_tenant_unit_integrity_preflight before any production rollout.

create or replace function public.validate_checkflow_unit_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_org uuid;
  linked_checklist uuid;
  linked_unit uuid;
  unit_org uuid;
begin
  if tg_table_name in ('teams', 'checklists') then
    if new.unit_id is null then
      return new;
    end if;

    select organization_id into unit_org
    from public.units where id = new.unit_id;

    if not found or unit_org is distinct from new.organization_id then
      raise exception 'A unidade não pertence à organização do registro';
    end if;
    return new;
  end if;

  if tg_table_name = 'checklist_executions' then
    -- Grandfather untouched legacy identities so status/lifecycle updates do not
    -- fail merely because a pre-existing row is reported by the preflight.
    if tg_op = 'UPDATE'
       and (new.organization_id, new.assignment_id, new.checklist_id, new.unit_id)
           is not distinct from
           (old.organization_id, old.assignment_id, old.checklist_id, old.unit_id) then
      return new;
    end if;

    if new.assignment_id is not null then
      select organization_id, checklist_id, unit_id
        into linked_org, linked_checklist, linked_unit
      from public.checklist_assignments where id = new.assignment_id;

      if not found
         or linked_org is distinct from new.organization_id
         or linked_checklist is distinct from new.checklist_id
         or linked_unit is distinct from new.unit_id then
        raise exception 'A unidade da execução deve corresponder exatamente à atribuição';
      end if;
    end if;

    if new.unit_id is not null then
      select organization_id into unit_org from public.units where id = new.unit_id;
      if not found or unit_org is distinct from new.organization_id then
        raise exception 'A unidade da execução não pertence à organização';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'non_conformities' then
    if tg_op = 'UPDATE'
       and (new.organization_id, new.execution_id, new.unit_id)
           is not distinct from (old.organization_id, old.execution_id, old.unit_id) then
      return new;
    end if;

    select organization_id, unit_id into linked_org, linked_unit
    from public.checklist_executions where id = new.execution_id;
    if not found
       or linked_org is distinct from new.organization_id
       or linked_unit is distinct from new.unit_id then
      raise exception 'A unidade da não conformidade deve corresponder à execução';
    end if;
    if new.unit_id is not null then
      select organization_id into unit_org from public.units where id = new.unit_id;
      if not found or unit_org is distinct from new.organization_id then
        raise exception 'A unidade da não conformidade não pertence à organização';
      end if;
    end if;
    return new;
  end if;

  return new;
end
$$;

drop trigger if exists validate_checkflow_unit_tenant_integrity on public.teams;
create trigger validate_checkflow_unit_tenant_integrity
before insert or update of organization_id, unit_id on public.teams
for each row execute function public.validate_checkflow_unit_tenant_integrity();

drop trigger if exists validate_checkflow_unit_tenant_integrity on public.checklists;
create trigger validate_checkflow_unit_tenant_integrity
before insert or update of organization_id, unit_id on public.checklists
for each row execute function public.validate_checkflow_unit_tenant_integrity();

drop trigger if exists validate_checkflow_unit_tenant_integrity on public.checklist_executions;
create trigger validate_checkflow_unit_tenant_integrity
before insert or update of organization_id, assignment_id, checklist_id, unit_id on public.checklist_executions
for each row execute function public.validate_checkflow_unit_tenant_integrity();

drop trigger if exists validate_checkflow_unit_tenant_integrity on public.non_conformities;
create trigger validate_checkflow_unit_tenant_integrity
before insert or update of organization_id, execution_id, unit_id on public.non_conformities
for each row execute function public.validate_checkflow_unit_tenant_integrity();

create or replace function public.prevent_checkflow_unit_tenant_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id and (
    exists (select 1 from public.teams where unit_id = old.id)
    or exists (select 1 from public.checklists where unit_id = old.id)
    or exists (select 1 from public.checklist_assignments where unit_id = old.id)
    or exists (select 1 from public.checklist_executions where unit_id = old.id)
    or exists (select 1 from public.non_conformities where unit_id = old.id)
  ) then
    raise exception 'A organização de uma unidade referenciada não pode ser alterada';
  end if;
  return new;
end
$$;

drop trigger if exists prevent_checkflow_unit_tenant_move on public.units;
create trigger prevent_checkflow_unit_tenant_move
before update of organization_id on public.units
for each row execute function public.prevent_checkflow_unit_tenant_move();

revoke execute on function public.validate_checkflow_unit_tenant_integrity() from public, anon, authenticated, service_role;
revoke execute on function public.prevent_checkflow_unit_tenant_move() from public, anon, authenticated, service_role;

-- TRUNCATE bypasses row-level security. Remove only this table privilege from
-- API roles across the public product schema; retain normal DML grants/policies.
do $$
declare
  relation_name text;
begin
  for relation_name in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate on table public.%I from anon, authenticated', relation_name);
  end loop;
end
$$;

-- The installed local Supabase defaults grant TRUNCATE on future public tables.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
