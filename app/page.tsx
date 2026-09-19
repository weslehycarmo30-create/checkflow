"use client";

import { getSalesWhatsAppUrl } from "../lib/sales-contact";

const processSteps = [
  ["01", "Crie o processo", "Estruture modelos, seções e itens para a rotina que importa."],
  ["02", "Defina responsáveis", "Atribua a execução para que cada pessoa saiba o que precisa assumir."],
  ["03", "Execute pelo celular", "A equipe registra a rotina na interface web, onde estiver trabalhando."],
  ["04", "Registre evidências", "Respostas e fotos ficam ligadas à execução quando o fluxo pede comprovação."],
  ["05", "Trate não conformidades", "Transforme o que deu errado em um plano de ação com responsável e prazo."],
  ["06", "Consulte o histórico", "Volte a cada execução para entender o que aconteceu e acompanhar a operação."],
];

const questions = [
  ["O CheckFlow funciona no celular?", "Sim. A interface web é preparada para a execução pelo celular. Não é necessário um aplicativo nativo."],
  ["Preciso instalar alguma coisa?", "Não. O CheckFlow é acessado pela web, usando o navegador."],
  ["Posso registrar fotos?", "Sim, nos itens e fluxos em que a evidência fotográfica é suportada."],
  ["Consigo saber quem executou?", "Sim. As execuções registram o responsável conforme o fluxo e as permissões da operação."],
  ["O histórico fica registrado?", "Sim. As execuções concluídas permanecem disponíveis no histórico do CheckFlow."],
  ["Posso registrar problemas encontrados durante a execução?", "Sim. Não conformidades podem gerar um plano de ação com responsável e prazo."],
  ["O que acontece depois dos 15 dias?", "Após o piloto, avaliamos juntos o resultado e a continuidade da operação no CheckFlow."],
];

function Arrow() { return <span aria-hidden="true" className="marketing-arrow">→</span>; }
function Check() { return <span aria-hidden="true" className="marketing-check">✓</span>; }
const salesWhatsAppUrl = getSalesWhatsAppUrl(process.env.NEXT_PUBLIC_CHECKFLOW_SALES_WHATSAPP);

function PilotCta() {
  return salesWhatsAppUrl
    ? <a className="marketing-button primary" href={salesWhatsAppUrl} target="_blank" rel="noreferrer">Começar meu piloto <Arrow /></a>
    : <button className="marketing-button primary" type="button" disabled aria-describedby="sales-contact-pending">Começar meu piloto <Arrow /></button>;
}

export default function MarketingPage() {
  return <main className="marketing-shell">
    <header className="marketing-nav">
      <a className="marketing-brand" href="#inicio" aria-label="CheckFlow, início"><span>✓</span>CheckFlow</a>
      <nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#produto">Produto</a><a href="#piloto">Piloto</a></nav>
      <a className="marketing-login" href="/auth">Entrar <Arrow /></a>
    </header>

    <section className="marketing-hero" id="inicio" aria-labelledby="hero-title">
      <div className="marketing-hero-copy">
        <p className="marketing-kicker">CONTROLE OPERACIONAL PARA EQUIPES</p>
        <h1 id="hero-title">Sua operação sob controle.<br />Mesmo quando você não está olhando.</h1>
        <p className="marketing-lead">O CheckFlow organiza processos operacionais, define responsáveis, registra evidências e mostra o que foi feito, o que deu errado e o que precisa ser corrigido.</p>
        <div className="marketing-actions"><PilotCta /><a className="marketing-button secondary" href="#como-funciona">Ver como funciona</a></div>
        <p className="marketing-helper">Para restaurantes, bares, buffets, eventos e equipes de operação.</p>
      </div>
      <ProductPreview />
    </section>

    <section className="marketing-section marketing-problem" aria-labelledby="problem-title">
      <div><p className="marketing-kicker">VISIBILIDADE OPERACIONAL</p><h2 id="problem-title">Você sabe o que realmente aconteceu na sua operação hoje?</h2></div>
      <div className="marketing-problem-content"><div className="marketing-questions">{["Foi feito?", "Quem fez?", "Que horas?", "Tem foto?", "O problema foi corrigido?", "Quem ficou responsável?", "Isso aconteceu novamente?"].map(question => <span key={question}>{question}</span>)}</div><p>Quando essas respostas dependem de memória, mensagens ou de perguntar para alguém, o gestor não possui visibilidade suficiente da operação.</p></div>
    </section>

    <section className="marketing-section" id="como-funciona" aria-labelledby="how-title">
      <div className="marketing-centered-heading"><p className="marketing-kicker">UM FLUXO CLARO</p><h2 id="how-title">Da rotina ao acompanhamento, sem depender de cobrança manual.</h2></div>
      <ol className="marketing-steps">{processSteps.map(([number, title, text]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
    </section>

    <section className="marketing-section marketing-product-section" id="produto" aria-labelledby="product-title">
      <div className="marketing-product-copy"><p className="marketing-kicker">O PRODUTO EM AÇÃO</p><h2 id="product-title">Da tarefa à evidência.</h2><p>Um processo não termina quando alguém diz que fez. Ele fica registrado: execução, status, evidências, problemas e o que foi feito para corrigir.</p><ul><li><Check />Checklists com seções e itens</li><li><Check />Respostas, status e evidência fotográfica</li><li><Check />Não conformidades e planos de ação</li><li><Check />Histórico de execuções</li></ul></div>
      <ProductDetail />
    </section>

    <section className="marketing-section" aria-labelledby="uses-title"><div className="marketing-centered-heading"><p className="marketing-kicker">PROCESSOS DO DIA A DIA</p><h2 id="uses-title">Um sistema. Diferentes rotinas operacionais.</h2></div><div className="marketing-use-grid">{[["Restaurantes", "Abertura · Fechamento · Higiene · Estoque · Equipamentos"], ["Bares", "Abertura do bar · Mise en place · Conferência · Fechamento"], ["Eventos", "Montagem · Operação · Desmontagem · Equipamentos · Conferência final"], ["Buffets", "Preparação · Cozinha · Salão · Montagem · Encerramento"]].map(([title,text]) => <article key={title}><span className="marketing-use-icon">↗</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

    <section className="marketing-section marketing-manager" aria-labelledby="manager-title"><div><p className="marketing-kicker">PARA QUEM GERE A OPERAÇÃO</p><h2 id="manager-title">Pare de perguntar se foi feito.<br />Veja.</h2><p>Em vez de depender de conversas soltas, acompanhe o contexto de cada execução em um só lugar.</p></div><div className="marketing-visibility-card"><div><span>Responsável</span><strong>Marina Souza</strong></div><div><span>Status</span><strong className="success">Concluído</strong></div><div><span>Horário</span><strong>18 set · 07:42</strong></div><div><span>Evidência</span><strong>Foto registrada</strong></div><div><span>Problema</span><strong className="warning">1 não conformidade</strong></div><div><span>Ação corretiva</span><strong>Responsável e prazo</strong></div><footer><span>Histórico</span><span>Execução registrada</span></footer></div></section>

    <section className="marketing-pilot" id="piloto" aria-labelledby="pilot-title"><div className="marketing-pilot-copy"><p className="marketing-kicker">PILOTO COMERCIAL</p><h2 id="pilot-title">Comece por um processo real.</h2><p>Escolha uma rotina importante da sua operação. Nós ajudamos a estruturá-la no CheckFlow e sua equipe testa durante 15 dias.</p><div className="marketing-pilot-points"><span>1 processo</span><i>+</i><span>implantação assistida</span><i>+</i><span>equipe pequena</span><i>+</i><span>15 dias</span></div><small>Sem precisar transformar toda a sua operação de uma vez.</small><div className="marketing-pilot-action"><PilotCta />{!salesWhatsAppUrl && <p id="sales-contact-pending" role="status">O canal comercial ainda não está configurado neste ambiente.</p>}</div></div><div className="marketing-pilot-aside"><span aria-hidden="true" className="marketing-check">✓</span><h3>Implantação assistida</h3><p>O piloto começa por uma rotina que sua equipe já precisa executar. A configuração é feita junto com você.</p></div></section>

    <section className="marketing-section marketing-faq" aria-labelledby="faq-title"><div className="marketing-centered-heading"><p className="marketing-kicker">DÚVIDAS FREQUENTES</p><h2 id="faq-title">O que você precisa saber antes de começar.</h2></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>

    <section className="marketing-final" aria-labelledby="final-title"><p className="marketing-kicker">PRÓXIMO PASSO</p><h2 id="final-title">Escolha um processo que hoje depende de cobrança manual.</h2><p>Vamos colocá-lo sob controle.</p><PilotCta /></section>
    <footer className="marketing-footer"><a className="marketing-brand" href="#inicio"><span>✓</span>CheckFlow</a><p>Controle operacional para equipes.</p><a href="/auth">Entrar</a></footer>
  </main>;
}

function ProductPreview() { return <div className="marketing-preview" aria-label="Representação da tela de execução do CheckFlow"><div className="preview-top"><span className="preview-logo">✓</span><span>CheckFlow</span><i></i><span className="preview-avatar">MS</span></div><div className="preview-body"><aside><small>OPERAÇÃO</small><b>Visão geral</b><b className="selected">Checklists</b><b>Planos de ação</b><b>Histórico</b></aside><section><p>OPERAÇÃO · BISTRÔ CENTRAL</p><h3>Abertura do restaurante</h3><div className="preview-progress"><span>8 de 12 itens concluídos</span><b>67%</b><i><em /></i></div><article><span className="preview-done">✓</span><div><b>Conferir abertura do salão</b><small>Respondido por Marina Souza</small></div><strong>Concluído</strong></article><article><span className="preview-photo">▧</span><div><b>Registrar temperatura da câmara</b><small>Evidência fotográfica</small></div><strong className="preview-open">Em execução</strong></article><article><span className="preview-alert">!</span><div><b>Checar equipamentos</b><small>Não conformidade registrada</small></div><strong className="preview-warning">Atenção</strong></article></section></div></div> }
function ProductDetail() { return <div className="marketing-detail-product" aria-label="Detalhe de uma não conformidade e plano de ação"><header><span>Execução em andamento</span><b>08:14</b></header><div className="detail-product-title"><span className="preview-alert">!</span><div><small>NÃO CONFORMIDADE</small><h3>Equipamento sem identificação</h3></div></div><p>Registrada durante a abertura do restaurante.</p><div className="detail-action"><small>PLANO DE AÇÃO</small><strong>Identificar equipamento e atualizar registro</strong><div><span>Responsável: Carlos Lima</span><span>Prazo: hoje, 10:00</span></div></div><footer><span>Foto anexada</span><b>Ver no histórico <Arrow /></b></footer></div> }
