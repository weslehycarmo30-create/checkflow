-- CheckFlow P1-02: serialize assignment cycles and make an execution assignment-scoped.
-- Requires 202609030001_checklist_structure_integrity.sql for the shared checklist lock.

create or replace function public.prevent_checkflow_duplicate_assignment_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The P1-01 lifecycle trigger locks this same parent first. Calling the helper
  -- here also keeps this invariant correct if trigger ordering is changed later.
  perform public.lock_checkflow_checklist(new.checklist_id);

  if new.active and exists (
    select 1
    from public.checklist_assignments existing
    where existing.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and existing.organization_id = new.organization_id
      and existing.checklist_id = new.checklist_id
      and existing.assigned_to = new.assigned_to
      and existing.active
      and (
        not exists (
          select 1 from public.checklist_executions execution
          where execution.assignment_id = existing.id
        )
        or exists (
          select 1 from public.checklist_executions execution
          where execution.assignment_id = existing.id
            and execution.status not in ('completed', 'cancelled')
        )
      )
  ) then
    raise exception 'Já existe uma atribuição operacional para este checklist e executor';
  end if;

  return new;
end
$$;

drop trigger if exists enforce_checkflow_assignment_cycle on public.checklist_assignments;
create trigger enforce_checkflow_assignment_cycle
before insert or update of organization_id, checklist_id, assigned_to, active
on public.checklist_assignments
for each row execute function public.prevent_checkflow_duplicate_assignment_cycle();

-- A completed/cancelled execution belongs to its original assignment. A new
-- cycle must use the fresh assignment created by the approved 68852bd behavior.
create unique index if not exists checklist_executions_one_per_assignment
  on public.checklist_executions (assignment_id)
  where assignment_id is not null;

revoke execute on function public.prevent_checkflow_duplicate_assignment_cycle()
  from public, anon, authenticated, service_role;
