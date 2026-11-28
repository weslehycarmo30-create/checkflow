import type { Metadata } from "next";
import { BrandLogo } from "../components/brand-logo";
import { InstallAppCta } from "../components/install-app-cta";
import { PilotCta } from "../components/landing-pilot-cta";
import { getSalesWhatsAppUrl } from "../lib/sales-contact";
import "./landing.css";

const siteUrl = "https://checkflow.tec.br";
const pageTitle = "CheckFlow | Checklists digitais para operações";
const pageDescription = "Crie checklists digitais, registre evidências e acompanhe cada etapa da operação de restaurantes, bares, buffets e eventos com o CheckFlow.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "CheckFlow",
    title: pageTitle,
    description: pageDescription,
    images: [{ url: "/brand/checkflow-og.png", width: 1200, height: 630, alt: "CheckFlow — Sua operação sob controle." }],
  },
  twitter: { card: "summary_large_image", title: pageTitle, description: pageDescription, images: ["/brand/checkflow-og.png"] },
};

const salesUrl = getSalesWhatsAppUrl(process.env.NEXT_PUBLIC_CHECKFLOW_SALES_WHATSAPP);

const faqs = [
  ["Preciso instalar algum aplicativo?", "Não. O CheckFlow funciona no navegador do celular ou do computador e também pode ser adicionado à tela inicial do celular como aplicativo."],
  ["A equipe consegue registrar fotos?", "Sim. Nos itens configurados para isso, quem executa registra a foto durante o checklist, junto com as respostas."],
  ["Consigo saber quem executou cada checklist?", "Sim. Cada execução registra a pessoa responsável, o horário e as respostas dadas."],
  ["O histórico fica registrado?", "Sim. As execuções concluídas continuam disponíveis no histórico, com respostas, evidências e não conformidades."],
  ["Os dados de uma empresa ficam separados das outras?", "Sim. Cada empresa tem o próprio espaço, e cada pessoa vê apenas o que o seu papel na equipe permite."],
  ["Para quais operações o CheckFlow serve?", "Para rotinas do dia a dia, como abertura, fechamento, higiene, conferência e montagem, em restaurantes, bares, buffets, eventos e operações parecidas."],
  ...(salesUrl ? [["Como funciona o piloto de 14 dias?", "Você escolhe uma rotina real, nós ajudamos a estruturá-la no CheckFlow em até 48 horas e sua equipe usa durante 14 dias. No fim, avaliamos juntos o resultado e a continuidade."]] : []),
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", name: "CheckFlow", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: siteUrl, description: pageDescription, inLanguage: "pt-BR" },
    { "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ],
};

const benefits = [
  ["01", "Rotinas claras", "Transforme os processos da operação em checklists digitais com responsáveis definidos."],
  ["02", "Evidências no contexto", "Registre respostas e, nos fluxos compatíveis, fotos durante a execução."],
  ["03", "Desvios visíveis", "Acompanhe não conformidades e planos de ação com o histórico da operação."],
];
const segments = [
  ["Restaurantes", "Abertura, fechamento e higiene"],
  ["Bares", "Preparação, conferência e rotina"],
  ["Buffets", "Montagem, serviço e encerramento"],
  ["Eventos", "Antes, durante e depois da operação"],
];

function ProductIllustration() {
  return <div className="cf-window" role="img" aria-label="Ilustração do painel do CheckFlow com um checklist de abertura em andamento">
    <div className="cf-window-bar"><span className="cf-window-mark">✓</span><strong>CheckFlow</strong><span className="cf-window-context">Visão geral</span><span className="cf-window-avatar">OP</span></div>
    <div className="cf-window-body"><aside className="cf-window-sidebar"><small>ESPAÇO DE TRABALHO</small><b className="cf-sidebar-active">▦ &nbsp; Visão geral</b><b>☑︎ &nbsp; Checklists</b><b>◫ &nbsp; Histórico</b><b>◎ &nbsp; Equipe</b></aside>
      <div className="cf-window-content"><div className="cf-window-heading"><div><small>PAINEL ILUSTRATIVO</small><h3>Operação em foco</h3><p>Acompanhe as rotinas em um só lugar.</p></div><span className="cf-live-pill"><i /> Visão operacional</span></div>
        <div className="cf-stat-grid"><div><span>Checklists</span><strong>Rotinas</strong><small>Estruture o trabalho</small></div><div><span>Execuções</span><strong>Registro</strong><small>Acompanhe cada etapa</small></div><div><span>Histórico</span><strong>Contexto</strong><small>Consulte o que ocorreu</small></div></div>
        <div className="cf-task-panel"><div className="cf-task-title"><strong>Checklist de abertura</strong><span>EXEMPLO</span></div><div className="cf-task-row"><i className="cf-task-check">✓</i><span>Conferir área de atendimento</span><em>Concluído</em></div><div className="cf-task-row"><i className="cf-task-check">✓</i><span>Verificar equipamentos</span><em>Concluído</em></div><div className="cf-task-row"><i className="cf-task-pending">•</i><span>Registrar evidência</span><em>Em andamento</em></div></div>
      </div></div>
  </div>;
}

export default function LandingPage() {
  return <main className="cf-landing" id="inicio">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\u003c") }} />
    <a className="cf-skip-link" href="#cf-title">Pular para o conteúdo</a>
    <header className="cf-header"><div className="cf-container cf-header-inner"><a className="cf-brand" href="#inicio" aria-label="CheckFlow, início"><BrandLogo /></a><nav aria-label="Navegação principal"><a href="#demonstracao">Demonstração</a><a href="#beneficios">Benefícios</a><a href="#segmentos">Segmentos</a><a href="#como-funciona">Como funciona</a><a href="#perguntas">Perguntas</a>{salesUrl && <a href="#piloto">Piloto</a>}</nav><div className="cf-header-actions"><a className="cf-login" href="/auth">Entrar</a><a className="cf-button cf-button-small" href={salesUrl ? "#piloto" : "/auth"}>{salesUrl ? "Começar meu piloto" : "Criar conta"} <span aria-hidden="true">↗︎</span></a></div></div></header>

    <section className="cf-hero cf-container" aria-labelledby="cf-title"><div className="cf-hero-copy"><p className="cf-eyebrow"><span /> CHECKLISTS DIGITAIS PARA OPERAÇÕES REAIS</p><h1 id="cf-title" tabIndex={-1}>Sua operação<br /><em>sob controle.</em></h1><p className="cf-lead">Crie checklists digitais, registre evidências e acompanhe cada etapa da sua operação.</p><div className="cf-hero-actions"><PilotCta /><a className="cf-text-link" href="#demonstracao">Conhecer o CheckFlow <span aria-hidden="true">↓</span></a><InstallAppCta /></div><p className="cf-hero-note">Clareza para quem executa. Visibilidade para quem acompanha.</p></div><div className="cf-hero-visual"><div className="cf-visual-glow" /><ProductIllustration /><span className="cf-visual-caption">UMA VISÃO ILUSTRATIVA DO PRODUTO</span></div></section>

    <section className="cf-demo cf-section" id="demonstracao" aria-labelledby="cf-demo-title"><div className="cf-container cf-demo-grid"><div><p className="cf-label">01 / DEMONSTRAÇÃO</p><h2 id="cf-demo-title">Da rotina no papel à operação visível.</h2><p>O CheckFlow conecta a criação do checklist, a execução pela equipe e o acompanhamento do que aconteceu. A tela acima ilustra esse fluxo; os dados exibidos são exemplos.</p><a className="cf-inline-link" href="#como-funciona">Entenda o fluxo <span aria-hidden="true">↗︎</span></a></div><div className="cf-demo-card"><div className="cf-demo-card-top"><span>FLUXO ILUSTRATIVO</span><span>01 / 03</span></div><div className="cf-demo-card-body"><span className="cf-demo-icon">✓</span><div><small>ABERTURA DA OPERAÇÃO</small><h3>Confirme cada etapa com contexto.</h3><p>Responsável, resposta e evidência ficam associados à rotina executada.</p></div></div><div className="cf-demo-steps"><span><i>✓</i> Criar</span><span><i>✓</i> Executar</span><span><i>✓</i> Acompanhar</span></div></div></div></section>

    <section className="cf-benefits cf-section cf-container" id="beneficios" aria-labelledby="cf-benefits-title"><div className="cf-section-heading"><p className="cf-label">02 / BENEFÍCIOS</p><h2 id="cf-benefits-title">Menos dúvida.<br />Mais clareza em cada turno.</h2><p>Uma estrutura simples para organizar o trabalho e manter o registro de cada execução.</p></div><div className="cf-benefit-grid">{benefits.map(([number, title, text]) => <article key={number}><span>{number}</span><div className="cf-benefit-symbol" aria-hidden="true">↗︎</div><h3>{title}</h3><p>{text}</p></article>)}</div></section>

    <section className="cf-segments cf-section" id="segmentos" aria-labelledby="cf-segments-title"><div className="cf-container"><div className="cf-section-heading"><p className="cf-label">03 / SEGMENTOS</p><h2 id="cf-segments-title">Feito para a rotina de quem opera.</h2><p>Adapte checklists aos processos da sua equipe e do seu local de trabalho.</p></div><div className="cf-segment-grid">{segments.map(([title, detail], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{detail}</p><span className="cf-segment-arrow" aria-hidden="true">↗︎</span></article>)}</div></div></section>

    <section className="cf-how cf-section cf-container" id="como-funciona" aria-labelledby="cf-how-title"><div className="cf-how-heading"><p className="cf-label">04 / COMO FUNCIONA</p><h2 id="cf-how-title">Um fluxo claro do início ao histórico.</h2><p>Cada etapa ajuda a transformar uma rotina em informação útil para a equipe.</p></div><ol><li><span>01</span><h3>Crie</h3><p>Organize a rotina em seções e itens.</p></li><li><span>02</span><h3>Atribua</h3><p>Defina quem vai executar o checklist.</p></li><li><span>03</span><h3>Registre</h3><p>Responda os itens e inclua evidências quando o fluxo permitir.</p></li><li><span>04</span><h3>Acompanhe</h3><p>Consulte execuções, desvios e histórico.</p></li></ol></section>

    <section className="cf-faq cf-section cf-container" id="perguntas" aria-labelledby="cf-faq-title"><div className="cf-section-heading"><p className="cf-label">05 / PERGUNTAS FREQUENTES</p><h2 id="cf-faq-title">O que você precisa saber antes de começar.</h2></div><div className="cf-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

    <section className="cf-contact cf-pilot cf-section" id="piloto" aria-labelledby="cf-contact-title"><div className="cf-container cf-contact-inner"><div><p className="cf-label">06 / {salesUrl ? "PILOTO CHECKFLOW" : "PRÓXIMO PASSO"}</p><h2 id="cf-contact-title">{salesUrl ? "Comece por um processo real." : "Veja como o CheckFlow se encaixa na sua operação."}</h2>{salesUrl ? <><p>Escolha uma rotina importante da sua operação. Nós ajudamos a estruturá-la no CheckFlow e sua equipe testa durante 14 dias.</p><ul className="cf-pilot-points" aria-label="Escopo do piloto"><li>1 organização</li><li>1 processo operacional</li><li>Equipe pequena</li><li>14 dias</li></ul><p className="cf-pilot-note">Implantação assistida, com estruturação inicial em até 48 horas.</p></> : <p>Crie a conta da sua empresa e monte o primeiro checklist da sua rotina em poucos minutos.</p>}</div><div className="cf-contact-action"><PilotCta className="cf-button cf-button-dark" /></div></div></section>

    <footer className="cf-footer"><div className="cf-container cf-footer-inner"><a className="cf-brand" href="#inicio" aria-label="CheckFlow, início"><BrandLogo /></a><p>Checklists digitais para uma operação mais clara.</p><nav className="cf-footer-nav" aria-label="Rodapé"><a href="#perguntas">Perguntas</a><a href="/auth">Entrar</a></nav></div></footer>
  </main>;
}
