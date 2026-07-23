"use client";

import { useEffect, useMemo, useState } from "react";
import { SupabaseConnectionStatus } from "./supabase-connection-status";
import { PrivateRouteGuard } from "./private-route-guard";
import { LogoutButton } from "./logout-button";
import { initializeSupabaseBrowserClient } from "../lib/supabase";

type ChecklistListItem = {
  id: string;
  assignment_id?: string;
  name: string;
  category: string | null;
  status: "draft" | "active" | "archived";
  organization_id: string;
  created_by: string | null;
  due_at?: string | null;
  execution_status?: "in_progress" | "paused" | "completed";
};
type HistoryItem = {
  id: string;
  checklist_name: string;
  executor_name: string;
  completed_at: string;
  conformity_percentage: number | null;
};
type DashboardExecution = {
  id: string;
  status: "in_progress" | "paused" | "completed";
  checklist_id: string;
  conformity_percentage: number | null;
  started_at: string;
};

type IconName = "home" | "check" | "task" | "team" | "model" | "chart" | "gear" | "search" | "bell" | "plus" | "clock" | "arrow" | "close" | "calendar" | "filter" | "dots";

const icons: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9 20v-6h6v6"/></>,
  check: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3V1m6 2V1M8 12l2.5 2.5L16 9"/></>,
  task: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 2.5 2.5L16 9"/></>,
  team: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M15 15c3.5 0 6 1.8 6 5"/></>,
  model: <><path d="M6 2h9l4 4v16H6z"/><path d="M15 2v5h5M9 12h7M9 16h7"/></>,
  chart: <><path d="M4 20V10h3v10M10.5 20V4h3v16M17 20v-7h3v7"/></>,
  gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>, arrow: <path d="m9 18 6-6-6-6"/>, close: <path d="m6 6 12 12M18 6 6 18"/>, calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>, filter: <path d="M4 6h16M7 12h10M10 18h4"/>, dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>
};

function Icon({name, size=20}:{name:IconName,size?:number}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg> }

const nav = [
  ["Visão geral","home"],["Operação","check"],["Modelos","model"],["Planos de ação","task"],["Histórico","calendar"],["Equipe e unidades","team"],["Relatórios","chart"]
] as const;
const templates = [
  {emoji:"🍸", title:"Abertura do bar", segment:"Bares e bartender", items:18, color:"#e8f4ff"},
  {emoji:"🧊", title:"Estação de bartender para evento", segment:"Eventos", items:24, color:"#fff2df"},
  {emoji:"🧼", title:"Higienização de cozinha", segment:"Cozinha profissional", items:16, color:"#e8fbf4"},
  {emoji:"🌡️", title:"Controle de temperatura", segment:"Segurança alimentar", items:12, color:"#f0ecff"},
  {emoji:"🍽️", title:"Montagem e desmontagem de buffet", segment:"Buffets", items:21, color:"#e9f7f8"},
  {emoji:"🔒", title:"Fechamento do restaurante", segment:"Restaurantes", items:20, color:"#fff0ee"}
];

export default function Home() {
  const [section,setSection] = useState("Visão geral");
  const [modal,setModal] = useState(false);
  const [toast,setToast] = useState("");
  const [query,setQuery] = useState("");
  const [mobile,setMobile] = useState(false);
  const [checklists,setChecklists] = useState<ChecklistListItem[]>([]);
  const [organizationId,setOrganizationId] = useState("");
  const [userId,setUserId] = useState("");
  const [viewerRole,setViewerRole] = useState("");
  const [checklistsLoading,setChecklistsLoading] = useState(true);
  const [checklistsError,setChecklistsError] = useState("");
  const [history,setHistory] = useState<HistoryItem[]>([]);
  const [dashboardExecutions,setDashboardExecutions] = useState<DashboardExecution[]>([]);
  const [openNonConformities,setOpenNonConformities] = useState(0);
  const [organizationName,setOrganizationName] = useState("Sua organização");
  const [profileName,setProfileName] = useState("Usuário");
  const filteredChecklists = useMemo(()=>checklists.filter(checklist=>!query || `${checklist.name} ${checklist.category||""}`.toLowerCase().includes(query.toLowerCase())),[checklists,query]);
  const notify=(msg:string)=>{setToast(msg);setTimeout(()=>setToast(""),2600)};
  const loadChecklists = async () => {
    setChecklistsLoading(true);
    setChecklistsError("");
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase) {
      setChecklistsError("Supabase não configurado.");
      setChecklistsLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setChecklistsLoading(false);
      return;
    }
    setUserId(user.id);
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id,role")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      setChecklistsError(membershipError?.message || "Organização do usuário não encontrada.");
      setChecklistsLoading(false);
      return;
    }
    setOrganizationId(membership.organization_id);
    setViewerRole(membership.role);
    const [{ data: organization }, { data: profile }] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", membership.organization_id).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);
    setOrganizationName(organization?.name || "Sua organização");
    setProfileName(profile?.full_name || user.email?.split("@")[0] || "Usuário");
    if (membership.role === "collaborator") {
      const { data: assignmentData, error: assignmentError } = await supabase
        .from("checklist_assignments")
        .select("id,checklist_id,due_at")
        .eq("organization_id", membership.organization_id)
        .eq("assigned_to", user.id)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (assignmentError) setChecklistsError(assignmentError.message);
      else {
        const checklistIds = (assignmentData || []).map(value=>value.checklist_id);
        const { data: checklistData, error: checklistError } = checklistIds.length
          ? await supabase.from("checklists").select("id,name,category,status,organization_id,created_by").in("id", checklistIds).neq("status", "archived")
          : { data: [], error: null };
        if (checklistError) setChecklistsError(checklistError.message);
        else {
          const byId = new Map((checklistData || []).map(value=>[value.id,value]));
          const assignmentIds = (assignmentData || []).map(value=>value.id);
          const { data: executionData, error: executionError } = assignmentIds.length
            ? await supabase.from("checklist_executions").select("assignment_id,status,started_at").in("assignment_id", assignmentIds).eq("executor_id", user.id).order("started_at", { ascending: false })
            : { data: [], error: null };
          if (executionError) setChecklistsError(executionError.message);
          const latestByAssignment = new Map<string,string>();
          for (const execution of executionData || []) {
            if (execution.assignment_id && !latestByAssignment.has(execution.assignment_id)) latestByAssignment.set(execution.assignment_id,execution.status);
          }
          setChecklists((assignmentData || []).flatMap(assignment => {
            const record = byId.get(assignment.checklist_id);
            return record ? [{...record,assignment_id:assignment.id,due_at:assignment.due_at,execution_status:latestByAssignment.get(assignment.id)} as ChecklistListItem] : [];
          }));
        }
      }
    } else {
      const { data, error } = await supabase
        .from("checklists")
        .select("id,name,category,status,organization_id,created_by")
        .eq("organization_id", membership.organization_id)
        .neq("status", "archived")
        .eq("is_template", false)
        .order("created_at", { ascending: false });
      if (error) setChecklistsError(error.message);
      else setChecklists((data || []) as ChecklistListItem[]);
    }
    const historyQuery = supabase
      .from("checklist_executions")
      .select("id,checklist_id,executor_id,completed_at,conformity_percentage")
      .eq("organization_id", membership.organization_id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(50);
    if (membership.role === "collaborator") historyQuery.eq("executor_id", user.id);
    const { data: historyData, error: historyError } = await historyQuery;
    if (historyError) setChecklistsError(historyError.message);
    else {
      const historyChecklistIds = [...new Set((historyData || []).map(value=>value.checklist_id))];
      const executorIds = [...new Set((historyData || []).map(value=>value.executor_id))];
      const [{ data: historyChecklists }, { data: executorProfiles }] = await Promise.all([
        historyChecklistIds.length ? supabase.from("checklists").select("id,name").in("id", historyChecklistIds) : Promise.resolve({data:[]}),
        executorIds.length ? supabase.from("profiles").select("id,full_name").in("id", executorIds) : Promise.resolve({data:[]}),
      ]);
      const checklistNames = new Map((historyChecklists || []).map(value=>[value.id,value.name]));
      const executorNames = new Map((executorProfiles || []).map(value=>[value.id,value.full_name || "Colaborador"]));
      setHistory((historyData || []).filter(value=>value.completed_at).map(value=>({
        id:value.id,
        checklist_name:checklistNames.get(value.checklist_id) || "Checklist",
        executor_name:executorNames.get(value.executor_id) || "Colaborador",
        completed_at:value.completed_at as string,
        conformity_percentage:value.conformity_percentage===null?null:Number(value.conformity_percentage),
      })));
    }
    let executionQuery = supabase
      .from("checklist_executions")
      .select("id,status,checklist_id,conformity_percentage,started_at")
      .eq("organization_id", membership.organization_id)
      .order("started_at", { ascending: false })
      .limit(50);
    if (membership.role === "collaborator") executionQuery = executionQuery.eq("executor_id", user.id);
    const [{ data: executionRows, error: executionRowsError }, { count: nonConformityCount, error: nonConformityError }] = await Promise.all([
      executionQuery,
      supabase.from("non_conformities").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).in("status", ["open","in_progress","awaiting_validation"]),
    ]);
    if (executionRowsError) setChecklistsError(executionRowsError.message);
    else {
      setDashboardExecutions((executionRows || []) as DashboardExecution[]);
      const latestByChecklist = new Map<string,ChecklistListItem["execution_status"]>();
      for (const row of executionRows || []) {
        if (!latestByChecklist.has(row.checklist_id)) latestByChecklist.set(row.checklist_id,row.status);
      }
      setChecklists(current=>current.map(checklist=>({
        ...checklist,
        execution_status:checklist.execution_status || latestByChecklist.get(checklist.id),
      })));
    }
    if (nonConformityError) setChecklistsError(nonConformityError.message);
    else setOpenNonConformities(nonConformityCount || 0);
    setChecklistsLoading(false);
  };
  useEffect(()=>{
    // A consulta é assíncrona e sincroniza a tela com a sessão persistida.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChecklists();
  },[]);
  const createChecklist = async (name:string, category:string) => {
    const supabase = await initializeSupabaseBrowserClient();
    if (!supabase || !organizationId || !userId) {
      setChecklistsError("Não foi possível identificar usuário e organização.");
      return;
    }
    const { data, error } = await supabase
      .from("checklists")
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        category,
        status: "draft",
        is_template: false,
        created_by: userId,
      })
      .select("id,name,category,status,organization_id,created_by")
      .single();
    if (error) {
      setChecklistsError(error.message);
      notify("Não foi possível criar o checklist.");
      return;
    }
    setChecklists(current => [data as ChecklistListItem, ...current]);
    setModal(false);
    setSection("Operação");
    notify(`Checklist “${name}” criado com sucesso!`);
  };
  return <div className="app-shell">
    <PrivateRouteGuard />
    <button className="mobile-menu" onClick={()=>setMobile(!mobile)} aria-label="Abrir menu">☰</button>
    <aside className={mobile?"sidebar open":"sidebar"}>
      <div className="brand"><span className="brandmark">✓</span><span>CheckFlow</span></div>
      <nav>{nav.map(([label,icon])=><button key={label} className={section===label?"navitem active":"navitem"} onClick={()=>{setSection(label);setMobile(false)}}><Icon name={icon}/><span>{label}</span></button>)}</nav>
      <div className="side-bottom"><button className="navitem" onClick={()=>setSection("Configurações")}><Icon name="gear"/>Configurações</button><LogoutButton variant="menu"/><div className="workspace workspace-static"><span className="building">▥</span><span><small>Organização atual</small>{organizationName}</span></div></div>
    </aside>
    <main className="main">
      <SupabaseConnectionStatus />
      <header><div><p className="eyebrow">OPERAÇÃO · {organizationName.toUpperCase()}</p><h1>{section==="Visão geral"?`Olá, ${profileName.split(" ")[0]}`:section}</h1><p className="subtitle">{section==="Visão geral"?"Acompanhe os dados operacionais registrados no sistema.":"Rotinas simples, responsáveis definidos e tudo registrado."}</p></div><div className="header-actions"><label className="search"><Icon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar checklist..."/></label><LogoutButton/>{viewerRole!=="collaborator"&&<button className="primary" onClick={()=>setModal(true)}><Icon name="plus" size={18}/>Novo checklist</button>}</div></header>
      {section==="Visão geral" && <Dashboard checklists={filteredChecklists} executions={dashboardExecutions} history={history} nonConformities={openNonConformities} loading={checklistsLoading} error={checklistsError} setSection={setSection}/>} 
      {section==="Modelos" && <Models onUse={(n)=>{setModal(true);notify(`Modelo “${n}” selecionado`)}}/>}
      {section!=="Visão geral"&&section!=="Modelos"&&<Generic section={section} setModal={setModal} checklists={filteredChecklists} history={history} loading={checklistsLoading} error={checklistsError} viewerRole={viewerRole}/>}
    </main>
    {modal&&<CreateModal close={()=>setModal(false)} create={createChecklist}/>}
    {toast&&<div className="toast"><span>✓</span>{toast}</div>}
  </div>
}

type DashboardProps = {checklists:ChecklistListItem[];executions:DashboardExecution[];history:HistoryItem[];nonConformities:number;loading:boolean;error:string;setSection:(value:string)=>void};
function Dashboard({checklists,executions,history,nonConformities,loading,error,setSection}:DashboardProps){
 const active=executions.filter(value=>value.status==="in_progress"||value.status==="paused").length;
 const completed=executions.filter(value=>value.status==="completed");
 const conformity=completed.length?Math.round(completed.reduce((sum,value)=>sum+Number(value.conformity_percentage||0),0)/completed.length):null;
 const kpis=[{label:"Checklists disponíveis",value:String(checklists.length),note:"dados reais",icon:"check",tone:"teal"},{label:"Em execução ou pausados",value:String(active),note:"agora",icon:"task",tone:"blue"},{label:"Conformidade média",value:conformity===null?"—":`${conformity}%`,note:"execuções concluídas",icon:"chart",tone:"green"},{label:"Não conformidades abertas",value:String(nonConformities),note:"requerem atenção",icon:"clock",tone:"red"}];
 return <>{error&&<section className="focus-banner dashboard-error"><div><strong>Não foi possível carregar todos os indicadores</strong><small>{error}</small></div><button onClick={()=>window.location.reload()}>Tentar novamente</button></section>}{loading?<article className="panel"><p className="data-state">Carregando indicadores...</p></article>:<><section className="kpi-grid">{kpis.map((k)=><article className="kpi" key={k.label}><span className={`kpi-icon ${k.tone}`}><Icon name={k.icon as IconName}/></span><div><p>{k.label}</p><strong>{k.value}</strong></div><small>{k.note}</small></article>)}</section>
 <section className="dashboard-grid"><article className="panel tasks-panel"><div className="panel-head"><div><h2>Checklists operacionais</h2><p>Registros disponíveis para sua organização e seu papel</p></div></div>{checklists.length===0?<p className="data-state">Nenhum checklist disponível.</p>:checklists.slice(0,6).map(checklist=><button className="recent-row" key={checklist.assignment_id||checklist.id} onClick={()=>window.location.href=checklist.assignment_id?`/executions/${checklist.assignment_id}`:`/checklists/${checklist.id}`}><span className="recent-icon"><Icon name="check"/></span><span><strong>{checklist.name}</strong><small>{checklist.category||"Sem categoria"}</small></span><span className="status">{checklist.execution_status==="completed"?"Concluído":checklist.execution_status==="paused"?"Pausado":checklist.execution_status==="in_progress"?"Em execução":checklist.status==="draft"?"Rascunho":"Ativo"}</span><Icon name="arrow" size={16}/></button>)}<button className="text-link" onClick={()=>setSection("Operação")}>Abrir operação <Icon name="arrow" size={16}/></button></article>
 <article className="panel recent"><div className="panel-head"><div><h2>Conclusões recentes</h2><p>Histórico persistido no Supabase</p></div><button className="text-link" onClick={()=>setSection("Histórico")}>Ver histórico</button></div>{history.length===0?<p className="data-state">Nenhuma execução concluída.</p>:history.slice(0,5).map(record=><button className="recent-row" key={record.id} onClick={()=>{window.location.href=`/history/${record.id}`}}><span className="recent-icon"><Icon name="calendar"/></span><span><strong>{record.checklist_name}</strong><small>{record.executor_name} · {new Date(record.completed_at).toLocaleString("pt-BR")}</small></span><span className="status">{record.conformity_percentage??0}%</span><Icon name="arrow" size={16}/></button>)}</article></section></>}</>
}

function Models({onUse}:{onUse:(n:string)=>void}){return <section><div className="section-toolbar"><div><h2>Modelos para alimentação e eventos</h2><p>Catálogo demonstrativo; a importação dos modelos ainda aguarda homologação.</p></div></div><div className="template-grid">{templates.map(t=><article className="template-card" key={t.title}><div className="template-icon" style={{background:t.color}}>{t.emoji}</div><span className="segment">{t.segment}</span><h3>{t.title}</h3><p>{t.items} itens planejados · ainda não conectado ao banco</p><div><button className="secondary" onClick={()=>onUse(t.title)}>Criar checklist vazio</button></div></article>)}</div></section>}

function Generic({section,setModal,checklists,history,loading,error,viewerRole}:{section:string;setModal:(v:boolean)=>void;checklists:ChecklistListItem[];history:HistoryItem[];loading:boolean;error:string;viewerRole:string}){const operationStatus=(checklist:ChecklistListItem)=>checklist.execution_status==="completed"?"Concluído":checklist.execution_status==="paused"?"Continuar":checklist.execution_status==="in_progress"?"Em execução":"Iniciar";const realSection=section==="Operação"||section==="Histórico";return <section><div className="section-toolbar"><div><h2>{section}</h2><p>{section==="Operação"?(viewerRole==="collaborator"?"Checklists atribuídos a você, com o status real da execução.":"Checklists reais da sua organização, prontos para editar e atribuir."):section==="Histórico"?"Execuções concluídas registradas no Supabase.":"Esta área ainda não foi homologada e não exibe dados simulados."}</p></div>{viewerRole!=="collaborator"&&section==="Operação"&&<button className="primary" onClick={()=>setModal(true)}><Icon name="plus" size={17}/>Novo checklist</button>}</div><article className="data-panel">{realSection&&<div className="data-head"><span>Nome</span><span>{section==="Histórico"?"Executor":"Categoria"}</span><span>{section==="Histórico"?"Conclusão":"Status"}</span><span></span></div>}{section==="Operação" ? <>{loading&&<p className="data-state">Carregando checklists...</p>}{error&&<p className="data-state error">{error} <button className="retry-link" onClick={()=>window.location.reload()}>Tentar novamente</button></p>}{!loading&&!error&&checklists.length===0&&<p className="data-state">{viewerRole==="collaborator"?"Nenhum checklist atribuído a você.":"Nenhum checklist criado nesta organização."}</p>}{checklists.map((checklist)=><button className="data-row" key={checklist.assignment_id||checklist.id} onClick={()=>{window.location.href=viewerRole==="collaborator"&&checklist.assignment_id?`/executions/${checklist.assignment_id}`:`/checklists/${checklist.id}`}}><span><i className="file-icon"><Icon name="check" size={19}/></i><strong>{checklist.name}</strong></span><span>{checklist.category || "Sem categoria"}</span><span className={`status ${checklist.execution_status==="completed"?"completed-label":""}`}>{checklist.execution_status?operationStatus(checklist):checklist.status==="draft"?"Rascunho":"Ativo"}</span><Icon name="arrow"/></button>)}</> : section==="Histórico" ? <>{loading&&<p className="data-state">Carregando histórico...</p>}{error&&<p className="data-state error">{error} <button className="retry-link" onClick={()=>window.location.reload()}>Tentar novamente</button></p>}{!loading&&!error&&history.length===0&&<p className="data-state">Nenhuma execução concluída.</p>}{history.map(record=><button className="data-row history-row" key={record.id} onClick={()=>{window.location.href=`/history/${record.id}`}}><span><i className="file-icon"><Icon name="calendar" size={19}/></i><strong>{record.checklist_name}</strong></span><span>{record.executor_name}</span><span className="status completed-label">{new Date(record.completed_at).toLocaleString("pt-BR")} · {record.conformity_percentage??0}%</span><Icon name="arrow"/></button>)}</> : <div className="module-pending"><Icon name="clock" size={28}/><h3>Homologação pendente</h3><p>Este módulo permanece no escopo do MVP, mas ainda não está conectado ao banco. Nenhuma informação fictícia é exibida.</p></div>}</article></section>}

function CreateModal({close,create}:{close:()=>void,create:(n:string,category:string)=>Promise<void>}){const [name,setName]=useState("");const [segment,setSegment]=useState("Bar");const [busy,setBusy]=useState(false);return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal"><button className="modal-close" onClick={close} aria-label="Fechar"><Icon name="close"/></button><span className="modal-icon"><Icon name="check"/></span><h2>Novo checklist</h2><p>Crie uma rotina e já deixe pronta para editar e atribuir à equipe.</p><label>Nome do checklist<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Abertura da estação de bar"/></label><label>Área da operação<select value={segment} onChange={e=>setSegment(e.target.value)}><option>Bar</option><option>Cozinha</option><option>Buffet</option><option>Evento</option><option>Estoque</option><option>Higienização</option></select></label><div className="modal-actions"><button className="secondary" onClick={close}>Cancelar</button><button className="primary" disabled={!name.trim()||busy} onClick={async()=>{setBusy(true);await create(name,segment);setBusy(false)}}>{busy?"Salvando...":"Criar checklist"}</button></div></div></div>}
