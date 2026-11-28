export const ROLE_LABELS = { owner: "Proprietário", manager: "Gestor", collaborator: "Executor" };

/**
 * What the viewer may do to a member. The database lets only owners change memberships and the
 * invitation route lets managers invite executors only; this mirrors both.
 */
export function memberActions(viewerRole, viewerId, member) {
  const other = member.user_id !== viewerId && member.role !== "owner";
  const owner = viewerRole === "owner" && other;
  return {
    changeRole: owner && member.active,
    deactivate: owner && member.active,
    reactivate: owner && !member.active,
    resend: other && member.active && (viewerRole === "owner" || (viewerRole === "manager" && member.role === "collaborator")),
  };
}

async function changeMember(client, organizationId, userId, change, failure) {
  const { data, error } = await client
    .from("organization_members")
    .update(change)
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .neq("role", "owner")
    .select("user_id")
    .maybeSingle();
  if (error?.message?.includes("outra empresa")) throw new Error("Essa pessoa já está vinculada a outra empresa.");
  // Row security refuses silently: no row back means nothing changed.
  if (error || !data) throw new Error(failure);
}

export async function setMemberRole(client, organizationId, userId, role) {
  if (role !== "manager" && role !== "collaborator") throw new Error("Papel inválido.");
  await changeMember(client, organizationId, userId, { role }, "Não foi possível mudar o papel.");
}

export async function setMemberActive(client, organizationId, userId, active) {
  await changeMember(client, organizationId, userId, { active }, active ? "Não foi possível reativar a pessoa." : "Não foi possível remover o acesso.");
}
