# Agenda de Edição Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Agenda de Edição" tab to Syndi_qa's `syndi_qa.html` that shows, read-only, every GTIN currently in edição (or just delivered) with a deadline progress bar, filterable by responsável and by período.

**Architecture:** New pure functions `calcularProgresso`/`montarItemAgenda` in `lib/qaSyndi.js` compute the progress-bar data from raw Redmine custom fields; a new `buscarIssuesAgenda` in `lib/redmine.js` fetches the raw issues (two paginated queries, `cf_15` in `{85, 97}`); a new `GET /api/agenda` route in `server.js` wires them together; the front-end (`js/qa.js` + `syndi_qa.html` + `css/qa.css`) adds a top-level tab, loaded lazily, with client-side filters over the already-fetched array.

**Tech Stack:** Node.js core only (`http`, `fs`, `path`, native `fetch`), Vue 3 Composition API (no build), `node:test` for pure functions, manual curl for network-touching code — same stack as the rest of Syndi_qa.

## Global Constraints

- No npm install, no new dependency, no CDN, no build step (project-wide rule, same as sphoto).
- `redmine-config.json` credentials must never be printed or logged.
- `cf_15` (Situação das Imagens) is never written by Syndi_qa — this feature is read-only against Redmine.
- Dates are compared as `YYYY-MM-DD` strings converted to `Date` only at calculation time — no timezone-sensitive logic.
- `hoje` is always an injected parameter in pure functions, never `new Date()` read internally — same principle as `gerarLinhaTxt`/`anexarTxtRetrabalho`.

---

## Confirmed Redmine field IDs (from spec section 1)

| Campo | cf_id |
|---|---|
| GTIN | 1 |
| OS | 2 |
| Situação das Imagens | 15 (`85` = Em Edição, `97` = Qualidade Aprovada = entregue) |
| DT Envio para Edição | 21 |
| Responsável Pós-Produção | 23 |
| Previsão entrega Pós-Produção | 34 |

---

### Task 1: `calcularProgresso` in `lib/qaSyndi.js`

**Files:**
- Modify: `lib/qaSyndi.js` (add function + export, near the bottom before `module.exports`)
- Test: `lib/qaSyndi.test.js` (append)

**Interfaces:**
- Produces: `calcularProgresso(dtEnvio, previsaoEntrega, situacao, hoje)` → `{ progresso: number|null, cor: 'verde'|'amarelo'|'vermelho'|'cinza' }`. `dtEnvio`/`previsaoEntrega`/`hoje` are `'YYYY-MM-DD'` strings or `null`/`undefined`. `situacao` is the raw Redmine custom-field value string (e.g. `'85'`, `'97'`) or `null`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/qaSyndi.test.js`:

```js
function addDias(dataISO, dias) {
    const d = new Date(dataISO + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

test('calcularProgresso: situacao 97 (entregue) e sempre 100% verde, mesmo sem datas', () => {
    const r = qaSyndi.calcularProgresso(null, null, '97', '2026-07-07');
    assert.deepEqual(r, { progresso: 100, cor: 'verde' });
});

test('calcularProgresso: situacao 97 (entregue) e 100% verde mesmo com prazo no futuro', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const r = qaSyndi.calcularProgresso(inicio, fim, '97', addDias(inicio, 10));
    assert.deepEqual(r, { progresso: 100, cor: 'verde' });
});

test('calcularProgresso: sem dtEnvio devolve cinza (sem dado suficiente)', () => {
    const r = qaSyndi.calcularProgresso(null, '2026-07-08', '85', '2026-07-07');
    assert.deepEqual(r, { progresso: null, cor: 'cinza' });
});

test('calcularProgresso: sem previsaoEntrega devolve cinza (sem dado suficiente)', () => {
    const r = qaSyndi.calcularProgresso('2026-07-06', null, '85', '2026-07-07');
    assert.deepEqual(r, { progresso: null, cor: 'cinza' });
});

test('calcularProgresso: 0% decorrido = verde', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', inicio);
    assert.deepEqual(r, { progresso: 0, cor: 'verde' });
});

test('calcularProgresso: 29% decorrido = verde (limite superior da faixa verde)', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 29);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 29, cor: 'verde' });
});

test('calcularProgresso: 30% decorrido = amarelo (limite inferior da faixa amarela)', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 30);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 30, cor: 'amarelo' });
});

test('calcularProgresso: 59% decorrido = amarelo (limite superior da faixa amarela)', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 59);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 59, cor: 'amarelo' });
});

test('calcularProgresso: 60% decorrido = vermelho (limite inferior da faixa vermelha)', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 60);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 60, cor: 'vermelho' });
});

test('calcularProgresso: prazo estourado sem entrega = 100% vermelho', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 250);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 100, cor: 'vermelho' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:\syndi_qa && npm test`
Expected: FAIL — `qaSyndi.calcularProgresso is not a function`

- [ ] **Step 3: Implement `calcularProgresso`**

Add to `lib/qaSyndi.js`, right before the `MOTIVOS_DEFAULT` block (after `resolverImagemSegura`, anywhere before `module.exports` works — place it near `aprovarGtin`/`retrabalharGtin` since it's part of the same "read-only status" concern):

```js
const SITUACAO_QUALIDADE_APROVADA = '97';

// Barra de progresso semaforo ate a previsao de entrega - ver spec secao 3
// (docs/superpowers/specs/2026-07-23-syndi-qa-agenda-edicao-design.md). Pura e
// testavel: hoje e sempre injetado, nunca lido de new Date() aqui dentro.
function calcularProgresso(dtEnvio, previsaoEntrega, situacao, hoje) {
    if (situacao === SITUACAO_QUALIDADE_APROVADA) {
        return { progresso: 100, cor: 'verde' };
    }
    if (!dtEnvio || !previsaoEntrega) {
        return { progresso: null, cor: 'cinza' };
    }
    const inicio = new Date(dtEnvio);
    const fim = new Date(previsaoEntrega);
    const agora = new Date(hoje);
    const totalMs = fim - inicio;
    // Prazo invertido/zerado (previsao <= envio) - trata como totalmente decorrido
    // em vez de dividir por zero/negativo, cai na faixa vermelha (>=60%).
    const percentualBruto = totalMs <= 0 ? 100 : ((agora - inicio) / totalMs) * 100;
    const progresso = Math.max(0, Math.min(100, percentualBruto));
    let cor;
    if (progresso < 30) cor = 'verde';
    else if (progresso < 60) cor = 'amarelo';
    else cor = 'vermelho';
    return { progresso, cor };
}
```

Add `calcularProgresso` to the `module.exports` object at the bottom of `lib/qaSyndi.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:\syndi_qa && npm test`
Expected: PASS (all new tests + the existing 43)

- [ ] **Step 5: Commit**

```bash
cd D:\syndi_qa
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: adiciona calcularProgresso para a barra semaforo da Agenda de Edicao"
```

---

### Task 2: `montarItemAgenda` in `lib/qaSyndi.js`

**Files:**
- Modify: `lib/qaSyndi.js`
- Test: `lib/qaSyndi.test.js` (append)

**Interfaces:**
- Consumes: `calcularProgresso(dtEnvio, previsaoEntrega, situacao, hoje)` from Task 1.
- Produces: `montarItemAgenda(issue, hoje)` → `{ issueId, os, gtin, produto, responsavel, previsaoEntrega, progresso, cor }`. `issue` is a raw Redmine issue object (`{ id, subject, custom_fields: [{id, value}, ...] }`), `hoje` is `'YYYY-MM-DD'`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/qaSyndi.test.js`:

```js
test('montarItemAgenda extrai gtin/produto/responsavel/previsao quando cf_1 esta preenchido', () => {
    const issue = {
        id: 555,
        subject: '7896061302107 - Produto Exemplo',
        custom_fields: [
            { id: 1, value: '7896061302107' },
            { id: 2, value: '49800' },
            { id: 15, value: '85' },
            { id: 21, value: '2026-07-06' },
            { id: 23, value: '32' },
            { id: 34, value: '2026-07-08' }
        ]
    };
    const resultado = qaSyndi.montarItemAgenda(issue, '2026-07-07');
    assert.deepEqual(resultado, {
        issueId: 555,
        os: '49800',
        gtin: '7896061302107',
        produto: 'Produto Exemplo',
        responsavel: '32',
        previsaoEntrega: '2026-07-08',
        progresso: 50,
        cor: 'amarelo'
    });
});

test('montarItemAgenda cai pro subject quando cf_1 nao esta preenchido', () => {
    const issue = {
        id: 556,
        subject: '7896061399999 - Outro Produto',
        custom_fields: []
    };
    const resultado = qaSyndi.montarItemAgenda(issue, '2026-07-07');
    assert.deepEqual(resultado, {
        issueId: 556,
        os: null,
        gtin: '7896061399999',
        produto: 'Outro Produto',
        responsavel: null,
        previsaoEntrega: null,
        progresso: null,
        cor: 'cinza'
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:\syndi_qa && npm test`
Expected: FAIL — `qaSyndi.montarItemAgenda is not a function`

- [ ] **Step 3: Implement `montarItemAgenda`**

Add right after `calcularProgresso` in `lib/qaSyndi.js`:

```js
const CF_AGENDA_GTIN = 1;
const CF_AGENDA_OS = 2;
const CF_AGENDA_SITUACAO_IMAGENS = 15;
const CF_AGENDA_DT_ENVIO_EDICAO = 21;
const CF_AGENDA_RESPONSAVEL_POS_PRODUCAO = 23;
const CF_AGENDA_PREVISAO_ENTREGA_POS_PRODUCAO = 34;

function valorCf(issue, id) {
    const campo = (issue.custom_fields || []).find(c => c.id === id);
    return (campo && campo.value) || null;
}

// Deriva uma linha da Agenda de Edicao a partir de uma issue Redmine crua - porta
// montarItemAgenda do sphoto (c:\sphoto\lib\qaHub.js), acrescentando responsavel e a
// barra de progresso (calcularProgresso). hoje e injetado, mesmo principio do resto
// do arquivo.
function montarItemAgenda(issue, hoje) {
    const gtin = valorCf(issue, CF_AGENDA_GTIN) || issue.subject.split(' - ')[0];
    const produto = issue.subject.startsWith(gtin) ? issue.subject.slice(gtin.length + 3) : issue.subject;
    const dtEnvio = valorCf(issue, CF_AGENDA_DT_ENVIO_EDICAO);
    const previsaoEntrega = valorCf(issue, CF_AGENDA_PREVISAO_ENTREGA_POS_PRODUCAO);
    const situacao = valorCf(issue, CF_AGENDA_SITUACAO_IMAGENS);
    const { progresso, cor } = calcularProgresso(dtEnvio, previsaoEntrega, situacao, hoje);

    return {
        issueId: issue.id,
        os: valorCf(issue, CF_AGENDA_OS),
        gtin,
        produto,
        responsavel: valorCf(issue, CF_AGENDA_RESPONSAVEL_POS_PRODUCAO),
        previsaoEntrega,
        progresso,
        cor
    };
}
```

Add `montarItemAgenda` to `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:\syndi_qa && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd D:\syndi_qa
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: adiciona montarItemAgenda para montar as linhas da Agenda de Edicao"
```

---

### Task 3: `buscarIssuesAgenda` in `lib/redmine.js`

**Files:**
- Modify: `lib/redmine.js`

**Interfaces:**
- Consumes: `redmineFetch(basePath, caminho, opcoes)` (already in the file, private).
- Produces: `buscarIssuesAgenda(basePath)` → `Promise<Array<rawIssue>>`, raw Redmine issue objects (with `custom_fields`) for every open GTIN issue with `cf_15` in `{85, 97}`.

No automated test — this function only does network I/O against the real Redmine (`redmineFetch`), matching the existing pattern in this file (`buscarIssueAbertaPorGtin`/`escreverCampoRedmine` have no `node:test` coverage either, only manual verification). Verified manually in Step 2.

- [ ] **Step 1: Implement `buscarIssuesAgenda`**

Add to `lib/redmine.js`, after `gravarCamposEdicao` and before `module.exports`:

```js
// Todas as issues GTIN abertas em edicao ou recem-aprovadas, pra Agenda de Edicao -
// cf_15 em {85 "Em Edicao", 97 "Qualidade Aprovada"}. Precisa das duas (nao so 85,
// diferente do montarAgendaEdicao do sphoto) senao o item some da lista assim que
// fica pronto, e a regra de "100% verde quando entregue" nunca teria o que mostrar -
// ver spec secao 2. Redmine REST nao faz OR nativo em custom field simples, entao sao
// duas buscas paginadas concatenadas (mesmo padrao de paginacao do buscarIssuesEmEdicao
// do sphoto).
async function buscarIssuesAgenda(basePath) {
    const SITUACOES = ['85', '97'];
    const PAGINA = 100;
    const TETO_PAGINAS = 10;
    let resultado = [];

    for (const situacao of SITUACOES) {
        for (let pagina = 0; pagina < TETO_PAGINAS; pagina++) {
            const resp = await redmineFetch(basePath, '/issues.json?tracker_id=2&status_id=open&cf_15=' + situacao +
                '&limit=' + PAGINA + '&offset=' + (pagina * PAGINA));
            if (!resp.ok) throw new Error('Redmine respondeu ' + resp.status + ' ao buscar issues da agenda (situacao ' + situacao + ')');
            const dados = await resp.json();
            const issues = dados.issues || [];
            resultado = resultado.concat(issues);
            const totalDaSituacao = dados.total_count || 0;
            if ((pagina + 1) * PAGINA >= totalDaSituacao || issues.length === 0) break;
        }
    }

    return resultado;
}
```

Add `buscarIssuesAgenda` to `module.exports`.

- [ ] **Step 2: Verify manually against the real Redmine**

Run: `cd D:\syndi_qa && node -e "require('./lib/redmine').buscarIssuesAgenda('.').then(issues => console.log(issues.length, issues.slice(0,2).map(i => ({id: i.id, subject: i.subject}))))"`

Expected: prints a count and a couple of `{id, subject}` samples, no error. If it errors with "redmine-config.json ausente", confirm the file exists (`ls redmine-config.json`) — do not print its contents.

- [ ] **Step 3: Commit**

```bash
cd D:\syndi_qa
git add lib/redmine.js
git commit -m "feat: adiciona buscarIssuesAgenda para consultar Em Edicao + Qualidade Aprovada"
```

---

### Task 4: `GET /api/agenda` route in `server.js`

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `redmine.buscarIssuesAgenda(BASE_PATH)` (Task 3), `qaSyndi.montarItemAgenda(issue, hoje)` (Task 2).
- Produces: `GET /api/agenda` → `{ ok: true, itens: [...] }` on success, `{ ok: false, error }` (500) on failure.

- [ ] **Step 1: Add a `hojeISO` helper and the route**

In `server.js`, add this helper function right after `enviarJson` (around line 61, before `const server = http.createServer(...)`):

```js
function hojeISO() {
    const agora = new Date();
    return agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');
}
```

Add the new route in `server.js` right after the `GET /api/motivos` block (after line 399, before the `/api/atualizacao/verificar` block):

```js
    // Agenda de Edicao - so leitura, nenhuma escrita no Redmine (ver spec
    // docs/superpowers/specs/2026-07-23-syndi-qa-agenda-edicao-design.md).
    if (req.method === 'GET' && req.url === '/api/agenda') {
        redmine.buscarIssuesAgenda(BASE_PATH).then(issues => {
            const hoje = hojeISO();
            const itens = issues.map(issue => qaSyndi.montarItemAgenda(issue, hoje));
            enviarJson(res, 200, { ok: true, itens });
        }).catch(err => {
            enviarJson(res, 500, { ok: false, error: err.message });
        });
        return;
    }
```

- [ ] **Step 2: Verify manually**

Start the server: `cd D:\syndi_qa && node server.js` (in a separate terminal/background), then:

Run: `curl http://localhost:3001/api/agenda`
Expected: `{"ok":true,"itens":[...]}` — each item with `os`, `gtin`, `produto`, `responsavel`, `previsaoEntrega`, `progresso`, `cor`. Stop the server after checking (`Ctrl+C` in that terminal, or close it) — do not leave a stray node process on port 3001.

- [ ] **Step 3: Commit**

```bash
cd D:\syndi_qa
git add server.js
git commit -m "feat: adiciona rota GET /api/agenda"
```

---

### Task 5: Front-end state and logic — `js/qa.js`

**Files:**
- Modify: `js/qa.js`

**Interfaces:**
- Consumes: `GET /api/agenda` (Task 4) via `fetch`.
- Produces: Vue refs/functions exposed to the template: `viewAtiva`, `mudarParaAgenda`, `agenda`, `carregandoAgenda`, `erroAgenda`, `carregarAgenda`, `filtroResponsavel`, `filtroPeriodoDe`, `filtroPeriodoAte`, `agendaFiltrada` (computed).

- [ ] **Step 1: Add `computed` to the Vue import**

In `js/qa.js` line 1, change:

```js
const { createApp, ref, reactive, nextTick, onMounted } = Vue;
```

to:

```js
const { createApp, ref, reactive, computed, nextTick, onMounted } = Vue;
```

- [ ] **Step 2: Add the new state refs**

In `js/qa.js`, right after the `opcoesResponsavel` ref (line 50, `const opcoesResponsavel = ref({});`), add:

```js

        // Agenda de Edicao - aba de topo separada da fila (viewAtiva), carregada sob
        // demanda na primeira vez que a aba abre (agendaCarregadaAlgumaVez), mesmo
        // principio do mudarParaAgenda do sphoto. Filtros (responsavel/periodo) sao
        // aplicados no front sobre o array ja carregado - base pequena, sem ida-e-volta
        // ao servidor por filtro.
        const viewAtiva = ref('fila'); // 'fila' | 'agenda'
        const agenda = ref([]);
        const carregandoAgenda = ref(false);
        const erroAgenda = ref('');
        let agendaCarregadaAlgumaVez = false;
        const filtroResponsavel = ref('todos'); // 'todos' | '32' (Virafilme) | '258' (Bright River)
        const filtroPeriodoDe = ref('');
        const filtroPeriodoAte = ref('');
```

- [ ] **Step 3: Add `carregarAgenda`/`mudarParaAgenda`/`agendaFiltrada`**

In `js/qa.js`, right after the `carregarOpcoesResponsavel` function (after line 85, the closing `}` of that function), add:

```js

        async function carregarAgenda() {
            carregandoAgenda.value = true;
            erroAgenda.value = '';
            try {
                const resp = await fetch(API + '/api/agenda');
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                agenda.value = dados.itens;
                agendaCarregadaAlgumaVez = true;
            } catch (err) {
                erroAgenda.value = 'Erro ao carregar agenda: ' + err.message + ' (server.js rodando?)';
            } finally {
                carregandoAgenda.value = false;
            }
        }

        function mudarParaAgenda() {
            viewAtiva.value = 'agenda';
            if (!agendaCarregadaAlgumaVez) carregarAgenda();
        }

        const agendaFiltrada = computed(() => agenda.value.filter(item => {
            if (filtroResponsavel.value !== 'todos' && String(item.responsavel) !== filtroResponsavel.value) return false;
            if (filtroPeriodoDe.value && (!item.previsaoEntrega || item.previsaoEntrega < filtroPeriodoDe.value)) return false;
            if (filtroPeriodoAte.value && (!item.previsaoEntrega || item.previsaoEntrega > filtroPeriodoAte.value)) return false;
            return true;
        }));
```

- [ ] **Step 4: Expose the new refs/functions in `return {}`**

In `js/qa.js`, the `return { ... }` block (around line 398-409) currently ends with:

```js
            painelEnvio, preparandoEnvio, formEnvio, opcoesResponsavel, abrirPainelEnvio, fecharPainelEnvio
        };
```

Change to:

```js
            painelEnvio, preparandoEnvio, formEnvio, opcoesResponsavel, abrirPainelEnvio, fecharPainelEnvio,
            viewAtiva, mudarParaAgenda, agenda, carregandoAgenda, erroAgenda, carregarAgenda,
            filtroResponsavel, filtroPeriodoDe, filtroPeriodoAte, agendaFiltrada
        };
```

- [ ] **Step 5: Syntax check**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: no output (exit code 0) — confirms the file parses. Full behavioral verification (the new tab actually working in the browser) happens in Task 6 Step 5, once the matching HTML exists.

- [ ] **Step 6: Commit**

```bash
cd D:\syndi_qa
git add js/qa.js
git commit -m "feat: adiciona estado e logica da Agenda de Edicao em js/qa.js"
```

---

### Task 6: Front-end markup — `syndi_qa.html`

**Files:**
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: `viewAtiva`, `mudarParaAgenda`, `agenda`, `carregandoAgenda`, `erroAgenda`, `carregarAgenda`, `filtroResponsavel`, `filtroPeriodoDe`, `filtroPeriodoAte`, `agendaFiltrada`, `opcoesResponsavel` (Task 5).

- [ ] **Step 1: Add the top tab bar to the header**

In `syndi_qa.html`, the header currently is (lines 15-19):

```html
        <header class="header">
            <div class="header-inner">
                <div class="header-left">
                    <span class="header-title">Syndi_qa</span>
                </div>
```

Change to:

```html
        <header class="header">
            <div class="header-inner">
                <div class="header-left">
                    <span class="header-title">Syndi_qa</span>
                </div>
                <div class="qa-top-tabs">
                    <button type="button" class="qa-top-tab-btn" :class="{ ativa: viewAtiva === 'fila' }" @click="viewAtiva = 'fila'">Fila de Conferência</button>
                    <button type="button" class="qa-top-tab-btn" :class="{ ativa: viewAtiva === 'agenda' }" @click="mudarParaAgenda">Agenda de Edição</button>
                </div>
```

- [ ] **Step 2: Make the "Atualizar fila" header button conditional**

Immediately below, still inside `header-right` (line 43-45):

```html
                    <button type="button" class="btn btn-sm btn-outline-light" @click="carregarFila" :disabled="carregandoFila">
                        <i class="bi bi-arrow-clockwise"></i> Atualizar fila
                    </button>
```

Change to:

```html
                    <button v-if="viewAtiva === 'fila'" type="button" class="btn btn-sm btn-outline-light" @click="carregarFila" :disabled="carregandoFila">
                        <i class="bi bi-arrow-clockwise"></i> Atualizar fila
                    </button>
                    <button v-else type="button" class="btn btn-sm btn-outline-light" @click="carregarAgenda" :disabled="carregandoAgenda">
                        <i class="bi bi-arrow-clockwise" :class="{ 'qa-girando': carregandoAgenda }"></i> Atualizar agenda
                    </button>
```

- [ ] **Step 3: Add the Agenda de Edição panel and scope the fila layout to its tab**

In `syndi_qa.html`, right after `</header>` and before `<div class="qa-layout">` (line 50), insert:

```html

        <div class="qa-agenda" v-show="viewAtiva === 'agenda'">
            <div class="qa-agenda-filtros">
                <div class="qa-agenda-filtro-responsavel">
                    <button type="button" class="qa-top-tab-btn" :class="{ ativa: filtroResponsavel === 'todos' }" @click="filtroResponsavel = 'todos'">Todos</button>
                    <button type="button" class="qa-top-tab-btn" :class="{ ativa: filtroResponsavel === '32' }" @click="filtroResponsavel = '32'">Virafilme (Best Image)</button>
                    <button type="button" class="qa-top-tab-btn" :class="{ ativa: filtroResponsavel === '258' }" @click="filtroResponsavel = '258'">Bright River</button>
                </div>
                <div class="qa-agenda-filtro-periodo">
                    <label>De <input type="date" v-model="filtroPeriodoDe"></label>
                    <label>Até <input type="date" v-model="filtroPeriodoAte"></label>
                </div>
            </div>

            <div v-if="carregandoAgenda && agenda.length === 0" class="qa-vazio">Carregando agenda...</div>
            <div v-else-if="erroAgenda" class="text-danger p-3">{{ erroAgenda }}</div>
            <div v-else-if="agendaFiltrada.length === 0" class="qa-vazio">Nenhum item de edição para os filtros atuais.</div>
            <table v-else class="qa-agenda-tabela">
                <thead>
                    <tr>
                        <th>OS</th>
                        <th>GTIN</th>
                        <th>Produto</th>
                        <th>Responsável</th>
                        <th>Previsão de Entrega</th>
                        <th>Progresso</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="item in agendaFiltrada" :key="item.issueId">
                        <td>{{ item.os || '-' }}</td>
                        <td>{{ item.gtin }}</td>
                        <td>{{ item.produto }}</td>
                        <td>{{ opcoesResponsavel[item.responsavel] || item.responsavel || '-' }}</td>
                        <td>
                            <span v-if="item.previsaoEntrega">{{ item.previsaoEntrega }}</span>
                            <span v-else class="text-muted">sem previsão</span>
                        </td>
                        <td>
                            <div v-if="item.progresso !== null" class="qa-progresso-barra">
                                <div class="qa-progresso-preenchido" :class="'qa-progresso-' + item.cor" :style="{ width: item.progresso + '%' }"></div>
                            </div>
                            <span v-else class="text-muted">sem dados</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
```

- [ ] **Step 4: Scope `qa-layout` to the "fila" tab**

Still in `syndi_qa.html`, the line right after the block just inserted is:

```html
        <div class="qa-layout">
```

Change to:

```html
        <div class="qa-layout" v-show="viewAtiva === 'fila'">
```

- [ ] **Step 5: Manual verification**

Start the server (`cd D:\syndi_qa && node server.js`), open `http://localhost:3001` in a browser, and check:
- The "Agenda de Edição" tab button appears next to the header title and switches the view when clicked.
- The fila (Fila de Conferência) view still works exactly as before when that tab is active.
- The agenda table loads once (network tab shows one `GET /api/agenda` call the first time the tab is opened, not on every click back-and-forth).
- The responsável filter buttons and the two date inputs narrow down the visible rows.
- Progress bars render with a visible color and width proportional to `progresso` (verify against known real data if available, or accept `sem dados`/`sem previsão` rows if the Redmine test data has gaps).

Stop the server afterward.

- [ ] **Step 6: Commit**

```bash
cd D:\syndi_qa
git add syndi_qa.html
git commit -m "feat: adiciona aba Agenda de Edicao ao syndi_qa.html"
```

---

### Task 7: Progress bar CSS — `css/qa.css`

**Files:**
- Modify: `css/qa.css`

**Interfaces:**
- Consumes: nothing (pure CSS).
- Produces: `.qa-progresso-barra`, `.qa-progresso-preenchido` (+ `.qa-progresso-verde`/`.qa-progresso-amarelo`/`.qa-progresso-vermelho`), `.qa-agenda-filtros`, `.qa-agenda-filtro-responsavel`, `.qa-agenda-filtro-periodo` classes used by `syndi_qa.html` (Task 6).

- [ ] **Step 1: Add the new CSS rules**

`css/qa.css` already has `.qa-top-tabs`/`.qa-top-tab-btn`/`.qa-layout`/`.qa-agenda`/`.qa-agenda-tabela`/`.qa-previsao-origem` (copied from sphoto during the asset-copy step, currently unused) — those are reused as-is by Task 6's markup, no changes needed to them. Only the progress bar and the filter row are genuinely new.

Add at the end of `css/qa.css`:

```css

/* Agenda de Edicao - filtros (responsavel + periodo) acima da tabela. */
.qa-agenda-filtros {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
}

.qa-agenda-filtro-responsavel {
    display: flex;
    gap: 4px;
}

.qa-agenda-filtro-periodo {
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 0.85rem;
    color: var(--text-muted);
}

.qa-agenda-filtro-periodo input[type="date"] {
    background-color: var(--bg-input);
    color: #fff;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 8px;
    margin-left: 6px;
}

/* Barra de progresso semaforo ate a previsao de entrega - ver
   docs/superpowers/specs/2026-07-23-syndi-qa-agenda-edicao-design.md secao 3. */
.qa-progresso-barra {
    width: 100%;
    max-width: 160px;
    height: 8px;
    border-radius: 4px;
    background-color: var(--bg-input);
    overflow: hidden;
}

.qa-progresso-preenchido {
    height: 100%;
    border-radius: 4px;
}

.qa-progresso-verde { background-color: #2e7d32; }
.qa-progresso-amarelo { background-color: #f9a825; }
.qa-progresso-vermelho { background-color: #c62828; }
```

- [ ] **Step 2: Manual verification**

With the server running and `syndi_qa.html` open (same session as Task 6 Step 5), confirm the progress bars show green/yellow/red fill colors matching each row's `cor`, and the filter row lays out with the responsável buttons on the left and the two date pickers on the right.

- [ ] **Step 3: Commit**

```bash
cd D:\syndi_qa
git add css/qa.css
git commit -m "feat: adiciona CSS da barra de progresso e filtros da Agenda de Edicao"
```

---

## Post-plan: update memory

After this plan is fully implemented and merged, update `C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md` (and `MEMORY.md` if needed): mark "Agenda de Edição tab" as built (not just deferred), note the newly-discovered `cf_21`/`cf_34` field IDs, and move "Operational scripts" up as the next queued sub-project. This is a memory-system update, not a code task — do it in the finishing conversation, not as a plan step.
