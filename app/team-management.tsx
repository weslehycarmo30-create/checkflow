"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { initializeSupabaseBrowserClient } from "../lib/supabase";
import {
  canManageUnits,
  createCurrentOrganizationUnit,
  deactivateCurrentOrganizationUnit,
  listCurrentOrganizationUnits,
} from "../lib/unit-management.mjs";

type Member = { user_id: string; role: "owner" | "manager" | "collaborator"; full_name: string };
type Unit = { id: string; name: string; address: string | null; active: boolean; created_at: string };

export function TeamManagement({ organizationId }: { organizationId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "collaborator">("collaborator");
  const [viewerRole, setViewerRole] = useState<"owner" | "manager" | "collaborator" | "">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unitBusy, setUnitBusy] = useState(false);
  const [unitName, setUnitName] = useState("");
  const [unitAddress, setUnitAddress] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [unitLoadError, setUnitLoadError] = useState("");
  const [unitNotice, setUnitNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const unitActionInFlight = useRef(false);
  const canManage = canManageUnits(viewerRole);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setUnitLoadError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) {
      setLoadError("Supabase não está configurado neste ambiente.");
      setLoading(false);
      return;
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setLoadError("Sessão não encontrada. Entre novamente para continuar.");
        return;
      }

      const { data: membership, error: membershipError } = await supabase.from("organization_members")
        .select("organization_id,role").eq("user_id", user.id).eq("organization_id", organizationId).eq("active", true).maybeSingle();
      if (membershipError || !membership) {
        setLoadError("Não foi possível confirmar sua organização atual.");
        return;
      }
      setViewerRole(membership.role);

      try {
        const unitRows = await listCurrentOrganizationUnits(supabase, membership.organization_id);
        setUnits(unitRows as Unit[]);
      } catch {
        setUnitLoadError("Não foi possível carregar as unidades desta organização.");
      }

      if (!["owner", "manager"].includes(membership.role)) {
        setMembers([]);
        return;
      }

      const { data: rows, error: memberError } = await supabase.from("organization_members")
        .select("user_id,role").eq("organization_id", membership.organization_id).eq("active", true).order("created_at");
      if (memberError) {
        setLoadError("Não foi possível carregar a equipe da organização.");
        return;
      }
      const ids = (rows || []).map(value => value.user_id);
      const { data: profiles, error: profileError } = ids.length
        ? await supabase.from("profiles").select("id,full_name").in("id", ids)
        : { data: [], error: null };
      if (profileError) {
        setLoadError("Não foi possível carregar os nomes da equipe.");
        return;
      }
      const names = new Map((profiles || []).map(profile => [profile.id, profile.full_name || "Usuário"]));
      setMembers((rows || []).map(member => ({ ...member, full_name: names.get(member.user_id) || "Usuário" })) as Member[]);
    } catch {
      setLoadError("Não foi possível carregar os dados desta organização.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !email.trim() || !["owner", "manager"].includes(viewerRole)) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = await initializeSupabaseBrowserClient();
      const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      if (!session) {
        setMessage("Sessão não encontrada. Entre novamente para continuar.");
        return;
      }
      const response = await fetch("/api/team-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: email.trim(), role: viewerRole === "manager" ? "collaborator" : role }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) setMessage(body.error || "Não foi possível enviar o convite.");
      else {
        setEmail("");
        setRole("collaborator");
        setMessage(body.message || "Convite enviado.");
        await load();
      }
    } catch {
      setMessage("Não foi possível enviar o convite. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const createUnit = async (event: FormEvent) => {
    event.preventDefault();
    if (unitActionInFlight.current || unitBusy || !canManage || unitLoadError || !unitName.trim()) return;
    unitActionInFlight.current = true;
    setUnitBusy(true);
    setUnitNotice(null);
    try {
      const supabase = await initializeSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase não está configurado neste ambiente.");
      await createCurrentOrganizationUnit(supabase, organizationId, { name: unitName, address: unitAddress });
      setUnitName("");
      setUnitAddress("");
      await load();
      setUnitNotice({ kind: "success", text: "Unidade cadastrada com sucesso." });
    } catch (error) {
      setUnitNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Não foi possível cadastrar a unidade.",
      });
    } finally {
      unitActionInFlight.current = false;
      setUnitBusy(false);
    }
  };

  const deactivateUnit = async (unit: Unit) => {
    if (unitActionInFlight.current || unitBusy || !canManage) return;
    const confirmed = window.confirm(
      `Desativar “${unit.name}”? Ela deixará de aparecer em novas atribuições; vínculos e histórico existentes serão preservados.`,
    );
    if (!confirmed) return;

    unitActionInFlight.current = true;
    setUnitBusy(true);
    setUnitNotice(null);
    try {
      const supabase = await initializeSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase não está configurado neste ambiente.");
      await deactivateCurrentOrganizationUnit(supabase, organizationId, unit.id);
      await load();
      setUnitNotice({ kind: "success", text: `Unidade “${unit.name}” desativada. Os vínculos existentes foram mantidos.` });
    } catch (error) {
      setUnitNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Não foi possível desativar a unidade.",
      });
    } finally {
      unitActionInFlight.current = false;
      setUnitBusy(false);
    }
  };

  if (loading) return <section className="data-panel"><p className="data-state">Carregando equipe e unidades...</p></section>;
  if (loadError) return <section className="data-panel"><p className="data-state error" role="alert">{loadError}</p><button className="secondary" type="button" onClick={() => void load()}>Tentar novamente</button></section>;

  return <section>
    {canManage && <>
      <div className="section-toolbar"><div><h2>Gestão da equipe</h2><p>Convide pessoas para a organização atual. O convite não aceita organização escolhida no navegador.</p></div></div>
      <article className="data-panel">
        <form className="inline-create" onSubmit={invite}>
          <label>E-mail<input required type="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="pessoa@empresa.com" /></label>
          {viewerRole === "owner" && <label>Papel<select value={role} disabled={busy} onChange={event => setRole(event.target.value as "manager" | "collaborator")}><option value="collaborator">Executor</option><option value="manager">Gestor</option></select></label>}
          <button className="primary" type="submit" disabled={busy}>{busy ? "Enviando..." : "Enviar convite"}</button>
        </form>
        {message && <p className="data-state" role="status">{message}</p>}
        <div className="data-head"><span>Membro</span><span>Papel</span><span></span><span></span></div>
        {members.map(member => <div className="data-row" key={member.user_id}><span><strong>{member.full_name}</strong></span><span>{member.role === "owner" ? "Proprietário" : member.role === "manager" ? "Gestor" : "Executor"}</span><span></span><span></span></div>)}
      </article>
    </>}

    <div className="section-toolbar unit-section-heading"><div><h2>Unidades da organização</h2><p>Organize as atribuições por local. Unidades desativadas continuam vinculadas ao histórico existente.</p></div></div>
    <article className="data-panel unit-management">
      {canManage ? <form className="unit-form" onSubmit={createUnit}>
        <label>Nome da unidade<input required maxLength={120} value={unitName} disabled={unitBusy || Boolean(unitLoadError)} onChange={event => setUnitName(event.target.value)} placeholder="Ex.: Loja Centro" /></label>
        <label>Endereço <small>Opcional</small><input maxLength={240} value={unitAddress} disabled={unitBusy || Boolean(unitLoadError)} onChange={event => setUnitAddress(event.target.value)} placeholder="Rua, número e cidade" /></label>
        <button className="primary" type="submit" disabled={unitBusy || Boolean(unitLoadError) || !unitName.trim()}>{unitBusy ? "Salvando..." : "Cadastrar unidade"}</button>
      </form> : <p className="unit-readonly" role="status">Visualização somente leitura. Apenas proprietários e gestores podem cadastrar ou desativar unidades.</p>}

      {unitNotice && <p className={`data-state ${unitNotice.kind === "error" ? "error" : "unit-success"}`} role={unitNotice.kind === "error" ? "alert" : "status"}>{unitNotice.text}</p>}
      {unitLoadError ? <div className="unit-error"><p className="data-state error" role="alert">{unitLoadError}</p><button className="secondary" type="button" onClick={() => void load()}>Tentar novamente</button></div> : units.length === 0 ? <p className="data-state unit-empty">Nenhuma unidade cadastrada nesta organização.</p> : <div className="unit-list" role="list" aria-label="Unidades cadastradas">
        {units.map(unit => <div className={`unit-row${unit.active ? "" : " is-inactive"}`} key={unit.id} role="listitem">
          <div className="unit-copy"><strong>{unit.name}</strong>{unit.address && <span>{unit.address}</span>}</div>
          <span className={`unit-status${unit.active ? "" : " is-inactive"}`}>{unit.active ? "Ativa" : "Inativa"}</span>
          {canManage && unit.active && <button className="secondary unit-deactivate" type="button" disabled={unitBusy} onClick={() => void deactivateUnit(unit)}>Desativar</button>}
        </div>)}
      </div>}
    </article>
  </section>;
}
