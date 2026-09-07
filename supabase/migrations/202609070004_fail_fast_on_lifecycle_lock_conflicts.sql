-- Row-level BEFORE triggers run after UPDATE/DELETE has locked the target tuple.
-- Waiting for a parent here can invert the parent->child order of another DML.
-- Fail the whole transaction on contention; callers can retry after reloading.
-- NO KEY UPDATE preserves parent serialization without blocking FK KEY SHARE.
create or replace function public.lock_checkflow_checklist(p_checklist_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_checklist_id is not null then
    perform 1 from public.checklists where id=p_checklist_id for no key update nowait;
  end if;
exception when lock_not_available then
  raise exception using errcode='55P03',message='Checklist em operação concorrente. Atualize e tente novamente.';
end $$;
revoke execute on function public.lock_checkflow_checklist(uuid) from public,anon,authenticated,service_role;
