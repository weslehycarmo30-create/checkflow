-- CheckFlow Start: least-privilege EXECUTE grants for SECURITY DEFINER helpers.
-- Forward-only; no data changes, deletes, Auth or Storage mutations.

-- Policy helpers are reached indirectly while authenticated RLS/Storage policies
-- are evaluated. They are not public RPCs.
revoke execute on function public.is_org_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_org_member(uuid) to authenticated;

revoke execute on function public.has_org_role(uuid, public.member_role[]) from public, anon, authenticated, service_role;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated;

revoke execute on function public.can_access_checkflow_evidence(text) from public, anon, authenticated, service_role;
grant execute on function public.can_access_checkflow_evidence(text) to authenticated;

-- These functions are invoked only by database triggers or by another
-- SECURITY DEFINER trigger function. No client role needs direct EXECUTE.
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function public.enforce_action_plan_collaborator_update() from public, anon, authenticated, service_role;
revoke execute on function public.validate_checkflow_tenant_links() from public, anon, authenticated, service_role;
revoke execute on function public.build_execution_snapshot(public.checklist_executions) from public, anon, authenticated, service_role;
revoke execute on function public.capture_and_protect_execution_snapshot() from public, anon, authenticated, service_role;
revoke execute on function public.protect_completed_execution_records() from public, anon, authenticated, service_role;
