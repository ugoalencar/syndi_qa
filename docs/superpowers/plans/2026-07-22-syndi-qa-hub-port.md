# Syndi_qa — Sub-projeto 1: Portar o QA Hub do sphoto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar do sphoto pro Syndi_qa o tagging de fotos (RT/IS/AP, `_coding`, Mockup/Recorte) e o zoom de miniatura, renomeando `qa.html` → `syndi_qa.html`, sem tocar no ciclo Aprovar/Retrabalho já validado.

**Architecture:** Mesmo padrão já usado no projeto — `lib/qaSyndi.js` ganha funções puras e testáveis que operam em `pastaGtinPath` (sem pareamento JPG+RAW, diferente do sphoto, porque aqui é só JPEG); `server.js` ganha 3 rotas finas que resolvem OS/GTIN e delegam pra essas funções; `syndi_qa.html`/`js/qa.js` ganham os elementos visuais e handlers do sphoto, adaptados aos nomes/rotas já existentes no Syndi_qa (`urlImagem`, `selecionarFoto`, `marcadas`).

**Tech Stack:** Node.js core, Vue 3 Composition API, Bootstrap (modal já carregado), `node:test`.

## Global Constraints

- Sem CDN, sem `npm install`, sem dependência nova.
- Fotos do Syndi_qa são sempre JPEG — sem pareamento JPG+RAW (diferente do sphoto).
- GTIN continua a unidade de decisão pro ciclo Aprovar/Retrabalho — este plano **não altera**
  `aprovarGtin`, `retrabalharGtin`, nem as rotas `/api/aprovar`/`/api/retrabalho`.
- Path traversal: as 3 rotas novas usam o mesmo padrão de validação (`isNomeSeguro`,
  `localizarPastaDecoradaPorPrefixo`) já usado em `/api/gtin`/`/api/imagem`. O parâmetro `nome`
  destas 3 rotas novas é sempre um **nome de arquivo puro** (sem `/`, valida com `isNomeSeguro`)
  — diferente do `nome` de `/api/imagem`, que aceita prefixo de subpasta (`RT/foto.jpg`).
- Testes de lógica pura em `lib/qaSyndi.js` usam `node:test` com pastas temporárias. Rotas HTTP
  são verificadas manualmente via `curl`.
- **Esta máquina tem um sphoto de produção real na porta 3000.** Nunca usar a porta 3000 pros
  testes manuais (Syndi_qa usa 3001 por padrão), nunca matar/reiniciar processos nela.

---

## Task 1: Tagging em `lib/qaSyndi.js` (RT/IS/AP, `_coding`, Mockup/Recorte)

**Files:**
- Modify: `lib/qaSyndi.js`
- Modify: `lib/qaSyndi.test.js`

**Interfaces:**
- Produces: `SUBPASTAS_DESTINO` (`['Mockup', 'Recorte']`); `moverParaSubpastaSyndi(pastaGtinPath, nomeArquivo, pasta)` → `{ destino: 'raiz' | pasta }`, lança erro se `pasta` não for RT/IS/AP ou se o arquivo não existir; `toggleCodingSyndi(pastaGtinPath, nomeArquivo)` → `{ novoNome }`, lança erro se o arquivo não existir; `marcarDestinoSyndi(pastaGtinPath, tipo)` → `void`, lança erro se `tipo` não for `'Mockup'`/`'Recorte'`/`null`; `listarImagensGtin` (já existe) passa a incluir `destino: 'Mockup' | 'Recorte' | null` no objeto de retorno.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `lib/qaSyndi.test.js`:

```js
test('moverParaSubpastaSyndi move da raiz pra subpasta e de volta (toggle)', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r1 = qaSyndi.moverParaSubpastaSyndi(dirTemp, 'foto_0.jpg', 'RT');
    assert.equal(r1.destino, 'RT');
    assert.equal(fs.existsSync(path.join(dirTemp, 'foto_0.jpg')), false);
    assert.equal(fs.existsSync(path.join(dirTemp, 'RT', 'foto_0.jpg')), true);

    const r2 = qaSyndi.moverParaSubpastaSyndi(dirTemp, 'foto_0.jpg', 'RT');
    assert.equal(r2.destino, 'raiz');
    assert.equal(fs.existsSync(path.join(dirTemp, 'foto_0.jpg')), true);
    assert.equal(fs.existsSync(path.join(dirTemp, 'RT', 'foto_0.jpg')), false);
});

test('moverParaSubpastaSyndi move entre subpastas diferentes', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_0.jpg'), 'a');

    const r = qaSyndi.moverParaSubpastaSyndi(dirTemp, 'foto_0.jpg', 'IS');
    assert.equal(r.destino, 'IS');
    assert.equal(fs.existsSync(path.join(dirTemp, 'RT', 'foto_0.jpg')), false);
    assert.equal(fs.existsSync(path.join(dirTemp, 'IS', 'foto_0.jpg')), true);
});

test('moverParaSubpastaSyndi lanca erro pra pasta invalida', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    assert.throws(() => qaSyndi.moverParaSubpastaSyndi(dirTemp, 'foto_0.jpg', 'XX'), /Pasta deve ser RT, IS ou AP/);
});

test('moverParaSubpastaSyndi lanca erro quando arquivo nao existe', () => {
    const dirTemp = criarDirTemp();
    assert.throws(() => qaSyndi.moverParaSubpastaSyndi(dirTemp, 'nao-existe.jpg', 'RT'), /Arquivo nao encontrado/);
});

test('toggleCodingSyndi adiciona e remove o sufixo _coding', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r1 = qaSyndi.toggleCodingSyndi(dirTemp, 'foto_0.jpg');
    assert.equal(r1.novoNome, 'foto_0_coding.jpg');
    assert.equal(fs.existsSync(path.join(dirTemp, 'foto_0_coding.jpg')), true);

    const r2 = qaSyndi.toggleCodingSyndi(dirTemp, 'foto_0_coding.jpg');
    assert.equal(r2.novoNome, 'foto_0.jpg');
    assert.equal(fs.existsSync(path.join(dirTemp, 'foto_0.jpg')), true);
});

test('toggleCodingSyndi lanca erro quando arquivo nao existe', () => {
    const dirTemp = criarDirTemp();
    assert.throws(() => qaSyndi.toggleCodingSyndi(dirTemp, 'nao-existe.jpg'), /Arquivo nao encontrado/);
});

test('marcarDestinoSyndi cria e remove as subpastas-sinal Mockup/Recorte', () => {
    const dirTemp = criarDirTemp();

    qaSyndi.marcarDestinoSyndi(dirTemp, 'Mockup');
    assert.equal(fs.existsSync(path.join(dirTemp, 'Mockup')), true);
    assert.equal(fs.existsSync(path.join(dirTemp, 'Recorte')), false);

    qaSyndi.marcarDestinoSyndi(dirTemp, 'Recorte');
    assert.equal(fs.existsSync(path.join(dirTemp, 'Mockup')), false);
    assert.equal(fs.existsSync(path.join(dirTemp, 'Recorte')), true);

    qaSyndi.marcarDestinoSyndi(dirTemp, null);
    assert.equal(fs.existsSync(path.join(dirTemp, 'Mockup')), false);
    assert.equal(fs.existsSync(path.join(dirTemp, 'Recorte')), false);
});

test('marcarDestinoSyndi lanca erro pra tipo invalido', () => {
    const dirTemp = criarDirTemp();
    assert.throws(() => qaSyndi.marcarDestinoSyndi(dirTemp, 'Outro'), /tipo deve ser/);
});

test('listarImagensGtin inclui destino Mockup/Recorte quando marcado', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    const imagens = qaSyndi.listarImagensGtin(dirTemp);
    assert.equal(imagens.destino, 'Mockup');
});

test('listarImagensGtin destino e null quando nenhuma subpasta-sinal existe', () => {
    const dirTemp = criarDirTemp();
    const imagens = qaSyndi.listarImagensGtin(dirTemp);
    assert.equal(imagens.destino, null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FALHA — `qaSyndi.moverParaSubpastaSyndi is not a function` (e as outras funções novas).

- [ ] **Step 3: Implementar em `lib/qaSyndi.js`**

Adicionar, logo depois da constante `SUBPASTAS_TAG` (linha `const SUBPASTAS_TAG = ['RT', 'IS', 'AP'];`):

```js
const SUBPASTAS_DESTINO = ['Mockup', 'Recorte'];
```

Adicionar, depois da função `listarImagensGtin` e antes do comentário `// Resolve o caminho absoluto de uma foto...` (que antecede `resolverImagemSegura`):

```js
// Acha onde o arquivo esta agora dentro da pasta do GTIN: null = raiz, tag = numa
// subpasta RT/IS/AP, undefined = nao encontrado em lugar nenhum.
function localizarArquivoAtual(pastaGtinPath, nomeArquivo) {
    if (fs.existsSync(path.join(pastaGtinPath, nomeArquivo))) return null;
    for (const tag of SUBPASTAS_TAG) {
        if (fs.existsSync(path.join(pastaGtinPath, tag, nomeArquivo))) return tag;
    }
    return undefined;
}

// Toggle RT/IS/AP: se o arquivo ja esta na subpasta pedida, volta pra raiz; senao,
// move da raiz (ou de outra subpasta de tag) pra la. Adaptado de moverParaSubpasta do
// sphoto, sem a logica de pares JPG+RAW - aqui e sempre um arquivo so.
function moverParaSubpastaSyndi(pastaGtinPath, nomeArquivo, pasta) {
    if (!SUBPASTAS_TAG.includes(pasta)) {
        throw new Error('Pasta deve ser RT, IS ou AP');
    }
    const pastaAtual = localizarArquivoAtual(pastaGtinPath, nomeArquivo);
    if (pastaAtual === undefined) {
        throw new Error('Arquivo nao encontrado: ' + nomeArquivo);
    }
    const vaiParaRaiz = pastaAtual === pasta;
    const origem = pastaAtual ? path.join(pastaGtinPath, pastaAtual, nomeArquivo) : path.join(pastaGtinPath, nomeArquivo);
    const destino = vaiParaRaiz ? path.join(pastaGtinPath, nomeArquivo) : path.join(pastaGtinPath, pasta, nomeArquivo);
    if (!vaiParaRaiz) fs.mkdirSync(path.join(pastaGtinPath, pasta), { recursive: true });
    fs.renameSync(origem, destino);
    return { destino: vaiParaRaiz ? 'raiz' : pasta };
}

// Adiciona ou remove o sufixo "_coding" do nome do arquivo (antes da extensao).
// Adaptado de handleMarcarQa do sphoto, sem pareamento JPG+RAW.
function toggleCodingSyndi(pastaGtinPath, nomeArquivo) {
    const caminhoAtual = path.join(pastaGtinPath, nomeArquivo);
    if (!fs.existsSync(caminhoAtual)) {
        throw new Error('Arquivo nao encontrado: ' + nomeArquivo);
    }
    const ext = path.extname(nomeArquivo);
    const semExt = nomeArquivo.slice(0, -ext.length);
    const sufixo = '_coding';
    const novoNome = semExt.endsWith(sufixo)
        ? semExt.slice(0, -sufixo.length) + ext
        : semExt + sufixo + ext;
    fs.renameSync(caminhoAtual, path.join(pastaGtinPath, novoNome));
    return { novoNome };
}

function removerSePastaVaziaSyndi(pastaTag) {
    if (!fs.existsSync(pastaTag)) return;
    if (fs.readdirSync(pastaTag).length === 0) fs.rmdirSync(pastaTag);
}

// Marca/desmarca o tipo de pos-producao do GTIN criando/removendo uma subpasta-sinal
// vazia (Mockup ou Recorte) - a mera existencia da pasta e o sinal, nenhuma foto entra
// nela. tipo=null desmarca as duas. Identico a handleMarcarDestino do sphoto.
function marcarDestinoSyndi(pastaGtinPath, tipo) {
    if (tipo !== null && !SUBPASTAS_DESTINO.includes(tipo)) {
        throw new Error('tipo deve ser "Mockup", "Recorte" ou null');
    }
    SUBPASTAS_DESTINO.forEach(tag => {
        const pastaTag = path.join(pastaGtinPath, tag);
        if (tipo === tag) {
            fs.mkdirSync(pastaTag, { recursive: true });
        } else {
            removerSePastaVaziaSyndi(pastaTag);
        }
    });
}
```

Substituir a função `listarImagensGtin` inteira por (adiciona o campo `destino` no retorno):

```js
function listarImagensGtin(pastaGtinPath) {
    const raiz = listarImagensDir(pastaGtinPath);
    const subpastas = {};
    SUBPASTAS_TAG.forEach(tag => {
        const imagens = listarImagensDir(path.join(pastaGtinPath, tag));
        if (imagens.length) subpastas[tag] = imagens;
    });
    let destino = null;
    SUBPASTAS_DESTINO.forEach(tag => {
        if (fs.existsSync(path.join(pastaGtinPath, tag))) destino = tag;
    });
    return { raiz, subpastas, destino };
}
```

No `module.exports`, adicionar `moverParaSubpastaSyndi`, `toggleCodingSyndi`, `marcarDestinoSyndi`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS — 33 testes, 0 falhas (23 anteriores + 10 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: tagging RT/IS/AP, _coding e Mockup/Recorte em lib/qaSyndi.js"
```

---

## Task 2: Rotas de tagging em `server.js`

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `qaSyndi.moverParaSubpastaSyndi`, `qaSyndi.toggleCodingSyndi`, `qaSyndi.marcarDestinoSyndi` (Task 1)
- Produces: `POST /api/tag-subpasta`, `POST /api/marcar-coding`, `POST /api/marcar-destino`

- [ ] **Step 1: Inserir as 3 rotas em `server.js`**

Usar Edit para inserir o bloco abaixo logo depois do fechamento do handler `/api/imagem` (a linha `    }` que fecha esse bloco, antes de `if (req.method === 'POST' && req.url === '/api/aprovar') {`):

```js
    if (req.method === 'POST' && req.url === '/api/tag-subpasta') {
        lerCorpo(req).then(corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            const nome = dados.nome;
            const pasta = dados.pasta;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin) || !isNomeSeguro(nome)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin/nome invalidos' });
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
            const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
            try {
                const resultado = qaSyndi.moverParaSubpastaSyndi(pastaGtinPath, nome, pasta);
                enviarJson(res, 200, { ok: true, destino: resultado.destino });
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/marcar-coding') {
        lerCorpo(req).then(corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            const nome = dados.nome;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin) || !isNomeSeguro(nome)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin/nome invalidos' });
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
            const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
            try {
                const resultado = qaSyndi.toggleCodingSyndi(pastaGtinPath, nome);
                enviarJson(res, 200, { ok: true, novoNome: resultado.novoNome });
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/marcar-destino') {
        lerCorpo(req).then(corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            const tipo = dados.tipo === undefined ? null : dados.tipo;
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
            const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
            try {
                qaSyndi.marcarDestinoSyndi(pastaGtinPath, tipo);
                enviarJson(res, 200, { ok: true });
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

```

- [ ] **Step 2: Verificar manualmente**

```bash
mkdir -p /tmp/syndiqa-tag/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123
echo teste > /tmp/syndiqa-tag/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/foto_0.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-tag"}' > caminhos-locais.json
node server.js &
sleep 1

curl -s -X POST http://localhost:3001/api/tag-subpasta -H "Content-Type: application/json" \
  -d '{"os":"1","gtin":"1234567890123","nome":"foto_0.jpg","pasta":"RT"}'
echo
curl -s -X POST http://localhost:3001/api/marcar-coding -H "Content-Type: application/json" \
  -d '{"os":"1","gtin":"1234567890123","nome":"foto_0.jpg"}'
echo
curl -s -X POST http://localhost:3001/api/marcar-destino -H "Content-Type: application/json" \
  -d '{"os":"1","gtin":"1234567890123","tipo":"Mockup"}'
echo
curl -s "http://localhost:3001/api/gtin?os=1&gtin=1234567890123"

kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-tag
```

Expected: `/api/tag-subpasta` devolve `{"ok":true,"destino":"RT"}`; `/api/marcar-coding` (agora o arquivo está em `RT/foto_0.jpg`, o `nome` continua `foto_0.jpg` porque a rota busca em todas as subpastas) devolve `{"ok":true,"novoNome":"foto_0_coding.jpg"}`; `/api/marcar-destino` devolve `{"ok":true}`; `/api/gtin` final mostra `imagens.subpastas.RT` com `foto_0_coding.jpg` e `imagens.destino: "Mockup"`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: rotas de tagging RT/IS/AP, _coding e Mockup/Recorte"
```

---

## Task 3: Renomear pra `syndi_qa.html` e portar a UI de tagging

**Files:**
- Create: `syndi_qa.html` (conteúdo baseado em `qa.html`)
- Delete: `qa.html`
- Modify: `server.js` (handler estático)
- Modify: `js/qa.js`
- Modify: `css/qa.css`

**Interfaces:**
- Consumes: rotas `/api/tag-subpasta`, `/api/marcar-coding`, `/api/marcar-destino` (Task 2)
- Produces: `toggleCoding(nome)`, `toggleSubpasta(nome, pasta)`, `marcarDestinoManual(tipo)`, `recarregarDetalheAtual()` em `js/qa.js`

- [ ] **Step 1: Renomear o arquivo**

```bash
cp qa.html syndi_qa.html
git rm qa.html
```

(o conteúdo de `syndi_qa.html` será editado nos próximos steps — por enquanto é uma cópia idêntica)

- [ ] **Step 2: Atualizar `server.js` pra servir `syndi_qa.html`**

Trocar:
```js
    let filePath = path.join(BASE_PATH, urlSemQuery === '/' ? 'qa.html' : urlSemQuery);
```
por:
```js
    let filePath = path.join(BASE_PATH, urlSemQuery === '/' ? 'syndi_qa.html' : urlSemQuery);
```

- [ ] **Step 3: Adicionar legenda e seletor de destino em `syndi_qa.html`**

Inserir, logo depois de `<h5 class="mb-3">GTIN {{ selecionado.gtin }} <small class="text-muted">- OS {{ selecionado.os }}</small></h5>` e antes de `<div v-if="carregandoDetalhe" class="qa-vazio">Carregando pasta...</div>`:

```html
                    <div class="qa-legenda">
                        <span class="qa-legenda-item"><span class="qa-legenda-cor coding"></span> _coding (referência de edição)</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor rt"></span> RT - Rótulo</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor is"></span> IS - Insumos</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor ap"></span> AP - Apoio</span>
                    </div>
```

Inserir, logo depois de `<template v-else-if="detalhe">` e antes de `<div class="qa-subpasta-titulo">Raiz ({{ detalhe.imagens.raiz.length }})</div>`:

```html
                        <div class="qa-destino-manual">
                            <span class="qa-destino-manual-label">Tipo de pós-produção:</span>
                            <button type="button" class="qa-destino-btn recorte" :class="{ ativa: detalhe.imagens.destino === 'Recorte' }" :disabled="marcandoDestino" @click="marcarDestinoManual('Recorte')">Recorte</button>
                            <button type="button" class="qa-destino-btn mockup" :class="{ ativa: detalhe.imagens.destino === 'Mockup' }" :disabled="marcandoDestino" @click="marcarDestinoManual('Mockup')">Mockup</button>
                        </div>
```

- [ ] **Step 4: Adicionar botões de tag por miniatura em `syndi_qa.html`**

Trocar o bloco da grade "Raiz" inteiro:
```html
                        <div class="qa-grid">
                            <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.raiz" :key="img.nome">
                                <div
                                    class="qa-miniatura"
                                    :class="{ ativa: fotoAtiva === img.nome, marcada: !!marcadas[img.nome] }"
                                    @click="selecionarFoto(img.nome)"
                                >
                                    <img :src="urlImagem(img.nome)" :alt="img.nome" loading="lazy">
                                </div>
                                <div class="qa-miniatura-nome">{{ img.nome }}</div>
                            </div>
                        </div>
```
por:
```html
                        <div class="qa-grid">
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
                                </div>
                            </div>
                        </div>
```

Trocar o bloco da grade de subpastas inteiro:
```html
                                <div class="qa-grid">
                                    <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.subpastas[tag]" :key="img.nome">
                                        <div
                                            class="qa-miniatura"
                                            :class="{ ativa: fotoAtiva === (tag + '/' + img.nome), marcada: !!marcadas[tag + '/' + img.nome] }"
                                            @click="selecionarFoto(tag + '/' + img.nome)"
                                        >
                                            <img :src="urlImagem(tag + '/' + img.nome)" :alt="img.nome" loading="lazy">
                                        </div>
                                        <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                    </div>
                                </div>
```
por:
```html
                                <div class="qa-grid">
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
                                        </div>
                                    </div>
                                </div>
```

- [ ] **Step 5: Adicionar `toggleCoding`, `toggleSubpasta`, `marcarDestinoManual`, `recarregarDetalheAtual` em `js/qa.js`**

Adicionar, logo depois de `const timeoutFecharDepoisDeConcluir = null;` (declaração de estado, antes de `async function carregarFila()`):

```js
        const marcandoDestino = ref(false);
```

Adicionar, logo depois da função `urlImagem` (antes de `// Clicar numa foto so a torna "ativa"...`):

```js
        // Recarrega so o detalhe do GTIN atual, sem mexer em fotoAtiva/marcadas (estado
        // do retrabalho, nao persistido) - usado depois de qualquer acao de tagging.
        async function recarregarDetalheAtual() {
            if (!selecionado.value) return;
            try {
                const resp = await fetch(API + '/api/gtin?os=' + encodeURIComponent(selecionado.value.os) + '&gtin=' + encodeURIComponent(selecionado.value.gtin));
                const dados = await resp.json();
                if (dados.ok) detalhe.value = dados;
            } catch (err) {
                console.error('Erro ao recarregar detalhe:', err);
            }
        }

        async function toggleCoding(nome) {
            if (!selecionado.value) return;
            try {
                const resp = await fetch(API + '/api/marcar-coding', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, nome })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
            } catch (err) {
                alert('Erro ao marcar _coding: ' + err.message);
            }
        }

        async function toggleSubpasta(nome, pasta) {
            if (!selecionado.value) return;
            try {
                const resp = await fetch(API + '/api/tag-subpasta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, nome, pasta })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
            } catch (err) {
                alert('Erro ao mover para ' + pasta + ': ' + err.message);
            }
        }

        async function marcarDestinoManual(tipo) {
            if (!selecionado.value || marcandoDestino.value) return;
            const jaAtivo = detalhe.value && detalhe.value.imagens.destino === tipo;
            const novoTipo = jaAtivo ? null : tipo;
            marcandoDestino.value = true;
            try {
                const resp = await fetch(API + '/api/marcar-destino', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, tipo: novoTipo })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
            } catch (err) {
                alert('Erro ao marcar destino: ' + err.message);
            } finally {
                marcandoDestino.value = false;
            }
        }
```

No `return { ... }` do `setup()`, adicionar `marcandoDestino, marcarDestinoManual, toggleCoding, toggleSubpasta`.

- [ ] **Step 6: Restaurar CSS de tagging em `css/qa.css`**

Adicionar, logo depois da regra `.qa-miniatura-nome { ... }` (antes do comentário `/* Painel unico de motivos...`):

```css
.qa-acoes-mini {
    display: flex;
    gap: 2px;
    margin-top: 3px;
}

.qa-acao-mini {
    flex: 1;
    padding: 3px 0;
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1;
    text-align: center;
    border-radius: 3px;
    border: 1px solid var(--border);
    background-color: var(--bg-input);
    color: var(--text-muted);
    cursor: pointer;
}

.qa-acao-mini:hover { filter: brightness(1.3); }

.qa-acao-mini.coding { border-color: var(--warning); color: var(--warning); }
.qa-acao-mini.coding.ativa { background-color: var(--warning); color: #1a1a1a; }

.qa-acao-mini.rt { border-color: #fd7e14; color: #fd7e14; }
.qa-acao-mini.is { border-color: var(--info); color: var(--info); }
.qa-acao-mini.ap { border-color: #9c27b0; color: #9c27b0; }

.qa-acao-mini.zoom { border-color: var(--primary); color: var(--primary); }

.qa-acao-mini.voltar {
    flex: none;
    width: 100%;
    color: var(--text-muted);
}
```

- [ ] **Step 7: Rodar testes e verificar manualmente**

Run: `npm test`
Expected: PASS — 33 testes, 0 falhas (nada em `lib/` mudou nesta task).

```bash
mkdir -p /tmp/syndiqa-ui/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123
printf '\xff\xd8\xff\xe0a' > /tmp/syndiqa-ui/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/foto_0.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-ui"}' > caminhos-locais.json
node server.js &
sleep 1
curl -s -o /dev/null -w "syndi_qa.html: %{http_code}\n" http://localhost:3001/
curl -s -o /dev/null -w "qa.html (deve 404, foi renomeado): %{http_code}\n" http://localhost:3001/qa.html
```

Usando a skill `webapp-testing` (Playwright), abra `http://localhost:3001/`, selecione o GTIN, e confirme visualmente: legenda aparece, seletor Mockup/Recorte aparece, botões `C`/`RT`/`IS`/`AP` aparecem por miniatura, clicar em `RT` move a foto pra seção RT (a grade recarrega), clicar de novo na miniatura ainda seleciona ela pro painel de retrabalho (não quebrou).

```bash
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-ui
```

- [ ] **Step 8: Commit**

```bash
git add syndi_qa.html qa.html js/qa.js css/qa.css server.js
git commit -m "feat: renomeia qa.html para syndi_qa.html e porta UI de tagging RT/IS/AP/coding/destino"
```

---

## Task 4: Zoom de miniatura

**Files:**
- Modify: `syndi_qa.html`
- Modify: `js/qa.js`

**Interfaces:**
- Produces: `imagemAmpliada` (`ref<string|null>`, guarda o "nome" composto tipo `urlImagem`), `listaAmpliada` (`ref<string[]>`), `ampliarImagem(nomeComposto, lista)`, `navegarAmpliada(delta)`

- [ ] **Step 1: Adicionar estado e funções em `js/qa.js`**

Trocar a primeira linha do arquivo:
```js
const { createApp, ref, reactive } = Vue;
```
por:
```js
const { createApp, ref, reactive, nextTick, onMounted } = Vue;
```

Adicionar, logo depois de `const marcandoDestino = ref(false);` (Task 3):

```js
        const imagemAmpliada = ref(null);
        const listaAmpliada = ref([]);
```

Adicionar, logo depois da função `marcarDestinoManual` (Task 3), antes de `async function aprovarGtin()`:

```js
        // Zoom de miniatura - guarda o mesmo "nome composto" que urlImagem/selecionarFoto
        // ja usam (com prefixo de subpasta quando aplicavel, ex.: "RT/foto.jpg"), pra
        // urlImagem(imagemAmpliada) funcionar sem tratamento especial.
        function ampliarImagem(nomeComposto, lista) {
            imagemAmpliada.value = nomeComposto;
            listaAmpliada.value = lista;
            nextTick(() => {
                bootstrap.Modal.getOrCreateInstance(document.getElementById('modalImagem')).show();
            });
        }

        function navegarAmpliada(delta) {
            if (!imagemAmpliada.value || !listaAmpliada.value.length) return;
            const idx = listaAmpliada.value.indexOf(imagemAmpliada.value);
            const total = listaAmpliada.value.length;
            imagemAmpliada.value = listaAmpliada.value[(idx + delta + total) % total];
        }
```

Adicionar, logo antes de `carregarFila();` (as duas chamadas de inicialização, perto do final do `setup()`):

```js
        onMounted(() => {
            document.getElementById('modalImagem').addEventListener('hidden.bs.modal', () => {
                imagemAmpliada.value = null;
                listaAmpliada.value = [];
            });
            document.addEventListener('keydown', (e) => {
                if (!imagemAmpliada.value) return;
                if (e.key === 'ArrowLeft') navegarAmpliada(-1);
                if (e.key === 'ArrowRight') navegarAmpliada(1);
            });
        });

```

No `return { ... }` do `setup()`, adicionar `imagemAmpliada, listaAmpliada, ampliarImagem, navegarAmpliada`.

- [ ] **Step 2: Adicionar botão de lupa e modal em `syndi_qa.html`**

No bloco `.qa-acoes-mini` da grade Raiz (dentro de `<div class="qa-acoes-mini">`, depois do botão `AP`), adicionar:

```html
                                    <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(img.nome, detalhe.imagens.raiz.map(i => i.nome))"><i class="bi bi-zoom-in"></i></button>
```

No bloco `.qa-acoes-mini` da grade de subpastas (dentro do `<div class="qa-acoes-mini">` que hoje só tem o botão "Voltar p/ raiz"), adicionar:

```html
                                            <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(tag + '/' + img.nome, detalhe.imagens.subpastas[tag].map(i => tag + '/' + i.nome))"><i class="bi bi-zoom-in"></i></button>
```

Adicionar o modal, logo antes de `<script src="js/bootstrap.bundle.min.js"></script>` (ainda dentro de `<div id="qaApp">`, depois do `</div>` que fecha `.qa-layout`):

```html
        <div class="modal fade" id="modalImagem" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-fullscreen">
                <div class="modal-content bg-dark">
                    <div class="modal-header border-0">
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        <div class="nav-arrows">
                            <button type="button" class="btn btn-outline-light btn-sm" @click="navegarAmpliada(-1)">
                                <i class="bi bi-chevron-left"></i>
                            </button>
                            <button type="button" class="btn btn-outline-light btn-sm" @click="navegarAmpliada(1)">
                                <i class="bi bi-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                    <div class="modal-body d-flex align-items-center justify-content-center p-0">
                        <img v-if="imagemAmpliada" :src="urlImagem(imagemAmpliada)" :alt="imagemAmpliada" id="imgAmpliada">
                    </div>
                    <div class="modal-footer border-0">
                        <div class="info-imagem">
                            <span>{{ imagemAmpliada || '' }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
```

- [ ] **Step 3: Verificar manualmente com Playwright**

```bash
mkdir -p /tmp/syndiqa-zoom/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/RT
printf '\xff\xd8\xff\xe0a' > /tmp/syndiqa-zoom/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/foto_0.jpg
printf '\xff\xd8\xff\xe0b' > /tmp/syndiqa-zoom/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/foto_1.jpg
printf '\xff\xd8\xff\xe0c' > /tmp/syndiqa-zoom/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/RT/foto_2.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-zoom"}' > caminhos-locais.json
node server.js &
sleep 1
```

Usando a skill `webapp-testing` (Playwright), abra `http://localhost:3001/`, selecione o GTIN, e confirme:
1. Clicar na lupa de `foto_0.jpg` abre o modal em tela cheia com a imagem certa.
2. Seta direita navega pra `foto_1.jpg` (próxima da mesma lista "Raiz"); seta esquerda volta.
3. Fechar o modal (X ou Esc) e clicar na lupa da foto em `RT` abre o modal mostrando só ela (lista de navegação restrita à subpasta RT, não mistura com a Raiz).
4. Clicar na miniatura em si (não na lupa) continua selecionando a foto pro painel de retrabalho, sem abrir o modal.

```bash
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-zoom
```

- [ ] **Step 4: Commit**

```bash
git add syndi_qa.html js/qa.js
git commit -m "feat: zoom de miniatura com navegacao por teclado"
```

---

## Task 5: Verificação end-to-end final

**Files:** nenhum arquivo novo — checklist cobrindo tagging + zoom + ciclo Aprovar/Retrabalho juntos.

- [ ] **Step 1: Rodar toda a suíte automatizada**

Run: `npm test`
Expected: PASS — 33 testes, 0 falhas.

- [ ] **Step 2: Cenário completo com Playwright**

Fixture: 1 GTIN com 2 fotos na raiz. Usando a skill `webapp-testing`:
1. Marcar `_coding` na primeira foto (botão `C` fica destacado, miniatura ganha borda amarela).
2. Mover a segunda foto pra `RT` (ela sai da grade Raiz e aparece na seção RT).
3. Marcar destino "Mockup" (botão fica destacado verde).
4. Ampliar a foto que ficou na Raiz (zoom funciona).
5. Marcar a foto da Raiz como retrabalho (motivo "desfoque") e clicar "Confirmar Retrabalho" —
   confirma que o ciclo antigo continua funcionando: a pasta inteira (com a subpasta RT e a
   pasta-sinal Mockup dentro) é movida pra `Retrabalho\OS_x\<gtin>\`, preservando tudo.

- [ ] **Step 3: Commit final (se algo precisou de ajuste nos passos acima)**

```bash
git add -A
git commit -m "chore: ajustes finais da verificacao end-to-end do sub-projeto 1 (QA Hub port)"
```

(Pular este commit se nada precisou de ajuste.)
