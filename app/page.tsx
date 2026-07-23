"use client";

import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
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
const tasks = [
  {title:"Conferir validade de frutas e insumos", sub:"Abertura do bar · Unidade Centro", tag:"Alta", owner:"Rafael S.", initials:"RS", time:"09:00", tone:"red"},
  {title:"Verificar temperatura das câmaras", sub:"Controle de alimentos · Cozinha", tag:"Alta", owner:"Carla M.", initials:"CM", time:"10:30", tone:"red"},
  {title:"Preparar estação de bartender", sub:"Casamento Silva · Salão A", tag:"Média", owner:"Juliana P.", initials:"JP", time:"14:00", tone:"amber"},
  {title:"Higienizar balcão e utensílios", sub:"Fechamento do bar · Unidade Centro", tag:"Baixa", owner:"Lucas F.", initials:"LF", time:"23:30", tone:"green"}
];
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
  const [done,setDone] = useState<number[]>([]);
  const [taskFilter,setTaskFilter] = useState("Todas");
  const [mobile,setMobile] = useState(false);
  const [checklists,setChecklists] = useState<ChecklistListItem[]>([]);
  const [organizationId,setOrganizationId] = useState("");
  const [userId,setUserId] = useState("");
  const [viewerRole,setViewerRole] = useState("");
  const [checklistsLoading,setChecklistsLoading] = useState(true);
  const [checklistsError,setChecklistsError] = useState("");
  const filtered = useMemo(()=>tasks.filter((t)=> !query || (t.title+t.sub+t.owner).toLowerCase().includes(query.toLowerCase())).filter((t,i)=> taskFilter!=="Minhas" || i===1 || i===3).filter((t)=>taskFilter!=="Atrasadas" || t.tone==="red"),[query,taskFilter]);
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
          setChecklists((assignmentData || []).flatMap(assignment => {
            const record = byId.get(assignment.checklist_id);
            return record ? [{...record,assignment_id:assignment.id,due_at:assignment.due_at} as ChecklistListItem] : [];
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
      <nav>{nav.map(([label,icon])=><button key={label} className={section===label?"navitem active":"navitem"} onClick={()=>{setSection(label);setMobile(false)}}><Icon name={icon}/><span>{label}</span>{label==="Planos de ação"&&<b>3</b>}</button>)}</nav>
      <div className="side-bottom"><button className="navitem" onClick={()=>setSection("Configurações")}><Icon name="gear"/>Configurações</button><LogoutButton variant="menu"/><button className="workspace"><span className="building">▥</span><span><small>Unidade atual</small>Bar & Buffet Centro</span><span>⌄</span></button></div>
    </aside>
    <main className="main">
      <SupabaseConnectionStatus />
      <header><div><p className="eyebrow">OPERAÇÃO DE HOJE · BAR & BUFFET CENTRO</p><h1>{section==="Visão geral"?"Bom dia, Wesley":section}</h1><p className="subtitle">{section==="Visão geral"?"Acompanhe a abertura, o preparo dos eventos e o fechamento da operação.":"Rotinas simples, responsáveis definidos e tudo registrado."}</p></div><div className="header-actions"><label className="search"><Icon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar checklist, evento ou colaborador..."/></label><button className="iconbtn" aria-label="Notificações" onClick={()=>notify("Você tem 3 pendências operacionais")}><Icon name="bell"/><i>3</i></button><LogoutButton/>{viewerRole!=="collaborator"&&<button className="primary" onClick={()=>setModal(true)}><Icon name="plus" size={18}/>Novo checklist</button>}</div></header>
      {section==="Visão geral" && <Dashboard filtered={filtered} done={done} setDone={setDone} taskFilter={taskFilter} setTaskFilter={setTaskFilter} setSection={setSection} notify={notify}/>} 
      {section==="Modelos" && <Models onUse={(n)=>{setModal(true);notify(`Modelo “${n}” selecionado`)}}/>}
      {section!=="Visão geral"&&section!=="Modelos"&&<Generic section={section} setModal={setModal} checklists={checklists} loading={checklistsLoading} error={checklistsError} viewerRole={viewerRole}/>}
    </main>
    {modal&&<CreateModal close={()=>setModal(false)} create={createChecklist}/>}
    {toast&&<div className="toast"><span>✓</span>{toast}</div>}
  </div>
}

type Task = (typeof tasks)[number];
type DashboardProps = {filtered:Task[];done:number[];setDone:Dispatch<SetStateAction<number[]>>;taskFilter:string;setTaskFilter:Dispatch<SetStateAction<string>>;setSection:Dispatch<SetStateAction<string>>;notify:(msg:string)=>void};
function Dashboard({filtered,done,setDone,taskFilter,setTaskFilter,setSection,notify}:DashboardProps){
 const kpis=[{label:"Rotinas programadas",value:"12",note:"3 eventos", icon:"check",tone:"teal"},{label:"Em execução",value:"4",note:"agora",icon:"task",tone:"blue"},{label:"Conformidade",value:"92%",note:"6%",icon:"chart",tone:"green"},{label:"Não conformidades",value:"3",note:"1 crítica",icon:"clock",tone:"red"}];
 return <><section className="focus-banner"><div><span className="live-dot"></span><strong>Próximo evento: Casamento Silva</strong><small>Hoje, 18:00 · Salão A · Equipe Bar Premium</small></div><button onClick={()=>setSection("Operação")}>Ver operação <Icon name="arrow" size={16}/></button></section><section className="kpi-grid">{kpis.map((k,i)=><article className="kpi" key={k.label}><span className={`kpi-icon ${k.tone}`}><Icon name={k.icon as IconName}/></span><div><p>{k.label}</p><strong>{k.value}</strong></div><small className={i===3?"down":"up"}>{i===3?"!":"↑"} {k.note}<em>{i===2?" vs. semana passada":""}</em></small></article>)}</section>
 <section className="dashboard-grid"><article className="panel tasks-panel"><div className="panel-head"><div><h2>Prioridades de hoje</h2><p>Itens que exigem atenção da operação</p></div><div className="segmented">{["Todas","Minhas","Atrasadas"].map(f=><button className={taskFilter===f?"selected":""} onClick={()=>setTaskFilter(f)} key={f}>{f}</button>)}</div></div><div className="task-head"><span>Tarefa</span><span>Prioridade</span><span>Responsável</span><span>Prazo</span></div>{filtered.map((t,i)=><div className={done.includes(i)?"task-row completed":"task-row"} key={t.title}><button className="checkbox" onClick={()=>setDone(done.includes(i)?done.filter((n)=>n!==i):[...done,i])} aria-label={`Concluir ${t.title}`}>{done.includes(i)&&"✓"}</button><div className="task-name"><strong>{t.title}</strong><small>{t.sub}</small></div><span className={`tag ${t.tone}`}>{t.tag}</span><div className="owner"><span className={`avatar av-${i}`}>{t.initials}</span>{t.owner}</div><span className={`time ${t.tone==="red"?"late":""}`}><Icon name="clock" size={15}/>{t.time}</span></div>)}<button className="text-link" onClick={()=>setSection("Operação")}>Abrir operação do dia <Icon name="arrow" size={16}/></button></article>
 <div className="right-stack"><article className="panel progress"><div className="panel-head"><div><h2>Progresso semanal</h2><p>Taxa de conclusão por dia</p></div><button className="select">Esta semana⌄</button></div><div className="chart"><div className="y-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="bars">{[["Seg",68],["Ter",74],["Qua",86],["Qui",92],["Sex",81],["Sáb",55],["Dom",42]].map(([d,v])=><div className="bar-col" key={d}><span>{v}%</span><i style={{height:`${Number(v)*1.55}px`}}></i><b>{d}</b></div>)}</div></div><div className="average"><span>▥ &nbsp; Média semanal de conclusão</span><strong>82%</strong></div></article>
 <article className="panel recent"><div className="panel-head"><div><h2>Execuções em andamento</h2><p>Atualização recente da equipe</p></div><button className="text-link" onClick={()=>setSection("Operação")}>Ver todas</button></div>{[["🍸","Abertura do bar",14,18],["🌡️","Controle de temperatura",10,12],["🍽️","Montagem Buffet Executivo",16,21]].map(([e,n,a,b],i)=><button className="recent-row" key={String(n)} onClick={()=>notify(`${n}: ${a} de ${b} itens concluídos`)}><span className={`recent-icon ri-${i}`}>{e}</span><span><strong>{n}</strong><small>Atualizado há {i?i+2:1} minuto{i?"s":""}</small></span><span className="ring" style={{"--p":`${Number(a)/Number(b)*360}deg`} as CSSProperties}><i>{Math.round(Number(a)/Number(b)*100)}%</i></span><Icon name="arrow" size={16}/></button>)}</article></div></section></>
}

function Models({onUse}:{onUse:(n:string)=>void}){return <section><div className="section-toolbar"><div><h2>Modelos para alimentação e eventos</h2><p>Rotinas prontas para adaptar à realidade da sua operação.</p></div><div><button className="secondary"><Icon name="filter" size={17}/>Todas as operações</button><button className="primary"><Icon name="plus" size={17}/>Criar modelo</button></div></div><div className="template-grid">{templates.map(t=><article className="template-card" key={t.title}><div className="template-icon" style={{background:t.color}}>{t.emoji}</div><span className="segment">{t.segment}</span><h3>{t.title}</h3><p>{t.items} itens · editável · pronto para atribuir</p><div><button className="secondary" onClick={()=>onUse(t.title)}>Visualizar</button><button className="primary" onClick={()=>onUse(t.title)}>Usar modelo</button></div></article>)}</div></section>}

function Generic({section,setModal,checklists,loading,error,viewerRole}:{section:string;setModal:(v:boolean)=>void;checklists:ChecklistListItem[];loading:boolean;error:string;viewerRole:string}){const content:Record<string,[string,string,string][]>={"Planos de ação":[["Substituir lote de limão","Rafael · vence hoje","Crítico"],["Regular temperatura do freezer 2","Carla · 11:30","Em andamento"],["Repor álcool 70% no balcão","Lucas · 16:00","Aberto"]],Histórico:[["Fechamento do restaurante","Ontem · Juliana","100%"],["Evento Corporativo Alfa","Ontem · Equipe Eventos","96%"],["Abertura do bar","Hoje · Rafael","78%"]],"Equipe e unidades":[["Bar & Buffet Centro","8 colaboradores","Ativa"],["Cozinha principal","5 colaboradores","Ativa"],["Equipe Bar Premium","6 colaboradores","Em evento"]],Relatórios:[["Resumo operacional diário","Hoje","92%"],["Não conformidades abertas","3 registros","Atenção"],["Execuções por unidade","Últimos 7 dias","34"]],Configurações:[["Dados da empresa","Bar & Buffet Centro","Ativo"],["Perfis e permissões","Gestor e colaborador","Gerenciar"],["Categorias da operação","Bar, cozinha e eventos","6"]]};return <section><div className="section-toolbar"><div><h2>{section}</h2><p>{section==="Operação"?(viewerRole==="collaborator"?"Checklists atribuídos a você, prontos para iniciar ou continuar.":"Checklists reais da sua organização, prontos para editar e atribuir."):"Informações essenciais para manter a rotina sob controle."}</p></div>{viewerRole!=="collaborator"&&<button className="primary" onClick={()=>setModal(true)}><Icon name="plus" size={17}/>{section==="Operação"?"Novo checklist":"Adicionar"}</button>}</div><article className="data-panel"><div className="data-head"><span>Nome</span><span>Categoria</span><span>Status</span><span></span></div>{section==="Operação" ? <>{loading&&<p className="data-state">Carregando checklists...</p>}{error&&<p className="data-state error">{error}</p>}{!loading&&!error&&checklists.length===0&&<p className="data-state">{viewerRole==="collaborator"?"Nenhum checklist atribuído a você.":"Nenhum checklist criado nesta organização."}</p>}{checklists.map((checklist)=><button className="data-row" key={checklist.assignment_id||checklist.id} onClick={()=>{window.location.href=viewerRole==="collaborator"&&checklist.assignment_id?`/executions/${checklist.assignment_id}`:`/checklists/${checklist.id}`}}><span><i className="file-icon"><Icon name="check" size={19}/></i><strong>{checklist.name}</strong></span><span>{checklist.category || "Sem categoria"}</span><span className="status">{viewerRole==="collaborator"?"Iniciar":checklist.status==="draft"?"Rascunho":"Ativo"}</span><Icon name="arrow"/></button>)}</> : (content[section]||[]).map((r)=><button className="data-row" key={r[0]}><span><i className="file-icon"><Icon name={section==="Equipe e unidades"?"team":section==="Relatórios"?"chart":section==="Histórico"?"calendar":"check"} size={19}/></i><strong>{r[0]}</strong></span><span>{r[1]}</span><span className={r[2]==="Crítico"||r[2]==="Atenção"?"status danger":"status"}>{r[2]}</span><Icon name="dots"/></button>)}</article></section>}

function CreateModal({close,create}:{close:()=>void,create:(n:string,category:string)=>Promise<void>}){const [name,setName]=useState("");const [segment,setSegment]=useState("Bar");const [busy,setBusy]=useState(false);return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal"><button className="modal-close" onClick={close} aria-label="Fechar"><Icon name="close"/></button><span className="modal-icon"><Icon name="check"/></span><h2>Novo checklist</h2><p>Crie uma rotina e já deixe pronta para editar e atribuir à equipe.</p><label>Nome do checklist<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Abertura da estação de bar"/></label><label>Área da operação<select value={segment} onChange={e=>setSegment(e.target.value)}><option>Bar</option><option>Cozinha</option><option>Buffet</option><option>Evento</option><option>Estoque</option><option>Higienização</option></select></label><div className="modal-actions"><button className="secondary" onClick={close}>Cancelar</button><button className="primary" disabled={!name.trim()||busy} onClick={async()=>{setBusy(true);await create(name,segment);setBusy(false)}}>{busy?"Salvando...":"Criar checklist"}</button></div></div></div>}
