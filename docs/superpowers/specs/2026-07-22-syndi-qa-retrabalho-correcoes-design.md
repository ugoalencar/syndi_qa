# Syndi_qa — Parte 1: Correções no Retrabalho

Spec de correção/refinamento sobre a Peça 1 já entregue (`2026-07-21-syndi-qa-retrabalho-design.md`).
Nasceu de feedback de uso real: interface lenta, UX de motivos incômoda, formato de TXT errado
pro fluxo real, e falta a marcação no Redmine.

## 0. Contexto — decomposição maior

Esta spec cobre só a **Parte 1** de 4 partes combinadas com o usuário, nesta ordem:

1. **Parte 1 (esta spec)** — correções no retrabalho já existente: performance, UX de motivos,
   TXT por OS, status Redmine.
2. **Parte 2** — Aprovar GTIN grava Redmine (Situação, Responsável, Quantidades) e envia pra
   edição, portando a lógica que já existe em `c:\sphoto-terminais\lib\qaHub.js`.
3. **Parte 3** — Mecanismo de entrega do TXT de retrabalho pro fotógrafo ("subir" o arquivo pra
   algum lugar que o `sphoto-terminais` consiga buscar). A recepção do lado do `sphoto-terminais`
   fica pra uma atualização posterior, por decisão do usuário.
4. **Parte 4** — Painel "Agenda de Edição" no Syndi_qa: abas por responsável de pós-produção
   (Virafilme/Best Image, Bright River), filtro por período, barra de progresso (verde/amarelo/
   vermelho) até a previsão de entrega.

Cada parte ganha seu próprio plano de implementação quando chegar a vez.

## 1. Escopo desta Parte 1

**Entra:**
- Trocar `GET /api/gtin` de base64-embutido pra URLs individuais de imagem (`GET /api/imagem`)
- Reformular a UX de retrabalho: painel único de motivos abaixo da grade de fotos, refletindo o
  estado da foto ativa (não mais um checkbox+lista por miniatura)
- Trocar a geração do TXT: de "um por GTIN dentro da pasta do GTIN" pra "um por OS, anexado a
  cada retrabalho confirmado, na raiz da pasta da OS dentro de `Retrabalho`"
- Escrever `cf_15 = 24` ("Retrabalho Fotografia") no Redmine ao confirmar retrabalho

**Fica de fora** (Partes 2-4): qualquer escrita no Redmine relacionada a aprovação/edição, o
mecanismo de subir o TXT pro fotógrafo, e o painel de Agenda de Edição.

## 2. Performance — imagens por URL, não base64

**Problema:** `GET /api/gtin` (implementado na Peça 1) lê e converte cada foto pra base64 e
devolve tudo numa única resposta JSON, síncrono. Com fotos reais (vários MB cada), isso trava a
tela até a resposta inteira chegar.

**Correção:**
- `listarImagensGtin` (`lib/qaSyndi.js`) para de ler/converter os bytes — devolve só
  `{ raiz: [{nome}], subpastas: { RT: [{nome}], ... } }`.
- Nova rota `GET /api/imagem?os=&gtin=&nome=` (`server.js`) resolve a pasta do GTIN (mesmo
  `localizarPastaDecoradaPorPrefixo` já usado), monta `path.join(pastaGtinPath, nome)` (`nome`
  pode incluir prefixo de subpasta, ex.: `RT/foto_2.jpg`), aplica a mesma checagem de contenção
  de path já usada no handler estático (`path.resolve` + `startsWith`), e serve os bytes com
  `Content-Type: image/jpeg`.
- Front-end (`js/qa.js`/`qa.html`): cada `<img>` passa a ter
  `src="/api/imagem?os=<os>&gtin=<gtin>&nome=<encodeURIComponent(nome)>"` em vez de
  `data:image/jpeg;base64,...`. O navegador carrega em paralelo e não trava esperando tudo de
  uma vez.
- Sem gerar thumbnail/miniatura reduzida — isso exigiria biblioteca de imagem (fora do escopo,
  quebra a regra de "sem dependência nova"). Fica registrado como possível melhoria futura.

## 3. UX do retrabalho — painel único abaixo do palco

**Problema:** hoje cada miniatura tem seu próprio checkbox "marcar problema" que expande uma
lista de motivos embutida na grade — incômodo com várias fotos.

**Correção:**
- Clicar numa foto define ela como **foto ativa** (estado novo no front-end,
  `fotoAtiva = ref(null)` com o nome relativo da foto).
- Abaixo da grade de fotos (do "palco"), um painel único "Motivos para `<nome da foto ativa>`"
  mostra os checkboxes de motivo, refletindo o que **aquela foto especificamente** já tem
  marcado — vazio se nunca foi marcada, com os motivos já escolhidos se foi.
- Trocar de foto ativa troca o conteúdo do painel pro estado da nova foto (não carrega estado da
  foto anterior).
- Marcar ≥1 motivo é o que define a foto como "marcada pra retrabalho" (substitui o antigo
  checkbox "marcar problema" — não existe mais essa marcação separada dos motivos).
- Cada miniatura da grade ganha um indicador visual (borda colorida) quando já tem motivo
  marcado, pra dar visibilidade do progresso sem precisar abrir o painel de cada uma.
- Continua valendo a regra já existente: "Confirmar Retrabalho" só habilita se toda foto marcada
  tiver pelo menos 1 motivo (validação de front e back já implementada na Peça 1, sem mudança).
- `fotoAtiva` é resetada (volta a `null`, painel some) toda vez que o analista troca de GTIN
  selecionado — mesmo ponto onde `marcadas` já é resetada hoje.

## 4. TXT por OS

**Problema:** hoje é gerado um `retrabalho.txt` por GTIN, dentro da própria pasta do GTIN. O
fluxo real precisa de **um único TXT por OS**, juntando os retrabalhos de todos os GTINs
daquela OS, porque é isso que vai (na Parte 3) ser entregue de volta pro fotógrafo de uma vez.

**Correção:**
- Novo arquivo: `Retrabalho\<pastaOsNome>\Retrabalho_OS_<os>.txt` — na raiz da pasta da OS
  dentro de `Retrabalho`, não mais dentro da pasta do GTIN. `<os>` é só o número (ex.:
  `Retrabalho_OS_49800.txt`), não o nome decorado da pasta.
- Formato: uma linha por foto marcada, `<gtin> - <arquivo>: <motivo1>, <motivo2>`. Exemplo real:

```
7896061302527 - 7896061302527_06_07_2026_11_45_34_0.jpg: desfoque
7896061302527 - 7896061302527_06_07_2026_11_50_02_3.jpg: fundo sujo
7898994680758 - foto_1.jpg: iluminação, enquadramento errado
```

- Quando um GTIN é confirmado pra retrabalho, suas linhas são **anexadas** ao arquivo da OS
  (cria se não existir, `fs.appendFileSync` ou equivalente). Se depois outro GTIN da mesma OS
  também for confirmado, suas linhas entram no mesmo arquivo.
- `gerarConteudoTxt`/a lógica de TXT em `lib/qaSyndi.js` é reescrita pra esse formato — a função
  antiga (um TXT por GTIN com cabeçalho `GTIN:`/`Data:`) é substituída, não fica em paralelo.
- `retrabalharGtin` continua movendo a pasta inteira do GTIN pra `Retrabalho\<pastaOsNome>\<gtin>\`
  (sem mudança nessa parte) — só a geração do TXT muda de lugar e formato.

## 5. Redmine — marca "Retrabalho Fotografia"

**Novo módulo `lib/redmine.js`**, seguindo o mesmo padrão já usado em `c:\sphoto\lib\qaHub.js`:

- `redmine-config.json` na raiz do projeto — gitignored, formato `{ "baseUrl": "...", "apiKey": "..." }`,
  mesmo padrão do sphoto. Populado inicialmente com a mesma URL/chave que o sphoto já usa hoje
  (mesmo Redmine da empresa). **Nota registrada:** o usuário sinalizou que no futuro isso deve
  virar credencial por analista, não uma chave compartilhada — fora de escopo desta Parte 1.
- `buscarIssueAbertaPorGtin(gtin)` — `GET /issues.json?cf_1=<gtin>&status_id=open&tracker_id=2&limit=5`,
  devolve a primeira issue aberta ou `null`.
- `escreverCampoRedmine(issueId, campoId, valor)` — `PUT /issues/:id.json` com
  `{ issue: { custom_fields: [{ id: campoId, value: valor }] } }`.
- `cf_15` (Situação das Imagens) = `24` ("Retrabalho Fotografia") é o valor a escrever — confirmado
  na lista de opções do campo (`c:\sphoto\redmine-campos.json`).

**Onde entra no fluxo:** `POST /api/retrabalho` (`server.js`), depois que o move de pasta + TXT
já tiverem sido feitos com sucesso, tenta buscar a issue do GTIN e gravar `cf_15=24`. Falha na
parte do Redmine (rede fora, GTIN sem ficha aberta, etc.) **não desfaz** o move nem o TXT — a
resposta da rota volta com `redmineOk:false, redmineError:'...'` pro front-end avisar o analista,
mesmo princípio que o `qaHub.js` do sphoto já usa ("falha aqui não derruba o retorno, só loga/avisa").

## 6. Testes

- `lib/qaSyndi.js`: continua em `node:test` com pastas temporárias — testa a nova lógica de
  append/criação do `Retrabalho_OS_<os>.txt`, incluindo o cenário de dois GTINs diferentes
  anexando no mesmo arquivo.
- `lib/redmine.js`: chamadas de rede reais não entram em teste automatizado — mesmo padrão do
  sphoto (que também não testa isso automatizado). Verificação manual contra o Redmine real na
  hora da implementação.
- `GET /api/imagem`: verificação manual (curl), reaproveitando o mesmo roteiro de teste de
  path-traversal já usado pro handler estático na Peça 1.
