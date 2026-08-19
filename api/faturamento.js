// api/faturamento.js — v1.17
// Kanban de Faturamento: Elaboração do Termo → Aprovação → Emissão de NF →
// Envio de NF (confere e-mail atlanteambr@gmail.com) → Pagamento (confere QuickBooks).
//
// Setup necessário (uma vez):
//   1. npm i imapflow   (para checar o e-mail; sem isso, "Verificar e-mail" retorna
//      instrução — nada mais quebra)
//   2. Vercel → Environment Variables:
//        EMAIL_IMAP_USER = atlanteambr@gmail.com
//        EMAIL_IMAP_PASS = senha de app do Gmail (myaccount.google.com/apppasswords —
//                           requer verificação em 2 etapas ativada)
//      (EMAIL_IMAP_HOST/PORT são opcionais; default imap.gmail.com:993)
//   3. QuickBooks: reaproveita a conexão já configurada em api/financeiro.js
//      (tokens no banco, action 'gerente_financeiro'/'qb_status' etc.)
//
// Todas as tabelas são criadas automaticamente (ensureTabelas) na 1ª chamada.

const STATUS = ['elaboracao', 'aprovacao', 'emissao_nf', 'envio_nf', 'pagamento', 'concluido'];
const STATUS_LABEL = {
  elaboracao: 'Elaboração do Termo', aprovacao: 'Aprovação do Termo', emissao_nf: 'Emissão de Nota Fiscal',
  envio_nf: 'Envio de Nota Fiscal', pagamento: 'Pagamento', concluido: 'Concluído',
};

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await ensureTabelas(_sql);
  return _sql;
}

async function ensureTabelas(sql) {
  await sql`CREATE TABLE IF NOT EXISTS termos_faturamento (
    id TEXT PRIMARY KEY,
    projeto TEXT, fase TEXT, contratante TEXT, contratada TEXT, cnpj_fornecedor TEXT,
    periodo_medicao TEXT, numero_termo TEXT, parcela TEXT, marco_projeto TEXT,
    valor_mensal_sustentacao NUMERIC DEFAULT 0, valor_total_termo NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'elaboracao',
    arquivo_nome TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    aprovado_em TIMESTAMPTZ, aprovado_por TEXT,
    nf_verificado_em TIMESTAMPTZ, nf_status TEXT DEFAULT 'pendente',
    nf_soma NUMERIC DEFAULT 0, nf_diferenca NUMERIC DEFAULT 0, nf_alerta_enviado_em TIMESTAMPTZ,
    pagamento_verificado_em TIMESTAMPTZ, pagamento_status TEXT DEFAULT 'pendente',
    observacoes TEXT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS termos_empresas (
    id TEXT PRIMARY KEY, termo_id TEXT REFERENCES termos_faturamento(id) ON DELETE CASCADE,
    ordem INT DEFAULT 0, empresa TEXT, contrato TEXT, ncm TEXT, centro_custo TEXT, diferimento TEXT,
    valor_total_contrato NUMERIC DEFAULT 0, percentual NUMERIC DEFAULT 0,
    valor_ja_faturado NUMERIC DEFAULT 0, valor_parcela_anterior NUMERIC DEFAULT 0,
    valor_parcela NUMERIC DEFAULT 0, saldo_contrato NUMERIC DEFAULT 0,
    nf_numero TEXT, nf_valor NUMERIC, nf_data TEXT, nf_status TEXT DEFAULT 'pendente',
    pagamento_status TEXT DEFAULT 'pendente', pagamento_data TEXT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS termos_notas_encontradas (
    id TEXT PRIMARY KEY, termo_id TEXT REFERENCES termos_faturamento(id) ON DELETE CASCADE,
    empresa_id TEXT, email_assunto TEXT, email_data TIMESTAMPTZ, email_remetente TEXT,
    anexo_nome TEXT, nf_numero TEXT, nf_valor NUMERIC, nf_chave TEXT, tipo_arquivo TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
}

function novoId(prefixo) { return (prefixo || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
const normEmpresa = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

// ═══════════════════════════════════════════════════════════════════════════
// 1. IMPORTAR TERMO (o frontend já leu o XLSX com SheetJS e manda o JSON pronto)
// ═══════════════════════════════════════════════════════════════════════════
async function termoImportar({ arquivo_nome, cabecalho = {}, empresas = [] } = {}) {
  if (!empresas.length) throw new Error('Nenhuma empresa/rateio encontrado no arquivo — confira se a aba "Termo_Aceite" tem a tabela "Valores e Rateios entre as Empresas"');
  const sql = await getSql();
  const id = novoId('termo');
  const valorTotal = empresas.reduce((s, e) => s + num(e.valor_parcela), 0);
  await sql`INSERT INTO termos_faturamento
    (id, projeto, fase, contratante, contratada, cnpj_fornecedor, periodo_medicao, numero_termo, parcela, marco_projeto, valor_mensal_sustentacao, valor_total_termo, status, arquivo_nome)
    VALUES (${id}, ${cabecalho.projeto || ''}, ${cabecalho.fase || ''}, ${cabecalho.contratante || ''}, ${cabecalho.contratada || ''}, ${cabecalho.cnpj_fornecedor || ''},
            ${cabecalho.periodo_medicao || ''}, ${cabecalho.numero_termo || ''}, ${cabecalho.parcela || ''}, ${cabecalho.marco_projeto || ''},
            ${num(cabecalho.valor_mensal_sustentacao)}, ${valorTotal}, 'elaboracao', ${arquivo_nome || ''})`;
  let ordem = 0;
  for (const e of empresas) {
    await sql`INSERT INTO termos_empresas
      (id, termo_id, ordem, empresa, contrato, ncm, centro_custo, diferimento, valor_total_contrato, percentual, valor_ja_faturado, valor_parcela_anterior, valor_parcela, saldo_contrato)
      VALUES (${novoId('temp')}, ${id}, ${ordem++}, ${e.empresa || ''}, ${e.contrato || ''}, ${e.ncm || ''}, ${e.centro_custo || ''}, ${e.diferimento || ''},
              ${num(e.valor_total_contrato)}, ${num(e.percentual)}, ${num(e.valor_ja_faturado)}, ${num(e.valor_parcela_anterior)}, ${num(e.valor_parcela)}, ${num(e.saldo_contrato)})`;
  }
  console.log(`[Faturamento] Termo importado: ${id} · ${cabecalho.projeto} · ${empresas.length} empresa(s) · total R$ ${valorTotal}`);
  return await termoGet({ id });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LISTAR / DETALHAR / MOVER
// ═══════════════════════════════════════════════════════════════════════════
async function termoList({ status } = {}) {
  const sql = await getSql();
  const termos = status
    ? await sql`SELECT * FROM termos_faturamento WHERE status = ${status} ORDER BY criado_em DESC`
    : await sql`SELECT * FROM termos_faturamento ORDER BY criado_em DESC`;
  const ids = termos.map(t => t.id);
  let empresasPorTermo = {};
  if (ids.length) {
    const rows = await sql`SELECT * FROM termos_empresas WHERE termo_id = ANY(${ids}) ORDER BY termo_id, ordem`;
    for (const r of rows) (empresasPorTermo[r.termo_id] = empresasPorTermo[r.termo_id] || []).push(r);
  }
  const porColuna = {};
  STATUS.forEach(s => porColuna[s] = []);
  for (const t of termos) {
    const emp = empresasPorTermo[t.id] || [];
    porColuna[t.status] = porColuna[t.status] || [];
    porColuna[t.status].push({ ...t, valor_total_termo: num(t.valor_total_termo), nf_soma: num(t.nf_soma), nf_diferenca: num(t.nf_diferenca), n_empresas: emp.length, n_nf_encontradas: emp.filter(e => e.nf_status === 'encontrada').length, n_pagas: emp.filter(e => e.pagamento_status === 'pago').length });
  }
  return { colunas: porColuna, labels: STATUS_LABEL, total: termos.length };
}

async function termoGet({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  const rows = await sql`SELECT * FROM termos_faturamento WHERE id = ${id} LIMIT 1`;
  if (!rows.length) throw new Error('Termo não encontrado: ' + id);
  const termo = rows[0];
  const empresas = await sql`SELECT * FROM termos_empresas WHERE termo_id = ${id} ORDER BY ordem`;
  const notas = await sql`SELECT * FROM termos_notas_encontradas WHERE termo_id = ${id} ORDER BY criado_em DESC`;
  return { termo: { ...termo, valor_total_termo: num(termo.valor_total_termo), nf_soma: num(termo.nf_soma), nf_diferenca: num(termo.nf_diferenca) },
    empresas: empresas.map(e => ({ ...e, valor_parcela: num(e.valor_parcela), valor_total_contrato: num(e.valor_total_contrato), saldo_contrato: num(e.saldo_contrato), nf_valor: e.nf_valor != null ? num(e.nf_valor) : null })),
    notas };
}

async function termoMover({ id, status } = {}) {
  if (!id || !STATUS.includes(status)) throw new Error('id e status válido obrigatórios (' + STATUS.join(', ') + ')');
  const sql = await getSql();
  await sql`UPDATE termos_faturamento SET status = ${status}, atualizado_em = NOW() WHERE id = ${id}`;
  return await termoGet({ id });
}

async function termoAprovar({ id, aprovado_por } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`UPDATE termos_faturamento SET status = 'emissao_nf', aprovado_em = NOW(), aprovado_por = ${aprovado_por || ''}, atualizado_em = NOW() WHERE id = ${id}`;
  return await termoGet({ id });
}

async function termoExcluir({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM termos_faturamento WHERE id = ${id}`;
  return { excluido: true, id };
}

async function termoEmpresaMarcarNf({ empresa_id, nf_numero, nf_valor, nf_data, nf_status } = {}) {
  if (!empresa_id) throw new Error('empresa_id obrigatório');
  const sql = await getSql();
  await sql`UPDATE termos_empresas SET nf_numero = ${nf_numero || null}, nf_valor = ${nf_valor != null ? num(nf_valor) : null}, nf_data = ${nf_data || null}, nf_status = ${nf_status || 'encontrada'} WHERE id = ${empresa_id}`;
  const rows = await sql`SELECT termo_id FROM termos_empresas WHERE id = ${empresa_id} LIMIT 1`;
  if (rows[0]) await recalcularNf(rows[0].termo_id);
  return { atualizado: true };
}

async function termoEmpresaMarcarPago({ empresa_id, pagamento_status, pagamento_data } = {}) {
  if (!empresa_id) throw new Error('empresa_id obrigatório');
  const sql = await getSql();
  await sql`UPDATE termos_empresas SET pagamento_status = ${pagamento_status || 'pago'}, pagamento_data = ${pagamento_data || new Date().toISOString().substring(0, 10)} WHERE id = ${empresa_id}`;
  const rows = await sql`SELECT termo_id FROM termos_empresas WHERE id = ${empresa_id} LIMIT 1`;
  if (rows[0]) await recalcularPagamento(rows[0].termo_id);
  return { atualizado: true };
}

async function recalcularNf(termoId) {
  const sql = await getSql();
  const empresas = await sql`SELECT * FROM termos_empresas WHERE termo_id = ${termoId}`;
  const soma = empresas.filter(e => e.nf_status === 'encontrada').reduce((s, e) => s + num(e.nf_valor), 0);
  const totalTermo = await sql`SELECT valor_total_termo FROM termos_faturamento WHERE id = ${termoId}`;
  const total = num(totalTermo[0]?.valor_total_termo);
  const diff = Math.round((total - soma) * 100) / 100;
  const todasEncontradas = empresas.every(e => e.nf_status === 'encontrada');
  const status = todasEncontradas && Math.abs(diff) < 1 ? 'completo' : (soma > 0 ? 'divergente' : 'pendente');
  await sql`UPDATE termos_faturamento SET nf_soma = ${soma}, nf_diferenca = ${diff}, nf_status = ${status}, nf_verificado_em = NOW(), atualizado_em = NOW() WHERE id = ${termoId}`;
  return { soma, diff, status };
}

async function recalcularPagamento(termoId) {
  const sql = await getSql();
  const empresas = await sql`SELECT pagamento_status FROM termos_empresas WHERE termo_id = ${termoId}`;
  const pagas = empresas.filter(e => e.pagamento_status === 'pago').length;
  const status = pagas === 0 ? 'pendente' : (pagas === empresas.length ? 'pago' : 'parcial');
  await sql`UPDATE termos_faturamento SET pagamento_status = ${status}, pagamento_verificado_em = NOW(), atualizado_em = NOW() WHERE id = ${termoId}`;
  if (status === 'pago') await sql`UPDATE termos_faturamento SET status = 'concluido' WHERE id = ${termoId}`;
  return { status };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. VERIFICAR E-MAIL (atlanteambr@gmail.com) — as notas fiscais chegaram?
//    Procura anexos (XML de NFe é lido de verdade: valor, número, chave;
//    PDF só é registrado pelo nome, sem valor extraído automaticamente)
// ═══════════════════════════════════════════════════════════════════════════
async function getImap() {
  try { const mod = await import('imapflow'); return mod.ImapFlow || mod.default?.ImapFlow || mod.default; }
  catch (e) { return null; }
}

function extrairXmlNFe(xmlBuffer) {
  try {
    const xml = xmlBuffer.toString('utf8');
    const get = (tag) => { const m = xml.match(new RegExp('<' + tag + '>([^<]*)</' + tag + '>')); return m ? m[1] : null; };
    const getIn = (tag, dentro) => { const bloco = xml.match(new RegExp('<' + dentro + '>([\\s\\S]*?)</' + dentro + '>')); if (!bloco) return null; const m = bloco[1].match(new RegExp('<' + tag + '>([^<]*)</' + tag + '>')); return m ? m[1] : null; };
    const vNF = get('vNF') || get('vFatur') || get('valor');
    if (!vNF && !get('nNF')) return null; // não parece NFe
    return { nf_numero: get('nNF'), nf_valor: vNF ? num(vNF) : null, nf_chave: (xml.match(/Id="NFe(\d{44})"/) || [])[1] || null,
      emit_nome: getIn('xNome', 'emit'), dest_nome: getIn('xNome', 'dest'), dh_emi: get('dhEmi') };
  } catch (e) { return null; }
}

async function termoVerificarEmail({ termo_id, dias = 45 } = {}) {
  if (!termo_id) throw new Error('termo_id obrigatório');
  const { termo, empresas } = await termoGet({ id: termo_id });
  const ImapFlow = await getImap();
  if (!ImapFlow) return { erro: 'Pacote imapflow não instalado', hint: 'No repo: npm i imapflow (commitar package.json) e Redeploy.', configurado: false };
  const user = process.env.EMAIL_IMAP_USER || 'atlanteambr@gmail.com';
  const pass = process.env.EMAIL_IMAP_PASS;
  if (!pass) return { erro: 'EMAIL_IMAP_PASS não configurada', hint: 'Vercel → Environment Variables → EMAIL_IMAP_PASS = senha de app do Gmail (myaccount.google.com/apppasswords).', configurado: false };
  const host = process.env.EMAIL_IMAP_HOST || 'imap.gmail.com';
  const port = parseInt(process.env.EMAIL_IMAP_PORT || '993');

  const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
  const encontradasNovas = [];
  const sql = await getSql();
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const desde = new Date(Date.now() - dias * 86400 * 1000);
      const uids = await client.search({ since: desde }, { uid: true });
      for (const uid of (uids || []).slice(-300)) { // limite de segurança
        let msg;
        try { msg = await client.fetchOne(uid, { envelope: true, bodyStructure: true, source: false }, { uid: true }); } catch (_) { continue; }
        if (!msg || !msg.bodyStructure) continue;
        const anexos = [];
        (function coletar(node) {
          if (!node) return;
          if (node.disposition === 'attachment' || (node.parameters && node.parameters.name)) {
            const nome = node.dispositionParameters?.filename || node.parameters?.name || '';
            if (/\.(xml|pdf)$/i.test(nome)) anexos.push({ nome, part: node.part });
          }
          (node.childNodes || []).forEach(coletar);
        })(msg.bodyStructure);
        if (!anexos.length) continue;
        for (const anexo of anexos) {
          let jaTem;
          try { jaTem = await sql`SELECT id FROM termos_notas_encontradas WHERE termo_id = ${termo_id} AND anexo_nome = ${anexo.nome} AND email_assunto = ${msg.envelope?.subject || ''} LIMIT 1`; } catch (_) { jaTem = []; }
          if (jaTem.length) continue;
          let dados = { nf_numero: null, nf_valor: null, nf_chave: null, emit_nome: null, dest_nome: null };
          if (/\.xml$/i.test(anexo.nome)) {
            try { const dl = await client.download(uid, anexo.part, { uid: true }); const chunks = []; for await (const c of dl.content) chunks.push(c); const parsed = extrairXmlNFe(Buffer.concat(chunks)); if (parsed) dados = parsed; } catch (e) { console.warn('[Faturamento] baixar/ler xml:', e.message); }
          }
          // Casar com empresa: pelo nome extraído do XML, ou pelo assunto/nome do anexo
          const alvo = normEmpresa(dados.dest_nome || dados.emit_nome || '') || normEmpresa(anexo.nome) || normEmpresa(msg.envelope?.subject || '');
          let empresaMatch = null;
          for (const e of empresas) { const ne = normEmpresa(e.empresa); if (ne && alvo.includes(ne)) { empresaMatch = e; break; } }
          const notaId = novoId('nota');
          await sql`INSERT INTO termos_notas_encontradas (id, termo_id, empresa_id, email_assunto, email_data, email_remetente, anexo_nome, nf_numero, nf_valor, nf_chave, tipo_arquivo)
            VALUES (${notaId}, ${termo_id}, ${empresaMatch?.id || null}, ${msg.envelope?.subject || ''}, ${msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null}, ${(msg.envelope?.from || [])[0]?.address || ''}, ${anexo.nome}, ${dados.nf_numero}, ${dados.nf_valor}, ${dados.nf_chave}, /\.xml$/i.test(anexo.nome) ? 'xml' : 'pdf')`;
          encontradasNovas.push({ id: notaId, anexo: anexo.nome, empresa: empresaMatch?.empresa || null, valor: dados.nf_valor });
          if (empresaMatch && dados.nf_valor != null) {
            await sql`UPDATE termos_empresas SET nf_numero = ${dados.nf_numero}, nf_valor = ${dados.nf_valor}, nf_data = ${dados.dh_emi ? String(dados.dh_emi).substring(0, 10) : null}, nf_status = 'encontrada' WHERE id = ${empresaMatch.id}`;
          }
        }
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    try { await client.logout(); } catch (_) {}
    return { erro: 'IMAP: ' + e.message, configurado: true };
  }

  const recalc = await recalcularNf(termo_id);
  // Alerta se ainda faltar nota ou houver divergência de valor
  let alertaEnviado = false;
  if (recalc.status !== 'completo') {
    try { await enviarAlertaFaturamento(termo, recalc); alertaEnviado = true; await sql`UPDATE termos_faturamento SET nf_alerta_enviado_em = NOW() WHERE id = ${termo_id}`; } catch (e) { console.warn('[Faturamento] alerta e-mail falhou:', e.message); }
  }
  return { encontradas_agora: encontradasNovas, nf_status: recalc.status, nf_soma: recalc.soma, nf_diferenca: recalc.diff, alerta_enviado: alertaEnviado };
}

async function enviarAlertaFaturamento(termo, recalc) {
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM, para = process.env.FINANCEIRO_EMAIL;
  if (!key || !from || !para) throw new Error('RESEND_API_KEY/RESEND_FROM/FINANCEIRO_EMAIL não configurados');
  const faltando = recalc.status === 'pendente' ? 'nenhuma nota fiscal encontrada ainda' : 'faltam nota(s) ou o valor não bate';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">
    <h2 style="color:#c0392b;">⚠ Faturamento: ${faltando}</h2>
    <p><b>Termo:</b> ${termo.projeto || termo.numero_termo} — ${termo.periodo_medicao || ''}</p>
    <p><b>Contratante:</b> ${termo.contratante || ''} · <b>Nº Termo:</b> ${termo.numero_termo || ''} (parcela ${termo.parcela || ''})</p>
    <p><b>Valor total do termo:</b> R$ ${(termo.valor_total_termo || 0).toFixed(2)}<br/>
    <b>Soma das NFs encontradas:</b> R$ ${(recalc.soma || 0).toFixed(2)}<br/>
    <b>Diferença:</b> R$ ${(recalc.diff || 0).toFixed(2)}</p>
    <p>Verifique no Atlantyx OS → S1 Financeiro → Kanban Faturamento, coluna "Envio de Nota Fiscal".</p>
  </div>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: para, subject: '⚠ Faturamento: notas pendentes/divergentes — ' + (termo.projeto || termo.numero_termo), html }) });
  if (!r.ok) throw new Error('Resend HTTP ' + r.status);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. VERIFICAR PAGAMENTO NO QUICKBOOKS (A Receber — Invoice quitado)
//    Reaproveita os tokens já persistidos por api/financeiro.js (kv_store 'qb:tokens')
// ═══════════════════════════════════════════════════════════════════════════
async function qbTokensLer() {
  try { const sql = await getSql(); const rows = await sql`SELECT value FROM kv_store WHERE key = 'qb:tokens' LIMIT 1`; if (rows.length && rows[0].value) return typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value; } catch (_) {}
  return null;
}
async function qbTokenFat() {
  const salvo = await qbTokensLer();
  const refreshToken = salvo?.refresh_token || process.env.QB_REFRESH_TOKEN;
  const clientId = process.env.QB_CLIENT_ID, clientSecret = process.env.QB_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) throw new Error('QuickBooks não conectado (configure em S1 Financeiro → Realizado QuickBooks)');
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', { method: 'POST', headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}` });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('QB OAuth: ' + (d.error_description || d.error || ('HTTP ' + r.status)));
  const sql = await getSql();
  const novo = { ...salvo, access_token: d.access_token, refresh_token: d.refresh_token || refreshToken, atualizado_em: new Date().toISOString() };
  try { await sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('qb:tokens', ${JSON.stringify(novo)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; } catch (_) {}
  return { token: d.access_token, realm: salvo?.realm_id || process.env.QB_REALM_ID };
}
async function qbQueryFat(sqlQuery, token, realm, sandbox) {
  const base = sandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
  const r = await fetch(`${base}/v3/company/${realm}/query?query=${encodeURIComponent(sqlQuery)}&minorversion=65`, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('QB query [' + r.status + ']: ' + (d.Fault?.Error?.[0]?.Message || JSON.stringify(d).substring(0, 150)));
  return d;
}

async function termoVerificarPagamento({ termo_id } = {}) {
  if (!termo_id) throw new Error('termo_id obrigatório');
  const { termo, empresas } = await termoGet({ id: termo_id });
  let token, realm;
  try { const t = await qbTokenFat(); token = t.token; realm = t.realm; } catch (e) { return { erro: e.message, configurado: false }; }
  if (!realm) return { erro: 'QB_REALM_ID ausente', configurado: false };
  const sandbox = process.env.QB_SANDBOX === 'true';
  const sql = await getSql();
  let atualizadas = 0, erroQ = null;
  try {
    const data = await qbQueryFat(`select * from Invoice where Balance = '0' maxresults 1000`, token, realm, sandbox);
    const pagas = data?.QueryResponse?.Invoice || [];
    for (const e of empresas) {
      if (e.pagamento_status === 'pago') continue;
      const alvo = normEmpresa(e.empresa);
      const achou = pagas.find(inv => normEmpresa(inv.CustomerRef?.name || '').includes(alvo) && Math.abs(num(inv.TotalAmt) - num(e.valor_parcela)) < Math.max(1, num(e.valor_parcela) * 0.02));
      if (achou) { await sql`UPDATE termos_empresas SET pagamento_status = 'pago', pagamento_data = ${(achou.TxnDate || '').substring(0, 10)} WHERE id = ${e.id}`; atualizadas++; }
    }
  } catch (e) { erroQ = e.message; }
  const recalc = await recalcularPagamento(termo_id);
  return { atualizadas, pagamento_status: recalc.status, erro: erroQ };
}

async function termoQbDiagnostico() {
  try { const t = await qbTokenFat(); return { ok: true, realm: t.realm }; } catch (e) { return { ok: false, erro: e.message }; }
}

// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ success: false, error: 'JSON inválido' }); }
  const { action, payload = {} } = body;

  const acoes = {
    termo_importar:          () => termoImportar(payload),
    termo_list:               () => termoList(payload),
    termo_get:                 () => termoGet(payload),
    termo_mover:               () => termoMover(payload),
    termo_aprovar:             () => termoAprovar(payload),
    termo_excluir:             () => termoExcluir(payload),
    termo_empresa_marcar_nf:   () => termoEmpresaMarcarNf(payload),
    termo_empresa_marcar_pago: () => termoEmpresaMarcarPago(payload),
    termo_verificar_email:     () => termoVerificarEmail(payload),
    termo_verificar_pagamento: () => termoVerificarPagamento(payload),
    termo_qb_diagnostico:      () => termoQbDiagnostico(),
    status:                    () => ({ ok: true, modulo: 'faturamento', colunas: STATUS }),
  };

  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try {
    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });
  } catch (error) {
    console.error('[ERRO faturamento]', action, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
