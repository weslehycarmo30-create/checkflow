-- CheckFlow: permissão mínima para o colaborador enviar a correção do próprio plano.
-- Idempotente: função, trigger e política podem ser reaplicados com segurança.

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

drop trigger if exists enforce_action_plan_collaborator_update on public.action_plans;
create trigger enforce_action_plan_collaborator_update
before update on public.action_plans
for each row execute function public.enforce_action_plan_collaborator_update();

drop policy if exists collaborator_action_plan_update on public.action_plans;
create policy collaborator_action_plan_update
on public.action_plans
for update
using (
  responsible_user_id = auth.uid()
  and public.is_org_member(organization_id)
)
with check (
  responsible_user_id = auth.uid()
  and public.is_org_member(organization_id)
);
