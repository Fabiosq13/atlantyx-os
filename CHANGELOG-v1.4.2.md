# Atlantyx OS · v1.4.2 — Fix Crítico: Menus não abriam

**Data:** 12 de agosto de 2026
**Anterior:** v1.4.1

---

## 🔥 Bug crítico corrigido

### Sintoma
Nenhum menu abria no clique. Toda a UI parecia congelada mesmo com o build no ar.

### Causa raiz
Bug de escape de aspas na linha 7546 do `public/index.html`, dentro da
função que renderiza o Calendário de Campanhas (`renderCalendarioMes`).

O código tinha:
```javascript
chips += '<div onclick="abrirCampanhaDB(\\'' + c.id + '\\')" ...';
```

O `\\'` (backslash + backslash + aspa) na string JavaScript significa
`\` seguido de `'` — e essa aspa FECHA a string prematuramente. Todo o
resto vira sintaxe inválida.

**Resultado:** o parser JavaScript do browser encontrava SyntaxError e
parava de executar o script INTEIRO. Como `nav()` era declarada nesse
mesmo script, ela nunca ficava disponível — daí os menus não respondiam.

### O bug estava lá desde antes

Confirmei com diff que esse bug já existia no v1.3 e provavelmente em
versões anteriores. Se você estava conseguindo usar os menus antes, era
com uma versão AINDA MAIS ANTIGA (antes do módulo Calendário de Campanhas
ser adicionado).

### Fix
Substituí a concatenação problemática por template string com aspas
simples inline:

```javascript
chips += `<div onclick="abrirCampanhaDB('${c.id}')" ...`;
```

Zero escape necessário — template string com backticks.

### Como validei antes de entregar
Rodei `node --check` nos ~462 KB de JavaScript do index.html:
- Antes: `SyntaxError: Unexpected string` na linha 4698
- Depois: sintaxe OK ✓
- Rodei em ambiente com stubs de browser e confirmei que `nav()`,
  `loadPipeline()` e outras funções críticas ficam definidas
