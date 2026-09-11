"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ACTIVITY_TYPES, SDR_STAGES, enrichProspect, importProspects, parseCsv } from "../../lib/sdr-engine.mjs";
import { loadSdrProspects, saveSdrProspects } from "../../lib/sdr-storage.mjs";

type Activity = { id:string; type:string; note:string; at:string };
type Prospect = ReturnType<typeof enrichProspect> & { score?:number; tier?:string };
const templates = [
  ["Primeiro contato", "Oi, {nome}! Vi o trabalho da {empresa} em {cidade}. O CheckFlow ajuda operações a transformarem rotinas em checklists simples, com histórico e responsáveis. Posso te mostrar em 10 minutos?"],
  ["Follow-up D2", "Oi, {nome}! Passando para saber se faz sentido olhar uma forma mais simples de acompanhar a operação da {empresa}. Tenho dois horários curtos esta semana."],
  ["Follow-up D5", "{nome}, fecho minha agenda desta semana hoje. Vale reservar 10 minutos para avaliar se o CheckFlow ajuda sua equipe a reduzir falhas operacionais?"],
  ["Encerramento elegante", "Oi, {nome}. Vou encerrar este contato por agora para não insistir. Quando fizer sentido estruturar os checklists da {empresa}, posso retomar por aqui."],
] as const;
const empty = { company_name:"", instagram:"", whatsapp:"", telefone:"", email:"", cidade:"", segmento:"", tamanho_equipe:"", origem:"prospecção manual", campanha:"", coorte:"", observacoes:"", expected_revenue:"299" };

function dateLabel(value:string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short" }).format(new Date(value)); }

export default function CrmPage() {
  // SSR and the first client render are intentionally identical: no browser
  // storage, time, IDs or locale-dependent prospect values are read in render.
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [storageWritable, setStorageWritable] = useState(false);
  const [form, setForm] = useState<Record<string,string>>(empty);
  const [selected, setSelected] = useState<string>("");
  const [filter, setFilter] = useState("TODOS");
  const [notice, setNotice] = useState("Dados ficam apenas neste navegador.");
  const [importResult, setImportResult] = useState<ReturnType<typeof importProspects>|null>(null);
  const [activity, setActivity] = useState({ type:"WhatsApp", note:"" });
  const selectedProspect = prospects.find(prospect=>prospect.id===selected) || null;
  useEffect(()=>{
    const frame = window.requestAnimationFrame(() => {
      const result = loadSdrProspects(window.localStorage);
      if (result.status === "loaded") setProspects(result.prospects as Prospect[]);
      if (result.status === "invalid") setNotice("Os dados locais são inválidos e foram preservados sem alteração.");
      if (result.status === "unavailable") setNotice("O armazenamento local não está disponível; os dados não serão gravados.");
      setStorageWritable(result.status === "loaded" || result.status === "empty");
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  },[]);
  useEffect(()=>{
    if (!hydrated || !storageWritable) return;
    if (!saveSdrProspects(window.localStorage, prospects).ok) window.requestAnimationFrame(()=>setNotice("Não foi possível salvar localmente; seus dados existentes não foram apagados."));
  },[hydrated,prospects,storageWritable]);
  const visible = useMemo(()=>prospects.filter(p=>filter==="TODOS" || p.stage===filter),[prospects,filter]);
  const metrics = useMemo(()=>{
    const today = new Date().toDateString(); const researched = prospects.filter(p=>p.stage!=="RAW LEAD" && new Date(p.updated_at).toDateString()===today).length;
    const contacted = prospects.filter(p=>p.stage==="CONTATO FEITO").length;
    const demos = prospects.filter(p=>p.stage==="DEMO AGENDADA").length;
    const won = prospects.filter(p=>p.stage==="CLIENTE PAGO").length;
    const revenue = prospects.filter(p=>!["LOST","CLIENTE PAGO"].includes(p.stage)).reduce((sum,p)=>sum+p.expected_revenue,0);
    return { researched, hot:prospects.filter(p=>p.research_tier==="HOT").length, contacted, demos, conversion:prospects.length?Math.round(won/prospects.length*100):0, revenue };
  },[prospects]);
  function addProspect(event:React.FormEvent) { event.preventDefault(); const next=enrichProspect(form); if (!next.company_name) return setNotice("Informe o nome da empresa."); setProspects(current=>[next,...current]); setSelected(next.id); setForm(empty); setNotice(`${next.company_name} entrou com cadastro ${next.readiness_tier} (${next.readiness_score}/100).`); }
  function update(id:string, patch:Partial<Prospect>) { setProspects(current=>current.map(p=>p.id===id?enrichProspect({...p,...patch}):p)); }
  function importFile(event:ChangeEvent<HTMLInputElement>) { const file=event.target.files?.[0]; if (!file) return; const reader=new FileReader(); reader.onload=()=>{ const result=importProspects(parseCsv(String(reader.result)),prospects,{dryRun:true}); setImportResult(result); setNotice(`Dry-run: ${result.imported.length} prontos; ${result.conflicts.length} conflitos.`); }; reader.readAsText(file); }
  function applyImport() { if (!importResult) return; setProspects(current=>{ const updates=new Map(importResult.conflicts.filter(value=>value.updateAvailable).map(value=>[value.duplicateId,value.candidate])); return [...importResult.imported,...current.map(prospect=>{ const candidate=updates.get(prospect.id); return candidate ? {...prospect,research_score:candidate.research_score,research_tier:candidate.research_tier,campanha:candidate.campanha||prospect.campanha,coorte:candidate.coorte||prospect.coorte,origem:candidate.origem||prospect.origem} : prospect; })]; }); setNotice(`${importResult.imported.length} novos e ${importResult.conflicts.filter(value=>value.updateAvailable).length} pesquisas atualizadas; timelines preservadas.`); setImportResult(null); }
  function logActivity() { if (!selectedProspect || !activity.note.trim()) return; const entry:Activity={id:crypto.randomUUID(),type:activity.type,note:activity.note.trim(),at:new Date().toISOString()}; update(selectedProspect.id,{timeline:[entry,...selectedProspect.timeline]}); setActivity(value=>({...value,note:""})); setNotice("Atividade registrada na timeline."); }
  if (!hydrated) return <main className="sdr-shell" aria-busy="true"><header className="sdr-header"><Link href="/" className="sdr-back">← CheckFlow</Link><div><p className="sdr-eyebrow">CRMFACTORY × CHECKFLOW</p><h1>SDR Command Center</h1></div><span className="sdr-local">● Local-only</span></header><section className="sdr-hydration-shell"><p className="sdr-eyebrow">CRM SDR</p><h2>Carregando dados locais…</h2><p>O pipeline será exibido após verificar o armazenamento deste navegador.</p></section></main>;
  return <main className="sdr-shell">
    <header className="sdr-header"><Link href="/" className="sdr-back">← CheckFlow</Link><div><p className="sdr-eyebrow">CRMFACTORY × CHECKFLOW</p><h1>SDR Command Center</h1></div><span className="sdr-local">● Local-only</span></header>
    <section className="sdr-metrics">
      {[["Pesquisados hoje",metrics.researched,"#dff5ed"],["Leads HOT",metrics.hot,"#fff0cb"],["Contatos enviados",metrics.contacted,"#e2efff"],["Demos agendadas",metrics.demos,"#eee5ff"],["Conversão",`${metrics.conversion}%`,"#e7f4f4"],["Receita prevista",`R$ ${metrics.revenue.toLocaleString("pt-BR")}`,"#f7e8ee"]].map(([label,value,color])=><article key={String(label)} className="sdr-kpi" style={{background:String(color)}}><small>{label}</small><strong>{value}</strong></article>)}
    </section>
    <p className="sdr-notice">{notice}</p>
    <section className="sdr-workspace">
      <div className="sdr-main">
        <div className="sdr-toolbar"><div><h2>Pipeline comercial</h2><p>Pipeline dedicado; não usa estados de deals.</p></div><label className="sdr-import">Importar CSV<input type="file" accept=".csv,text/csv" onChange={importFile}/></label></div>
        <div className="sdr-stages">{SDR_STAGES.map(stage=><button key={stage} className={filter===stage?"active":""} onClick={()=>setFilter(filter===stage?"TODOS":stage)}>{stage}<b>{prospects.filter(p=>p.stage===stage).length}</b></button>)}</div>
        {importResult && <div className="sdr-import-result"><strong>Dry-run concluído</strong><span>{importResult.imported.length} novos · {importResult.conflicts.filter(value=>value.updateAvailable).length} atualizações · {importResult.conflicts.filter(value=>!value.updateAvailable).length} sem alteração</span><button onClick={applyImport}>Aplicar novos e atualizações de pesquisa</button>{importResult.conflicts.map(conflict=><small key={`${conflict.row}-${conflict.reason}`}>Linha {conflict.row}: {conflict.updateAvailable?"atualização disponível":conflict.reason}{conflict.duplicate?` — ${conflict.duplicate}`:""}</small>)}</div>}
        <div className="sdr-table"><div className="sdr-row sdr-head"><span>Empresa</span><span>FIT / Cadastro</span><span>Etapa</span><span>Cidade</span></div>{visible.length?visible.map(p=><button className={`sdr-row ${selected===p.id?"selected":""}`} key={p.id} onClick={()=>setSelected(p.id)}><span><b>{p.company_name}</b><small>{p.segmento || "Sem segmento"}</small></span><span>{p.research_score===undefined?"FIT —":<><i className={`sdr-tier ${(p.research_tier||"").toLowerCase()}`}>{p.research_tier}</i> {p.research_score}</>}<small>Cadastro {p.readiness_score ?? p.score ?? 0}</small></span><span>{p.stage}</span><span>{p.cidade || "—"}</span></button>):<p className="sdr-empty">Nenhum prospect nesta etapa.</p>}</div>
      </div>
      <aside className="sdr-detail">{selectedProspect ? <>
        <div className="sdr-detail-head"><div><p className="sdr-eyebrow">PROSPECT</p><h2>{selectedProspect.company_name}</h2><span>{selectedProspect.cidade || "Cidade não informada"} · {selectedProspect.segmento || "Segmento não informado"}</span><span>FIT: {selectedProspect.research_score===undefined?"não pesquisado":`${selectedProspect.research_score} / ${selectedProspect.research_tier}`} · Cadastro: {selectedProspect.readiness_score ?? selectedProspect.score ?? 0} / {selectedProspect.readiness_tier ?? selectedProspect.tier ?? "COLD"}</span></div><b className={`sdr-score ${(selectedProspect.research_tier||selectedProspect.readiness_tier||selectedProspect.tier||"cold").toLowerCase()}`}>{selectedProspect.research_score ?? selectedProspect.readiness_score ?? selectedProspect.score ?? 0}<small>/100</small></b></div>
        <label>Etapa<select value={selectedProspect.stage} onChange={e=>update(selectedProspect.id,{stage:e.target.value})}>{SDR_STAGES.map(stage=><option key={stage}>{stage}</option>)}</select></label>
        <div className="sdr-contact"><span>WhatsApp: {selectedProspect.whatsapp || "—"}</span><span>Instagram: {selectedProspect.instagram || "—"}</span><span>E-mail: {selectedProspect.email || "—"}</span><span>Equipe: {selectedProspect.tamanho_equipe || "—"}</span></div>
        <section className="sdr-timeline"><h3>Timeline</h3><div className="sdr-activity"><select value={activity.type} onChange={e=>setActivity({...activity,type:e.target.value})}>{ACTIVITY_TYPES.map(type=><option key={type}>{type}</option>)}</select><input value={activity.note} onChange={e=>setActivity({...activity,note:e.target.value})} placeholder="Registrar interação"/><button onClick={logActivity}>Registrar</button></div>{selectedProspect.timeline.length?selectedProspect.timeline.map((item:Activity)=><article key={item.id}><b>{item.type}</b><p>{item.note}</p><small>{dateLabel(item.at)}</small></article>):<p className="sdr-empty">Ainda sem contatos registrados.</p>}</section>
        <section className="sdr-templates"><h3>Templates WhatsApp</h3>{templates.map(([title,copy])=><button key={title} onClick={()=>navigator.clipboard?.writeText(copy.replaceAll("{empresa}",selectedProspect.company_name).replaceAll("{nome}",""))}><b>{title}</b><span>{copy}</span></button>)}</section>
      </> : <p className="sdr-empty">Selecione um prospect para abrir a ficha e timeline.</p>}</aside>
    </section>
    <section className="sdr-create"><div><p className="sdr-eyebrow">NOVO PROSPECT</p><h2>Adicionar ao pipeline</h2><p>Score: empresa 10, cidade 10, segmento 15, contato 15, canal 10, equipe até 20, ICP 10, campanha/coorte 5, indicação 5. HOT ≥ 85.</p></div><form onSubmit={addProspect}>{Object.entries(empty).map(([key])=><label key={key}>{key.replaceAll("_"," ")}<input value={form[key]} type={key==="tamanho_equipe"||key==="expected_revenue"?"number":"text"} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}<button type="submit">Adicionar prospect</button></form></section>
  </main>;
}
