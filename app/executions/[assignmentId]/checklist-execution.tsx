"use client";

import { useEffect, useMemo, useState } from "react";
import { PrivateRouteGuard } from "../../private-route-guard";
import { initializeSupabaseBrowserClient } from "../../../lib/supabase";

type Assignment = {
  id: string;
  organization_id: string;
  checklist_id: string;
  unit_id: string | null;
  due_at: string | null;
  assigned_to: string;
};
type Checklist = { id: string; name: string; description: string | null; category: string | null };
type Item = { id: string; prompt: string; answer_type: string; required: boolean; position: number };
type Section = { id: string; title: string; position: number; checklist_items: Item[] };
type Execution = { id: string; status: "in_progress" | "paused" | "completed"; started_at: string; completed_at?: string | null };
type AnswerValue = boolean | string | number | null;

export default function ChecklistExecution({ assignmentId }: { assignmentId: string }) {
  const [assignment,setAssignment] = useState<Assignment | null>(null);
  const [checklist,setChecklist] = useState<Checklist | null>(null);
  const [sections,setSections] = useState<Section[]>([]);
  const [execution,setExecution] = useState<Execution | null>(null);
  const [answers,setAnswers] = useState<Record<string,AnswerValue>>({});
  const [userId,setUserId] = useState("");
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const items = useMemo(()=>sections.flatMap(section=>section.checklist_items),[sections]);
  const answeredCount = items.filter(item => {
    const value = answers[item.id];
    return value !== undefined && value !== null && value !== "";
  }).length;
  const progress = items.length ? Math.round(answeredCount / items.length * 100) : 0;
  const requiredMissing = items.filter(item => {
    if (!item.required) return false;
    const value = answers[item.id];
    return value === undefined || value === null || value === "";
  });

  const load = async () => {
    setLoading(true);
    setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setError("Supabase não configurado."); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sessão não encontrada."); setLoading(false); return; }
    setUserId(user.id);
    const { data: assignmentRecord, error: assignmentError } = await supabase
      .from("checklist_assignments")
      .select("id,organization_id,checklist_id,unit_id,due_at,assigned_to")
      .eq("id", assignmentId)
      .eq("assigned_to", user.id)
      .eq("active", true)
      .maybeSingle();
    if (assignmentError || !assignmentRecord) {
      setError(assignmentError?.message || "Checklist não atribuído a este usuário.");
      setLoading(false);
      return;
    }
    const currentAssignment = assignmentRecord as Assignment;
    setAssignment(currentAssignment);
    const [{ data: checklistRecord, error: checklistError }, { data: sectionData, error: sectionError }, { data: executionData, error: executionError }] = await Promise.all([
      supabase.from("checklists").select("id,name,description,category").eq("id", currentAssignment.checklist_id).maybeSingle(),
      supabase.from("checklist_sections").select("id,title,position,checklist_items(id,prompt,answer_type,required,position)").eq("checklist_id", currentAssignment.checklist_id).order("position"),
      supabase.from("checklist_executions").select("id,status,started_at,completed_at").eq("assignment_id", assignmentId).eq("executor_id", user.id).in("status", ["in_progress","paused","completed"]).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (checklistError || !checklistRecord) setError(checklistError?.message || "Checklist não encontrado.");
    else setChecklist(checklistRecord as Checklist);
    if (sectionError) setError(sectionError.message);
    setSections(((sectionData || []) as Section[]).map(section=>({
      ...section,
      checklist_items:[...(section.checklist_items||[])].sort((a,b)=>a.position-b.position),
    })));
    if (executionError) setError(executionError.message);
    if (executionData) {
      setExecution(executionData as Execution);
      const { data: answerData, error: answerError } = await supabase
        .from("execution_answers")
        .select("item_id,value")
        .eq("execution_id", executionData.id);
      if (answerError) setError(answerError.message);
      else setAnswers(Object.fromEntries((answerData || []).map(answer=>[answer.item_id,answer.value as AnswerValue])));
    }
    setLoading(false);
  };

  useEffect(()=>{
    // A consulta assíncrona sincroniza a rota com a atribuição permitida pelo RLS.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  },[assignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startExecution = async () => {
    if (!assignment) return;
    setBusy(true); setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setBusy(false); return; }
    const { data, error: startError } = await supabase.from("checklist_executions").insert({
      organization_id: assignment.organization_id,
      assignment_id: assignment.id,
      checklist_id: assignment.checklist_id,
      unit_id: assignment.unit_id,
      executor_id: userId,
      status: "in_progress",
      created_by: userId,
    }).select("id,status,started_at,completed_at").single();
    if (startError) setError(startError.message);
    else { setExecution(data as Execution); setNotice("Execução iniciada."); }
    setBusy(false);
  };

  const setExecutionStatus = async (status:"paused"|"in_progress") => {
    if (!execution) return;
    setBusy(true); setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setBusy(false); return; }
    const { error: statusError } = await supabase.from("checklist_executions").update({
      status,
      paused_at: status==="paused" ? new Date().toISOString() : null,
    }).eq("id", execution.id);
    if (statusError) setError(statusError.message);
    else {
      setExecution({...execution,status});
      setNotice(status==="paused"?"Execução pausada. Suas respostas foram preservadas.":"Execução retomada.");
    }
    setBusy(false);
  };

  const saveAnswer = async (itemId:string,value:AnswerValue) => {
    if (!execution || !assignment || execution.status==="completed") return;
    setAnswers(current=>({...current,[itemId]:value}));
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) return;
    const { error: answerError } = await supabase.from("execution_answers").upsert({
      organization_id: assignment.organization_id,
      execution_id: execution.id,
      item_id: itemId,
      value,
      answered_at: new Date().toISOString(),
      created_by: userId,
    }, { onConflict: "execution_id,item_id" });
    if (answerError) setError(answerError.message);
    else setNotice("Resposta salva.");
  };

  const finishExecution = async () => {
    if (!execution || execution.status==="completed") return;
    if (requiredMissing.length > 0) {
      setError(`Responda os ${requiredMissing.length} item(ns) obrigatório(s) pendente(s).`);
      return;
    }
    setBusy(true); setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setBusy(false); return; }
    const conformingCount = items.filter(item => {
      const value = answers[item.id];
      if (item.answer_type==="checkbox") return value===true;
      if (item.answer_type==="yes_no") return value==="Sim";
      return value !== undefined && value !== null && value !== "";
    }).length;
    const conformity = items.length ? Number((conformingCount / items.length * 100).toFixed(2)) : 100;
    const completedAt = new Date().toISOString();
    const { error: completionError } = await supabase.from("checklist_executions").update({
      status: "completed",
      completed_at: completedAt,
      conformity_percentage: conformity,
      summary: { total_items: items.length, answered_items: answeredCount, required_complete: true },
    }).eq("id", execution.id);
    if (completionError) setError(completionError.message);
    else {
      setExecution({...execution,status:"completed",completed_at:completedAt});
      setNotice("Checklist finalizado com sucesso.");
    }
    setBusy(false);
  };

  const answerField = (item:Item) => {
    const value = answers[item.id];
    const readOnly = execution?.status==="paused" || execution?.status==="completed";
    if (item.answer_type==="checkbox") return <label className="mobile-check"><input type="checkbox" checked={value===true} disabled={readOnly} onChange={event=>saveAnswer(item.id,event.target.checked)}/><span>{value===true?"Concluído":"Marcar como concluído"}</span></label>;
    if (item.answer_type==="yes_no") return <select value={String(value??"")} disabled={readOnly} onChange={event=>saveAnswer(item.id,event.target.value)}><option value="">Selecione</option><option value="Sim">Sim</option><option value="Não">Não</option></select>;
    if (item.answer_type==="long_text") return <textarea defaultValue={String(value??"")} disabled={readOnly} placeholder="Digite sua resposta" onBlur={event=>saveAnswer(item.id,event.target.value)}/>;
    const inputType = item.answer_type==="number"?"number":item.answer_type==="date"?"date":item.answer_type==="time"?"time":"text";
    return <input type={inputType} defaultValue={String(value??"")} disabled={readOnly} placeholder="Digite sua resposta" onBlur={event=>saveAnswer(item.id,item.answer_type==="number"&&event.target.value?Number(event.target.value):event.target.value)}/>;
  };

  return <main className="execution-page">
    <PrivateRouteGuard />
    <header className="execution-header"><button className="back-link" onClick={()=>{window.location.href="/"}}>← Minhas tarefas</button>{execution&&<span className={`execution-status ${execution.status}`}>{execution.status==="paused"?"Pausado":execution.status==="completed"?"Finalizado":"Em execução"}</span>}</header>
    {loading&&<section className="execution-card"><p>Carregando checklist...</p></section>}
    {!loading&&error&&!assignment&&<section className="execution-card detail-error"><h1>Acesso indisponível</h1><p>{error}</p></section>}
    {!loading&&assignment&&checklist&&<div className="execution-shell">
      <section className="execution-card execution-summary">
        <span className="segment">{checklist.category || "Checklist operacional"}</span>
        <h1>{checklist.name}</h1>
        <p>{checklist.description || "Siga os itens abaixo e registre cada etapa."}</p>
        <div className="progress-label"><span>Progresso</span><strong>{progress}%</strong></div>
        <div className="progress-track"><i style={{width:`${progress}%`}}/></div>
        {assignment.due_at&&<small>Prazo: {new Date(assignment.due_at).toLocaleString("pt-BR")}</small>}
      </section>
      {!execution?<section className="execution-card start-card"><h2>Pronto para começar?</h2><p>O horário de início e sua identificação serão registrados.</p><button className="primary" disabled={busy||items.length===0} onClick={startExecution}>{busy?"Iniciando...":"Iniciar checklist"}</button>{items.length===0&&<small>Este checklist ainda não possui itens.</small>}</section>:<>
        {execution.status!=="completed"&&<div className="execution-actions"><button className="secondary" disabled={busy} onClick={()=>setExecutionStatus(execution.status==="paused"?"in_progress":"paused")}>{execution.status==="paused"?"Continuar checklist":"Pausar"}</button><span>Iniciado em {new Date(execution.started_at).toLocaleString("pt-BR")}</span></div>}
        {execution.status==="completed"&&<section className="execution-card completion-card"><span>✓</span><div><h2>Checklist finalizado</h2><p>Concluído em {new Date(execution.completed_at||execution.started_at).toLocaleString("pt-BR")}.</p></div></section>}
        {sections.map(section=><section className="execution-card execution-section" key={section.id}><h2>{section.title}</h2>{section.checklist_items.map((item,index)=><article className="execution-item" key={item.id}><div className="item-number">{index+1}</div><div><label>{item.prompt}{item.required&&<em>Obrigatório</em>}</label>{answerField(item)}</div></article>)}</section>)}
        {execution.status!=="completed"&&<section className="execution-card finish-card"><button className="primary" disabled={busy||requiredMissing.length>0||execution.status==="paused"} onClick={finishExecution}>{busy?"Finalizando...":"Finalizar checklist"}</button>{requiredMissing.length>0&&<p>{requiredMissing.length} item(ns) obrigatório(s) ainda pendente(s).</p>}</section>}
      </>}
    </div>}
    {error&&assignment&&<p className="detail-message error">{error}</p>}
    {notice&&<p className="detail-message">{notice}</p>}
  </main>;
}
