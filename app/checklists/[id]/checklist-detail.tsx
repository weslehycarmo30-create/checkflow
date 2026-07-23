"use client";

import { useEffect, useState } from "react";
import { PrivateRouteGuard } from "../../private-route-guard";
import { initializeSupabaseBrowserClient } from "../../../lib/supabase";

type Checklist = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: "draft" | "active" | "archived";
  created_by: string | null;
};
type Item = { id: string; prompt: string; answer_type: string; required: boolean; position: number };
type Section = { id: string; title: string; position: number; checklist_items: Item[] };
type Member = { user_id: string; role: string; full_name: string };
type Unit = { id: string; name: string };
type Assignment = {
  id: string;
  assigned_to: string;
  unit_id: string | null;
  due_at: string | null;
  active: boolean;
  collaborator_name: string;
  unit_name: string | null;
};

export default function ChecklistDetail({ checklistId }: { checklistId: string }) {
  const [checklist,setChecklist] = useState<Checklist | null>(null);
  const [sections,setSections] = useState<Section[]>([]);
  const [members,setMembers] = useState<Member[]>([]);
  const [units,setUnits] = useState<Unit[]>([]);
  const [assignments,setAssignments] = useState<Assignment[]>([]);
  const [role,setRole] = useState("");
  const [userId,setUserId] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [editing,setEditing] = useState(false);
  const [name,setName] = useState("");
  const [description,setDescription] = useState("");
  const [category,setCategory] = useState("");
  const [sectionTitle,setSectionTitle] = useState("");
  const [itemPrompt,setItemPrompt] = useState<Record<string,string>>({});
  const [assignedTo,setAssignedTo] = useState("");
  const [unitId,setUnitId] = useState("");
  const [dueAt,setDueAt] = useState("");
  const canManage = role === "owner" || role === "manager";

  const load = async () => {
    setLoading(true);
    setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setError("Supabase não configurado."); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sessão não encontrada."); setLoading(false); return; }
    setUserId(user.id);
    const { data: record, error: checklistError } = await supabase
      .from("checklists")
      .select("id,organization_id,name,description,category,status,created_by")
      .eq("id", checklistId)
      .neq("status", "archived")
      .maybeSingle();
    if (checklistError || !record) {
      setError(checklistError?.message || "Checklist não encontrado ou sem permissão de acesso.");
      setLoading(false);
      return;
    }
    const current = record as Checklist;
    setChecklist(current);
    setName(current.name);
    setDescription(current.description || "");
    setCategory(current.category || "");
    const [{ data: membership }, { data: sectionData, error: sectionError }, { data: memberData }, { data: unitData }, { data: assignmentData, error: assignmentLoadError }] = await Promise.all([
      supabase.from("organization_members").select("role").eq("organization_id", current.organization_id).eq("user_id", user.id).eq("active", true).maybeSingle(),
      supabase.from("checklist_sections").select("id,title,position,checklist_items(id,prompt,answer_type,required,position)").eq("checklist_id", checklistId).order("position"),
      supabase.from("organization_members").select("user_id,role").eq("organization_id", current.organization_id).eq("active", true),
      supabase.from("units").select("id,name").eq("organization_id", current.organization_id).eq("active", true).order("name"),
      supabase.from("checklist_assignments").select("id,assigned_to,unit_id,due_at,active").eq("checklist_id", checklistId).eq("active", true).order("created_at"),
    ]);
    setRole(membership?.role || "");
    if (sectionError) setError(sectionError.message);
    setSections(((sectionData || []) as Section[]).map(section => ({
      ...section,
      checklist_items: [...(section.checklist_items || [])].sort((a,b)=>a.position-b.position),
    })));
    const memberIds = (memberData || []).map(member => member.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase.from("profiles").select("id,full_name").in("id", memberIds)
      : { data: [] };
    const names = new Map((profiles || []).map(profile => [profile.id, profile.full_name || "Usuário"]));
    setMembers((memberData || []).map(member => ({ ...member, full_name: names.get(member.user_id) || "Usuário" })));
    const loadedUnits = (unitData || []) as Unit[];
    const unitNames = new Map(loadedUnits.map(unit => [unit.id, unit.name]));
    setUnits(loadedUnits);
    if (assignmentLoadError) setError(assignmentLoadError.message);
    setAssignments((assignmentData || []).map(assignment => ({
      ...assignment,
      collaborator_name: names.get(assignment.assigned_to) || "Usuário",
      unit_name: assignment.unit_id ? unitNames.get(assignment.unit_id) || "Unidade" : null,
    })));
    setLoading(false);
  };

  useEffect(()=>{
    // A consulta é assíncrona e sincroniza a rota com o registro autorizado pelo RLS.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  },[checklistId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveChecklist = async () => {
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase || !checklist) return;
    const { error: updateError } = await supabase.from("checklists").update({
      name: name.trim(), description: description.trim() || null, category: category.trim() || null,
    }).eq("id", checklist.id).eq("organization_id", checklist.organization_id);
    if (updateError) { setError(updateError.message); return; }
    setChecklist({...checklist,name:name.trim(),description:description.trim()||null,category:category.trim()||null});
    setEditing(false);
    setNotice("Checklist atualizado.");
  };

  const addSection = async () => {
    if (!sectionTitle.trim() || !checklist) return;
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) return;
    const { error: insertError } = await supabase.from("checklist_sections").insert({
      organization_id: checklist.organization_id, checklist_id: checklist.id, title: sectionTitle.trim(),
      position: sections.length, created_by: userId,
    });
    if (insertError) { setError(insertError.message); return; }
    setSectionTitle("");
    await load();
  };

  const addItem = async (sectionId:string) => {
    const prompt = itemPrompt[sectionId]?.trim();
    const section = sections.find(value=>value.id===sectionId);
    if (!prompt || !checklist || !section) return;
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) return;
    const { error: insertError } = await supabase.from("checklist_items").insert({
      organization_id: checklist.organization_id, section_id: sectionId, prompt,
      answer_type: "checkbox", required: true, position: section.checklist_items.length, created_by: userId,
    });
    if (insertError) { setError(insertError.message); return; }
    setItemPrompt(current=>({...current,[sectionId]:""}));
    await load();
  };

  const assign = async () => {
    if (!checklist || !assignedTo) { setError("Selecione um colaborador."); return; }
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) return;
    setError("");
    const assignmentValues = {
      unit_id: unitId || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      recurrence: "none",
      active: true,
    };
    const { data: existing, error: existingError } = await supabase
      .from("checklist_assignments")
      .select("id")
      .eq("organization_id", checklist.organization_id)
      .eq("checklist_id", checklist.id)
      .eq("assigned_to", assignedTo)
      .eq("active", true)
      .order("created_at");
    if (existingError) { setError(existingError.message); return; }
    let assignmentError = null;
    if (existing && existing.length > 0) {
      const { error: updateError } = await supabase.from("checklist_assignments").update(assignmentValues).eq("id", existing[0].id);
      assignmentError = updateError;
      if (!assignmentError && existing.length > 1) {
        const duplicateIds = existing.slice(1).map(value=>value.id);
        const { error: cleanupError } = await supabase.from("checklist_assignments").update({ active: false }).in("id", duplicateIds);
        assignmentError = cleanupError;
      }
    } else {
      const { error: insertError } = await supabase.from("checklist_assignments").insert({
        organization_id: checklist.organization_id, checklist_id: checklist.id, assigned_to: assignedTo,
        ...assignmentValues, created_by: userId,
      });
      assignmentError = insertError;
    }
    if (assignmentError) { setError(assignmentError.message); return; }
    setNotice(existing?.length ? "Atribuição atualizada sem duplicidade." : "Checklist atribuído com sucesso.");
    setAssignedTo(""); setUnitId(""); setDueAt("");
    await load();
  };

  return <main className="detail-page">
    <PrivateRouteGuard />
    <button className="back-link" onClick={()=>{window.location.href="/"}}>← Voltar para a lista</button>
    {loading&&<section className="detail-card"><p>Carregando checklist...</p></section>}
    {!loading&&error&&!checklist&&<section className="detail-card detail-error"><h1>Acesso indisponível</h1><p>{error}</p></section>}
    {!loading&&checklist&&<div className="detail-layout">
      <section>
        <article className="detail-card">
          <div className="detail-heading">
            <div><span className="segment">{checklist.category || "Sem categoria"}</span><h1>{checklist.name}</h1><p>{checklist.description || "Sem descrição."}</p></div>
            {canManage&&<button className="secondary" onClick={()=>setEditing(!editing)}>{editing?"Cancelar":"Editar"}</button>}
          </div>
          {editing&&<div className="edit-form"><label>Nome<input value={name} onChange={event=>setName(event.target.value)}/></label><label>Descrição<textarea value={description} onChange={event=>setDescription(event.target.value)}/></label><label>Categoria<input value={category} onChange={event=>setCategory(event.target.value)}/></label><button className="primary" disabled={!name.trim()} onClick={saveChecklist}>Salvar alterações</button></div>}
        </article>
        <article className="detail-card">
          <div className="detail-heading"><div><h2>Seções e itens</h2><p>Conteúdo atual deste checklist.</p></div></div>
          {sections.length===0&&<p className="empty-state">Nenhuma seção cadastrada.</p>}
          {sections.map(section=><div className="checklist-section" key={section.id}><h3>{section.title}</h3>{section.checklist_items.length===0&&<p className="empty-state">Nenhum item nesta seção.</p>}{section.checklist_items.map(item=><div className="checklist-item" key={item.id}><span className="item-check item-unanswered" aria-label="Item ainda não executado"></span><span><strong>{item.prompt}</strong><small>{item.required?"Obrigatório":"Opcional"} · {item.answer_type}</small></span></div>)}{canManage&&<div className="inline-create"><input value={itemPrompt[section.id]||""} onChange={event=>setItemPrompt(current=>({...current,[section.id]:event.target.value}))} placeholder="Novo item obrigatório"/><button className="secondary" onClick={()=>addItem(section.id)}>Adicionar item</button></div>}</div>)}
          {canManage&&<div className="inline-create section-create"><input value={sectionTitle} onChange={event=>setSectionTitle(event.target.value)} placeholder="Nome da nova seção"/><button className="secondary" onClick={addSection}>Adicionar seção</button></div>}
        </article>
      </section>
      {canManage&&<aside className="detail-card assignment-card"><h2>Atribuir checklist</h2><p>Defina o colaborador e, se necessário, unidade e prazo.</p><label>Colaborador<select value={assignedTo} onChange={event=>setAssignedTo(event.target.value)}><option value="">Selecione</option>{members.filter(member=>member.role==="collaborator").map(member=><option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</select></label><label>Unidade<select value={unitId} onChange={event=>setUnitId(event.target.value)}><option value="">Sem unidade</option>{units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label>Prazo<input type="datetime-local" value={dueAt} onChange={event=>setDueAt(event.target.value)}/></label><button className="primary" onClick={assign}>Atribuir ao colaborador</button><div className="current-assignments"><h3>Atribuições atuais</h3>{assignments.length===0&&<p>Nenhum colaborador atribuído.</p>}{assignments.map(assignment=><div className="assignment-row" key={assignment.id}><span className="assignment-avatar">{assignment.collaborator_name.slice(0,2).toUpperCase()}</span><span><strong>{assignment.collaborator_name}</strong><small>{assignment.unit_name || "Sem unidade"}{assignment.due_at?` · ${new Date(assignment.due_at).toLocaleString("pt-BR")}`:" · sem prazo"}</small></span></div>)}</div></aside>}
    </div>}
    {error&&checklist&&<p className="detail-message error">{error}</p>}
    {notice&&<p className="detail-message">{notice}</p>}
  </main>;
}
