# Syndi_qa — Sub-projeto 2: Envio pra Edição (Responsável + Quantidades)

Spec do próximo sub-projeto na decomposição do "portar o QA Hub do sphoto" combinada com o
usuário. Nasceu de feedback de uso real: faltava a parte de gravar quem é o responsável de
pós-produção e quantas fotos vão pra Recorte/Mockup — o robô automático **não** grava isso
sozinho (confirmado lendo `C:\Apps\SyncIMGSend\SYNCIMG_SEND_IMAGES.json` e `_NOVO.json`: ele só
grava Situação, Data de Envio e Quantidade Total genérica).

## 0. Contexto — decomposição maior

Terceiro sub-projeto da decomposição "portar QA Hub do sphoto" (depois de Peça 1/correções e do
sub-projeto 1 de tagging+zoom, já mergeados). Ordem combinada com o usuário:

1. **Este spec** — formulário de Responsável/Quantidade ao aprovar.
2. Aba "Agenda de Edição" (filtros por responsável + período + barra de progresso) — próximo.
3. Scripts operacionais (iniciar/parar/monitor).
4. Mecanismo de entrega do TXT de retrabalho pro fotógrafo.

## 1. O que já existe e não muda

- **Aprovar** hoje só move a pasta do GTIN pra `AgEnvio` — o robô detecta o arquivo e grava
  Situação="Aguardando Edição" + Data de Envio + Quantidade Total sozinho. **Isso continua
  assim** — o Syndi_qa nunca escreve `Situação das Imagens` (cf_15), single-owner do robô.
- Mockup/Recorte (subpasta-sinal) e `_coding` (sufixo de nome) já existem (sub-projeto anterior)
  — a inferência desta spec **lê** essas marcações, não cria mecanismo novo pra elas.

## 2. Escopo desta spec

**Entra:**
- Ao clicar "Aprovar GTIN", abre um formulário com Responsável Pós-Produção + Qtd Recorte +
  Qtd Mockup pré-preenchidos por inferência, editáveis.
- "Confirmar e Enviar" grava esses 3 campos no Redmine e só depois move a pasta.
- Casos ambíguos ficam com campos vazios pro analista preencher na mão.

**Fica de fora:**
- Qualquer escrita de `Situação das Imagens` (cf_15) — continua sendo do robô.
- Detecção de conflito otimista (comparar `updated_on` da issue) — decisão deliberada, ver
  seção 5.
- Agenda de Edição, scripts operacionais, entrega do TXT — sub-projetos seguintes.

## 3. Inferência — portada de `inferirCampos` do sphoto

Fonte: `c:\sphoto\lib\qaHub.js` (`inferirCampos`, `detectarSubpastasDestino`, `listarJpgsRaiz`,
`temSufixo`). Regras (só fotos da **raiz** contam — RT/IS/AP nunca contam):

- Ambas `Mockup` e `Recorte` marcadas → indefinido (conflito), campos vazios.
- Só `Mockup` marcada:
  - Se todas as fotos da raiz forem `_coding` → indefinido (nenhuma foto de produto).
  - Senão → Responsável = Virafilme(Best Image) (opção `32`), Qtd Mockup = contagem de fotos
    da raiz sem `_coding`.
- Só `Recorte` marcada: mesma lógica, Responsável = Bright River (opção `258`), Qtd Recorte.
- Nenhuma marcada, mas existe pelo menos 1 foto `_coding` na raiz: mesmo cálculo de Recorte
  (fallback do sphoto — meio caminho andado, mas sem certeza, então cai em Recorte/Bright River
  por padrão, o campo continua editável).
- Nenhuma marcada e nenhuma `_coding`: indefinido, sem sinal nenhum.

**Diferença do sphoto:** a função original também inclui `Situação das Imagens` no objeto de
campos sugeridos — a versão do Syndi_qa **não inclui esse campo**, porque não escrevemos nele.

## 4. Backend

- `lib/qaSyndi.js`: nova `inferirCamposEdicao(pastaGtinPath)` → `{ destino, motivo, campos }`
  (mesmo formato de retorno do sphoto, sem `SITUACAO_IMAGENS` em `campos`). Reaproveita/expõe
  `listarJpgsRaiz`/`temSufixo` como funções internas (extraídas da lógica já existente onde
  fizer sentido).
- `lib/redmine.js`: nova função que grava os 3 campos (Responsável cf_23, Qtd Recorte cf_176,
  Qtd Mockup cf_175) numa issue, reaproveitando `escreverCampoRedmine` (já existe, um campo por
  vez, ou uma variante que aceita vários custom_fields num PUT só — decisão de implementação,
  qualquer uma serve). Reaproveita `buscarIssueAbertaPorGtin` (já existe) pra achar a issue.
- Novo arquivo `redmine-campos.json` na raiz do projeto — cópia do `c:\sphoto\redmine-campos.json`
  (mapa de custom_fields/opções, sem segredo nenhum, servido estático como o sphoto já faz).
- `POST /api/aprovar` muda de contrato: passa a aceitar `{ os, gtin, responsavel, qtdRecorte,
  qtdMockup }` no corpo — grava os 3 campos no Redmine (se algum vier vazio, não grava esse
  campo específico) e só então move a pasta. Falha ao gravar no Redmine **impede** o aprovar
  (diferente do retrabalho) — aqui faz sentido bloquear, porque sem Responsável/Quantidade
  corretos o editor não sabe o que fazer com o material.
- Nova rota `GET /api/aprovar/preparar?os=&gtin=` → devolve os campos inferidos (via
  `inferirCamposEdicao`) pro formulário pré-preencher.

## 5. Simplificação deliberada — sem detecção de conflito

O sphoto compara `issue.updated_on` capturado quando a tela abriu com o valor atual no momento
de confirmar, e bloqueia com um aviso "a ficha foi alterada" se divergir, pedindo confirmação
extra pra sobrescrever. **Não portado nesta spec** — Syndi_qa é ferramenta de analista único
(uso remoto/home-office), risco de edição concorrente da mesma ficha é baixo, e a complexidade
extra (estado de conflito, botão "enviar mesmo assim", nova mensagem de erro) não se paga agora.
Registrado como melhoria futura caso o Syndi_qa vire ferramenta multi-analista.

## 6. Front-end

- Clicar "Aprovar GTIN" não move a pasta na hora — chama `GET /api/aprovar/preparar`, abre um
  painel/formulário (mesma área onde hoje fica o botão, ou um painel novo acima dele) com:
  - Select "Responsável Pós-Produção" (opções carregadas de `redmine-campos.json`, campo `cf_23`)
  - Input numérico "Qtd Recorte"
  - Input numérico "Qtd Mockup"
  - Todos pré-preenchidos pelo retorno de `/api/aprovar/preparar`
- Botão "Confirmar e Enviar" dentro desse painel dispara o `POST /api/aprovar` com os valores
  (editados ou não), tratando sucesso/erro como hoje (mensagem, recarrega fila).
- Botão "Cancelar" fecha o painel sem mover nada.

## 7. Testes

- `lib/qaSyndi.js`: `inferirCamposEdicao` em `node:test` com pastas temporárias — cobre os 5
  casos da seção 3 (Mockup puro, Recorte puro, ambos, nenhum+coding, nenhum sem coding).
- `lib/redmine.js`: só a parte de montar o payload é testável sem rede; a chamada real fica
  como verificação manual (mesmo padrão já usado no projeto).
- `server.js`: rotas verificadas manualmente via curl, incluindo o caso "falha ao gravar Redmine
  bloqueia o aprovar" (diferente do retrabalho, que segue mesmo com falha).
