"use client";
/* eslint-disable @next/next/no-img-element -- private evidence is displayed with a temporary signed URL */

import { useEffect, useMemo, useState } from "react";
import { PrivateRouteGuard } from "../../private-route-guard";
import { initializeSupabaseBrowserClient } from "../../../lib/supabase";

type Execution = {
  id:string;
  organization_id:string;
  checklist_id:string;
  unit_id:string|null;
  executor_id:string;
  status:string;
  started_at:string;
  completed_at:string|null;
  conformity_percentage:number|null;
  summary:unknown;
};
type Item = {id:string;prompt:string;answer_type:string;position:number};
type Section = {id:string;title:string;position:number;checklist_items:Item[]};
type Answer = {id:string;item_id:string;value:unknown;observation:string|null;is_conforming:boolean|null;answered_at:string};
type Occurrence = {id:string;item_id:string;observation:string;priority:string;status:string;created_at:string};

const statusLabels:Record<string,string> = {
  completed:"Finalizada",
  in_progress:"Em execução",
  paused:"Pausada",
  open:"Aberta",
  awaiting_validation:"Aguardando validação",
  rejected:"Reprovada",
};

export default function ExecutionHistoryDetail({executionId}:{executionId:string}) {
  const [execution,setExecution] = useState<Execution|null>(null);
  const [checklistName,setChecklistName] = useState("");
  const [executorName,setExecutorName] = useState("");
  const [unitName,setUnitName] = useState("");
  const [sections,setSections] = useState<Section[]>([]);
  const [answers,setAnswers] = useState<Answer[]>([]);
  const [occurrences,setOccurrences] = useState<Occurrence[]>([]);
  const [photoUrls,setPhotoUrls] = useState<Record<string,string>>({});
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  const answersByItem = useMemo(()=>new Map(answers.map(answer=>[answer.item_id,answer])),[answers]);
  const occurrencesByItem = useMemo(()=>new Map(occurrences.map(occurrence=>[occurrence.item_id,occurrence])),[occurrences]);

  const load = async () => {
    setLoading(true);
    setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setError("Supabase não configurado."); setLoading(false); return; }
    const { data:{user} } = await supabase.auth.getUser();
    if (!user) { setError("Sessão não encontrada."); setLoading(false); return; }
    const { data:record,error:executionError } = await supabase.from("checklist_executions")
      .select("id,organization_id,checklist_id,unit_id,executor_id,status,started_at,completed_at,conformity_percentage,summary")
      .eq("id",executionId)
      .maybeSingle();
    if (executionError || !record) {
      setError(executionError?.message || "Execução não encontrada ou sem permissão.");
      setLoading(false);
      return;
    }
    const { data:membership } = await supabase.from("organization_members")
      .select("role")
      .eq("organization_id",record.organization_id)
      .eq("user_id",user.id)
      .eq("active",true)
      .maybeSingle();
    if (!membership) {
      setError("Usuário sem vínculo ativo com a organização desta execução.");
      setLoading(false);
      return;
    }
    setExecution(record as Execution);
    const [
      {data:checklist,error:checklistError},
      {data:profile,error:profileError},
      {data:unit,error:unitError},
      {data:sectionRows,error:sectionError},
      {data:answerRows,error:answerError},
      {data:occurrenceRows,error:occurrenceError},
      {data:attachmentRows,error:attachmentError},
    ] = await Promise.all([
      supabase.from("checklists").select("name").eq("id",record.checklist_id).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id",record.executor_id).maybeSingle(),
      record.unit_id ? supabase.from("units").select("name").eq("id",record.unit_id).maybeSingle() : Promise.resolve({data:null,error:null}),
      supabase.from("checklist_sections").select("id,title,position,checklist_items(id,prompt,answer_type,position)").eq("checklist_id",record.checklist_id).order("position"),
      supabase.from("execution_answers").select("id,item_id,value,observation,is_conforming,answered_at").eq("execution_id",record.id),
      supabase.from("non_conformities").select("id,item_id,observation,priority,status,created_at").eq("execution_id",record.id),
      supabase.from("attachments").select("answer_id,storage_path").eq("execution_id",record.id),
    ]);
    const firstError = checklistError || profileError || unitError || sectionError || answerError || occurrenceError || attachmentError;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setChecklistName(checklist?.name || "Checklist");
    setExecutorName(profile?.full_name || "Colaborador");
    setUnitName(unit?.name || "Sem unidade");
    setSections(((sectionRows || []) as Section[]).map(section=>({...section,checklist_items:[...(section.checklist_items||[])].sort((a,b)=>a.position-b.position)})));
    setAnswers((answerRows || []) as Answer[]);
    setOccurrences((occurrenceRows || []) as Occurrence[]);
    const answerById = new Map((answerRows || []).map(answer=>[answer.id,answer]));
    const photoItemIds = new Set(((sectionRows || []) as Section[]).flatMap(section=>
      (section.checklist_items || []).filter(item=>item.answer_type==="photo").map(item=>item.id)
    ));
    const evidencePaths = new Map<string,string>();
    for (const attachment of attachmentRows || []) {
      if (attachment.answer_id) evidencePaths.set(attachment.answer_id,attachment.storage_path);
    }
    for (const answer of answerRows || []) {
      if (!evidencePaths.has(answer.id) && photoItemIds.has(answer.item_id) && typeof answer.value==="string" && answer.value) {
        evidencePaths.set(answer.id,answer.value);
      }
    }
    const signedEntries = await Promise.all([...evidencePaths.entries()].map(async ([answerId,storagePath])=>{
      const {data:signed,error:signedError} = await supabase.storage.from("checkflow-evidence").createSignedUrl(storagePath,3600);
      if (signedError) return null;
      return signed?.signedUrl && answerById.has(answerId) ? [answerId,signed.signedUrl] as const : null;
    }));
    setPhotoUrls(Object.fromEntries(signedEntries.filter((entry):entry is readonly [string,string]=>Boolean(entry))));
    setLoading(false);
  };

  useEffect(()=>{
    // Sincroniza a rota com o registro permitido pelo RLS.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  },[executionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatValue = (answer:Answer|undefined,item:Item) => {
    if (!answer) return "Sem resposta";
    if (item.answer_type==="photo") return photoUrls[answer.id] ? "Fotografia anexada" : "Fotografia registrada";
    if (typeof answer.value==="boolean") return answer.value ? "Concluído" : "Não concluído";
    if (answer.value===null || answer.value===undefined || answer.value==="") return "Sem resposta";
    return String(answer.value);
  };

  return <main className="detail-page history-detail-page">
    <PrivateRouteGuard />
    <button className="back-link" onClick={()=>{window.location.href="/"}}>← Voltar ao histórico</button>
    {loading&&<section className="detail-card detail-error"><p>Carregando detalhes da execução...</p></section>}
    {!loading&&error&&<section className="detail-card detail-error"><h1>Detalhes indisponíveis</h1><p>{error}</p><button className="secondary" onClick={load}>Tentar novamente</button></section>}
    {!loading&&!error&&execution&&<div className="history-detail-shell">
      <section className="detail-card history-summary">
        <div><span className="segment">Execução operacional</span><h1>{checklistName}</h1><p>{executorName} · {unitName}</p></div>
        <span className="execution-status completed">{statusLabels[execution.status] || execution.status}</span>
        <div className="history-metrics">
          <span><small>Início</small><strong>{new Date(execution.started_at).toLocaleString("pt-BR")}</strong></span>
          <span><small>Conclusão</small><strong>{execution.completed_at?new Date(execution.completed_at).toLocaleString("pt-BR"):"—"}</strong></span>
          <span><small>Conformidade</small><strong>{execution.conformity_percentage===null?"—":`${Number(execution.conformity_percentage)}%`}</strong></span>
          <span><small>Não conformidades</small><strong>{occurrences.length}</strong></span>
        </div>
      </section>
      {sections.map(section=><section className="detail-card history-section" key={section.id}>
        <h2>{section.title}</h2>
        {section.checklist_items.map((item,index)=>{
          const answer=answersByItem.get(item.id);
          const occurrence=occurrencesByItem.get(item.id);
          return <article className="history-answer" key={item.id}>
            <span className="item-number">{index+1}</span>
            <div>
              <strong>{item.prompt}</strong>
              <p>{formatValue(answer,item)}</p>
              {answer?.observation&&<small>Observação: {answer.observation}</small>}
              {answer&&photoUrls[answer.id]&&<img src={photoUrls[answer.id]} alt={`Evidência de ${item.prompt}`}/>}
              {occurrence&&<div className="history-occurrence"><b>Não conformidade · {statusLabels[occurrence.status] || occurrence.status}</b><span>{occurrence.observation}</span></div>}
            </div>
          </article>;
        })}
      </section>)}
    </div>}
  </main>;
}
