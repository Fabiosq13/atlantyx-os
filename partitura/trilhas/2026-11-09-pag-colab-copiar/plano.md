# Plano — Pagamento a colaboradores: copiar do mês anterior
BPM-Trilha: T6 · BPM-ID: 2026-11-09-pag-colab-copiar
- [x] lib/pag-colab.js: vazia(), copiarDoAnterior() (horas, valor hora, valor manual e observação de cada colaborador; marca copiado_de)
- [x] api/pmo.js pag_colab: ao ler um mês recente sem folha, copia automático; op copiar_anterior força
- [x] Tela: botão Copiar do mês anterior, aviso de onde veio
## Interseções
- T3/T1: api/pmo.js (ação pag_colab) e public/index.html (tela do Financeiro).
## Registro da Batida
- 2026-11-09 · v3.414 · ✅ entregue · próximo: fundador abre a folha de novembro.
- 2026-11-09 · v3.415 · ✅ cópia automática só no mês corrente (o mês anterior continua seguindo os apontamentos).
