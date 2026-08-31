"use client";
/* eslint-disable @next/next/no-img-element -- private correction evidence uses a temporary signed URL */

import { useEffect, useMemo, useRef, useState } from "react";
import { PrivateRouteGuard } from "../private-route-guard";
import { initializeSupabaseBrowserClient } from "../../lib/supabase";
import { FeedbackMessage, useFeedback } from "../feedback";

type Plan = {
  id:string;
  organization_id:string;
  non_conformity_id:string;
  description:string;
  responsible_user_id:string|null;
  due_at:string|null;
  status:string;
  correction_comment:string|null;
};
type Occurrence = {
  id:string;
  item_id:string;
  observation:string;
  priority:string;
  status:string;
  created_at:string;
};
type Member = {user_id:string;full_name:string};

const labels:Record<string,string> = {
  open:"Aberta",
  in_progress:"Em andamento",
  awaiting_validation:"Aguardando validação",
  completed:"Concluída",
  rejected:"Reprovada",
};

export default function ActionPlans() {
  const [plans,setPlans] = useState<Plan[]>([]);
  const [occurrences,setOccurrences] = useState<Occurrence[]>([]);
  const [members,setMembers] = useState<Member[]>([]);
  const [itemNames,setItemNames] = useState<Record<string,string>>({});
  const [profileNames,setProfileNames] = useState<Record<string,string>>({});
  const [responsible,setResponsible] = useState<Record<string,string>>({});
  const [dueDates,setDueDates] = useState<Record<string,string>>({});
  const [photoUrls,setPhotoUrls] = useState<Record<string,string>>({});
  const [organizationId,setOrganizationId] = useState("");
  const [userId,setUserId] = useState("");
  const [role,setRole] = useState("");
  const [loading,setLoading] = useState(true);
  const [busyId,setBusyId] = useState("");
  const [error,setError] = useState("");
  const { feedback, showFeedback, clearFeedback } = useFeedback();
  const actionLock = useRef(false);
  const canManage = role==="owner" || role==="manager";
  const plansByOccurrence = useMemo(()=>new Set(plans.map(plan=>plan.non_conformity_id)),[plans]);
  const pendingOccurrences = occurrences.filter(occurrence=>!plansByOccurrence.has(occurrence.id) && occurrence.status!=="completed");

  const load = async () => {
    setLoading(true); setError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) { setError("Supabase não configurado."); setLoading(false); return; }
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) { setError("Sessão não encontrada."); setLoading(false); return; }
    setUserId(user.id);
    const {data:membership,error:membershipError} = await supabase.from("organization_members")
      .select("organization_id,role").eq("user_id",user.id).eq("active",true).limit(1).maybeSingle();
    if (membershipError || !membership) {
      setError(membershipError?.message || "Organização não encontrada."); setLoading(false); return;
    }
    setOrganizationId(membership.organization_id);
    setRole(membership.role);
    const [{data:planRows,error:planError},{data:occurrenceRows,error:occurrenceError}] = await Promise.all([
      supabase.from("action_plans").select("id,organization_id,non_conformity_id,description,responsible_user_id,due_at,status,correction_comment")
        .eq("organization_id",membership.organization_id).order("created_at",{ascending:false}),
      supabase.from("non_conformities").select("id,item_id,observation,priority,status,created_at")
        .eq("organization_id",membership.organization_id).order("created_at",{ascending:false}),
    ]);
    if (planError || occurrenceError) {
      setError(planError?.message || occurrenceError?.message || "Não foi possível carregar os planos.");
      setLoading(false); return;
    }
    const loadedPlans=(planRows || []) as Plan[];
    const loadedOccurrences=(occurrenceRows || []) as Occurrence[];
    setPlans(loadedPlans);
    setOccurrences(loadedOccurrences);
    const itemIds=[...new Set(loadedOccurrences.map(value=>value.item_id))];
    const responsibleIds=[...new Set(loadedPlans.map(value=>value.responsible_user_id).filter(Boolean) as string[])];
    const memberQuery = ["owner","manager"].includes(membership.role)
      ? supabase.from("organization_members").select("user_id").eq("organization_id",membership.organization_id).eq("role","collaborator").eq("active",true)
      : Promise.resolve({data:[],error:null});
    const [{data:itemRows},{data:memberRows}] = await Promise.all([
      itemIds.length ? supabase.from("checklist_items").select("id,prompt").in("id",itemIds) : Promise.resolve({data:[]}),
      memberQuery,
    ]);
    const memberIds=(memberRows || []).map(member=>member.user_id);
    const profileIds=[...new Set([...memberIds,...responsibleIds])];
    const {data:profiles} = profileIds.length
      ? await supabase.from("profiles").select("id,full_name").in("id",profileIds)
      : {data:[]};
    const names=Object.fromEntries((profiles || []).map(profile=>[profile.id,profile.full_name || "Colaborador"]));
    setProfileNames(names);
    setMembers(memberIds.map(id=>({user_id:id,full_name:names[id] || "Colaborador"})));
    setItemNames(Object.fromEntries((itemRows || []).map(item=>[item.id,item.prompt])));
    const signedEntries=await Promise.all(loadedPlans.filter(plan=>plan.correction_comment).map(async plan=>{
      const {data:signed}=await supabase.storage.from("checkflow-evidence").createSignedUrl(plan.correction_comment as string,3600);
      return signed?.signedUrl ? [plan.id,signed.signedUrl] as const : null;
    }));
    setPhotoUrls(Object.fromEntries(signedEntries.filter((entry):entry is readonly [string,string]=>Boolean(entry))));
    setLoading(false);
  };

  useEffect(()=>{
    // Carrega o módulo real respeitando sessão e RLS.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  },[]);

  const createPlan = async (occurrence:Occurrence) => {
    const responsibleId=responsible[occurrence.id];
    const dueAt=dueDates[occurrence.id];
    if (!canManage || !responsibleId || !dueAt || actionLock.current) {
      setError("Selecione responsável e prazo.");
      return;
    }
    actionLock.current=true; setBusyId(occurrence.id); setError(""); clearFeedback();
    const supabase=await initializeSupabaseBrowserClient();
    if (!supabase) { actionLock.current=false; setBusyId(""); return; }
    const {data:plan,error:planError}=await supabase.from("action_plans").insert({
      organization_id:organizationId,
      non_conformity_id:occurrence.id,
      description:`Corrigir: ${itemNames[occurrence.item_id] || "não conformidade operacional"}`,
      responsible_user_id:responsibleId,
      due_at:new Date(dueAt).toISOString(),
      status:"in_progress",
      created_by:userId,
    }).select("id").single();
    if (planError || !plan) {
      setError(planError?.message || "O plano não foi persistido.");
    } else {
      const {error:occurrenceUpdateError}=await supabase.from("non_conformities").update({
        responsible_user_id:responsibleId,
        due_at:new Date(dueAt).toISOString(),
        status:"in_progress",
      }).eq("id",occurrence.id).select("id").single();
      if (occurrenceUpdateError) {
        await supabase.from("action_plans").delete().eq("id",plan.id);
        setError(occurrenceUpdateError.message);
      } else {
        showFeedback("Plano de ação criado e atribuído.");
        await load();
      }
    }
    actionLock.current=false; setBusyId("");
  };

  const uploadCorrection = async (plan:Plan,file:File|null) => {
    if (!file || actionLock.current || plan.responsible_user_id!==userId) return;
    const extensions:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
    const extension=extensions[file.type];
    if (!extension) { setError("Envie uma fotografia JPG, PNG ou WebP."); return; }
    if (file.size>10*1024*1024) { setError("A fotografia deve ter no máximo 10 MB."); return; }
    actionLock.current=true; setBusyId(plan.id); setError(""); clearFeedback();
    const supabase=await initializeSupabaseBrowserClient();
    if (!supabase) { actionLock.current=false; setBusyId(""); return; }
    const storagePath=`${organizationId}/action-plans/${plan.id}/${crypto.randomUUID()}.${extension}`;
    const {error:uploadError}=await supabase.storage.from("checkflow-evidence").upload(storagePath,file,{contentType:file.type,upsert:false});
    if (uploadError) setError(uploadError.message);
    else {
      const {error:updateError}=await supabase.from("action_plans").update({
        correction_comment:storagePath,
        status:"awaiting_validation",
      }).eq("id",plan.id).select("id").single();
      if (updateError) {
        await supabase.storage.from("checkflow-evidence").remove([storagePath]);
        setError(updateError.message);
      } else {
        showFeedback("Correção enviada para validação do gestor.");
        await load();
      }
    }
    actionLock.current=false; setBusyId("");
  };

  const validatePlan = async (plan:Plan,approved:boolean) => {
    if (!canManage || plan.status!=="awaiting_validation" || actionLock.current) return;
    actionLock.current=true; setBusyId(plan.id); setError(""); clearFeedback();
    const supabase=await initializeSupabaseBrowserClient();
    if (!supabase) { actionLock.current=false; setBusyId(""); return; }
    const status=approved?"completed":"rejected";
    const {error:planError}=await supabase.from("action_plans").update({
      status,
      validated_by:userId,
      validated_at:new Date().toISOString(),
    }).eq("id",plan.id).select("id").single();
    if (planError) setError(planError.message);
    else {
      const {error:occurrenceError}=await supabase.from("non_conformities").update({status}).eq("id",plan.non_conformity_id).select("id").single();
      if (occurrenceError) setError(occurrenceError.message);
      else { showFeedback(approved?"Correção aprovada.":"Correção reprovada."); await load(); }
    }
    actionLock.current=false; setBusyId("");
  };

  return <main className="detail-page action-page">
    <PrivateRouteGuard />
    <button className="back-link" onClick={()=>{window.location.href="/"}}>← Voltar ao painel</button>
    <div className="action-shell">
      <section className="detail-card action-heading"><div><span className="segment">Módulo operacional</span><h1>Planos de ação</h1><p>Correções objetivas, com responsável, prazo e evidência.</p></div></section>
      {loading&&<section className="detail-card"><p>Carregando planos de ação...</p></section>}
      {!loading&&error&&!organizationId&&<section className="detail-card detail-error"><h2>Acesso indisponível</h2><p>{error}</p><button className="secondary" onClick={load}>Tentar novamente</button></section>}
      {!loading&&canManage&&pendingOccurrences.length>0&&<section className="detail-card">
        <h2>Não conformidades sem plano</h2>
        <div className="unplanned-list">{pendingOccurrences.map(occurrence=><article className="unplanned-card" key={occurrence.id}>
          <div><strong>{itemNames[occurrence.item_id] || "Item operacional"}</strong><p>{occurrence.observation}</p></div>
          <label>Responsável<select value={responsible[occurrence.id]||""} disabled={busyId===occurrence.id} onChange={event=>setResponsible(current=>({...current,[occurrence.id]:event.target.value}))}><option value="">Selecione</option>{members.map(member=><option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</select></label>
          <label>Prazo<input type="datetime-local" value={dueDates[occurrence.id]||""} disabled={busyId===occurrence.id} onChange={event=>setDueDates(current=>({...current,[occurrence.id]:event.target.value}))}/></label>
          <button className="primary" disabled={busyId===occurrence.id||!responsible[occurrence.id]||!dueDates[occurrence.id]} onClick={()=>createPlan(occurrence)}>{busyId===occurrence.id?"Salvando...":"Criar plano"}</button>
        </article>)}</div>
      </section>}
      {!loading&&<section className="detail-card">
        <h2>{canManage?"Planos cadastrados":"Minhas correções"}</h2>
        {plans.length===0&&<p className="empty-state">Nenhum plano de ação disponível.</p>}
        <div className="plan-list">{plans.map(plan=>{
          const occurrence=occurrences.find(value=>value.id===plan.non_conformity_id);
          return <article className="plan-card" key={plan.id}>
            <div className="plan-card-head"><div><strong>{occurrence?itemNames[occurrence.item_id] || plan.description:plan.description}</strong><p>{occurrence?.observation || plan.description}</p></div><span className={`plan-status ${plan.status}`}>{labels[plan.status] || plan.status}</span></div>
            <div className="plan-meta"><span><small>Responsável</small><b>{plan.responsible_user_id?profileNames[plan.responsible_user_id] || "Colaborador":"Não definido"}</b></span><span><small>Prazo</small><b>{plan.due_at?new Date(plan.due_at).toLocaleString("pt-BR"):"Sem prazo"}</b></span></div>
            {photoUrls[plan.id]&&<img className="correction-photo" src={photoUrls[plan.id]} alt="Evidência da correção"/>}
            {!canManage&&plan.responsible_user_id===userId&&!["completed","awaiting_validation"].includes(plan.status)&&<label className="photo-upload"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busyId===plan.id} onChange={event=>uploadCorrection(plan,event.target.files?.[0]||null)}/><span>{busyId===plan.id?"Enviando...":plan.status==="rejected"?"Enviar nova fotografia":"Enviar fotografia da correção"}</span></label>}
            {canManage&&plan.status==="awaiting_validation"&&<div className="validation-actions"><button className="secondary reject-action" disabled={busyId===plan.id} onClick={()=>validatePlan(plan,false)}>Reprovar</button><button className="primary" disabled={busyId===plan.id||!photoUrls[plan.id]} onClick={()=>validatePlan(plan,true)}>Aprovar correção</button></div>}
          </article>;
        })}</div>
      </section>}
    </div>
    {error&&organizationId&&<p className="detail-message error">{error}</p>}
    <FeedbackMessage feedback={feedback} onClose={clearFeedback}/>
  </main>;
}
