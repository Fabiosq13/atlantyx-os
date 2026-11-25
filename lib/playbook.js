// lib/playbook.js — v3.600 · PLAYBOOK 2027: o Norte de marketing e vendas da Atlantyx
// O Playbook nasce do Plano Estratégico vigente (est:plano_estr:vigente) e o acompanha: metas, ofertas e pesos são lidos do plano
// a cada uso; quando a ESTRUTURA do plano muda (alavancas, ofertas, prioridades, metas) ele avisa que está defasado.
// Dentro dele: verticais (cada tipo de cliente), ângulos de comportamento por vertical, funil com responsáveis, regras de ajuste.
// Aprendizado: cada campanha registra (vertical, ângulo); os leads que chegam (utm) viram pontos; o peso de cada vertical/ângulo
// sobe ou desce sozinho (limites 0,4× a 2,5×), com registro de cada ajuste. O agente de marketing e o time de vendas leem DAQUI.
// Guardado em kv_store (sem DDL): mkt:playbook · mkt:playbook:versoes · mkt:playbook:historico
import { ICP_SETORES, ICP_RESUMO } from './icp.js';
import { planoNormalizar, planoSimular } from './plano-estrategico.js';

export const K_PB = 'mkt:playbook', K_PB_VERSOES = 'mkt:playbook:versoes', K_PB_HIST = 'mkt:playbook:historico';
export const MULT_MIN = 0.4, MULT_MAX = 2.5;

const txt = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const lista = (a, n, m) => (Array.isArray(a) ? a : []).map(x => txt(x, n)).filter(Boolean).slice(0, m);
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const PROIBIDO = /\b(cpfl|enel|caixa capitaliza[cç][aã]o|jelta)\b/gi;        // nome de cliente real nunca entra em texto de playbook
const limpo = s => String(s ?? '').replace(PROIBIDO, 'um cliente do setor');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const agoraISO = () => new Date().toISOString();
const r2 = x => Math.round(x * 100) / 100;

// ── Biblioteca de ângulos de comportamento (princípios de decisão de compra B2B) ─────────────────────────────────────────
// formato: gancho-modelo; {dor} {gatilho} {setor} são trocados pela vertical. Nunca inventar número: o gancho nunca traz estatística.
export const ANGULOS = [
  { id: 'perda', nome: 'Custo de não agir', principio: 'Aversão à perda: a dor de perder pesa mais que o ganho de ganhar. Mostre o que a empresa deixa escapar a cada mês sem agir.', formato: 'O que {dor} custa por mês à sua empresa — e quem já percebeu isso agiu antes do {gatilho}?' },
  { id: 'prova_setorial', nome: 'Prova do próprio setor', principio: 'Prova social: decisores confiam em quem já resolveu o mesmo problema no mesmo setor.', formato: 'Como empresas de {setor} estão resolvendo {dor} sem trocar de sistema' },
  { id: 'autoridade', nome: 'Autoridade do fundador', principio: 'Autoridade: quem tem 17 anos de dados e IA em empresas grandes fala com credibilidade a outro C-level.', formato: 'O que 17 anos de projetos de dados e IA ensinaram sobre {dor}' },
  { id: 'benchmark', nome: 'Comparação com pares', principio: 'Comparação social: o decisor quer saber onde está em relação aos pares do setor.', formato: 'Sua operação de {setor} está no nível dos pares em {dor}? Veja como se medir' },
  { id: 'risco_zero', nome: 'Risco zero para começar', principio: 'Redução de risco: quem teme errar precisa de uma entrada pequena, reversível e sem compromisso.', formato: 'Comece sem risco: veja 3 oportunidades concretas para {dor}, sem reunião e sem custo' },
  { id: 'lacuna', nome: 'Lacuna de curiosidade', principio: 'Lacuna de informação: uma pergunta específica que o leitor não sabe responder gera clique qualificado.', formato: 'Você sabe quanto {dor} representa hoje? A maioria dos decisores só descobre no {gatilho}' },
  { id: 'reciprocidade', nome: 'Valor antes do pedido', principio: 'Reciprocidade: entregar algo útil antes de pedir a reunião cria disposição para conversar.', formato: 'Preparamos um mapa de oportunidades para {setor}, grátis: é seu antes de qualquer conversa' },
  { id: 'status', nome: 'Ambição do C-level', principio: 'Status e reputação: o decisor responde pelo resultado diante do conselho e quer parecer o líder que antecipou.', formato: 'O que o conselho vai cobrar de {setor} no próximo ciclo — e como chegar com resposta pronta sobre {dor}' },
  { id: 'simplicidade', nome: 'Baixo esforço', principio: 'Simplicidade: quanto menor o esforço percebido, maior a chance de o executivo ocupado agir.', formato: 'Sem reunião e sem formulário longo: receba no WhatsApp 3 oportunidades para {dor}' },
  { id: 'janela', nome: 'Janela de tempo', principio: 'Urgência legítima: um evento real (fechamento, auditoria, revisão) cria prazo natural para decidir.', formato: 'Com o {gatilho} chegando, {dor} deixa de ser tema para depois' },
  { id: 'contraste', nome: 'Antes e depois', principio: 'Contraste: mostrar a rotina atual (planilha, dado atrasado) ao lado da rotina possível torna a mudança concreta.', formato: 'Hoje: {dor}. Possível: decisão com o número do dia. O caminho entre os dois' },
];
const ANG = Object.fromEntries(ANGULOS.map(a => [a.id, a]));

// ── Verticais base (hipóteses iniciais a validar pelos resultados; sem nome de cliente e sem estatística inventada) ───────
const V = (id, nome, o) => ({ id, nome, ...o });
export const VERTICAIS_BASE = [
  V('energia', 'Energia e utilities', { porte: 'Grandes e médias-superiores', por_que_agora: 'Setor regulado, com dado de ativos, medição e mercado que precisa chegar a tempo de decidir.',
    decisores: ['CEO', 'CFO', 'CIO', 'Diretor de Operações', 'Diretor de Regulação'], dores: ['dado de operação e medição que chega atrasado ou inconsistente', 'risco regulatório por informação fora do prazo', 'decisão de compra e despacho com número velho'],
    gatilhos: ['revisão tarifária ou regulatória', 'auditoria', 'fechamento do trimestre'], linguagem: 'Confiabilidade, perda, disponibilidade, regulatório. Frases curtas, números do negócio dele.', evitar: ['jargão técnico de dados (pipeline, deploy, stack)', 'prometer percentual sem base'],
    objecoes: [{ objecao: 'Já temos TI interna', resposta: 'A Atlantyx entra onde o time está no limite: carga de dados, qualidade e indicadores com SLA, sem substituir a equipe.' }, { objecao: 'Dado é sensível', resposta: 'Começamos com dados sintéticos e ambiente isolado; só depois de aprovado entra dado real.' }],
    alavancas: ['dados-projetos', 'dados-sustentacao', 'resultado-diagnostico'], angulos: ['janela', 'prova_setorial', 'perda', 'autoridade', 'contraste'] }),
  V('financeiro', 'Bancos e seguradoras', { porte: 'Grandes e médias-superiores', por_que_agora: 'Crédito, risco e jornada comercial dependem de dado e de resposta rápida; o tempo de resposta decide a conversão.',
    decisores: ['CEO', 'CFO', 'CRO', 'CIO', 'Diretor Comercial'], dores: ['inadimplência e risco percebidos tarde', 'relatório regulatório montado à mão', 'lead comercial que esfria sem resposta'],
    gatilhos: ['fechamento do mês', 'auditoria', 'meta de captação do trimestre'], linguagem: 'Risco, retorno, conversão, prazo regulatório. Fale em margem e perda evitada.', evitar: ['tom de fornecedor de TI', 'promessa de resultado sem linha de base'],
    objecoes: [{ objecao: 'Regulação nos impede', resposta: 'Trabalhamos dentro do ambiente e das regras do cliente; a entrada é um diagnóstico sem tocar em dado sensível.' }, { objecao: 'Já usamos outro fornecedor', resposta: 'O Mapa de Oportunidades é complementar e leva 1 dia útil; compare sem trocar nada.' }],
    alavancas: ['resultado-sucesso', 'agente-comercial', 'resultado-diagnostico'], angulos: ['perda', 'benchmark', 'risco_zero', 'status', 'prova_setorial'] }),
  V('industria', 'Indústria', { porte: 'Médias e grandes', por_que_agora: 'Margem por produto e por planta ainda vive em planilha; quem enxerga o custo real decide melhor.',
    decisores: ['CEO', 'CFO', 'COO', 'Diretor Industrial', 'Dono'], dores: ['margem que some sem causa visível', 'processo crítico rodando em planilha sem custo mapeado', 'decisão de produção com dado do mês passado'],
    gatilhos: ['fechamento do trimestre', 'revisão de orçamento', 'pressão de custo'], linguagem: 'Margem, custo por produto, parada, produtividade. Exemplos de chão de fábrica traduzidos em dinheiro.', evitar: ['conceitos de ciência de dados', 'conteúdo para engenheiro e analista'],
    objecoes: [{ objecao: 'Nossa operação é diferente', resposta: 'Por isso o mapa parte dos seus dados e processos, não de modelo pronto.' }, { objecao: 'Não temos equipe de dados', resposta: 'A Atlantyx entrega e mantém; o seu time só valida o resultado.' }],
    alavancas: ['dados-projetos', 'resultado-diagnostico', 'resultado-sucesso'], angulos: ['perda', 'contraste', 'simplicidade', 'benchmark', 'reciprocidade'] }),
  V('infraestrutura', 'Infraestrutura', { porte: 'Grandes e médias-superiores', por_que_agora: 'Portfólios de obras e projetos longos escondem o atraso até ele virar custo.',
    decisores: ['CEO', 'CFO', 'Diretor de Projetos', 'Diretor de Operações'], dores: ['portfólio de projetos que só mostra o atraso quando já custou', 'custo e prazo consolidados à mão', 'indicador de entrega sem fonte única'],
    gatilhos: ['marco contratual', 'medição mensal', 'revisão de portfólio'], linguagem: 'Prazo, custo, marco, aditivo, medição. Mostrar previsibilidade.', evitar: ['promessa de eliminar atraso', 'termos de software'],
    objecoes: [{ objecao: 'Já temos ferramenta de projetos', resposta: 'Não substituímos: ligamos os dados que já existem num único painel de decisão.' }],
    alavancas: ['dados-projetos', 'dados-sustentacao'], angulos: ['janela', 'contraste', 'autoridade', 'lacuna', 'prova_setorial'] }),
  V('varejo', 'Varejo de grande porte', { porte: 'Grandes', por_que_agora: 'Margem por loja e por canal e atribuição de campanha dependem de dado integrado; o lead e o cliente esfriam rápido.',
    decisores: ['CEO', 'CFO', 'Diretor Comercial', 'Diretor de Marketing', 'CIO'], dores: ['margem por loja e canal vista tarde', 'campanha sem atribuição clara de resultado', 'atendimento comercial lento que perde venda'],
    gatilhos: ['sazonalidade de vendas', 'revisão de mix', 'meta do trimestre'], linguagem: 'Venda, margem, conversão, giro. Resultado de caixa.', evitar: ['jargão de dados', 'cases sem relação com varejo'],
    objecoes: [{ objecao: 'Já temos BI', resposta: 'O BI mostra o passado; o agente age em cima dele, na hora, no WhatsApp e no e-mail.' }],
    alavancas: ['agente-comercial', 'resultado-sucesso', 'resultado-diagnostico'], angulos: ['simplicidade', 'perda', 'benchmark', 'reciprocidade', 'status'] }),
  V('servicos', 'Serviços de grande porte', { porte: 'Grandes e médias-superiores', por_que_agora: 'Margem de contrato e ocupação de equipe decidem o resultado; sem dado integrado, o desvio é visto tarde.',
    decisores: ['CEO', 'CFO', 'COO', 'Diretor de Pessoas', 'Diretor Comercial'], dores: ['margem por contrato percebida tarde', 'ocupação e custo por hora sem visão única', 'proposta e renovação sem previsibilidade'],
    gatilhos: ['renovação de contratos', 'fechamento do mês', 'revisão de preços'], linguagem: 'Margem do contrato, ocupação, renovação, previsibilidade.', evitar: ['promessa genérica de IA', 'conteúdo técnico'],
    objecoes: [{ objecao: 'Nosso modelo é artesanal', resposta: 'O mapa respeita o seu modelo e mostra onde dá para ganhar tempo e margem sem engessar.' }],
    alavancas: ['agente-comercial', 'resultado-diagnostico', 'dados-projetos'], angulos: ['perda', 'contraste', 'autoridade', 'status', 'simplicidade'] }),
];

// ── Funil (as etapas da Floresta de Vendas) com o agente virtual responsável por cada uma ─────────────────────────────────
export const FUNIL_BASE = [
  { etapa: 'frio', nome: 'Lead frio', agente: 'prospector', objetivo: 'Achar e enriquecer contatos do ICP (decisores) e entregá-los ao fluxo certo por porte e vertical.', saida: 'Contato com cargo decisor confirmado e canal definido (WhatsApp, e-mail ou telefone).' },
  { etapa: 'atendimento_iara', nome: 'Atendimento IARA', agente: 'iara', objetivo: 'Primeira abordagem por WhatsApp com o ângulo da vertical.', saida: 'Resposta do lead ou fim da cadência.' },
  { etapa: 'abordado', nome: 'Abordado', agente: 'sdr_email', objetivo: 'Abordagem por e-mail e por voz nos leads sem WhatsApp ou sem resposta; mesma vertical, ângulo diferente.', saida: 'Resposta, interesse ou fim da cadência.' },
  { etapa: 'engajado', nome: 'Engajado', agente: 'qualificador', objetivo: 'Conversar e entender dor, momento, decisor e orçamento (qualificação).', saida: 'Lead qualificado ou descartado com motivo.' },
  { etapa: 'qualificado', nome: 'Qualificado', agente: 'agendador', objetivo: 'Marcar a reunião: lead quente que ainda não marcou recebe convite com a agenda.', saida: 'Reunião marcada.' },
  { etapa: 'reuniao', nome: 'Reunião', agente: 'preparador', objetivo: 'Preparar o briefing da reunião (empresa, decisor, dor, ângulo que funcionou) e confirmar presença.', saida: 'Reunião realizada e resultado registrado.' },
  { etapa: 'proposta', nome: 'Proposta', agente: 'proposta', objetivo: 'Montar a proposta ou o POC dentro da política comercial e do rate card.', saida: 'Proposta entregue.' },
  { etapa: 'negociacao', nome: 'Negociação', agente: 'closer', objetivo: 'Conduzir objeções, prazos e condições até a decisão.', saida: 'Ganho ou perdido com motivo.' },
  { etapa: 'cliente', nome: 'Cliente', agente: 'cs', objetivo: 'Pós-venda, expansão e indicação.', saida: 'Expansão ou renovação.' },
  { etapa: 'remarketing', nome: 'Remarketing e congelado', agente: 'remarketing', objetivo: 'Reativar quem esfriou, com novo ângulo e novo gatilho.', saida: 'Lead reativado ou arquivado.' },
];
export const CANAIS_BASE = [
  { id: 'linkedin', nome: 'LinkedIn', papel: 'Autoridade e geração de demanda para decisores; principal rede orgânica e paga B2B.', esforco: 45 },
  { id: 'instagram', nome: 'Instagram', papel: 'Apoio de marca e remarketing; só manter volume se gerar lead do ICP.', esforco: 10 },
  { id: 'whatsapp', nome: 'WhatsApp (IARA)', papel: 'Primeira abordagem e conversa; resposta rápida ao lead que chega.', esforco: 20 },
  { id: 'email', nome: 'E-mail', papel: 'Cadência de abordagem e convite de reunião para lead quente.', esforco: 15 },
  { id: 'voz', nome: 'Ligação (IARA de voz)', papel: 'Segundo contato nos leads sem resposta; só em horário comercial, com limite de minutos.', esforco: 5 },
  { id: 'webinar', nome: 'Webinar e Atlantyx TV', papel: 'Autoridade do fundador e captura de leads qualificados.', esforco: 5 },
];
export const REGRAS_BASE = [
  { id: 'r_sem_retorno', se: 'um ângulo acumula 5 ou mais campanhas e nenhuma gerou lead, enquanto a média gera', entao: 'reduzir o peso dele ao mínimo e marcá-lo "em revisão" (o fundador pode devolver o peso)', auto: true },
  { id: 'r_vencedor', se: 'um ângulo ou vertical entrega 50% mais pontos que a média, com 3 ou mais campanhas', entao: 'aumentar o peso gradualmente (até 2,5 vezes) e repetir o ângulo em outra vertical como teste', auto: true },
  { id: 'r_vertical_fria', se: 'uma vertical acumula 8 ou mais campanhas sem nenhum lead decisor', entao: 'pausar a vertical e pedir ao fundador revisão da hipótese', auto: true },
  { id: 'r_exploracao', se: 'toda rodada diária', entao: 'reservar cerca de 1 em cada 3 campanhas para testar uma combinação vertical × ângulo pouco testada', auto: true },
  { id: 'r_plano', se: 'a estrutura do Plano Estratégico muda (alavancas, ofertas, prioridades ou metas)', entao: 'sincronizar metas, ofertas e pesos na hora e marcar o texto do Playbook como defasado para regenerar', auto: true },
  { id: 'r_pos_captura', se: 'há leads e nenhuma reunião marcada em 14 dias', entao: 'alertar gargalo pós-captura: priorizar resposta em até 2 horas e convite de agenda para lead quente', auto: false },
];

// ── Plano ↔ Playbook ─────────────────────────────────────────────────────────────────────────────────────────────────────
function fnv(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
const hex = n => n.toString(16).padStart(8, '0');
// hash só da ESTRUTURA do plano (pesos mudam ao vivo e não contam)
export function planoHash(plano) {
  if (!plano) return 'sem-plano'; const P = planoNormalizar(plano);
  return hex(fnv(JSON.stringify({ n: P.nome, h: P.horizonte, m: P.metas, pr: P.prioridades, a: P.alavancas.map(a => [a.id, a.status, a.oferta, a.publico, a.dor, a.receita_meta]) })));
}
function ofertasDoPlano(plano) {
  if (!plano) return [];
  const P = planoNormalizar(plano), pesoTot = P.alavancas.filter(a => a.status !== 'pausada').reduce((s, a) => s + a.peso_campanha, 0);
  return P.alavancas.filter(a => a.status !== 'pausada').map(a => ({ alavanca_id: a.id, nome: a.nome, grupo: a.grupo, status: a.status, oferta: a.oferta, publico: a.publico, dor: a.dor, prova: a.prova, recorrente: a.recorrente, receita_meta: a.receita_meta, margem_pct: a.margem_pct, peso_plano_pct: pesoTot ? r2(a.peso_campanha / pesoTot * 100) : 0 }));
}
function metasDoPlano(plano) {
  if (!plano) return {}; const P = planoNormalizar(plano), S = planoSimular(P);
  return { faturamento: P.metas.faturamento, margem_pct: P.metas.margem_pct, recorrente_pct: P.metas.recorrente_pct, crescimento_pct: P.metas.crescimento_pct, leads_mes: S.total.leads_mes, reunioes_mes: S.total.reunioes_mes, contratos_ano: S.total.contratos, midia_mes: S.total.midia_mes, prioridades: P.prioridades, visao_1_ano: P.visao.a1 };
}
const vigPlano = vig => (vig && vig.plano) ? vig.plano : null;
const refDoPlano = vig => { const p = vigPlano(vig); return { nome: p ? planoNormalizar(p).nome : null, versao: vig?.versao ?? null, aprovado_em: vig?.aprovado_em ?? null, hash: planoHash(p), sincronizado_em: agoraISO() }; };

function anguloDaVertical(angId, v) {
  const a = ANG[angId]; if (!a) return null;
  const f = a.formato.replace(/\{dor\}/g, (v.dores || [])[0] || 'o problema principal').replace(/\{gatilho\}/g, (v.gatilhos || [])[0] || 'próximo fechamento').replace(/\{setor\}/g, v.nome || 'seu setor');
  return { id: `${v.id}__${angId}`, angulo_id: angId, nome: a.nome, hipotese: a.principio, gancho: f, mensagem: '', cta: 'Receba o Mapa de Oportunidades no WhatsApp (grátis, sem reunião)', canais: ['linkedin', 'whatsapp', 'email'], peso: 1, status: 'ativo' };
}

export function playbookInicial(vig) {
  const plano = vigPlano(vig), P = plano ? planoNormalizar(plano) : null;
  const verticais = VERTICAIS_BASE.map(b => ({ id: b.id, nome: b.nome, porte: b.porte, por_que_agora: b.por_que_agora, decisores: [...b.decisores], dores: [...b.dores], gatilhos: [...b.gatilhos], linguagem: b.linguagem, evitar: [...b.evitar],
    objecoes: b.objecoes.map(o => ({ ...o })), alavancas: [...b.alavancas], peso: Math.round(100 / VERTICAIS_BASE.length), status: 'hipotese', angulos: b.angulos.map(id => anguloDaVertical(id, b)).filter(Boolean) }));
  const tese = P ? `Em ${P.horizonte || '2027'}, a Atlantyx vende resultado e não horas a ${ICP_RESUMO.charAt(0).toLowerCase() + ICP_RESUMO.slice(1)}. ${P.prioridades.slice(0, 3).join('; ')}.` : `A Atlantyx vende resultado e não horas a ${ICP_RESUMO.charAt(0).toLowerCase() + ICP_RESUMO.slice(1)}. Plano Estratégico ainda não cadastrado: este Playbook parte do público-alvo e será ajustado quando o plano existir.`;
  return playbookNormalizar({ versao: 1, nome: 'Playbook ' + (P?.horizonte || '2027'), horizonte: P?.horizonte || '2027', gerado_em: agoraISO(), origem: 'base (sem IA)', defasado: false, tese, icp: ICP_RESUMO, setores: ICP_SETORES,
    plano_ref: refDoPlano(vig), metas: metasDoPlano(plano), ofertas: ofertasDoPlano(plano), verticais, funil: FUNIL_BASE, canais: CANAIS_BASE, regras: REGRAS_BASE,
    config: { exploracao: 0.34, min_campanhas: 3, janela_dias: 90, repetir_apos_dias: 7 }, log: [] });
}

// mantém metas, ofertas e referência do plano em dia (sem IA). defasado = a estrutura do plano mudou desde que o texto foi escrito.
export function sincronizarPlano(pb, vig) {
  const plano = vigPlano(vig), hashAtual = planoHash(plano); const novo = JSON.parse(JSON.stringify(pb)); let mudou = false; const motivos = [];
  const metas = metasDoPlano(plano), ofertas = ofertasDoPlano(plano);
  if (JSON.stringify(metas) !== JSON.stringify(novo.metas || {})) { novo.metas = metas; mudou = true; }
  if (JSON.stringify(ofertas) !== JSON.stringify(novo.ofertas || [])) { novo.ofertas = ofertas; mudou = true; }
  const antes = novo.plano_ref?.hash;
  if (antes && antes !== hashAtual) { novo.defasado = true; motivos.push('A estrutura do Plano Estratégico mudou desde que este Playbook foi escrito (alavancas, ofertas, prioridades ou metas).'); mudou = true; novo.log = [...(novo.log || []), { em: agoraISO(), tipo: 'plano', texto: 'Plano Estratégico mudou: metas, ofertas e pesos sincronizados; texto marcado como defasado.' }].slice(-60); }
  if (!antes || antes !== hashAtual) { novo.plano_ref = refDoPlano(vig); novo.plano_ref.hash = hashAtual; mudou = true; }
  else if (vig?.versao !== undefined && novo.plano_ref?.versao !== vig.versao) { novo.plano_ref.versao = vig.versao; mudou = true; }
  if (!plano) motivos.push('Plano Estratégico vigente não encontrado: o Playbook usa só o público-alvo.');
  return { pb: novo, mudou, defasado: !!novo.defasado, motivos };
}

// ── Normalização (limites de tamanho, ids únicos, sem nome de cliente real) ────────────────────────────────────────────
const ST_V = ['hipotese', 'validada', 'pausada'], ST_A = ['ativo', 'em_revisao', 'pausado'];
export function playbookNormalizar(p) {
  const P = p && typeof p === 'object' ? p : {}; const ids = new Set();
  const verticais = (Array.isArray(P.verticais) ? P.verticais : []).slice(0, 10).map(v => {
    let id = slug(v.id || v.nome) || 'vertical'; while (ids.has(id)) id += '-2'; ids.add(id); const aids = new Set();
    const angulos = (Array.isArray(v.angulos) ? v.angulos : []).slice(0, 8).map(a => { let aid = slug(a.id || `${id}__${a.angulo_id}`) || `${id}__a`; while (aids.has(aid)) aid += '-2'; aids.add(aid);
      return { id: aid.includes('__') ? aid : `${id}__${slug(a.angulo_id || aid)}`, angulo_id: ANG[a.angulo_id] ? a.angulo_id : (ANG[String(a.id || '').split('__')[1]] ? String(a.id).split('__')[1] : 'perda'), nome: txt(limpo(a.nome || ANG[a.angulo_id]?.nome), 80), hipotese: txt(limpo(a.hipotese), 300),
        gancho: txt(limpo(a.gancho), 300), mensagem: txt(limpo(a.mensagem), 600), cta: txt(limpo(a.cta), 160), canais: lista(a.canais, 20, 6), peso: clamp(Number(a.peso) || 1, 0, 10), status: ST_A.includes(a.status) ? a.status : 'ativo' }; });
    return { id, nome: txt(limpo(v.nome), 80) || id, porte: txt(limpo(v.porte), 80), por_que_agora: txt(limpo(v.por_que_agora), 300), decisores: lista(v.decisores, 60, 8), dores: lista(v.dores, 200, 6), gatilhos: lista(v.gatilhos, 160, 6),
      linguagem: txt(limpo(v.linguagem), 300), evitar: lista(v.evitar, 160, 6), objecoes: (Array.isArray(v.objecoes) ? v.objecoes : []).slice(0, 6).map(o => ({ objecao: txt(limpo(o.objecao), 160), resposta: txt(limpo(o.resposta), 320) })).filter(o => o.objecao),
      alavancas: lista(v.alavancas, 40, 8), peso: clamp(Number(v.peso) || 0, 0, 100), status: ST_V.includes(v.status) ? v.status : 'hipotese', pendente_ia: !!v.pendente_ia, angulos }; });
  return { versao: Number(P.versao) || 1, nome: txt(P.nome, 80) || 'Playbook', horizonte: txt(P.horizonte, 20), gerado_em: P.gerado_em || agoraISO(), origem: txt(P.origem, 120), defasado: !!P.defasado, tese: txt(limpo(P.tese), 900), icp: txt(P.icp, 400),
    setores: lista(P.setores, 60, 12), plano_ref: P.plano_ref || {}, metas: P.metas || {}, ofertas: Array.isArray(P.ofertas) ? P.ofertas : [], verticais,
    funil: Array.isArray(P.funil) && P.funil.length ? P.funil.slice(0, 14).map(f => ({ etapa: txt(f.etapa, 30), nome: txt(f.nome, 60), agente: txt(f.agente, 30), objetivo: txt(limpo(f.objetivo), 300), saida: txt(limpo(f.saida), 300) })) : FUNIL_BASE,
    canais: Array.isArray(P.canais) && P.canais.length ? P.canais.slice(0, 10) : CANAIS_BASE, regras: Array.isArray(P.regras) && P.regras.length ? P.regras.slice(0, 20) : REGRAS_BASE,
    config: { exploracao: clamp(Number(P.config?.exploracao ?? 0.34), 0, 1), min_campanhas: clamp(Number(P.config?.min_campanhas ?? 3), 1, 20), janela_dias: clamp(Number(P.config?.janela_dias ?? 90), 7, 365), repetir_apos_dias: clamp(Number(P.config?.repetir_apos_dias ?? 7), 0, 60) },
    log: (Array.isArray(P.log) ? P.log : []).slice(-60) };
}

// ── Desempenho: pontos por campanha (lead = 0,5; lead decisor = 2) → multiplicador por vertical e por ângulo ──────────────
// historico: [{ data, vertical, angulo, utm }] · leadsPorUtm: { utm: { leads, decisores } }
export function desempenhoCalcular(historico, leadsPorUtm, { janelaDias = 90, hoje = new Date().toISOString().slice(0, 10), minimo = 3 } = {}) {
  const corte = new Date(Date.parse(hoje) - janelaDias * 864e5).toISOString().slice(0, 10), H = (Array.isArray(historico) ? historico : []).filter(h => h.vertical && h.angulo && String(h.data || '') >= corte);
  const vazio = () => ({ n: 0, leads: 0, decisores: 0, pts: 0 }); const verts = {}, angs = {}; let N = 0, PTS = 0;
  for (const h of H) { const L = leadsPorUtm?.[h.utm] || { leads: 0, decisores: 0 }, leads = Number(L.leads) || 0, dec = Math.min(Number(L.decisores) || 0, leads), pts = dec * 2 + (leads - dec) * 0.5;
    const v = verts[h.vertical] = verts[h.vertical] || vazio(), a = angs[h.vertical + '|' + h.angulo] = angs[h.vertical + '|' + h.angulo] || vazio(), g = angs['*|' + h.angulo] = angs['*|' + h.angulo] || vazio();
    for (const x of [v, a, g]) { x.n++; x.leads += leads; x.decisores += dec; x.pts += pts; } N++; PTS += pts; }
  const media = N >= minimo ? PTS / N : null, K = 3;
  const fecha = x => { x.pts = r2(x.pts); x.mult = 1; x.sem_retorno = false; x.em_teste = x.n < minimo;
    if (media && media > 0 && x.n >= minimo) { x.mult = r2(clamp(((x.pts + media * K) / (x.n + K)) / media, MULT_MIN, MULT_MAX)); }
    if (media && media > 0 && x.n >= 5 && x.leads === 0) { x.mult = MULT_MIN; x.sem_retorno = true; } return x; };
  Object.values(verts).forEach(fecha); Object.values(angs).forEach(fecha);
  return { campanhas: N, pontos: r2(PTS), media: media === null ? null : r2(media), minimo, verticais: verts, angulos: angs };
}

// Aplica as regras automáticas: muda status e registra no log. Devolve { pb, mudancas:[texto] }
export function aplicarAjustes(pb, desemp, { hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const novo = JSON.parse(JSON.stringify(pb)), mud = []; if (!desemp || desemp.media === null) return { pb: novo, mudancas: mud };
  const ja = t => (novo.log || []).some(l => l.texto === t && String(l.em).slice(0, 10) === hoje); const regs = (tipo, texto) => { if (ja(texto)) return; mud.push(texto); novo.log = [...(novo.log || []), { em: hoje + 'T' + new Date().toISOString().slice(11), tipo, texto }].slice(-60); };
  for (const v of novo.verticais) { const dv = desemp.verticais[v.id];
    if (dv && v.status !== 'pausada' && dv.n >= 8 && dv.decisores === 0) { v.status = 'pausada'; regs('pausa', `Vertical "${v.nome}" pausada: ${dv.n} campanhas sem nenhum lead decisor. Revise a hipótese e retome quando quiser.`); }
    else if (dv && v.status === 'hipotese' && dv.n >= desemp.minimo && dv.mult >= 1.5 && dv.decisores >= 1) { v.status = 'validada'; regs('validacao', `Vertical "${v.nome}" validada: ${dv.n} campanhas, ${dv.leads} lead(s), ${dv.decisores} decisor(es), peso ${dv.mult}×.`); }
    for (const a of v.angulos) { const da = desemp.angulos[v.id + '|' + a.angulo_id];
      if (da && a.status === 'ativo' && da.sem_retorno) { a.status = 'em_revisao'; regs('revisao', `Ângulo "${a.nome}" em "${v.nome}" em revisão: ${da.n} campanhas sem lead. Peso no mínimo.`); }
      else if (da && !da.em_teste && da.mult >= 1.5) regs('ampliar', `Ângulo "${a.nome}" em "${v.nome}" está entregando acima da média (${da.mult}×): ganha mais espaço.`); } }
  return { pb: novo, mudancas: mud };
}

// ── Peso efetivo e escolha dos ângulos de cada rodada ────────────────────────────────────────────────────────────────────
export function pesosVerticais(pb, plano, desemp) {
  const P = plano ? planoNormalizar(plano) : null;
  return pb.verticais.map(v => { let base = v.peso || 0;
    if (P) { const lig = P.alavancas.filter(a => a.status !== 'pausada' && (v.alavancas || []).includes(a.id)), s = lig.reduce((t, a) => t + a.peso_campanha, 0); if (lig.length && s > 0) base = s; }
    const m = desemp?.verticais?.[v.id]?.mult ?? 1, st = v.status === 'pausada' ? 0 : v.status === 'validada' ? 1.2 : 1; return { id: v.id, nome: v.nome, base, mult: m, peso: r2(base * m * st) }; });
}
function rng(seed) { let a = fnv(seed) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sorteia(itens, pesoDe, rand) { const tot = itens.reduce((s, x) => s + Math.max(0, pesoDe(x)), 0); if (tot <= 0) return itens.length ? itens[Math.floor(rand() * itens.length)] : null; let x = rand() * tot; for (const it of itens) { x -= Math.max(0, pesoDe(it)); if (x < 0) return it; } return itens[itens.length - 1]; }

// recentes: ['vertical|angulo_id', …] usados nos últimos dias (evita repetir a mesma combinação)
export function escolherAngulos(pb, plano, desemp, { n = 3, chave = '', recentes = [] } = {}) {
  const rand = rng('pb|' + chave), pesos = pesosVerticais(pb, plano, desemp), pv = Object.fromEntries(pesos.map(p => [p.id, p])), rec = new Set(recentes);
  let cand = pb.verticais.filter(v => v.status !== 'pausada' && (pv[v.id]?.peso || 0) > 0 && v.angulos.some(a => a.status !== 'pausado')); const out = [], usadas = new Set();
  const escolheAng = (v, soNovos) => { let L = v.angulos.filter(a => a.status !== 'pausado'); const livres = L.filter(a => !rec.has(v.id + '|' + a.angulo_id)); if (livres.length) L = livres;
    if (soNovos) { const novos = L.filter(a => (desemp?.angulos?.[v.id + '|' + a.angulo_id]?.n || 0) < 2); if (novos.length) L = novos; }
    return sorteia(L, a => a.peso * (a.status === 'em_revisao' ? MULT_MIN : 1) * (desemp?.angulos?.[v.id + '|' + a.angulo_id]?.mult ?? 1), rand); };
  const explorar = cand.length > 0 && n >= 2 && rand() < pb.config.exploracao * n;      // 1 em cada ~3 vai para teste de combinação pouco testada
  for (let i = 0; i < n && cand.length; i++) {
    const ultimoExplora = explorar && i === n - 1, pool = cand.filter(v => !usadas.has(v.id)); const base = pool.length ? pool : cand;
    const v = sorteia(base, x => pv[x.id].peso, rand); if (!v) break; const a = escolheAng(v, ultimoExplora); if (!a) break; usadas.add(v.id);
    out.push({ vertical_id: v.id, vertical_nome: v.nome, angulo_id: a.angulo_id, angulo_key: a.id, angulo_nome: a.nome, exploracao: ultimoExplora, peso_pct: r2(pv[v.id].peso / (pesos.reduce((s, p) => s + p.peso, 0) || 1) * 100),
      motivo: ultimoExplora ? 'teste de combinação pouco testada' : `peso ${r2(pv[v.id].peso / (pesos.reduce((s, p) => s + p.peso, 0) || 1) * 100)}% do Playbook${pv[v.id].mult !== 1 ? ` (aprendizado ${pv[v.id].mult}×)` : ''}` }); }
  return out;
}

// ── Textos para os prompts (marketing e agentes de vendas leem o Playbook por aqui) ─────────────────────────────────────
export function briefingSelecao(pb, sel) {
  const v = pb.verticais.find(x => x.id === sel.vertical_id); if (!v) return ''; const a = v.angulos.find(x => x.id === sel.angulo_key || x.angulo_id === sel.angulo_id), lib = ANG[sel.angulo_id];
  const of = (pb.ofertas || []).find(o => (v.alavancas || []).includes(o.alavanca_id)) || (pb.ofertas || [])[0];
  return [`VERTICAL: ${v.nome} (${v.porte}). Quem decide: ${v.decisores.join(', ')}. Por que agora: ${v.por_que_agora}`, `Dores: ${v.dores.join('; ')}. Gatilhos: ${v.gatilhos.join('; ')}.`, `Linguagem: ${v.linguagem} Evitar: ${v.evitar.join('; ')}.`,
    `ÂNGULO DE COMPORTAMENTO: ${lib?.nome || a?.nome} — ${lib?.principio || a?.hipotese}`, a?.gancho ? `Gancho-base: ${a.gancho}` : '', a?.mensagem ? `Mensagem-base: ${a.mensagem}` : '',
    of ? `Contexto de oferta do plano (para a dor, não para a promessa): ${of.nome} — ${of.oferta}.` : '', v.objecoes.length ? 'Objeções comuns: ' + v.objecoes.map(o => `"${o.objecao}" → ${o.resposta}`).join(' | ') : ''].filter(Boolean).join('\n');
}
export function briefingPlaybook(pb, sels = []) {
  const m = pb.metas || {}, R = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
  return [`PLAYBOOK ${pb.horizonte} (versão ${pb.versao}${pb.defasado ? ', texto defasado em relação ao plano' : ''}) — É O NORTE: todo conteúdo e abordagem parte dele.`, `Tese: ${pb.tese}`,
    m.faturamento ? `Metas do plano: faturamento ${R(m.faturamento)}, margem ${m.margem_pct}%, recorrente ${m.recorrente_pct}%; ${m.leads_mes ?? '—'} leads e ${m.reunioes_mes ?? '—'} reuniões por mês.` : '',
    (m.prioridades || []).length ? 'Prioridades: ' + m.prioridades.join('; ') : '', sels.length ? 'ÂNGULOS ESCOLHIDOS PARA ESTA RODADA (um por campanha):\n' + sels.map((s, i) => `#${i + 1} [${s.vertical_id}/${s.angulo_id}${s.exploracao ? ' · teste' : ''}]\n${briefingSelecao(pb, s)}`).join('\n\n') : ''].filter(Boolean).join('\n');
}
export function briefingVendas(pb, agenteId) {
  const f = (pb.funil || []).filter(e => e.agente === agenteId), m = pb.metas || {};
  return [`PLAYBOOK ${pb.horizonte} (versão ${pb.versao}) — O NORTE DAS VENDAS. Tese: ${pb.tese}`, m.reunioes_mes ? `Meta do plano: ${m.leads_mes} leads e ${m.reunioes_mes} reuniões por mês.` : '', f.length ? 'SUA(S) ETAPA(S): ' + f.map(e => `${e.nome} — ${e.objetivo} Saída: ${e.saida}`).join(' | ') : '',
    'VERTICAIS (use a linguagem, as dores e o ângulo da vertical do lead):\n' + pb.verticais.filter(v => v.status !== 'pausada').map(v => `- ${v.nome} [${v.status}] decisores: ${v.decisores.join(', ')} · dores: ${v.dores.slice(0, 2).join('; ')} · linguagem: ${v.linguagem} · ângulos que funcionam: ${v.angulos.filter(a => a.status === 'ativo').slice(0, 3).map(a => a.nome).join(', ')} · objeções: ${v.objecoes.slice(0, 2).map(o => o.objecao + ' → ' + o.resposta).join(' | ')}`).join('\n'),
    'REGRAS: ' + (pb.regras || []).map(r => `se ${r.se}, ${r.entao}`).join(' · ')].filter(Boolean).join('\n');
}

// ── Geração com IA (verticais em paralelo para caber no tempo) ────────────────────────────────────────────────────────
function jsonDe(t) { const s = String(t || '').replace(/```json|```/g, ''), i = s.indexOf('{'), j = s.lastIndexOf('}'); if (i < 0 || j < i) throw new Error('A IA não devolveu JSON'); return JSON.parse(s.slice(i, j + 1)); }
export async function gerarPlaybook({ claude, vig, atual, contexto = '', desempTexto = '', orientacao = '', planoTexto = '' }) {
  const base = atual || playbookInicial(vig), ids = ANGULOS.map(a => `${a.id} (${a.nome})`).join('; ');
  const SYS = `Você é o estrategista-chefe de vendas B2B da Atlantyx e escreve o PLAYBOOK 2027, que guia marketing e o time de vendas virtual. Português do Brasil, frases curtas. REGRAS: nunca invente número, estatística, cliente ou caso; use só os dados fornecidos; nunca cite clientes reais por nome (use "um cliente do setor"); o público é ${ICP_RESUMO}; tudo que for hipótese deve soar como hipótese a validar pelos resultados. Responda SOMENTE JSON.`;
  const CTX = [planoTexto, contexto ? 'CONTEXTO DA EMPRESA E ESTRATÉGIA:\n' + String(contexto).slice(0, 9000) : '', desempTexto ? 'RESULTADOS JÁ OBSERVADOS:\n' + desempTexto : '', orientacao ? 'ORIENTAÇÃO DO FUNDADOR (prevalece): ' + orientacao : ''].filter(Boolean).join('\n\n');
  const A = jsonDe(await claude(SYS, `${CTX}\n\nVerticais de partida (pode manter, renomear, fundir, acrescentar ou remover conforme o plano e os resultados; no máximo 7): ${base.verticais.map(v => v.id + ' = ' + v.nome).join('; ')}.\nDevolva JSON: {"tese":"2 frases: como a Atlantyx vende em ${base.horizonte} e para quem","verticais":[{"id":"slug","nome":"","porte":"","por_que_agora":"1 frase","alavancas":["ids de alavancas do plano que a vertical compra"],"peso":0-100}]}`, 2500));
  const verts = (Array.isArray(A.verticais) ? A.verticais : []).slice(0, 7); if (!verts.length) throw new Error('A IA não definiu verticais');
  const detalhe = async v => {
    const J = jsonDe(await claude(SYS, `${CTX}\n\nDetalhe a vertical "${v.nome}" (${v.porte || ''}). Por que agora: ${v.por_que_agora || ''}.\nÂNGULOS DE COMPORTAMENTO disponíveis (use só estes ids): ${ids}.\nDevolva JSON: {"decisores":["cargos"],"dores":["3 dores concretas do dia a dia desse decisor"],"gatilhos":["3 eventos que fazem ele agir"],"linguagem":"como falar com ele, em 1-2 frases","evitar":["3 coisas"],"objecoes":[{"objecao":"","resposta":""}],"angulos":[{"angulo_id":"id da lista","hipotese":"por que esse ângulo deve funcionar com esse decisor","gancho":"título/abertura de post de até 20 palavras","mensagem":"mensagem de abordagem de 2-3 frases, sem número inventado","cta":"chamada para ação alinhada à oferta: Mapa de Oportunidades grátis no WhatsApp"}]}. Traga 4 a 5 ângulos DIFERENTES entre si, sem repetir id, e 2 a 3 objeções.`, 3200));
    return J; };
  const res = await Promise.allSettled(verts.map(detalhe));
  const prev = Object.fromEntries(base.verticais.map(v => [v.id, v]));
  const verticais = verts.map((v, i) => { const id = slug(v.id || v.nome), ant = prev[id], b = VERTICAIS_BASE.find(x => x.id === id);
    if (res[i].status !== 'fulfilled') return ant ? { ...ant, nome: v.nome || ant.nome, pendente_ia: true } : { ...(b || { id, nome: v.nome, decisores: [], dores: [], gatilhos: [], linguagem: '', evitar: [], objecoes: [], angulos: [] }), id, pendente_ia: true, status: 'hipotese', peso: Number(v.peso) || 10, alavancas: v.alavancas || [] };
    const d = res[i].value, angs = (Array.isArray(d.angulos) ? d.angulos : []).filter(a => ANG[a.angulo_id]).map(a => { const oa = ant?.angulos?.find(x => x.angulo_id === a.angulo_id); return { id: `${id}__${a.angulo_id}`, angulo_id: a.angulo_id, nome: ANG[a.angulo_id].nome, hipotese: a.hipotese, gancho: a.gancho, mensagem: a.mensagem, cta: a.cta, canais: ['linkedin', 'whatsapp', 'email'], peso: oa?.peso ?? 1, status: oa?.status ?? 'ativo' }; });
    return { id, nome: v.nome, porte: v.porte || ant?.porte || '', por_que_agora: v.por_que_agora || '', decisores: d.decisores, dores: d.dores, gatilhos: d.gatilhos, linguagem: d.linguagem, evitar: d.evitar, objecoes: d.objecoes, alavancas: Array.isArray(v.alavancas) ? v.alavancas : (ant?.alavancas || []),
      peso: Number(v.peso) || ant?.peso || 10, status: ant?.status || 'hipotese', pendente_ia: false, angulos: angs.length ? angs : (ant?.angulos || []) }; });
  const novo = playbookNormalizar({ ...base, versao: (Number(atual?.versao) || 0) + 1, origem: 'IA' + (orientacao ? ' com orientação do fundador' : ''), gerado_em: agoraISO(), tese: A.tese || base.tese, verticais, defasado: false, plano_ref: refDoPlano(vig), metas: metasDoPlano(vigPlano(vig)), ofertas: ofertasDoPlano(vigPlano(vig)),
    log: [...(atual?.log || []), { em: agoraISO(), tipo: 'geracao', texto: `Playbook regenerado pela IA${orientacao ? ' (orientação: ' + txt(orientacao, 120) + ')' : ''}; aprendizado e status preservados.` }] });
  novo.plano_ref.hash = planoHash(vigPlano(vig)); return { pb: novo, pendentes: verticais.filter(v => v.pendente_ia).map(v => v.nome) };
}

// ── Armazenamento (kv injetado: { get(k), set(k, v) }) ────────────────────────────────────────────────────────────────────
export async function lerPlaybook(kv) { try { const v = await kv.get(K_PB); return v && Array.isArray(v.verticais) ? playbookNormalizar(v) : null; } catch (_) { return null; } }
export async function salvarPlaybook(kv, pb, por = '', resumo = '') {
  const atual = await kv.get(K_PB).catch(() => null), versoes = (await kv.get(K_PB_VERSOES).catch(() => null)) || [];
  if (atual && Array.isArray(atual.verticais) && (atual.versao !== pb.versao || resumo)) { versoes.push({ versao: atual.versao, em: atual.gerado_em, por: por || '', resumo: txt(resumo || 'versão anterior', 140), playbook: atual }); while (versoes.length > 10) versoes.shift(); await kv.set(K_PB_VERSOES, versoes); }
  await kv.set(K_PB, pb); return pb;
}
export async function playbookVigente(kv, vig) { // lê (ou cria a base), sincroniza com o plano e grava se mudou
  let pb = await lerPlaybook(kv), criou = false; if (!pb) { pb = playbookInicial(vig); criou = true; }
  const s = sincronizarPlano(pb, vig); if (criou || s.mudou) await kv.set(K_PB, s.pb).catch(() => {}); return { pb: s.pb, defasado: s.defasado, motivos: s.motivos, criou };
}
export async function registrarCampanhas(kv, itens) { const H = (await kv.get(K_PB_HIST).catch(() => null)) || []; const novo = H.concat(itens.map(i => ({ data: i.data, hora: i.hora, vertical: i.vertical, angulo: i.angulo, utm: i.utm || null, nome: txt(i.nome, 80), exploracao: !!i.exploracao }))); await kv.set(K_PB_HIST, novo.slice(-400)); }
export const lerHistorico = async kv => (await kv.get(K_PB_HIST).catch(() => null)) || [];

export function playbookMarkdown(pb) {
  const L = [`# ${pb.nome} (versão ${pb.versao})`, '', `**Tese:** ${pb.tese}`, ''];
  const m = pb.metas || {}; if (m.faturamento) L.push(`**Metas do plano:** faturamento R$ ${Math.round(m.faturamento).toLocaleString('pt-BR')} · margem ${m.margem_pct}% · recorrente ${m.recorrente_pct}% · ${m.leads_mes} leads/mês · ${m.reunioes_mes} reuniões/mês`, '');
  L.push('## Verticais'); for (const v of pb.verticais) { L.push('', `### ${v.nome} [${v.status}]`, `Porte: ${v.porte} · Decisores: ${v.decisores.join(', ')}`, `Por que agora: ${v.por_que_agora}`, `Dores: ${v.dores.join('; ')}`, `Gatilhos: ${v.gatilhos.join('; ')}`, `Linguagem: ${v.linguagem}`, `Evitar: ${v.evitar.join('; ')}`, 'Ângulos:');
    v.angulos.forEach(a => L.push(`- **${a.nome}** [${a.status}] — ${a.gancho}${a.mensagem ? ' | ' + a.mensagem : ''}`)); if (v.objecoes.length) { L.push('Objeções:'); v.objecoes.forEach(o => L.push(`- "${o.objecao}" → ${o.resposta}`)); } }
  L.push('', '## Funil e responsáveis'); pb.funil.forEach(f => L.push(`- **${f.nome}** (${f.agente}): ${f.objetivo} Saída: ${f.saida}`)); L.push('', '## Regras de ajuste automático'); pb.regras.forEach(r => L.push(`- Se ${r.se}: ${r.entao}.`));
  return L.join('\n');
}
