# Correções QA de Foto / QA para Edição Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three real bugs found in production use of the already-merged "QA de Foto"/"QA para Edição" tabs: (1) the Responsável Pós-Produção inference rule was too simple and assigned the wrong vendor in real cases, (2) the "QA para Edição" tab's cached suggestion goes stale when the analyst reorganizes the folder afterward, (3) clicking a photo's body doesn't zoom it (only a dedicated button does), which is not the expected interaction.

**Architecture:** All three fixes are surgical edits to already-existing, already-tested code — no new files, no new routes. Fix 1 replaces `inferirCamposEdicao`'s decision logic in `lib/qaSyndi.js` (pure function, fully covered by a rewritten `node:test` suite). Fix 2 adds a small cache-invalidation call to the three existing tagging functions in `js/qa.js`. Fix 3 swaps one `@click` binding and adds a checkbox in `syndi_qa.html`, reusing the existing `selecionarFoto` function (changed to a toggle).

**Tech Stack:** Node.js core only, Vue 3 Composition API (no build), `node:test` for the one pure-function rewrite — same stack as the rest of Syndi_qa.

## Global Constraints

- No npm install, no new dependency, no CDN, no build step.
- `inferirCamposEdicao` is used by BOTH the Aprovar panel (`/api/aprovar/preparar`) and the aba "QA para Edição" (`/api/edicao/detalhe`) — fixing it here fixes both call sites for free; no route/caller changes needed.
- The quantity field (`qtdMockup`/`qtdRecorte`) reflects which destino subpasta is physically marked (Mockup or Recorte), independent of which responsável the rule assigns — never invent a quantity for a case where neither subpasta is marked.
- `origemCampoEdicao` fields the analyst has already edited manually must never be overwritten by the cache-invalidation refresh (Fix 2) — this protection already exists in `aplicarDetalheEdicao`, do not touch it.

---

## Confirmed decision table (from spec section 1)

M = Mockup subpasta marked, R = Recorte subpasta marked, S = at least one RT/IS/AP subpasta has a photo, C = at least one root photo has the `_coding` suffix.

| M | R | S | C | Resultado |
|---|---|---|---|---|
| X | X | - | - | indefinido (conflito) |
| X | - | - | - | Virafilme (Best Image) |
| X | - | X | - | Virafilme (Best Image) |
| - | X | - | X | Bright River |
| - | X | X | X | Virafilme (Best Image) |
| - | X | X | - | Virafilme (Best Image) — extrapolação, ver spec seção 1 |
| - | X | - | sem C | indefinido |
| - | - | X | - | Virafilme (Best Image), sem quantidade |
| - | - | - | X | Bright River (fallback) |
| - | - | - | - | indefinido |

---

### Task 1: `inferirCamposEdicao` — regra de responsável corrigida

**Files:**
- Modify: `lib/qaSyndi.js`
- Test: `lib/qaSyndi.test.js` (replace the existing `inferirCamposEdicao` test block)

**Interfaces:**
- Produces: `inferirCamposEdicao(pastaGtinPath)` — same signature and return shape as today (`{ destino, motivo, campos }`), only the internal decision logic changes. No caller (`server.js`'s two routes) needs any change.

- [ ] **Step 1: Write the failing tests**

In `lib/qaSyndi.test.js`, find this exact block (currently lines 299-361):

```js
test('inferirCamposEdicao com Mockup marcado infere Virafilme e conta sem _coding', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1.jpg'), 'b');
    fs.writeFileSync(path.join(dirTemp, 'foto_2_coding.jpg'), 'c');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32', qtdMockup: '2' });
});

test('inferirCamposEdicao com Recorte marcado infere Bright River', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'eua');
    assert.deepEqual(r.campos, { responsavel: '258', qtdRecorte: '1' });
});

test('inferirCamposEdicao com Mockup E Recorte e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
    assert.match(r.motivo, /Mockup e Recorte/);
});

test('inferirCamposEdicao com Mockup mas todas as fotos _coding e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0_coding.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});

test('inferirCamposEdicao sem subpasta mas com _coding cai no fallback Recorte', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1.jpg'), 'b');
    fs.writeFileSync(path.join(dirTemp, 'foto_2_coding.jpg'), 'c');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'eua');
    assert.deepEqual(r.campos, { responsavel: '258', qtdRecorte: '2' });
});

test('inferirCamposEdicao sem subpasta e sem _coding e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});
```

Replace it entirely with:

```js
test('inferirCamposEdicao com Mockup marcado infere Virafilme e conta sem _coding', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1.jpg'), 'b');
    fs.writeFileSync(path.join(dirTemp, 'foto_2_coding.jpg'), 'c');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32', qtdMockup: '2' });
});

test('inferirCamposEdicao com Mockup marcado infere Virafilme mesmo com subpasta RT/IS/AP (M manda mais que S)', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_rt.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32', qtdMockup: '1' });
});

test('inferirCamposEdicao com Mockup mas todas as fotos _coding e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0_coding.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});

test('inferirCamposEdicao com Mockup E Recorte e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
    assert.match(r.motivo, /Mockup e Recorte/);
});

test('inferirCamposEdicao com Recorte marcado e foto _coding, sem subpasta RT/IS/AP, infere Bright River', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1_coding.jpg'), 'b');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'eua');
    assert.deepEqual(r.campos, { responsavel: '258', qtdRecorte: '1' });
});

test('inferirCamposEdicao com Recorte marcado e subpasta RT/IS/AP com fotos infere Virafilme (subpasta manda mais que _coding)', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.mkdirSync(path.join(dirTemp, 'IS'));
    fs.writeFileSync(path.join(dirTemp, 'IS', 'foto_is.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1_coding.jpg'), 'b');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32', qtdRecorte: '1' });
});

test('inferirCamposEdicao com Recorte marcado e subpasta RT/IS/AP mas sem _coding ainda infere Virafilme (extrapolacao: subpasta manda sozinha)', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.mkdirSync(path.join(dirTemp, 'AP'));
    fs.writeFileSync(path.join(dirTemp, 'AP', 'foto_ap.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32', qtdRecorte: '1' });
});

test('inferirCamposEdicao com Recorte marcado e subpasta RT/IS/AP mas todas as fotos da raiz _coding e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_rt.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0_coding.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});

test('inferirCamposEdicao com Recorte marcado, sem subpasta RT/IS/AP e sem _coding e indefinido (Recorte sozinho nao decide mais)', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});

test('inferirCamposEdicao sem Mockup/Recorte mas com subpasta RT/IS/AP com fotos infere Virafilme sem quantidade', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_rt.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32' });
});

test('inferirCamposEdicao sem subpasta nenhuma mas com _coding cai no fallback Bright River', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1.jpg'), 'b');
    fs.writeFileSync(path.join(dirTemp, 'foto_2_coding.jpg'), 'c');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'eua');
    assert.deepEqual(r.campos, { responsavel: '258', qtdRecorte: '2' });
});

test('inferirCamposEdicao sem subpasta nenhuma e sem _coding e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `cd D:\syndi_qa && npm test`
Expected: FAIL — several `inferirCamposEdicao` assertions don't match the current (old) implementation, especially the ones involving RT/IS/AP subpastas (S) and the Recorte-without-`_coding` case (now expected `indefinido`, currently returns `eua`/Bright River).

- [ ] **Step 3: Replace `inferirCamposEdicao`'s implementation**

In `lib/qaSyndi.js`, find this exact function (currently lines 187-222):

```js
function inferirCamposEdicao(pastaGtinPath) {
    const temMockup = fs.existsSync(path.join(pastaGtinPath, 'Mockup'));
    const temRecorte = fs.existsSync(path.join(pastaGtinPath, 'Recorte'));
    const arquivosRaiz = listarImagensDir(pastaGtinPath).map(i => i.nome);
    const semCoding = arquivosRaiz.filter(nome => !temSufixo(nome, '_coding'));
    const comCoding = arquivosRaiz.filter(nome => temSufixo(nome, '_coding'));

    if (temMockup && temRecorte) {
        return { destino: 'indefinido', motivo: 'Pasta tem subpasta Mockup e Recorte ao mesmo tempo', campos: {} };
    }

    // Mockup e o unico sinal certo de Brasil (Virafilme). Se todas as fotos da raiz
    // forem _coding, nao sobrou produto de verdade pra contar - indefinido em vez de "0".
    if (temMockup) {
        if (semCoding.length === 0) {
            return { destino: 'indefinido', motivo: 'Subpasta Mockup marcada mas todas as fotos da raiz sao _coding - nenhuma foto de produto pra contar', campos: {} };
        }
        return { destino: 'brasil', motivo: null, campos: { responsavel: OPCAO_VIRA_FILMES, qtdMockup: String(semCoding.length) } };
    }

    if (temRecorte) {
        if (semCoding.length === 0) {
            return { destino: 'indefinido', motivo: 'Subpasta Recorte marcada mas todas as fotos da raiz sao _coding - nenhuma foto de produto pra contar', campos: {} };
        }
        return { destino: 'eua', motivo: null, campos: { responsavel: OPCAO_BRIGHT_RIVER, qtdRecorte: String(semCoding.length) } };
    }

    // Sem subpasta e sem nenhuma _coding: sem sinal nenhum, o analista decide na mao.
    if (comCoding.length === 0) {
        return { destino: 'indefinido', motivo: 'Sem subpasta Mockup/Recorte e sem nenhuma foto _coding - sem sinal de destino', campos: {} };
    }

    // Tem _coding mas nenhuma subpasta marcada: meio caminho andado - cai em Recorte/
    // Bright River por padrao (mesmo fallback do sphoto), campos continuam editaveis.
    return { destino: 'eua', motivo: null, campos: { responsavel: OPCAO_BRIGHT_RIVER, qtdRecorte: String(semCoding.length) } };
}
```

Replace with:

```js
// Deriva os defaults do formulario de envio pra edicao a partir do que existe na
// pasta do GTIN - tudo aqui e so sugestao, o analista pode sobrescrever na tela.
// Portado de inferirCampos() do sphoto (c:\sphoto\lib\qaHub.js) com duas diferencas:
// (1) NAO inclui Situacao das Imagens nos campos - quem grava isso e o robo, nunca
// o Syndi_qa; (2) chaves amigaveis (responsavel/qtdRecorte/qtdMockup) em vez de ids
// de cf - o mapeamento pra cf_23/cf_176/cf_175 mora em lib/redmine.js.
//
// Regra de responsavel corrigida (ver docs/superpowers/specs/2026-07-28-syndi-qa-correcoes-qa-design.md
// secao 1) - Recorte sozinho NAO decide mais Bright River sozinho: precisa ter foto
// _coding, e se ja existir subpasta RT/IS/AP com fotos (sinal de trabalho local ja em
// andamento), isso pesa mais que _coding e o resultado vira Virafilme, nao Bright River.
function inferirCamposEdicao(pastaGtinPath) {
    const temMockup = fs.existsSync(path.join(pastaGtinPath, 'Mockup'));
    const temRecorte = fs.existsSync(path.join(pastaGtinPath, 'Recorte'));
    const temSubpastaTag = SUBPASTAS_TAG.some(tag => {
        const pastaTag = path.join(pastaGtinPath, tag);
        return fs.existsSync(pastaTag) && fs.readdirSync(pastaTag).length > 0;
    });
    const arquivosRaiz = listarImagensDir(pastaGtinPath).map(i => i.nome);
    const semCoding = arquivosRaiz.filter(nome => !temSufixo(nome, '_coding'));
    const comCoding = arquivosRaiz.filter(nome => temSufixo(nome, '_coding'));

    if (temMockup && temRecorte) {
        return { destino: 'indefinido', motivo: 'Pasta tem subpasta Mockup e Recorte ao mesmo tempo', campos: {} };
    }

    // Mockup e o unico sinal certo de Brasil (Virafilme), independente de _coding/subpasta RT-IS-AP.
    if (temMockup) {
        if (semCoding.length === 0) {
            return { destino: 'indefinido', motivo: 'Subpasta Mockup marcada mas todas as fotos da raiz sao _coding - nenhuma foto de produto pra contar', campos: {} };
        }
        return { destino: 'brasil', motivo: null, campos: { responsavel: OPCAO_VIRA_FILMES, qtdMockup: String(semCoding.length) } };
    }

    if (temRecorte) {
        // Ja tem subpasta RT/IS/AP com fotos - sinal mais forte de trabalho local
        // (Virafilme) do que _coding sozinho indicaria (Bright River).
        if (temSubpastaTag) {
            if (semCoding.length === 0) {
                return { destino: 'indefinido', motivo: 'Subpasta Recorte marcada mas todas as fotos da raiz sao _coding - nenhuma foto de produto pra contar', campos: {} };
            }
            return { destino: 'brasil', motivo: null, campos: { responsavel: OPCAO_VIRA_FILMES, qtdRecorte: String(semCoding.length) } };
        }
        // Sem subpasta RT/IS/AP: Recorte sozinho nao decide mais - precisa ter pelo
        // menos uma foto _coding pra virar Bright River.
        if (comCoding.length === 0) {
            return { destino: 'indefinido', motivo: 'Subpasta Recorte marcada mas nenhuma foto _coding - sem sinal suficiente pra decidir o responsavel', campos: {} };
        }
        return { destino: 'eua', motivo: null, campos: { responsavel: OPCAO_BRIGHT_RIVER, qtdRecorte: String(semCoding.length) } };
    }

    // Sem Mockup/Recorte marcado, mas ja tem subpasta RT/IS/AP com fotos - sinal de
    // trabalho local (Virafilme). Sem subpasta de destino marcada, nao ha contagem
    // de quantidade pra sugerir - o analista preenche na mao.
    if (temSubpastaTag) {
        return { destino: 'brasil', motivo: null, campos: { responsavel: OPCAO_VIRA_FILMES } };
    }

    // Sem subpasta nenhuma e sem nenhuma _coding: sem sinal nenhum, o analista decide na mao.
    if (comCoding.length === 0) {
        return { destino: 'indefinido', motivo: 'Sem subpasta Mockup/Recorte/RT-IS-AP e sem nenhuma foto _coding - sem sinal de destino', campos: {} };
    }

    // Tem _coding mas nenhuma subpasta marcada: meio caminho andado - cai em Recorte/
    // Bright River por padrao (mesmo fallback do sphoto), campos continuam editaveis.
    return { destino: 'eua', motivo: null, campos: { responsavel: OPCAO_BRIGHT_RIVER, qtdRecorte: String(semCoding.length) } };
}
```

`SUBPASTAS_TAG` is already defined earlier in this file (`const SUBPASTAS_TAG = ['RT', 'IS', 'AP'];`) and already in scope — no new import/constant needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:\syndi_qa && npm test`
Expected: PASS (all tests, including the 13 `inferirCamposEdicao` tests replacing the previous 6 — net baseline goes from 60 to 67)

- [ ] **Step 5: Commit**

```bash
cd D:\syndi_qa
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "fix: corrige regra de inferencia de Responsavel Pos-Producao (Recorte nao decide mais sozinho)"
```

---

### Task 2: Invalidar sugestão da aba "QA para Edição" ao reorganizar a pasta

**Files:**
- Modify: `js/qa.js`

**Interfaces:**
- Consumes: `carregarDetalheEdicao()`, `abaDetalhe` (ref), `edicaoCarregadaParaGtin` (module-scoped `let`) — all already defined in `js/qa.js`.
- Produces: `invalidarSugestaoEdicao()` — new function, not exposed to the template (internal use only, called from the three tagging functions below).

- [ ] **Step 1: Add the invalidation helper**

In `js/qa.js`, find the `abrirAbaEdicao` function (search for `function abrirAbaEdicao`). Immediately BEFORE it, insert:

```js

        // Qualquer mudanca na organizacao da pasta (tagging) invalida a sugestao ja
        // carregada da aba "QA para Edicao" - ela recarrega sozinha na proxima vez que a
        // aba abrir, ou imediatamente se ja estiver aberta. Campos que o analista ja
        // editou manualmente (origemCampoEdicao 'manual') continuam intocados - essa
        // protecao ja existe em aplicarDetalheEdicao, nao muda. Ver
        // docs/superpowers/specs/2026-07-28-syndi-qa-correcoes-qa-design.md secao 2.
        function invalidarSugestaoEdicao() {
            edicaoCarregadaParaGtin = null;
            if (abaDetalhe.value === 'edicao') carregarDetalheEdicao();
        }
```

- [ ] **Step 2: Call it from the three tagging functions**

In `js/qa.js`, find `toggleCoding` (search for `async function toggleCoding`). Its body has this line:

```js
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
            } catch (err) {
                alert('Erro ao marcar _coding: ' + err.message);
```

Change to:

```js
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
                invalidarSugestaoEdicao();
            } catch (err) {
                alert('Erro ao marcar _coding: ' + err.message);
```

Find `toggleSubpasta` (search for `async function toggleSubpasta`). Its body has this line:

```js
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
            } catch (err) {
                alert('Erro ao mover para ' + pasta + ': ' + err.message);
```

Change to:

```js
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
                invalidarSugestaoEdicao();
            } catch (err) {
                alert('Erro ao mover para ' + pasta + ': ' + err.message);
```

Find `marcarDestinoManual` (search for `async function marcarDestinoManual`). Its body has this line:

```js
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
            } catch (err) {
                alert('Erro ao marcar destino: ' + err.message);
```

Change to:

```js
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
                invalidarSugestaoEdicao();
            } catch (err) {
                alert('Erro ao marcar destino: ' + err.message);
```

- [ ] **Step 3: Change `selecionarFoto` into a toggle (needed by Task 3's checkbox)**

In `js/qa.js`, find:

```js
        function selecionarFoto(nomeFoto) {
            fotoAtiva.value = nomeFoto;
        }
```

Change to:

```js
        // Agora e um toggle (era so "seleciona") porque o gatilho virou um checkbox
        // dedicado (ver syndi_qa.html) em vez do clique no corpo da foto - o corpo
        // passou a ampliar. Ver docs/superpowers/specs/2026-07-28-syndi-qa-correcoes-qa-design.md secao 3.
        function selecionarFoto(nomeFoto) {
            fotoAtiva.value = fotoAtiva.value === nomeFoto ? null : nomeFoto;
        }
```

- [ ] **Step 4: Syntax check**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: no output (exit code 0).

- [ ] **Step 5: Commit**

```bash
cd D:\syndi_qa
git add js/qa.js
git commit -m "fix: invalida sugestao da aba QA para Edicao ao reorganizar a pasta; selecionarFoto vira toggle"
```

---

### Task 3: Clique na foto amplia; checkbox novo seleciona pra retrabalho

**Files:**
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: `ampliarImagem(nomeComposto, lista)`, `selecionarFoto(nomeFoto)` (now a toggle, Task 3 Step 3), `fotoAtiva` — all already exposed by `js/qa.js`.

- [ ] **Step 1: Root grid — click body zooms, add checkbox**

In `syndi_qa.html`, find this exact block:

```html
                            <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.raiz" :key="img.nome">
                                <div
                                    class="qa-miniatura"
                                    :class="{ ativa: fotoAtiva === img.nome, marcada: !!marcadas[img.nome], 'tem-coding': img.nome.includes('_coding') }"
                                    @click="selecionarFoto(img.nome)"
                                >
                                    <img :src="urlImagem(img.nome)" :alt="img.nome" loading="lazy">
                                </div>
                                <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                <div class="qa-acoes-mini">
                                    <button type="button" class="qa-acao-mini coding" :class="{ ativa: img.nome.includes('_coding') }" title="Marcar/desmarcar _coding" @click="toggleCoding(img.nome)">C</button>
                                    <button type="button" class="qa-acao-mini rt" title="Mover para Rótulo" @click="toggleSubpasta(img.nome, 'RT')">RT</button>
                                    <button type="button" class="qa-acao-mini is" title="Mover para Insumos" @click="toggleSubpasta(img.nome, 'IS')">IS</button>
                                    <button type="button" class="qa-acao-mini ap" title="Mover para Apoio" @click="toggleSubpasta(img.nome, 'AP')">AP</button>
                                    <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(img.nome, detalhe.imagens.raiz.map(i => i.nome))"><i class="bi bi-zoom-in"></i></button>
                                </div>
                            </div>
```

Change to:

```html
                            <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.raiz" :key="img.nome">
                                <div
                                    class="qa-miniatura"
                                    :class="{ ativa: fotoAtiva === img.nome, marcada: !!marcadas[img.nome], 'tem-coding': img.nome.includes('_coding') }"
                                    @click="ampliarImagem(img.nome, detalhe.imagens.raiz.map(i => i.nome))"
                                >
                                    <img :src="urlImagem(img.nome)" :alt="img.nome" loading="lazy">
                                </div>
                                <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                <div class="qa-acoes-mini">
                                    <input type="checkbox" class="qa-checkbox-retrabalho" title="Selecionar para retrabalho" :checked="fotoAtiva === img.nome" @change="selecionarFoto(img.nome)">
                                    <button type="button" class="qa-acao-mini coding" :class="{ ativa: img.nome.includes('_coding') }" title="Marcar/desmarcar _coding" @click="toggleCoding(img.nome)">C</button>
                                    <button type="button" class="qa-acao-mini rt" title="Mover para Rótulo" @click="toggleSubpasta(img.nome, 'RT')">RT</button>
                                    <button type="button" class="qa-acao-mini is" title="Mover para Insumos" @click="toggleSubpasta(img.nome, 'IS')">IS</button>
                                    <button type="button" class="qa-acao-mini ap" title="Mover para Apoio" @click="toggleSubpasta(img.nome, 'AP')">AP</button>
                                    <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(img.nome, detalhe.imagens.raiz.map(i => i.nome))"><i class="bi bi-zoom-in"></i></button>
                                </div>
                            </div>
```

(The dedicated lupa button stays — now redundant with the body click, but harmless to keep, per spec section 3.)

- [ ] **Step 2: Subpasta grid (RT/IS/AP) — same pattern**

In `syndi_qa.html`, find this exact block:

```html
                                    <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.subpastas[tag]" :key="img.nome">
                                        <div
                                            class="qa-miniatura"
                                            :class="{ ativa: fotoAtiva === (tag + '/' + img.nome), marcada: !!marcadas[tag + '/' + img.nome], ['tem-' + tag.toLowerCase()]: true }"
                                            @click="selecionarFoto(tag + '/' + img.nome)"
                                        >
                                            <img :src="urlImagem(tag + '/' + img.nome)" :alt="img.nome" loading="lazy">
                                        </div>
                                        <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                        <div class="qa-acoes-mini">
                                            <button type="button" class="qa-acao-mini voltar" title="Tirar da subpasta" @click="toggleSubpasta(img.nome, tag)">Voltar p/ raiz</button>
                                            <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(tag + '/' + img.nome, detalhe.imagens.subpastas[tag].map(i => tag + '/' + i.nome))"><i class="bi bi-zoom-in"></i></button>
                                        </div>
                                    </div>
```

Change to:

```html
                                    <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.subpastas[tag]" :key="img.nome">
                                        <div
                                            class="qa-miniatura"
                                            :class="{ ativa: fotoAtiva === (tag + '/' + img.nome), marcada: !!marcadas[tag + '/' + img.nome], ['tem-' + tag.toLowerCase()]: true }"
                                            @click="ampliarImagem(tag + '/' + img.nome, detalhe.imagens.subpastas[tag].map(i => tag + '/' + i.nome))"
                                        >
                                            <img :src="urlImagem(tag + '/' + img.nome)" :alt="img.nome" loading="lazy">
                                        </div>
                                        <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                        <div class="qa-acoes-mini">
                                            <input type="checkbox" class="qa-checkbox-retrabalho" title="Selecionar para retrabalho" :checked="fotoAtiva === (tag + '/' + img.nome)" @change="selecionarFoto(tag + '/' + img.nome)">
                                            <button type="button" class="qa-acao-mini voltar" title="Tirar da subpasta" @click="toggleSubpasta(img.nome, tag)">Voltar p/ raiz</button>
                                            <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(tag + '/' + img.nome, detalhe.imagens.subpastas[tag].map(i => tag + '/' + i.nome))"><i class="bi bi-zoom-in"></i></button>
                                        </div>
                                    </div>
```

- [ ] **Step 3: Manual end-to-end verification**

Start the server (`cd D:\syndi_qa && node server.js`, background). Port 3001 is this project's own port — never touch port 3000 (unrelated production system on this machine).

Run: `curl -s http://localhost:3001/ | grep -o "qa-checkbox-retrabalho"` — expected: prints `qa-checkbox-retrabalho` twice (root + subpasta grid), confirming the checkboxes are in the served HTML.

Then, with a real GTIN that has photos (root and, if available, at least one RT/IS/AP-tagged photo):
- Click directly on a photo's image (not the lupa button) — it should open the zoom modal.
- Check the new checkbox next to a photo — the motivos panel below should appear for that photo (same as the old click-to-select behavior), and the checkbox should show checked. Unchecking it should hide the motivos panel for that photo (deselect).
- Mark `_coding`/move to a subpasta/mark Mockup or Recorte on a GTIN, switch to "QA para Edição" (or, if already there, watch it update immediately) — confirm the Responsável/Quantidade suggestion reflects the new folder state, not the stale one from before the tagging action. A field the analyst already typed into manually should NOT reset.
- With a GTIN that has a Recorte subpasta marked and at least one RT-tagged photo (no `_coding` needed), open "QA para Edição" — Responsável should suggest Virafilme (Best Image), not Bright River (this is the core Fix 1 regression check — before this plan, it would have said Bright River based on Recorte alone).

Stop the server afterward (kill only the PID you started; confirm port 3001 is free via `netstat -ano | grep :3001`).

- [ ] **Step 4: Commit**

```bash
cd D:\syndi_qa
git add syndi_qa.html
git commit -m "fix: clique no corpo da foto amplia; checkbox dedicado seleciona pra retrabalho"
```

---

## Post-plan: update memory

After this plan is fully implemented and merged, update
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md` (and `MEMORY.md` if
needed): correct the description of `inferirCamposEdicao`'s rule (it's no longer "Mockup→Virafilme,
Recorte→Bright River" — note the new decision table and where to find it), and note the
click-to-zoom/checkbox-to-select UX change so future work on the photo grid doesn't assume the old
click-to-select behavior. This is a memory-system update, not a code task — do it in the finishing
conversation, not as a plan step.
