# Atlantyx OS · v1.26.1 — FIX: reagendar post no Metricool

## O erro
"Metricool HTTP 400: ValidationError · text: must not be null,
providers: must not be null · e não há payload original para recriar."

## Causa
Duas falhas somadas:
1. Ao mudar a data, enviávamos ao Metricool só o campo `publicationDate`.
   A API dele **não aceita atualização parcial** — exige o registro
   completo (texto, redes, mídia) mesmo que você só queira mudar a hora.
2. O plano B (excluir e recriar) dependia de um "payload original" salvo
   pelo próprio sistema — que só existe em posts publicados pelo Atlantyx
   depois da v1.11.2. Para qualquer post mais antigo ou criado direto no
   Metricool, não havia como recriar.

## Correção
Agora, ao reagendar, o sistema:
1. **Busca o post no Metricool** e reenvia o registro **completo** com
   apenas a data trocada (preservando texto, redes, imagens e tipo —
   post/story/reel)
2. Se ainda assim o Metricool recusar, **recria o post a partir dos dados
   lidos do próprio Metricool** — funciona mesmo sem payload salvo, para
   posts antigos ou criados fora do sistema
3. Só se as duas coisas falharem é que aparece erro — agora explicando o
   que aconteceu em cada etapa

## Validação (3 caminhos testados)
1. PUT completo aceito → confirma que `text` e `providers` (os campos que
   faltavam) vão preenchidos com a nova data ✓
2. PUT recusado → recria automaticamente reaproveitando texto/rede/imagem
   do Metricool ✓
3. Post inexistente → erro claro com orientação ✓

## Arquivo
- api/metricool.js
