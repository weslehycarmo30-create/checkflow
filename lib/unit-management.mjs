const MANAGER_ROLES = new Set(["owner", "manager"]);
const UNIT_COLUMNS = "id,name,address,active,created_at";

export function canManageUnits(role) {
  return MANAGER_ROLES.has(role);
}

async function getCurrentMembership(client, currentOrganizationId) {
  if (typeof currentOrganizationId !== "string" || !currentOrganizationId.trim()) {
    throw new Error("Não foi possível confirmar sua organização atual.");
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  }

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", authData.user.id)
    .eq("organization_id", currentOrganizationId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.organization_id) {
    throw new Error("Não foi possível confirmar sua organização atual.");
  }

  return { membership, userId: authData.user.id };
}

export async function listCurrentOrganizationUnits(client, currentOrganizationId) {
  const { membership } = await getCurrentMembership(client, currentOrganizationId);
  const { data, error } = await client
    .from("units")
    .select(UNIT_COLUMNS)
    .eq("organization_id", membership.organization_id)
    .order("name", { ascending: true });

  if (error) throw new Error("Não foi possível carregar as unidades da organização.");
  return data ?? [];
}

export async function createCurrentOrganizationUnit(client, currentOrganizationId, { name, address = "" }) {
  const { membership, userId } = await getCurrentMembership(client, currentOrganizationId);
  if (!canManageUnits(membership.role)) {
    throw new Error("Seu perfil não tem permissão para cadastrar unidades.");
  }

  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) throw new Error("Informe o nome da unidade.");

  const { data, error } = await client
    .from("units")
    .insert({
      organization_id: membership.organization_id,
      created_by: userId,
      name: normalizedName,
      address: typeof address === "string" && address.trim() ? address.trim() : null,
      active: true,
    })
    .select(UNIT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Não foi possível cadastrar a unidade. Verifique as permissões e tente novamente.");
  }
  return data;
}

export async function deactivateCurrentOrganizationUnit(client, currentOrganizationId, unitId) {
  const { membership } = await getCurrentMembership(client, currentOrganizationId);
  if (!canManageUnits(membership.role)) {
    throw new Error("Seu perfil não tem permissão para desativar unidades.");
  }

  if (typeof unitId !== "string" || !unitId.trim()) {
    throw new Error("Unidade inválida.");
  }

  const { data, error } = await client
    .from("units")
    .update({ active: false })
    .eq("id", unitId)
    .eq("organization_id", membership.organization_id)
    .eq("active", true)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Não foi possível desativar a unidade. Ela pode já estar inativa ou não estar disponível.");
  }
  return data;
}
