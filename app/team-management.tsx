"use client";

import { FormEvent, useEffect, useState } from "react";
import { initializeSupabaseBrowserClient } from "../lib/supabase";

type Member = { user_id: string; role: "owner" | "manager" | "collaborator"; full_name: string };

export function TeamManagement() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "collaborator">("collaborator");
  const [viewerRole, setViewerRole] = useState<"owner" | "manager" | "collaborator" | "">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setMessage("Supabase não configurado."); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage("Sessão não encontrada."); setLoading(false); return; }
    const { data: membership, error: membershipError } = await supabase.from("organization_members")
      .select("organization_id,role").eq("user_id", user.id).eq("active", true).limit(1).maybeSingle();
    if (membershipError || !membership) { setMessage(membershipError?.message || "Organização não encontrada."); setLoading(false); return; }
    setViewerRole(membership.role);
    const { data: rows, error: memberError } = await supabase.from("organization_members")
      .select("user_id,role").eq("organization_id", membership.organization_id).eq("active", true).order("created_at");
    if (memberError) { setMessage(memberError.message); setLoading(false); return; }
    const ids = (rows || []).map(value => value.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await supabase.from("profiles").select("id,full_name").in("id", ids)
      : { data: [], error: null };
    if (profileError) { setMessage(profileError.message); setLoading(false); return; }
    const names = new Map((profiles || []).map(profile => [profile.id, profile.full_name || "Usuário"]));
    setMembers((rows || []).map(member => ({ ...member, full_name: names.get(member.user_id) || "Usuário" })) as Member[]);
    setLoading(false);
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !email.trim() || !["owner", "manager"].includes(viewerRole)) return;
    setBusy(true); setMessage("");
    const supabase = await initializeSupabaseBrowserClient();
    const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    if (!session) { setMessage("Sessão não encontrada."); setBusy(false); return; }
    const response = await fetch("/api/team-invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email: email.trim(), role: viewerRole === "manager" ? "collaborator" : role }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) setMessage(body.error || "Não foi possível enviar o convite.");
    else { setEmail(""); setRole("collaborator"); setMessage(body.message || "Convite enviado."); await load(); }
    setBusy(false);
  };

  if (loading) return <section className="data-panel"><p className="data-state">Carregando equipe...</p></section>;
  if (!["owner", "manager"].includes(viewerRole)) return <section className="data-panel"><p className="data-state">Somente owner ou manager podem convidar executores.</p></section>;
  return <section>
    <div className="section-toolbar"><div><h2>Gestão da equipe</h2><p>Convide pessoas para a organização atual. O convite não aceita organização escolhida no navegador.</p></div></div>
    <article className="data-panel">
      <form className="inline-create" onSubmit={invite}>
        <label>E-mail<input required type="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="pessoa@empresa.com" /></label>
        {viewerRole === "owner" && <label>Papel<select value={role} disabled={busy} onChange={event => setRole(event.target.value as "manager" | "collaborator")}><option value="collaborator">Executor</option><option value="manager">Gestor</option></select></label>}
        <button className="primary" disabled={busy}>{busy ? "Enviando..." : "Enviar convite"}</button>
      </form>
      {message && <p className="data-state">{message}</p>}
      <div className="data-head"><span>Membro</span><span>Papel</span><span></span><span></span></div>
      {members.map(member => <div className="data-row" key={member.user_id}><span><strong>{member.full_name}</strong></span><span>{member.role === "owner" ? "Proprietário" : member.role === "manager" ? "Gestor" : "Executor"}</span><span></span><span></span></div>)}
    </article>
  </section>;
}
