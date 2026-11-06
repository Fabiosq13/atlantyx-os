# Spec — Financeiro → Investimentos & Retiradas (v3.400)

BPM-Trilha: T3 (agente de IA em api/estrategia + lib/investimentos) · interseção T4 (menu/página em public/index.html, seção própria) · T6 (só leitura das ações fluxo_futuro/kpis_saude do financeiro)

## Pedido do fundador (05/11/2026)
Tela no Financeiro para indicar como e quando fazer retiradas da empresa, com que valor, com análise ampla e econômica do cenário, indicando o melhor e mais rentável investimento para essas retiradas (Brasil ou exterior) e o melhor investimento para cumprir as metas da empresa e as pessoais do sócio. Perguntas-exemplo: CDB vale com a expectativa de redução de juros (Lara Resende)? Aplicar fora vale? Quais fundos e ações? Melhor rendimento para a empresa? Carteira ideal da Atlantyx, dinâmica conforme a política econômica de curto/médio/longo prazo. Mostrar também o plano e o lucro previsto do planejamento de investimento.

## Critérios de aceite
- [x] Parâmetros do fundador (reserva mínima em meses, perfil, horizonte, retirada desejada, exposição ao exterior, metas pessoais, restrições) gravados (kv `inv:params`).
- [x] Cenário macro pesquisado na web no momento da análise (Selic, Focus, IPCA, CDI, câmbio, Fed, debates como Lara Resende) com fontes.
- [x] Análise com números reais: caixa, a receber/pagar, fluxo futuro 12 meses (menor saldo), KPIs, histórico, metas, despesas, propósito/metas pessoais.
- [x] Saída: política de retiradas (forma, imposto, regra, calendário), carteira PJ e PF por prazo com instrumentos/%/liquidez/risco/local, Brasil × exterior, respostas diretas, gatilhos (carteira dinâmica), riscos, próximos passos, aviso CVM.
- [x] Plano financeiro: projeção ano a ano (aportado, rendimento, lucro acumulado, saldo, saldo real) e lucro previsto — empresa e sócio.
- [x] Gravado em base (kv `inv:ultima` + s1_historico tipo `investimentos`) com 🕘 Histórico; ATLAS na tela para discutir.
- [x] Só o fundador acessa as ações (soFundador).
