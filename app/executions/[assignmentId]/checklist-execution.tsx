"use client";
/* eslint-disable @next/next/no-img-element -- signed private evidence URLs must not pass through the public image optimizer */

import { useEffect, useMemo, useRef, useState } from "react";
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
type Item = {
  id: string;
  prompt: string;
  answer_type: string;
  required: boolean;
  position: number;
  options?: unknown;
  nonconformity_on_no?: boolean;
  require_observation_on_failure?: boolean;
};
type Section = { id: string; title: string; position: number; checklist_items: Item[] };
type Execution = { id: string; status: "in_progress" | "paused" | "completed"; started_at: string; completed_at?: string | null };
type AnswerValue = boolean | string | number | null;

export default function ChecklistExecution({ assignmentId }: { assignmentId: string }) {
  const [assignment,setAssignment] = useState<Assignment | null>(null);
  const [checklist,setChecklist] = useState<Checklist | null>(null);
  const [sections,setSections] = useState<Section[]>([]);
  const [execution,setExecution] = useState<Execution | null>(null);
  const [answers,setAnswers] = useState<Record<string,AnswerValue>>({});
  const [observations,setObservations] = useState<Record<string,string>>({});
  const [nonConformityItems,setNonConformityItems] = useState<string[]>([]);
  const [userId,setUserId] = useState("");
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [savingItems,setSavingItems] = useState<string[]>([]);
  const [photoUrls,setPhotoUrls] = useState<Record<string,string>>({});
  const actionLock = useRef(false);
  const items = useMemo(()=>sections.flatMap(section=>section.checklist_items),[sections]);
  const answeredCount = items.filter(item => {
    const value = answers[item.id];
    return value !== undefined && value !== null && value !== "";
  }).length;
  const progress = items.length ? Math.round(answeredCount / items.length * 100) : 0;
  const requiredMissing = items.filter(item => {
    if (!item.required) return false;
    const value = answers[item.id];
    if (value === undefined || value === null || value === "") return true;
    return item.answer_type==="yes_no" && value==="Não" &&
      (!observations[item.id]?.trim() || !nonConformityItems.includes(item.id));
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
      supabase.from("checklist_sections").select("id,title,position,checklist_items(id,prompt,answer_type,required,position,options,nonconformity_on_no,require_observation_on_failure)").eq("checklist_id", currentAssignment.checklist_id).order("position"),
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
        .select("item_id,value,observation")
        .eq("execution_id", executionData.id);
      if (answerError) setError(answerError.message);
      else {
        setAnswers(Object.fromEntries((answerData || []).map(answer=>[answer.item_id,answer.value as AnswerValue])));
        setObservations(Object.fromEntries((answerData || []).map(answer=>[answer.item_id,answer.observation || ""])));
        const photoAnswers = (answerData || []).filter(answer=>typeof answer.value==="string" && answer.value);
        const signedEntries = await Promise.all(photoAnswers.map(async answer => {
          const { data: signed } = await supabase.storage.from("checkflow-evidence").createSignedUrl(answer.value as string, 3600);
          return signed?.signedUrl ? [answer.item_id,signed.signedUrl] as const : null;
        }));
        setPhotoUrls(Object.fromEntries(signedEntries.filter((entry): entry is readonly [string,string]=>Boolean(entry))));
      }
      const { data: occurrences, error: occurrenceError } = await supabase
        .from("non_conformities")
        .select("item_id")
        .eq("execution_id", executionData.id);
      if (occurrenceError) setError(occurrenceError.message);
      else setNonConformityItems((occurrences || []).map(occurrence=>occurrence.item_id));
    }
    setLoading(false);
  };

  useEffect(()=>{
    // A consulta assíncrona sincroniza a rota com a atribuição permitida pelo RLS.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  },[assignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startExecution = async () => {
    if (!assignment || actionLock.current) return;
    actionLock.current = true;
    setBusy(true); setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setBusy(false); actionLock.current = false; return; }
    const { data: existing } = await supabase.from("checklist_executions")
      .select("id,status,started_at,completed_at")
      .eq("assignment_id", assignment.id)
      .eq("executor_id", userId)
      .in("status", ["in_progress","paused"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      setExecution(existing as Execution);
      setNotice("Execução existente recuperada.");
      setBusy(false);
      actionLock.current = false;
      return;
    }
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
    actionLock.current = false;
  };

  const setExecutionStatus = async (status:"paused"|"in_progress") => {
    if (!execution || actionLock.current) return;
    actionLock.current = true;
    setBusy(true); setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setBusy(false); actionLock.current = false; return; }
    const { data, error: statusError } = await supabase.from("checklist_executions").update({
      status,
      paused_at: status==="paused" ? new Date().toISOString() : null,
    }).eq("id", execution.id).select("id").maybeSingle();
    if (statusError || !data) setError(statusError?.message || "A alteração de status não foi persistida.");
    else {
      setExecution({...execution,status});
      setNotice(status==="paused"?"Execução pausada. Suas respostas foram preservadas.":"Execução retomada.");
    }
    setBusy(false);
    actionLock.current = false;
  };

  const saveAnswer = async (itemId:string,value:AnswerValue,metadata?:{observation?:string;isConforming?:boolean}) => {
    if (!execution || !assignment || execution.status!=="in_progress" || savingItems.includes(itemId)) return;
    setSavingItems(current=>[...current,itemId]);
    setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setSavingItems(current=>current.filter(id=>id!==itemId)); setError("Supabase não configurado."); return; }
    const { data, error: answerError } = await supabase.from("execution_answers").upsert({
      organization_id: assignment.organization_id,
      execution_id: execution.id,
      item_id: itemId,
      value,
      observation: metadata?.observation ?? null,
      is_conforming: metadata?.isConforming ?? null,
      answered_at: new Date().toISOString(),
      created_by: userId,
    }, { onConflict: "execution_id,item_id" }).select("id").maybeSingle();
    if (answerError || !data) setError(answerError?.message || "A resposta não foi persistida. Tente novamente.");
    else {
      setAnswers(current=>({...current,[itemId]:value}));
      setNotice("Resposta salva.");
    }
    setSavingItems(current=>current.filter(id=>id!==itemId));
  };

  const saveNonConformity = async (item:Item) => {
    if (!execution || !assignment || execution.status!=="in_progress" || savingItems.includes(item.id)) return;
    const observation = observations[item.id]?.trim();
    if (!observation) {
      setError("Informe a observação antes de registrar a não conformidade.");
      return;
    }
    setSavingItems(current=>[...current,item.id]);
    setError("");
    setNotice("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) {
      setSavingItems(current=>current.filter(id=>id!==item.id));
      setError("Supabase não configurado.");
      return;
    }
    const { data:answer,error:answerError } = await supabase.from("execution_answers").upsert({
      organization_id:assignment.organization_id,
      execution_id:execution.id,
      item_id:item.id,
      value:"Não",
      observation,
      is_conforming:false,
      answered_at:new Date().toISOString(),
      created_by:userId,
    },{onConflict:"execution_id,item_id"}).select("id").single();
    if (answerError || !answer) {
      setSavingItems(current=>current.filter(id=>id!==item.id));
      setError(answerError?.message || "A resposta não conforme não foi persistida.");
      return;
    }
    const { data:existing,error:lookupError } = await supabase.from("non_conformities")
      .select("id")
      .eq("execution_id",execution.id)
      .eq("item_id",item.id)
      .limit(1)
      .maybeSingle();
    if (lookupError) {
      setSavingItems(current=>current.filter(id=>id!==item.id));
      setError(lookupError.message);
      return;
    }
    const occurrenceOperation = existing
      ? supabase.from("non_conformities").update({observation,answer_id:answer.id}).eq("id",existing.id).select("id").single()
      : supabase.from("non_conformities").insert({
          organization_id:assignment.organization_id,
          execution_id:execution.id,
          answer_id:answer.id,
          item_id:item.id,
          unit_id:assignment.unit_id,
          executor_id:userId,
          observation,
          priority:"medium",
          status:"open",
          created_by:userId,
        }).select("id").single();
    const { error:occurrenceError } = await occurrenceOperation;
    if (occurrenceError) setError(occurrenceError.message || "A ocorrência não foi registrada.");
    else {
      setAnswers(current=>({...current,[item.id]:"Não"}));
      setNonConformityItems(current=>current.includes(item.id)?current:[...current,item.id]);
      setNotice(existing?"Não conformidade atualizada.":"Não conformidade registrada automaticamente.");
    }
    setSavingItems(current=>current.filter(id=>id!==item.id));
  };

  const uploadPhoto = async (itemId:string,file:File | null) => {
    if (!file || !execution || !assignment || execution.status!=="in_progress" || savingItems.includes(itemId)) return;
    const allowedTypes:Record<string,string> = {
      "image/jpeg":"jpg",
      "image/png":"png",
      "image/webp":"webp",
    };
    const extension = allowedTypes[file.type];
    if (!extension) {
      setError("Formato inválido. Envie uma foto JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("A fotografia deve ter no máximo 10 MB.");
      return;
    }
    setSavingItems(current=>[...current,itemId]);
    setError("");
    setNotice("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) {
      setSavingItems(current=>current.filter(id=>id!==itemId));
      setError("Supabase não configurado.");
      return;
    }
    const storagePath = `${assignment.organization_id}/${execution.id}/${itemId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("checkflow-evidence").upload(storagePath,file,{
      contentType:file.type,
      upsert:false,
      cacheControl:"3600",
    });
    if (uploadError) {
      setSavingItems(current=>current.filter(id=>id!==itemId));
      setError(uploadError.message || "Não foi possível enviar a fotografia.");
      return;
    }
    const { data: answer, error: answerError } = await supabase.from("execution_answers").upsert({
      organization_id:assignment.organization_id,
      execution_id:execution.id,
      item_id:itemId,
      value:storagePath,
      answered_at:new Date().toISOString(),
      created_by:userId,
    },{onConflict:"execution_id,item_id"}).select("id").single();
    if (answerError || !answer) {
      await supabase.storage.from("checkflow-evidence").remove([storagePath]);
      setSavingItems(current=>current.filter(id=>id!==itemId));
      setError(answerError?.message || "A fotografia foi enviada, mas a resposta não foi vinculada.");
      return;
    }
    const { error: attachmentError } = await supabase.from("attachments").insert({
      organization_id:assignment.organization_id,
      execution_id:execution.id,
      answer_id:answer.id,
      storage_path:storagePath,
      file_name:file.name,
      mime_type:file.type,
      size_bytes:file.size,
      created_by:userId,
    });
    if (attachmentError) {
      setSavingItems(current=>current.filter(id=>id!==itemId));
      setError(`A fotografia foi salva, mas o registro da evidência falhou: ${attachmentError.message}`);
      return;
    }
    const { data:signed } = await supabase.storage.from("checkflow-evidence").createSignedUrl(storagePath,3600);
    setAnswers(current=>({...current,[itemId]:storagePath}));
    if (signed?.signedUrl) setPhotoUrls(current=>({...current,[itemId]:signed.signedUrl}));
    setSavingItems(current=>current.filter(id=>id!==itemId));
    setNotice("Fotografia salva e vinculada à execução.");
  };

  const finishExecution = async () => {
    if (!execution || execution.status==="completed" || actionLock.current) return;
    if (savingItems.length > 0) {
      setError("Aguarde o salvamento das respostas antes de finalizar.");
      return;
    }
    if (requiredMissing.length > 0) {
      setError(`Responda os ${requiredMissing.length} item(ns) obrigatório(s) pendente(s).`);
      return;
    }
    actionLock.current = true;
    setBusy(true); setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setBusy(false); actionLock.current = false; return; }
    const conformingCount = items.filter(item => {
      const value = answers[item.id];
      if (item.answer_type==="checkbox") return value===true;
      if (item.answer_type==="yes_no") return value==="Sim";
      return value !== undefined && value !== null && value !== "";
    }).length;
    const conformity = items.length ? Number((conformingCount / items.length * 100).toFixed(2)) : 100;
    const completedAt = new Date().toISOString();
    const { data, error: completionError } = await supabase.from("checklist_executions").update({
      status: "completed",
      completed_at: completedAt,
      conformity_percentage: conformity,
      summary: { total_items: items.length, answered_items: answeredCount, required_complete: true },
    }).eq("id", execution.id).select("id").maybeSingle();
    if (completionError || !data) setError(completionError?.message || "A conclusão não foi persistida.");
    else {
      setExecution({...execution,status:"completed",completed_at:completedAt});
      setNotice("Checklist finalizado com sucesso.");
    }
    setBusy(false);
    actionLock.current = false;
  };

  const answerField = (item:Item) => {
    const value = answers[item.id];
    const readOnly = execution?.status!=="in_progress" || savingItems.includes(item.id);
    if (item.answer_type==="checkbox") return <label className="mobile-check"><input type="checkbox" checked={value===true} disabled={readOnly} onChange={event=>saveAnswer(item.id,event.target.checked)}/><span>{savingItems.includes(item.id)?"Salvando...":value===true?"Concluído":"Marcar como concluído"}</span></label>;
    if (item.answer_type==="yes_no") {
      const isFailure = value==="Não";
      const occurrenceSaved = nonConformityItems.includes(item.id);
      return <div className="conditional-answer">
        <select value={String(value??"")} disabled={readOnly} onChange={event=>{
          const nextValue=event.target.value;
          if (nextValue==="Não") {
            setAnswers(current=>({...current,[item.id]:"Não"}));
            setNotice("");
          } else {
            void saveAnswer(item.id,nextValue,{isConforming:nextValue==="Sim"});
          }
        }}><option value="">Selecione</option><option value="Sim">Sim</option><option value="Não">Não</option></select>
        {isFailure&&<div className="failure-details">
          <label htmlFor={`observation-${item.id}`}>Observação da não conformidade <em>Obrigatória</em></label>
          <textarea id={`observation-${item.id}`} value={observations[item.id]||""} disabled={readOnly} placeholder="Descreva o que foi encontrado" onChange={event=>setObservations(current=>({...current,[item.id]:event.target.value}))}/>
          <button type="button" className="secondary" disabled={readOnly||!observations[item.id]?.trim()} onClick={()=>saveNonConformity(item)}>{savingItems.includes(item.id)?"Salvando...":occurrenceSaved?"Atualizar ocorrência":"Registrar não conformidade"}</button>
          {occurrenceSaved&&<small>Ocorrência registrada e visível para a gestão.</small>}
        </div>}
      </div>;
    }
    if (item.answer_type==="rating") return <select value={String(value??"")} disabled={readOnly} onChange={event=>saveAnswer(item.id,Number(event.target.value))}><option value="">Selecione de 0 a 10</option>{Array.from({length:11},(_,index)=><option key={index} value={index}>{index}</option>)}</select>;
    if (item.answer_type==="single_select") {
      const options = Array.isArray(item.options) ? item.options.filter(option=>typeof option==="string") as string[] : [];
      return <select value={String(value??"")} disabled={readOnly} onChange={event=>saveAnswer(item.id,event.target.value)}><option value="">Selecione</option>{options.map(option=><option key={option} value={option}>{option}</option>)}</select>;
    }
    if (item.answer_type==="photo") return <div className="photo-answer">{photoUrls[item.id]&&<img src={photoUrls[item.id]} alt={`Evidência de ${item.prompt}`}/>}<label className={`photo-upload ${readOnly?"disabled":""}`}><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={readOnly} onChange={event=>uploadPhoto(item.id,event.target.files?.[0]||null)}/><span>{savingItems.includes(item.id)?"Enviando fotografia...":photoUrls[item.id]?"Fotografia enviada":"Tirar ou escolher fotografia"}</span></label><small>JPG, PNG ou WebP · máximo de 10 MB</small></div>;
    if (item.answer_type==="long_text") return <textarea defaultValue={String(value??"")} disabled={readOnly} placeholder="Digite sua resposta" onBlur={event=>event.target.value!==String(value??"")&&saveAnswer(item.id,event.target.value)}/>;
    const inputType = item.answer_type==="number"?"number":item.answer_type==="date"?"date":item.answer_type==="time"?"time":"text";
    return <input type={inputType} defaultValue={String(value??"")} disabled={readOnly} placeholder="Digite sua resposta" onBlur={event=>event.target.value!==String(value??"")&&saveAnswer(item.id,item.answer_type==="number"&&event.target.value?Number(event.target.value):event.target.value)}/>;
  };

  return <main className="execution-page">
    <PrivateRouteGuard />
    <header className="execution-header"><button className="back-link" onClick={()=>{window.location.href="/"}}>← Minhas tarefas</button>{execution&&<span className={`execution-status ${execution.status}`}>{execution.status==="paused"?"Pausado":execution.status==="completed"?"Finalizado":"Em execução"}</span>}</header>
    {loading&&<section className="execution-card"><p>Carregando checklist...</p></section>}
    {!loading&&error&&!assignment&&<section className="execution-card detail-error"><h1>Acesso indisponível</h1><p>{error}</p><button className="secondary" onClick={load}>Tentar novamente</button></section>}
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
        {execution.status!=="completed"&&<section className="execution-card finish-card"><button className="primary" disabled={busy||savingItems.length>0||requiredMissing.length>0||execution.status==="paused"} onClick={finishExecution}>{busy?"Finalizando...":savingItems.length>0?"Salvando respostas...":"Finalizar checklist"}</button>{requiredMissing.length>0&&<p>{requiredMissing.length} item(ns) obrigatório(s) ainda pendente(s).</p>}</section>}
      </>}
    </div>}
    {error&&assignment&&<p className="detail-message error">{error}</p>}
    {notice&&<p className="detail-message">{notice}</p>}
  </main>;
}
