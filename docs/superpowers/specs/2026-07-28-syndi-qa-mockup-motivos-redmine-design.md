# Syndi_qa — Sub-projeto: Mockup (número + orientações) e motivos de retrabalho espelhando o Redmine

Dois ajustes na tela QA de Foto, pedidos juntos pelo usuário mas independentes entre si: (1) os
motivos de retrabalho, hoje um arquivo JSON local com 9 opções genéricas, passam a espelhar as
opções reais já cadastradas no Redmine (`cf_187`); (2) marcar destino "Mockup" num GTIN passa a
exigir um número de identificação do mockup do repositório da empresa, com uma lista opcional de
orientações pro editor — mecanismo próprio, sem nenhuma comunicação com o Redmine.

## 0. Contexto — decomposição maior

1-10. (ver specs anteriores, todos mergeados: retrabalho, tagging+zoom, envio-edição, Agenda de
Edição, aba QA para Edição, scripts operacionais, correções QA de Foto/QA para Edição, correção
de `/api/imagem`, preview reduzido de imagens, identidade do analista.)
11. **Este spec** — mockup (número + orientações) e motivos de retrabalho espelhando o Redmine.
12. Spec irmã, mesmo pedido do usuário — aba QA para Edição ganha 2 campos novos
    (`2026-07-28-syndi-qa-campos-edicao-3check-design.md`), tratada separadamente.

## 1. Decisões confirmadas com o usuário

- **Consulta viva ao Redmine testada e descartada por ora**: `GET /custom_fields.json` (o único
  endpoint do Redmine que expõe as opções de um custom field) exige o papel global "Redmine
  Administrator" — testado ao vivo com a chave normal do projeto (`redmine-config.json`) E com uma
  chave admin que o usuário forneceu depois; as duas devolveram `403`. Sem uma chave com esse
  papel confirmada, a consulta automática fica fora de escopo por ora (pode ser revisitada depois
  se o usuário conseguir uma chave que funcione — nada no design abaixo impede isso no futuro).
  Uma chave `REDMINE_ADMIN_API_KEY` já foi deixada num `.env` na raiz do projeto (gitignored) pelo
  usuário — não é usada neste spec, fica disponível pra quando/se a permissão for resolvida.
- **Motivos de retrabalho passam a espelhar manualmente as opções reais do Redmine**: o custom
  field `cf_187` "Motivo Retrabalho Fotografia" já tem 4 opções cadastradas lá — "Fotografia
  tremida", "Falta Fotografia", "Iluminação / Cor", "Angulação errada" (confirmado via
  `redmine-campos.json`, o cache manual já extraído desse campo). `motivos-retrabalho.json` (hoje
  com 9 opções genéricas, sem relação com o Redmine) passa a conter essas 4 opções reais. Quando o
  usuário pedir pro time do Redmine cadastrar novas opções lá, alguém atualiza esse arquivo à mão
  — mesmo processo manual já usado hoje pras outras listas de opções do projeto (`redmine-campos.json`
  pro Responsável Pós-Produção, Situação, etc.), não é uma regressão em relação ao padrão
  existente.
- **Mockup ganha número (texto livre, obrigatório) e orientações (lista de múltipla escolha,
  opcional)** — aparecem no painel "Enviar para Edição" quando o destino do GTIN é "Mockup"
  (`detalhe.imagens.destino === 'Mockup'`, o botão que já existe hoje).
- **Orientações são um mecanismo próprio, sem nenhuma comunicação com o Redmine** — vêm de um
  arquivo JSON local novo (`orientacoes-mockup.json`), só pra informar o editor, nunca gravado lá.
- **Entrega ao editor**: como as fotos de um GTIN aprovado com destino Mockup já vão pra `AgEnvio`
  no fluxo normal de Aprovar, o número + orientações viram um TXT gravado **dentro da própria
  pasta do GTIN**, que segue junto com as fotos (diferente do retrabalho, que só manda um TXT
  porque as fotos já estão de volta com o fotógrafo — aqui as imagens SÃO enviadas, o TXT só vai
  junto).

## 2. Motivos de retrabalho — atualização de conteúdo (sem mudança de código)

- `motivos-retrabalho.json` passa a conter as 4 opções reais do `cf_187`, substituindo as 9
  opções genéricas de hoje:
  ```json
  [
      "Fotografia tremida",
      "Falta Fotografia",
      "Iluminação / Cor",
      "Angulação errada"
  ]
  ```
- Nenhum código muda — `lib/qaSyndi.js` (`carregarMotivos`), `server.js` (`GET /api/motivos`) e o
  front-end já leem esse arquivo e exibem seu conteúdo como está; só o conteúdo do arquivo muda.
  Quando o usuário pedir pro time do Redmine cadastrar opções novas lá, alguém edita esse arquivo
  à mão pra manter os dois em sincronia — mesmo processo manual já usado hoje pras outras listas
  do projeto.

## 3. Mockup — número e orientações

- **Arquivo novo `orientacoes-mockup.json`** (raiz do projeto, versionado — mesmo padrão de
  `motivos-retrabalho.json`): array de strings, conteúdo inicial:
  ```json
  [
      "Usar mockup na cor original",
      "Manter fundo transparente",
      "Aplicar sombra suave",
      "Ajustar proporção pro padrão do mockup"
  ]
  ```
  (lista de exemplo pra começar — o usuário edita o arquivo depois com as orientações reais, sem
  precisar de nenhum código novo pra isso).
- `lib/qaSyndi.js` ganha `carregarOrientacoesMockup(basePath)` — mesmo formato/fallback de
  `carregarMotivos` (lê o JSON, cai numa lista embutida pequena se faltar/corromper).
- `server.js` ganha `GET /api/orientacoes-mockup` — devolve o array, sem toque em rede (só disco,
  sem consulta ao Redmine).
- `js/qa.js`: novo estado `orientacoesMockup = ref([])` (carregado uma vez, mesmo padrão de
  `motivos`/`carregarMotivosDisponiveis`), `formEnvio.numeroMockup = ''`,
  `formEnvio.orientacoesMockup = []` (array de strings marcadas, reactive).
- `syndi_qa.html`: dentro do painel `qa-editadas-recebidas` (o painel "Enviar para Edição"), logo
  depois do campo "Qtd Imagens Mockup", um bloco `v-if="detalhe.imagens.destino === 'Mockup'"`
  com:
  - `<input type="text">` pra `formEnvio.numeroMockup`, label "Número do Mockup".
  - Um painel de checkboxes reaproveitando a MESMA classe CSS do painel de motivos
    (`.qa-motivos-painel`/`.qa-motivos`/`.qa-motivo-item`), populado por `orientacoesMockup`,
    marcando/desmarcando em `formEnvio.orientacoesMockup` (toggle simples, mesmo padrão de
    `togglarMotivoAtivo` mas local ao `formEnvio`, sem ida ao servidor).
- **Validação obrigatória do número**: `aprovarGtin` (front) bloqueia (mensagem de erro, mesmo
  padrão dos outros bloqueios) se `detalhe.imagens.destino === 'Mockup'` e
  `formEnvio.numeroMockup` estiver vazio — sem chamar a API. `server.js` valida de novo do lado do
  servidor (defesa em profundidade, mesmo princípio da identidade): se o GTIN tem destino Mockup
  (o servidor já sabe ler isso do disco, mesma checagem que `inferirCamposEdicao` já faz) e
  `numeroMockup` vier vazio no corpo, responde `400`.
- **Geração do TXT**: `lib/qaSyndi.js` ganha `gravarTxtMockup(pastaGtinPath, gtin, numeroMockup,
  orientacoes)` — escreve `Mockup_<gtin>.txt` dentro de `pastaGtinPath` (a pasta do GTIN, ainda em
  `AgConferencia`, ANTES do move), formato:
  ```
  GTIN: <gtin>
  Numero do Mockup: <numeroMockup>
  Orientacoes:
  - <orientacao 1>
  - <orientacao 2>
  ```
  (bloco "Orientacoes:" omitido inteiramente se a lista vier vazia — orientação é opcional).
  `aprovarGtin(agConferenciaDir, agEnvioDir, pastaOsNome, pastaGtinNome, mockupInfo)` ganha um 5º
  parâmetro opcional `mockupInfo` (`{numero, orientacoes} | null`) — se presente, chama
  `gravarTxtMockup` ANTES de `moverPasta`, pra o TXT já existir dentro da pasta no momento do
  move (assim ele viaja junto pra `AgEnvio` automaticamente, sem lógica extra de mover ele
  separado). `server.js` (rota `POST /api/aprovar`) monta esse `mockupInfo` a partir do corpo da
  requisição (`numeroMockup`/`orientacoesMockup`, enviados pelo front) só quando o destino do
  GTIN lido do disco for `'Mockup'` — nos demais casos passa `null`, sem mudar o comportamento
  atual de `aprovarGtin` pra GTINs sem destino Mockup.

## 4. O que fica de fora

- Editar/gerenciar a lista de orientações pela própria tela (fica só no JSON versionado, editado
  manualmente por quem tem acesso ao repositório — mesmo padrão de `motivos-retrabalho.json`).
- Qualquer validação de que o "número do mockup" digitado realmente existe no repositório de
  mockups da empresa — é um campo de texto livre, sem checagem cruzada.
- Consulta viva ao Redmine pra motivos de retrabalho — descartada por ora (seção 1), fica pra um
  spec futuro se uma chave com permissão de admin global for providenciada.

## 5. Testes

- Motivos de retrabalho: nenhum teste novo — é só o conteúdo do arquivo `motivos-retrabalho.json`
  mudando, a cobertura existente (`lib/qaSyndi.test.js`, `carregarMotivos`) já garante o
  comportamento de leitura/fallback.
- `lib/qaSyndi.js`: `gravarTxtMockup` — gera o arquivo com o conteúdo esperado (com e sem
  orientações); `aprovarGtin` com `mockupInfo` cria o TXT antes do move (confirmar que ele existe
  no destino depois).
- Front-end: verificação manual — marcar destino Mockup mostra os 2 campos novos; tentar aprovar
  sem número mostra o bloqueio; aprovar com número + orientações marcadas gera o TXT esperado
  dentro da pasta em `AgEnvio`.
