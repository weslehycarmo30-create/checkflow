-- Row policies limited which rows a signed-in user could write, but not what
-- could be written in them. Close three gaps found before publication.

-- 1. Non-conformities opened by executors go through
-- record_checkflow_non_conformity, which fixes status, priority and assignee.
-- The direct insert policy let an executor create one already completed.
drop policy if exists collaborator_nonconformity_insert on public.non_conformities;

-- 2. An approved correction is final for the responsible executor. Management
-- is unaffected, and a rejected correction can still be sent again.
create or replace function public.enforce_action_plan_collaborator_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.has_org_role(old.organization_id, array['owner','manager']::public.member_role[]) then
    return new;
  end if;

  if auth.uid() is null or old.responsible_user_id is distinct from auth.uid() then
    raise exception 'Somente o responsável ou a gestão pode alterar este plano de ação';
  end if;

  if old.status = 'completed' then
    raise exception 'Uma correção aprovada não pode ser alterada pelo colaborador';
  end if;

  if (
    new.organization_id,
    new.non_conformity_id,
    new.description,
    new.responsible_user_id,
    new.due_at,
    new.created_by,
    new.validation_comment,
    new.validated_by,
    new.validated_at
  ) is distinct from (
    old.organization_id,
    old.non_conformity_id,
    old.description,
    old.responsible_user_id,
    old.due_at,
    old.created_by,
    old.validation_comment,
    old.validated_by,
    old.validated_at
  ) then
    raise exception 'O colaborador só pode enviar a evidência e alterar o andamento da correção';
  end if;

  if new.status not in ('in_progress','awaiting_validation') then
    raise exception 'Status não permitido para o colaborador';
  end if;

  if new.status = 'awaiting_validation'
     and nullif(btrim(coalesce(new.correction_comment,'')),'') is null then
    raise exception 'A fotografia da correção é obrigatória';
  end if;

  return new;
end
$$;

revoke all on function public.enforce_action_plan_collaborator_update() from public, anon, authenticated;

-- 3. An owner must not attach to the company someone who is active in another
-- one: it changes which company that person sees and blocks their invitations.
-- Signed-in users only; signup, the invitation Worker (which does its own
-- check) and operator maintenance run without auth.uid().
create or replace function public.prevent_checkflow_cross_company_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Anyone who is not an owner is left to row security, so this check cannot be
  -- used to find out whether someone belongs to another company.
  if auth.uid() is null
     or not public.has_org_role(new.organization_id, array['owner']::public.member_role[]) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (new.organization_id, new.user_id) is not distinct from (old.organization_id, old.user_id)
     and not (new.active and not old.active) then
    return new;
  end if;

  if exists (
    select 1 from public.organization_members
    where user_id = new.user_id and active and organization_id <> new.organization_id
  ) then
    raise exception 'Esta pessoa já está vinculada a outra empresa';
  end if;

  return new;
end
$$;

revoke all on function public.prevent_checkflow_cross_company_membership() from public, anon, authenticated;

drop trigger if exists prevent_checkflow_cross_company_membership on public.organization_members;
create trigger prevent_checkflow_cross_company_membership
before insert or update on public.organization_members
for each row execute function public.prevent_checkflow_cross_company_membership();
