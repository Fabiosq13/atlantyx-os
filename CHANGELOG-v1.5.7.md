# Atlantyx OS · v1.5.7 — Edição via Kanban + Copy nunca vazia + Copy POR REDE

## Bugs corrigidos (report: "editar não muda de tela / copy '--' / nada por rede")

### 1. "✎ Editar Campanha & Re-rodar" não mudava de tela
Causa raiz: `abrirCampanhaDB` buscava a campanha na chave KV `atx:camp:<id>`,
mas as campanhas são salvas na TABELA `campanhas` (action save_campanha).
Com `_todasCampanhas` vazio (ex: entrou direto no Kanban após F5), o fallback
sempre falhava → "Campanha não encontrada" → return silencioso SEM navegar.

Fix:
- `abrirCampanhaDB`: se não achou em memória, recarrega a lista real
  (`carregarCampanhasDB`) e procura de novo; KV mantido como último fallback;
  falha agora LANÇA erro (não retorna mudo)
- `editarCampanhaDaPeca`: só navega se `campAtiva.id === campanhaId`
  confirmado; usa `nav()` direto (querySelector virou fallback); rola até o
  editor ao chegar

### 2. Copy Principal "--" (vazia)
Mesma causa do Designer na v1.5.1: Copywriter pedia JSON grande (3 versões +
notas) em 2500 tokens → truncava → parseJSON caía em {raw} → versoes
undefined → painel mostrava "--".

Fix (backend): tokens 2500→3000 + fallback: se truncar, `raw` vira o corpo
da versão 1. Frontend: exibe narrativa como último fallback com aviso.

### 3. Nada gerado por rede
Não existia — o pipeline gerava só a copy genérica do "canal".

Novo (backend `campanhaCompleta`):
- Recebe `redes` (as checkboxes marcadas no form, enviadas no payload)
- 5ª etapa: um call único adapta a copy para cada rede ativa
  (linkedin/instagram/facebook/whatsapp/email) com regras nativas de
  formato/tamanho/hashtags por rede → `copy_por_rede`
- Falha nessa etapa NÃO quebra o pipeline (usa copy base)

Frontend:
- Painel da peça no Kanban: seção "COPY POR REDE" com <details> expansível
  por rede (e-mail mostra assunto + texto)
- Publicação (manual E Metricool): usa automaticamente a versão da rede
  correspondente quando existe (`copy_por_rede[rede].texto`), senão copy base

### 4. Timeout prevenido
Pipeline agora tem 5 calls Claude sequenciais (~15-30s). `vercel.json` ganhou
`functions.maxDuration=60` para s2-creative, financeiro e email-intel —
sem isso o Vercel cortaria em 10s (default) e o erro pareceria aleatório.

## Arquivos alterados
- api/s2-creative.js (copywriter fallback + copy_por_rede)
- public/index.html (navegação, fallbacks, copy por rede no painel e publicação)
- vercel.json (maxDuration)

## Validação
node --check backend+frontend OK · vercel.json JSON válido · JSDOM: navegação
Kanban→Campanha ativou page-s2campanha com guard de carregamento, 0 erros.
