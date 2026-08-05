# Syndi_qa — Zoom interativo no preview ampliado

## 0. Contexto

O Syndi_qa já tem preview reduzido de imagens: a grade usa `tamanho=mini` e o modal de ampliar usa `tamanho=zoom`, conforme `docs/superpowers/specs/2026-07-28-syndi-qa-preview-imagem-design.md`. Esse preview maior resolve o peso do arquivo original, mas o modal ainda só mostra a imagem encaixada/navegável. Para conferir detalhes de recorte — bordas, transparência, cabelo/tecido, sombras e reflexos — o analista precisa aproximar e deslocar a imagem dentro do modal.

## 1. Objetivo

Adicionar zoom interativo ao modal `#modalImagem`, mantendo o preview `tamanho=zoom` como fonte da imagem. O usuário deve conseguir alternar rapidamente entre visão geral e detalhe, ajustar o zoom fino com a roda do mouse e arrastar a imagem ampliada para inspecionar regiões específicas.

## 2. Interação aprovada

- A imagem abre em modo **encaixar na tela**.
- Clicar na imagem alterna entre:
  - encaixar na tela;
  - zoom de detalhe.
- A roda do mouse aproxima/afasta dentro de limites definidos.
- Quando a imagem está ampliada, arrastar move a imagem dentro da área visível.
- Um botão **Resetar zoom** volta para o modo encaixado.
- Navegação anterior/próxima continua funcionando.
- Ao trocar de foto, abrir uma nova foto ou fechar o modal, o zoom reseta.
- O modal continua usando `urlImagem(imagemAmpliada, 'zoom')`; o original pesado não é carregado para essa interação.

## 3. Escopo

### Entra

- Estado de zoom no front-end: escala, deslocamento X/Y e estado de arrasto.
- Eventos no modal: click, wheel, pointer/mouse drag, reset e troca de imagem.
- CSS para área de zoom: overflow oculto, cursor, transform origin/transform e controles.
- Verificação manual no app rodando.

### Fica fora

- Carregar a foto original de 15–18 MB no modal.
- Pinch-to-zoom touch/mobile nesta primeira versão.
- Persistir zoom entre fotos ou sessões.
- Limites geométricos perfeitos para impedir qualquer espaço vazio ao arrastar; a primeira versão pode usar clamp simples ou reset quando necessário.

## 4. Front-end

### `js/qa.js`

Adicionar estado reativo/local:

- `zoomEscala`: começa em `1`.
- `zoomOffsetX` / `zoomOffsetY`: começam em `0`.
- `zoomArrastando`: boolean.
- coordenadas iniciais do arrasto e offset inicial.

Adicionar funções:

- `resetarZoomImagem()` — escala `1`, offsets `0`, arrasto desligado.
- `alternarZoomImagem()` — se escala for `1`, vai para um zoom de detalhe padrão; se estiver ampliada, reseta.
- `ajustarZoomImagem(event)` — usa `wheel`, previne scroll do fundo do modal e aplica incremento/decremento com limites.
- `iniciarArrastoZoom(event)` — só inicia quando escala > 1.
- `moverArrastoZoom(event)` — atualiza offsets durante arrasto.
- `finalizarArrastoZoom()` — encerra o arrasto.

Pontos de integração:

- `ampliarImagem()` chama `resetarZoomImagem()` antes de abrir o modal.
- `navegarAmpliada()` chama `resetarZoomImagem()` após trocar a foto.
- O fechamento do modal também deve resetar zoom para não vazar estado para a próxima abertura.

### `syndi_qa.html`

No modal `#modalImagem`:

- Envolver a imagem em um container de zoom com `overflow: hidden`.
- Aplicar estilo inline calculado na imagem:
  - `transform: translate(offsetX, offsetY) scale(escala)`.
- Ligar eventos:
  - click para alternar zoom;
  - wheel para ajustar zoom;
  - pointer/mouse down/move/up/leave para arrastar.
- Adicionar botão **Resetar zoom** junto dos controles existentes, habilitado principalmente quando escala > 1.

## 5. CSS

Adicionar regras em `css/qa.css` para:

- container do zoom ocupar a área central do modal;
- esconder overflow;
- imagem com `max-width`/`max-height`, `transform-origin: center center`, transição curta quando não estiver arrastando;
- cursor:
  - `zoom-in` quando encaixada;
  - `grab` quando ampliada;
  - `grabbing` durante arrasto;
- controles do modal mantendo o visual atual.

A estética deve ser funcional e discreta: o zoom é ferramenta de inspeção, não novo componente visual dominante.

## 6. Limites e comportamento

- Escala mínima: `1`.
- Escala máxima inicial: `4`.
- Zoom por clique: `2`.
- Wheel: passos pequenos, por exemplo `0.25`.
- Se a escala voltar para `1`, offsets devem voltar para `0`.
- O arrasto não deve selecionar texto nem arrastar a imagem nativa do navegador.

## 7. Testes e verificação

Não há teste unitário obrigatório para os eventos do modal nesta primeira versão, porque a superfície real é a interação no navegador. A verificação deve ser manual/browser-driven:

1. Rodar o app na porta `3001`.
2. Abrir um GTIN com imagem.
3. Clicar em uma miniatura/botão ampliar.
4. Confirmar que a imagem abre encaixada usando o preview `tamanho=zoom`.
5. Clicar na imagem e confirmar zoom de detalhe.
6. Usar roda do mouse para aproximar/afastar.
7. Arrastar a imagem ampliada.
8. Clicar em **Resetar zoom** e confirmar volta para encaixado.
9. Navegar para a próxima/anterior e confirmar que o zoom resetou.
10. Fechar e abrir novamente o modal e confirmar que o zoom não vazou.

## 8. Riscos

- Eventos de click e drag podem conflitar: um arrasto não deve disparar alternância de zoom ao soltar. Se isso ocorrer, diferenciar clique real de movimento acima de um pequeno limiar.
- Wheel dentro do modal precisa prevenir scroll da página/modal, mas só enquanto o ponteiro está sobre a área da imagem.
- Imagens muito verticais/horizontais podem exigir ajuste nos limites de offset; primeira versão prioriza usabilidade simples e reset rápido.
