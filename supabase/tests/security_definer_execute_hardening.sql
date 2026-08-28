-- Security Definer EXECUTE gate. All fixture changes are rolled back.

begin;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.handle_new_user()',
    'public.enforce_action_plan_collaborator_update()',
    'public.validate_checkflow_tenant_links()',
    'public.build_execution_snapshot(public.checklist_executions)',
    'public.capture_and_protect_execution_snapshot()',
    'public.protect_completed_execution_records()'
  ] loop
    if has_function_privilege('anon', signature, 'EXECUTE')
       or has_function_privilege('authenticated', signature, 'EXECUTE')
       or has_function_privilege('service_role', signature, 'EXECUTE') then
      raise exception 'internal SECURITY DEFINER remains directly executable: %', signature;
    end if;
  end loop;

  foreach signature in array array[
    'public.is_org_member(uuid)',
    'public.has_org_role(uuid, public.member_role[])',
    'public.can_access_checkflow_evidence(text)'
  ] loop
    if has_function_privilege('anon', signature, 'EXECUTE')
       or not has_function_privilege('authenticated', signature, 'EXECUTE') then
      raise exception 'policy helper privilege matrix is invalid: %', signature;
    end if;
  end loop;
end $$;

-- Auth and historical triggers remain installed; trigger invocation is not a
-- client EXECUTE grant. The behavioral P0/history suites exercise them fully.
do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='auth' and c.relname='users' and t.tgname='on_auth_user_created'
  ) then raise exception 'auth trigger is missing'; end if;
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='checklist_executions' and t.tgname='capture_and_protect_execution_snapshot'
  ) then raise exception 'snapshot trigger is missing'; end if;
end $$;

rollback;
