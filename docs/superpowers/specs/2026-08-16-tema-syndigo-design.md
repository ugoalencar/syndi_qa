# Tema Syndigo no syndi_qa — design

Data: 2026-08-16

## Objetivo

Aplicar a identidade visual Syndigo (paleta + logo) no `syndi_qa`, **sem alterar
funcionamento nem posicionamento de nenhum elemento**. Só cor, mais o simbolo no header.

## Material de partida

Em `css/files/` ja existe uma proposta visual completa:

| Arquivo | O que e |
|---|---|
| `syndigo-tema.css` | overlay de cor, escrito para entrar DEPOIS de sphoto.css/qa.css |
| `syndigo-simbolo.svg` | simbolo, 565 bytes, inline, sem dependencia de rede |
| `syndigo-lockup.png` | lockup completo (nao usado nesta entrega) |
| `syndi-qa-layout.html` | mockup renderizado do alvo — e o gabarito da verificacao |
| `sphoto-syndigo-layout.html` | mockup da tela de captura do sphoto (fora de escopo) |

## Abordagem escolhida

Overlay, **sem tocar em `sphoto.css` nem `qa.css`**.

Motivo: o `sphoto.css` daqui e gemeo dos que rodam em `c:\sphoto` e `c:\sphoto-terminais`.
Editar ele aqui cria divergencia silenciosa entre os tres pacotes. O overlay mantem os
tres identicos e torna a mudanca reversivel apagando um `<link>`.

A alternativa descartada foi tokenizar os 87 hex de sphoto.css/qa.css em `var(--…)`:
mais limpo a longo prazo, mas e a unica opcao que pode alterar posicao ou estado sem
querer, e propaga risco para os outros dois pacotes.

## Escopo real: o que o overlay pronto NAO cobre

O `syndigo-tema.css` foi escrito olhando a tela de **captura** do sphoto. As regras dele
para `check-subpasta-wrapper`, `legenda-cores-cor`, `subpasta-preview-item` e `tag-badge`
**nao tem nenhum uso no `syndi_qa.html`** — sao inertes aqui. Ficam, nao atrapalham.

O que renderiza nesta tela e o overlay deixa passar:

### Grupo 1 — superficies neutras (sphoto.css)

Cinza neutro encostado no navy `#0A1B2A` e o que mais denuncia um tema pela metade.

| Hex atual | Linhas (sphoto.css) | Vira |
|---|---|---|
| `#252525` | 228, 377, 622 | `var(--bg-input)` |
| `#1a1a1a` | 283 | `var(--bg-card)` |
| `#222` | 306 | `var(--bg-input)` |
| `#0a0a0a` | 704, 719 · qa.css 747 | `#04101A` (poco escuro) |
| `#444` | 867 | `var(--border)` |
| `#555` | 284, 469, 762, 868 | `var(--border)` / `var(--text-muted)` conforme o papel |
| `#666` | 303, 373 | `var(--text-muted)` |

`#1a1a1a` em sphoto.css:275 e qa.css:359/362 e **texto sobre fundo claro** (badge ativo),
nao superficie. Vira `#052A00` ou `#04101A` conforme o fundo, preservando o contraste.

### Grupo 2 — hovers hardcoded (sphoto.css)

Hoje divergem do hover que o overlay ja define para os botoes Bootstrap.

| Hex atual | Linhas | Vira |
|---|---|---|
| `#1565c0` | 408, 409 | `#0361C6` |
| `#218838` | 419, 420 | `#2FB101` |

### Grupo 3 — codigos de subpasta

O codigo de cor por subpasta e **leitura operacional que a equipe ja tem na cabeca**.
Continua sendo cor distinta e mutuamente distinguivel — nao vira decoracao monocromatica.

Seletores nao cobertos pelo overlay: `.qa-acao-mini` nas variantes `.rt .ap .ocr .apl
.rotacao`; `.qa-miniatura.tem-rt/.tem-ap/.tem-ocr`; `.qa-legenda-cor.rt/.ap`;
`.miniatura.tem-*`.

| Codigo | Hex atual | Vira |
|---|---|---|
| RT | `#fd7e14` | `var(--syn-rt)` `#FF7A1A` |
| IS | `var(--info)` | `var(--syn-is)` `#22B8CF` |
| AP | `#9c27b0` | `var(--syn-ap)` `#A855F7` |
| coding | `var(--warning)` | `var(--syn-coding)` `#F5A524` |
| OCR | `#6f42c1` | `--syn-ocr` `#7C5CFF` (novo) |
| rotacao | `#20c997` | `--syn-rotacao` `#2DD4A7` (novo) |
| APL | `#17a2b8` | `--syn-apl` `#EC4899` (novo) |

### Colisoes de cor corrigidas nesta entrega

Duas colisoes reais no CSS atual, verificadas no codigo, ambas com os dois lados em uso
no `syndi_qa.html`:

1. **`.qa-acao-mini.is` e `.qa-acao-mini.apl` sao a mesma cor.** `.is` usa `var(--info)`,
   que vale `#17a2b8`; `.apl` usa o literal `#17a2b8`. Dois codigos distintos, pixel
   identicos. APL ganha tom proprio (`--syn-apl`).
2. **`.qa-acao-mini.ocr.ativa` e `.coding.ativa` sao a mesma cor** (`#ffc107` nas duas).
   OCR ativo passa a usar `--syn-ocr`.

Se APL e IS forem deliberadamente a mesma leitura, a correcao 1 cai — e decisao do usuario,
nao do implementador.

## Implementacao

1. Copiar `css/files/syndigo-tema.css` → `css/syndigo-tema.css`
2. Copiar `css/files/syndigo-simbolo.svg` → `img/syndigo-simbolo.svg`
3. Acrescentar ao `syndigo-tema.css` um bloco delimitado e comentado
   (`/* ---- residuos hardcoded do syndi_qa ---- */`) com os 3 grupos acima
4. `<link rel="stylesheet" href="css/syndigo-tema.css">` em `syndi_qa.html` e
   `monitor.html`, **depois** dos links de sphoto.css e qa.css
5. `<img class="logo" src="img/syndigo-simbolo.svg" alt="Syndigo">` antes do
   `.header-title`. O `.logo` ja existe (`height:32px`) e o `.header-left` ja e flex com
   `gap:12px` — nada se desloca.

## Restricoes

- **Nenhuma regra de layout.** Nada de `display`, `flex`, `grid`, `position`, `width`,
  `height`, `padding`, `margin`, `gap`, `order`. Só cor, `border-color`, `box-shadow`,
  `background`, `filter`. Unica excecao: a `<img>` nova no header.
- **Nada de CDN.** A maquina e offline. SVG local, sem webfont nova.
- **Nenhum `.js`, nenhum `lib/`, nenhum arquivo de dados.**
- **`sphoto.css` e `qa.css` ficam byte-identicos.**

## Verificacao

Abrir `syndi_qa.html` e `monitor.html` no navegador em `http://localhost:3000` (nao
`file://`) com Ctrl+Shift+R, e comparar com `css/files/syndi-qa-layout.html`.

Conferir explicitamente:
- nenhum residuo cinza-neutro contra o navy
- hover de primary e success alinhados com os botoes Bootstrap
- os 7 codigos de subpasta distinguiveis entre si na mesma tela
- logo no header sem deslocar o titulo nem o `.header-right`
- foco de teclado visivel (a estacao e muito usada no tab)

Sem essa passada no navegador a entrega nao se considera pronta. Cor e exatamente o tipo
de coisa que parece certa no codigo e sai errada na tela.

## Fora de escopo

Aplicar o mesmo tema em `c:\sphoto` e `c:\sphoto-terminais`. O
`sphoto-syndigo-layout.html` que veio na pasta indica que essa e a intencao, mas e
trabalho separado, com seu proprio ciclo.
