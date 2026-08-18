# Atlantyx OS · v1.9.3 — Link de reunião padrão + datas travadas + listas vazias

## 1. Link de reunião padrão (fixo, configurável)
https://meetings.hubspot.com/atlantyx?uuid=eca883eb-276d-45cb-bda8-d7d5d2ae9219
é agora o default em: modal de publicação (campo Link de destino), sticker
dos Stories, link do Impulsionamento e — novidade — nos posts da
Auto-campanha (antes saíam com CTA mas SEM URL): "👉 Agende uma conversa:"
+ link com UTM (IG: "🔗 Link na bio"). Botão "🔗 Link de reunião padrão"
no topo do Kanban permite trocar (fica em localStorage).
Redução do link: o encurtador do Metricool (já ligado por padrão) troca a
URL longa por link curto na publicação. Um link mais curto "na fonte" só
via HubSpot (Meetings → editar link → slug personalizado, ex.
meetings.hubspot.com/atlantyx/diagnostico) — se você criar, é só colar
no botão acima.

## 2. Datas de início/fim "travadas" em outro computador
Causa: navegadores restauram valores antigos de inputs após reload
(form restoration) e o formulário nunca redefinia as datas. Fix:
autocomplete=off; datas padrão hoje → +14 dias no boot, no "Limpar (nova
do zero)" e quando o valor está claramente velho; ao abrir uma campanha,
o período dela é carregado (ou o padrão, se ela não tiver).

## 3. Minhas Campanhas / Calendário sem nada em outra máquina
Mesma causa provável: os selects de filtro (status/rede) e a busca vinham
"restaurados" com um valor antigo → nenhuma campanha passava, e a tela
dizia só "Nenhuma campanha". Fix:
- filtros zerados ao abrir a aba + autocomplete=off
- se há campanhas mas nenhuma passa no filtro, a tela diz isso e oferece
  "Limpar filtros"; se não há nenhuma, oferece "↻ Recarregar do banco"
- Log mostra "N carregadas · exibindo M" e, se o banco falhar, aponta
  DATABASE_URL/Neon
- Calendário: campanhas SEM período (que nunca apareciam) agora são
  listadas abaixo do mês com botão "📅 Definir período" (salva no banco)

## Validação (JSDOM)
Datas antigas → hoje/+14 · filtro "encerrada" preso → zerado, lista mostra
tudo · calendário lista campanha sem período · modal com link HubSpot
default. 0 erros. Só public/index.html mudou.
