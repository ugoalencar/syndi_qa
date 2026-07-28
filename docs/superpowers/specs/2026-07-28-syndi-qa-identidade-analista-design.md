# Syndi_qa — Sub-projeto: Identidade do analista ("engrenagem") para gravações no Redmine

O Syndi_qa grava no Redmine em três pontos (Aprovar, Retrabalho, aba "QA para Edição"), mas
nenhuma dessas gravações registra QUEM fez a ação — todas saem sob a mesma API key
compartilhada. O sphoto já resolve isso pra si mesmo com um modal de engrenagem: o operador
carrega um arquivo JSON pessoal (ex.: `fotoEstudiougo.json`) que identifica o analista, e o app
usa esses dados em toda gravação. Este spec porta esse mecanismo pro Syndi_qa.

## 0. Contexto — decomposição maior

1-9. (ver specs anteriores, todos mergeados: retrabalho, tagging+zoom, envio-edição, Agenda de
Edição, aba QA para Edição, scripts operacionais, correções QA de Foto/QA para Edição, correção
de `/api/imagem`, preview reduzido de imagens.)
10. **Este spec** — identidade do analista pra gravações no Redmine.

## 1. Decisões confirmadas com o usuário

- **Campo alvo: `cf_85` "Responsável QA Imagem"** — já tem as opções de analista cadastradas no
  Redmine (Ugo Alencar=15, Nelyana Girardi=16, Karoline Ramos=34, etc.) e o `userId` do arquivo
  JSON já bate exatamente com o id da opção em cf_85 — sem camada de mapeamento necessária.
- **Reaproveita o formato de arquivo JSON do sphoto por completo** — mesmo schema que já é
  distribuído por analista (`userId`/`userName` mais campos de outra finalidade, roteamento de
  regra de arquivo, que o sphoto usa e o Syndi_qa vai ignorar).
- **Sem seletor de "Perfil"** — esse campo do modal do sphoto é específico do fluxo de captura
  (câmera/estúdio), que o Syndi_qa não tem. O modal do Syndi_qa fica só com o file-picker de
  identidade.
- **Escopo: todas as 3 gravações no Redmine** (Aprovar, Retrabalho, aba QA para Edição) —
  `gravarCamposEdicao`, `marcarRetrabalhoFotografia`, `gravarCamposEdicaoCompleto` em
  `lib/redmine.js`.
- **Identidade ausente BLOQUEIA a ação** (mesmo padrão do sphoto) — nenhuma das 3 gravações
  tenta ir ao Redmine sem `userId` configurado; mostra aviso pedindo pra configurar a engrenagem
  primeiro, igual ao `buscarGTIN` do sphoto ("Usuário não configurado! Clique no ícone de
  engrenagem.").
- **O nome do analista atual aparece ao lado do ícone no header**, não só dentro do modal — dá
  visibilidade constante de quem vai assinar as próximas gravações, reduz erro de esquecer de
  trocar identidade numa máquina compartilhada entre analistas.

## 2. Captura e armazenamento da identidade

- Modal (`#modalIdentidade`, estilo Bootstrap igual ao resto do app) com um `<input type="file">`
  e um botão "Salvar".
- Ao selecionar um arquivo: lê como texto (`FileReader.readAsText`), faz `JSON.parse`, extrai
  `obj.userId`/`obj.userName`. Falha de parse mostra erro (`mostrarErro`), não salva nada.
- Sucesso: guarda o texto bruto do JSON e os dois campos extraídos no estado reativo do Vue
  (`identidadeJson`, `analistaId`, `analistaNome`) e persiste em `localStorage` sob as MESMAS
  chaves que o sphoto usa (`regra`, `user_id`, `nome_usuario`) — mesmo formato de arquivo, mesmo
  modelo de persistência local por máquina, sem motivo pra inventar nomes novos.
- Ao carregar a página (`onMounted`), lê essas 3 chaves do `localStorage` de volta pro estado
  reativo, igual ao `carregarConfigLocal` do sphoto.

## 3. UI

- Novo botão no `header-right` (`syndi_qa.html`), primeiro item, antes de "Verificar
  atualização": ícone de engrenagem (`bi-gear`) + nome do analista atual quando configurado
  (`⚙ Ugo Alencar`), ou "⚙ Configurar identidade" quando ainda não configurado. Visível nas duas
  abas (Fila e Agenda) — identidade é por sessão, não por aba.
- Clique abre o modal descrito na seção 2.

## 4. Validação e gravação (client + server)

- **Client-side**: antes de chamar a API de Aprovar, Retrabalho ou "gravar" da aba QA para
  Edição, cada handler checa `analistaId` no estado. Se vazio, mostra o aviso e RETORNA sem
  chamar a API — nenhuma requisição de rede é feita. Mesmo padrão do `buscarGTIN` do sphoto.
- Cada um dos 3 POSTs (`/api/aprovar`, `/api/retrabalho`, `/api/edicao/gravar`) passa a incluir
  `userId` no corpo.
- **Server-side** (defesa em profundidade — nunca confia só na checagem do cliente): cada uma das
  3 rotas valida que `userId` veio no corpo e não é vazio; se faltar, responde `400` com
  `{ ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' }`, sem
  tentar nada no Redmine nem mover/gravar nada local.
- **`lib/redmine.js`**:
  - Nova constante `CF_RESPONSAVEL_QA_IMAGEM = 85`.
  - `montarCamposEdicao(campos)` e `montarCamposEdicaoCompleto(campos)` — os dois construtores
    puros já testados — passam a aceitar `campos.userId` e incluir
    `{ id: 85, value: String(campos.userId) }` na lista quando presente, mesmo padrão condicional
    já usado pra `responsavel`/`qtdRecorte`/`qtdMockup`.
  - `gravarCamposEdicao`/`gravarCamposEdicaoCompleto` continuam recebendo `campos` como hoje —
    só passam a incluir `userId` dentro desse objeto (nenhuma mudança de assinatura).
  - `marcarRetrabalhoFotografia(basePath, gtin, userId)` — ganha um terceiro parâmetro (hoje não
    recebe `campos` nenhum) e passa a gravar cf_15 E cf_85 no mesmo PUT (`custom_fields: [{id:
    CF_SITUACAO_IMAGENS, ...}, {id: CF_RESPONSAVEL_QA_IMAGEM, value: String(userId)}]`).
  - `server.js` repassa o `userId` do corpo da requisição pra cada chamada de `redmine.*`.

## 5. O que fica de fora

- Permissões/papéis por analista — qualquer arquivo JSON válido funciona, mesmo modelo de
  confiança que o sphoto já usa (não é controle de acesso, é registro de autoria).
- Auditoria histórica dentro do próprio Syndi_qa de quem gravou o quê e quando — isso já vive no
  histórico do próprio Redmine (campo `journals`), não precisa ser duplicado localmente.
- Retrogravação de `cf_85` em issues já processadas antes deste spec — só issues gravadas a
  partir de agora ganham o campo.

## 6. Testes

- `lib/redmine.test.js`: `montarCamposEdicao`/`montarCamposEdicaoCompleto` com `userId`
  presente (cf_85 aparece na lista) e ausente (cf_85 não aparece, comportamento igual ao atual);
  `marcarRetrabalhoFotografia` grava cf_15 E cf_85 juntos no mesmo PUT (mock de `fetch`, mesmo
  padrão dos testes existentes desse arquivo).
- `server.js`: verificação manual via curl — cada uma das 3 rotas com `userId` ausente no corpo
  devolve `400` sem tocar no Redmine; com `userId` presente, grava normalmente (reaproveita GTIN
  de teste real já usado nas verificações de specs anteriores).
- Front-end: verificação manual — botão mostra "Configurar identidade" sem config, nome do
  analista depois de configurar; tentar Aprovar/Retrabalhar/gravar sem identidade mostra o aviso
  e não dispara request; com identidade configurada, completa normalmente.
