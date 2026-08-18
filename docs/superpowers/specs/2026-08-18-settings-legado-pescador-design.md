# Settings de caminhos + Pescador de GTIN + Legado

Data: 2026-08-18

## Contexto

O fluxo de OS_NONE hoje depende de `AgConferencia\OS_NONE`, uma subpasta derivada de
`syncimgSendBase` (configurado em `caminhos-locais.json`, gitignored, por maquina). Esse
modelo pressupoe copiar o legado inteiro do drive de rede para o computador local, o que
e desnecessario e caro em transporte.

Na pratica existem duas pastas de rede:
- **Origem** — onde o fotografo externo deposita as fotos, organizada em subpastas de mes
  do ano. So leitura; nunca deve ser escrita pelo sistema.
- **Destino/backup** — copia de trabalho no proprio drive (plana, sem subpastas de mes),
  onde o QA de fato acontece. Evita mexer no original.

Alem disso ja existe um volume de GTINs no destino que passaram por QA manual antes deste
sistema existir (legado). O sistema novo precisa saber diferenciar esse legado dos GTINs
que chegarem dai pra frente (pendentes de QA no fluxo novo).

## Escopo

1. Tela de Settings para configurar os caminhos de rede, substituindo edicao manual do
   `caminhos-locais.json`.
2. Botao "Pescador de GTIN" que copia (origem -> destino) so o que ainda nao existe no
   destino, achatando a estrutura de subpastas de mes.
3. JSON de controle que separa GTINs "legado" (ja existiam no destino antes do primeiro
   scan) de "pendente" (trazidos pelo Pescador dai em diante), usado como filtro na tela.

Fora de escopo: rastrear conclusao de QA no JSON de controle (isso ja e resolvido pelo
fluxo existente de organizar/Finalizadas); copiar para pasta local (o QA continua sendo
feito direto no drive).

## 1. Settings de caminhos

Estende `caminhos-locais.json` (mesmo arquivo que ja guarda `syncimgSendBase`) com 3 campos
novos:

```json
{
  "syncimgSendBase": "C:\\Apps\\SyncIMGSend",
  "legadoOrigemDir": "\\\\servidor\\fotos\\Externo",
  "legadoDestinoDir": "\\\\servidor\\fotos\\QA_Legado",
  "cadastroOcrDir": "C:\\Cadastro\\OCR"
}
```

`DEFAULTS_CAMINHOS_LOCAIS` em `lib/qaSyndi.js` ganha os 3 defaults novos (`legadoOrigemDir:
''`, `legadoDestinoDir: ''`, `cadastroOcrDir: 'C:\\Cadastro\\OCR'`), mantendo compatibilidade
com instalacoes que ainda nao rodaram a tela de Settings.

**Endpoints (server.js):**
- `GET /api/settings/caminhos` — devolve o conteudo atual de `caminhos-locais.json`
  (mesclado com os defaults).
- `POST /api/settings/caminhos` — recebe os 4 campos, valida strings simples (sem checar
  se a pasta existe/e alcancavel neste momento — pode ser rede offline), grava o arquivo
  e recarrega `CAMINHOS_LOCAIS` em memoria (funcao `carregarCaminhosLocais` ja existe,
  so precisa ser re-chamada e as constantes derivadas recalculadas).

Continua bloqueado de leitura estatica direta (`ARQUIVOS_BLOQUEADOS` ja cobre
`caminhos-locais.json`) — so acessivel via esses dois endpoints novos.

**Front-end:** novo modal "Configuracoes" (`modalSettingsCaminhos`), no mesmo padrao visual
do `modalIdentidade` existente, com 4 campos de texto e botao Salvar. Acessivel por um icone
na barra superior, ao lado do de Identidade.

## 2. Pescador de GTIN

Nova funcao em `lib/qaSyndi.js`, `pescarGtins(origemDir, destinoDir)`:
1. Lista subpastas de `origemDir` (meses).
2. Dentro de cada subpasta de mes, lista subpastas de GTIN (mesmo regex `REGEX_PASTA_GTIN`
   ja usado em `listarOsNone`).
3. Para cada GTIN encontrado, verifica se ja existe uma pasta com esse GTIN em `destinoDir`
   (raiz, sem subpasta de mes).
4. Se nao existe, copia a pasta inteira (recursivo, mesmo helper de
   `copiarDiretorioRecursivo` ja usado em `verificarEOrganizarOsNone`) pra
   `destinoDir/<pastaGtin>` — achatando, sem recriar a subpasta do mes.
5. Nunca apaga nem sobrescreve nada na origem. No destino, so cria pastas que nao existiam
   (idempotente — rodar de novo sem nada de novo na origem nao faz nada).
6. Para cada GTIN novo copiado, registra entrada no JSON de controle (secao 3) com
   `status: "pendente"`, `data` = timestamp da copia, `mesOrigem` = nome da subpasta de mes
   de onde veio.
7. Retorna `{ novos: [...gtins copiados], jaExistiam: [...gtins ignorados], erros: [...] }`.

**Endpoint:** `POST /api/pescador-gtin` — chama `pescarGtins(legadoOrigemDir,
legadoDestinoDir)` (caminhos vindos de `caminhos-locais.json`); se algum dos dois nao
estiver configurado, devolve erro claro pedindo pra configurar em Settings primeiro.

**Front-end:** botao "Pescador de GTIN" na tela de OS_NONE, mostra resumo do resultado
(quantos novos, quantos ja existiam, erros) apos rodar.

## 3. JSON de controle de legado

Arquivo `controle-legado.json`, gravado na raiz de `legadoDestinoDir` (fica no drive
compartilhado, visivel a qualquer analista que aponte pro mesmo destino).

```json
{
  "GTIN1": { "status": "legado", "data": "2026-08-18T10:00:00.000Z" },
  "GTIN2": { "status": "pendente", "data": "2026-08-20T14:32:00.000Z", "mesOrigem": "Agosto" }
}
```

**Scan inicial (`GET/POST /api/legado/scan`):** roda uma vez, sob acao explicita do
usuario (botao "Gerar snapshot do legado" — so fica habilitado se `controle-legado.json`
ainda nao existir, pra evitar rodar duas vezes por engano e sobrescrever status ja
corrigidos manualmente). Varre `legadoDestinoDir` como esta hoje (mesma logica de listagem
de `listarOsNone`), e para cada GTIN encontrado que ainda nao esta no JSON, grava
`status: "legado"`, `data` = mtime da pasta.

**Atualizacao continua:** toda vez que o Pescador traz um GTIN novo (secao 2, passo 6), ele
escreve a entrada `pendente` no mesmo arquivo. Nao ha outro processo escrevendo nesse JSON.

**Uso no filtro:** a listagem de OS_NONE (`listarOsNone`, que passa a ler de
`legadoDestinoDir` em vez de `AgConferencia\OS_NONE` — ver secao 4) inclui o `status` de
cada GTIN (lendo `controle-legado.json`; GTIN sem entrada = tratado como `pendente` por
seguranca). A tela ganha um filtro Legado / Pendente / Todos.

## 4. Ajustes no codigo existente

- `listarOsNone(agConferenciaDir)` em `lib/qaSyndi.js` passa a receber `legadoDestinoDir`
  diretamente (nao mais monta `path.join(agConferenciaDir, 'OS_NONE')`). Callers em
  `server.js` passam `qaSyndi.CAMINHOS_LOCAIS.legadoDestinoDir` no lugar de
  `qaSyndi.AGCONFERENCIA`.
- `verificarEOrganizarOsNone(agConferenciaDir, cadastroOcrDir, opcoes)` — o parametro
  `cadastroOcrDir` deixa de ter default hardcoded `'C:\\Cadastro\\OCR'` no corpo da funcao;
  o caller (`server.js`, endpoint `/api/verificar-os-none`) passa
  `qaSyndi.CAMINHOS_LOCAIS.cadastroOcrDir` explicitamente.
- Se `legadoDestinoDir` nao estiver configurado, os endpoints que dependem dele (listagem
  de OS_NONE, verificar/organizar, pescador) devolvem erro claro orientando a configurar
  em Settings, em vez de tentar ler pasta vazia/local antiga.

## Testes

- `lib/qaSyndi.test.js` ganha casos para: `carregarCaminhosLocais` com os campos novos e
  seus defaults; `pescarGtins` (origem com subpastas de mes, destino vazio e destino
  parcialmente preenchido, idempotencia); leitura/escrita do `controle-legado.json` (scan
  inicial marca legado, pescador marca pendente, GTIN sem entrada cai em pendente por
  default).
- Testes de servidor (se existirem, checar `server.test.js` ou equivalente) cobrindo os 3
  endpoints novos com sucesso e com caminhos nao configurados.
