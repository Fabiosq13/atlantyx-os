// api/rh.js — v1.21
// Cadastro de Funcionários (custo/hora + projetos que atua, pode ser mais de um)
// + Gerente de RH IA (chat com contexto real de folha/alocação).
//
// Reaproveita a tabela projetos_financeiros (já usada pelo Kanban Marcos de Projeto)
// para "projetos que atua" — não duplica uma lista de projetos separada.
//
// Integração com sistema externo da Atlantyx (base de horas/projetos/profissionais):
// ainda NÃO configurada — precisa da URL/API desse outro sistema (ver hint na action
// 'funcionarios_sync_externo'). Até lá, o cadastro é feito manualmente aqui.

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await ensureTabelas(_sql);
  return _sql;
}

async function ensureTabelas(sql) {
  await sql`CREATE TABLE IF NOT EXISTS funcionarios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    cargo TEXT,
    email TEXT,
    custo_hora NUMERIC DEFAULT 0,
    horas_mensais_padrao NUMERIC DEFAULT 160,
    ativo BOOLEAN DEFAULT true,
    fonte TEXT DEFAULT 'manual',
    fonte_id_externo TEXT,
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS funcionarios_projetos (
    id TEXT PRIMARY KEY,
    funcionario_id TEXT REFERENCES funcionarios(id) ON DELETE CASCADE,
    projeto_id TEXT REFERENCES projetos_financeiros(id) ON DELETE CASCADE,
    alocacao_pct NUMERIC DEFAULT 100,
    papel TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(funcionario_id, projeto_id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_func_proj_func ON funcionarios_projetos(funcionario_id)`;

  // v1.22: ORGANOGRAMA IA-FIRST — cada cargo tem um par: humano (funcionário) + agente IA
  await sql`CREATE TABLE IF NOT EXISTS cargos (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    sigla TEXT,
    nivel INT DEFAULT 2,
    reporta_para TEXT,
    area TEXT,
    funcionario_id TEXT REFERENCES funcionarios(id) ON DELETE SET NULL,
    agente_nome TEXT,
    agente_especialidade TEXT,
    agente_prompt TEXT,
    ordem INT DEFAULT 0,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS conselho_membros (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    nome TEXT NOT NULL,
    cadeira INT,
    especialidade TEXT,
    funcionario_id TEXT REFERENCES funcionarios(id) ON DELETE SET NULL,
    agente_prompt TEXT,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS conselho_sessoes (
    id TEXT PRIMARY KEY,
    assunto TEXT NOT NULL,
    contexto TEXT,
    status TEXT DEFAULT 'aberta',
    decisao TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    encerrada_em TIMESTAMPTZ
  )`;
  await sql`CREATE TABLE IF NOT EXISTS conselho_falas (
    id TEXT PRIMARY KEY,
    sessao_id TEXT REFERENCES conselho_sessoes(id) ON DELETE CASCADE,
    autor TEXT,
    autor_tipo TEXT,
    conteudo TEXT,
    rodada INT DEFAULT 1,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_falas_sessao ON conselho_falas(sessao_id, criado_em)`;

  // Semente do organograma (só na primeira vez — se não houver nenhum cargo)
  const jaTem = await sql`SELECT COUNT(*)::int AS n FROM cargos`;
  if (!jaTem[0].n) {
    const base = [
      ['cargo_cio', 'CIO — Presidência', 'CIO', 1, null, 'Presidência', 'ARIA', 'Estratégia corporativa e visão de longo prazo', 0],
      ['cargo_cfo', 'Gerente Financeiro', 'CFO', 2, 'cargo_cio', 'Financeiro', 'FINN', 'Finanças, fluxo de caixa, orçamento e risco financeiro', 1],
      ['cargo_cmo', 'Gerente de Marketing', 'CMO', 2, 'cargo_cio', 'Marketing', 'MIRA', 'Marketing, funil, marca e geração de demanda', 2],
      ['cargo_cto', 'Gerente de Tecnologia', 'CTO', 2, 'cargo_cio', 'Tecnologia', 'NOVA', 'Arquitetura, engenharia e entrega de software', 3],
      ['cargo_chro', 'Gerente de RH', 'CHRO', 2, 'cargo_cio', 'RH', 'HELO', 'Pessoas, cultura, alocação e custo de equipe', 4],
      ['cargo_cro', 'Gerente Comercial', 'CRO', 2, 'cargo_cio', 'Vendas', 'VERA', 'Vendas, pipeline, negociação e receita', 5],
      ['cargo_coo', 'Gerente de Operações/Projetos', 'COO', 2, 'cargo_cio', 'Operações', 'ORION', 'Operações, projetos, prazos e eficiência', 6],
    ];
    for (const [id, titulo, sigla, nivel, reporta, area, agente, esp, ordem] of base) {
      await sql`INSERT INTO cargos (id, titulo, sigla, nivel, reporta_para, area, agente_nome, agente_especialidade, ordem)
        VALUES (${id}, ${titulo}, ${sigla}, ${nivel}, ${reporta}, ${area}, ${agente}, ${esp}, ${ordem})
        ON CONFLICT (id) DO NOTHING`;
    }
  }
  // Semente do conselho paralelo (3 cadeiras: cada uma com par real + agente)
  const jaConselho = await sql`SELECT COUNT(*)::int AS n FROM conselho_membros`;
  if (!jaConselho[0].n) {
    const cadeiras = [
      [1, 'Conselheiro(a) de Estratégia & Mercado', 'Visão de mercado, concorrência, posicionamento e crescimento'],
      [2, 'Conselheiro(a) de Finanças & Risco', 'Saúde financeira, capital, risco e sustentabilidade do negócio'],
      [3, 'Conselheiro(a) de Tecnologia & Inovação', 'Tecnologia, produto, inovação e escalabilidade'],
    ];
    for (const [n, papel, esp] of cadeiras) {
      await sql`INSERT INTO conselho_membros (id, tipo, nome, cadeira, especialidade)
        VALUES (${'cons_ia_' + n}, 'agente', ${'Conselheiro IA ' + n + ' — ' + papel}, ${n}, ${esp}) ON CONFLICT (id) DO NOTHING`;
      await sql`INSERT INTO conselho_membros (id, tipo, nome, cadeira, especialidade)
        VALUES (${'cons_real_' + n}, 'humano', ${'(cadeira ' + n + ' vaga)'}, ${n}, ${esp}) ON CONFLICT (id) DO NOTHING`;
    }
  }
  await sql`CREATE INDEX IF NOT EXISTS idx_func_proj_proj ON funcionarios_projetos(projeto_id)`;
}

function novoId(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };

// ═══════════════════════════════════════════════════════════════════════════
// CRUD Funcionário (+ vínculo com múltiplos projetos)
// ═══════════════════════════════════════════════════════════════════════════
async function funcionarioSave(p = {}) {
  if (!p.nome) throw new Error('nome obrigatório');
  const sql = await getSql();
  const id = p.id || novoId('func');
  await sql`INSERT INTO funcionarios (id, nome, cargo, email, custo_hora, horas_mensais_padrao, ativo, observacoes, atualizado_em)
    VALUES (${id}, ${p.nome}, ${p.cargo || null}, ${p.email || null}, ${num(p.custo_hora)}, ${num(p.horas_mensais_padrao) || 160}, ${p.ativo !== false}, ${p.observacoes || null}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      nome=EXCLUDED.nome, cargo=EXCLUDED.cargo, email=EXCLUDED.email,
      custo_hora=EXCLUDED.custo_hora, horas_mensais_padrao=EXCLUDED.horas_mensais_padrao,
      ativo=EXCLUDED.ativo, observacoes=EXCLUDED.observacoes, atualizado_em=NOW()`;
  // Projetos: substitui o vínculo pelo conjunto enviado (lista de { projeto_id, alocacao_pct, papel })
  if (Array.isArray(p.projetos)) {
    await sql`DELETE FROM funcionarios_projetos WHERE funcionario_id = ${id}`;
    for (const pr of p.projetos) {
      if (!pr.projeto_id) continue;
      await sql`INSERT INTO funcionarios_projetos (id, funcionario_id, projeto_id, alocacao_pct, papel)
        VALUES (${novoId('fp')}, ${id}, ${pr.projeto_id}, ${num(pr.alocacao_pct) || 100}, ${pr.papel || null})
        ON CONFLICT (funcionario_id, projeto_id) DO UPDATE SET alocacao_pct = EXCLUDED.alocacao_pct, papel = EXCLUDED.papel`;
    }
  }
  return await funcionarioGet({ id });
}

async function funcionarioGet({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  const rows = await sql`SELECT * FROM funcionarios WHERE id = ${id} LIMIT 1`;
  if (!rows.length) throw new Error('Funcionário não encontrado');
  const projetos = await sql`SELECT fp.*, pf.nome AS projeto_nome FROM funcionarios_projetos fp
    LEFT JOIN projetos_financeiros pf ON pf.id = fp.projeto_id WHERE fp.funcionario_id = ${id}`;
  return { funcionario: { ...rows[0], custo_hora: num(rows[0].custo_hora), horas_mensais_padrao: num(rows[0].horas_mensais_padrao) },
    projetos: projetos.map(p => ({ ...p, alocacao_pct: num(p.alocacao_pct) })) };
}

async function funcionarioList({ ativo, projeto_id } = {}) {
  const sql = await getSql();
  const rows = ativo != null
    ? await sql`SELECT * FROM funcionarios WHERE ativo = ${ativo === true || ativo === 'true'} ORDER BY nome`
    : await sql`SELECT * FROM funcionarios ORDER BY nome`;
  const ids = rows.map(r => r.id);
  let vinculos = [];
  if (ids.length) vinculos = await sql`SELECT fp.*, pf.nome AS projeto_nome FROM funcionarios_projetos fp
    LEFT JOIN projetos_financeiros pf ON pf.id = fp.projeto_id WHERE fp.funcionario_id = ANY(${ids})`;
  const porFunc = {};
  vinculos.forEach(v => (porFunc[v.funcionario_id] = porFunc[v.funcionario_id] || []).push({ projeto_id: v.projeto_id, projeto_nome: v.projeto_nome, alocacao_pct: num(v.alocacao_pct), papel: v.papel }));
  let lista = rows.map(r => ({ ...r, custo_hora: num(r.custo_hora), horas_mensais_padrao: num(r.horas_mensais_padrao), projetos: porFunc[r.id] || [], custo_mensal_estimado: Math.round(num(r.custo_hora) * num(r.horas_mensais_padrao) * 100) / 100 }));
  if (projeto_id) lista = lista.filter(f => f.projetos.some(p => p.projeto_id === projeto_id));
  const resumo = { total: lista.length, ativos: lista.filter(f => f.ativo).length, custo_hora_medio: lista.length ? Math.round((lista.reduce((s, f) => s + f.custo_hora, 0) / lista.length) * 100) / 100 : 0,
    folha_mensal_estimada: Math.round(lista.filter(f => f.ativo).reduce((s, f) => s + f.custo_mensal_estimado, 0) * 100) / 100,
    sem_projeto: lista.filter(f => f.ativo && !f.projetos.length).length };
  return { funcionarios: lista, resumo };
}

async function funcionarioDelete({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM funcionarios WHERE id = ${id}`;
  return { id, excluido: true };
}

async function projetosParaSelect() {
  const sql = await getSql();
  const rows = await sql`SELECT id, nome FROM projetos_financeiros ORDER BY nome`;
  return { projetos: rows };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sync com o outro sistema da Atlantyx (base de horas/projetos/profissionais)
// AINDA NÃO CONFIGURADO — precisa da URL/API desse sistema.
// ═══════════════════════════════════════════════════════════════════════════
async function funcionariosSyncExterno() {
  const url = process.env.ATLANTYX_HORAS_API_URL;
  if (!url) {
    return { sincronizado: false, erro: 'Sistema externo não configurado',
      hint: 'Defina ATLANTYX_HORAS_API_URL (e ATLANTYX_HORAS_API_TOKEN, se precisar de autenticação) no Vercel com o endereço da API do outro sistema (o que já tem a base de horas, projetos e profissionais). Sem isso, o cadastro de funcionários é feito manualmente aqui.' };
  }
  try {
    const headers = { Accept: 'application/json' };
    if (process.env.ATLANTYX_HORAS_API_TOKEN) headers['Authorization'] = 'Bearer ' + process.env.ATLANTYX_HORAS_API_TOKEN;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const dados = await r.json();
    // Formato exato do payload externo é desconhecido ainda — placeholder até termos a doc da API.
    return { sincronizado: false, erro: 'Formato da resposta ainda não mapeado', dados_brutos_amostra: JSON.stringify(dados).substring(0, 300) };
  } catch (e) { return { sincronizado: false, erro: e.message }; }
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.22: ORGANOGRAMA IA-FIRST — cada cargo tem par humano + agente IA
// ═══════════════════════════════════════════════════════════════════════════
async function organograma() {
  const sql = await getSql();
  const cargos = await sql`SELECT c.*, f.nome AS funcionario_nome, f.cargo AS funcionario_cargo, f.custo_hora
    FROM cargos c LEFT JOIN funcionarios f ON f.id = c.funcionario_id ORDER BY c.nivel, c.ordem`;
  const funcionarios = await sql`SELECT id, nome, cargo FROM funcionarios WHERE ativo = true ORDER BY nome`;
  const lista = cargos.map(c => ({ ...c, custo_hora: c.custo_hora != null ? num(c.custo_hora) : null,
    ocupado: !!c.funcionario_id, par_ia: { nome: c.agente_nome, especialidade: c.agente_especialidade } }));
  return {
    cargos: lista,
    funcionarios_disponiveis: funcionarios,
    resumo: { total_cargos: lista.length, ocupados: lista.filter(c => c.ocupado).length, vagos: lista.filter(c => !c.ocupado).length, com_agente_ia: lista.filter(c => c.agente_nome).length },
  };
}
async function cargoSave(p = {}) {
  if (!p.titulo) throw new Error('titulo obrigatório');
  const sql = await getSql();
  const id = p.id || novoId('cargo');
  await sql`INSERT INTO cargos (id, titulo, sigla, nivel, reporta_para, area, funcionario_id, agente_nome, agente_especialidade, agente_prompt, ordem, atualizado_em)
    VALUES (${id}, ${p.titulo}, ${p.sigla || null}, ${parseInt(p.nivel) || 2}, ${p.reporta_para || null}, ${p.area || null},
            ${p.funcionario_id || null}, ${p.agente_nome || null}, ${p.agente_especialidade || null}, ${p.agente_prompt || null}, ${parseInt(p.ordem) || 0}, NOW())
    ON CONFLICT (id) DO UPDATE SET titulo=EXCLUDED.titulo, sigla=EXCLUDED.sigla, nivel=EXCLUDED.nivel,
      reporta_para=EXCLUDED.reporta_para, area=EXCLUDED.area, funcionario_id=EXCLUDED.funcionario_id,
      agente_nome=EXCLUDED.agente_nome, agente_especialidade=EXCLUDED.agente_especialidade,
      agente_prompt=EXCLUDED.agente_prompt, ordem=EXCLUDED.ordem, atualizado_em=NOW()`;
  return { id };
}
async function cargoDelete({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`UPDATE cargos SET reporta_para = NULL WHERE reporta_para = ${id}`;
  await sql`DELETE FROM cargos WHERE id = ${id}`;
  return { id, excluido: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.22: CONSELHO PARALELO (3 cadeiras · cada uma com conselheiro real + agente IA)
// ═══════════════════════════════════════════════════════════════════════════
async function conselhoList() {
  const sql = await getSql();
  const membros = await sql`SELECT cm.*, f.nome AS funcionario_nome FROM conselho_membros cm
    LEFT JOIN funcionarios f ON f.id = cm.funcionario_id WHERE cm.ativo = true ORDER BY cm.cadeira, cm.tipo DESC`;
  const cadeiras = {};
  membros.forEach(m => { cadeiras[m.cadeira] = cadeiras[m.cadeira] || { cadeira: m.cadeira, especialidade: m.especialidade }; cadeiras[m.cadeira][m.tipo] = m; });
  return { cadeiras: Object.values(cadeiras).sort((a, b) => a.cadeira - b.cadeira), membros };
}
async function conselhoMembroSave(p = {}) {
  if (!p.id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`UPDATE conselho_membros SET nome = ${p.nome || null}, funcionario_id = ${p.funcionario_id || null},
    especialidade = COALESCE(${p.especialidade || null}, especialidade), agente_prompt = ${p.agente_prompt || null} WHERE id = ${p.id}`;
  return { id: p.id };
}

// ── Sala do Conselho: debate multi-agente ──
async function conselhoSessaoAbrir({ assunto, contexto } = {}) {
  if (!assunto) throw new Error('assunto obrigatório');
  const sql = await getSql();
  const id = novoId('sess');
  await sql`INSERT INTO conselho_sessoes (id, assunto, contexto) VALUES (${id}, ${assunto}, ${contexto || null})`;
  return { sessao_id: id, assunto };
}
async function conselhoSessaoList() {
  const sql = await getSql();
  const rows = await sql`SELECT s.*, (SELECT COUNT(*)::int FROM conselho_falas f WHERE f.sessao_id = s.id) AS n_falas
    FROM conselho_sessoes s ORDER BY s.criado_em DESC LIMIT 30`;
  return { sessoes: rows };
}
async function conselhoSessaoGet({ sessao_id } = {}) {
  if (!sessao_id) throw new Error('sessao_id obrigatório');
  const sql = await getSql();
  const s = await sql`SELECT * FROM conselho_sessoes WHERE id = ${sessao_id} LIMIT 1`;
  if (!s.length) throw new Error('Sessão não encontrada');
  const falas = await sql`SELECT * FROM conselho_falas WHERE sessao_id = ${sessao_id} ORDER BY criado_em ASC`;
  return { sessao: s[0], falas };
}
async function conselhoFalar({ sessao_id, autor, autor_tipo, conteudo } = {}) {
  if (!sessao_id || !conteudo) throw new Error('sessao_id e conteudo obrigatórios');
  const sql = await getSql();
  const id = novoId('fala');
  await sql`INSERT INTO conselho_falas (id, sessao_id, autor, autor_tipo, conteudo)
    VALUES (${id}, ${sessao_id}, ${autor || 'CIO'}, ${autor_tipo || 'humano'}, ${conteudo})`;
  return { id };
}
// Roda uma rodada de debate: cada conselheiro IA opina, com o histórico e o contexto real da empresa
async function conselhoDebater({ sessao_id, pergunta } = {}) {
  if (!sessao_id) throw new Error('sessao_id obrigatório');
  const sql = await getSql();
  const { sessao, falas } = await conselhoSessaoGet({ sessao_id });
  const { cadeiras } = await conselhoList();
  if (pergunta) await conselhoFalar({ sessao_id, autor: 'CIO', autor_tipo: 'humano', conteudo: pergunta });

  // Contexto real da empresa para embasar o debate (equipe + estrutura)
  let ctxEmpresa = {};
  try { const rh = await contextoRh(); const org = await organograma();
    ctxEmpresa = { equipe: rh.resumo, alocacao_por_projeto: rh.alocacao_por_projeto, estrutura: org.resumo }; } catch (_) {}

  const historico = falas.map(f => `${f.autor} (${f.autor_tipo}): ${f.conteudo}`).join('\n').substring(0, 4000)
    + (pergunta ? `\nCIO (humano): ${pergunta}` : '');
  const rodada = (falas.reduce((m, f) => Math.max(m, f.rodada || 1), 0)) + 1;

  const respostas = [];
  for (const c of cadeiras) {
    const agente = c.agente; if (!agente) continue;
    const system = `Você é ${agente.nome}, conselheiro(a) do Conselho Consultivo Paralelo da Atlantyx.
Sua especialidade: ${agente.especialidade}.
${agente.agente_prompt ? 'Diretriz específica: ' + agente.agente_prompt : ''}
Você participa de um debate de conselho com o CIO (dono da empresa) e outros conselheiros.
Regras: fale APENAS da sua especialidade (não invada a dos outros); seja direto e objetivo (máximo 120 palavras);
tome POSIÇÃO clara (concorde ou discorde com fundamento, inclusive dos outros conselheiros);
aponte riscos que os outros podem não ver; nunca invente números — use os dados do contexto ou diga que falta dado.

DADOS REAIS DA EMPRESA (JSON): ${JSON.stringify(ctxEmpresa).substring(0, 3000)}

ASSUNTO EM PAUTA: ${sessao.assunto}
${sessao.contexto ? 'CONTEXTO: ' + sessao.contexto : ''}`;
    const user = `HISTÓRICO DO DEBATE ATÉ AGORA:\n${historico || '(início do debate)'}\n\nDê sua posição como ${agente.especialidade}.`;
    try {
      const texto = await claudeRh(system, [{ role: 'user', content: user }], 600);
      await sql`INSERT INTO conselho_falas (id, sessao_id, autor, autor_tipo, conteudo, rodada)
        VALUES (${novoId('fala')}, ${sessao_id}, ${agente.nome}, 'agente', ${texto}, ${rodada})`;
      respostas.push({ autor: agente.nome, especialidade: agente.especialidade, conteudo: texto });
    } catch (e) { respostas.push({ autor: agente.nome, erro: e.message }); }
  }
  return { rodada, respostas };
}
// Síntese final: consolida o debate em recomendação para a decisão do CIO
async function conselhoSintetizar({ sessao_id } = {}) {
  if (!sessao_id) throw new Error('sessao_id obrigatório');
  const { sessao, falas } = await conselhoSessaoGet({ sessao_id });
  if (!falas.length) throw new Error('Nenhuma fala nesta sessão ainda');
  const historico = falas.map(f => `${f.autor} (${f.autor_tipo}): ${f.conteudo}`).join('\n').substring(0, 8000);
  const system = `Você é o(a) Secretário(a) do Conselho da Atlantyx. Consolide o debate abaixo em uma ATA DE DECISÃO objetiva, em português do Brasil, com esta estrutura:
1. PONTOS DE CONSENSO (o que todos concordaram)
2. DIVERGÊNCIAS (onde discordaram e por quê)
3. RISCOS APONTADOS
4. RECOMENDAÇÃO AO CIO (o que fazer, em ordem de prioridade)
5. O QUE FALTA DECIDIR / dados que faltam
Seja conciso e não invente nada que não esteja no debate.`;
  const texto = await claudeRh(system, [{ role: 'user', content: `ASSUNTO: ${sessao.assunto}\n\nDEBATE:\n${historico}` }], 1200);
  const sql = await getSql();
  await sql`UPDATE conselho_sessoes SET decisao = ${texto}, status = 'sintetizada' WHERE id = ${sessao_id}`;
  return { sintese: texto };
}

// ═══════════════════════════════════════════════════════════════════════════
// GERENTE DE RH IA (chat com contexto real: funcionários, custo/hora, alocação)
// ═══════════════════════════════════════════════════════════════════════════
const RH_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function claudeRh(system, messages, maxTokens = 1400) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 40000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: RH_MODEL, max_tokens: maxTokens, system, messages }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return d.content?.[0]?.text || '';
}
async function contextoRh() {
  const { funcionarios, resumo } = await funcionarioList({});
  const porProjeto = {};
  funcionarios.forEach(f => f.projetos.forEach(p => { (porProjeto[p.projeto_nome || p.projeto_id] = porProjeto[p.projeto_nome || p.projeto_id] || []).push({ nome: f.nome, cargo: f.cargo, alocacao_pct: p.alocacao_pct, custo_hora: f.custo_hora }); }));
  return { resumo, funcionarios: funcionarios.map(f => ({ nome: f.nome, cargo: f.cargo, ativo: f.ativo, custo_hora: f.custo_hora, horas_mensais: f.horas_mensais_padrao, custo_mensal: f.custo_mensal_estimado, projetos: f.projetos.map(p => p.projeto_nome || p.projeto_id) })), alocacao_por_projeto: porProjeto };
}
async function gerenteRh({ mensagem, historico = [] } = {}) {
  if (!mensagem) throw new Error('mensagem obrigatória');
  const ctx = await contextoRh();
  const system = `Você é o GERENTE DE RH IA da Atlantyx — direto, prático, falando em português do Brasil. Você tem acesso aos dados REAIS de funcionários, custo/hora e alocação em projetos abaixo. Regras: responda com os dados do contexto quando existirem; se faltar dado, diga claramente; ajude a pensar em estratégia de RH (contratação, realocação, custo de equipe por projeto, sobrecarga/ociosidade); seja conciso (até ~200 palavras salvo pedido de detalhe); nunca invente número de funcionário ou valor de custo.

CONTEXTO DE RH (JSON):
${JSON.stringify(ctx).substring(0, 8000)}`;
  const msgs = [...historico.slice(-10).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').substring(0, 2000) })), { role: 'user', content: mensagem.substring(0, 3000) }];
  const resposta = await claudeRh(system, msgs, 1400);
  return { resposta, contexto_resumo: ctx.resumo };
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
    funcionario_save:           () => funcionarioSave(payload),
    funcionario_get:            () => funcionarioGet(payload),
    funcionario_list:           () => funcionarioList(payload),
    funcionario_delete:         () => funcionarioDelete(payload),
    projetos_select:            () => projetosParaSelect(),
    funcionarios_sync_externo:  () => funcionariosSyncExterno(),
    gerente_rh:                 () => gerenteRh(payload),
    organograma:                () => organograma(),
    cargo_save:                 () => cargoSave(payload),
    cargo_delete:               () => cargoDelete(payload),
    conselho_list:              () => conselhoList(),
    conselho_membro_save:       () => conselhoMembroSave(payload),
    conselho_sessao_abrir:      () => conselhoSessaoAbrir(payload),
    conselho_sessao_list:       () => conselhoSessaoList(),
    conselho_sessao_get:        () => conselhoSessaoGet(payload),
    conselho_falar:             () => conselhoFalar(payload),
    conselho_debater:           () => conselhoDebater(payload),
    conselho_sintetizar:        () => conselhoSintetizar(payload),
    status:                     () => ({ ok: true, modulo: 'rh' }),
  };

  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try {
    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });
  } catch (error) {
    console.error('[ERRO rh]', action, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
