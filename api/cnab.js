// api/cnab.js — v1.25
// Gerador de arquivo de pagamentos CNAB 240 (padrão FEBRABAN / Itaú SISPAG).
//
// ⚠ IMPORTANTE: todo arquivo CNAB precisa passar por HOMOLOGAÇÃO com o banco antes
// de uso em produção. O Itaú tem particularidades por convênio/modalidade. Gere um
// arquivo de teste, suba no internet banking e valide ANTES de confiar no fluxo.
//
// Formas de pagamento suportadas:
//   01 = Crédito em Conta Corrente (mesmo banco - Itaú)
//   41 = TED (outro banco)
//   30 = Boleto (via Segmento J, com código de barras)

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await ensureTabelas(_sql);
  return _sql;
}
async function ensureTabelas(sql) {
  // Dados bancários do fornecedor ficam na própria despesa programada
  for (const col of [
    'forn_cnpj_cpf TEXT', 'forn_banco TEXT', 'forn_agencia TEXT', 'forn_conta TEXT',
    'forn_conta_dac TEXT', 'forn_tipo_conta TEXT', 'forn_codigo_barras TEXT', 'forma_pagamento TEXT',
  ]) {
    try { await sql.query(`ALTER TABLE despesas_programadas ADD COLUMN IF NOT EXISTS ${col}`); } catch (e) { console.warn('[CNAB] migração:', e.message); }
  }
  await sql`CREATE TABLE IF NOT EXISTS cnab_remessas (
    id TEXT PRIMARY KEY,
    nsa INT NOT NULL,
    arquivo_nome TEXT,
    qtd_pagamentos INT DEFAULT 0,
    valor_total NUMERIC DEFAULT 0,
    ocorrencias_ids JSONB,
    conteudo TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers de formatação CNAB (posições fixas — largura é sagrada aqui)
// ═══════════════════════════════════════════════════════════════════════════
function limpaAcentos(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .,\-\/]/g, ' ').toUpperCase();
}
// Alfanumérico: à esquerda, completado com espaços à direita
function A(valor, tam) { return limpaAcentos(valor).substring(0, tam).padEnd(tam, ' '); }
// Numérico: só dígitos, zeros à esquerda
function N(valor, tam) {
  const d = String(valor == null ? '' : valor).replace(/\D/g, '');
  return d.substring(Math.max(0, d.length - tam)).padStart(tam, '0');
}
// Valor monetário: centavos, sem separador
function V(valor, tam) { return N(Math.round((parseFloat(valor) || 0) * 100), tam); }
function dataDDMMAAAA(d) {
  const dt = d instanceof Date ? d : new Date(d + 'T12:00:00');
  if (isNaN(dt)) return '00000000';
  return String(dt.getDate()).padStart(2, '0') + String(dt.getMonth() + 1).padStart(2, '0') + dt.getFullYear();
}
function horaHHMMSS(d = new Date()) {
  return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
}

// Empresa pagadora — vem das envs (uma vez configurado, não muda)
function empresaPagadora() {
  const e = {
    cnpj: (process.env.CNAB_EMPRESA_CNPJ || '').replace(/\D/g, ''),
    nome: process.env.CNAB_EMPRESA_NOME || 'ATLANTEAM',
    agencia: (process.env.CNAB_AGENCIA || '').replace(/\D/g, ''),
    conta: (process.env.CNAB_CONTA || '').replace(/\D/g, ''),
    conta_dac: (process.env.CNAB_CONTA_DAC || '').replace(/\D/g, ''),
    banco: '341',
  };
  const faltando = [];
  if (!e.cnpj) faltando.push('CNAB_EMPRESA_CNPJ');
  if (!e.agencia) faltando.push('CNAB_AGENCIA');
  if (!e.conta) faltando.push('CNAB_CONTA');
  if (!e.conta_dac) faltando.push('CNAB_CONTA_DAC');
  if (faltando.length) {
    const err = new Error('Dados bancários da empresa não configurados: ' + faltando.join(', '));
    err.hint = 'No Vercel → Environment Variables, defina: CNAB_EMPRESA_CNPJ, CNAB_EMPRESA_NOME, CNAB_AGENCIA, CNAB_CONTA, CNAB_CONTA_DAC (dígito da conta). São os dados da conta Itaú que vai PAGAR.';
    throw err;
  }
  return e;
}

// ═══════════════════════════════════════════════════════════════════════════
// Montagem dos registros (cada um DEVE ter exatamente 240 caracteres)
// ═══════════════════════════════════════════════════════════════════════════
function headerArquivo(emp, nsa, agora) {
  return N(emp.banco, 3) + N(0, 4) + '0' + ''.padEnd(9, ' ')
    + '2' + N(emp.cnpj, 14) + ''.padEnd(20, ' ')
    + N(emp.agencia, 5) + ' ' + N(emp.conta, 12) + ' ' + A(emp.conta_dac, 1)
    + A(emp.nome, 30) + A('BANCO ITAU SA', 30) + ''.padEnd(10, ' ')
    + '1' + dataDDMMAAAA(agora) + horaHHMMSS(agora) + N(nsa, 6) + N(80, 3) + N(0, 5)
    + ''.padEnd(20, ' ') + ''.padEnd(20, ' ') + ''.padEnd(29, ' ');
}
function headerLote(emp, lote, formaPagto, agora) {
  // Posições FEBRABAN 240 — header de lote (registro 1). Total obrigatório: 240.
  const l = N(emp.banco, 3)            // 001-003 banco
    + N(lote, 4)                        // 004-007 lote
    + '1'                               // 008 tipo registro
    + 'C'                               // 009 tipo operação (C = crédito)
    + N(20, 2)                          // 010-011 tipo serviço (20 = pagamento fornecedor)
    + N(formaPagto, 2)                  // 012-013 forma de lançamento
    + N(40, 3)                          // 014-016 versão layout do lote
    + ' '                               // 017 branco
    + '2'                               // 018 tipo inscrição (2 = CNPJ)
    + N(emp.cnpj, 14)                   // 019-032 CNPJ
    + ''.padEnd(20, ' ')                // 033-052 uso da empresa
    + N(emp.agencia, 5)                 // 053-057 agência
    + ' '                               // 058 DV agência
    + N(emp.conta, 12)                  // 059-070 conta
    + ' '                               // 071 DV conta
    + A(emp.conta_dac, 1)               // 072 DV agência/conta
    + A(emp.nome, 30)                   // 073-102 nome da empresa
    + ''.padEnd(40, ' ')                // 103-142 mensagem/finalidade
    + ''.padEnd(30, ' ')                // 143-172 logradouro
    + N(0, 5)                           // 173-177 número
    + ''.padEnd(15, ' ')                // 178-192 complemento
    + ''.padEnd(20, ' ')                // 193-212 cidade
    + N(0, 8)                           // 213-220 CEP
    + ''.padEnd(2, ' ')                 // 221-222 UF
    + ''.padEnd(8, ' ')                 // 223-230 uso FEBRABAN
    + ''.padEnd(10, ' ');               // 231-240 ocorrências
  return l;
}
// Segmento A: crédito em conta / TED
function segmentoA(emp, lote, seq, pag) {
  // Posições FEBRABAN 240 — detalhe segmento A (crédito em conta / TED). Total: 240.
  const camara = (pag.forma_pagamento === '41') ? N(18, 3) : N(0, 3);
  const l = N(emp.banco, 3)             // 001-003 banco
    + N(lote, 4)                         // 004-007 lote
    + '3'                                // 008 tipo registro
    + N(seq, 5)                          // 009-013 nº sequencial do registro no lote
    + 'A'                                // 014 segmento
    + '0'                                // 015 tipo de movimento (0 = inclusão)
    + N(0, 2)                            // 016-017 código da instrução
    + camara                             // 018-020 câmara centralizadora
    + N(pag.forn_banco || '341', 3)      // 021-023 banco do favorecido
    + N(pag.forn_agencia, 5)             // 024-028 agência
    + ' '                                // 029 DV agência
    + N(pag.forn_conta, 12)              // 030-041 conta
    + ' '                                // 042 DV conta
    + A(pag.forn_conta_dac, 1)           // 043 DV agência/conta
    + A(pag.favorecido_nome, 30)         // 044-073 nome do favorecido
    + A(pag.seu_numero || pag.id, 20)    // 074-093 seu número (seu controle)
    + dataDDMMAAAA(pag.data_pagamento)   // 094-101 data do pagamento
    + 'BRL'                              // 102-104 tipo da moeda
    + N(0, 15)                           // 105-119 quantidade da moeda
    + V(pag.valor, 15)                   // 120-134 valor do pagamento
    + ''.padEnd(15, ' ')                 // 135-149 nosso número (retorno)
    + ''.padEnd(5, ' ')                  // 150-154 uso FEBRABAN
    + N(0, 8)                            // 155-162 data real efetivação (retorno)
    + V(0, 15)                           // 163-177 valor real efetivação (retorno)
    + A(pag.observacao || 'PAGTO FORNECEDOR', 40) // 178-217 outras informações
    + N(0, 2)                            // 218-219 complemento tipo serviço
    + ''.padEnd(6, ' ')                  // 220-225 uso FEBRABAN
    + N(0, 5)                            // 226-230 aviso ao favorecido
    + ''.padEnd(10, ' ');                // 231-240 ocorrências (retorno)
  return l;
}
// Segmento J: pagamento de boleto (código de barras)
function segmentoJ(emp, lote, seq, pag) {
  // Posições FEBRABAN 240 — detalhe segmento J (boleto com código de barras). Total: 240.
  const cb = String(pag.forn_codigo_barras || '').replace(/\D/g, '').padEnd(44, '0').substring(0, 44);
  const l = N(emp.banco, 3)             // 001-003 banco
    + N(lote, 4)                         // 004-007 lote
    + '3'                                // 008 tipo registro
    + N(seq, 5)                          // 009-013 sequencial
    + 'J'                                // 014 segmento
    + '0'                                // 015 tipo de movimento
    + N(0, 2)                            // 016-017 código da instrução
    + cb                                 // 018-061 código de barras (44)
    + A(pag.favorecido_nome, 30)         // 062-091 nome do beneficiário
    + dataDDMMAAAA(pag.data_vencimento || pag.data_pagamento) // 092-099 vencimento
    + V(pag.valor, 15)                   // 100-114 valor nominal
    + V(0, 15)                           // 115-129 desconto/abatimento
    + V(0, 15)                           // 130-144 acréscimos (mora/multa)
    + dataDDMMAAAA(pag.data_pagamento)   // 145-152 data do pagamento
    + V(pag.valor, 15)                   // 153-167 valor do pagamento
    + V(0, 15)                           // 168-182 quantidade da moeda
    + A(pag.seu_numero || pag.id, 20)    // 183-202 referência do sacado
    + ''.padEnd(13, ' ')                 // 203-215 uso FEBRABAN
    + ''.padEnd(15, ' ')                 // 216-230 nosso número (retorno)
    + ''.padEnd(10, ' ');                // 231-240 ocorrências (retorno)
  return l;
}
function trailerLote(emp, lote, qtdRegistros, valorTotal) {
  return N(emp.banco, 3) + N(lote, 4) + '5' + ''.padEnd(9, ' ')
    + N(qtdRegistros, 6) + V(valorTotal, 18) + N(0, 18) + ''.padEnd(171, ' ')
    + ''.padEnd(10, ' ');
}
function trailerArquivo(emp, qtdLotes, qtdRegistros) {
  return N(emp.banco, 3) + N(9999, 4) + '9' + ''.padEnd(9, ' ')
    + N(qtdLotes, 6) + N(qtdRegistros, 6) + N(0, 6) + ''.padEnd(205, ' ');
}

// ═══════════════════════════════════════════════════════════════════════════
async function pagamentosDisponiveis({ data_inicio, data_fim } = {}) {
  const sql = await getSql();
  const hoje = new Date().toISOString().split('T')[0];
  const ini = data_inicio || hoje;
  const fim = data_fim || new Date(new Date(hoje).getFullYear(), new Date(hoje).getMonth() + 1, 0).toISOString().split('T')[0];
  const rows = await sql`SELECT o.id, o.data_prevista, o.valor, o.status, o.despesa_id,
      d.descricao, d.fornecedor, d.forn_cnpj_cpf, d.forn_banco, d.forn_agencia, d.forn_conta,
      d.forn_conta_dac, d.forn_tipo_conta, d.forn_codigo_barras, d.forma_pagamento
    FROM despesas_ocorrencias o LEFT JOIN despesas_programadas d ON d.id = o.despesa_id
    WHERE o.status != 'paga' AND o.data_prevista >= ${ini} AND o.data_prevista <= ${fim}
    ORDER BY o.data_prevista ASC`;
  return {
    pagamentos: rows.map(r => {
      const forma = r.forma_pagamento || (r.forn_codigo_barras ? '30' : (r.forn_banco === '341' ? '01' : '41'));
      const faltando = [];
      if (!r.fornecedor) faltando.push('fornecedor');
      if (!r.forn_cnpj_cpf) faltando.push('CNPJ/CPF');
      if (forma === '30') { if (!r.forn_codigo_barras) faltando.push('código de barras'); }
      else { if (!r.forn_banco) faltando.push('banco'); if (!r.forn_agencia) faltando.push('agência'); if (!r.forn_conta) faltando.push('conta'); }
      return { ...r, data_prevista: String(r.data_prevista).split('T')[0], valor: parseFloat(r.valor) || 0,
        forma_pagamento: forma, pronto: faltando.length === 0, faltando };
    }),
    periodo: { data_inicio: ini, data_fim: fim },
  };
}

async function dadosBancariosSalvar(p = {}) {
  if (!p.despesa_id) throw new Error('despesa_id obrigatório');
  const sql = await getSql();
  await sql`UPDATE despesas_programadas SET
    forn_cnpj_cpf = ${p.forn_cnpj_cpf || null}, forn_banco = ${p.forn_banco || null},
    forn_agencia = ${p.forn_agencia || null}, forn_conta = ${p.forn_conta || null},
    forn_conta_dac = ${p.forn_conta_dac || null}, forn_tipo_conta = ${p.forn_tipo_conta || 'CC'},
    forn_codigo_barras = ${p.forn_codigo_barras || null}, forma_pagamento = ${p.forma_pagamento || null}
    WHERE id = ${p.despesa_id}`;
  return { salvo: true };
}

async function gerarRemessa({ ocorrencias_ids = [], data_pagamento } = {}) {
  if (!ocorrencias_ids.length) throw new Error('Selecione ao menos um pagamento');
  const emp = empresaPagadora();
  const sql = await getSql();
  const { pagamentos } = await pagamentosDisponiveis({ data_inicio: '2000-01-01', data_fim: '2099-12-31' });
  const selecionados = pagamentos.filter(p => ocorrencias_ids.includes(p.id));
  if (!selecionados.length) throw new Error('Nenhum pagamento encontrado com os ids informados');
  const semDados = selecionados.filter(p => !p.pronto);
  if (semDados.length) {
    const err = new Error(`${semDados.length} pagamento(s) sem dados bancários completos: ` +
      semDados.map(p => `${p.descricao || p.fornecedor} (falta ${p.faltando.join(', ')})`).join(' · '));
    err.hint = 'Complete os dados bancários do fornecedor na Agenda de Despesas antes de gerar a remessa.';
    throw err;
  }

  const agora = new Date();
  const dataPagto = data_pagamento || agora.toISOString().split('T')[0];
  const nsaRow = await sql`SELECT COALESCE(MAX(nsa),0)+1 AS prox FROM cnab_remessas`;
  const nsa = nsaRow[0].prox;

  const linhas = [headerArquivo(emp, nsa, agora)];
  let totalRegistros = 1; // header de arquivo
  let lote = 0, valorTotalArquivo = 0;

  // Um lote por forma de pagamento (o banco exige lotes homogêneos)
  const porForma = {};
  selecionados.forEach(p => { (porForma[p.forma_pagamento] = porForma[p.forma_pagamento] || []).push(p); });

  for (const [forma, itens] of Object.entries(porForma)) {
    lote++;
    linhas.push(headerLote(emp, lote, forma, agora)); totalRegistros++;
    let seq = 0, valorLote = 0;
    for (const p of itens) {
      seq++;
      const dados = { ...p, id: p.id, favorecido_nome: p.fornecedor, data_pagamento: dataPagto,
        data_vencimento: p.data_prevista, observacao: p.descricao, seu_numero: p.id.substring(0, 20) };
      linhas.push(forma === '30' ? segmentoJ(emp, lote, seq, dados) : segmentoA(emp, lote, seq, dados));
      totalRegistros++; valorLote += p.valor;
    }
    linhas.push(trailerLote(emp, lote, seq + 2, valorLote)); totalRegistros++;
    valorTotalArquivo += valorLote;
  }
  linhas.push(trailerArquivo(emp, lote, totalRegistros + 1)); totalRegistros++;

  // VALIDAÇÃO CRÍTICA: toda linha CNAB tem exatamente 240 caracteres
  const erros = [];
  linhas.forEach((l, i) => { if (l.length !== 240) erros.push(`Linha ${i + 1} com ${l.length} caracteres (deveria ter 240)`); });
  if (erros.length) throw new Error('Erro na montagem do arquivo CNAB: ' + erros.slice(0, 3).join(' · '));

  const conteudo = linhas.join('\r\n') + '\r\n';
  const nomeArquivo = `PAG${String(nsa).padStart(5, '0')}_${dataPagto.replace(/-/g, '')}.REM`;
  const id = 'rem_' + Date.now().toString(36);
  await sql`INSERT INTO cnab_remessas (id, nsa, arquivo_nome, qtd_pagamentos, valor_total, ocorrencias_ids, conteudo)
    VALUES (${id}, ${nsa}, ${nomeArquivo}, ${selecionados.length}, ${valorTotalArquivo}, ${JSON.stringify(ocorrencias_ids)}, ${conteudo})`;
  console.log(`[CNAB] Remessa ${nomeArquivo}: ${selecionados.length} pagamento(s), R$ ${valorTotalArquivo}, ${linhas.length} linhas`);
  return { id, nsa, arquivo_nome: nomeArquivo, qtd_pagamentos: selecionados.length, valor_total: Math.round(valorTotalArquivo * 100) / 100,
    linhas: linhas.length, conteudo, data_pagamento: dataPagto,
    aviso: 'Valide este arquivo com o Itaú (homologação) antes do primeiro uso em produção.' };
}

async function remessaList() {
  const sql = await getSql();
  const rows = await sql`SELECT id, nsa, arquivo_nome, qtd_pagamentos, valor_total, criado_em FROM cnab_remessas ORDER BY criado_em DESC LIMIT 30`;
  return { remessas: rows.map(r => ({ ...r, valor_total: parseFloat(r.valor_total) || 0 })) };
}
async function remessaGet({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  const r = await sql`SELECT * FROM cnab_remessas WHERE id = ${id} LIMIT 1`;
  if (!r.length) throw new Error('Remessa não encontrada');
  return { remessa: r[0] };
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
    pagamentos_disponiveis: () => pagamentosDisponiveis(payload),
    dados_bancarios_salvar: () => dadosBancariosSalvar(payload),
    gerar_remessa:          () => gerarRemessa(payload),
    remessa_list:           () => remessaList(),
    remessa_get:            () => remessaGet(payload),
    config_status:          () => { try { const e = empresaPagadora(); return { configurado: true, empresa: e.nome, agencia: e.agencia, conta: e.conta + '-' + e.conta_dac }; } catch (e) { return { configurado: false, erro: e.message, hint: e.hint }; } },
    status:                 () => ({ ok: true, modulo: 'cnab' }),
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try {
    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });
  } catch (error) {
    console.error('[ERRO cnab]', action, error.message);
    return res.status(500).json({ success: false, error: error.message, hint: error.hint });
  }
}
