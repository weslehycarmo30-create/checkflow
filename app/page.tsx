"use client";

import { useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";

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
  ["Visão geral","home"],["Checklists","check"],["Tarefas","task"],["Equipes","team"],["Modelos","model"],["Relatórios","chart"]
] as const;
const tasks = [
  {title:"Inspecionar extintores", sub:"Segurança mensal", tag:"Alta", owner:"Rafael S.", initials:"RS", time:"09:00", tone:"red"},
  {title:"Conferir abertura da loja", sub:"Abertura da loja", tag:"Média", owner:"Carla M.", initials:"CM", time:"10:30", tone:"amber"},
  {title:"Validar documentos do cliente", sub:"Onboarding de clientes", tag:"Alta", owner:"Juliana P.", initials:"JP", time:"14:00", tone:"red"},
  {title:"Higienizar estação de trabalho", sub:"5S · Estações de trabalho", tag:"Baixa", owner:"Lucas F.", initials:"LF", time:"16:00", tone:"green"}
];
const templates = [
  {emoji:"🏪", title:"Abertura e fechamento", segment:"Varejo", items:18, color:"#e8f4ff"},
  {emoji:"🦺", title:"Inspeção de segurança", segment:"Construção", items:24, color:"#fff2df"},
  {emoji:"🧼", title:"Higienização de ambientes", segment:"Saúde", items:16, color:"#e8fbf4"},
  {emoji:"🚚", title:"Checklist de veículo", segment:"Logística", items:21, color:"#f0ecff"},
  {emoji:"💻", title:"Onboarding de colaborador", segment:"Escritórios", items:12, color:"#e9f7f8"},
  {emoji:"🔧", title:"Manutenção preventiva", segment:"Indústria", items:28, color:"#fff0ee"}
];

export default function Home() {
  const [section,setSection] = useState("Visão geral");
  const [modal,setModal] = useState(false);
  const [toast,setToast] = useState("");
  const [query,setQuery] = useState("");
  const [done,setDone] = useState<number[]>([]);
  const [taskFilter,setTaskFilter] = useState("Todas");
  const [mobile,setMobile] = useState(false);
  const filtered = useMemo(()=>tasks.filter((t)=> !query || (t.title+t.sub+t.owner).toLowerCase().includes(query.toLowerCase())).filter((t,i)=> taskFilter!=="Minhas" || i===1 || i===3).filter((t)=>taskFilter!=="Atrasadas" || t.tone==="red"),[query,taskFilter]);
  const notify=(msg:string)=>{setToast(msg);setTimeout(()=>setToast(""),2600)};
  return <div className="app-shell">
    <button className="mobile-menu" onClick={()=>setMobile(!mobile)} aria-label="Abrir menu">☰</button>
    <aside className={mobile?"sidebar open":"sidebar"}>
      <div className="brand"><span className="brandmark">✓</span><span>CheckFlow</span></div>
      <nav>{nav.map(([label,icon])=><button key={label} className={section===label?"navitem active":"navitem"} onClick={()=>{setSection(label);setMobile(false)}}><Icon name={icon}/><span>{label}</span>{label==="Tarefas"&&<b>5</b>}</button>)}</nav>
      <div className="side-bottom"><button className="navitem" onClick={()=>notify("Integrações disponíveis no plano Pro")}><span className="puzzle">✣</span>Integrações</button><button className="navitem" onClick={()=>setSection("Configurações")}><Icon name="gear"/>Configurações</button><button className="workspace"><span className="building">▥</span><span><small>Workspace</small>Operação Brasil</span><span>⌄</span></button></div>
    </aside>
    <main className="main">
      <header><div><p className="eyebrow">DOMINGO, 20 DE JULHO</p><h1>{section==="Visão geral"?"Bom dia, Wesley":section}</h1><p className="subtitle">{section==="Visão geral"?"Aqui está o resumo da sua operação hoje.":"Gerencie sua operação em um só lugar."}</p></div><div className="header-actions"><label className="search"><Icon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar checklists, tarefas, equipes..."/></label><button className="iconbtn" aria-label="Notificações" onClick={()=>notify("Você tem 3 notificações novas")}><Icon name="bell"/><i>3</i></button><span className="avatar main-avatar">WA</span><button className="primary" onClick={()=>setModal(true)}><Icon name="plus" size={18}/>Novo checklist</button></div></header>
      {section==="Visão geral" && <Dashboard filtered={filtered} done={done} setDone={setDone} taskFilter={taskFilter} setTaskFilter={setTaskFilter} setSection={setSection} notify={notify}/>} 
      {section==="Modelos" && <Models onUse={(n)=>{setModal(true);notify(`Modelo “${n}” selecionado`)}}/>}
      {section!=="Visão geral"&&section!=="Modelos"&&<Generic section={section} setModal={setModal}/>} 
    </main>
    {modal&&<CreateModal close={()=>setModal(false)} create={(name)=>{setModal(false);notify(`Checklist “${name}” criado com sucesso!`)}}/>}
    {toast&&<div className="toast"><span>✓</span>{toast}</div>}
  </div>
}

type Task = (typeof tasks)[number];
type DashboardProps = {filtered:Task[];done:number[];setDone:Dispatch<SetStateAction<number[]>>;taskFilter:string;setTaskFilter:Dispatch<SetStateAction<string>>;setSection:Dispatch<SetStateAction<string>>;notify:(msg:string)=>void};
function Dashboard({filtered,done,setDone,taskFilter,setTaskFilter,setSection,notify}:DashboardProps){
 const kpis=[{label:"Checklists ativos",value:"24",note:"12%", icon:"check",tone:"teal"},{label:"Tarefas hoje",value:"38",note:"8%",icon:"task",tone:"blue"},{label:"Concluídas",value:"82%",note:"9%",icon:"chart",tone:"green"},{label:"Atrasadas",value:"5",note:"2 vs. ontem",icon:"clock",tone:"red"}];
 return <><section className="kpi-grid">{kpis.map((k,i)=><article className="kpi" key={k.label}><span className={`kpi-icon ${k.tone}`}><Icon name={k.icon as IconName}/></span><div><p>{k.label}</p><strong>{k.value}</strong></div><small className={i===3?"down":"up"}>{i===3?"↓":"↑"} {k.note}<em>{i<3?" vs. semana passada":""}</em></small></article>)}</section>
 <section className="dashboard-grid"><article className="panel tasks-panel"><div className="panel-head"><div><h2>Tarefas de hoje</h2><p>Prioridades que exigem sua atenção</p></div><div className="segmented">{["Todas","Minhas","Atrasadas"].map(f=><button className={taskFilter===f?"selected":""} onClick={()=>setTaskFilter(f)} key={f}>{f}</button>)}</div></div><div className="task-head"><span>Tarefa</span><span>Prioridade</span><span>Responsável</span><span>Prazo</span></div>{filtered.map((t,i)=><div className={done.includes(i)?"task-row completed":"task-row"} key={t.title}><button className="checkbox" onClick={()=>setDone(done.includes(i)?done.filter((n)=>n!==i):[...done,i])} aria-label={`Concluir ${t.title}`}>{done.includes(i)&&"✓"}</button><div className="task-name"><strong>{t.title}</strong><small>{t.sub}</small></div><span className={`tag ${t.tone}`}>{t.tag}</span><div className="owner"><span className={`avatar av-${i}`}>{t.initials}</span>{t.owner}</div><span className={`time ${t.tone==="red"?"late":""}`}><Icon name="clock" size={15}/>{t.time}</span></div>)}<button className="text-link" onClick={()=>setSection("Tarefas")}>Ver todas as tarefas <Icon name="arrow" size={16}/></button></article>
 <div className="right-stack"><article className="panel progress"><div className="panel-head"><div><h2>Progresso semanal</h2><p>Taxa de conclusão por dia</p></div><button className="select">Esta semana⌄</button></div><div className="chart"><div className="y-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="bars">{[["Seg",68],["Ter",74],["Qua",86],["Qui",92],["Sex",81],["Sáb",55],["Dom",42]].map(([d,v])=><div className="bar-col" key={d}><span>{v}%</span><i style={{height:`${Number(v)*1.55}px`}}></i><b>{d}</b></div>)}</div></div><div className="average"><span>▥ &nbsp; Média semanal de conclusão</span><strong>82%</strong></div></article>
 <article className="panel recent"><div className="panel-head"><div><h2>Checklists recentes</h2><p>Execuções em andamento</p></div><button className="text-link" onClick={()=>setSection("Checklists")}>Ver todos</button></div>{[["🏪","Abertura da loja",9,12],["🛡️","Segurança mensal",18,20],["👥","Onboarding de clientes",6,8]].map(([e,n,a,b],i)=><button className="recent-row" key={String(n)} onClick={()=>notify(`${n}: ${a} de ${b} itens concluídos`)}><span className={`recent-icon ri-${i}`}>{e}</span><span><strong>{n}</strong><small>Atualizado há {i?i+2:1} hora{i?"s":""}</small></span><span className="ring" style={{"--p":`${Number(a)/Number(b)*360}deg`} as CSSProperties}><i>{Math.round(Number(a)/Number(b)*100)}%</i></span><Icon name="arrow" size={16}/></button>)}</article></div></section></>
}

function Models({onUse}:{onUse:(n:string)=>void}){return <section><div className="section-toolbar"><div><h2>Biblioteca de modelos</h2><p>Comece rapidamente com modelos prontos para cada segmento.</p></div><div><button className="secondary"><Icon name="filter" size={17}/>Todos os segmentos</button><button className="primary"><Icon name="plus" size={17}/>Criar modelo</button></div></div><div className="template-grid">{templates.map(t=><article className="template-card" key={t.title}><div className="template-icon" style={{background:t.color}}>{t.emoji}</div><span className="segment">{t.segment}</span><h3>{t.title}</h3><p>{t.items} itens · editável · uso ilimitado</p><div><button className="secondary" onClick={()=>onUse(t.title)}>Visualizar</button><button className="primary" onClick={()=>onUse(t.title)}>Usar modelo</button></div></article>)}</div></section>}

function Generic({section,setModal}:{section:string,setModal:(v:boolean)=>void}){const content:Record<string,[string,string,string][]>={Checklists:[["Abertura da loja","12 tarefas","75%"],["Segurança mensal","20 tarefas","90%"],["Onboarding de clientes","8 tarefas","75%"]],Tarefas:[["Inspecionar extintores","Rafael S.","09:00"],["Conferir abertura da loja","Carla M.","10:30"],["Validar documentos do cliente","Juliana P.","14:00"]],Equipes:[["Operação Loja Centro","8 membros","92%"],["Manutenção","5 membros","86%"],["Administrativo","12 membros","78%"]],Relatórios:[["Conformidade operacional","Últimos 30 dias","82%"],["Produtividade por equipe","Esta semana","+12%"],["Tarefas atrasadas","Hoje","5"]],Configurações:[["Dados da organização","Operação Brasil","Ativo"],["Permissões e acessos","3 perfis","Gerenciar"],["Notificações","E-mail e push","Ativas"]]};return <section><div className="section-toolbar"><div><h2>{section}</h2><p>Acompanhe, organize e mantenha toda a operação sob controle.</p></div><button className="primary" onClick={()=>setModal(true)}><Icon name="plus" size={17}/>Adicionar</button></div><article className="data-panel"><div className="data-head"><span>Nome</span><span>Detalhes</span><span>Status</span><span></span></div>{(content[section]||[]).map((r)=><button className="data-row" key={r[0]}><span><i className="file-icon"><Icon name={section==="Equipes"?"team":section==="Relatórios"?"chart":"check"} size={19}/></i><strong>{r[0]}</strong></span><span>{r[1]}</span><span className="status">{r[2]}</span><Icon name="dots"/></button>)}</article></section>}

function CreateModal({close,create}:{close:()=>void,create:(n:string)=>void}){const [name,setName]=useState("");const [segment,setSegment]=useState("Varejo");return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal"><button className="modal-close" onClick={close}><Icon name="close"/></button><span className="modal-icon"><Icon name="check"/></span><h2>Novo checklist</h2><p>Crie uma rotina padronizada para sua equipe em poucos segundos.</p><label>Nome do checklist<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Inspeção de abertura"/></label><label>Segmento<select value={segment} onChange={e=>setSegment(e.target.value)}><option>Varejo</option><option>Construção</option><option>Saúde</option><option>Indústria</option><option>Logística</option><option>Escritórios</option><option>Outro</option></select></label><label>Responsável<select><option>Selecionar depois</option><option>Rafael Santos</option><option>Carla Mendes</option><option>Juliana Prado</option></select></label><div className="modal-actions"><button className="secondary" onClick={close}>Cancelar</button><button className="primary" disabled={!name.trim()} onClick={()=>create(name)}>Criar checklist</button></div></div></div>}
