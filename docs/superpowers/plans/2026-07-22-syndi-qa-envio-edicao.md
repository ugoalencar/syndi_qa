# Syndi_qa — Sub-projeto 2: Envio pra Edição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao aprovar um GTIN, abrir um formulário com Responsável Pós-Produção + Qtd Recorte + Qtd Mockup pré-inferidos (a partir de Mockup/Recorte e `_coding` já existentes), editáveis, e gravar esses campos no Redmine antes de mover a pasta pra `AgEnvio` — sem nunca tocar em `Situação das Imagens` (que continua sendo do robô).

**Architecture:** `lib/qaSyndi.js` ganha `inferirCamposEdicao` (porta da `inferirCampos` do sphoto, sem o campo Situação e sem pareamento JPG+RAW); `lib/redmine.js` ganha `montarCamposEdicao` (pura, testável) + `gravarCamposEdicao` (um PUT só com os campos não-vazios); `server.js` ganha `GET /api/aprovar/preparar` e o `POST /api/aprovar` passa a gravar no Redmine ANTES do move (falha bloqueia — diferente do retrabalho). Front-end abre um painel editável no lugar do aprovar imediato.

**Tech Stack:** Node.js core (`fetch` nativo do Node 22), Vue 3 Composition API, `node:test`.

## Global Constraints

- Sem CDN, sem `npm install`, sem dependência nova.
- **Nunca escrever `Situação das Imagens` (cf_15)** — single-owner do robô `syncIMG.jar`.
- IDs do Redmine (confirmados em `c:\sphoto\redmine-campos.json` e `c:\sphoto\lib\qaHub.js`): Responsável Pós-Produção = cf_23; Qtd Imagens Mockup = cf_175; Qtd Imagens Recorte = cf_176; opção Virafilme(Best Image) = `'32'`; opção Bright River = `'258'`.
- Inferência conta só fotos da **raiz** (RT/IS/AP nunca contam), excluindo as com sufixo `_coding`.
- Falha ao gravar no Redmine **impede** o aprovar (pasta não é movida) — diferente do retrabalho, que segue com aviso. Exceção: se os 3 campos vierem vazios, o Redmine é pulado por completo e o move acontece (escolha explícita do analista).
- `redmine-campos.json` NÃO é segredo (o sphoto serve ele por HTTP de propósito) — é versionado no git e NÃO entra em `ARQUIVOS_BLOQUEADOS`.
- Sem detecção de conflito otimista (`updated_on`) — decisão deliberada da spec, seção 5.
- Testes de lógica pura em `lib/*.js` com `node:test` + pastas temporárias; rotas HTTP via curl manual.
- **Esta máquina tem um sphoto de produção real na porta 3000.** Nunca usar a porta 3000 nos testes manuais (Syndi_qa usa 3001), nunca matar/reiniciar processos nela.

---

## Task 1: `inferirCamposEdicao` em `lib/qaSyndi.js`

**Files:**
- Modify: `lib/qaSyndi.js`
- Modify: `lib/qaSyndi.test.js`

**Interfaces:**
- Produces: `inferirCamposEdicao(pastaGtinPath)` → `{ destino: 'brasil'|'eua'|'indefinido', motivo: string|null, campos: { responsavel?, qtdRecorte?, qtdMockup? } }` (campos com **chaves amigáveis**, valores string; `campos` é `{}` quando indefinido — as chaves de cf numérico ficam só dentro de `lib/redmine.js`, o contrato da API usa esses nomes amigáveis, conforme a seção 4 da spec).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `lib/qaSyndi.test.js`:

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

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FALHA — `qaSyndi.inferirCamposEdicao is not a function` (6 testes novos falhando, 33 anteriores passando).

- [ ] **Step 3: Implementar em `lib/qaSyndi.js`**

Adicionar, logo depois da função `marcarDestinoSyndi` (antes do comentário `// Resolve o caminho absoluto de uma foto...`):

```js
// Opcoes do campo Responsavel Pos-Producao (cf_23) no Redmine - so as duas que a
// inferencia usa (ver c:\sphoto\redmine-campos.json pro mapa completo, servido
// estatico pro front popular o select).
const OPCAO_VIRA_FILMES = '32';
const OPCAO_BRIGHT_RIVER = '258';

function temSufixo(nome, sufixo) {
    const ext = path.extname(nome);
    return nome.slice(0, -ext.length).endsWith(sufixo);
}

// Deriva os defaults do formulario de envio pra edicao a partir do que existe na
// pasta do GTIN - tudo aqui e so sugestao, o analista pode sobrescrever na tela.
// Portado de inferirCampos() do sphoto (c:\sphoto\lib\qaHub.js) com duas diferencas:
// (1) NAO inclui Situacao das Imagens nos campos - quem grava isso e o robo, nunca
// o Syndi_qa; (2) chaves amigaveis (responsavel/qtdRecorte/qtdMockup) em vez de ids
// de cf - o mapeamento pra cf_23/cf_176/cf_175 mora em lib/redmine.js.
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

No `module.exports`, adicionar `inferirCamposEdicao`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS — 39 testes, 0 falhas (33 + 6).

- [ ] **Step 5: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: inferirCamposEdicao porta a inferencia de responsavel/quantidade do sphoto"
```

---

## Task 2: `gravarCamposEdicao` em `lib/redmine.js` + `redmine-campos.json`

**Files:**
- Modify: `lib/redmine.js`
- Create: `lib/redmine.test.js` (modify — já existe com 3 testes de `carregarConfigRedmine`)
- Create: `redmine-campos.json` (cópia de `c:\sphoto\redmine-campos.json`)

**Interfaces:**
- Consumes: `redmineFetch`, `buscarIssueAbertaPorGtin` (já existem em `lib/redmine.js`)
- Produces: `montarCamposEdicao(campos)` → `Array<{id, value}>` (pura: `{responsavel, qtdRecorte, qtdMockup}` com valores string possivelmente vazios; vazio não entra); `gravarCamposEdicao(basePath, gtin, campos)` → `{ gravado: false }` se nada a gravar, `{ gravado: true, issueId }` se gravou, lança `Error` se não achar issue aberta ou o PUT falhar.

- [ ] **Step 1: Copiar `redmine-campos.json`**

```bash
cp /c/sphoto/redmine-campos.json redmine-campos.json
git status --porcelain
```

Expected: `redmine-campos.json` aparece como untracked (será commitado — não é segredo, o sphoto serve esse arquivo por HTTP de propósito e o `.gitignore` do sphoto não o cobre).

- [ ] **Step 2: Escrever os testes que falham**

Adicionar ao final de `lib/redmine.test.js`:

```js
test('montarCamposEdicao mapeia os 3 campos pros cf ids certos', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32', qtdRecorte: '3', qtdMockup: '5' });
    assert.deepEqual(lista, [
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' }
    ]);
});

test('montarCamposEdicao pula campos vazios', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '258', qtdRecorte: '', qtdMockup: '' });
    assert.deepEqual(lista, [{ id: 23, value: '258' }]);
});

test('montarCamposEdicao devolve vazio quando nada foi preenchido', () => {
    assert.deepEqual(redmine.montarCamposEdicao({ responsavel: '', qtdRecorte: '', qtdMockup: '' }), []);
    assert.deepEqual(redmine.montarCamposEdicao({}), []);
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test`
Expected: FALHA — `redmine.montarCamposEdicao is not a function`.

- [ ] **Step 4: Implementar em `lib/redmine.js`**

Adicionar, logo depois da função `marcarRetrabalhoFotografia` (antes do `module.exports`):

```js
// IDs dos custom_fields do formulario de envio pra edicao (ver redmine-campos.json).
// Situacao das Imagens (cf_15) NAO entra aqui de proposito - quem grava e o robo.
const CF_RESPONSAVEL_POS_PRODUCAO = 23;
const CF_QTD_IMAGENS_MOCKUP = 175;
const CF_QTD_IMAGENS_RECORTE = 176;

// Monta o array de custom_fields pro PUT a partir dos campos do formulario - pura e
// testavel. Campo vazio nao entra (nao sobrescreve o que ja estiver no Redmine).
function montarCamposEdicao(campos) {
    const lista = [];
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    return lista;
}

// Grava Responsavel/Quantidades na issue aberta do GTIN, num PUT so. Todos os campos
// vazios = nada a gravar, devolve { gravado: false } sem tocar na rede (escolha
// explicita do analista de nao preencher). Lanca erro se nao achar issue aberta ou o
// PUT falhar - quem chama (POST /api/aprovar) BLOQUEIA o aprovar nesse caso, diferente
// do retrabalho: sem responsavel/quantidade o editor nao sabe o que fazer com o material.
async function gravarCamposEdicao(basePath, gtin, campos) {
    const customFields = montarCamposEdicao(campos);
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
        throw new Error('Redmine respondeu ' + resp.status + ' ao gravar campos de edicao: ' + texto);
    }
    return { gravado: true, issueId: issue.id };
}
```

No `module.exports`, adicionar `montarCamposEdicao` e `gravarCamposEdicao`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS — 42 testes, 0 falhas (39 + 3).

- [ ] **Step 6: Commit**

```bash
git add lib/redmine.js lib/redmine.test.js redmine-campos.json
git commit -m "feat: gravarCamposEdicao escreve responsavel/quantidades num PUT so"
```

---

## Task 3: Rotas — `GET /api/aprovar/preparar` + `POST /api/aprovar` com Redmine

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `qaSyndi.inferirCamposEdicao` (Task 1), `redmine.gravarCamposEdicao` (Task 2), helpers existentes (`isNomeSeguro`, `enviarJson`, `lerCorpo`, `localizarPastaDecoradaPorPrefixo`)
- Produces: `GET /api/aprovar/preparar?os=&gtin=` → `{ ok, destino, motivo, campos }`; `POST /api/aprovar` passa a aceitar `{ os, gtin, responsavel, qtdRecorte, qtdMockup }` (os 3 novos opcionais, string) e grava no Redmine ANTES do move.

- [ ] **Step 1: Inserir a rota `preparar`**

Usar Edit para inserir o bloco abaixo em `server.js`, imediatamente antes de `    if (req.method === 'POST' && req.url === '/api/aprovar') {`:

```js
    // Campos inferidos pro formulario de envio pra edicao (responsavel/quantidades) -
    // so leitura, nada e gravado nem movido aqui.
    if (req.method === 'GET' && req.url.startsWith('/api/aprovar/preparar')) {
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
        const inferido = qaSyndi.inferirCamposEdicao(path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome));
        enviarJson(res, 200, { ok: true, destino: inferido.destino, motivo: inferido.motivo || null, campos: inferido.campos });
        return;
    }

```

- [ ] **Step 2: Modificar o `POST /api/aprovar`**

Trocar `lerCorpo(req).then(corpo => {` desse handler por `lerCorpo(req).then(async corpo => {`.

Logo depois do bloco de validação `if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) { ... }` desse handler, inserir:

```js
            const responsavel = typeof dados.responsavel === 'string' ? dados.responsavel.trim() : '';
            const qtdRecorte = typeof dados.qtdRecorte === 'string' ? dados.qtdRecorte.trim() : '';
            const qtdMockup = typeof dados.qtdMockup === 'string' ? dados.qtdMockup.trim() : '';
            if (!/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup)) {
                enviarJson(res, 400, { ok: false, error: 'responsavel/qtdRecorte/qtdMockup devem ser numericos ou vazios' });
                return;
            }
```

Trocar o bloco final do handler:

```js
            try {
                const resultado = qaSyndi.aprovarGtin(qaSyndi.AGCONFERENCIA, qaSyndi.AGENVIO, pastaOsNome, pastaGtinNome);
                enviarJson(res, 200, { ok: true, destino: resultado.destino });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
```

por:

```js
            // Grava Responsavel/Quantidades ANTES de mover - falha aqui IMPEDE o aprovar
            // (diferente do retrabalho, que segue com aviso): sem esses campos o editor
            // nao sabe o que fazer com o material. Campos todos vazios = pula o Redmine
            // (escolha explicita do analista). Situacao das Imagens continua do robo.
            let redmineGravado = false;
            try {
                const r = await redmine.gravarCamposEdicao(BASE_PATH, gtin, { responsavel, qtdRecorte, qtdMockup });
                redmineGravado = r.gravado;
            } catch (err) {
                console.error('Erro ao gravar campos de edicao no Redmine para GTIN', gtin, err);
                enviarJson(res, 500, { ok: false, error: 'Nao foi possivel gravar no Redmine - o GTIN NAO foi enviado: ' + err.message });
                return;
            }
            try {
                const resultado = qaSyndi.aprovarGtin(qaSyndi.AGCONFERENCIA, qaSyndi.AGENVIO, pastaOsNome, pastaGtinNome);
                enviarJson(res, 200, { ok: true, destino: resultado.destino, redmineGravado });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
```

- [ ] **Step 3: Verificar manualmente**

```bash
mkdir -p /tmp/syndiqa-envio/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/0000000000000/Mockup
echo a > /tmp/syndiqa-envio/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/0000000000000/foto_0.jpg
echo b > /tmp/syndiqa-envio/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/0000000000000/foto_1_coding.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-envio"}' > caminhos-locais.json
node server.js &
sleep 1

echo "--- preparar (espera responsavel 32 / qtdMockup 1) ---"
curl -s "http://localhost:3001/api/aprovar/preparar?os=1&gtin=0000000000000"
echo
echo "--- aprovar com responsavel (espera FALHA: GTIN sem ficha no Redmine, pasta NAO movida) ---"
curl -s -X POST http://localhost:3001/api/aprovar -H "Content-Type: application/json" \
  -d '{"os":"1","gtin":"0000000000000","responsavel":"32","qtdRecorte":"","qtdMockup":"1"}'
echo
ls "/tmp/syndiqa-envio/AgConferencia/OS_1---(1 GTINs)---2026-07-22/" 2>/dev/null && echo "(pasta ainda em AgConferencia - correto)"
echo "--- aprovar com tudo vazio (espera OK, redmineGravado false, pasta movida) ---"
curl -s -X POST http://localhost:3001/api/aprovar -H "Content-Type: application/json" \
  -d '{"os":"1","gtin":"0000000000000","responsavel":"","qtdRecorte":"","qtdMockup":""}'
echo
ls "/tmp/syndiqa-envio/AgEnvio/OS_1---(1 GTINs)---2026-07-22/" 2>/dev/null && echo "(pasta em AgEnvio - correto)"
echo "--- aprovar com valor nao-numerico (espera 400) ---"
curl -s -X POST http://localhost:3001/api/aprovar -H "Content-Type: application/json" \
  -d '{"os":"1","gtin":"123","responsavel":"abc","qtdRecorte":"","qtdMockup":""}'

kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-envio
```

(O GTIN `0000000000000` não existe no Redmine de propósito — testa o caminho de bloqueio sem dados reais. Se quiser confirmar o caminho de sucesso, repita com um GTIN real de ficha aberta e confira no Redmine os 3 campos gravados.)

- [ ] **Step 4: Rodar `npm test` (sem regressão)**

Run: `npm test`
Expected: PASS — 42 testes.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: aprovar grava responsavel/quantidades no Redmine antes de mover"
```

---

## Task 4: Front-end — painel de envio pra edição

**Files:**
- Modify: `js/qa.js`
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: `GET /api/aprovar/preparar`, `POST /api/aprovar` com o novo contrato (Task 3), `GET /redmine-campos.json` (estático, Task 2)
- Produces: `painelEnvio` (`ref<{destino, motivo}|null>`), `preparandoEnvio` (`ref<boolean>`), `formEnvio` (`reactive {responsavel, qtdRecorte, qtdMockup}`), `opcoesResponsavel` (`ref<{}>`), `abrirPainelEnvio()`, `fecharPainelEnvio()`; `aprovarGtin()` passa a exigir painel aberto e envia os campos do formulário.

- [ ] **Step 1: Estado e funções em `js/qa.js`**

Adicionar, logo depois de `const listaAmpliada = ref([]);`:

```js
        // Painel de envio pra edicao - abre no "Aprovar GTIN" com os campos inferidos
        // da pasta (Mockup/Recorte + contagem sem _coding), editaveis antes de
        // confirmar. Situacao das Imagens nao aparece aqui de proposito: quem grava
        // e o robo SyncIMGSend, nunca o Syndi_qa.
        const painelEnvio = ref(null); // { destino, motivo } aberto, null fechado
        const preparandoEnvio = ref(false);
        const formEnvio = reactive({ responsavel: '', qtdRecorte: '', qtdMockup: '' });
        const opcoesResponsavel = ref({});
```

Adicionar, logo depois da função `carregarMotivosDisponiveis`:

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

Em `selecionarGtin`, logo depois de `fotoAtiva.value = null;`, adicionar:

```js
            painelEnvio.value = null;
```

Adicionar, logo antes de `async function aprovarGtin()`:

```js
        async function abrirPainelEnvio() {
            if (!selecionado.value || temMarcacao() || preparandoEnvio.value) return;
            preparandoEnvio.value = true;
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/aprovar/preparar?os=' + encodeURIComponent(selecionado.value.os) + '&gtin=' + encodeURIComponent(selecionado.value.gtin));
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                formEnvio.responsavel = dados.campos.responsavel || '';
                formEnvio.qtdRecorte = dados.campos.qtdRecorte || '';
                formEnvio.qtdMockup = dados.campos.qtdMockup || '';
                painelEnvio.value = { destino: dados.destino, motivo: dados.motivo };
            } catch (err) {
                erro.value = 'Erro ao preparar envio: ' + err.message;
            } finally {
                preparandoEnvio.value = false;
            }
        }

        function fecharPainelEnvio() {
            painelEnvio.value = null;
        }
```

Substituir a função `aprovarGtin` inteira por:

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
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                fecharPainelEnvio();
                mensagem.value = dados.redmineGravado
                    ? 'GTIN aprovado, campos gravados no Redmine e enviado para edição.'
                    : 'GTIN aprovado e enviado para edição (nenhum campo gravado no Redmine).';
                await carregarFila();
                // So limpa a selecao depois de um tempo pro usuario ver a mensagem de
                // sucesso. Zerar selecionado/detalhe no mesmo tick que a mensagem escondia
                // a mensagem na hora (ela fica dentro do "v-else" que depende de selecionado).
                fecharDepoisDeConcluir();
            } catch (err) {
                erro.value = 'Erro ao aprovar: ' + err.message;
            } finally {
                aprovando.value = false;
            }
        }
```

Adicionar `carregarOpcoesResponsavel();` logo depois de `carregarMotivosDisponiveis();` (nas chamadas de inicialização).

No `return { ... }` do `setup()`, adicionar `painelEnvio, preparandoEnvio, formEnvio, opcoesResponsavel, abrirPainelEnvio, fecharPainelEnvio`.

- [ ] **Step 2: Painel e botão em `syndi_qa.html`**

Trocar o botão "Aprovar GTIN":

```html
                            <button type="button" class="btn btn-primary btn-sm" :disabled="temMarcacao() || aprovando || !!mensagem" @click="aprovarGtin">
                                <i class="bi bi-check2-circle"></i> Aprovar GTIN
                            </button>
```

por:

```html
                            <button type="button" class="btn btn-primary btn-sm" :disabled="temMarcacao() || preparandoEnvio || !!painelEnvio || aprovando || !!mensagem" @click="abrirPainelEnvio">
                                <i class="bi bi-check2-circle"></i> Aprovar GTIN
                            </button>
```

Inserir o painel, logo antes de `<div class="qa-enviar-conferencia mt-3">`:

```html
                        <div v-if="painelEnvio" class="qa-editadas-recebidas">
                            <div class="qa-editadas-header"><span>Enviar para Edição</span></div>
                            <div v-if="painelEnvio.destino === 'indefinido'" class="qa-conflito-aviso">
                                <i class="bi bi-exclamation-triangle-fill"></i>
                                Não foi possível inferir automaticamente: {{ painelEnvio.motivo }}. Preencha os campos manualmente (ou confirme sem preencher pra não gravar nada no Redmine).
                            </div>
                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Responsável Pós-Produção</span>
                                <select class="form-select form-select-sm w-auto" v-model="formEnvio.responsavel">
                                    <option value="">-</option>
                                    <option v-for="(rotulo, id) in opcoesResponsavel" :key="id" :value="id">{{ rotulo }}</option>
                                </select>
                            </div>
                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Qtd Imagens Recorte</span>
                                <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="formEnvio.qtdRecorte">
                            </div>
                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Qtd Imagens Mockup</span>
                                <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="formEnvio.qtdMockup">
                            </div>
                            <button type="button" class="btn btn-primary btn-sm" :disabled="aprovando || !!mensagem" @click="aprovarGtin">
                                <i class="bi bi-cloud-upload"></i> Confirmar e Enviar
                            </button>
                            <button type="button" class="btn btn-outline-light btn-sm ms-2" :disabled="aprovando" @click="fecharPainelEnvio">Cancelar</button>
                        </div>
```

(As classes `qa-editadas-recebidas`/`qa-editadas-header`/`qa-campo-linha`/`qa-campo-label`/`qa-conflito-aviso` já existem em `css/qa.css` — nenhum CSS novo é necessário.)

- [ ] **Step 3: Verificar manualmente com Playwright**

```bash
mkdir -p /tmp/syndiqa-form/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/Mockup
printf '\xff\xd8\xff\xe0a' > "/tmp/syndiqa-form/AgConferencia/OS_1---(1 GTINs)---2026-07-22/1234567890123/foto_0.jpg"
printf '\xff\xd8\xff\xe0b' > "/tmp/syndiqa-form/AgConferencia/OS_1---(1 GTINs)---2026-07-22/1234567890123/foto_1_coding.jpg"
echo '{"syncimgSendBase":"/tmp/syndiqa-form"}' > caminhos-locais.json
node server.js &
sleep 1
```

Usando a skill `webapp-testing` (Playwright), abrir `http://localhost:3001/`, selecionar o GTIN, e confirmar:
1. Clicar "Aprovar GTIN" NÃO move nada — abre o painel "Enviar para Edição".
2. O select mostra "Virafilme(Best Image) Terceiro" pré-selecionado (valor `32`) e Qtd Mockup = 1 (a foto `_coding` não conta).
3. "Cancelar" fecha o painel sem mover nada (GTIN continua na fila).
4. Reabrir, clicar "Confirmar e Enviar" — como o GTIN `1234567890123` não tem ficha no Redmine, aparece o erro "Nao foi possivel gravar no Redmine - o GTIN NAO foi enviado" e a pasta continua em `AgConferencia` (bloqueio funcionando ponta a ponta).
5. Limpar o select (opção "-") e as quantidades, "Confirmar e Enviar" de novo — agora aprova (Redmine pulado), mensagem "(nenhum campo gravado no Redmine)", GTIN some da fila, pasta aparece em `AgEnvio`.

```bash
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-form
```

- [ ] **Step 4: Rodar `npm test` (sem regressão)**

Run: `npm test`
Expected: PASS — 42 testes.

- [ ] **Step 5: Commit**

```bash
git add js/qa.js syndi_qa.html
git commit -m "feat: painel de envio pra edicao com responsavel/quantidades editaveis"
```

---

## Task 5: Verificação end-to-end final

**Files:** nenhum arquivo novo — checklist cobrindo o fluxo completo.

- [ ] **Step 1: Rodar toda a suíte automatizada**

Run: `npm test`
Expected: PASS — 42 testes, 0 falhas.

- [ ] **Step 2: Cenário completo com Playwright**

Fixture: 1 GTIN com 3 fotos na raiz, nenhuma subpasta marcada. Usando a skill `webapp-testing`:
1. Marcar destino "Recorte" pelo seletor da tela.
2. Marcar `_coding` numa das fotos.
3. Clicar "Aprovar GTIN" — painel abre com Bright River pré-selecionado e Qtd Recorte = 2 (inferência refletindo o que acabou de ser marcado na mesma sessão).
4. Editar Qtd Recorte pra 5 manualmente, confirmar — com GTIN de teste sem ficha no Redmine, valida o bloqueio; limpar os campos e confirmar de novo valida o caminho de aprovação sem Redmine.
5. Confirmar que o fluxo de retrabalho continua intacto: selecionar outro GTIN (ou recriar a fixture), marcar motivo numa foto e confirmar retrabalho normalmente.

- [ ] **Step 3: Commit final (se algo precisou de ajuste nos passos acima)**

```bash
git add -A
git commit -m "chore: ajustes finais da verificacao end-to-end do sub-projeto 2 (envio pra edicao)"
```

(Pular este commit se nada precisou de ajuste.)
