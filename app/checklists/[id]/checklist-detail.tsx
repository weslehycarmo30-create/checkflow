"use client";

import { useEffect, useRef, useState } from "react";
import { PrivateRouteGuard } from "../../private-route-guard";
import { initializeSupabaseBrowserClient } from "../../../lib/supabase";
import { FeedbackMessage, useFeedback } from "../../feedback";

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
type AssignmentExecution = { assignment_id: string; status: "pending" | "in_progress" | "paused" | "completed" | "cancelled" };

export default function ChecklistDetail({ checklistId }: { checklistId: string }) {
  const [checklist,setChecklist] = useState<Checklist | null>(null);
  const [sections,setSections] = useState<Section[]>([]);
  const [members,setMembers] = useState<Member[]>([]);
  const [units,setUnits] = useState<Unit[]>([]);
  const [assignments,setAssignments] = useState<Assignment[]>([]);
  const [hasExecution,setHasExecution] = useState(false);
  const [structureCheckError,setStructureCheckError] = useState(false);
  const [role,setRole] = useState("");
  const [userId,setUserId] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const { feedback, showFeedback, clearFeedback } = useFeedback();
  const [editing,setEditing] = useState(false);
  const [name,setName] = useState("");
  const [description,setDescription] = useState("");
  const [category,setCategory] = useState("");
  const [sectionTitle,setSectionTitle] = useState("");
  const [itemPrompt,setItemPrompt] = useState<Record<string,string>>({});
  const [itemType,setItemType] = useState<Record<string,string>>({});
  const [editingItemId,setEditingItemId] = useState<string | null>(null);
  const [editingItemPrompt,setEditingItemPrompt] = useState("");
  const [editingItemType,setEditingItemType] = useState("checkbox");
  const [editingSectionId,setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle,setEditingSectionTitle] = useState("");
  const [assignedTo,setAssignedTo] = useState("");
  const [unitId,setUnitId] = useState("");
  const [dueAt,setDueAt] = useState("");
  const [busy,setBusy] = useState(false);
  const actionLock = useRef(false);
  const canManage = ["owner", "manager"].includes(role.trim().toLowerCase());
  const canEditStructureBase = canManage && checklist?.status === "draft" && !hasExecution && assignments.length === 0;
  const canEditStructure = canEditStructureBase && !structureCheckError;
  const structureLockReason = structureCheckError
    ? "Estrutura bloqueada porque não foi possível confirmar atribuições ou histórico."
    : checklist?.status !== "draft"
    ? "Estrutura bloqueada porque o checklist não está em rascunho."
    : hasExecution
      ? "Estrutura bloqueada porque já existe uma execução ou histórico protegido."
      : assignments.length > 0
        ? "Estrutura bloqueada porque o checklist já foi atribuído."
        : "";

  const beginAction = () => {
    if (actionLock.current || !canManage) return false;
    actionLock.current = true;
    setBusy(true);
    setError("");
clearFeedback();
    return true;
  };
  const endAction = () => {
    actionLock.current = false;
    setBusy(false);
  };

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
    setStructureCheckError(false);
    const [{ data: membership }, { data: sectionData, error: sectionError }, { data: memberData }, { data: unitData }, { data: assignmentData, error: assignmentLoadError }, { data: executionData, error: executionLoadError }] = await Promise.all([
      supabase.from("organization_members").select("role").eq("organization_id", current.organization_id).eq("user_id", user.id).eq("active", true).maybeSingle(),
      supabase.from("checklist_sections").select("id,title,position,checklist_items(id,prompt,answer_type,required,position)").eq("checklist_id", checklistId).order("position"),
      supabase.from("organization_members").select("user_id,role").eq("organization_id", current.organization_id).eq("active", true),
      supabase.from("units").select("id,name").eq("organization_id", current.organization_id).eq("active", true).order("name"),
      supabase.from("checklist_assignments").select("id,assigned_to,unit_id,due_at,active").eq("checklist_id", checklistId).eq("active", true).order("created_at"),
      supabase.from("checklist_executions").select("id").eq("checklist_id", checklistId).limit(1),
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
    if (executionLoadError) setError(executionLoadError.message);
    setStructureCheckError(Boolean(assignmentLoadError || executionLoadError));
    setHasExecution(Boolean(executionData?.length));
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
    if (!checklist || !name.trim() || !beginAction()) return;
    try {
      const supabase = await initializeSupabaseBrowserClient();
      if (!supabase) { setError("Supabase não configurado."); return; }
      const { data, error: updateError } = await supabase.from("checklists").update({
        name: name.trim(), description: description.trim() || null, category: category.trim() || null,
      }).eq("id", checklist.id).eq("organization_id", checklist.organization_id).select("id").maybeSingle();
      if (updateError || !data) { setError(updateError?.message || "A alteração não foi persistida."); return; }
      setChecklist({...checklist,name:name.trim(),description:description.trim()||null,category:category.trim()||null});
      setEditing(false);
showFeedback("Checklist atualizado e confirmado no banco.");
    } finally { endAction(); }
  };

  const addSection = async () => {
    if (!sectionTitle.trim() || !checklist || !canEditStructure || !beginAction()) return;
    try {
      const supabase = await initializeSupabaseBrowserClient();
      if (!supabase) { setError("Supabase não configurado."); return; }
      const { data, error: insertError } = await supabase.from("checklist_sections").insert({
        organization_id: checklist.organization_id, checklist_id: checklist.id, title: sectionTitle.trim(),
        position: sections.length, created_by: userId,
      }).select("id").single();
      if (insertError || !data) { setError(insertError?.message || "A seção não foi persistida."); return; }
      setSectionTitle("");
      await load();
showFeedback("Seção adicionada.");
    } finally { endAction(); }
  };

  const addItem = async (sectionId:string) => {
    const prompt = itemPrompt[sectionId]?.trim();
    const section = sections.find(value=>value.id===sectionId);
    if (!prompt || !checklist || !section || !canEditStructure || !beginAction()) return;
    try {
      const supabase = await initializeSupabaseBrowserClient();
      if (!supabase) { setError("Supabase não configurado."); return; }
      const { data, error: insertError } = await supabase.from("checklist_items").insert({
        organization_id: checklist.organization_id, section_id: sectionId, prompt,
        answer_type: itemType[sectionId] || "checkbox",
        required: true,
        position: section.checklist_items.length,
        nonconformity_on_no: (itemType[sectionId] || "checkbox")==="yes_no",
        require_observation_on_failure: (itemType[sectionId] || "checkbox")==="yes_no",
        created_by: userId,
      }).select("id").single();
      if (insertError || !data) { setError(insertError?.message || "O item não foi persistido."); return; }
      setItemPrompt(current=>({...current,[sectionId]:""}));
      await load();
showFeedback("Item adicionado.");
    } finally { endAction(); }
  };

  const assign = async () => {
    if (!checklist || !assignedTo) { setError("Selecione um colaborador."); return; }
    if (!beginAction()) return;
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setError("Supabase não configurado."); endAction(); return; }
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
    if (existingError) { setError(existingError.message); endAction(); return; }
    let assignmentError = null;
    let reusedAssignment = false;
    if (existing && existing.length > 0) {
      const existingIds = existing.map(value=>value.id);
      const { data: executionRows, error: executionLookupError } = await supabase.from("checklist_executions")
        .select("assignment_id,status")
        .in("assignment_id", existingIds)
        .order("created_at", { ascending: false });
      if (executionLookupError) {
        setError(executionLookupError.message);
        endAction();
        return;
      }
      const executionsByAssignment = new Map<string,AssignmentExecution[]>();
      for (const execution of (executionRows || []) as AssignmentExecution[]) {
        const current = executionsByAssignment.get(execution.assignment_id) || [];
        executionsByAssignment.set(execution.assignment_id, [...current, execution]);
      }
      const reusableAssignment = existing.find(candidate => {
        const executions = executionsByAssignment.get(candidate.id) || [];
        return executions.length === 0 || executions.some(execution => execution.status === "in_progress" || execution.status === "paused");
      });
      if (reusableAssignment) {
        const { error: updateError } = await supabase.from("checklist_assignments").update(assignmentValues).eq("id", reusableAssignment.id);
        assignmentError = updateError;
        reusedAssignment = !assignmentError;
      }
    }
    if (!existing?.length || (!reusedAssignment && !assignmentError)) {
      const { error: insertError } = await supabase.from("checklist_assignments").insert({
        organization_id: checklist.organization_id, checklist_id: checklist.id, assigned_to: assignedTo,
        ...assignmentValues, created_by: userId,
      });
      assignmentError = insertError;
    }
    if (assignmentError) { setError(assignmentError.message); endAction(); return; }
showFeedback(reusedAssignment ? "Atribuição atualizada." : existing?.length ? "Nova atribuição criada." : "Checklist atribuído com sucesso.");
    setAssignedTo(""); setUnitId(""); setDueAt("");
    await load();
    endAction();
  };

  const startSectionEdit = (section:Section) => {
    if (!canEditStructure) return;
    setEditingSectionId(section.id);
    setEditingSectionTitle(section.title);
    setError("");
    clearFeedback();
  };

  const saveSection = async () => {
    if (!checklist || !editingSectionId || !editingSectionTitle.trim() || !canEditStructure || !beginAction()) return;
    try {
      const supabase = await initializeSupabaseBrowserClient();
      if (!supabase) { setError("Supabase não configurado."); return; }
      const { data, error: updateError } = await supabase.from("checklist_sections").update({
        title: editingSectionTitle.trim(),
      }).eq("id", editingSectionId).eq("organization_id", checklist.organization_id).eq("checklist_id", checklist.id).select("id").maybeSingle();
      if (updateError || !data) { setError(updateError?.message || "A seção não foi atualizada."); return; }
      setEditingSectionId(null);
      await load();
      showFeedback("Seção atualizada.");
    } finally { endAction(); }
  };

  const removeSection = async (section:Section) => {
    if (!checklist || !canEditStructure) return;
    const itemCount = section.checklist_items.length;
    const confirmation = itemCount > 0
      ? `Excluir a seção "${section.title}"? Os ${itemCount} item(ns) desta seção também serão removidos. Esta ação não afeta execuções ou histórico protegido.`
      : `Excluir a seção "${section.title}"?`;
    if (!window.confirm(confirmation) || !beginAction()) return;
    try {
      const supabase = await initializeSupabaseBrowserClient();
      if (!supabase) { setError("Supabase não configurado."); return; }
      const [{ data: currentAssignments, error: assignmentCheckError }, { data: currentExecutions, error: executionCheckError }] = await Promise.all([
        supabase.from("checklist_assignments").select("id").eq("organization_id", checklist.organization_id).eq("checklist_id", checklist.id).eq("active", true).limit(1),
        supabase.from("checklist_executions").select("id").eq("checklist_id", checklist.id).limit(1),
      ]);
      if (assignmentCheckError || executionCheckError) {
        setError("Não foi possível confirmar se a estrutura está protegida. A seção não foi removida.");
        return;
      }
      if (currentAssignments?.length || currentExecutions?.length) {
        setError("A seção não pode ser removida porque o checklist já foi atribuído ou possui execução/histórico protegido.");
        await load();
        return;
      }
      const { data, error: deleteError } = await supabase.from("checklist_sections").delete()
        .eq("id", section.id).eq("organization_id", checklist.organization_id).eq("checklist_id", checklist.id).select("id").maybeSingle();
      if (deleteError || !data) { setError(deleteError?.message || "A seção não foi removida."); return; }
      await load();
      showFeedback("Seção removida.");
    } finally { endAction(); }
  };

  const startItemEdit = (item:Item) => {
    if (!canEditStructure) return;
    setEditingItemId(item.id);
    setEditingItemPrompt(item.prompt);
    setEditingItemType(item.answer_type);
    setError("");
    clearFeedback();
  };

  const saveItem = async () => {
    if (!checklist || !editingItemId || !editingItemPrompt.trim() || !canEditStructure || !beginAction()) return;
    try {
      const supabase = await initializeSupabaseBrowserClient();
      if (!supabase) { setError("Supabase não configurado."); return; }
      const { data, error: updateError } = await supabase.from("checklist_items").update({
        prompt: editingItemPrompt.trim(), answer_type: editingItemType,
        nonconformity_on_no: editingItemType === "yes_no",
        require_observation_on_failure: editingItemType === "yes_no",
      }).eq("id", editingItemId).eq("organization_id", checklist.organization_id).select("id").maybeSingle();
      if (updateError || !data) { setError(updateError?.message || "O item não foi atualizado."); return; }
      setEditingItemId(null);
      await load();
showFeedback("Item atualizado.");
    } finally { endAction(); }
  };

  const removeItem = async (item:Item) => {
    if (!checklist || !canEditStructure || !window.confirm(`Remover o item \"${item.prompt}\"?` ) || !beginAction()) return;
    try {
      const supabase = await initializeSupabaseBrowserClient();
      if (!supabase) { setError("Supabase não configurado."); return; }
      const { data, error: deleteError } = await supabase.from("checklist_items").delete()
        .eq("id", item.id).eq("organization_id", checklist.organization_id).select("id").maybeSingle();
      if (deleteError || !data) { setError(deleteError?.message || "O item não foi removido."); return; }
      await load();
showFeedback("Item removido.");
    } finally { endAction(); }
  };

  return <main className="detail-page">
    <PrivateRouteGuard />
    <button className="back-link" onClick={()=>{window.location.href="/"}}>← Voltar para a lista</button>
    {loading&&<section className="detail-card"><p>Carregando checklist...</p></section>}
    {!loading&&error&&!checklist&&<section className="detail-card detail-error"><h1>Acesso indisponível</h1><p>{error}</p><button className="secondary" onClick={load}>Tentar novamente</button></section>}
    {!loading&&checklist&&<div className="detail-layout">
      <section>
        <article className="detail-card">
          <div className="detail-heading">
            <div><span className="segment">{checklist.category || "Sem categoria"}</span><h1>{checklist.name}</h1><p>{checklist.description || "Sem descrição."}</p></div>
            {canManage&&<button className="secondary" onClick={()=>setEditing(!editing)}>{editing?"Cancelar":"Editar"}</button>}
          </div>
          {editing&&<div className="edit-form"><label>Nome<input value={name} onChange={event=>setName(event.target.value)}/></label><label>Descrição<textarea value={description} onChange={event=>setDescription(event.target.value)}/></label><label>Categoria<input value={category} onChange={event=>setCategory(event.target.value)}/></label><button className="primary" disabled={!name.trim()||busy} onClick={saveChecklist}>{busy?"Salvando...":"Salvar alterações"}</button></div>}
        </article>
        <article className="detail-card">
          <div className="detail-heading"><div><h2>Seções e itens</h2><p>Conteúdo atual deste checklist.</p></div></div>
          {sections.length===0&&<p className="empty-state">Nenhuma seção cadastrada.</p>}
          {sections.map(section=><div className="checklist-section" key={section.id}>
            <div className="section-heading">
              {editingSectionId===section.id
                ? <div className="section-edit-form"><input aria-label="Nome da seção" value={editingSectionTitle} disabled={busy} onChange={event=>setEditingSectionTitle(event.target.value)}/><button className="secondary" disabled={busy||!editingSectionTitle.trim()} onClick={saveSection}>Salvar seção</button><button className="secondary" disabled={busy} onClick={()=>setEditingSectionId(null)}>Cancelar</button></div>
                : <h3>{section.title}</h3>}
              {canManage&&editingSectionId!==section.id&&<div className="section-actions" aria-label={`Ações da seção ${section.title}`}><button type="button" className="section-action-button" disabled={busy||!canEditStructure} title={structureLockReason} aria-label={`Renomear seção ${section.title}`} onClick={()=>startSectionEdit(section)}>Renomear</button><button type="button" className="section-action-button danger-link" disabled={busy||!canEditStructure} title={structureLockReason} aria-label={`Excluir seção ${section.title}`} onClick={()=>removeSection(section)}>Excluir</button></div>}
            </div>
            {section.checklist_items.length===0&&<p className="empty-state">Nenhum item nesta seção.</p>}
            {section.checklist_items.map(item=><div className="checklist-item" key={item.id}><span className="item-check item-unanswered" aria-label="Item ainda não executado"></span>{editingItemId===item.id?<div className="item-edit-form"><input aria-label="Texto do item" value={editingItemPrompt} disabled={busy} onChange={event=>setEditingItemPrompt(event.target.value)}/><select aria-label="Tipo do item" value={editingItemType} disabled={busy} onChange={event=>setEditingItemType(event.target.value)}><option value="checkbox">Checkbox</option><option value="yes_no">Sim ou não</option><option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="number">Número</option><option value="date">Data</option><option value="time">Horário</option><option value="photo">Fotografia</option><option value="rating">Avaliação 0 a 10</option></select><button className="secondary" disabled={busy||!editingItemPrompt.trim()} onClick={saveItem}>Salvar item</button><button className="secondary" disabled={busy} onClick={()=>setEditingItemId(null)}>Cancelar</button></div>:<><span><strong>{item.prompt}</strong><small>{item.required?"Obrigatório":"Opcional"} · {item.answer_type}</small></span>{canEditStructure&&<span className="item-actions"><button type="button" className="text-link" onClick={()=>startItemEdit(item)}>Editar item</button><button type="button" className="text-link danger-link" onClick={()=>removeItem(item)}>Remover</button></span>}</>}</div>)}
            {canManage&&<div className="inline-create item-create"><input value={itemPrompt[section.id]||""} disabled={busy} onChange={event=>setItemPrompt(current=>({...current,[section.id]:event.target.value}))} placeholder="Novo item obrigatório"/><select value={itemType[section.id]||"checkbox"} disabled={busy} onChange={event=>setItemType(current=>({...current,[section.id]:event.target.value}))} aria-label="Tipo de resposta"><option value="checkbox">Checkbox</option><option value="yes_no">Sim ou não</option><option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="number">Número</option><option value="date">Data</option><option value="time">Horário</option><option value="photo">Fotografia</option><option value="rating">Avaliação 0 a 10</option></select><button className="secondary" disabled={busy||!itemPrompt[section.id]?.trim()} onClick={()=>addItem(section.id)}>{busy?"Salvando...":"Adicionar item"}</button></div>}
            {canManage&&!canEditStructure&&<p className="structure-lock">{structureLockReason}</p>}
          </div>)}
          {canManage&&<div className="inline-create section-create"><input value={sectionTitle} disabled={busy} onChange={event=>setSectionTitle(event.target.value)} placeholder="Nome da nova seção"/><button className="secondary" disabled={busy||!sectionTitle.trim()} onClick={addSection}>{busy?"Salvando...":"Adicionar seção"}</button></div>}
        </article>
      </section>
      {canManage&&<aside className="detail-card assignment-card"><h2>Atribuir checklist</h2><p>Defina o colaborador e, se necessário, unidade e prazo.</p><label>Colaborador<select disabled={busy} value={assignedTo} onChange={event=>setAssignedTo(event.target.value)}><option value="">Selecione</option>{members.filter(member=>member.role==="collaborator").map(member=><option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</select></label><label>Unidade<select disabled={busy} value={unitId} onChange={event=>setUnitId(event.target.value)}><option value="">Sem unidade</option>{units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label>Prazo<input disabled={busy} type="datetime-local" value={dueAt} onChange={event=>setDueAt(event.target.value)}/></label><button className="primary" disabled={busy||!assignedTo} onClick={assign}>{busy?"Salvando...":"Atribuir ao colaborador"}</button><div className="current-assignments"><h3>Atribuições atuais</h3>{assignments.length===0&&<p>Nenhum colaborador atribuído.</p>}{assignments.map(assignment=><div className="assignment-row" key={assignment.id}><span className="assignment-avatar">{assignment.collaborator_name.slice(0,2).toUpperCase()}</span><span><strong>{assignment.collaborator_name}</strong><small>{assignment.unit_name || "Sem unidade"}{assignment.due_at?` · ${new Date(assignment.due_at).toLocaleString("pt-BR")}`:" · sem prazo"}</small></span></div>)}</div></aside>}
    </div>}
    {error&&checklist&&<p className="detail-message error">{error}</p>}
<FeedbackMessage feedback={feedback} onClose={clearFeedback}/>
  </main>;
}
