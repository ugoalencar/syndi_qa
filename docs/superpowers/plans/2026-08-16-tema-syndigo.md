# Tema Syndigo no syndi_qa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar a identidade visual Syndigo (paleta + simbolo) no `syndi_qa` trocando
apenas cor, sem alterar funcionamento nem posicionamento de nenhum elemento.

**Architecture:** Um unico arquivo de sobreposicao (`css/syndigo-tema.css`) entra depois de
`sphoto.css` e `qa.css` nos dois HTMLs e redefine as variaveis do `:root` mais os pontos
hardcoded que a redefinicao nao alcanca. `sphoto.css` e `qa.css` ficam byte-identicos,
porque sao gemeos dos que rodam em `c:\sphoto` e `c:\sphoto-terminais`.

**Tech Stack:** HTML + CSS puro. Sem build, sem npm install, sem CDN. Node/Express serve
em `localhost:3001`. Verificacao visual com Playwright (skill `webapp-testing`).

## Global Constraints

- **Nenhuma regra de layout.** Proibido em todo o plano: `display`, `flex`, `grid`,
  `position`, `top/right/bottom/left`, `width`, `height`, `padding`, `margin`, `gap`,
  `order`, `font-size`, `font-weight`. Permitido: `color`, `background`,
  `background-color`, `border-color`, `box-shadow`, `outline`, `filter`.
  Unica excecao em todo o plano: a tag `<img>` nova da Task 4.
- **`css/sphoto.css` e `css/qa.css` ficam byte-identicos.** Verificado por
  `git diff --stat` em cada commit. Se aparecerem nessa lista, a task esta errada.
- **Nada de CDN.** A maquina e offline. Nenhuma webfont nova, nenhum `@import` remoto.
- **Nenhum `.js`, nenhum `lib/`, nenhum arquivo `.json` de dados e alterado.**
- **Comentario em portugues sem acento**, explicando o *porque*, seguindo o resto do
  codigo.
- **Porta 3001.** `const PORT = 3001` em `server.js:22`. Nunca `file://` — da CORS.
- **Ctrl+Shift+R / cache desabilitado** em toda verificacao no navegador. Correcao de CSS
  que "nao funcionou" e cache em 9 de 10 casos.

**Spec:** `docs/superpowers/specs/2026-08-16-tema-syndigo-design.md`

**Paleta (valores exatos, do `css/files/syndigo-tema.css`):**

| Token | Valor |
|---|---|
| `--bg-body` | `#05121E` |
| `--bg-card` | `#0A1B2A` |
| `--bg-input` | `#0F2739` |
| `--border` | `#1B3A52` |
| `--text` | `#E8F0F7` |
| `--text-muted` | `#6E8799` |
| `--primary` | `#0473EA` |
| `--success` | `#38D201` |
| `--warning` | `#F5A524` |
| `--danger` | `#E5484D` |
| `--info` | `#22B8CF` |
| `--syn-rt` | `#FF7A1A` |
| `--syn-is` | `#22B8CF` |
| `--syn-ap` | `#A855F7` |
| `--syn-coding` | `#F5A524` |
| `--syn-blue-hi` | `#2E8FF5` |
| `--syn-green-hi` | `#5BE62B` |

Tokens novos criados por este plano (Task 3): `--syn-ocr` `#7C5CFF`,
`--syn-rotacao` `#2DD4A7`, `--syn-apl` `#EC4899`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `css/syndigo-tema.css` | **Criado.** Todo o tema. Unico lugar onde cor Syndigo e definida. |
| `img/syndigo-simbolo.svg` | **Criado.** Simbolo, 565 bytes, inline, offline. |
| `syndi_qa.html` | **Modificado.** 1 `<link>` + 1 `<img>`. Nada mais. |
| `monitor.html` | **Modificado.** 1 `<link>`. Nada mais. |
| `css/sphoto.css` | **Intocado.** |
| `css/qa.css` | **Intocado.** |

O `syndigo-tema.css` fica em quatro blocos comentados, na ordem em que as tasks os
escrevem: (1) o que veio pronto, (2) residuos de superficie e hover, (3) codigos de
subpasta, (4) nada — o logo e so HTML.

---

### Task 1: Instalar o overlay e ligar nos dois HTMLs

Ao fim desta task as telas ja estao navy. Os residuos ainda aparecem — e isso e esperado
e sera o insumo visual das Tasks 2 e 3.

**Files:**
- Create: `css/syndigo-tema.css` (copia de `css/files/syndigo-tema.css`)
- Modify: `syndi_qa.html:11` (inserir apos)
- Modify: `monitor.html:15` (inserir apos)

**Interfaces:**
- Consumes: nada.
- Produces: `css/syndigo-tema.css` carregado por ambos os HTMLs, com um `:root` valendo a
  paleta da tabela acima. As Tasks 2 e 3 escrevem **no fim desse mesmo arquivo**.

- [ ] **Step 1: Copiar o overlay que ja veio pronto**

```bash
cd /d/syndi_qa
cp css/files/syndigo-tema.css css/syndigo-tema.css
```

- [ ] **Step 2: Conferir que a copia tem o `:root` esperado**

Run: `grep -c "bg-body:#05121E\|primary:#0473EA\|syn-rt:#FF7A1A" css/syndigo-tema.css`
Expected: `3`

- [ ] **Step 3: Ligar no `syndi_qa.html`**

O `<head>` hoje termina assim (linhas 8-12):

```html
    <link href="css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/bootstrap-icons.css">
    <link rel="stylesheet" href="css/sphoto.css">
    <link rel="stylesheet" href="css/qa.css">
</head>
```

Fica assim — o overlay **depois** de qa.css, senao nao sobrepoe:

```html
    <link href="css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/bootstrap-icons.css">
    <link rel="stylesheet" href="css/sphoto.css">
    <link rel="stylesheet" href="css/qa.css">
    <!-- tema Syndigo: so cor, entra por ultimo pra sobrepor. Apagar esta
         linha devolve o tema antigo inteiro. -->
    <link rel="stylesheet" href="css/syndigo-tema.css">
</head>
```

- [ ] **Step 4: Ligar no `monitor.html`**

O `<head>` hoje tem (linhas 13-17):

```html
    <link href="css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/bootstrap-icons.css">
    <link rel="stylesheet" href="css/sphoto.css">

    <style>
```

Fica:

```html
    <link href="css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/bootstrap-icons.css">
    <link rel="stylesheet" href="css/sphoto.css">
    <!-- tema Syndigo: so cor, entra por ultimo pra sobrepor. Apagar esta
         linha devolve o tema antigo inteiro. -->
    <link rel="stylesheet" href="css/syndigo-tema.css">

    <style>
```

Atencao: o `<style>` inline do monitor vem **depois** do link, mas usa exclusivamente
`var(--…)` e nenhum hex — entao ele consome a paleta nova em vez de brigar com ela.
Nao mexa nesse `<style>`.

- [ ] **Step 5: Subir o servidor**

```bash
cd /d/syndi_qa && node server.js
```

Expected no console: `http://localhost:3001`

Se a porta estiver ocupada, e outro pacote sphoto rodando — confira com
`netstat -ano | findstr :3001` antes de matar nada.

- [ ] **Step 6: Verificar as duas telas no navegador**

Com Playwright (skill `webapp-testing`), cache desabilitado, viewport 1600x900:

1. `http://localhost:3001/syndi_qa.html` — screenshot `verif/t1-qa.png`
2. `http://localhost:3001/monitor.html` — screenshot `verif/t1-monitor.png`

Expected:
- fundo do body navy escuro (`#05121E`), nao `#121212` cinza
- header com filete azul Syndigo
- **monitor.html 100% correto ja aqui** — sem nenhum cinza neutro sobrando
- `syndi_qa.html` majoritariamente navy, **mas com manchas cinza-neutro visiveis** em
  input, modal e scrollbar. Isso e o esperado; as Tasks 2 e 3 resolvem.
- console do navegador sem erro 404 de CSS

Se o `monitor.html` mostrar cinza neutro, pare: o link nao pegou ou ha cache.

- [ ] **Step 7: Confirmar que os arquivos compartilhados nao foram tocados**

Run: `git diff --stat`
Expected: aparecem `syndi_qa.html` e `monitor.html`. **`css/sphoto.css` e `css/qa.css`
NAO podem aparecer.** Se aparecerem, reverta com `git checkout -- css/sphoto.css css/qa.css`.

- [ ] **Step 8: Commit**

```bash
cd /d/syndi_qa
git add css/syndigo-tema.css syndi_qa.html monitor.html
git commit -m "feat(tema): instala overlay Syndigo nos dois HTMLs

Overlay entra depois de sphoto.css/qa.css e so redefine cor. Os dois
arquivos base ficam intocados de proposito: sao gemeos dos que rodam em
c:\\sphoto e c:\\sphoto-terminais.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Fechar os residuos de superficie e de hover

Cinza neutro encostado no navy e o que mais denuncia um tema pela metade. Estes valores
estao hardcoded no `sphoto.css`, entao a redefinicao do `:root` nao os alcanca — precisam
de seletor proprio no overlay.

**Files:**
- Modify: `css/syndigo-tema.css` (acrescentar bloco no fim do arquivo)

**Interfaces:**
- Consumes: os tokens `--bg-card`, `--bg-input`, `--border`, `--text-muted` definidos no
  `:root` da Task 1.
- Produces: token novo `--syn-poco` `#04101A`, usado tambem pela Task 3 em texto sobre
  fundo claro.

- [ ] **Step 1: Confirmar que os residuos ainda estao la**

Run:
```bash
cd /d/syndi_qa
grep -c "#252525\|#1a1a1a\|#222\|#0a0a0a\|#444\|#555\|#666\|#1565c0\|#218838" css/sphoto.css
```
Expected: `19`

Isso confirma que o `sphoto.css` continua intocado (bom) e que o trabalho e real.

- [ ] **Step 2: Conferir os seletores**

Estes seletores foram lidos do arquivo, nao deduzidos. Confirme antes de escrever:

```bash
cd /d/syndi_qa
sed -n '226,229p;273,276p;281,285p;301,308p;371,379p;406,422p;467,471p;620,624p;702,706p;717,721p;760,764p;865,869p' css/sphoto.css
sed -n '739,749p' css/qa.css
```

**Grupo A — renderizam no `syndi_qa.html`, verificados no HTML:**

| Arquivo:linha | Seletor | Propriedade | Hex atual |
|---|---|---|---|
| sphoto.css:303 | `.form-control::placeholder` | `color` | `#666` |
| sphoto.css:373 | `.form-text` | `color` | `#666` |
| sphoto.css:408-409 | `.btn-primary:hover` | `background-color`/`border-color` | `#1565c0` |
| sphoto.css:419-420 | `.btn-success:hover` | `background-color`/`border-color` | `#218838` |
| sphoto.css:704 | `#modalImagem .modal-content` | `background-color` | `#0a0a0a` |
| sphoto.css:719 | `#modalImagem .modal-body` | `background-color` | `#0a0a0a` |
| sphoto.css:762 | `.info-imagem .separator` | `color` | `#555` |
| sphoto.css:867-868 | `::-webkit-scrollbar-thumb` (+`:hover`) | `background` | `#444` / `#555` |
| qa.css:747 | `.qa-modal-zoom-area` | `background-color` | `#0a0a0a` |

**Grupo B — nao renderizam hoje nesta tela.** Verificado no `syndi_qa.html`: a unica
tabela usa a classe `qa-agenda-tabela`, nao `.table`; nao existe atributo `readonly`; e
`status-salvo`, `status-retrabalho`, `input-group-text`, `nav-tabs` e `legenda-cores` tem
zero ocorrencias.

| Arquivo:linha | Seletor | Hex atual |
|---|---|---|
| sphoto.css:228 | `.table th` | `#252525` |
| sphoto.css:275 | `.status-salvo` (`color`) | `#1a1a1a` |
| sphoto.css:283-284 | `.status-retrabalho` | `#1a1a1a` / `#555` |
| sphoto.css:306 | `.form-control:read-only` | `#222` |
| sphoto.css:377 | `.input-group-text` | `#252525` |
| sphoto.css:469 | `.nav-tabs .nav-link:hover` | `#555` |
| sphoto.css:622 | `.legenda-cores` | `#252525` |

O Grupo B entra no overlay mesmo assim — custo zero, e evita que a tela quebre de cor se
alguem adicionar uma dessas classes depois. Mas **ele nao pode ser verificado visualmente
nesta entrega**, porque nao aparece na tela. Declare isso no relatorio; nao afirme que foi
conferido no navegador.

Se algum seletor divergir da tabela, **use o que esta no arquivo** e anote a divergencia.

- [ ] **Step 3: Escrever o bloco no fim do `css/syndigo-tema.css`**

Acrescente exatamente isto ao final do arquivo:

```css

/* ============================================================
   Residuos hardcoded do syndi_qa — grupo 1 e 2

   O :root la em cima resolve tudo que USA variavel. Estes pontos
   escrevem o hex direto no sphoto.css, entao a redefinicao nao os
   alcanca e precisam de seletor proprio aqui.

   Nao "arrume" isso editando o sphoto.css: ele e gemeo dos que rodam
   em c:\sphoto e c:\sphoto-terminais, e editar aqui cria divergencia
   silenciosa entre os tres pacotes.
   ============================================================ */

:root{
  /* poco escuro: fundo do visualizador de imagem, mais fundo que o body.
     A foto tem que ser a coisa mais clara da tela, senao a avaliacao de
     cor do produto fica enviesada pelo entorno. */
  --syn-poco:#04101A;
}

/* ---- grupo A: renderiza no syndi_qa.html ---- */

.form-control::placeholder{color:var(--text-muted)}
.form-text{color:var(--text-muted)}

#modalImagem .modal-content{background-color:var(--syn-poco)}
#modalImagem .modal-body{background-color:var(--syn-poco)}
.qa-modal-zoom-area{background-color:var(--syn-poco)}

.info-imagem .separator{color:var(--border)}

::-webkit-scrollbar-thumb{background:var(--border)}
::-webkit-scrollbar-thumb:hover{background:#2A5578}

/* hover: sem isto o hover do CSS proprio diverge do hover que o overlay
   ja define para os botoes Bootstrap la em cima */
.btn-primary:hover{background-color:#0361C6;border-color:#0361C6}
.btn-success:hover{background-color:#2FB101;border-color:#2FB101}

/* ---- grupo B: nao renderiza no syndi_qa.html hoje ----
   Entra por seguranca, caso alguem adicione a classe depois. NAO foi
   verificado no navegador — nao da pra verificar o que nao aparece. */
.table th{background-color:var(--bg-input)}
.status-salvo{color:var(--syn-poco)}
.status-retrabalho{background-color:var(--bg-card);border-color:var(--border)}
.form-control:read-only{background-color:var(--bg-input)}
.input-group-text{background-color:var(--bg-input)}
.nav-tabs .nav-link:hover{border-bottom-color:var(--border)}
.legenda-cores{background-color:var(--bg-input)}
```

- [ ] **Step 4: Conferir que nao entrou regra de layout**

Run:
```bash
cd /d/syndi_qa
grep -nE "display|flex|grid|position|padding|margin|[^-]width|height|font-size|font-weight" css/syndigo-tema.css
```
Expected: **nenhum resultado dentro do bloco novo.** O arquivo original ja tem `width` e
`height` no bloco `.syn-trilho` e `display:inline-flex` — esses sao pre-existentes e
podem ficar. Qualquer ocorrencia *abaixo* do comentario "Residuos hardcoded" e erro.

- [ ] **Step 5: Verificar no navegador**

Servidor em `localhost:3001`, cache desabilitado, viewport 1600x900.
Screenshot `verif/t2-qa.png` de `http://localhost:3001/syndi_qa.html`.

Expected (so o grupo A da pra conferir; o grupo B nao aparece na tela):
- barra de rolagem navy, nao cinza `#444`
- abra uma imagem em tela cheia (`#modalImagem`) e o zoom (`.qa-modal-zoom-area`): o fundo
  tem que ser `#04101A`, e a foto a coisa mais clara da tela
- hover do botao primary escurece para `#0361C6`, nao vira o azul antigo `#1565c0`
- hover do botao success escurece para `#2FB101`, nao vira o verde antigo `#218838`
- placeholder dos campos legivel, no tom `--text-muted`, nao apagado demais

Comparacao objetiva no devtools: selecione `.qa-modal-zoom-area` e confirme
`background-color: rgb(4, 16, 26)`. Se vier `rgb(10,10,10)`, e cache — Ctrl+Shift+R.

No relatorio, diga explicitamente que o grupo B nao foi verificado no navegador.

- [ ] **Step 6: Confirmar arquivos compartilhados intocados**

Run: `git diff --stat`
Expected: so `css/syndigo-tema.css`. Se `css/sphoto.css` ou `css/qa.css` aparecerem, a
task esta errada — reverta os dois.

- [ ] **Step 7: Commit**

```bash
cd /d/syndi_qa
git add css/syndigo-tema.css
git commit -m "feat(tema): cobre residuos de superficie e hover

Os hex hardcoded do sphoto.css nao sao alcancados pela redefinicao do
:root. Cinza neutro contra o navy e o que mais denuncia tema pela
metade; os hovers estavam divergindo dos botoes Bootstrap.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Codigos de subpasta e as duas colisoes de cor

O codigo de cor por subpasta e **leitura operacional que a equipe ja tem na cabeca**.
Continua sendo cor distinta e mutuamente distinguivel — nao vira monocromatico.

Esta task tambem corrige duas colisoes reais, verificadas no codigo, com os dois lados em
uso no `syndi_qa.html`:

1. `.qa-acao-mini.is` usa `var(--info)` = `#17a2b8`; `.qa-acao-mini.apl` usa o literal
   `#17a2b8`. **Dois codigos distintos, pixel identicos.**
2. `.qa-acao-mini.ocr.ativa` e `.qa-acao-mini.coding.ativa` sao ambos `#ffc107`.

**Files:**
- Modify: `css/syndigo-tema.css` (acrescentar bloco no fim)

**Interfaces:**
- Consumes: `--syn-rt`, `--syn-is`, `--syn-ap`, `--syn-coding` (Task 1);
  `--syn-poco` (Task 2).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Confirmar os seletores exatos**

Run:
```bash
cd /d/syndi_qa
sed -n '355,372p;400,408p;470,478p;598,605p' css/qa.css
sed -n '576,592p;610,616p;636,644p;670,676p' css/sphoto.css
```

Confirme que existem: `.qa-acao-mini` em `.coding .ocr .rt .is .ap .apl .zoom .rotacao
.excluir`; `.qa-miniatura.tem-ocr/.tem-rt/.tem-ap`; `.qa-legenda-cor.rt/.ap`;
`.miniatura.tem-rt/.tem-ap`.

- [ ] **Step 2: Escrever o bloco no fim do `css/syndigo-tema.css`**

Acrescente exatamente isto ao final do arquivo:

```css

/* ============================================================
   Codigos de subpasta — grupo 3

   O overlay original so cobria .coding, porque foi escrito olhando a
   tela de captura do sphoto. Aqui no QA as outras variantes tambem
   renderizam.

   Estas cores NAO sao decoracao: a equipe le a subpasta pela cor. Elas
   tem que continuar mutuamente distinguiveis — se um dia alguem quiser
   "harmonizar" a paleta, e aqui que se quebra a leitura da operacao.
   ============================================================ */

:root{
  --syn-ocr:#7C5CFF;      /* era #6f42c1 */
  --syn-rotacao:#2DD4A7;  /* era #20c997 */
  --syn-apl:#EC4899;      /* era #17a2b8 — colidia com IS, ver abaixo */
}

/* ---- botoes de acao da miniatura ---- */
.qa-acao-mini.rt{border-color:var(--syn-rt);color:var(--syn-rt)}
.qa-acao-mini.is{border-color:var(--syn-is);color:var(--syn-is)}
.qa-acao-mini.ap{border-color:var(--syn-ap);color:var(--syn-ap)}
.qa-acao-mini.coding{border-color:var(--syn-coding);color:var(--syn-coding)}
.qa-acao-mini.ocr{border-color:var(--syn-ocr);color:var(--syn-ocr)}
.qa-acao-mini.rotacao{border-color:var(--syn-rotacao);color:var(--syn-rotacao)}

/* COLISAO 1: .apl usava o literal #17a2b8, exatamente o mesmo valor que
   var(--info) entrega para .is. Dois codigos diferentes, pixel identicos,
   os dois em uso na tela. APL ganha tom proprio. */
.qa-acao-mini.apl{border-color:var(--syn-apl);color:var(--syn-apl)}

/* estado ativo: fundo na cor do codigo, texto escuro por cima */
.qa-acao-mini.coding.ativa{background-color:var(--syn-coding);color:var(--syn-poco)}

/* COLISAO 2: .ocr.ativa era #ffc107, o mesmo amarelo de .coding.ativa.
   OCR ativo e coding ativo ficavam identicos. */
.qa-acao-mini.ocr.ativa{background-color:var(--syn-ocr);color:#FFFFFF}

/* ---- moldura da miniatura no QA ---- */
.qa-miniatura.tem-rt{border-color:var(--syn-rt);box-shadow:0 0 0 2px var(--syn-rt)}
.qa-miniatura.tem-ap{border-color:var(--syn-ap);box-shadow:0 0 0 2px var(--syn-ap)}
.qa-miniatura.tem-ocr{border-color:var(--syn-ocr);box-shadow:0 0 0 2px var(--syn-ocr)}

/* ---- legenda ---- */
.qa-legenda-cor.rt{background-color:var(--syn-rt)}
.qa-legenda-cor.ap{background-color:var(--syn-ap)}

/* ---- miniatura herdada do sphoto.css (7 usos no syndi_qa.html) ---- */
.miniatura.tem-rt{border-color:var(--syn-rt);box-shadow:0 0 0 2px var(--syn-rt)}
.miniatura.tem-ap{border-color:var(--syn-ap);box-shadow:0 0 0 2px var(--syn-ap)}
.miniatura.tem-coding{border-color:var(--syn-coding);box-shadow:0 0 0 2px var(--syn-coding)}
```

- [ ] **Step 3: Conferir que nao entrou regra de layout**

Run:
```bash
cd /d/syndi_qa
sed -n '/Codigos de subpasta/,$p' css/syndigo-tema.css | grep -nE "display|flex|grid|position|padding|margin|width|height|font-"
```
Expected: nenhum resultado.

- [ ] **Step 4: Verificar no navegador — as 7 cores lado a lado**

Servidor em `localhost:3001`, cache desabilitado. Abra `syndi_qa.html`, navegue ate um
GTIN que mostre a fila de miniaturas com os botoes de acao. Screenshot `verif/t3-qa.png`.

Expected, olhando os 7 botoes na mesma tela:

| Codigo | Cor esperada |
|---|---|
| RT | laranja |
| IS | ciano |
| AP | roxo |
| coding | ambar |
| OCR | violeta-azulado |
| rotacao | verde-agua |
| APL | rosa |

**O teste que importa: IS e APL tem que ser obviamente diferentes.** Antes eram
identicos. Se ainda parecerem iguais, o bloco nao pegou.

Clique num botao coding e num OCR para ver o estado `.ativa`: tem que ser ambar e violeta,
nao os dois amarelos.

- [ ] **Step 5: Confirmar arquivos compartilhados intocados**

Run: `git diff --stat`
Expected: so `css/syndigo-tema.css`.

- [ ] **Step 6: Commit**

```bash
cd /d/syndi_qa
git add css/syndigo-tema.css
git commit -m "feat(tema): codigos de subpasta e duas colisoes de cor

O overlay so cobria .coding. Corrige tambem duas colisoes reais: IS e
APL eram o mesmo #17a2b8, e OCR-ativo era o mesmo amarelo de
coding-ativo. Os codigos precisam continuar distinguiveis entre si: a
equipe le a subpasta pela cor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Simbolo Syndigo no header

**Files:**
- Create: `img/syndigo-simbolo.svg` (copia de `css/files/syndigo-simbolo.svg`)
- Modify: `syndi_qa.html:18` (inserir antes)

Nao mexa no `monitor.html`: ele nao tem header, e um card centralizado sem
`.header-title`.

**Interfaces:**
- Consumes: `.logo { height: 32px }`, ja definido em `css/sphoto.css:54`. Nao redefina.
- Produces: nada.

- [ ] **Step 1: Criar `img/` e copiar o simbolo**

A pasta `img/` **nao existe** hoje.

```bash
cd /d/syndi_qa
mkdir -p img
cp css/files/syndigo-simbolo.svg img/syndigo-simbolo.svg
```

- [ ] **Step 2: Conferir que o SVG e local e sem dependencia de rede**

Run: `grep -c "http://\|https://\|@import\|<image" img/syndigo-simbolo.svg`
Expected: `0`

(O `xmlns="http://www.w3.org/2000/svg"` e um identificador de namespace, nao uma
requisicao — se o grep acertar so ele, o resultado sera `1` e esta ok. Qualquer coisa
alem disso e problema.)

Run: `ls -l img/syndigo-simbolo.svg`
Expected: ~565 bytes.

- [ ] **Step 3: Inserir a `<img>` no header**

O `.header-left` hoje esta assim (`syndi_qa.html`, linhas 17-20):

```html
                <div class="header-left">
                    <span class="header-title">Syndi_qa</span>
                    <span v-if="versaoSistema && versaoSistema.ok && versaoSistema.versao && versaoSistema.versao !== 'dev'" class="qa-versao-sistema" :title="(versaoSistema.nome || 'Syndi_qa') + ' ' + versaoSistema.versao + (versaoSistema.data ? ' (' + versaoSistema.data + ')' : '') + (versaoSistema.git ? ' · ' + versaoSistema.git : '')">v{{ versaoSistema.versao }}</span>
                </div>
```

Fica assim — so a linha da `<img>` entra, o resto nao muda um caractere:

```html
                <div class="header-left">
                    <img class="logo" src="img/syndigo-simbolo.svg" alt="Syndigo">
                    <span class="header-title">Syndi_qa</span>
                    <span v-if="versaoSistema && versaoSistema.ok && versaoSistema.versao && versaoSistema.versao !== 'dev'" class="qa-versao-sistema" :title="(versaoSistema.nome || 'Syndi_qa') + ' ' + versaoSistema.versao + (versaoSistema.data ? ' (' + versaoSistema.data + ')' : '') + (versaoSistema.git ? ' · ' + versaoSistema.git : '')">v{{ versaoSistema.versao }}</span>
                </div>
```

Nao escreva `style=` na tag e nao acrescente CSS para `.logo`: o `sphoto.css` ja da
`height:32px` e o `.header-left` ja e `display:flex` com `gap:12px`, entao o simbolo se
posiciona sozinho sem empurrar nada.

- [ ] **Step 4: Verificar no navegador**

Servidor em `localhost:3001`, cache desabilitado, viewport 1600x900.
Screenshot `verif/t4-header.png` de `http://localhost:3001/syndi_qa.html`.

Expected:
- simbolo visivel a esquerda do texto "Syndi_qa", 32px de altura
- console sem 404 para `img/syndigo-simbolo.svg`
- **o `.header-right` (checkbox "Mostrar OS_NONE" e os botoes) na mesma posicao de antes.**
  Compare com `verif/t3-qa.png`: se algo deslocou horizontalmente, o `.logo` esta com
  tamanho errado.
- as abas "Fila de Conferência" / "Agenda de Edição" tambem sem deslocar

- [ ] **Step 5: Verificacao final contra o mockup**

Abra `css/files/syndi-qa-layout.html` (o mockup que veio junto) lado a lado com
`http://localhost:3001/syndi_qa.html`.

Confira, item a item:
- [ ] nenhum residuo cinza-neutro contra o navy
- [ ] hover de primary e success alinhados com os botoes Bootstrap
- [ ] os 7 codigos de subpasta distinguiveis entre si na mesma tela
- [ ] IS e APL visivelmente diferentes
- [ ] logo no header sem deslocar o titulo nem o `.header-right`
- [ ] foco de teclado visivel — navegue a tela inteira so com Tab. A estacao e muito
      usada no teclado; o overlay define `:focus-visible{outline:2px solid #2E8FF5}`.
- [ ] `monitor.html` tambem correto

Divergencias em relacao ao mockup: anote todas no relatorio. Nao "corrija" o mockup e nao
invente cor nova — se algo divergir, e decisao do usuario.

- [ ] **Step 6: Confirmar o escopo total da mudanca**

Run: `git diff --stat HEAD~3`
Expected exatamente estes arquivos, e nenhum outro:
```
 css/syndigo-tema.css   | (novo)
 img/syndigo-simbolo.svg| (novo)
 monitor.html           | 3 +
 syndi_qa.html          | 4 +
```
`css/sphoto.css` e `css/qa.css` **nao podem aparecer**. Nenhum `.js`, nenhum `lib/`.

- [ ] **Step 7: Commit**

```bash
cd /d/syndi_qa
git add img/syndigo-simbolo.svg syndi_qa.html
git commit -m "feat(tema): simbolo Syndigo no header do syndi_qa

SVG local de 565 bytes — a maquina e offline, nada de CDN. Usa o .logo
que ja existia no sphoto.css (32px); o .header-left ja e flex com
gap:12px, entao nada se desloca.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Se algo der errado

| Sintoma | Causa provavel |
|---|---|
| "A correcao nao funcionou" | Cache. **Ctrl+Shift+R.** E a causa em 9 de 10 casos. |
| Tela sem estilo nenhum | Abriu por `file://`. Tem que ser `http://localhost:3001`. |
| Porta 3001 ocupada | Outro pacote sphoto rodando. `netstat -ano \| findstr :3001`. |
| Cor certa no arquivo, errada na tela | Ordem dos `<link>`: o overlay tem que vir por ultimo. |
| Algo deslocou | Entrou regra de layout no overlay. Rode o grep do Step 4 da Task 2. |
| Logo 404 | A pasta `img/` nao existia; confira que o Step 1 da Task 4 rodou. |

**Reverter tudo:** apagar os dois `<link>` de `css/syndigo-tema.css`. O tema antigo volta
inteiro, porque `sphoto.css` e `qa.css` nunca foram tocados.

## Fora de escopo

Aplicar o mesmo tema em `c:\sphoto` e `c:\sphoto-terminais`. O
`css/files/sphoto-syndigo-layout.html` indica que essa e a intencao, mas e trabalho
separado com seu proprio ciclo. **Nao mexa nesses pacotes nesta execucao.**
