# Atlantyx OS · v1.5.3 — Link de destino real nas publicações + UTMs

## O problema (pergunta do usuário: "o link direciona pra onde?")

Resposta honesta da auditoria:
- LinkedIn manual: nenhum link (só texto)
- Facebook manual: apontava para "https://atlantyx.com.br" HARDCODED (placeholder)
- Instagram: nenhum
- Metricool: nenhum link automático
Ou seja: as publicações não levavam a lugar nenhum rastreável.

## O que mudou

### Campo "Link de destino" no modal de publicação
- Você informa a landing page / site / agenda da campanha
- Fica salvo na campanha (`link_destino`) e vem pré-preenchido nas próximas
- Checkbox "Adicionar UTMs" (ligado por padrão)

### UTMs automáticos por rede e campanha
Formato: `?utm_source=linkedin&utm_medium=social&utm_campaign=camp_1786...`
- utm_source = rede da publicação (linkedin/instagram/facebook)
- utm_campaign = id/slug da campanha
Com isso o Google Analytics / HubSpot atribuem cada clique à campanha e rede.

### Comportamento por modo
- LinkedIn manual: texto + link com UTM no compositor
- Facebook manual: sharer usa o SEU link (placeholder atlantyx.com.br removido);
  sem link → abre facebook.com para post manual
- Instagram: texto+link ficam no clipboard (cola no app)
- Metricool: link com UTM anexado ao fim do texto publicado

### Painel Desempenho
- Cada publicação registra `link_destino`
- Lista mostra "link ↗" clicável por publicação

## Arquivos alterados
- public/index.html
