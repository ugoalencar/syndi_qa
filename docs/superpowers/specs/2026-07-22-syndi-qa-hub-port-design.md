# Syndi_qa — Sub-projeto 1: Portar o QA Hub do sphoto (tagging + zoom)

Spec de re-arquitetura: o Syndi_qa deixa de ser um app minimalista construído do zero e passa
a ser uma **extensão do QA Hub do sphoto** — mesmo código-base, mesmos padrões visuais e de
interação, adaptado pro endereçamento próprio do Syndi_qa (`C:\Apps\SyncIMGSend\AgConferencia`
em vez de `Finalizadas\OS_x\gtin`). Mantém a regra "sem build, sem dependência nova" do
sphoto, já seguida até aqui.

## 0. Contexto — por que essa mudança

O prompt original (`prompt_sistema_qa.md`) descrevia o Syndi_qa como módulo "independente" do
sphoto. Na prática, o usuário quer o oposto: reaproveitar ao máximo o QA Hub já existente e
validado em produção (sphoto/sphoto-terminais), com o Syndi_qa entrando como mais uma "casca"
sobre o mesmo padrão de interface — só troca o endereço de onde lê/escreve.

**Decomposição maior** (3 sub-projetos sequenciais, este é o primeiro):
1. **Este spec** — renomear `qa.html`→`syndi_qa.html`, portar tagging (RT/IS/AP, `_coding`,
   Mockup/Recorte) e zoom de miniatura.
2. Aba "Agenda de Edição" com filtros por responsável + período + barra de progresso.
3. Scripts operacionais: iniciar-server (loop+logs), parar, monitor.html — adaptado pra 1
   processo só (Syndi_qa não tem câmera nem plataforma Java).

## 1. O que já existe e não muda

O ciclo Aprovar/Retrabalho (Peça 1 + correções) já está correto e **não é tocado**:
- **Aprovar** → move a pasta inteira do GTIN pra `AgEnvio`. O robô `SyncIMGSend` já existente
  detecta o arquivo e atualiza o Redmine sozinho (nenhuma escrita nossa necessária aqui).
- **Retrabalho** → move a pasta inteira pra `Retrabalho`, gera/anexa `Retrabalho_OS_<os>.txt`,
  e o Syndi_qa escreve `cf_15=24` ("Retrabalho Fotografia") no Redmine via `lib/redmine.js`
  (território novo, sem robô automático olhando essa pasta ainda).

Os botões "Finalizar"/"Enviar pra Conferência" e a aba "QA para Edição" (formulário
Situação/Responsável/Quantidade) do sphoto **não são portados** — eles alimentam o
`AgConferencia`, que é de onde o Syndi_qa já lê; portá-los duplicaria a automação que o robô já
faz sozinho.

## 2. Escopo desta spec

**Entra:**
- Renomear `qa.html` → `syndi_qa.html` (título, referências)
- RT/IS/AP: mover foto pra subpasta (toggle), reaproveitando o botão por miniatura do sphoto
- `_coding`: marcar/desmarcar sufixo no nome do arquivo
- Mockup/Recorte: marcar/desmarcar pasta-sinal (tipo de pós-produção do GTIN)
- Zoom de miniatura: modal em tela cheia com navegação por seta/teclado, botão de lupa
  dedicado (não conflita com o clique que seleciona foto pro retrabalho)

**Fica de fora**: Agenda de Edição (sub-projeto 2), scripts operacionais (sub-projeto 3).

## 3. Simplificação em relação ao sphoto

O sphoto pareia JPG+RAW (`paresNaPasta`/`nomeBase`) em toda ação de tagging, porque tem os dois
arquivos por foto. O Syndi_qa só tem JPEG (as fotos já passaram pelo tratamento do fotógrafo) —
então a lógica portada **não precisa de pareamento**: move/renomeia um arquivo só por vez.

## 4. Backend (`lib/qaSyndi.js` + `server.js`)

- Nova constante `SUBPASTAS_DESTINO = ['Mockup', 'Recorte']` (ao lado de `SUBPASTAS_TAG` já
  existente).
- `moverParaSubpastaSyndi(pastaGtinPath, nomeArquivo, pasta)` — toggle: se o arquivo já está na
  subpasta `pasta`, volta pra raiz; senão, move da raiz (ou de outra subpasta de tag) pra lá.
  Adaptado de `moverParaSubpasta` do sphoto, sem a lógica de pares.
- `toggleCodingSyndi(pastaGtinPath, nomeArquivo)` — adiciona ou remove o sufixo `_coding` do
  nome do arquivo (antes da extensão). Adaptado de `handleMarcarQa`.
- `marcarDestinoSyndi(pastaGtinPath, tipo)` — cria a subpasta-sinal `Mockup` ou `Recorte`
  (vazia, só a existência importa) e remove a outra se estiver vazia; `tipo: null` desmarca as
  duas. Idêntico a `handleMarcarDestino` do sphoto.
- `listarImagensGtin` passa a incluir `destino: 'Mockup' | 'Recorte' | null` no retorno
  (checagem de existência das duas subpastas-sinal, sem listar arquivo nenhum delas).
- Rotas novas em `server.js`: `POST /api/tag-subpasta`, `POST /api/marcar-coding`,
  `POST /api/marcar-destino` — mesmo padrão de validação (`isNomeSeguro`,
  `localizarPastaDecoradaPorPrefixo`) das rotas já existentes.

## 5. Front-end (`syndi_qa.html` + `js/qa.js`)

- Legenda acima da grade (`_coding` / RT / IS / AP), mesmo texto/cores do sphoto.
- Seletor "Tipo de pós-produção" (botões Mockup/Recorte) acima da grade, refletindo
  `detalhe.destino`.
- Por miniatura: botões `C` / `RT` / `IS` / `AP` (classe `qa-acao-mini`, mesmo padrão visual do
  sphoto), ao lado (não em cima) da área que já seleciona a foto pro painel de retrabalho.
- `toggleCoding(nome)`, `toggleSubpasta(nome, pasta)`, `marcarDestinoManual(tipo)` em
  `js/qa.js`, chamando as 3 rotas novas e recarregando o detalhe do GTIN depois.

## 6. Zoom de miniatura

- Botão de lupa dedicado por miniatura (ícone `bi-zoom-in`, ao lado dos botões de tag) — **não**
  o clique na imagem em si, que continua selecionando a foto pro painel de retrabalho.
- Reaproveita o modal em tela cheia do sphoto (`#modalImagem`, Bootstrap, já carregado via
  `js/bootstrap.bundle.min.js`): `ampliarImagem(nome, lista)` guarda a imagem atual e a lista de
  onde ela veio (raiz ou a subpasta específica), `navegarAmpliada(delta)` troca dentro dessa
  mesma lista.
- Setas de teclado (`ArrowLeft`/`ArrowRight`) navegam enquanto o modal está aberto, mesmo
  comportamento do sphoto.
- A imagem exibida usa `urlImagem(nome)` (já existe, Peça 1 correções) — não base64.

## 7. Testes

- Funções novas de `lib/qaSyndi.js` (`moverParaSubpastaSyndi`, `toggleCodingSyndi`,
  `marcarDestinoSyndi`) em `node:test` com pastas temporárias — mesmo padrão já usado no
  projeto.
- Rotas HTTP novas verificadas manualmente via curl — mesmo padrão já usado (esta máquina tem
  sphoto de produção real na porta 3000; testes manuais sempre em outra porta).
- Verificação visual via Playwright: tagging não quebra o fluxo de Aprovar/Retrabalho já
  existente; zoom abre/navega/fecha sem interferir na seleção de foto pro retrabalho.
