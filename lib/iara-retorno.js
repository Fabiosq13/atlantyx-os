// lib/iara-retorno.js — v3.495 · RETORNO DAS CONVERSAS DA IARA (pedido do fundador, 13/11/2026: itens 1 e 2)
// A IARA roda fora do Atlantyx OS e, ao conversar, marca no HubSpot "Atendido pela IA = true" e escreve o "Resumo SDR Atlantyx".
// De hora em hora este job procura os contatos com conversa nova (ou resumo que mudou) e:
//   1) avisa o vendedor (Ademir) por e-mail — um resumo por rodada, os mais quentes primeiro, com link do HubSpot e da Floresta;
//   2) a IA lê o resumo e decide o desfecho: quer reunião → card em Reunião (cria o negócio); interessado / pediu material /
//      falar com analista → Engajado; saiu da empresa / não é a pessoa → Congelado 90 dias + tarefa de achar o novo decisor;
//      sem interesse → Perdido. Só move cards que ainda estão no começo do funil (nunca volta um negócio já avançado).
//   3) dados novos que o lead passou (outro telefone, e-mail, empresa nova, indicação) vão para o HubSpot SEM apagar nada:
//      telefone novo entra no campo vazio (celular, depois fixo); e-mail só se o contato não tiver; o resto vira nota no contato.
// Controle em kv 'vendas:iara:retornos' { contato_id: { assinatura, em, desfecho } } — cada resumo é tratado uma vez.
import crypto from 'crypto';

const KV = 'vendas:iara:retornos';
const INICIO = ['frio', 'iara', 'ligacao', 'abordado', 'engajado', 'remarketing'];
const PARA = { quer_reuniao: 'reuniao', interessado: 'engajado', pediu_material: 'engajado', falar_analista: 'engajado', saiu_empresa: 'congelado', nao_e_a_pessoa: 'congelado', sem_interesse: 'perdido' };
const ROT = { quer_reuniao: '🤝 Quer reunião', falar_analista: '🙋 Pediu para falar com analista', interessado: '🔥 Interessado', pediu_material: '📎 Pediu material', saiu_empresa: '🚪 Saiu da empresa', nao_e_a_pessoa: '↪️ Não é a pessoa certa', sem_interesse: '🍂 Sem interesse', sem_resposta: '⏳ Sem resposta', outro: '💬 Conversa' };
const PRIOR = ['quer_reuniao', 'falar_analista', 'interessado', 'pediu_material', 'saiu_empresa', 'nao_e_a_pessoa', 'outro', 'sem_resposta', 'sem_interesse'];
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function smtp(user, pass) {
  const dom = String(user || '').split('@')[1] || '';
  const host = process.env.EMAIL_SMTP_HOST || (/gmail\.com$/i.test(dom) ? 'smtp.gmail.com' : (dom ? 'mail.' + dom : 'smtp.gmail.com'));
  const port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
  return { host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 30000, ...(process.env.EMAIL_SMTP_TLS_RELAXADO === '1' ? { tls: { rejectUnauthorized: false } } : {}) };
}

export function criarIaraRetorno({ hs, getSql, claude, todoCriar, floresta, normTelefone, vendedor = { nome: 'Ademir Souza', email: 'ademir.souza@atlanteam.com.br' } }) {
  async function kv(k, v) { const sql = await getSql();
    if (v === undefined) { const r = (await sql`SELECT value FROM kv_store WHERE key=${k}`)[0]; if (!r) return null; try { return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { return null; } }
    await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; }
  const nt = t => (normTelefone ? normTelefone(t) : String(t || '').replace(/\D/g, '')) || '';

  async function classificar(c, resumo) {
    const sys = 'Você lê o resumo de uma conversa de WhatsApp entre a IARA (SDR de IA da Atlantyx, consultoria de dados e IA) e um lead, e devolve o desfecho e os dados novos que o lead informou. Responde só JSON.';
    const usr = `LEAD: ${c.nome} · ${c.cargo || 'cargo não informado'} · ${c.empresa || 'empresa não informada'} · telefone no CRM: ${c.tel || 'nenhum'} · e-mail no CRM: ${c.email || 'nenhum'}
RESUMO DA CONVERSA (escrito pela IARA):
${String(resumo || '(sem resumo — a IARA marcou o lead como atendido)').substring(0, 3000)}

Desfecho (escolha 1): quer_reuniao (aceitou ou pediu reunião/horário), falar_analista (pediu para falar com uma pessoa), interessado (respondeu com interesse, sem data), pediu_material (pediu apresentação/proposta/material), saiu_empresa (disse com clareza que NÃO TRABALHA MAIS na empresa — inclui se APOSENTOU ou foi desligado — \"não estou na empresa agora\", \"estou fora\", \"não estou no escritório\" é ausência física, NÃO é saída; na dúvida use outro e explique no resumo; se o resumo mostrar que ele corrigiu e continua na empresa, NÃO é saiu_empresa), nao_e_a_pessoa (não é quem decide / indicou outra pessoa), sem_interesse (recusou), sem_resposta (não respondeu), outro.
Dados novos: só o que o LEAD disse na conversa e que é diferente do CRM. Telefone com DDD. Nunca invente.
Devolva JSON: {"desfecho":"…","urgencia":"alta|media|baixa","resumo_curto":"1 frase","proximo_passo":"o que o vendedor deve fazer, 1 frase","dados_novos":{"telefone":null,"email":null,"empresa_nova":null,"indicacao":null}}`;
    try { return JSON.parse(String(await claude(sys, usr, 600)).replace(/```json|```/g, '').trim()); } catch (e) { return { desfecho: 'outro', urgencia: 'media', resumo_curto: 'Conversa da IARA (não consegui classificar: ' + e.message + ')', proximo_passo: 'Ler o resumo no HubSpot', dados_novos: {} }; }
  }

  async function processar({ horas = 26, max = 15, simular = false } = {}) {
    const P = await floresta.propsIA(); const atend = 'atendido_pela_ia', RES = P.resumo;
    const props = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', 'jobtitle', 'lastmodifieddate', atend, ...(RES ? [RES] : [])];
    const d = await hs('/crm/v3/objects/contacts/search', 'POST', { filterGroups: [{ filters: [{ propertyName: atend, operator: 'EQ', value: 'true' }, { propertyName: 'lastmodifieddate', operator: 'GTE', value: String(Date.now() - horas * 3600000) }] }],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }], properties: props, limit: 100 });
    const feitos = (await kv(KV)) || {}, novos = [];
    // v3.500: a IARA às vezes grava o resumo como MODELO VAZIO ("[RESUMO SDR ATLANTYX] Resumo: Segmento/Porte: /") — aí a conversa
    // de verdade é lida do histórico do HubSpot (caixa de Conversas, mensagens, notas) e é ela que a IA classifica
    const util = t => String(t || '').replace(/\[resumo sdr atlantyx\]/i, '').split(/\n/).map(l => l.replace(/^[^:]{1,40}:\s*[\/\-–—]?\s*(n[aã]o|sim)?\s*$/i, '').trim()).filter(Boolean).join('\n').trim();
    for (const x of d.results || []) { const p = x.properties || {}, bruto = RES ? String(p[RES] || '').trim() : ''; let resumo = util(bruto).length >= 25 ? bruto : '', hist = '';
      if (!resumo && floresta.historico) { try { const H = await floresta.historico({ ids: [x.id] }); hist = (H.itens || []).filter(i => ['conversa', 'whats_app', 'whatsapp', 'sms', 'campo', 'email'].includes(i.tipo)).map(i => i.texto).join('\n---\n').substring(0, 5000); } catch (_) {} }
      const base = resumo || hist || 'atendido';
      const ass = crypto.createHash('sha1').update(base).digest('hex').slice(0, 16); if (feitos[x.id]?.assinatura === ass) continue;
      novos.push({ id: x.id, p, resumo: resumo || (hist ? 'CONVERSA (histórico do HubSpot):\n' + hist : ''), ass, modelo_vazio: !!bruto && !resumo }); }
    if (!novos.length) return { ok: true, novos: 0 };
    let F = null; try { F = await floresta.carregar({}); } catch (_) {}
    let portal = null; try { portal = (await hs('/account-info/v3/details')).portalId; } catch (_) {}
    const itens = [];
    for (const n of novos.slice(0, max)) {
      const p = n.p, c = { id: n.id, nome: [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email || 'contato ' + n.id, cargo: p.jobtitle || '', empresa: p.company || '', email: p.email || '', tel: p.mobilephone || p.phone || '' };
      const j = await classificar(c, n.resumo); const des = PARA[j.desfecho] || ROT[j.desfecho] ? j.desfecho : 'outro'; const D = j.dados_novos || {};
      const mud = [], notas = [];
      // dados novos → HubSpot sem apagar nada
      const tn = nt(D.telefone); if (tn && tn.length >= 10 && tn !== nt(p.mobilephone) && tn !== nt(p.phone)) {
        const tf = /^55\d{10,11}$/.test(tn) ? '+' + tn : tn; if (!p.mobilephone) mud.push(['mobilephone', tf, 'celular']); else if (!p.phone) mud.push(['phone', tf, 'telefone']); else notas.push('Telefone novo informado: ' + tn + ' (os dois campos de telefone já estavam preenchidos)'); }
      const em = String(D.email || '').trim().toLowerCase(); if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) && em !== String(p.email || '').toLowerCase()) { if (!p.email) mud.push(['email', em, 'e-mail']); else notas.push('E-mail informado na conversa: ' + em + ' (o e-mail do contato foi mantido)'); }
      if (D.empresa_nova) notas.push('Disse estar agora em: ' + D.empresa_nova);
      if (D.indicacao) notas.push('Indicou: ' + (typeof D.indicacao === 'string' ? D.indicacao : JSON.stringify(D.indicacao)));
      let acao = null, erro = null;
      if (!simular) {
        if (mud.length) { try { await hs('/crm/v3/objects/contacts/' + n.id, 'PATCH', { properties: Object.fromEntries(mud.map(m => [m[0], m[1]])) }); } catch (e) { erro = 'HubSpot: ' + e.message; } }
        try { const corpo = `<b>Retorno da IARA (Atlantyx OS)</b><br>Desfecho: ${esc(ROT[des] || des)}<br>${esc(j.resumo_curto || '')}<br>Próximo passo: ${esc(j.proximo_passo || '')}`
            + (mud.length ? '<br>Atualizado: ' + mud.map(m => esc(m[2] + ' = ' + m[1])).join(', ') : '') + (notas.length ? '<br>' + notas.map(esc).join('<br>') : '');
          await hs('/crm/v3/objects/notes', 'POST', { properties: { hs_timestamp: new Date().toISOString(), hs_note_body: corpo }, associations: [{ to: { id: n.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] }); } catch (e) { erro = (erro ? erro + ' · ' : '') + 'nota: ' + e.message; }
        // card da Floresta
        const card = F?.cards?.find(k => k.contato_id === n.id && k.tipo === 'negocio') || F?.cards?.find(k => k.tipo === 'contato' && k.hs_id === n.id);
        let para = PARA[des];
        // v3.498: a IARA (ou a IA) entendeu errado e o lead corrigiu na conversa → o congelamento AUTOMÁTICO é desfeito
        if (card && card.etapa === 'congelado' && card.congelado?.por === 'IARA (retorno automático)' && !['saiu_empresa', 'nao_e_a_pessoa'].includes(des)) {
          try { const volta = card.etapa_real || 'iara'; await floresta.mover({ card_id: card.id, para: volta }, 'IARA (retorno automático)'); acao = 'descongelado (o lead corrigiu na conversa) → volta para ' + volta; card.etapa = volta;
            notas.push('Congelamento automático desfeito: na nova conversa o lead corrigiu a informação anterior.'); } catch (e) { erro = (erro ? erro + ' · ' : '') + 'descongelar: ' + e.message; } }
        if (card && para && INICIO.includes(card.etapa) && card.etapa !== para && !(para === 'engajado' && card.etapa === 'engajado')) {
          try { const r = await floresta.mover({ card_id: card.id, para, motivo: para === 'congelado' ? (ROT[des] + ' — ' + (j.resumo_curto || '')).substring(0, 200) : undefined, congelar_ate: para === 'congelado' ? new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10) : undefined }, 'IARA (retorno automático)'); acao = (acao ? acao + ' · ' : '') + (ROT[des] || des) + ' → ' + r.resultado; }
          catch (e) { erro = (erro ? erro + ' · ' : '') + 'card: ' + e.message; } }
        if ((des === 'saiu_empresa' || des === 'nao_e_a_pessoa') && todoCriar && c.empresa) { try { await todoCriar([{ texto: 'Achar o novo decisor em ' + c.empresa + ' (' + c.nome + ' ' + (des === 'saiu_empresa' ? 'saiu da empresa' : 'não é a pessoa certa') + ')', responsavel: vendedor.nome.split(' ')[0], data: new Date().toISOString().slice(0, 10), notas: [j.resumo_curto || ''] }]); } catch (_) {} }
        feitos[n.id] = { assinatura: n.ass, em: new Date().toISOString(), desfecho: des };
      }
      itens.push({ ...c, desfecho: des, urgencia: j.urgencia || 'media', resumo: n.resumo, resumo_curto: j.resumo_curto || '', proximo: j.proximo_passo || '', mudou: mud.map(m => m[2] + ': ' + m[1]), notas, acao, erro,
        link: portal ? `https://app.hubspot.com/contacts/${portal}/record/0-1/${n.id}` : null });
    }
    if (!simular) { const ks = Object.keys(feitos); if (ks.length > 2000) ks.sort((a, b) => String(feitos[a].em).localeCompare(String(feitos[b].em))).slice(0, ks.length - 2000).forEach(k => delete feitos[k]); await kv(KV, feitos); }
    itens.sort((a, b) => PRIOR.indexOf(a.desfecho) - PRIOR.indexOf(b.desfecho));
    let email = null; if (!simular && itens.length) { try { email = await avisar(itens); } catch (e) { email = { ok: false, erro: e.message }; } }
    return { ok: true, novos: itens.length, restantes: Math.max(0, novos.length - max), itens: simular ? itens : itens.map(i => ({ nome: i.nome, empresa: i.empresa, desfecho: i.desfecho, acao: i.acao, mudou: i.mudou, erro: i.erro })), email };
  }

  // e-mail interno para o vendedor (um por rodada) — aviso da equipe, não é envio a cliente
  async function avisar(itens) {
    const nodemailer = (await import('nodemailer')).default;
    const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER, pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) return { ok: false, erro: 'e-mail do sistema não configurado (EMAIL_SMTP_USER/EMAIL_SMTP_PASS)' };
    const para = [...new Set([vendedor.email, 'atlanteambr@gmail.com', ...(process.env.IARA_RETORNO_PARA || '').split(',')].map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))].join(', ');
    const quentes = itens.filter(i => ['quer_reuniao', 'falar_analista', 'interessado', 'pediu_material'].includes(i.desfecho)).length;
    const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
    const bloco = i => `<tr><td style="padding:12px 14px;border-bottom:1px solid #e5e9f0;font-family:Arial,sans-serif;font-size:14px;color:#0b1220">
      <div style="font-size:15px;font-weight:700">${esc(ROT[i.desfecho] || i.desfecho)} · ${esc(i.nome)}</div>
      <div style="color:#5b6670;font-size:13px">${esc([i.cargo, i.empresa].filter(Boolean).join(' · '))}${i.tel ? ' · ' + esc(i.tel) : ''}</div>
      <div style="margin-top:6px">${esc(i.resumo_curto)}</div>
      <div style="margin-top:4px"><b>Próximo passo:</b> ${esc(i.proximo)}</div>
      ${i.mudou.length ? `<div style="margin-top:4px;color:#047857"><b>Atualizado no HubSpot:</b> ${esc(i.mudou.join(' · '))}</div>` : ''}
      ${i.notas.length ? `<div style="margin-top:4px;color:#5b6670">${i.notas.map(esc).join('<br>')}</div>` : ''}
      ${i.acao ? `<div style="margin-top:4px;color:#00708A"><b>Floresta:</b> ${esc(i.acao)}</div>` : ''}
      ${i.resumo ? `<details style="margin-top:6px"><summary style="cursor:pointer;color:#5b6670">Resumo completo da IARA</summary><div style="white-space:pre-wrap;color:#333;font-size:13px">${esc(i.resumo.substring(0, 2500))}</div></details>` : ''}
      ${i.link ? `<div style="margin-top:6px"><a href="${i.link}" style="color:#00708A">Abrir no HubSpot</a></div>` : ''}</td></tr>`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:680px"><p style="font-size:15px">Olá ${esc(vendedor.nome.split(' ')[0])}, a IARA conversou com <b>${itens.length}</b> lead(s)${quentes ? ` — <b>${quentes} com interesse</b>` : ''}. Os mais quentes estão primeiro.</p>
      <table style="border-collapse:collapse;width:100%;border:1px solid #e5e9f0">${itens.map(bloco).join('')}</table>
      <p style="font-size:13px;color:#5b6670">Floresta de Vendas: <a href="${base}" style="color:#00708A">${base}</a> → Vendas → Floresta. Aviso automático do Atlantyx OS (a cada hora, só quando há conversa nova).</p></div>`;
    const t = nodemailer.createTransport(smtp(user, pass));
    await t.sendMail({ from: `Atlantyx OS <${user}>`, to: para, subject: `🤖 IARA: ${itens.length} conversa(s) nova(s)${quentes ? ' — ' + quentes + ' com interesse' : ''}`, html });
    return { ok: true, para };
  }
  return { processar };
}
