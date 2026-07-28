# Identidade do Analista (Engrenagem) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every gravação do Syndi_qa no Redmine (Aprovar, Retrabalho, aba QA para Edição) passa a
registrar QUEM fez a ação, gravando o id do analista no custom field `cf_85` "Responsável QA
Imagem", usando o mesmo mecanismo de identidade (arquivo JSON pessoal + engrenagem no header) que
o sphoto já usa.

**Architecture:** back-end (`lib/redmine.js`) ganha um novo campo opcional `userId` nos
construtores de `custom_fields` já existentes e um terceiro parâmetro em
`marcarRetrabalhoFotografia`; `server.js` valida que `userId` veio no corpo de cada uma das 3
rotas de gravação (400 se faltar) antes de chamar o Redmine; front-end (`js/qa.js` +
`syndi_qa.html`) ganha um botão de engrenagem no header que abre um modal com file-picker,
persistindo a identidade em `localStorage`, e bloqueia as 3 ações se a identidade não estiver
configurada.

**Tech Stack:** Node.js core (`node:test`, `fetch` global), Vue 3 (sem build), Bootstrap 5 (modal
já usado no projeto).

## Global Constraints

- `cf_85` = "Responsável QA Imagem" — id numérico confirmado, sem camada de mapeamento (o
  `userId` do arquivo JÁ bate com o id da opção em cf_85).
- Reaproveita o MESMO formato de arquivo JSON e as MESMAS chaves de `localStorage` do sphoto:
  `regra` (texto bruto do JSON), `user_id`, `nome_usuario`. Não inventar nomes novos.
- SEM seletor de "Perfil" no modal — só o file-picker de identidade.
- Identidade ausente BLOQUEIA a ação, nos dois lados (cliente E servidor) — nenhuma das 3
  gravações tenta ir ao Redmine sem `userId`.
- Comentários em código: português sem acento, explicando o PORQUÊ, não o quê (padrão já usado em
  todo `lib/redmine.js` e `js/qa.js`).
- Strings de erro mostradas ao usuário em JS (`erro.value = '...'` etc.) seguem o padrão já
  existente no projeto: português SEM acento (ex.: "nao foi possivel", "Identidade nao
  configurada") — texto em HTML puro (labels, botões) pode ter acento normalmente, só as strings
  dentro de arquivos `.js` seguem esse padrão.
- Nenhuma mudança de assinatura em `gravarCamposEdicao`/`gravarCamposEdicaoCompleto` — elas já
  recebem um objeto `campos`; `userId` só passa a ser mais uma chave aceita dentro desse objeto.

---

### Task 1: `lib/redmine.js` — cf_85 nos 3 construtores/gravadores

**Files:**
- Modify: `lib/redmine.js`
- Test: `lib/redmine.test.js`

**Interfaces:**
- Consumes: nada de tarefas anteriores (primeira tarefa do plano).
- Produces: `montarCamposEdicao(campos)` e `montarCamposEdicaoCompleto(campos)` — ambas aceitam
  `campos.userId` (string), incluem `{ id: 85, value: String(campos.userId) }` na lista quando
  presente. `marcarRetrabalhoFotografia(basePath, gtin, userId)` — ganha um 3º parâmetro
  obrigatório. Constante `CF_RESPONSAVEL_QA_IMAGEM = 85` exportada implicitamente via uso interno
  (não precisa exportar a constante em si, só o comportamento).

- [ ] **Step 1: Escrever os testes que falham pra `montarCamposEdicao`/`montarCamposEdicaoCompleto` com `userId`**

Em `lib/redmine.test.js`, adicione estes testes logo depois do teste
`'montarCamposEdicao devolve vazio quando nada foi preenchido'` (linha ~48):

```js
test('montarCamposEdicao inclui cf_85 quando userId presente', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32', qtdRecorte: '3', qtdMockup: '5', userId: '15' });
    assert.deepEqual(lista, [
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' },
        { id: 85, value: '15' }
    ]);
});

test('montarCamposEdicao nao inclui cf_85 quando userId ausente', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32' });
    assert.deepEqual(lista, [{ id: 23, value: '32' }]);
});
```

E depois do teste `'montarCamposEdicaoCompleto devolve vazio quando nada foi preenchido'`
(linha ~74):

```js
test('montarCamposEdicaoCompleto inclui cf_85 quando userId presente', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '85', responsavel: '32', qtdRecorte: '3', qtdMockup: '5', userId: '16' });
    assert.deepEqual(lista, [
        { id: 15, value: '85' },
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' },
        { id: 85, value: '16' }
    ]);
});

test('montarCamposEdicaoCompleto nao inclui cf_85 quando userId ausente', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '85' });
    assert.deepEqual(lista, [{ id: 15, value: '85' }]);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: os 4 testes novos falham (comparando um array sem o item `{ id: 85, ... }` com o
esperado que o tem/não tem).

- [ ] **Step 3: Adicionar a constante `CF_RESPONSAVEL_QA_IMAGEM` e atualizar os dois construtores**

Em `lib/redmine.js`, logo após a linha `const OPCAO_RETRABALHO_FOTOGRAFIA = '24';` (linha 51),
adicione:

```js
// cf_85 "Responsavel QA Imagem" - id do analista que fez a acao no Syndi_qa (Aprovar,
// Retrabalho ou aba QA para Edicao). userId do arquivo de identidade ja bate com o id da
// opcao em cf_85 no Redmine, sem camada de mapeamento - ver
// docs/superpowers/specs/2026-07-28-syndi-qa-identidade-analista-design.md secao 1.
const CF_RESPONSAVEL_QA_IMAGEM = 85;
```

Depois, altere `montarCamposEdicao` (função existente, por volta da linha 75) pra:

```js
function montarCamposEdicao(campos) {
    const lista = [];
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    if (campos.userId) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.userId) });
    return lista;
}
```

E `montarCamposEdicaoCompleto` (função existente, por volta da linha 164) pra:

```js
function montarCamposEdicaoCompleto(campos) {
    const lista = [];
    if (campos.situacao) lista.push({ id: CF_SITUACAO_IMAGENS, value: String(campos.situacao) });
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    if (campos.userId) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.userId) });
    return lista;
}
```

Nota: como `userId` vira mandatório nas 3 telas a partir da Task 3 (front-end bloqueia a ação sem
identidade), na prática `gravarCamposEdicao`/`gravarCamposEdicaoCompleto` deixam de devolver
`{ gravado: false }` mesmo quando responsavel/qtdRecorte/qtdMockup (ou situacao) estão todos
vazios — agora gravam só `cf_85` nesse caso, já que a lista não fica mais vazia. Isso é
intencional: mesmo uma aprovação/gravação "vazia" passa a registrar quem a fez. Os testes
existentes que checam `{ gravado: false }` (linhas ~50-54 e ~76-80 de `redmine.test.js`) chamam
essas funções SEM `userId` no objeto `campos`, entao continuam passando sem alteração.

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: todos os testes passam, incluindo os 4 novos.

- [ ] **Step 5: Commit**

```bash
cd D:\syndi_qa
git add lib/redmine.js lib/redmine.test.js
git commit -m "feat: montarCamposEdicao/Completo incluem cf_85 (Responsavel QA Imagem) quando userId presente"
```

- [ ] **Step 6: Escrever o teste que falha pra `marcarRetrabalhoFotografia` com cf_85**

Este projeto nunca mockou `fetch` em testes até agora (as funções de gravação real só têm
cobertura pro caminho "sem nada a gravar, sem tocar na rede"). Pra testar que
`marcarRetrabalhoFotografia` grava cf_15 E cf_85 no mesmo PUT, adicione ao FINAL de
`lib/redmine.test.js` (depois do último teste existente):

```js
test('marcarRetrabalhoFotografia grava cf_15 e cf_85 juntos no mesmo PUT', async () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'redmine-config.json'), JSON.stringify({ baseUrl: 'https://redmine.exemplo.com', apiKey: 'chave123' }));

    const chamadas = [];
    const fetchOriginal = global.fetch;
    global.fetch = async (url, opcoes) => {
        chamadas.push({ url, opcoes });
        if (opcoes.method === undefined || opcoes.method === 'GET') {
            // busca da issue aberta (buscarIssueAbertaPorGtin)
            return { ok: true, json: async () => ({ issues: [{ id: 999 }] }) };
        }
        // PUT de gravacao
        return { ok: true, json: async () => ({}) };
    };

    try {
        const resultado = await redmine.marcarRetrabalhoFotografia(dirTemp, '7898133020049', '15');
        assert.deepEqual(resultado, { issueId: 999 });

        const chamadaPut = chamadas.find(c => c.opcoes.method === 'PUT');
        assert.ok(chamadaPut, 'esperava uma chamada PUT');
        const corpo = JSON.parse(chamadaPut.opcoes.body);
        assert.deepEqual(corpo.issue.custom_fields, [
            { id: 15, value: '24' },
            { id: 85, value: '15' }
        ]);
    } finally {
        global.fetch = fetchOriginal;
    }
});
```

- [ ] **Step 7: Rodar o teste e confirmar que falha**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: FAIL — `marcarRetrabalhoFotografia` ainda só aceita 2 parâmetros e ainda grava só cf_15
via `escreverCampoRedmine` (um PUT de campo único, não um array `custom_fields` com os dois).

- [ ] **Step 8: Atualizar `marcarRetrabalhoFotografia`**

Em `lib/redmine.js`, substitua a função `marcarRetrabalhoFotografia` inteira (linhas 56-63) por:

```js
// Busca a issue aberta do GTIN e marca Situacao das Imagens = "Retrabalho Fotografia" (24) E
// Responsavel QA Imagem = userId, no mesmo PUT. Lanca erro se nao achar issue aberta ou se a
// escrita falhar - quem chama (server.js) decide o que fazer com a falha (nao desfaz o
// move/TXT locais que ja aconteceram).
async function marcarRetrabalhoFotografia(basePath, gtin, userId) {
    const issue = await buscarIssueAbertaPorGtin(basePath, gtin);
    if (!issue) {
        throw new Error('Nenhuma ficha aberta encontrada no Redmine para o GTIN ' + gtin);
    }
    const resp = await redmineFetch(basePath, '/issues/' + issue.id + '.json', {
        method: 'PUT',
        body: JSON.stringify({ issue: { custom_fields: [
            { id: CF_SITUACAO_IMAGENS, value: OPCAO_RETRABALHO_FOTOGRAFIA },
            { id: CF_RESPONSAVEL_QA_IMAGEM, value: String(userId) }
        ] } })
    });
    if (!resp.ok) {
        const texto = await resp.text();
        throw new Error('Redmine respondeu ' + resp.status + ' ao marcar retrabalho: ' + texto);
    }
    return { issueId: issue.id };
}
```

Essa mudança faz `escreverCampoRedmine` (função genérica de campo único, ainda usada em nenhum
outro lugar) ficar sem uso interno neste arquivo — deixe-a como está (continua exportada, é
utilitário genérico de baixo risco manter, não é dead code no sentido de "nunca mais serve pra
nada", só passa a não ter chamador interno).

- [ ] **Step 9: Rodar os testes de novo e confirmar que passam**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: todos os testes passam (deve estar em 81 testes agora: 76 anteriores + 4 da Step 1 + 1
da Step 6).

- [ ] **Step 10: Commit**

```bash
cd D:\syndi_qa
git add lib/redmine.js lib/redmine.test.js
git commit -m "feat: marcarRetrabalhoFotografia grava cf_15 e cf_85 no mesmo PUT"
```

---

### Task 2: `server.js` — validar `userId` e repassar pras 3 rotas

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `redmine.gravarCamposEdicao(basePath, gtin, campos)`,
  `redmine.marcarRetrabalhoFotografia(basePath, gtin, userId)`,
  `redmine.gravarCamposEdicaoCompleto(basePath, gtin, campos)` (Task 1) — `campos` agora aceita
  `userId`.
- Produces: as 3 rotas (`POST /api/aprovar`, `POST /api/retrabalho`, `POST /api/edicao/gravar`)
  respondem `400 { ok: false, error: 'Identidade do analista obrigatoria (configure a
  engrenagem)' }` quando `userId` não vem no corpo ou não é uma string numérica não-vazia.

- [ ] **Step 1: `POST /api/aprovar` — validar e repassar `userId`**

Em `server.js`, dentro do handler de `/api/aprovar` (por volta da linha 351-357), logo depois do
bloco que valida `responsavel`/`qtdRecorte`/`qtdMockup` (a checagem `if
(!/^\d*$/.test(responsavel) ...)`), adicione:

```js
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
```

Depois, na chamada existente (por volta da linha 374):

```js
                const r = await redmine.gravarCamposEdicao(BASE_PATH, gtin, { responsavel, qtdRecorte, qtdMockup });
```

troque pra:

```js
                const r = await redmine.gravarCamposEdicao(BASE_PATH, gtin, { responsavel, qtdRecorte, qtdMockup, userId });
```

- [ ] **Step 2: `POST /api/retrabalho` — validar e repassar `userId`**

Dentro do handler de `/api/retrabalho` (por volta da linha 403-414), logo depois do bloco que
valida `temFotoSemMotivo`, adicione:

```js
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
```

Depois, na chamada existente (por volta da linha 434):

```js
                    await redmine.marcarRetrabalhoFotografia(BASE_PATH, gtin);
```

troque pra:

```js
                    await redmine.marcarRetrabalhoFotografia(BASE_PATH, gtin, userId);
```

- [ ] **Step 3: `POST /api/edicao/gravar` — validar e repassar `userId`**

Dentro do handler de `/api/edicao/gravar` (por volta da linha 501-508), logo depois do bloco que
valida `situacao`/`responsavel`/`qtdRecorte`/`qtdMockup`, adicione:

```js
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
```

Depois, na chamada existente (por volta da linha 510):

```js
                const resultado = await redmine.gravarCamposEdicaoCompleto(BASE_PATH, gtin, { situacao, responsavel, qtdRecorte, qtdMockup });
```

troque pra:

```js
                const resultado = await redmine.gravarCamposEdicaoCompleto(BASE_PATH, gtin, { situacao, responsavel, qtdRecorte, qtdMockup, userId });
```

- [ ] **Step 4: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check server.js`
Expected: sem saída (exit code 0).

- [ ] **Step 5: Verificação manual via curl**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. `curl -s -X POST http://localhost:3001/api/aprovar -H "Content-Type: application/json" -d "{\"os\":\"99999\",\"gtin\":\"0000000000000\"}"` —
   esperado: `400` com a mensagem de identidade obrigatoria. A checagem de `userId` (Step 1) fica
   ANTES da resolução de pasta (`localizarPastaDecoradaPorPrefixo`) no código, entao mesmo com
   OS/gtin inexistentes o erro devolvido é o de identidade ausente, não um 404 de OS não
   encontrada.
3. Mesmo teste pra `/api/retrabalho` (com `marcacoes` válido) e `/api/edicao/gravar` — ambos
   devem devolver `400` de identidade ausente sem `userId` no corpo.
4. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 6: Commit**

```bash
cd D:\syndi_qa
git add server.js
git commit -m "feat: valida userId obrigatorio nas 3 rotas de gravacao no Redmine"
```

---

### Task 3: Front-end — engrenagem, modal, bloqueio e envio de `userId`

**Files:**
- Modify: `js/qa.js`
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: `POST /api/aprovar`, `POST /api/retrabalho`, `POST /api/edicao/gravar` (Task 2) —
  todas agora exigem `userId` no corpo.
- Produces: estado reativo `analistaId`, `analistaNome`, `erroIdentidade` e função
  `carregarArquivoIdentidade(event)`, expostos no `return` do `setup()`.

- [ ] **Step 1: Estado da identidade em `js/qa.js`**

Em `js/qa.js`, logo depois da declaração de `const erro = ref('');` (linha 22), adicione:

```js
        // Identidade do analista (engrenagem) - mesmo mecanismo do sphoto: arquivo JSON
        // pessoal carregado uma vez, persistido em localStorage sob as mesmas chaves
        // (regra/user_id/nome_usuario) pra nao inventar um formato novo. Usado nas 3
        // gravacoes no Redmine (Aprovar, Retrabalho, aba QA para Edicao) - ver
        // docs/superpowers/specs/2026-07-28-syndi-qa-identidade-analista-design.md.
        const analistaId = ref(localStorage.getItem('user_id') || '');
        const analistaNome = ref(localStorage.getItem('nome_usuario') || '');
        const erroIdentidade = ref('');
```

- [ ] **Step 2: Função `carregarArquivoIdentidade`**

Logo depois da função `confirmarRetrabalho` (procure o fechamento dela, por volta da linha 545 -
o `}` que fecha a função, antes de `async function verificarAtualizacao`), adicione:

```js
        // Le o arquivo JSON pessoal selecionado no modal da engrenagem, extrai userId/userName
        // e persiste em localStorage - mesmas chaves que o sphoto usa (regra/user_id/
        // nome_usuario), mesmo formato de arquivo (campos de roteamento de regra que o sphoto
        // usa pra outra finalidade sao ignorados aqui de proposito).
        function carregarArquivoIdentidade(event) {
            const arquivo = event.target.files && event.target.files[0];
            if (!arquivo) return;
            erroIdentidade.value = '';
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const conteudo = e.target.result;
                    const obj = JSON.parse(conteudo);
                    if (!obj.userId || !obj.userName) {
                        erroIdentidade.value = 'Arquivo invalido: precisa ter userId e userName.';
                        return;
                    }
                    analistaId.value = String(obj.userId);
                    analistaNome.value = obj.userName;
                    localStorage.setItem('regra', conteudo);
                    localStorage.setItem('user_id', String(obj.userId));
                    localStorage.setItem('nome_usuario', obj.userName);
                    const modalEl = document.getElementById('modalIdentidade');
                    const modal = modalEl && bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                } catch (err) {
                    erroIdentidade.value = 'Erro ao ler arquivo JSON: ' + err.message;
                }
            };
            reader.readAsText(arquivo, 'UTF-8');
        }
```

- [ ] **Step 3: Bloqueio + `userId` no corpo de `aprovarGtin`**

Em `js/qa.js`, na função `aprovarGtin` (linha 486), troque:

```js
        async function aprovarGtin() {
            if (!selecionado.value || !painelEnvio.value || aprovando.value) return;
            aprovando.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/aprovar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os: selecionado.value.os,
                        gtin: selecionado.value.gtin,
                        responsavel: String(formEnvio.responsavel || ''),
                        qtdRecorte: String(formEnvio.qtdRecorte || ''),
                        qtdMockup: String(formEnvio.qtdMockup || '')
                    })
                });
```

por:

```js
        async function aprovarGtin() {
            if (!selecionado.value || !painelEnvio.value || aprovando.value) return;
            if (!analistaId.value) {
                erro.value = 'Identidade nao configurada! Clique no icone de engrenagem.';
                return;
            }
            aprovando.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/aprovar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os: selecionado.value.os,
                        gtin: selecionado.value.gtin,
                        responsavel: String(formEnvio.responsavel || ''),
                        qtdRecorte: String(formEnvio.qtdRecorte || ''),
                        qtdMockup: String(formEnvio.qtdMockup || ''),
                        userId: analistaId.value
                    })
                });
```

- [ ] **Step 4: Bloqueio + `userId` no corpo de `confirmarRetrabalho`**

Na função `confirmarRetrabalho` (linha 521), troque:

```js
        async function confirmarRetrabalho() {
            if (!selecionado.value || !todasMarcacoesTemMotivo()) return;
            enviandoRetrabalho.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/retrabalho', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, marcacoes: { ...marcadas } })
                });
```

por:

```js
        async function confirmarRetrabalho() {
            if (!selecionado.value || !todasMarcacoesTemMotivo()) return;
            if (!analistaId.value) {
                erro.value = 'Identidade nao configurada! Clique no icone de engrenagem.';
                return;
            }
            enviandoRetrabalho.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/retrabalho', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, marcacoes: { ...marcadas }, userId: analistaId.value })
                });
```

- [ ] **Step 5: Bloqueio + `userId` no corpo de `confirmarEnvioEdicao`**

Na função `confirmarEnvioEdicao` (linha 201), troque:

```js
        async function confirmarEnvioEdicao() {
            if (!selecionado.value || enviandoEdicao.value) return;
            const os = selecionado.value.os;
            const gtin = selecionado.value.gtin;
            enviandoEdicao.value = true;
            mensagemEdicao.value = '';
            erroEnvioEdicao.value = '';
            try {
                const resp = await fetch(API + '/api/edicao/gravar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os,
                        gtin,
                        situacao: String(camposEdicao['15'] || ''),
                        responsavel: String(camposEdicao['23'] || ''),
                        qtdRecorte: String(camposEdicao['176'] || ''),
                        qtdMockup: String(camposEdicao['175'] || '')
                    })
                });
```

por:

```js
        async function confirmarEnvioEdicao() {
            if (!selecionado.value || enviandoEdicao.value) return;
            if (!analistaId.value) {
                erroEnvioEdicao.value = 'Identidade nao configurada! Clique no icone de engrenagem.';
                return;
            }
            const os = selecionado.value.os;
            const gtin = selecionado.value.gtin;
            enviandoEdicao.value = true;
            mensagemEdicao.value = '';
            erroEnvioEdicao.value = '';
            try {
                const resp = await fetch(API + '/api/edicao/gravar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os,
                        gtin,
                        situacao: String(camposEdicao['15'] || ''),
                        responsavel: String(camposEdicao['23'] || ''),
                        qtdRecorte: String(camposEdicao['176'] || ''),
                        qtdMockup: String(camposEdicao['175'] || ''),
                        userId: analistaId.value
                    })
                });
```

- [ ] **Step 6: Expor no `return` do `setup()`**

No `return` final de `js/qa.js` (linha 611-627), adicione `analistaId, analistaNome,
erroIdentidade, carregarArquivoIdentidade,` — pode entrar logo depois de `mensagem, erro,` na
primeira linha do objeto:

```js
        return {
            fila, carregandoFila, erroFila,
            selecionado, detalhe, carregandoDetalhe, erroDetalhe,
            motivos, marcadas, fotoAtiva,
            aprovando, enviandoRetrabalho, mensagem, erro,
            analistaId, analistaNome, erroIdentidade, carregarArquivoIdentidade,
            atualizacaoInfo, verificandoAtualizacao, resultadoAtualizacao, aplicandoAtualizacao,
```

- [ ] **Step 7: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: sem saída (exit code 0).

- [ ] **Step 8: Botão da engrenagem no header, `syndi_qa.html`**

Em `syndi_qa.html`, dentro de `<div class="header-right">` (linha 24), como PRIMEIRO filho, antes
do `<i v-if="atualizacaoInfo"` (linha 25), adicione:

```html
                    <button type="button" class="btn btn-sm btn-outline-light" data-bs-toggle="modal" data-bs-target="#modalIdentidade">
                        <i class="bi bi-gear"></i> {{ analistaNome || 'Configurar identidade' }}
                    </button>
```

- [ ] **Step 9: Modal da identidade, `syndi_qa.html`**

Logo depois do fechamento de `</header>` (linha 55), antes de `<div class="qa-agenda"` (linha
57), adicione:

```html

        <div class="modal fade" id="modalIdentidade" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content bg-dark">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-gear"></i> Identidade do analista</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label for="inputArquivoIdentidade" class="form-label">Arquivo de identidade JSON</label>
                            <input type="file" class="form-control" id="inputArquivoIdentidade" accept=".json" @change="carregarArquivoIdentidade">
                            <div class="form-text">Selecione seu arquivo pessoal (ex.: fotoEstudiougo.json)</div>
                        </div>
                        <div class="alert alert-info mb-0">
                            <i class="bi bi-info-circle"></i>
                            <strong>Analista atual:</strong> {{ analistaNome || 'Nenhum configurado' }}
                        </div>
                        <div v-if="erroIdentidade" class="alert alert-danger mt-3 mb-0">{{ erroIdentidade }}</div>
                    </div>
                </div>
            </div>
        </div>
```

- [ ] **Step 10: Verificação manual end-to-end**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. `curl -s http://localhost:3001/ | grep -o "modalIdentidade"` — esperado: mostra pelo menos uma
   ocorrência (confirma que o modal foi pro HTML servido).
3. No navegador: abra a tela, confirme que o botão mostra "Configurar identidade" (sem config
   prévia — use uma aba anônima ou limpe o `localStorage` primeiro). Clique nele, selecione um
   arquivo JSON de teste com `{"userId": "15", "userName": "Teste"}`, confirme que o modal fecha e
   o botão passa a mostrar "Teste". Recarregue a página e confirme que o nome persiste (leu do
   `localStorage`).
4. Tente Aprovar/Retrabalhar/gravar na aba QA para Edição SEM identidade configurada (limpe o
   `localStorage` de novo) — confirme que aparece o aviso e nenhuma requisição de rede é feita
   (aba Network do DevTools).
5. Configure a identidade de novo e repita uma das 3 ações com um GTIN de teste real — confirme
   que completa normalmente.
6. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 11: Commit**

```bash
cd D:\syndi_qa
git add js/qa.js syndi_qa.html
git commit -m "feat: engrenagem de identidade do analista, bloqueia gravacoes no Redmine sem ela"
```

---

## Post-plan: update memory

Depois deste plano implementado e mergeado, atualizar
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md` (e `MEMORY.md` se
necessário): marcar o item 1 da lista de "Deferred, decomposed and confirmed" como concluído,
documentar que as 3 gravações no Redmine agora exigem `userId` (client+server bloqueiam sem ele),
e o comportamento novo de `gravarCamposEdicao`/`gravarCamposEdicaoCompleto` gravarem só `cf_85`
quando os demais campos ficam vazios (deixou de ser um "gravado: false" garantido). Isso é uma
atualização de memória, não uma tarefa de código — fazer na conversa de finalização, não como
step do plano.
