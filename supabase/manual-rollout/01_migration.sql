-- CheckFlow: enforce the UI's structural freeze at the database boundary.
-- A checklist is editable only while it is a draft and has never been assigned
-- or executed. This is a domain invariant, independent of role/RLS.

create or replace function public.lock_checkflow_checklist(p_checklist_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_checklist_id is not null then
    perform 1
    from public.checklists checklist
    where checklist.id = p_checklist_id
    for update;
  end if;
end
$$;

create or replace function public.checkflow_checklist_is_protected(p_checklist_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    checklist.status <> 'draft'
    or exists (
      select 1
      from public.checklist_assignments assignment
      where assignment.checklist_id = checklist.id
    )
    or exists (
      select 1
      from public.checklist_executions execution
      where execution.checklist_id = checklist.id
    ),
    false
  )
  from public.checklists checklist
  where checklist.id = p_checklist_id
$$;

create or replace function public.enforce_checkflow_structure_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_checklist_id uuid;
  new_checklist_id uuid;
begin
  if tg_table_name = 'checklists' then
    old_checklist_id := old.id;
    new_checklist_id := case when tg_op = 'UPDATE' then new.id else null end;
  elsif tg_table_name = 'checklist_sections' then
    old_checklist_id := case
      when tg_op <> 'INSERT' then old.checklist_id
    end;
    new_checklist_id := case
      when tg_op <> 'DELETE' then new.checklist_id
    end;
  elsif tg_table_name = 'checklist_items' then
    if tg_op <> 'INSERT' then
      select section.checklist_id
      into old_checklist_id
      from public.checklist_sections section
      where section.id = old.section_id;
    end if;
    if tg_op <> 'DELETE' then
      select section.checklist_id
      into new_checklist_id
      from public.checklist_sections section
      where section.id = new.section_id;
    end if;
  end if;

  -- Every structural mutation and every operation that creates the protected
  -- state locks the checklist row. For a move between checklists, use a stable
  -- order to avoid introducing a lock-order deadlock.
  if old_checklist_id is not null
     and new_checklist_id is not null
     and old_checklist_id <> new_checklist_id then
    if old_checklist_id < new_checklist_id then
      perform public.lock_checkflow_checklist(old_checklist_id);
      perform public.lock_checkflow_checklist(new_checklist_id);
    else
      perform public.lock_checkflow_checklist(new_checklist_id);
      perform public.lock_checkflow_checklist(old_checklist_id);
    end if;
  else
    perform public.lock_checkflow_checklist(coalesce(new_checklist_id, old_checklist_id));
  end if;

  if public.checkflow_checklist_is_protected(old_checklist_id)
     or public.checkflow_checklist_is_protected(new_checklist_id) then
    raise exception 'A estrutura do checklist está protegida após atribuição, execução ou publicação';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create or replace function public.lock_checkflow_lifecycle_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_checklist_id uuid;
  new_checklist_id uuid;
begin
  if tg_table_name = 'checklist_assignments' then
    if tg_op = 'UPDATE' then
      old_checklist_id := old.checklist_id;
    end if;
    new_checklist_id := new.checklist_id;
  elsif tg_table_name = 'checklist_executions' then
    if tg_op = 'UPDATE' then
      old_checklist_id := old.checklist_id;
    end if;
    new_checklist_id := new.checklist_id;
  end if;

  if old_checklist_id is not null
     and new_checklist_id is not null
     and old_checklist_id <> new_checklist_id then
    if old_checklist_id < new_checklist_id then
      perform public.lock_checkflow_checklist(old_checklist_id);
      perform public.lock_checkflow_checklist(new_checklist_id);
    else
      perform public.lock_checkflow_checklist(new_checklist_id);
      perform public.lock_checkflow_checklist(old_checklist_id);
    end if;
  else
    perform public.lock_checkflow_checklist(coalesce(new_checklist_id, old_checklist_id));
  end if;

  return new;
end
$$;

drop trigger if exists enforce_checkflow_structure_immutability on public.checklists;
create trigger enforce_checkflow_structure_immutability
before update or delete on public.checklists
for each row execute function public.enforce_checkflow_structure_immutability();

drop trigger if exists enforce_checkflow_structure_immutability on public.checklist_sections;
create trigger enforce_checkflow_structure_immutability
before insert or update or delete on public.checklist_sections
for each row execute function public.enforce_checkflow_structure_immutability();

drop trigger if exists enforce_checkflow_structure_immutability on public.checklist_items;
create trigger enforce_checkflow_structure_immutability
before insert or update or delete on public.checklist_items
for each row execute function public.enforce_checkflow_structure_immutability();

drop trigger if exists lock_checkflow_lifecycle_checklist on public.checklist_assignments;
drop trigger if exists before_checkflow_lifecycle_lock on public.checklist_assignments;
create trigger before_checkflow_lifecycle_lock
before insert or update on public.checklist_assignments
for each row execute function public.lock_checkflow_lifecycle_checklist();

drop trigger if exists lock_checkflow_lifecycle_checklist on public.checklist_executions;
drop trigger if exists before_checkflow_lifecycle_lock on public.checklist_executions;
create trigger before_checkflow_lifecycle_lock
before insert or update on public.checklist_executions
for each row execute function public.lock_checkflow_lifecycle_checklist();

revoke execute on function public.lock_checkflow_checklist(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.checkflow_checklist_is_protected(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.enforce_checkflow_structure_immutability() from public, anon, authenticated, service_role;
revoke execute on function public.lock_checkflow_lifecycle_checklist() from public, anon, authenticated, service_role;
