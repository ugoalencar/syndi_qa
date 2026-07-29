# Syndi_qa — Sub-projeto: entrega do Retrabalho de volta pro fotógrafo

Peça 4 da spec original de retrabalho (`docs/superpowers/specs/2026-07-21-syndi-qa-retrabalho-design.md`,
seção 2), deixada pra depois desde o início: um mecanismo que leve a pasta `Retrabalho\<OS>\<gtin>\`
(fotos + o TXT que o Syndi_qa já gera hoje) de volta pra máquina do fotógrafo (sphoto-terminais).

**Este spec É DIFERENTE dos anteriores**: não é código dentro do Syndi_qa. É configuração de um
robô de terceiros (`syncIMG.jar`, `.jar` fechado, credenciais de bucket embutidas nele) — o mesmo
robô que já move `AgConferencia`/`AgEnvio` hoje. A spec original já identificou isso ("achado
importante", seção 1): o robô reage a arquivo local + regra JSON, e por isso a integração tende a
ser configuração nova, não código novo.

## 0. Contexto — decomposição maior

1-12. (ver specs anteriores — a mais relevante aqui é a original de retrabalho, que já
identificou esta peça como pendência.)
13. **Este spec** — entrega do Retrabalho pro fotógrafo.

## 1. Decisões confirmadas com o usuário

- **Não há acesso direto à máquina do fotógrafo (sphoto-terminais) nesta sessão** — ela fica
  fisicamente em outro lugar. A estratégia acordada: preparar TUDO (as duas regras, os dois
  blocos de configuração) nesta máquina como "molde"; quando o sistema for instalado/copiado pra
  máquina do fotógrafo, a metade RECEIVER (já pronta aqui) é aplicada lá, ajustando só o que for
  específico daquele terminal (ex.: número de `PROCESSO_N` livre no `ini.conf` de lá, que não dá
  pra saber sem acesso).
- **Nenhuma mudança de código no Syndi_qa** — a pasta `Retrabalho\<OS>\<gtin>\` e o TXT dentro
  dela já são gerados exatamente como esse mecanismo precisa (feature já mergeada). Esta spec só
  descreve como o robô já existente passa a enxergar e mover essa pasta.
- **Nenhuma mudança no sphoto-terminais** — o fotógrafo abre a pasta recebida manualmente no
  Windows Explorer e lê o TXT; não há tela nova nem integração de código lá.
- **Condição de disparo do envio**: `Situação das Imagens` (cf_15) `EQUAL` "Retrabalho
  Fotografia" — o mesmo valor que `marcarRetrabalhoFotografia` (Syndi_qa) já grava hoje ao
  confirmar um retrabalho. Nenhum campo novo no Redmine é necessário pra essa parte.
- **Status intermediário (após o upload, aguardando o fotógrafo)**: nova opção **"Em Retrabalho
  de Foto"** em cf_15 — **ainda não existe no Redmine, o usuário vai cadastrá-la antes de aplicar
  a regra SEND** (pré-requisito externo, seção 5). Escolhida por já não existir conflito com as
  opções atuais e por descrever exatamente esse estado ("já saiu daqui, ainda não foi
  processado").
- **Status final (após o robô do fotógrafo baixar)**: volta pra **"Aguardando QA Fotografia"**
  (id 19, já existe) — reentra no fluxo normal do pipeline desde o início, mesmo status que fotos
  novas usam; o fotógrafo já reconhece esse valor.
- **Bucket**: reaproveita `WaitingConference` (já em uso pelo fluxo normal de conferência) com um
  subcaminho próprio, `WaitingConference/Retrabalho` — mesmo padrão já usado hoje pra separar
  fluxos dentro do mesmo bucket-raiz (`Milium/WaitingEditing` já existe como precedente). Evita
  precisar provisionar um bucket-raiz novo no lado do servidor remoto, que ficaria fora do
  alcance de verificar/criar nesta sessão.

## 2. Regra SEND — APLICADA em produção em 2026-07-29

**Correção importante em relação ao rascunho original desta seção**: a instalação realmente em
uso nesta máquina não é `C:\SyncIMGSend` (raiz do C:, que está vazia — nenhum dado real de
GTIN/OS) — é **`C:\Apps\SyncIMGSend`**, confirmado pelo usuário (é o `.jar` que ele aciona
manualmente hoje, e é onde dados reais de produção já apareceram sozinhos via robô, ex.:
`OS_49764`). Intrigantemente, o `ini.conf` de `C:\Apps\SyncIMGSend` tem todos os `PASTA_ORIGEM`/
`PASTA_DESTINO`/`REGRA_JSON` dos 6 processos existentes escritos como `C:\SyncIMGSend\...`
(não `C:\Apps\SyncIMGSend\...`) — mesmo assim os dados aparecem corretamente em
`C:\Apps\SyncIMGSend`. Teoria de trabalho (não confirmada, sem acesso ao código-fonte do `.jar`):
o robô resolve esses caminhos relativos a onde o processo é executado, ignorando o prefixo
absoluto do valor. **A regra nova foi aplicada seguindo o MESMO estilo/padrão dos 6 processos
existentes** (usando `C:\SyncIMGSend\...` nos valores, fisicamente dentro do `ini.conf` de
`C:\Apps\SyncIMGSend`), para ficar consistente com o que já funciona empiricamente — precisa de
confirmação por teste real (seção 6) antes de considerar certo.

Backup do `ini.conf` anterior à mudança salvo em
`C:\Apps\SyncIMGSend\ini.conf.backup-2026-07-29-antes-processo7`.

Novo arquivo `C:\SyncIMGSend\SYNCIMG_SEND_IMAGES_RETRABALHO.json`:

```json
{
    "taskProjectRedmine": "1WS - Brasil",
    "ruleOrigin": "SYNCIMG",
    "taskTypeRedmine": "GTIN",
    "ruleDescription": "SYNCIMG",
    "findTaskFinish": "true",
    "userId": 85,
    "userName": "Lilian Gregorio",
    "ruleConditions": [
        {
            "ruleFieldValue1": {
                "typeField": "REDMINE_CUSTOM_FIELD",
                "nameField": "Situação das Imagens"
            },
            "ruleTypeCondition": "EQUAL",
            "ruleFieldValue2": {
                "typeField": "FIXED_VALUE",
                "value": "Retrabalho Fotografia"
            },
            "block": 1
        },
        {
            "operator": "AND",
            "ruleFieldValue1": {
                "typeField": "REDMINE_CUSTOM_FIELD",
                "nameField": "OS"
            },
            "ruleTypeCondition": "EQUAL",
            "ruleFieldValue2": {
                "typeField": "FIXED_VALUE",
                "value": "#OS"
            },
            "block": 1
        },
        {
            "operator": "AND",
            "ruleFieldValue1": {
                "typeField": "REDMINE_CUSTOM_FIELD",
                "nameField": "GTIN"
            },
            "ruleTypeCondition": "EQUAL",
            "ruleFieldValue2": {
                "typeField": "FIXED_VALUE",
                "value": "#GTIN"
            },
            "block": 1
        }
    ],
    "ruleActions": [
        {
            "ruleFieldValue1": {
                "typeField": "REDMINE_CUSTOM_FIELD",
                "nameField": "Situação das Imagens"
            },
            "ruleFieldValue2": {
                "typeField": "FIXED_VALUE",
                "value": "Em Retrabalho de Foto"
            }
        }
    ],
    "historic": "Pasta de retrabalho enviada para o fotografo revisar.\n#LOG_ARQUIVOS"
}
```

Bloco ADICIONADO em produção em `C:\Apps\SyncIMGSend\ini.conf` (`QTDE_PROCESSOS` foi de `6` para
`7`), incluindo os campos completos que o padrão real dos 6 processos existentes usa (não
estavam todos no rascunho original desta spec — `CONTAR_IMAGENS_SUB_PASTAS`,
`CONTAR_IMAGENS_EXTENSAO`, `MANTEM_ESTRUTURA_PASTA_NO_DESTINO`, `ATIVAR_LOG`):

```ini
PROCESSO_7_IDENTIFICADOR=Enviando retrabalho de fotografia
PROCESSO_7_TIPO=SEND_IMAGES
PROCESSO_7_BUCKET=WaitingConference/Retrabalho
PROCESSO_7_CONTAR_IMAGENS_SUB_PASTAS=N
PROCESSO_7_CONTAR_IMAGENS_EXTENSAO=jpg;jpeg
PROCESSO_7_MANTEM_ESTRUTURA_PASTA_NO_DESTINO=SIM
PROCESSO_7_ATIVAR_LOG=N
PROCESSO_7_PASTA_ORIGEM=C:\SyncIMGSend\Retrabalho
PROCESSO_7_PASTA_DESTINO=C:\SyncIMGSend\RetrabalhoEnviado
PROCESSO_7_REGRA_JSON=C:\SyncIMGSend\SYNCIMG_SEND_IMAGES_RETRABALHO.json
PROCESSO_7_EXTENSAO=*
PROCESSO_7_EXTENSAO_EXCLUIR=ini;db;DS_Store;XnViewSort
```

`PASTA_ORIGEM` usa o mesmo valor literal `C:\SyncIMGSend\Retrabalho` que os 6 processos
existentes já usam pros seus próprios caminhos (ver nota da seção 2 sobre a teoria de resolução
relativa) — na prática, isso deve corresponder a `C:\Apps\SyncIMGSend\Retrabalho`, que É
exatamente `RETRABALHO = path.join(SYNCIMGSEND_BASE, 'Retrabalho')` que o Syndi_qa já usa
(`lib/qaSyndi.js`, com `SYNCIMGSEND_BASE` default `C:\Apps\SyncIMGSend` — confirmado, não existe
`caminhos-locais.json` nesta máquina). `PASTA_DESTINO` (`RetrabalhoEnviado`) segue o mesmo padrão
já usado pelos processos SEND existentes (`EnviadoParaEditar`) — pasta onde o robô move o
conteúdo local depois de confirmar o upload, evitando reenviar o mesmo GTIN de novo.

Arquivo de regra criado fisicamente em `C:\Apps\SyncIMGSend\SYNCIMG_SEND_IMAGES_RETRABALHO.json`
(mesmo local físico dos outros 6 arquivos de regra, apesar de todos serem referenciados no
`ini.conf` com o prefixo `C:\SyncIMGSend\...`).

## 3. Regra RECEIVER (especificação pronta pra aplicar na máquina do fotógrafo, quando o sistema
   for instalado/copiado pra lá)

Novo arquivo `C:\SyncIMGSend\SYNCIMG_RECEIVER_IMAGES_RETRABALHO.json` (mesmo caminho relativo,
na instalação do robô daquele terminal):

```json
{
    "taskProjectRedmine": "1WS - Brasil",
    "ruleOrigin": "SYNCIMG",
    "taskTypeRedmine": "GTIN",
    "ruleDescription": "SYNCIMG",
    "userId": 85,
    "userName": "Lilian Gregorio",
    "ruleConditions": [
        {
            "ruleFieldValue1": {
                "typeField": "REDMINE_CUSTOM_FIELD",
                "nameField": "Situação das Imagens"
            },
            "ruleTypeCondition": "EQUAL",
            "ruleFieldValue2": {
                "typeField": "FIXED_VALUE",
                "value": "Em Retrabalho de Foto"
            },
            "block": 1
        }
    ],
    "ruleActions": [
        {
            "ruleFieldValue1": {
                "typeField": "REDMINE_CUSTOM_FIELD",
                "nameField": "Situação das Imagens"
            },
            "ruleFieldValue2": {
                "typeField": "FIXED_VALUE",
                "value": "Aguardando QA Fotografia"
            }
        }
    ],
    "historic": "Retrabalho de fotografia recebido - refazer as fotos marcadas no TXT.\n#LOG_ARQUIVOS"
}
```

Novo bloco a acrescentar no `ini.conf` **daquele terminal** (número do `PROCESSO_N` e
`QTDE_PROCESSOS` dependem do que já existir configurado lá — não é possível saber sem acesso a
essa máquina; usar o próximo número livre no momento da instalação):

```ini
PROCESSO_N_IDENTIFICADOR=Recebendo retrabalho de fotografia
PROCESSO_N_TIPO=RECEIVER_IMAGES
PROCESSO_N_BUCKET=WaitingConference/Retrabalho
PROCESSO_N_PASTA_DESTINO=C:\SyncIMGSend\Retrabalho
PROCESSO_N_REGRA_JSON=C:\SyncIMGSend\SYNCIMG_RECEIVER_IMAGES_RETRABALHO.json
PROCESSO_N_RECEBIMENTO_NOME_PASTA_OS=OS_;#OS;---;(;$QTDE_GTIN;GTINs;);---;$DUE_DATE
PROCESSO_N_RECEBIMENTO_NOME_PASTA_GTIN=#GTIN
PROCESSO_N_CHECKLIST_GTINS=SIM
```

`RECEBIMENTO_NOME_PASTA_OS`/`RECEBIMENTO_NOME_PASTA_GTIN` seguem exatamente o padrão já usado no
`PROCESSO_6` (recebimento pra conferência) — o robô recria a pasta decorada (`OS_<n>---(<qtd>
GTINs)---<prazo>\<gtin>\`) no destino, preservando a estrutura, incluindo as subpastas RT/IS/AP
que o Syndi_qa já move junto no retrabalho.

## 4. O que fica de fora

- Qualquer mudança de código no Syndi_qa — a geração da pasta/TXT já está pronta.
- Qualquer mudança no sphoto-terminais — sem tela nova, o fotógrafo abre a pasta manualmente.
- Confirmação automática (ex.: o fotógrafo "marcar como recebido" na tela) — o histórico do
  Redmine (`historic` de cada regra) já registra a passagem por cada etapa, suficiente por ora.
- Lidar com o caso de duas OS diferentes decorarem pro mesmo nome de pasta (já é um risco
  genérico do robô, não específico deste fluxo, e o padrão `RECEBIMENTO_NOME_PASTA_OS` já inclui
  prazo/quantidade pra reduzir colisão, mesmo padrão do `PROCESSO_6` existente).

## 5. Pré-requisitos externos (fora do alcance desta sessão, o usuário precisa resolver)

- **Cadastrar a opção "Em Retrabalho de Foto" no custom field `Situação das Imagens` (cf_15) do
  Redmine** — a regra SEND só funciona depois que essa opção existir (senão o `FIXED_VALUE` na
  ação não bate com nenhuma opção válida do campo).
- **Confirmar que o subcaminho `WaitingConference/Retrabalho` funciona no bucket remoto** — não
  há acesso a essa infraestrutura nesta sessão pra testar; o padrão observado
  (`Milium/WaitingEditing`) sugere que subcaminhos são suportados, mas vale confirmar com um
  teste real antes de depender disso em produção.
- ~~Aplicar o bloco `PROCESSO_7` + a regra SEND~~ — **FEITO em 2026-07-29**, em
  `C:\Apps\SyncIMGSend\ini.conf` (a instalação real, não `C:\SyncIMGSend` como o rascunho
  original assumia — ver correção na seção 2). Backup do `ini.conf` anterior salvo. Ainda
  pendente: teste real (seção 6) e cadastro da opção "Em Retrabalho de Foto" no Redmine acima —
  sem essa opção cadastrada, a regra não vai conseguir gravar o valor no PUT.
- **Instalar/copiar o sistema pra máquina do fotógrafo e aplicar a regra RECEIVER + o bloco
  `PROCESSO_N` lá** — ação física numa máquina sem acesso nesta sessão, o usuário faz depois.

## 6. Testes

Não há testes automatizados possíveis — é configuração de um robô fechado (`.jar`), sem
interface de teste unitário. Verificação é manual, em duas etapas:

- **Depois de aplicar a regra SEND nesta máquina** (já aplicada — pendente só o teste em si):
  confirmar um retrabalho real via Syndi_qa (GTIN de teste), aguardar o robô rodar (ou forçar
  manualmente, se o robô tiver esse modo, executando o `.jar` de `C:\Apps\SyncIMGSend`), confirmar
  que a pasta `Retrabalho\<OS>\<gtin>\` foi movida pra `RetrabalhoEnviado` e que `Situação das
  Imagens` da issue mudou pra "Em Retrabalho de Foto" no Redmine. Esse teste também confirma ou
  refuta a teoria da seção 2 sobre como o robô resolve os caminhos do `ini.conf`.
- **Depois de aplicar a regra RECEIVER na máquina do fotógrafo**: confirmar que a pasta aparece
  em `Retrabalho\<OS>\<gtin>\` daquela máquina (com o TXT e as fotos/subpastas preservadas) e que
  `Situação das Imagens` mudou pra "Aguardando QA Fotografia".
