"use client";

import { FormEvent, useEffect, useState } from "react";
import { initializeSupabaseBrowserClient } from "../lib/supabase";

type Member = { user_id: string; role: string; full_name: string };

export function TeamManagement() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
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
      .select("organization_id,role").eq("user_id", user.id).eq("active", true).maybeSingle();
    if (membershipError || !membership) { setMessage(membershipError?.message || "Organização não encontrada."); setLoading(false); return; }
    setRole(membership.role);
    if (membership.role !== "owner") { setLoading(false); return; }
    const { data: rows, error: memberError } = await supabase.from("organization_members")
      .select("user_id,role").eq("organization_id", membership.organization_id).eq("active", true).order("created_at");
    if (memberError) { setMessage(memberError.message); setLoading(false); return; }
    const ids = (rows || []).map(value => value.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await supabase.from("profiles").select("id,full_name").in("id", ids)
      : { data: [], error: null };
    if (profileError) { setMessage(profileError.message); setLoading(false); return; }
    const names = new Map((profiles || []).map(profile => [profile.id, profile.full_name || "Usuário"]));
    setMembers((rows || []).map(member => ({ ...member, full_name: names.get(member.user_id) || "Usuário" })));
    setLoading(false);
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true); setMessage("");
    const supabase = await initializeSupabaseBrowserClient();
    const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    if (!session) { setMessage("Sessão não encontrada."); setBusy(false); return; }
    const response = await fetch("/api/team-invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email: email.trim() }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) setMessage(body.error || "Não foi possível enviar o convite.");
    else { setEmail(""); setMessage(body.message || "Convite enviado."); await load(); }
    setBusy(false);
  };

  if (loading) return <section className="data-panel"><p className="data-state">Carregando equipe...</p></section>;
  if (role !== "owner") return <section className="data-panel"><p className="data-state">Apenas o proprietário pode convidar colaboradores.</p></section>;
  return <section>
    <div className="section-toolbar"><div><h2>Gestão da equipe</h2><p>Convide colaboradores para a organização atual.</p></div></div>
    <article className="data-panel">
      <form className="inline-create" onSubmit={invite}><label>E-mail do colaborador<input required type="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="colaborador@empresa.com" /></label><button className="primary" disabled={busy}>{busy ? "Enviando..." : "Convidar colaborador"}</button></form>
      {message && <p className="data-state">{message}</p>}
      <div className="data-head"><span>Colaborador</span><span>Papel</span><span></span><span></span></div>
      {members.map(member => <div className="data-row" key={member.user_id}><span><strong>{member.full_name}</strong></span><span>{member.role === "owner" ? "Proprietário" : member.role === "manager" ? "Gestor" : "Colaborador"}</span><span></span><span></span></div>)}
    </article>
  </section>;
}
