import test from 'node:test'; import assert from 'node:assert/strict';
import * as AT from '../lib/atlas-itens.js';
// v3.591 — conversa contínua com o ATLAS. Memória no lugar do banco, IA falsa em fluxo, dados sintéticos.
const novo = () => { globalThis.__ATLAS_MEM = { v: [] }; };
const iaFalsa = respostas => { const chamadas = []; const f = async (sys, msgs, mx, onD) => { chamadas.push({ sys, msgs }); const r = respostas.shift() ?? 'ok'; for (const p of r.match(/.{1,12}/gs) || []) onD && onD(p); return r; }; f.chamadas = chamadas; return f; };
const ev = () => { const l = []; const f = e => l.push(e); f.l = l; return f; };

test('separarResposta: texto do chat × documento, inclusive com a tag ainda aberta (streaming)', () => {
  assert.deepEqual(AT.separarResposta('Pronto.\n<documento>\n# A\ntexto\n</documento>\nMudei X.'), { chat: 'Pronto.\nMudei X.', doc: '# A\ntexto', aberto: false });
  const p = AT.separarResposta('Escrevendo\n<documento>\n# A\nmeio'); assert.equal(p.aberto, true); assert.equal(p.doc, '# A\nmeio');
  assert.equal(AT.separarResposta('só conversa').doc, null);
});

test('intencao: frase curta vira ação; pedido longo é ajuste do texto', () => {
  assert.equal(AT.intencao('testa'), 'testar'); assert.equal(AT.intencao('roda um teste'), 'testar'); assert.equal(AT.intencao('publica'), 'publicar'); assert.equal(AT.intencao('pode publicar'), 'publicar');
  assert.equal(AT.intencao('roda toda segunda às 7 e gera 3 posts'), 'agendar');
  assert.equal(AT.intencao('o agente deve publicar rascunhos de posts toda semana, só rascunho'), null);
  assert.equal(AT.intencao('volta a rascunho'), 'rascunho');
});

test('primeira mensagem gera o texto em fluxo e cria a versão 1', async () => {
  novo(); const it = await AT.iniciar({ assunto: 'marketing', tipo: 'agente', pedido: 'Agente que prepara 3 rascunhos de posts toda segunda' }, 'ana');
  assert.equal(it.conteudo, ''); const e = ev();
  await AT.conversar({ id: it.id, mensagem: it.pedido }, 'ana', false, iaFalsa(['Escrevi a especificação.\n<documento>\n# Agente de posts\nRoda segunda 7h. Só rascunho.\n</documento>']), e);
  const o = await AT.obter({ id: it.id }, 'ana', false);
  assert.match(o.conteudo, /Agente de posts/); assert.equal(o.versoes.length, 1); assert.equal(o.conversa.length, 2);
  assert.equal(o.conversa[1].texto, 'Escrevi a especificação.'); assert.ok(e.l.some(x => x.tipo === 'texto')); assert.equal(e.l.at(-1).tipo, 'fim');
});

test('ajuste pelo chat gera nova versão com o documento atual no contexto; dá para voltar à anterior', async () => {
  novo(); const it = await AT.iniciar({ assunto: 'marketing', tipo: 'agente', pedido: 'Agente de posts semanal' }, 'ana'); const ia = iaFalsa(['v1\n<documento>\n# V1 texto longo do agente\n</documento>', 'Encurtei.\n<documento>\n# V2 texto curto do agente\n</documento>']);
  await AT.conversar({ id: it.id, mensagem: 'Agente de posts semanal' }, 'ana', false, ia, ev());
  await AT.conversar({ id: it.id, mensagem: 'Deixe mais curto' }, 'ana', false, ia, ev());
  assert.match(ia.chamadas[1].msgs.at(-1).content, /V1 texto longo/); // o documento atual vai junto
  let o = await AT.obter({ id: it.id }, 'ana', false); assert.equal(o.versoes.length, 2); assert.match(o.conteudo, /V2/);
  o = await AT.restaurar({ id: it.id, n: 1 }, 'ana', false); assert.match(o.conteudo, /V1/); assert.equal(o.versoes.length, 3);
});

test('"testa": roda simulação com dados, grava a execução, move para em teste e não muda o documento', async () => {
  novo(); const it = await AT.iniciar({ assunto: 'marketing', tipo: 'agente', pedido: 'Agente de posts semanal' }, 'ana');
  await AT.conversar({ id: it.id, mensagem: 'Escreva o texto completo' }, 'ana', false, iaFalsa(['ok\n<documento>\n# Agente de posts semanal completo\n</documento>']), ev());
  const ia = iaFalsa(['**O que rodou** simulação. **O que NÃO foi enviado** nada.']);
  await AT.conversar({ id: it.id, mensagem: 'testa' }, 'ana', false, ia, ev());
  assert.match(ia.chamadas[0].sys, /SIMULAÇÃO/); const o = await AT.obter({ id: it.id }, 'ana', false);
  assert.equal(o.estado, 'teste'); assert.equal(o.execucoes.length, 1); assert.equal(o.versoes.length, 1); assert.ok(o.conversa.at(-1).teste);
});

test('"publica" não chama a IA: mostra o botão certo e respeita a aprovação do dono', async () => {
  novo(); const it = await AT.iniciar({ assunto: 'financeiro', tipo: 'agente', pedido: 'Agente de cobrança que só gera rascunhos' }, 'ana');
  await AT.conversar({ id: it.id, mensagem: 'Escreva o texto completo' }, 'ana', false, iaFalsa(['ok\n<documento>\n# Agente de cobrança com texto suficiente\n</documento>']), ev());
  const ia = iaFalsa([]); await AT.conversar({ id: it.id, mensagem: 'publica' }, 'ana', false, ia, ev()); assert.equal(ia.chamadas.length, 0);
  let o = await AT.obter({ id: it.id }, 'ana', false); assert.ok(!o.acoes.some(a => a.id === 'publicado')); // autora comum não implanta agente sem aprovação
  assert.ok(o.acoes.some(a => a.id === 'teste'));
  await AT.mudar({ id: it.id, para: 'teste' }, 'ana', false); await AT.mudar({ id: it.id, para: 'pedir_aprovacao' }, 'ana', false);
  o = await AT.obter({ id: it.id }, 'ceo', true); assert.ok(o.acoes.some(a => a.id === 'publicado' && a.forte));
});

test('editar um item implantado volta a rascunho (precisa testar de novo) e registra no log', async () => {
  novo(); const it = await AT.iniciar({ assunto: 'marketing', tipo: 'relatorio', pedido: 'Relatório semanal de leads por origem' }, 'ana');
  await AT.conversar({ id: it.id, mensagem: 'Escreva o texto completo' }, 'ana', false, iaFalsa(['ok\n<documento>\n# Relatório de leads completo\n</documento>']), ev());
  await AT.mudar({ id: it.id, para: 'teste' }, 'ana', false); await AT.mudar({ id: it.id, para: 'publicado' }, 'ana', false);
  await AT.conversar({ id: it.id, mensagem: 'Acrescente custo por lead' }, 'ana', false, iaFalsa(['Acrescentei.\n<documento>\n# Relatório de leads com custo por lead\n</documento>']), ev());
  const o = await AT.obter({ id: it.id }, 'ana', false); assert.equal(o.estado, 'rascunho'); assert.ok(o.log.some(l => /voltou a rascunho/.test(l.acao)));
});

test('privacidade: outra pessoa não conversa com o item; nome de cliente real gera aviso', async () => {
  novo(); const it = await AT.iniciar({ assunto: 'marketing', tipo: 'analise', pedido: 'Análise de marketing do mês' }, 'ana');
  await assert.rejects(() => AT.conversar({ id: it.id, mensagem: 'oi' }, 'bia', false, iaFalsa([]), ev()), /não encontrado|Só quem criou/);
  await AT.conversar({ id: it.id, mensagem: 'Escreva o texto completo' }, 'ana', false, iaFalsa(['ok\n<documento>\n# Análise sobre a CPFL e metas\n</documento>']), ev());
  assert.match((await AT.obter({ id: it.id }, 'ana', false)).aviso, /cliente real/);
});

// ── v3.592: rodar, agendar e rodar sozinho ──
const criarPublicado = async (assunto = 'marketing', tipo = 'relatorio') => { const it = await AT.iniciar({ assunto, tipo, pedido: 'Relatório semanal de leads por origem' }, 'ana');
  await AT.conversar({ id: it.id, mensagem: 'Escreva o texto completo' }, 'ana', false, iaFalsa(['ok\n<documento>\n# Relatório semanal de leads por origem\n</documento>']), ev());
  await AT.mudar({ id: it.id, para: 'teste' }, 'ana', false); if (tipo === 'agente') { await AT.mudar({ id: it.id, para: 'pedir_aprovacao' }, 'ana', false); await AT.mudar({ id: it.id, para: 'publicado' }, 'ceo', true); } else await AT.mudar({ id: it.id, para: 'publicado' }, 'ana', false); return it; };

test('lerAgenda entende frases em português (hora de Brasília)', () => {
  assert.deepEqual(AT.lerAgenda('agende toda segunda às 7h'), { freq: 'semanal', dia: 1, hora: 7 });
  assert.deepEqual(AT.lerAgenda('todo dia 5 às 9h'), { freq: 'mensal', dia: 5, hora: 9 });
  assert.deepEqual(AT.lerAgenda('todo dia às 8 da manhã'), { freq: 'diaria', dia: null, hora: 8 });
  assert.deepEqual(AT.lerAgenda('toda sexta às 3 da tarde'), { freq: 'semanal', dia: 5, hora: 15 });
  assert.equal(AT.lerAgenda('deixe mais curto'), null);
  assert.equal(AT.intencao('agende toda segunda às 7h'), 'agendar'); assert.equal(AT.intencao('cancela a agenda'), 'desagendar'); assert.equal(AT.intencao('roda agora valendo'), 'executar');
});

test('agendar pelo chat grava a agenda; sem implantar ainda não roda', async () => {
  novo(); const it = await AT.iniciar({ assunto: 'marketing', tipo: 'agente', pedido: 'Agente de posts semanal' }, 'ana');
  await AT.conversar({ id: it.id, mensagem: 'Escreva o texto completo' }, 'ana', false, iaFalsa(['ok\n<documento>\n# Agente de posts semanal completo\n</documento>']), ev());
  const ia = iaFalsa([]); await AT.conversar({ id: it.id, mensagem: 'agende toda segunda às 7h' }, 'ana', false, ia, ev()); assert.equal(ia.chamadas.length, 0);
  const o = await AT.obter({ id: it.id }, 'ana', false); assert.deepEqual({ f: o.agenda.freq, d: o.agenda.dia, h: o.agenda.hora, a: o.agenda.ativa }, { f: 'semanal', d: 1, h: 7, a: true });
  assert.equal(AT.vencido(o, new Date('2026-11-30T11:00:00Z')), false); // segunda 08:00 BRT, mas ainda não está implantado
});

test('rodar agora (valendo): só publicado; guarda a execução e não muda o texto', async () => {
  novo(); const it = await AT.iniciar({ assunto: 'financeiro', tipo: 'agente', pedido: 'Agente de cobrança que só gera rascunhos' }, 'ana');
  await AT.conversar({ id: it.id, mensagem: 'Escreva o texto completo' }, 'ana', false, iaFalsa(['ok\n<documento>\n# Agente de cobrança completo\n</documento>']), ev());
  const ia0 = iaFalsa([]); await AT.conversar({ id: it.id, mensagem: 'roda agora valendo' }, 'ana', false, ia0, ev()); assert.equal(ia0.chamadas.length, 0); // rascunho: pede implantar
  const p = await criarPublicado(); const ia = iaFalsa(['**Resumo** 3 leads. **Rascunhos** post 1.']);
  await AT.conversar({ id: p.id, acao: 'executar' }, 'ana', false, ia, ev()); assert.match(ia.chamadas[0].sys, /EXECUTANDO agora/);
  const o = await AT.obter({ id: p.id }, 'ana', false); assert.equal(o.execucoes[0].modo, 'manual'); assert.equal(o.estado, 'publicado'); assert.equal(o.versoes.length, 1); assert.ok(o.conversa.at(-1).execucao);
});

test('agendar(): valida e só dono/aprovador mexe; Autocampanha só em marketing', async () => {
  novo(); const it = await criarPublicado('marketing', 'agente');
  const o = await AT.agendar({ id: it.id, freq: 'semanal', dia: 1, hora: 7, ativa: true }, 'ana', false); assert.equal(o.agenda.hora, 7);
  await assert.rejects(() => AT.agendar({ id: it.id, freq: 'mensal', dia: 31, hora: 7 }, 'ana', false), /dia do mês/i);
  await assert.rejects(() => AT.agendar({ id: it.id, freq: 'diaria', hora: 25 }, 'ana', false), /Hora/);
  await assert.rejects(() => AT.agendar({ id: it.id, freq: 'diaria', hora: 7 }, 'bia', false), /não encontrado|permissão/);
  assert.equal((await AT.agendar({ id: it.id, autocampanha: true }, 'ana', false)).autocampanha, true);
  const f = await criarPublicado('financeiro', 'agente'); await assert.rejects(() => AT.agendar({ id: f.id, autocampanha: true }, 'ana', false), /Marketing/);
});

test('cron: roda só o publicado vencido, uma vez por dia, e registra a execução (falha não derruba)', async () => {
  novo(); const a = await criarPublicado('marketing', 'agente'), b = await criarPublicado('financeiro', 'relatorio');
  await AT.agendar({ id: a.id, freq: 'semanal', dia: 1, hora: 7, ativa: true }, 'ana', false); await AT.agendar({ id: b.id, freq: 'semanal', dia: 3, hora: 7, ativa: true }, 'ana', false);
  const seg8h = new Date('2026-11-30T11:00:00Z'); // segunda 08:00 em Brasília
  const antes = new Date('2026-11-30T09:00:00Z'); assert.equal((await AT.rodarAgendados(iaFalsa(['x']), { agora: antes })).feitos.length, 0); // 06:00: ainda não
  const ia = iaFalsa(['**Resumo** rodou pela agenda.']); const r = await AT.rodarAgendados(ia, { agora: seg8h });
  assert.equal(r.feitos.length, 1); assert.equal(r.feitos[0].id, a.id); assert.equal(ia.chamadas.length, 1); // só o de segunda
  assert.equal((await AT.rodarAgendados(iaFalsa(['y']), { agora: seg8h })).feitos.length, 0); // mesmo dia: não repete
  const o = await AT.obter({ id: a.id }, 'ana', false); assert.equal(o.execucoes[0].modo, 'agenda'); assert.equal(o.agenda.ultimo, '2026-11-30');
  // falha da IA: registra e segue
  const c = await criarPublicado('marketing', 'agente'); await AT.agendar({ id: c.id, freq: 'diaria', hora: 6, ativa: true }, 'ana', false);
  const r2 = await AT.rodarAgendados(async () => { throw new Error('IA fora'); }, { agora: new Date('2026-12-01T12:00:00Z') });
  assert.ok(r2.feitos.some(f => f.id === c.id && f.ok === false)); assert.match((await AT.obter({ id: c.id }, 'ana', false)).execucoes[0].erro, /IA fora/);
});

test('pausar a agenda impede o cron', async () => {
  novo(); const a = await criarPublicado('marketing', 'agente'); await AT.agendar({ id: a.id, freq: 'diaria', hora: 6, ativa: true }, 'ana', false); await AT.agendar({ id: a.id, ativa: false }, 'ana', false);
  assert.equal((await AT.rodarAgendados(iaFalsa(['x']), { agora: new Date('2026-12-01T12:00:00Z') })).feitos.length, 0);
});

// ── v3.593: ciclo diário de marketing ──
test('ligar o ciclo de marketing cria agenda diária 07:00; só o CEO autoriza ativar anúncio; fora de marketing não liga', async () => {
  novo(); const it = await criarPublicado('marketing', 'agente');
  const o = await AT.agendar({ id: it.id, autocampanha: true }, 'ana', false);
  assert.equal(o.autocampanha, true); assert.deepEqual({ f: o.agenda.freq, h: o.agenda.hora, a: o.agenda.ativa }, { f: 'diaria', h: 7, a: true });
  await assert.rejects(() => AT.agendar({ id: it.id, ativar_anuncio: true }, 'ana', false), /Só o CEO/);
  assert.equal((await AT.agendar({ id: it.id, ativar_anuncio: true }, 'ceo', true)).ativar_anuncio, true);
  const f = await criarPublicado('financeiro', 'agente'); await assert.rejects(() => AT.agendar({ id: f.id, autocampanha: true }, 'ana', false), /marketing/i);
});

test('ciclo de marketing: sem chave de IA/banco falha sem derrubar, devolve relatório com o erro e não altera nada', async () => {
  const { campanhaCompleta } = await import('../api/metricool.js'); const k = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; const passos = [];
  try { const r = await campanhaCompleta({ forcar: true, onPasso: t => passos.push(t) }); assert.ok(r.erro); assert.match(r.relatorio, /não rodou/); assert.ok(passos.some(t => t.startsWith('✗'))); } finally { if (k) process.env.ANTHROPIC_API_KEY = k; }
});

// ── v3.594: 3 campanhas/dia, análise de todas as publicadas e futuras ──
test('_estadoPost: publicado × erro (com motivo) × agendado, por rede', async () => {
  const { _estadoPost } = await import('../api/metricool.js');
  assert.equal(_estadoPost({ published: true, providers: [{ network: 'linkedin', status: 'PUBLISHED' }] }).estado, 'publicado');
  const e = _estadoPost({ providers: [{ network: 'instagram', status: 'ERROR', error: 'imagem inválida' }, { network: 'linkedin', status: 'PUBLISHED' }] });
  assert.equal(e.estado, 'erro'); assert.match(e.motivo, /imagem inválida/); assert.equal(e.redes.find(r => r.rede === 'instagram').erro, true);
  assert.equal(_estadoPost({ providers: [{ network: 'facebook', status: 'PENDING' }] }).estado, 'agendado');
});

test('_problemasFuturos acha conflito de horário, fora do ICP, oferta errada, Instagram sem imagem e erro', async () => {
  const { _problemasFuturos } = await import('../api/metricool.js');
  const p = (id, q, text, extra = {}) => ({ id, text, publicationDate: { dateTime: q + ':00' }, providers: [{ network: 'linkedin', status: 'PENDING' }], media: ['https://x/y.jpg'], ...extra });
  const r = _problemasFuturos([p(1, '2026-12-01T08:30', 'Indicadores ao vivo para CFOs'), p(2, '2026-12-01T08:50', 'Outro post'), p(3, '2026-12-01T12:15', 'Agende uma reunião com a gente em https://meetings.hubspot.com/x'),
    p(4, '2026-12-02T08:30', 'Post', { providers: [{ network: 'instagram', status: 'PENDING' }], media: [] }), p(5, '2026-12-03T08:30', 'Post', { providers: [{ network: 'linkedin', status: 'ERROR', error: 'token expirado' }] })]);
  const tipos = r.map(x => x.tipo + ':' + x.id);
  assert.ok(tipos.includes('conflito de horário:2')); assert.ok(tipos.includes('oferta errada:3')); assert.ok(tipos.includes('sem imagem (Instagram exige):4')); assert.ok(tipos.includes('erro de publicação:5'));
  assert.ok(!tipos.some(t => t.endsWith(':1')));
});

test('registrarStatusMarketing escreve em Execuções do agente de marketing implantado', async () => {
  novo(); const it = await criarPublicado('marketing', 'agente'); await AT.agendar({ id: it.id, autocampanha: true }, 'ana', false);
  assert.equal(await AT.registrarStatusMarketing('## Status\n✅ Campanha das 08:30: publicada com sucesso'), 1);
  const o = await AT.obter({ id: it.id }, 'ana', false); assert.equal(o.execucoes[0].modo, 'status'); assert.match(o.execucoes[0].saida, /publicada com sucesso/);
});
