# Atlantyx OS · v1.9.9 — Brief visual realmente NOVO (anti-genérico + direção)

## O que você viu
"Regerar brief" rodou, mas o brief novo era quase igual ao antigo
("executivo olhando dashboards em sala escura..."). Motivo: o prompt do
Designer é ancorado na identidade visual (dark navy, dados, premium) e a IA
caía sempre na mesma cena — independentemente da copy.

## Fixes
- Designer com regra ANTI-REPETIÇÃO: a cena "executivo + monitores" é
  proibida como padrão; ele precisa extrair da headline/tema uma METÁFORA
  VISUAL concreta (3 conceitos → escolhe o mais forte), descrevê-la em
  conceito_visual e construir o prompt em cima dela
- Recebe o BRIEF ANTERIOR e é obrigado a ser claramente diferente; se
  devolver o mesmo texto, a tela avisa e pede uma direção
- Novo campo ao lado do botão: "Direção para a imagem (opcional)" — ex.
  "chão de fábrica com robôs", "farol na névoa", "sem pessoas" — tem
  prioridade máxima
- Status visível abaixo do brief: "⏳ Designer criando um brief NOVO..."
  → "✅ Brief NOVO às hh:mm · conceito: <metáfora> · clique em Gerar"
  (o campo do brief pisca dourado); erro em vermelho; guarda de 40 s
  para o botão nunca ficar preso em "Gerando brief..."

## Fluxo recomendado após ajustar a copy
Ajustar Copy/Refazer Tudo → (o brief já refaz sozinho no Refazer) →
se quiser outra cena: escreva a direção → 🎨 Regerar brief → ◆ Gerar no
Ideogram.
Arquivos: api/s2-creative.js · public/index.html
