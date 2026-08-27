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
    pagamento_status TEXT DEFAULT 'pendente', pagamento_data TEXT,
    qb_invoice_id TEXT, qb_invoice_doc TEXT, qb_lancado_em TIMESTAMPTZ, qb_erro TEXT
  )`;
  // v1.18: migração leve p/ bancos já existentes (colunas novas sem quebrar dados)
  try { await sql`ALTER TABLE termos_empresas ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT`; } catch (_) {}
  try { await sql`ALTER TABLE termos_empresas ADD COLUMN IF NOT EXISTS qb_invoice_doc TEXT`; } catch (_) {}
  try { await sql`ALTER TABLE termos_empresas ADD COLUMN IF NOT EXISTS qb_lancado_em TIMESTAMPTZ`; } catch (_) {}
  try { await sql`ALTER TABLE termos_empresas ADD COLUMN IF NOT EXISTS qb_erro TEXT`; } catch (_) {}
  await sql`CREATE TABLE IF NOT EXISTS termos_notas_encontradas (
    id TEXT PRIMARY KEY, termo_id TEXT REFERENCES termos_faturamento(id) ON DELETE CASCADE,
    empresa_id TEXT, email_assunto TEXT, email_data TIMESTAMPTZ, email_remetente TEXT,
    anexo_nome TEXT, nf_numero TEXT, nf_valor NUMERIC, nf_chave TEXT, tipo_arquivo TEXT,
    arquivo_url TEXT, origem TEXT DEFAULT 'email',
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  try { await sql`ALTER TABLE termos_notas_encontradas ADD COLUMN IF NOT EXISTS arquivo_url TEXT`; } catch (_) {}
  try { await sql`ALTER TABLE termos_empresas ADD COLUMN IF NOT EXISTS pagamento_origem TEXT`; } catch (_) {} // v1.34
  try { await sql`ALTER TABLE termos_notas_encontradas ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'email'`; } catch (_) {}
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
async function termoList({ status, mes, ano, periodo_texto } = {}) {
  const sql = await getSql();
  // v1.32: filtro por mês/ano (data de criação do termo) e/ou por texto do período de medição.
  // Filtra pela criação porque "periodo_medicao" é texto livre ("julho/2026", "07/2026") e não
  // é confiável para comparação de data — mas dá para buscar por ele como texto.
  let termos;
  const temMesAno = (mes || ano);
  if (temMesAno) {
    const anoF = parseInt(ano) || new Date().getFullYear();
    const ini = mes ? `${anoF}-${String(parseInt(mes)).padStart(2, '0')}-01` : `${anoF}-01-01`;
    const fim = mes
      ? new Date(anoF, parseInt(mes), 0).toISOString().split('T')[0]
      : `${anoF}-12-31`;
    termos = status
      ? await sql`SELECT * FROM termos_faturamento WHERE status = ${status}
          AND criado_em >= ${ini + ' 00:00:00'} AND criado_em <= ${fim + ' 23:59:59'} ORDER BY criado_em DESC`
      : await sql`SELECT * FROM termos_faturamento
          WHERE criado_em >= ${ini + ' 00:00:00'} AND criado_em <= ${fim + ' 23:59:59'} ORDER BY criado_em DESC`;
  } else {
    termos = status
      ? await sql`SELECT * FROM termos_faturamento WHERE status = ${status} ORDER BY criado_em DESC`
      : await sql`SELECT * FROM termos_faturamento ORDER BY criado_em DESC`;
  }
  // Busca livre pelo texto do período de medição (ex.: "julho", "07/2026")
  if (periodo_texto && periodo_texto.trim()) {
    const alvo = periodo_texto.trim().toLowerCase();
    termos = termos.filter(t => (t.periodo_medicao || '').toLowerCase().includes(alvo)
      || (t.projeto || '').toLowerCase().includes(alvo)
      || (t.numero_termo || '').toLowerCase().includes(alvo));
  }
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
    // v1.33: datas consolidadas do termo — emissão = primeira NF emitida · pagamento = último pagamento recebido
    const datasNf = emp.map(e => e.nf_data).filter(Boolean).sort();
    const datasPag = emp.map(e => e.pagamento_data).filter(Boolean).sort();
    porColuna[t.status].push({ ...t, valor_total_termo: num(t.valor_total_termo), nf_soma: num(t.nf_soma), nf_diferenca: num(t.nf_diferenca),
      n_empresas: emp.length, n_nf_encontradas: emp.filter(e => e.nf_status === 'encontrada').length, n_pagas: emp.filter(e => e.pagamento_status === 'pago').length,
      data_emissao: datasNf[0] ? String(datasNf[0]).split('T')[0] : null,
      data_emissao_ultima: datasNf.length > 1 ? String(datasNf[datasNf.length - 1]).split('T')[0] : null,
      data_pagamento: datasPag.length ? String(datasPag[datasPag.length - 1]).split('T')[0] : null,
      pagamento_completo: emp.length > 0 && emp.every(e => e.pagamento_status === 'pago') });
  }
  // v1.20.3: total em valor (e contagem) por etapa, para o cabeçalho do Kanban de Faturamento
  const totaisPorColuna = {};
  STATUS.forEach(s => { const lista = porColuna[s] || []; totaisPorColuna[s] = { qtd: lista.length, valor: Math.round(lista.reduce((sm, t) => sm + num(t.valor_total_termo), 0) * 100) / 100 }; });
  const totalGeral = { qtd: termos.length, valor: Math.round(termos.reduce((sm, t) => sm + num(t.valor_total_termo), 0) * 100) / 100 };
  // v1.32: anos disponíveis (para o seletor) — sempre da base inteira, não do filtro atual
  let anosDisponiveis = [];
  try {
    const r = await sql`SELECT DISTINCT EXTRACT(YEAR FROM criado_em)::int AS ano FROM termos_faturamento ORDER BY ano DESC`;
    anosDisponiveis = r.map(x => x.ano);
  } catch (_) {}
  return { colunas: porColuna, labels: STATUS_LABEL, total: termos.length,
    totais_por_coluna: totaisPorColuna, total_geral: totalGeral,
    anos_disponiveis: anosDisponiveis, filtro_aplicado: { mes: mes || null, ano: ano || null, periodo_texto: periodo_texto || null } };
}

async function termoGet({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  const rows = await sql`SELECT * FROM termos_faturamento WHERE id = ${id} LIMIT 1`;
  if (!rows.length) throw new Error('Termo não encontrado: ' + id);
  const termo = rows[0];
  const empresas = await sql`SELECT * FROM termos_empresas WHERE termo_id = ${id} ORDER BY ordem`;
  const notas = await sql`SELECT * FROM termos_notas_encontradas WHERE termo_id = ${id} ORDER BY criado_em DESC`;
  const _datasNf = empresas.map(e => e.nf_data).filter(Boolean).sort();
  const _datasPag = empresas.map(e => e.pagamento_data).filter(Boolean).sort();
  return { termo: { ...termo, valor_total_termo: num(termo.valor_total_termo), nf_soma: num(termo.nf_soma), nf_diferenca: num(termo.nf_diferenca),
      // v1.33: datas consolidadas para exibição
      data_emissao: _datasNf[0] ? String(_datasNf[0]).split('T')[0] : null,
      data_emissao_ultima: _datasNf.length > 1 ? String(_datasNf[_datasNf.length - 1]).split('T')[0] : null,
      data_pagamento: _datasPag.length ? String(_datasPag[_datasPag.length - 1]).split('T')[0] : null,
      pagamento_completo: empresas.length > 0 && empresas.every(e => e.pagamento_status === 'pago') },
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
  const rows = await sql`SELECT termo_id FROM termos_empresas WHERE id = ${empresa_id} LIMIT 1`;
  if (!rows.length) throw new Error('Empresa do rateio não encontrada');
  const termoId = rows[0].termo_id;
  // v1.27: a marcação manual agora também vira um REGISTRO DE NOTA — assim entra na soma
  // junto com as demais (antes ficava só no campo da empresa e podia ser sobrescrita)
  if (nf_valor != null && num(nf_valor) > 0) {
    const jaTem = await sql`SELECT id FROM termos_notas_encontradas
      WHERE termo_id = ${termoId} AND empresa_id = ${empresa_id} AND origem = 'manual' AND COALESCE(nf_numero,'') = ${nf_numero || ''} LIMIT 1`;
    if (jaTem.length) await sql`UPDATE termos_notas_encontradas SET nf_valor = ${num(nf_valor)} WHERE id = ${jaTem[0].id}`;
    else await sql`INSERT INTO termos_notas_encontradas (id, termo_id, empresa_id, email_assunto, email_remetente, anexo_nome, nf_numero, nf_valor, origem)
      VALUES (${novoId('nota')}, ${termoId}, ${empresa_id}, 'Marcação manual', 'manual', ${'NF ' + (nf_numero || 's/n')}, ${nf_numero || null}, ${num(nf_valor)}, 'manual')`;
  }
  await sql`UPDATE termos_empresas SET nf_numero = ${nf_numero || null}, nf_data = ${nf_data || null}, nf_status = ${nf_status || 'encontrada'} WHERE id = ${empresa_id}`;
  const recalc = await recalcularNf(termoId);
  return { atualizado: true, ...recalc };
}

async function termoEmpresaMarcarPago({ empresa_id, pagamento_status, pagamento_data } = {}) {
  if (!empresa_id) throw new Error('empresa_id obrigatório');
  const sql = await getSql();
  await sql`UPDATE termos_empresas SET pagamento_status = ${pagamento_status || 'pago'}, pagamento_data = ${pagamento_data || new Date().toISOString().substring(0, 10)} WHERE id = ${empresa_id}`;
  const rows = await sql`SELECT termo_id FROM termos_empresas WHERE id = ${empresa_id} LIMIT 1`;
  if (rows[0]) await recalcularPagamento(rows[0].termo_id);
  return { atualizado: true };
}

// v1.33: ajustar manualmente a data de emissão da NF ou a data de pagamento de uma empresa
async function termoEmpresaDatas({ empresa_id, nf_data, pagamento_data } = {}) {
  if (!empresa_id) throw new Error('empresa_id obrigatório');
  const sql = await getSql();
  const rows = await sql`SELECT termo_id FROM termos_empresas WHERE id = ${empresa_id} LIMIT 1`;
  if (!rows.length) throw new Error('Empresa não encontrada');
  await sql`UPDATE termos_empresas SET
    nf_data = COALESCE(${nf_data ?? null}, nf_data),
    pagamento_data = COALESCE(${pagamento_data ?? null}, pagamento_data)
    WHERE id = ${empresa_id}`;
  return await termoGet({ id: rows[0].termo_id });
}

async function recalcularNf(termoId) {
  const sql = await getSql();
  const empresas = await sql`SELECT * FROM termos_empresas WHERE termo_id = ${termoId}`;
  // v1.27 FIX: a soma vinha de termos_empresas, que guarda UM valor por empresa — associar uma
  // segunda nota à mesma empresa sobrescrevia a primeira em vez de somar. Agora a soma vem das
  // NOTAS de verdade (termos_notas_encontradas), que é onde cada nota fica registrada.
  // Caso comum: uma empresa recebe 2 notas (serviço + material, ou nota complementar).
  const notas = await sql`SELECT empresa_id, nf_valor FROM termos_notas_encontradas
    WHERE termo_id = ${termoId} AND nf_valor IS NOT NULL`;
  const soma = Math.round(notas.reduce((s, n) => s + num(n.nf_valor), 0) * 100) / 100;

  // Por empresa: soma das notas vinculadas a ela (pode ser mais de uma)
  const porEmpresa = {};
  notas.forEach(n => { if (n.empresa_id) porEmpresa[n.empresa_id] = Math.round(((porEmpresa[n.empresa_id] || 0) + num(n.nf_valor)) * 100) / 100; });

  // Mantém termos_empresas coerente: nf_valor passa a refletir a SOMA das notas daquela empresa
  for (const e of empresas) {
    const somaEmp = porEmpresa[e.id];
    if (somaEmp != null && num(e.nf_valor) !== somaEmp) {
      await sql`UPDATE termos_empresas SET nf_valor = ${somaEmp}, nf_status = 'encontrada' WHERE id = ${e.id}`;
    }
  }

  const totalTermo = await sql`SELECT valor_total_termo FROM termos_faturamento WHERE id = ${termoId}`;
  const total = num(totalTermo[0]?.valor_total_termo);
  const diff = Math.round((total - soma) * 100) / 100;
  // "completo" agora depende do VALOR bater (tolerância R$ 1) e de toda empresa ter ao menos uma nota
  const todasComNota = empresas.length > 0 && empresas.every(e => porEmpresa[e.id] != null || e.nf_status === 'encontrada');
  const status = (todasComNota && Math.abs(diff) < 1) ? 'completo' : (soma > 0 ? 'divergente' : 'pendente');
  await sql`UPDATE termos_faturamento SET nf_soma = ${soma}, nf_diferenca = ${diff}, nf_status = ${status}, nf_verificado_em = NOW(), atualizado_em = NOW() WHERE id = ${termoId}`;
  return { soma, diff, status, notas_contadas: notas.length, por_empresa: porEmpresa };
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
// v1.31: EDIÇÃO COMPLETA DO TERMO (cabeçalho + empresas do rateio)
// ═══════════════════════════════════════════════════════════════════════════
async function termoEditar({ id, cabecalho = {}, empresas } = {}) {
  if (!id) throw new Error('id do termo obrigatório');
  const sql = await getSql();
  const atual = await sql`SELECT * FROM termos_faturamento WHERE id = ${id} LIMIT 1`;
  if (!atual.length) throw new Error('Termo não encontrado');

  // Cabeçalho: só sobrescreve o que veio preenchido (não apaga o resto)
  const c = cabecalho;
  await sql`UPDATE termos_faturamento SET
      projeto = COALESCE(${c.projeto ?? null}, projeto),
      fase = COALESCE(${c.fase ?? null}, fase),
      contratante = COALESCE(${c.contratante ?? null}, contratante),
      contratada = COALESCE(${c.contratada ?? null}, contratada),
      cnpj_fornecedor = COALESCE(${c.cnpj_fornecedor ?? null}, cnpj_fornecedor),
      periodo_medicao = COALESCE(${c.periodo_medicao ?? null}, periodo_medicao),
      numero_termo = COALESCE(${c.numero_termo ?? null}, numero_termo),
      parcela = COALESCE(${c.parcela ?? null}, parcela),
      marco_projeto = COALESCE(${c.marco_projeto ?? null}, marco_projeto),
      observacoes = COALESCE(${c.observacoes ?? null}, observacoes),
      atualizado_em = NOW()
    WHERE id = ${id}`;

  // Empresas do rateio: substitui o conjunto pelo enviado (preservando notas já vinculadas)
  if (Array.isArray(empresas)) {
    const existentes = await sql`SELECT id FROM termos_empresas WHERE termo_id = ${id}`;
    const idsEnviados = empresas.filter(e => e.id).map(e => e.id);
    const removidas = existentes.filter(e => !idsEnviados.includes(e.id)).map(e => e.id);

    // Proteção: não remove empresa que já tem nota fiscal vinculada
    if (removidas.length) {
      const comNota = await sql`SELECT DISTINCT empresa_id FROM termos_notas_encontradas
        WHERE termo_id = ${id} AND empresa_id = ANY(${removidas})`;
      const bloqueadas = comNota.map(n => n.empresa_id);
      if (bloqueadas.length) {
        const nomes = await sql`SELECT empresa FROM termos_empresas WHERE id = ANY(${bloqueadas})`;
        throw new Error('Não é possível remover empresa que já tem nota fiscal vinculada: ' +
          nomes.map(n => n.empresa).join(', ') + '. Remova a nota primeiro.');
      }
      await sql`DELETE FROM termos_empresas WHERE id = ANY(${removidas})`;
    }

    let ordem = 0;
    for (const e of empresas) {
      const valor = num(e.valor_parcela);
      if (e.id) {
        await sql`UPDATE termos_empresas SET empresa = ${e.empresa || ''}, contrato = ${e.contrato || ''},
          ncm = ${e.ncm || ''}, centro_custo = ${e.centro_custo || ''}, diferimento = ${e.diferimento || ''},
          valor_total_contrato = ${num(e.valor_total_contrato)}, percentual = ${num(e.percentual)},
          valor_ja_faturado = ${num(e.valor_ja_faturado)}, valor_parcela_anterior = ${num(e.valor_parcela_anterior)},
          valor_parcela = ${valor}, saldo_contrato = ${num(e.saldo_contrato)}, ordem = ${ordem++}
          WHERE id = ${e.id}`;
      } else {
        await sql`INSERT INTO termos_empresas (id, termo_id, ordem, empresa, contrato, ncm, centro_custo, diferimento,
            valor_total_contrato, percentual, valor_ja_faturado, valor_parcela_anterior, valor_parcela, saldo_contrato)
          VALUES (${novoId('temp')}, ${id}, ${ordem++}, ${e.empresa || ''}, ${e.contrato || ''}, ${e.ncm || ''},
            ${e.centro_custo || ''}, ${e.diferimento || ''}, ${num(e.valor_total_contrato)}, ${num(e.percentual)},
            ${num(e.valor_ja_faturado)}, ${num(e.valor_parcela_anterior)}, ${valor}, ${num(e.saldo_contrato)})`;
      }
    }
    // Total do termo passa a ser a soma do rateio editado
    const soma = empresas.reduce((s, e) => s + num(e.valor_parcela), 0);
    await sql`UPDATE termos_faturamento SET valor_total_termo = ${Math.round(soma * 100) / 100} WHERE id = ${id}`;
  }

  // Recalcula a comparação com as notas (o total pode ter mudado)
  const recalc = await recalcularNf(id);
  console.log(`[Faturamento] Termo ${id} editado · novo total conferido com notas: ${recalc.status}`);
  return await termoGet({ id });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2b. CARGA MANUAL DE NOTA FISCAL (etapa Emissão de NF) — o frontend já subiu
//    o arquivo (PDF/XML) via api/media-upload.js e manda a URL + os dados aqui
// ═══════════════════════════════════════════════════════════════════════════
async function termoNfUpload({ termo_id, empresa_id, nf_numero, nf_valor, anexo_nome, arquivo_url, tipo_arquivo } = {}) {
  if (!termo_id) throw new Error('termo_id obrigatório');
  if (!nf_valor || num(nf_valor) <= 0) throw new Error('valor da nota fiscal obrigatório');
  const sql = await getSql();
  const notaId = novoId('nota');
  await sql`INSERT INTO termos_notas_encontradas (id, termo_id, empresa_id, email_assunto, email_remetente, anexo_nome, nf_numero, nf_valor, tipo_arquivo, arquivo_url, origem)
    VALUES (${notaId}, ${termo_id}, ${empresa_id || null}, 'Carga manual', 'manual', ${anexo_nome || null}, ${nf_numero || null}, ${num(nf_valor)}, ${tipo_arquivo || null}, ${arquivo_url || null}, 'manual')`;
  if (empresa_id) {
    await sql`UPDATE termos_empresas SET nf_numero = ${nf_numero || null}, nf_valor = ${num(nf_valor)}, nf_data = ${new Date().toISOString().substring(0,10)}, nf_status = 'encontrada' WHERE id = ${empresa_id}`;
  }
  const recalc = await recalcularNf(termo_id);
  console.log(`[Faturamento] NF carregada manualmente: termo=${termo_id} valor=${num(nf_valor)} empresa=${empresa_id || '(sem vínculo)'}`);
  return { nota_id: notaId, nf_status: recalc.status, nf_soma: recalc.soma, nf_diferenca: recalc.diff };
}
async function termoNfExcluir({ nota_id } = {}) {
  if (!nota_id) throw new Error('nota_id obrigatório');
  const sql = await getSql();
  const rows = await sql`SELECT termo_id, empresa_id FROM termos_notas_encontradas WHERE id = ${nota_id} LIMIT 1`;
  if (!rows.length) throw new Error('Nota não encontrada');
  await sql`DELETE FROM termos_notas_encontradas WHERE id = ${nota_id}`;
  if (rows[0].empresa_id) {
    // Só limpa a empresa se não houver outra nota vinculada a ela
    const outra = await sql`SELECT id FROM termos_notas_encontradas WHERE empresa_id = ${rows[0].empresa_id} LIMIT 1`;
    if (!outra.length) await sql`UPDATE termos_empresas SET nf_numero = NULL, nf_valor = NULL, nf_data = NULL, nf_status = 'pendente' WHERE id = ${rows[0].empresa_id}`;
  }
  const recalc = await recalcularNf(rows[0].termo_id);
  return { excluido: true, nf_status: recalc.status, nf_soma: recalc.soma, nf_diferenca: recalc.diff };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. VERIFICAR E-MAIL (atlanteambr@gmail.com) — as notas fiscais chegaram?
//    Procura anexos (XML de NFe é lido de verdade: valor, número, chave;
//    PDF só é registrado pelo nome, sem valor extraído automaticamente)
// ═══════════════════════════════════════════════════════════════════════════
// v1.20.8: leitor de PDF server-side (pdf-parse) — sob demanda, sem quebrar nada se não instalado
async function getPdfParse() {
  try { const mod = await import('pdf-parse'); return mod.default || mod; }
  catch (e) { return null; }
}
function _fatNormTexto(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9., ]/g, ' ').replace(/\s+/g, ' '); }
// mesma heurística usada no upload manual (v1.20.5), agora também para PDFs vindos por e-mail
function extrairPdfNFe(texto, empresas) {
  const txt = _fatNormTexto(texto);
  let nf_valor = null, nf_numero = null, empresaMatch = null;
  const rotulosValor = ['valor total da nota', 'valor total da nf', 'valor total nf-e', 'valor total', 'total da nota', 'total geral'];
  for (const rot of rotulosValor) {
    const i = txt.indexOf(rot); if (i < 0) continue;
    const trecho = txt.substring(i, i + rot.length + 40);
    const m = trecho.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
    if (m) { nf_valor = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); break; }
  }
  const mNum = texto.match(/N[ºo°.]?\s*(?:DA\s*)?(?:NF-?E)?\s*[:.]?\s*(\d{2,9})\b/i) || texto.match(/N[uú]mero\s*[:.]?\s*(\d{2,9})\b/i);
  if (mNum) nf_numero = mNum[1];
  for (const e of (empresas || [])) {
    const nomeBase = String(e.empresa || '').replace(/^[A-Za-z0-9]+\s*-\s*/, '').trim();
    const n1 = _fatNormTexto(nomeBase), n2 = _fatNormTexto(e.empresa);
    if ((n1 && txt.includes(n1)) || (n2 && txt.includes(n2))) { empresaMatch = e; break; }
  }
  return { nf_valor, nf_numero, empresaMatch, lido: nf_valor != null || nf_numero != null || !!empresaMatch };
}
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
  // v1.20.8: diagnóstico — para você ver exatamente o que a verificação encontrou (e não "nada aconteceu")
  const diag = { emails_escaneados: 0, emails_com_anexo: 0, anexos_total: 0, anexos_xml: 0, anexos_pdf: 0, pdf_lido_com_sucesso: 0, casados_com_empresa: 0, sem_casar: 0, pdf_parse_instalado: null };
  let PdfParse = null;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const desde = new Date(Date.now() - dias * 86400 * 1000);
      const uids = await client.search({ since: desde }, { uid: true });
      diag.emails_escaneados = (uids || []).length;
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
        diag.emails_com_anexo++;
        for (const anexo of anexos) {
          diag.anexos_total++;
          let jaTem;
          try { jaTem = await sql`SELECT id FROM termos_notas_encontradas WHERE termo_id = ${termo_id} AND anexo_nome = ${anexo.nome} AND email_assunto = ${msg.envelope?.subject || ''} LIMIT 1`; } catch (_) { jaTem = []; }
          if (jaTem.length) continue;
          let dados = { nf_numero: null, nf_valor: null, nf_chave: null, emit_nome: null, dest_nome: null };
          let empresaMatchDireto = null;
          if (/\.xml$/i.test(anexo.nome)) {
            diag.anexos_xml++;
            try { const dl = await client.download(uid, anexo.part, { uid: true }); const chunks = []; for await (const c of dl.content) chunks.push(c); const parsed = extrairXmlNFe(Buffer.concat(chunks)); if (parsed) dados = parsed; } catch (e) { console.warn('[Faturamento] baixar/ler xml:', e.message); }
          } else {
            // v1.20.8 FIX: PDF (DANFE) agora também é lido — antes só XML era processado, então
            // toda nota enviada em PDF nunca casava com a empresa nem atualizava o total do termo.
            diag.anexos_pdf++;
            if (PdfParse === null) { PdfParse = await getPdfParse(); diag.pdf_parse_instalado = !!PdfParse; }
            if (PdfParse) {
              try {
                const dl = await client.download(uid, anexo.part, { uid: true }); const chunks = []; for await (const c of dl.content) chunks.push(c);
                const parsedPdf = await PdfParse(Buffer.concat(chunks));
                const r = extrairPdfNFe(parsedPdf.text || '', empresas);
                if (r.lido) diag.pdf_lido_com_sucesso++;
                dados.nf_valor = r.nf_valor; dados.nf_numero = r.nf_numero; empresaMatchDireto = r.empresaMatch;
              } catch (e) { console.warn('[Faturamento] baixar/ler pdf:', e.message); }
            }
          }
          // Casar com empresa: já casado direto (PDF) OU pelo nome extraído do XML/assunto/nome do arquivo
          let empresaMatch = empresaMatchDireto;
          if (!empresaMatch) {
            const alvo = normEmpresa(dados.dest_nome || dados.emit_nome || '') || normEmpresa(anexo.nome) || normEmpresa(msg.envelope?.subject || '');
            for (const e of empresas) { const ne = normEmpresa(e.empresa); if (ne && alvo.includes(ne)) { empresaMatch = e; break; } }
          }
          if (empresaMatch) diag.casados_com_empresa++; else diag.sem_casar++;
          const notaId = novoId('nota');
          await sql`INSERT INTO termos_notas_encontradas (id, termo_id, empresa_id, email_assunto, email_data, email_remetente, anexo_nome, nf_numero, nf_valor, nf_chave, tipo_arquivo)
            VALUES (${notaId}, ${termo_id}, ${empresaMatch?.id || null}, ${msg.envelope?.subject || ''}, ${msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null}, ${(msg.envelope?.from || [])[0]?.address || ''}, ${anexo.nome}, ${dados.nf_numero}, ${dados.nf_valor}, ${dados.nf_chave}, /\.xml$/i.test(anexo.nome) ? 'xml' : 'pdf')`;
          encontradasNovas.push({ id: notaId, anexo: anexo.nome, empresa: empresaMatch?.empresa || null, valor: dados.nf_valor });
          if (empresaMatch && dados.nf_valor != null) {
            await sql`UPDATE termos_empresas SET nf_numero = ${dados.nf_numero}, nf_valor = ${dados.nf_valor}, nf_data = ${dados.dh_emi ? String(dados.dh_emi).substring(0, 10) : null}, nf_status = 'encontrada' WHERE id = ${empresaMatch.id}`;
            // v1.18: lançamento automático no QB é OPT-IN (env FAT_AUTO_LANCAR_QB=true) — por padrão,
            // o lançamento contábil fica sob controle manual do financeiro (botão na tela)
            if (process.env.FAT_AUTO_LANCAR_QB === 'true') {
              try { await termoEmpresaLancarQb({ empresa_id: empresaMatch.id }); } catch (e) { console.warn('[Faturamento] auto-lançar QB falhou:', empresaMatch.empresa, e.message); }
            }
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
  return { encontradas_agora: encontradasNovas, nf_status: recalc.status, nf_soma: recalc.soma, nf_diferenca: recalc.diff, alerta_enviado: alertaEnviado, diagnostico: diag };
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

async function termoVerificarPagamento({ termo_id, tolerancia_pct } = {}) {
  if (!termo_id) throw new Error('termo_id obrigatório');
  const { termo, empresas } = await termoGet({ id: termo_id });
  let token, realm;
  try { const t = await qbTokenFat(); token = t.token; realm = t.realm; } catch (e) { return { erro: e.message, configurado: false }; }
  if (!realm) return { erro: 'QB_REALM_ID ausente', configurado: false };
  const sandbox = process.env.QB_SANDBOX === 'true';
  const sql = await getSql();
  // v1.34: tolerância configurável (padrão 2%) — cobre retenção de imposto e arredondamento
  const tolPct = tolerancia_pct != null ? parseFloat(tolerancia_pct) : parseFloat(process.env.FAT_TOLERANCIA_PAGTO_PCT || '2');
  const dentroTolerancia = (recebido, esperado) => Math.abs(num(recebido) - num(esperado)) <= Math.max(1, num(esperado) * (tolPct / 100));

  let atualizadas = 0, erroQ = null;
  const detalhes = [], naoEncontradas = [];

  // ── ETAPA 1: fatura baixada no QuickBooks (caminho principal) ──
  try {
    const data = await qbQueryFat(`select * from Invoice where Balance = '0' maxresults 1000`, token, realm, sandbox);
    const pagas = data?.QueryResponse?.Invoice || [];
    for (const e of empresas) {
      if (e.pagamento_status === 'pago') continue;
      const alvo = normEmpresa(e.empresa);
      const achou = pagas.find(inv => normEmpresa(inv.CustomerRef?.name || '').includes(alvo) && dentroTolerancia(inv.TotalAmt, e.valor_parcela));
      if (achou) {
        await sql`UPDATE termos_empresas SET pagamento_status = 'pago', pagamento_data = ${(achou.TxnDate || '').substring(0, 10)}, pagamento_origem = 'fatura_baixada' WHERE id = ${e.id}`;
        atualizadas++; detalhes.push({ empresa: e.empresa, via: 'fatura baixada no QuickBooks', data: (achou.TxnDate || '').substring(0, 10), valor: num(achou.TotalAmt) });
      } else naoEncontradas.push(e);
    }
  } catch (e) { erroQ = e.message; }

  // ── ETAPA 2 (v1.34): fallback no EXTRATO — procura o recebimento de verdade ──
  // Só roda para quem não foi encontrado na etapa 1. Consulta Payments (baixas registradas)
  // e Deposits (entradas em conta) dos últimos 120 dias.
  const viaExtrato = [];
  if (naoEncontradas.length) {
    const desde = new Date(Date.now() - 120 * 86400000).toISOString().split('T')[0];
    let pagamentos = [], depositos = [];
    try {
      const dp = await qbQueryFat(`select * from Payment where TxnDate >= '${desde}' maxresults 500`, token, realm, sandbox);
      pagamentos = dp?.QueryResponse?.Payment || [];
    } catch (e) { console.warn('[Faturamento] Payments:', e.message); }
    try {
      const dd = await qbQueryFat(`select * from Deposit where TxnDate >= '${desde}' maxresults 500`, token, realm, sandbox);
      depositos = dd?.QueryResponse?.Deposit || [];
    } catch (e) { console.warn('[Faturamento] Deposits:', e.message); }

    for (const e of naoEncontradas) {
      const alvo = normEmpresa(e.empresa);
      // 2a. Payment do cliente com valor compatível (recebimento registrado, mesmo sem baixar a fatura)
      let achou = pagamentos.find(p => normEmpresa(p.CustomerRef?.name || '').includes(alvo) && dentroTolerancia(p.TotalAmt, e.valor_parcela));
      let via = 'recebimento (Payment) no QuickBooks';
      // 2b. Depósito com linha do cliente ou valor batendo (dinheiro que entrou na conta)
      if (!achou) {
        achou = depositos.find(d => {
          const linhas = d.Line || [];
          const porCliente = linhas.some(l => normEmpresa(l.DepositLineDetail?.Entity?.name || '').includes(alvo) && dentroTolerancia(l.Amount, e.valor_parcela));
          const porValorTotal = dentroTolerancia(d.TotalAmt, e.valor_parcela)
            && linhas.some(l => normEmpresa(l.DepositLineDetail?.Entity?.name || '').includes(alvo));
          return porCliente || porValorTotal;
        });
        if (achou) via = 'depósito em conta (extrato) no QuickBooks';
      }
      if (achou) {
        await sql`UPDATE termos_empresas SET pagamento_status = 'pago', pagamento_data = ${(achou.TxnDate || '').substring(0, 10)}, pagamento_origem = 'extrato' WHERE id = ${e.id}`;
        atualizadas++;
        const registro = { empresa: e.empresa, via, data: (achou.TxnDate || '').substring(0, 10), valor: num(achou.TotalAmt) };
        detalhes.push(registro); viaExtrato.push(registro);
      }
    }
  }

  const recalc = await recalcularPagamento(termo_id);
  const aindaPendentes = empresas.length - (empresas.filter(e => e.pagamento_status === 'pago').length + atualizadas);
  return { atualizadas, pagamento_status: recalc.status, erro: erroQ, detalhes,
    encontrados_via_extrato: viaExtrato.length, ainda_pendentes: Math.max(0, aindaPendentes),
    tolerancia_pct: tolPct,
    resumo: atualizadas
      ? `${atualizadas} pagamento(s) confirmado(s)` + (viaExtrato.length ? ` · ${viaExtrato.length} encontrado(s) no extrato (fatura ainda não baixada no QuickBooks)` : '')
      : 'Nenhum pagamento novo encontrado — nem fatura baixada, nem entrada no extrato' };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LANÇAR NO QUICKBOOKS — CONTAS A RECEBER (Invoice) por empresa
//    Ao confirmar a nota fiscal de uma empresa (por e-mail ou manual), lança
//    a fatura correspondente no QuickBooks, associada ao cliente daquela
//    empresa, no valor exato da nota / parcela.
// ═══════════════════════════════════════════════════════════════════════════
async function qbBuscarCliente(nomeEmpresa, token, realm, sandbox) {
  const alvo = normEmpresa(nomeEmpresa);
  const data = await qbQueryFat(`select * from Customer where Active = true maxresults 1000`, token, realm, sandbox);
  const clientes = data?.QueryResponse?.Customer || [];
  // 1) match exato normalizado, 2) match por conter, 3) match pelo maior nome em comum
  let achou = clientes.find(c => normEmpresa(c.DisplayName || c.CompanyName || '') === alvo);
  if (!achou) achou = clientes.find(c => { const n = normEmpresa(c.DisplayName || c.CompanyName || ''); return n && (n.includes(alvo) || alvo.includes(n)); });
  return achou ? { id: achou.Id, nome: achou.DisplayName } : null;
}

async function qbItemPadrao(token, realm, sandbox) {
  const sql = await getSql();
  try { const cache = await sql`SELECT value FROM kv_store WHERE key = 'qb:item_padrao' LIMIT 1`; if (cache.length && cache[0].value) { const v = typeof cache[0].value === 'string' ? JSON.parse(cache[0].value) : cache[0].value; if (v?.id) return v; } } catch (_) {}
  const nomeEnv = process.env.QB_DEFAULT_ITEM_NAME;
  let item = null;
  if (nomeEnv) {
    const data = await qbQueryFat(`select * from Item where Name = '${nomeEnv.replace(/'/g, "\'")}' maxresults 1`, token, realm, sandbox);
    item = (data?.QueryResponse?.Item || [])[0];
  }
  if (!item) {
    const data = await qbQueryFat(`select * from Item where Type = 'Service' maxresults 1`, token, realm, sandbox);
    item = (data?.QueryResponse?.Item || [])[0];
  }
  if (!item) throw new Error('Nenhum "Item" de serviço encontrado no QuickBooks para usar na linha da fatura. Cadastre um item (ex.: "Serviços de Consultoria") no QuickBooks, ou defina a env QB_DEFAULT_ITEM_NAME com o nome exato do item.');
  const out = { id: item.Id, nome: item.Name };
  try { await sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('qb:item_padrao', ${JSON.stringify(out)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; } catch (_) {}
  return out;
}

async function qbCriarInvoice({ customerId, itemId, valor, descricao, docNumber }, token, realm, sandbox) {
  const base = sandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
  const body = {
    CustomerRef: { value: String(customerId) },
    TxnDate: new Date().toISOString().substring(0, 10),
    PrivateNote: descricao,
    Line: [{ Amount: num(valor), DetailType: 'SalesItemLineDetail', Description: descricao, SalesItemLineDetail: { ItemRef: { value: String(itemId) }, Qty: 1, UnitPrice: num(valor) } }],
    ...(docNumber ? { DocNumber: String(docNumber).substring(0, 21) } : {}),
  };
  const r = await fetch(`${base}/v3/company/${realm}/invoice?minorversion=65`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d.Fault?.Error?.[0]?.Message || JSON.stringify(d).substring(0, 200);
    // DocNumber duplicado é o erro mais comum — tenta de novo sem ele
    if (docNumber && /duplicate|already exists|DocNumber/i.test(msg)) {
      delete body.DocNumber;
      const r2 = await fetch(`${base}/v3/company/${realm}/invoice?minorversion=65`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const d2 = await r2.json().catch(() => ({}));
      if (r2.ok) return d2.Invoice;
      throw new Error('QB Invoice [' + r2.status + ']: ' + (d2.Fault?.Error?.[0]?.Message || msg));
    }
    throw new Error('QB Invoice [' + r.status + ']: ' + msg);
  }
  return d.Invoice;
}

async function termoEmpresaLancarQb({ empresa_id } = {}) {
  if (!empresa_id) throw new Error('empresa_id obrigatório');
  const sql = await getSql();
  const rows = await sql`SELECT e.*, t.projeto, t.numero_termo, t.parcela, t.periodo_medicao, t.contratante FROM termos_empresas e JOIN termos_faturamento t ON t.id = e.termo_id WHERE e.id = ${empresa_id} LIMIT 1`;
  if (!rows.length) throw new Error('Empresa não encontrada');
  const e = rows[0];
  if (e.qb_invoice_id) return { ja_lancado: true, qb_invoice_id: e.qb_invoice_id, qb_invoice_doc: e.qb_invoice_doc };
  if (e.nf_status !== 'encontrada') throw new Error('Confirme a nota fiscal desta empresa antes de lançar no QuickBooks (nota ainda pendente).');
  let token, realm;
  try { const t = await qbTokenFat(); token = t.token; realm = t.realm; } catch (err) { throw new Error('QuickBooks: ' + err.message); }
  const sandbox = process.env.QB_SANDBOX === 'true';
  const cliente = await qbBuscarCliente(e.empresa, token, realm, sandbox);
  if (!cliente) { await sql`UPDATE termos_empresas SET qb_erro = ${'Cliente "' + e.empresa + '" não encontrado no QuickBooks'} WHERE id = ${empresa_id}`; throw new Error('Cliente "' + e.empresa + '" não encontrado no QuickBooks — cadastre esse cliente primeiro (Contatos → Clientes) e tente novamente.'); }
  const item = await qbItemPadrao(token, realm, sandbox);
  const valor = e.nf_valor != null ? num(e.nf_valor) : num(e.valor_parcela);
  const descricao = `${e.projeto || ''} — ${e.periodo_medicao || ''} — Termo ${e.numero_termo || ''}/${e.parcela || ''} — ${e.empresa}`;
  let invoice;
  try { invoice = await qbCriarInvoice({ customerId: cliente.id, itemId: item.id, valor, descricao, docNumber: e.nf_numero }, token, realm, sandbox); }
  catch (err) { await sql`UPDATE termos_empresas SET qb_erro = ${err.message} WHERE id = ${empresa_id}`; throw err; }
  await sql`UPDATE termos_empresas SET qb_invoice_id = ${invoice.Id}, qb_invoice_doc = ${invoice.DocNumber || invoice.Id}, qb_lancado_em = NOW(), qb_erro = NULL WHERE id = ${empresa_id}`;
  console.log(`[Faturamento] Invoice lançada no QB: empresa=${e.empresa} valor=${valor} invoice=${invoice.Id}`);
  return { lancado: true, qb_invoice_id: invoice.Id, qb_invoice_doc: invoice.DocNumber || invoice.Id, cliente: cliente.nome, valor };
}

async function termoLancarTodasQb({ termo_id } = {}) {
  if (!termo_id) throw new Error('termo_id obrigatório');
  const { empresas } = await termoGet({ id: termo_id });
  const resultados = [];
  for (const e of empresas) {
    if (e.qb_invoice_id) { resultados.push({ empresa: e.empresa, ja_lancado: true }); continue; }
    if (e.nf_status !== 'encontrada') { resultados.push({ empresa: e.empresa, pulado: 'nota não encontrada' }); continue; }
    try { const r = await termoEmpresaLancarQb({ empresa_id: e.id }); resultados.push({ empresa: e.empresa, ...r }); }
    catch (err) { resultados.push({ empresa: e.empresa, erro: err.message }); }
  }
  return { resultados, lancadas: resultados.filter(r => r.lancado).length, erros: resultados.filter(r => r.erro).length };
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
    termo_editar:              () => termoEditar(payload),
    termo_aprovar:             () => termoAprovar(payload),
    termo_excluir:             () => termoExcluir(payload),
    termo_empresa_marcar_nf:   () => termoEmpresaMarcarNf(payload),
    termo_nf_upload:           () => termoNfUpload(payload),
    termo_nf_excluir:          () => termoNfExcluir(payload),
    termo_empresa_marcar_pago: () => termoEmpresaMarcarPago(payload),
    termo_empresa_datas:       () => termoEmpresaDatas(payload),
    termo_verificar_email:     () => termoVerificarEmail(payload),
    termo_verificar_pagamento: () => termoVerificarPagamento(payload),
    termo_empresa_lancar_qb:   () => termoEmpresaLancarQb(payload),
    termo_lancar_todas_qb:     () => termoLancarTodasQb(payload),
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
