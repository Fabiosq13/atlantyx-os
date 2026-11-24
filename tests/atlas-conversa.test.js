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
  assert.equal(AT.intencao('roda toda segunda às 7 e gera 3 posts'), null);
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
