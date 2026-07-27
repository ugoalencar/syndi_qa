# Syndi_qa — Sub-projeto 4: Aba "QA para Edição"

Nasceu de um gap encontrado pelo usuário: o pedido original de "portar o QA Hub do sphoto por
inteiro" (que gerou o Sub-projeto 1, tagging+zoom) deixou de fora a aba fixa "QA para Edição" que
o `c:\sphoto-terminais\qa.html` tem — uma tela sempre acessível (não um painel que só abre ao
clicar Aprovar) pra ver/editar os campos do Redmine, incluindo **Situação das Imagens (cf_15)**,
que o Syndi_qa até agora nunca escrevia fora do fluxo de retrabalho.

## 0. Contexto — decomposição maior

1. Peça 1 + correções — retrabalho (mergeado).
2. Sub-projeto 1 — tagging RT/IS/AP/`_coding`/Mockup-Recorte + zoom (mergeado).
3. Sub-projeto 2 — envio pra edição, Responsável/Quantidade via painel do Aprovar (mergeado).
4. Sub-projeto 3 — Agenda de Edição (mergeado).
5. **Este spec** — aba fixa "QA para Edição".
6. Scripts operacionais (iniciar/parar/monitor/diagnostico) — em andamento em paralelo, spec
   próprio (retomado depois deste).
7. Mecanismo de entrega do TXT de retrabalho pro fotógrafo — depois.

## 1. Decisões confirmadas com o usuário

- **Situação das Imagens (cf_15) passa a ser editável nesta aba nova**, ao contrário do painel do
  Aprovar (que nunca grava cf_15, decisão que continua valendo só ali). O robô `syncIMG.jar` grava
  cf_15 como efeito colateral de mover a pasta (não lê cf_15 como condição pra agir — ver
  `syncimgsend_robot_infra.md`), então editar aqui **não quebra o robô**, mas o valor pode ser
  **sobrescrito automaticamente em seguida** se uma pasta for movida logo depois. A tela mostra um
  aviso disso.
- **Formato: aba fixa**, ao lado de "QA de Foto", dentro do detalhe do GTIN selecionado — igual ao
  sphoto (`abaAtiva === 'edicao'`), não um painel que abre e fecha.
- **Sem detecção de conflito otimista** (o sphoto compara `updated_on` e avisa se a ficha mudou
  desde que a tela abriu). Fica de fora — ferramenta de 1 analista só, mesma lógica já aplicada ao
  painel do Aprovar.
- **Paralela e independente do Aprovar**, não uma unificação. O Aprovar continua exatamente como
  está hoje (move a pasta pra `AgEnvio` + grava Responsável/Qtd, sem tocar em Situação) — zero
  mudança nesse código já mergeado. A aba nova é uma ferramenta a parte: vê/edita os 4 campos a
  qualquer momento, pra qualquer GTIN (antes ou depois do Aprovar), **nunca move pasta**.

## 2. Campos da aba (mesmos 4 do sphoto)

| Campo | cf_id | Sugestão automática? |
|---|---|---|
| Situação das Imagens | 15 | Não — só reflete o valor atual do Redmine (ou vazio) |
| Responsável Pós-Produção | 23 | Sim — via `inferirCamposEdicao` (Mockup/Recorte) |
| Qtd Imagens Recorte | 176 | Sim — via `inferirCamposEdicao` |
| Qtd Imagens Mockup | 175 | Sim — via `inferirCamposEdicao` |

Cada campo mostra um badge de origem: **"manual"** (valor já existe no Redmine, ou o analista
editou nesta sessão) ou **"inferido"** (sugestão automática, ainda não confirmada) — mesma
semântica e nomenclatura do sphoto (`origemCampo`), pra manter paridade visual.

## 3. Backend

### `lib/redmine.js`

- `buscarDetalheEdicao(basePath, gtin)` — busca a issue aberta do GTIN (reaproveita
  `buscarIssueAbertaPorGtin`) e devolve `{ issue: { id, updatedOn, customFields: { '15', '23',
  '175', '176' } } | null }`. Só leitura.
- `gravarCamposEdicaoCompleto(basePath, gtin, campos)` — `campos = { situacao, responsavel,
  qtdRecorte, qtdMockup }`, todos opcionais (string vazia = não grava aquele campo, mesma regra
  de `montarCamposEdicao`). **Diferente de `gravarCamposEdicao` (usada pelo Aprovar): esta INCLUI
  cf_15.** Função nova e separada — não altera `gravarCamposEdicao` nem seu contrato, pra não
  arriscar regressão no fluxo do Aprovar já mergeado. Mesmo padrão de erro: lança se não achar
  issue aberta ou o PUT falhar; se todos os campos vierem vazios, devolve `{ gravado: false }` sem
  tocar na rede.

### `server.js`

- `GET /api/edicao/detalhe?os=&gtin=` — localiza a pasta do GTIN (mesmo padrão dos outros
  endpoints, `localizarPastaDecoradaPorPrefixo`), chama `buscarDetalheEdicao` e
  `qaSyndi.inferirCamposEdicao` na pasta, devolve `{ ok, issue: {...} | null, sugeridos: {
  responsavel, qtdRecorte, qtdMockup } }`. Só leitura, nenhum campo de Situação sugerido.
- `POST /api/edicao/gravar` — body `{ os, gtin, situacao, responsavel, qtdRecorte, qtdMockup }`,
  valida os 3 campos numéricos com `/^\d*$/` (mesma regra do `/api/aprovar`), `situacao` só
  precisa ser uma string (id do cf_15, validado pelo Redmine mesmo se inválido). Chama
  `gravarCamposEdicaoCompleto`, devolve `{ ok, gravado, issueId }` ou erro. **Nunca move pasta.**

## 4. Front-end

- `js/qa.js`: novo estado `abaDetalhe` (`'foto' | 'edicao'`), resetado pra `'foto'` em
  `selecionarGtin`. `camposEdicao` (reactive, chaves `'15'|'23'|'175'|'176'`) e
  `origemCampoEdicao` (reactive, mesmas chaves, valores `'manual'|'inferido'`).
- `carregarDetalheEdicao()` — chamado na primeira vez que a aba "QA para Edição" abre pra aquele
  GTIN (lazy, mesmo princípio da Agenda de Edição — evita round-trip ao Redmine se o analista
  nunca abrir a aba). Aplica: se `issue.customFields[id]` existir, usa esse valor com origem
  `'manual'`; senão, pro id 23/175/176, usa `sugeridos[id]` com origem `'inferido'`; pro id 15,
  fica vazio com origem `'inferido'` se não houver valor no Redmine (sem sugestão automática,
  igual ao sphoto). Campos já marcados `'manual'` nesta sessão (o analista editou) não são
  sobrescritos por uma recarga.
- `marcarTocadoEdicao(id)` — chamado no `@change`/`@input` de cada campo, marca origem `'manual'`.
- `confirmarEnvioEdicao()` — `POST /api/edicao/gravar` com os 4 campos, trata sucesso (mensagem) e
  erro (mensagem), sem mover nada.
- `opcoesSituacao` (novo `ref({})`, análogo ao `opcoesResponsavel` já existente) — carregado de
  `redmine-campos.json` (`cf_15.opcoes`), servido estático, já usado como referência pelo select.
- `syndi_qa.html`: dentro do detalhe do GTIN selecionado, replica a estrutura de abas do sphoto
  (`qa-tab-btn`, classes `qa-campo-linha`/`qa-campo-origem` já existem em `css/qa.css` — herdadas
  do asset-copy do Sub-projeto 1, hoje sem uso, servem exatamente pra isso). Aviso fixo junto ao
  select de Situação: *"O robô syncIMG.jar também grava este campo ao mover a pasta — se você
  alterar aqui, pode ser sobrescrito automaticamente em seguida."*

## 5. O que fica de fora

- Detecção de conflito otimista (`updated_on`) — decisão confirmada, revisitar só se o Syndi_qa
  virar ferramenta multi-analista.
- Qualquer mudança no fluxo do Aprovar (`aprovarGtin`, painel `painelEnvio`, rota
  `/api/aprovar*`) — continuam intocados.
- Sugestão automática pro campo Situação — sempre em branco ou o valor atual do Redmine, nunca
  inferido da pasta (mesmo comportamento do sphoto).

## 6. Testes

- `buscarDetalheEdicao`/`gravarCamposEdicaoCompleto` (`lib/redmine.js`): sem teste automatizado
  (rede real), mesmo padrão já usado no arquivo — verificação manual via `node -e` contra o
  Redmine real, sem imprimir a API key.
- `GET /api/edicao/detalhe` / `POST /api/edicao/gravar`: verificação manual via curl.
- Nenhuma lógica pura nova em `lib/qaSyndi.js` (reaproveita `inferirCamposEdicao`, já testado) —
  não precisa de novos testes de unidade nesse arquivo.
