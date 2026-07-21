# Syndi_qa — Peça 1: Interface de QA + Fluxo de Retrabalho

Spec baseada em `prompt_sistema_qa.md`. Cobre só a primeira fatia do sistema — as demais
(integração de status no Redmine, robô que devolve pro fotógrafo, contagem/subtração pra
edição) ficam documentadas como próximos passos, cada uma com spec própria quando chegar a vez.

## 1. Contexto

O Syndi_qa é um sistema **novo e separado** do sphoto/sphoto-terminais. A única ligação entre
eles é o Redmine (campo `Situação das Imagens`, `cf_15`) — não há dependência de código nem
pasta compartilhada entre os pacotes.

Investigando o ambiente (`C:\Apps\SyncIMGSend\ini.conf` e os arquivos de regra do robô
`syncIMG.jar`), ficou claro onde o Syndi_qa se encaixa no pipeline real:

```
1. Fotógrafo (sphoto-terminais / "S_Foto") captura e faz o QA interno de fotografia.
   Redmine cf_15 = "Aguardando QA Fotografia" (19)

2. Robô C:\Apps\Syncimg sobe Finalizadas -> bucket WaitingConference
   (deixa disponível pra terceiros/home office revisarem)
   Redmine cf_15 = "Ag. Conferência" (154)

3. *** AQUI ENTRA O SYNDI_QA ***
   Na máquina do analista de QA (remota/home office), o robô C:\Apps\SyncIMGSend
   (PROCESSO_6, regra SYNCIMG_RECEIVER_IMAGES_PARA_CONFERENCIA.json) baixa do bucket
   WaitingConference pra AgConferencia\OS_x (...)\<gtin>\ e sozinho já muda
   Redmine cf_15 = "Em Conferência" (155)

   O Syndi_qa lê AgConferencia, o analista aprova ou aciona retrabalho.

4. Aprovado -> Syndi_qa move o GTIN pra AgEnvio. O mesmo robô SyncIMGSend
   (PROCESSO_1/5, regra SYNCIMG_SEND_IMAGES*.json) sobe pro bucket WaitingEditing
   e muda sozinho Redmine cf_15 = "Aguardando Edição" (20)
```

**Achado importante:** o robô `syncIMG.jar` já é genérico e dirigido por arquivo de regra
(JSON com `ruleConditions`/`ruleActions` que casam OS+GTIN com a tarefa do Redmine). Ele reage à
presença de arquivo local — quando recebe ou envia, atualiza o Redmine sozinho. Por isso a
integração com Redmine (peça futura) tende a ser **configuração** (novo `PROCESSO_N` + regra
JSON pro fluxo de Retrabalho), não código novo dentro do Syndi_qa. Ver seção 8.

**Cogitado e descartado por ora:** ler as imagens direto do bucket (preview online, sem passar
pelo `AgConferencia` local) foi considerado. Não há credencial/endpoint do bucket disponível
nesta máquina (fica embutido dentro do `.jar`, fechado) e, mais importante, isso jogaria fora a
atualização automática do Redmine que o robô já faz de graça reagindo a arquivo local — teria
que ser reimplementada via API do Redmine dentro do Syndi_qa. Fica registrado como possível
otimização futura, condicionada a obter as credenciais do bucket.

## 2. Escopo desta spec

**Entra:**
- Interface web de QA (lista OS → GTINs → fotos), lendo `AgConferencia`
- Ação de Aprovar GTIN → move a pasta inteira pra `AgEnvio`
- Ação de Retrabalho → checkboxes de motivo por foto → gera TXT → move a pasta inteira pra
  nova pasta `Retrabalho`
- Atualização via git (self-update) e configuração de caminho por máquina

**Fica para depois (specs próprias):**
- Peça 2 — novo `PROCESSO_N` + regra JSON no `syncIMG.jar` pra pescar `Retrabalho` e escrever
  um status de Retrabalho no Redmine (ver achado na seção 1)
- Peça 3 — contagem/subtração de fotos pra Edição (excluir subpastas RT/AP e tag `coding`) e
  parametrização do tipo de edição no topo da tela
- Peça 4 — robô que entrega a pasta `Retrabalho` de volta no computador do fotógrafo
  responsável (avaliar se dá pra ser mais um `PROCESSO_N` do `syncIMG.jar` em vez de robô novo)
- Melhoria futura — preview direto do bucket (ver seção 1)

## 3. Arquitetura

- Node + Vue sem build, mesmo padrão do sphoto: offline, zero CDN
- Projeto próprio em `d:\syndi_qa`, com **git init próprio** (repo aninhado, independente de
  qualquer repositório dos diretórios pais — a raiz do `D:\` tem um repo git de outro projeto
  que não deve ser tocado por este)
- Servidor Node próprio, porta `3000` por padrão (máquina separada do sphoto/terminais, sem o
  conflito de porta documentado lá)
- Visual reaproveitado do QA Hub do sphoto (Bootstrap + `qa.css`), conforme pedido no prompt
  original
- Estrutura de pastas do projeto espelhando o sphoto: `server.js`, `lib/qaSyndi.js` (regras de
  negócio), `index.html`/`qa.html`, `js/`, `css/`

### Atualização via git

Mesmo mecanismo que o sphoto ganhou (commit `675e84a`), reaproveitado tal e qual:

- `GET /api/atualizacao/verificar` — `git fetch origin main` (só leitura) + compara HEAD local
  com `origin/main`, devolve `temAtualizacao`/`versaoAtual`/`versaoDisponivel`
- `POST /api/atualizacao/aplicar` — `git pull --ff-only`; recusa se houver alteração local não
  commitada (`git status --porcelain`); nunca resolve conflito sozinho; avisa se `server.js`
  ou `lib/*` mudaram (precisa reiniciar o processo — o resto é servido fresco do disco)
- Botão "Verificar atualização"/"Atualizar agora" na tela de Configuração, sininho no header
  quando há versão nova

### Configuração por máquina (`caminhos-locais.json`)

Mesmo padrão do sphoto: arquivo opcional, **gitignored**, na raiz do projeto. Sem ele, usa os
defaults abaixo — assim `git pull` atualiza função sem sobrescrever ajuste local de cada
estação.

```json
{
  "syncimgSendBase": "C:\\Apps\\SyncIMGSend"
}
```

Default embutido no código: `C:\Apps\SyncIMGSend`. Path calculado a partir dele:
`AGCONFERENCIA = path.join(SYNCIMGSEND_BASE, 'AgConferencia')`,
`AGENVIO = path.join(SYNCIMGSEND_BASE, 'AgEnvio')`,
`RETRABALHO = path.join(SYNCIMGSEND_BASE, 'Retrabalho')`.

`caminhos-locais.json` entra na lista de arquivos bloqueados no handler estático (mesmo
tratamento do `redmine-config.json` no sphoto), caso este projeto também acabe guardando
credencial (ex.: Redmine) do mesmo jeito no futuro.

## 4. Fluxo de dados

```
C:\Apps\SyncIMGSend\AgConferencia\OS_<os> (<n> GTINs) (<prazo>)\<gtin>\
   ├── foto_0.jpg
   ├── RT\foto_2.jpg          <- subpastas RT/IS/AP preservadas (robô mantém estrutura)
   └── AP\foto_5.jpg
```

- Analista revisa o GTIN inteiro (todas as fotos, em todas as subpastas)
- **Aprovar GTIN** → move a pasta inteira pra
  `C:\Apps\SyncIMGSend\AgEnvio\OS_<os> (...)\<gtin>\`
- **Retrabalho** → GTIN fica **retido por inteiro** (não vai pra edição enquanto houver
  pendência): move a pasta inteira pra
  `C:\Apps\SyncIMGSend\Retrabalho\OS_<os> (...)\<gtin>\`, preservando subpastas, e grava
  **um TXT por GTIN** dentro dessa pasta
- Em ambos os casos, o GTIN some da fila do Syndi_qa assim que a pasta é movida — sem precisar
  de arquivo de controle extra (mesmo princípio de fila do `AgEnvio` do sphoto: "o que sobe,
  sai de lá")

## 5. Interface

- Tela única (lista de OS/GTIN + detalhe do GTIN selecionado), estilo visual do QA Hub do
  sphoto
- Grade de fotos do GTIN atual, com miniatura e zoom (igual ao que já existe no sphoto)
- Por foto: checkbox "marcar problema" → ao marcar, abre lista de motivos pré-definidos
  (múltipla escolha)
- Botão "Aprovar GTIN" (habilitado só se nenhuma foto estiver marcada) e "Confirmar
  Retrabalho" (habilitado só se ao menos uma foto estiver marcada)
- Lista de motivos inicial, configurável depois (JSON próprio, tipo `ocr-config.json` do
  sphoto): desfoque, exposição/iluminação, enquadramento errado, fundo sujo, produto
  sujo/amassado, sombra/reflexo indesejado, cor/balanço de branco errado, resolução baixa,
  etiqueta ilegível

## 6. Geração do TXT

- Um arquivo `retrabalho.txt` dentro da pasta do GTIN em `Retrabalho\`
- Conteúdo: lista de fotos marcadas + motivos selecionados por foto, exemplo:

```
GTIN: 7898133020049
Data: 2026-07-21
foto_2.jpg: desfoque, iluminação
foto_5.jpg: fundo sujo
```

## 7. Regras de negócio

- GTIN é a unidade de decisão: aprovação e retrabalho operam no GTIN inteiro, nunca foto a
  foto isoladamente
- Subpastas RT/IS/AP são preservadas no move
- Mover a pasta já é o "despacho" — não precisa de marcador/arquivo de controle adicional

## 8. Testes

- Testes de integração em `lib/qaSyndi.js`: move de pasta inteira com subpastas, geração do
  TXT com múltiplas fotos/motivos, cenário de aprovação sem pendência, cenário de
  `caminhos-locais.json` ausente (cai no default) e presente (sobrescreve)
