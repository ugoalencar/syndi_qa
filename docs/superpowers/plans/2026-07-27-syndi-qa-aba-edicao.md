# Aba "QA para Edição" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent "QA para Edição" tab (alongside the existing "QA de Foto" content) inside a selected GTIN's detail view, letting the analyst view and edit all 4 Redmine fields the sphoto QA Hub exposes there — including Situação das Imagens (cf_15), which Syndi_qa has never written outside the retrabalho flow.

**Architecture:** Two new pure-ish/network functions in `lib/redmine.js` (`buscarDetalheEdicao` read, `gravarCamposEdicaoCompleto` write, plus the pure `montarCamposEdicaoCompleto` helper) mirror the existing `gravarCamposEdicao` pattern but include cf_15. Two new routes in `server.js` wire them to the front-end. `js/qa.js` gets a second, independent tab-state (`abaDetalhe`) alongside the existing `viewAtiva`/`painelEnvio` state, lazy-loaded per GTIN. `syndi_qa.html` reuses CSS classes already present from the earlier sphoto asset-copy (`qa-tabs`, `qa-tab-btn`, `qa-campo-linha`, `qa-campo-origem`, `qa-conflito-aviso`) — no new CSS needed.

**Tech Stack:** Node.js core only (`http`, `fs`, `path`, native `fetch`), Vue 3 Composition API (no build), `node:test` for the one new pure function, manual curl/`node -e` for network-touching code — same stack as the rest of Syndi_qa.

## Global Constraints

- No npm install, no new dependency, no CDN, no build step.
- The Aprovar flow (`aprovarGtin`, `painelEnvio`, `/api/aprovar*`, `gravarCamposEdicao`) must NOT be modified — this sub-project is additive only, zero regression risk on already-merged code.
- The new write path (`gravarCamposEdicaoCompleto`) is the ONLY place in Syndi_qa allowed to write cf_15 outside of `marcarRetrabalhoFotografia` — it is a deliberate, confirmed exception to the "robot owns cf_15" rule (see spec section 1), not a violation of it.
- No optimistic-concurrency conflict detection (confirmed decision — single-analyst tool).
- The Situação field must show a warning that the robot may silently overwrite it.
- `hoje`/dates are not involved in this sub-project (no new pure date logic).

---

## Confirmed Redmine field IDs (from spec section 2, already used elsewhere in the codebase)

| Campo | cf_id | Sugestão automática? |
|---|---|---|
| Situação das Imagens | 15 | Não |
| Responsável Pós-Produção | 23 | Sim (via `inferirCamposEdicao`) |
| Qtd Imagens Recorte | 176 | Sim |
| Qtd Imagens Mockup | 175 | Sim |

---

### Task 1: `lib/redmine.js` — `buscarDetalheEdicao` + `gravarCamposEdicaoCompleto`

**Files:**
- Modify: `lib/redmine.js`
- Test: `lib/redmine.test.js` (append, only for the pure `montarCamposEdicaoCompleto`)

**Interfaces:**
- Consumes: `buscarIssueAbertaPorGtin(basePath, gtin)`, `redmineFetch(basePath, caminho, opcoes)` (both already in the file, private/exported).
- Produces:
  - `buscarDetalheEdicao(basePath, gtin)` → `Promise<{ issue: { id, updatedOn, customFields: { '15', '23', '175', '176' } } | null }>`.
  - `montarCamposEdicaoCompleto(campos)` → `Array<{id, value}>`, `campos = { situacao, responsavel, qtdRecorte, qtdMockup }` (pure).
  - `gravarCamposEdicaoCompleto(basePath, gtin, campos)` → `Promise<{ gravado: boolean, issueId?: number }>`.

- [ ] **Step 1: Write the failing test for the pure function**

Add to `lib/redmine.test.js` (after the existing `montarCamposEdicao`/`gravarCamposEdicao` tests, i.e. after the block ending around the `gravarCamposEdicao devolve gravado:false...` test):

```js
test('montarCamposEdicaoCompleto mapeia os 4 campos, incluindo situacao', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '85', responsavel: '32', qtdRecorte: '3', qtdMockup: '5' });
    assert.deepEqual(lista, [
        { id: 15, value: '85' },
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' }
    ]);
});

test('montarCamposEdicaoCompleto pula campos vazios, incluindo situacao vazia', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '', responsavel: '258', qtdRecorte: '', qtdMockup: '' });
    assert.deepEqual(lista, [{ id: 23, value: '258' }]);
});

test('montarCamposEdicaoCompleto devolve vazio quando nada foi preenchido', () => {
    assert.deepEqual(redmine.montarCamposEdicaoCompleto({ situacao: '', responsavel: '', qtdRecorte: '', qtdMockup: '' }), []);
    assert.deepEqual(redmine.montarCamposEdicaoCompleto({}), []);
});

test('gravarCamposEdicaoCompleto devolve gravado:false sem tocar na rede quando todos os campos estao vazios', async () => {
    const dirTemp = criarDirTemp();
    const resultado = await redmine.gravarCamposEdicaoCompleto(dirTemp, '7898133020049', { situacao: '', responsavel: '', qtdRecorte: '', qtdMockup: '' });
    assert.deepEqual(resultado, { gravado: false });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:\syndi_qa && npm test`
Expected: FAIL — `redmine.montarCamposEdicaoCompleto is not a function`

- [ ] **Step 3: Implement the three functions**

Add to `lib/redmine.js`, right after `buscarIssuesAgenda` (the last function before `module.exports`):

```js

function valorCfEdicao(issue, id) {
    const campo = issue.custom_fields.find(c => c.id === id);
    return campo ? campo.value : '';
}

// Busca a issue aberta do GTIN com os 4 campos da aba "QA para Edicao" (Situacao +
// Responsavel + Quantidades) - so leitura, usado pra pre-preencher a tela antes do
// analista editar. issue:null se nao achar ficha aberta (front mostra aviso, igual sphoto).
async function buscarDetalheEdicao(basePath, gtin) {
    const issue = await buscarIssueAbertaPorGtin(basePath, gtin);
    if (!issue) return { issue: null };
    return {
        issue: {
            id: issue.id,
            updatedOn: issue.updated_on,
            customFields: {
                '15': valorCfEdicao(issue, CF_SITUACAO_IMAGENS),
                '23': valorCfEdicao(issue, CF_RESPONSAVEL_POS_PRODUCAO),
                '175': valorCfEdicao(issue, CF_QTD_IMAGENS_MOCKUP),
                '176': valorCfEdicao(issue, CF_QTD_IMAGENS_RECORTE)
            }
        }
    };
}

// Monta os custom_fields do PUT da aba "QA para Edicao" - DIFERENTE de montarCamposEdicao:
// esta INCLUI Situacao das Imagens (cf_15), excecao deliberada e confirmada a regra de
// "so o robo grava cf_15" - ver spec docs/superpowers/specs/2026-07-27-syndi-qa-aba-edicao-design.md
// secao 1. Campo vazio nao entra (nao sobrescreve o que ja estiver no Redmine).
function montarCamposEdicaoCompleto(campos) {
    const lista = [];
    if (campos.situacao) lista.push({ id: CF_SITUACAO_IMAGENS, value: String(campos.situacao) });
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    return lista;
}

// Grava Situacao/Responsavel/Quantidades na issue aberta do GTIN, num PUT so - usada pela
// aba "QA para Edicao", independente do fluxo do Aprovar (que usa gravarCamposEdicao e
// nunca grava Situacao). Todos os campos vazios = nada a gravar, devolve { gravado: false }
// sem tocar na rede. Lanca erro se nao achar issue aberta ou o PUT falhar.
async function gravarCamposEdicaoCompleto(basePath, gtin, campos) {
    const customFields = montarCamposEdicaoCompleto(campos);
    if (customFields.length === 0) return { gravado: false };
    const issue = await buscarIssueAbertaPorGtin(basePath, gtin);
    if (!issue) {
        throw new Error('Nenhuma ficha aberta encontrada no Redmine para o GTIN ' + gtin);
    }
    const resp = await redmineFetch(basePath, '/issues/' + issue.id + '.json', {
        method: 'PUT',
        body: JSON.stringify({ issue: { custom_fields: customFields } })
    });
    if (!resp.ok) {
        const texto = await resp.text();
        throw new Error('Redmine respondeu ' + resp.status + ' ao gravar campos da aba de edicao: ' + texto);
    }
    return { gravado: true, issueId: issue.id };
}
```

Then update `module.exports` at the bottom of `lib/redmine.js` — current block:

```js
module.exports = {
    carregarConfigRedmine,
    buscarIssueAbertaPorGtin,
    escreverCampoRedmine,
    marcarRetrabalhoFotografia,
    montarCamposEdicao,
    gravarCamposEdicao,
    buscarIssuesAgenda
};
```

Change to:

```js
module.exports = {
    carregarConfigRedmine,
    buscarIssueAbertaPorGtin,
    escreverCampoRedmine,
    marcarRetrabalhoFotografia,
    montarCamposEdicao,
    gravarCamposEdicao,
    buscarIssuesAgenda,
    buscarDetalheEdicao,
    montarCamposEdicaoCompleto,
    gravarCamposEdicaoCompleto
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:\syndi_qa && npm test`
Expected: PASS (all new tests + the existing 56)

- [ ] **Step 5: Manual verification of the network functions**

Run: `cd D:\syndi_qa && node -e "require('./lib/redmine').buscarDetalheEdicao('.', '7896105510635').then(r => console.log(JSON.stringify(r)))"` (use a real GTIN known to have an open issue — check `logs` or ask if unsure; any GTIN from the Agenda de Edição verification in an earlier round works). Expected: prints `{"issue":{"id":...,"updatedOn":"...","customFields":{"15":"...","23":"...","175":"...","176":"..."}}}` with no error. Do NOT print `redmine-config.json`'s contents.

- [ ] **Step 6: Commit**

```bash
cd D:\syndi_qa
git add lib/redmine.js lib/redmine.test.js
git commit -m "feat: adiciona buscarDetalheEdicao e gravarCamposEdicaoCompleto (aba QA para Edicao)"
```

---

### Task 2: `server.js` — `GET /api/edicao/detalhe` + `POST /api/edicao/gravar`

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `redmine.buscarDetalheEdicao(basePath, gtin)`, `redmine.gravarCamposEdicaoCompleto(basePath, gtin, campos)` (Task 1), `qaSyndi.inferirCamposEdicao(pastaGtinPath)` (already in the file, used by `/api/aprovar/preparar`).
- Produces:
  - `GET /api/edicao/detalhe?os=&gtin=` → `{ ok: true, issue: {...}|null, sugeridos: {responsavel, qtdRecorte, qtdMockup} }` or `{ ok: false, error }`.
  - `POST /api/edicao/gravar` (body `{os, gtin, situacao, responsavel, qtdRecorte, qtdMockup}`) → `{ ok: true, gravado, issueId }` or `{ ok: false, error }`.

- [ ] **Step 1: Add the two routes**

In `server.js`, add both routes right after the `GET /api/motivos` block (after the closing `}` and `return;` that currently ends at line 404, before the `// Agenda de Edicao` comment on line 406):

```js

    // Detalhe da aba "QA para Edicao" - situacao atual no Redmine (se houver ficha aberta)
    // + sugestoes locais de Responsavel/Quantidades (mesma inferencia do Aprovar). So
    // leitura, nada e gravado nem movido aqui.
    if (req.method === 'GET' && req.url.startsWith('/api/edicao/detalhe')) {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const os = query.get('os') || '';
        const gtin = query.get('gtin') || '';
        if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
            enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
            return;
        }
        const pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
        if (!pastaOsNome) {
            enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
            return;
        }
        const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(path.join(qaSyndi.AGCONFERENCIA, pastaOsNome), gtin, /^(\d+)/);
        if (!pastaGtinNome) {
            enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
            return;
        }
        redmine.buscarDetalheEdicao(BASE_PATH, gtin).then(resultado => {
            const inferido = qaSyndi.inferirCamposEdicao(path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome));
            enviarJson(res, 200, { ok: true, issue: resultado.issue, sugeridos: inferido.campos });
        }).catch(err => {
            enviarJson(res, 500, { ok: false, error: err.message });
        });
        return;
    }

    // Grava os 4 campos da aba "QA para Edicao" (incluindo Situacao) - independente do
    // Aprovar, nunca move pasta. Reaproveita o mesmo padrao de validacao numerica de
    // /api/aprovar.
    if (req.method === 'POST' && req.url === '/api/edicao/gravar') {
        lerCorpo(req).then(async corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
                return;
            }
            const situacao = typeof dados.situacao === 'string' ? dados.situacao.trim() : '';
            const responsavel = typeof dados.responsavel === 'string' ? dados.responsavel.trim() : '';
            const qtdRecorte = typeof dados.qtdRecorte === 'string' ? dados.qtdRecorte.trim() : '';
            const qtdMockup = typeof dados.qtdMockup === 'string' ? dados.qtdMockup.trim() : '';
            if (!/^\d*$/.test(situacao) || !/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup)) {
                enviarJson(res, 400, { ok: false, error: 'situacao/responsavel/qtdRecorte/qtdMockup devem ser numericos ou vazios' });
                return;
            }
            try {
                const resultado = await redmine.gravarCamposEdicaoCompleto(BASE_PATH, gtin, { situacao, responsavel, qtdRecorte, qtdMockup });
                enviarJson(res, 200, { ok: true, gravado: resultado.gravado, issueId: resultado.issueId || null });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }
```

- [ ] **Step 2: Verify manually**

Start the server: `cd D:\syndi_qa && node server.js` (background). It listens on port 3001 — this project's own port; a completely separate, unrelated production system runs on port 3000 on this machine and must never be touched.

Run: `curl "http://localhost:3001/api/edicao/detalhe?os=<uma_os_real>&gtin=<um_gtin_real_em_AgConferencia>"`
Expected: `{"ok":true,"issue":{...}|null,"sugeridos":{...}}`.

Run: `curl -X POST http://localhost:3001/api/edicao/gravar -H "Content-Type: application/json" -d "{\"os\":\"<os>\",\"gtin\":\"<gtin>\",\"situacao\":\"\",\"responsavel\":\"\",\"qtdRecorte\":\"\",\"qtdMockup\":\"\"}"`
Expected: `{"ok":true,"gravado":false,"issueId":null}` (all-empty payload never touches the network, matches Task 1 Step 5's unit test).

Stop the server afterward (find the PID you started, e.g. via `netstat -ano | grep :3001`, and kill only that specific process) — confirm with `netstat -ano | grep :3001` that nothing is left listening before finishing.

- [ ] **Step 3: Commit**

```bash
cd D:\syndi_qa
git add server.js
git commit -m "feat: adiciona rotas GET /api/edicao/detalhe e POST /api/edicao/gravar"
```

---

### Task 3: Front-end state and logic — `js/qa.js`

**Files:**
- Modify: `js/qa.js`

**Interfaces:**
- Consumes: `GET /api/edicao/detalhe`, `POST /api/edicao/gravar` (Task 2) via `fetch`.
- Produces: Vue refs/functions exposed to the template: `abaDetalhe`, `camposEdicao`, `origemCampoEdicao`, `carregandoEdicao`, `erroEdicao`, `erroEnvioEdicao`, `mensagemEdicao`, `enviandoEdicao`, `semFichaEdicao`, `opcoesSituacao`, `abrirAbaEdicao`, `marcarTocadoEdicao`, `confirmarEnvioEdicao`.

- [ ] **Step 1: Add the new state block**

In `js/qa.js`, right after this existing line (currently line 50):

```js
        const opcoesResponsavel = ref({});
```

Insert:

```js

        // Aba "QA para Edicao" - fixa dentro do detalhe do GTIN, independente do Aprovar/
        // painelEnvio acima. Mostra e deixa editar os 4 campos do Redmine, Situacao incluida
        // (excecao deliberada - ver docs/superpowers/specs/2026-07-27-syndi-qa-aba-edicao-design.md).
        const abaDetalhe = ref('foto'); // 'foto' | 'edicao'
        const camposEdicao = reactive({ '15': '', '23': '', '175': '', '176': '' });
        const origemCampoEdicao = reactive({ '15': 'inferido', '23': 'inferido', '175': 'inferido', '176': 'inferido' });
        const carregandoEdicao = ref(false);
        const erroEdicao = ref(''); // erro ao CARREGAR - esconde o formulario
        const erroEnvioEdicao = ref(''); // erro ao GRAVAR - mensagem inline, nao esconde nada
        const mensagemEdicao = ref('');
        const enviandoEdicao = ref(false);
        const semFichaEdicao = ref(false);
        const opcoesSituacao = ref({});
        const CAMPOS_EDICAO_IDS = ['15', '23', '176', '175'];
        const CHAVE_SUGERIDO_EDICAO = { '23': 'responsavel', '176': 'qtdRecorte', '175': 'qtdMockup' };
        let edicaoCarregadaParaGtin = null; // "os|gtin" da ultima carga - evita recarregar toda vez que a aba abre
```

- [ ] **Step 2: Run the syntax check to confirm no typo yet**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: no output (exit code 0).

- [ ] **Step 3: Extend `carregarOpcoesResponsavel` to also load Situação's options**

In `js/qa.js`, the current function (right after `selecionado`/`detalhe` refs section, further down):

```js
        async function carregarOpcoesResponsavel() {
            try {
                const resp = await fetch(API + '/redmine-campos.json');
                const dados = await resp.json();
                opcoesResponsavel.value = dados.campos.cf_23.opcoes;
            } catch (err) {
                console.error('Erro ao carregar redmine-campos.json:', err);
            }
        }
```

Change to (adds one line, single shared fetch — `redmine-campos.json` already has both `cf_23` and `cf_15`):

```js
        async function carregarOpcoesResponsavel() {
            try {
                const resp = await fetch(API + '/redmine-campos.json');
                const dados = await resp.json();
                opcoesResponsavel.value = dados.campos.cf_23.opcoes;
                opcoesSituacao.value = dados.campos.cf_15.opcoes;
            } catch (err) {
                console.error('Erro ao carregar redmine-campos.json:', err);
            }
        }
```

- [ ] **Step 4: Add the Edição-tab functions**

In `js/qa.js`, right after the `carregarOpcoesResponsavel` function (the one just edited in Step 3) and before `async function carregarAgenda() {`, insert:

```js

        // Aplica a resposta de /api/edicao/detalhe no estado reativo - campos que ja tem
        // valor confirmado (do Redmine, ou editado manualmente nesta sessao) nao sao
        // sobrescritos por uma recarga. Mesmo principio do aplicarDetalhe do sphoto (js/qa.js).
        function aplicarDetalheEdicao(dados) {
            semFichaEdicao.value = !dados.issue;
            CAMPOS_EDICAO_IDS.forEach(id => {
                if (origemCampoEdicao[id] === 'manual') return;
                const valorRedmine = dados.issue ? dados.issue.customFields[id] : '';
                const chaveSugerido = CHAVE_SUGERIDO_EDICAO[id];
                if (valorRedmine) {
                    camposEdicao[id] = valorRedmine;
                    origemCampoEdicao[id] = 'manual';
                } else if (chaveSugerido && dados.sugeridos[chaveSugerido] !== undefined) {
                    camposEdicao[id] = dados.sugeridos[chaveSugerido];
                    origemCampoEdicao[id] = 'inferido';
                } else {
                    camposEdicao[id] = camposEdicao[id] || '';
                    origemCampoEdicao[id] = 'inferido';
                }
            });
        }

        async function carregarDetalheEdicao() {
            if (!selecionado.value) return;
            const os = selecionado.value.os;
            const gtin = selecionado.value.gtin;
            carregandoEdicao.value = true;
            erroEdicao.value = '';
            try {
                const resp = await fetch(API + '/api/edicao/detalhe?os=' + encodeURIComponent(os) + '&gtin=' + encodeURIComponent(gtin));
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                // Resposta atrasada de um GTIN anterior nao pode aplicar campos errados
                // depois que o usuario ja trocou de selecao - mesmo guard do abrirPainelEnvio.
                if (!selecionado.value || selecionado.value.os !== os || selecionado.value.gtin !== gtin) return;
                aplicarDetalheEdicao(dados);
                edicaoCarregadaParaGtin = os + '|' + gtin;
            } catch (err) {
                if (selecionado.value && selecionado.value.os === os && selecionado.value.gtin === gtin) {
                    erroEdicao.value = 'Erro ao carregar dados de edicao: ' + err.message + ' (server.js rodando?)';
                }
            } finally {
                if (selecionado.value && selecionado.value.os === os && selecionado.value.gtin === gtin) carregandoEdicao.value = false;
            }
        }

        // Troca pra aba "QA para Edicao" e carrega os dados so na primeira vez pra este
        // GTIN (edicaoCarregadaParaGtin) - evita ida-e-volta ao Redmine toda vez que o
        // analista alterna entre as abas Foto/Edicao do mesmo GTIN.
        function abrirAbaEdicao() {
            abaDetalhe.value = 'edicao';
            if (!selecionado.value) return;
            const chave = selecionado.value.os + '|' + selecionado.value.gtin;
            if (edicaoCarregadaParaGtin !== chave) carregarDetalheEdicao();
        }

        function marcarTocadoEdicao(id) {
            origemCampoEdicao[id] = 'manual';
        }

        async function confirmarEnvioEdicao() {
            if (!selecionado.value || enviandoEdicao.value) return;
            enviandoEdicao.value = true;
            mensagemEdicao.value = '';
            erroEnvioEdicao.value = '';
            try {
                const resp = await fetch(API + '/api/edicao/gravar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os: selecionado.value.os,
                        gtin: selecionado.value.gtin,
                        situacao: String(camposEdicao['15'] || ''),
                        responsavel: String(camposEdicao['23'] || ''),
                        qtdRecorte: String(camposEdicao['176'] || ''),
                        qtdMockup: String(camposEdicao['175'] || '')
                    })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                mensagemEdicao.value = dados.gravado ? 'Campos gravados no Redmine.' : 'Nenhum campo preenchido - nada foi gravado.';
            } catch (err) {
                erroEnvioEdicao.value = 'Erro ao gravar: ' + err.message;
            } finally {
                enviandoEdicao.value = false;
            }
        }
```

- [ ] **Step 5: Reset the Edição-tab state when the analyst selects a different GTIN**

In `js/qa.js`, inside `selecionarGtin`, find this exact line:

```js
            painelEnvio.value = null;
```

Change to (adds the Edição-tab resets right after it):

```js
            painelEnvio.value = null;
            abaDetalhe.value = 'foto';
            edicaoCarregadaParaGtin = null;
            semFichaEdicao.value = false;
            erroEdicao.value = '';
            erroEnvioEdicao.value = '';
            mensagemEdicao.value = '';
            CAMPOS_EDICAO_IDS.forEach(id => {
                camposEdicao[id] = '';
                origemCampoEdicao[id] = 'inferido';
            });
```

- [ ] **Step 6: Expose the new refs/functions in `return {}`**

In `js/qa.js`, the `return { ... }` block currently ends with:

```js
            viewAtiva, mudarParaAgenda, agenda, carregandoAgenda, erroAgenda, carregarAgenda,
            filtroResponsavel, filtroPeriodoDe, filtroPeriodoAte, agendaFiltrada
        };
```

Change to:

```js
            viewAtiva, mudarParaAgenda, agenda, carregandoAgenda, erroAgenda, carregarAgenda,
            filtroResponsavel, filtroPeriodoDe, filtroPeriodoAte, agendaFiltrada,
            abaDetalhe, camposEdicao, origemCampoEdicao, carregandoEdicao, erroEdicao, erroEnvioEdicao,
            mensagemEdicao, enviandoEdicao, semFichaEdicao, opcoesSituacao,
            abrirAbaEdicao, marcarTocadoEdicao, confirmarEnvioEdicao
        };
```

- [ ] **Step 7: Run the syntax check**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: no output (exit code 0). Full behavioral verification happens in Task 4 Step 2, once the matching HTML exists.

- [ ] **Step 8: Commit**

```bash
cd D:\syndi_qa
git add js/qa.js
git commit -m "feat: adiciona estado e logica da aba QA para Edicao em js/qa.js"
```

---

### Task 4: Front-end markup — `syndi_qa.html`

**Files:**
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: `abaDetalhe`, `camposEdicao`, `origemCampoEdicao`, `carregandoEdicao`, `erroEdicao`, `erroEnvioEdicao`, `mensagemEdicao`, `enviandoEdicao`, `semFichaEdicao`, `opcoesSituacao`, `opcoesResponsavel`, `abrirAbaEdicao`, `marcarTocadoEdicao`, `confirmarEnvioEdicao` (Task 3).

- [ ] **Step 1: Add the tab buttons and wrap the existing "QA de Foto" content**

In `syndi_qa.html`, the GTIN detail view currently starts like this (inside the `<main class="qa-detalhe">` block):

```html
                <div v-else>
                    <h5 class="mb-3">GTIN {{ selecionado.gtin }} <small class="text-muted">- OS {{ selecionado.os }}</small></h5>

                    <div class="qa-legenda">
                        <span class="qa-legenda-item"><span class="qa-legenda-cor coding"></span> _coding (referência de edição)</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor rt"></span> RT - Rótulo</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor is"></span> IS - Insumos</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor ap"></span> AP - Apoio</span>
                    </div>

                    <div v-if="carregandoDetalhe" class="qa-vazio">Carregando pasta...</div>
                    <div v-else-if="erroDetalhe" class="text-danger p-3">{{ erroDetalhe }}</div>

                    <template v-else-if="detalhe">
```

Change to (adds the tab bar, wraps the legend/photo-loading states in `v-show="abaDetalhe === 'foto'"`):

```html
                <div v-else>
                    <h5 class="mb-3">GTIN {{ selecionado.gtin }} <small class="text-muted">- OS {{ selecionado.os }}</small></h5>

                    <div class="qa-tabs">
                        <button type="button" class="qa-tab-btn" :class="{ ativa: abaDetalhe === 'foto' }" @click="abaDetalhe = 'foto'">QA de Foto</button>
                        <button type="button" class="qa-tab-btn" :class="{ ativa: abaDetalhe === 'edicao' }" @click="abrirAbaEdicao">QA para Edição</button>
                    </div>

                    <div v-show="abaDetalhe === 'foto'">
                    <div class="qa-legenda">
                        <span class="qa-legenda-item"><span class="qa-legenda-cor coding"></span> _coding (referência de edição)</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor rt"></span> RT - Rótulo</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor is"></span> IS - Insumos</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor ap"></span> AP - Apoio</span>
                    </div>

                    <div v-if="carregandoDetalhe" class="qa-vazio">Carregando pasta...</div>
                    <div v-else-if="erroDetalhe" class="text-danger p-3">{{ erroDetalhe }}</div>

                    <template v-else-if="detalhe">
```

Note: the lines inside the new `v-show="abaDetalhe === 'foto'"` wrapper are intentionally left at
their existing indentation level rather than re-indented one level deeper — HTML doesn't care
about indentation, and re-indenting the ~90 lines between here and the wrapper's closing `</div>`
(added in Step 2) would be a large, purely-cosmetic diff with real risk of a transcription mistake
for no functional benefit. Do not "fix" this.

- [ ] **Step 2: Close the new wrapper `div` and add the "QA para Edição" tab content**

In `syndi_qa.html`, the GTIN detail view currently ends like this (right before `</main>`):

```html
                        <div class="qa-enviar-conferencia mt-3">
                            <button type="button" class="btn btn-primary btn-sm" :disabled="temMarcacao() || preparandoEnvio || !!painelEnvio || aprovando || !!mensagem" @click="abrirPainelEnvio">
                                <i class="bi bi-check2-circle"></i> Aprovar GTIN
                            </button>
                            <button type="button" class="btn btn-warning btn-sm" :disabled="!todasMarcacoesTemMotivo() || enviandoRetrabalho || !!mensagem" @click="confirmarRetrabalho">
                                <i class="bi bi-arrow-counterclockwise"></i> Confirmar Retrabalho
                            </button>
                            <span v-if="mensagem" class="ms-3 text-success">{{ mensagem }}</span>
                            <span v-if="erro" class="ms-3 text-danger">{{ erro }}</span>
                        </div>
                    </template>
                </div>
            </main>
```

Change to (adds the closing `</div>` for the "foto" wrapper opened in Step 1, then the whole new "edicao" tab block):

```html
                        <div class="qa-enviar-conferencia mt-3">
                            <button type="button" class="btn btn-primary btn-sm" :disabled="temMarcacao() || preparandoEnvio || !!painelEnvio || aprovando || !!mensagem" @click="abrirPainelEnvio">
                                <i class="bi bi-check2-circle"></i> Aprovar GTIN
                            </button>
                            <button type="button" class="btn btn-warning btn-sm" :disabled="!todasMarcacoesTemMotivo() || enviandoRetrabalho || !!mensagem" @click="confirmarRetrabalho">
                                <i class="bi bi-arrow-counterclockwise"></i> Confirmar Retrabalho
                            </button>
                            <span v-if="mensagem" class="ms-3 text-success">{{ mensagem }}</span>
                            <span v-if="erro" class="ms-3 text-danger">{{ erro }}</span>
                        </div>
                    </template>
                    </div>

                    <div v-show="abaDetalhe === 'edicao'">
                        <div v-if="carregandoEdicao" class="qa-vazio">Carregando dados de edição...</div>
                        <div v-else-if="erroEdicao" class="text-danger p-3">{{ erroEdicao }}</div>
                        <template v-else>
                            <div v-if="semFichaEdicao" class="qa-conflito-aviso">
                                <i class="bi bi-exclamation-triangle-fill"></i>
                                Nenhuma ficha aberta encontrada no Redmine para este GTIN.
                            </div>

                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Situação das Imagens</span>
                                <select class="form-select form-select-sm w-auto" v-model="camposEdicao['15']" @change="marcarTocadoEdicao('15')">
                                    <option value="">-</option>
                                    <option v-for="(rotulo, id) in opcoesSituacao" :key="id" :value="id">{{ rotulo }}</option>
                                </select>
                                <span class="qa-campo-origem" :class="origemCampoEdicao['15']">{{ origemCampoEdicao['15'] }}</span>
                            </div>
                            <div class="qa-conflito-aviso">
                                <i class="bi bi-exclamation-triangle-fill"></i>
                                O robô syncIMG.jar também grava este campo ao mover a pasta - se você alterar aqui, pode ser sobrescrito automaticamente em seguida.
                            </div>

                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Responsável Pós-Produção</span>
                                <select class="form-select form-select-sm w-auto" v-model="camposEdicao['23']" @change="marcarTocadoEdicao('23')">
                                    <option value="">-</option>
                                    <option v-for="(rotulo, id) in opcoesResponsavel" :key="id" :value="id">{{ rotulo }}</option>
                                </select>
                                <span class="qa-campo-origem" :class="origemCampoEdicao['23']">{{ origemCampoEdicao['23'] }}</span>
                            </div>

                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Qtd Imagens Recorte</span>
                                <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="camposEdicao['176']" @input="marcarTocadoEdicao('176')">
                                <span class="qa-campo-origem" :class="origemCampoEdicao['176']">{{ origemCampoEdicao['176'] }}</span>
                            </div>

                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Qtd Imagens Mockup</span>
                                <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="camposEdicao['175']" @input="marcarTocadoEdicao('175')">
                                <span class="qa-campo-origem" :class="origemCampoEdicao['175']">{{ origemCampoEdicao['175'] }}</span>
                            </div>

                            <button type="button" class="btn btn-primary btn-sm mt-2" :disabled="enviandoEdicao || carregandoEdicao" @click="confirmarEnvioEdicao">
                                <i class="bi bi-cloud-upload"></i> Confirmar e Enviar ao Redmine
                            </button>
                            <span v-if="mensagemEdicao" class="ms-3 text-success">{{ mensagemEdicao }}</span>
                            <span v-if="erroEnvioEdicao" class="ms-3 text-danger">{{ erroEnvioEdicao }}</span>
                        </template>
                    </div>
                </div>
            </main>
```

- [ ] **Step 3: Manual end-to-end verification**

Start the server (`cd D:\syndi_qa && node server.js`, background). Port 3001 is this project's own port — never touch port 3000 (unrelated production system on this machine).

Run: `curl -s http://localhost:3001/ | grep -o "QA para Edição"` — expected: prints `QA para Edição` (confirms the new tab button text is in the served HTML).

Then open `http://localhost:3001` in a browser and check, with a real GTIN selected:
- The "QA de Foto" / "QA para Edição" tab buttons appear right under the GTIN heading.
- "QA de Foto" shows exactly what it showed before this change (legend, photo grid, tagging buttons, motivos panel, Aprovar/Retrabalho buttons) — no visual regression.
- Clicking "QA para Edição" loads once (network tab shows a single `GET /api/edicao/detalhe` call), shows the 4 fields with origin badges, and the warning box under Situação.
- Switching back to "QA de Foto" and back to "QA para Edição" again does NOT trigger a second `GET /api/edicao/detalhe` call (lazy-load-once, per `edicaoCarregadaParaGtin`).
- Editing a field and clicking "Confirmar e Enviar ao Redmine" shows a success message and the field's badge stays (or becomes) "manual".
- Selecting a different GTIN resets the tab back to "QA de Foto" and clears the Edição fields.

Stop the server afterward (kill only the PID you started; confirm port 3001 is free via `netstat -ano | grep :3001`).

- [ ] **Step 4: Commit**

```bash
cd D:\syndi_qa
git add syndi_qa.html
git commit -m "feat: adiciona aba QA para Edicao ao syndi_qa.html"
```

---

## Post-plan: update memory

After this plan is fully implemented and merged, update
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md` (and `MEMORY.md` if
needed): mark the "QA para Edição" tab as built, and note that Syndi_qa now has a second,
deliberate, confirmed exception to "the robot owns cf_15" (alongside the existing retrabalho
exception) — this matters for future work that touches Redmine field-ownership rules. This is a
memory-system update, not a code task — do it in the finishing conversation, not as a plan step.

