# Atlantyx OS · v1.10.2 — Reel que carrega no Metricool/Instagram (MP4 real)

## O sintoma (print): reel reconhecido, legenda ok, vídeo girando p/ sempre
Causa: o MediaRecorder do navegador gera um MP4 "fragmentado", sem o
cabeçalho moov no início e sem duração declarada. Players de plataforma
(Metricool/Instagram) precisam de um MP4 progressivo (faststart) com
duração — sem isso, spinner infinito e falha na validação de duração.

## Fix: codificação com WebCodecs + muxer MP4 (Chrome/Edge)
- Frames renderizados um a um (não em tempo real): H.264 (avc1) via
  VideoEncoder + mp4-muxer (moov no início, duração declarada, 30 fps
  constantes). Mais rápido que gravar em tempo real e MP4 padrão.
- Fallback automático para MediaRecorder se WebCodecs não existir
  (Firefox), com aviso de que o Instagram pode não tocar.
- Status: "Codificando MP4... 64%" e, ao final, o modo usado
  ("MP4 H.264 (WebCodecs, avc1.42E01F)").
- Biblioteca mp4-muxer carregada do jsDelivr/unpkg na 1ª vez (~40 KB).

## O que fazer com o reel que já está no Metricool
Excluir aquele post → no Atlantyx: 🎬 Montar vídeo (v1.10.2) → ☁ Hospedar
→ 🚀 Agendar Reel. O vídeo novo deve carregar e mostrar duração.

## Nota
Continua sem áudio (limitação do canvas). Se quiser trilha, publique pelo
app do Instagram usando o MP4 baixado (⬇ Baixar) e adicione música lá.

## Validação
Smoke test com stubs de VideoEncoder/VideoFrame/Mp4Muxer: 150 frames
codificados (5 s × 30 fps), muxer finalizado, MP4 pronto. Só
public/index.html mudou.
