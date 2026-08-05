# Documentação do Syndi_qa

Índice dos documentos operacionais e de design mais relevantes do projeto.

## Fluxos operacionais

- [Fluxo de pastas do Syndi_qa / SyncIMGSend](fluxo-pastas-syndi-qa.md) — estrutura necessária para testar a fila QA, Aprovar/Enviar para edição, Retrabalho e os sinais internos do GTIN (`_coding`, `RT`, `IS`, `AP`, `Mockup`, `Recorte`).

## Specs e planos recentes

- [Spec — Zoom interativo no preview ampliado](superpowers/specs/2026-08-05-syndi-qa-zoom-preview-ampliado-design.md) — desenho aprovado para zoom/click/wheel/drag/reset no modal de imagem ampliada.
- [Plano — Zoom interativo no preview ampliado](superpowers/plans/2026-08-05-syndi-qa-zoom-preview-ampliado.md) — plano de implementação usado para executar o zoom no modal.

## Specs base do fluxo QA

- [Spec — Interface de QA + Fluxo de Retrabalho](superpowers/specs/2026-07-21-syndi-qa-retrabalho-design.md) — contexto inicial do Syndi_qa no pipeline do SyncIMGSend.
- [Spec — Correções no Retrabalho](superpowers/specs/2026-07-22-syndi-qa-retrabalho-correcoes-design.md) — TXT único por OS e comportamento de falha no Redmine no retrabalho.
- [Spec — Envio para Edição](superpowers/specs/2026-07-22-syndi-qa-envio-edicao-design.md) — fluxo de Aprovar/Enviar para edição, gravação de campos no Redmine e destino `AgEnvio`.
- [Spec — Correções QA](superpowers/specs/2026-07-28-syndi-qa-correcoes-qa-design.md) — regras atuais de inferência com `Mockup`, `Recorte`, `RT/IS/AP` e `_coding`.
- [Spec — Preview reduzido de imagens](superpowers/specs/2026-07-28-syndi-qa-preview-imagem-design.md) — cache de previews `mini` e `zoom` usado pela grade e pelo modal ampliado.
