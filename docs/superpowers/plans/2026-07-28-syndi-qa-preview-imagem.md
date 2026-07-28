# Preview Reduzido de Imagens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop serving 15-18MB original photo files for on-screen display (thumbnails and zoom modal) — generate and cache small resized JPEG previews instead, using a new `sharp` dependency, while the original file is never modified and is still what gets delivered (moved to `AgEnvio`).

**Architecture:** A new `lib/previewImagem.js` module wraps `sharp` behind a pure-ish, disk-cached `gerarPreview(caminhoOriginal, tamanho)` function. `server.js`'s `GET /api/imagem` gains an optional `tamanho` query param (`mini`/`zoom`) that, when present, serves the generated preview instead of the original — falling back to the original on any generation failure so a broken preview never blanks the screen. `js/qa.js`'s `urlImagem` defaults to `'mini'` for the photo grid and the zoom modal explicitly requests `'zoom'`.

**Tech Stack:** Node.js core + the new `sharp` npm dependency (image resize/encode, native binary downloaded per-platform at `npm install` time — this is the one deliberate exception to this project's "zero dependency" rule, confirmed with the user). `node:test` for the new pure module.

## Global Constraints

- No new dependency besides `sharp` — everything else stays core Node / no build step.
- The original photo file is NEVER modified or moved by this plan — only read. Delivery (`AgEnvio`) continues to move the original untouched.
- Preview generation failure must fall back to serving the original file, never a broken image or a 500 that blanks the grid.
- `preview-cache/` must be gitignored — it's generated, per-machine disk cache, not project source.
- Without a `tamanho` param, `GET /api/imagem` must behave exactly as before (serves the original) — this is relied on by manual curl verification patterns used throughout this project and keeps backward compatibility.

---

### Task 1: `lib/previewImagem.js` — preview generation + disk cache

**Files:**
- Create: `lib/previewImagem.js`
- Create: `lib/previewImagem.test.js`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `gerarPreview(caminhoOriginal, tamanho)` → `Promise<string>` (absolute path to the cached preview JPEG). `tamanho` is `'mini'` (500px wide, quality 78) or `'zoom'` (2000px wide, quality 88); any other value rejects. Never upscales an image smaller than the target width. Also exports `CACHE_DIR` (absolute path to `preview-cache/`, for tests/inspection).

- [ ] **Step 1: Install `sharp`**

Run: `cd D:\syndi_qa && npm install sharp --save`
Expected: `package.json` gains a `"dependencies": { "sharp": "^X.Y.Z" }` entry (exact version whatever npm resolves — do not hand-edit the version string), `package-lock.json` is created/updated, `node_modules/sharp` exists. This step needs internet access (downloads a platform-specific native binary) — if it fails for lack of network access, stop and report BLOCKED rather than guessing around it.

- [ ] **Step 2: Ignore the generated cache directory**

In `.gitignore`, current content ends with:

```
logs/
.perfil-navegador/
diagnostico.txt
```

Change to (adds the new cache dir):

```
logs/
.perfil-navegador/
diagnostico.txt
preview-cache/
```

- [ ] **Step 3: Write the failing tests**

Create `lib/previewImagem.test.js`:

```js
// lib/previewImagem.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const previewImagem = require('./previewImagem');

function criarDirTemp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'syndiqa-preview-'));
}

async function criarFotoFixture(caminho, largura, altura) {
    await sharp({
        create: { width: largura, height: altura, channels: 3, background: { r: 200, g: 50, b: 50 } }
    }).jpeg().toFile(caminho);
}

test('gerarPreview cria um arquivo de cache reduzido na primeira chamada', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto.jpg');
    await criarFotoFixture(original, 2000, 1500);

    const caminhoPreview = await previewImagem.gerarPreview(original, 'mini');
    assert.ok(fs.existsSync(caminhoPreview));
    const metadados = await sharp(caminhoPreview).metadata();
    assert.equal(metadados.width, 500);
});

test('gerarPreview reaproveita o cache na segunda chamada (nao regenera)', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto.jpg');
    await criarFotoFixture(original, 2000, 1500);

    const caminho1 = await previewImagem.gerarPreview(original, 'mini');
    const mtimeAntes = fs.statSync(caminho1).mtimeMs;
    const caminho2 = await previewImagem.gerarPreview(original, 'mini');
    const mtimeDepois = fs.statSync(caminho2).mtimeMs;

    assert.equal(caminho1, caminho2);
    assert.equal(mtimeAntes, mtimeDepois);
});

test('gerarPreview usa chaves diferentes pra mini e zoom do mesmo arquivo', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto.jpg');
    await criarFotoFixture(original, 2000, 1500);

    const caminhoMini = await previewImagem.gerarPreview(original, 'mini');
    const caminhoZoom = await previewImagem.gerarPreview(original, 'zoom');

    assert.notEqual(caminhoMini, caminhoZoom);
    const metaMini = await sharp(caminhoMini).metadata();
    const metaZoom = await sharp(caminhoZoom).metadata();
    assert.equal(metaMini.width, 500);
    assert.equal(metaZoom.width, 2000);
});

test('gerarPreview nao aumenta uma foto menor que o alvo (withoutEnlargement)', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto-pequena.jpg');
    await criarFotoFixture(original, 200, 150);

    const caminhoPreview = await previewImagem.gerarPreview(original, 'mini');
    const metadados = await sharp(caminhoPreview).metadata();
    assert.equal(metadados.width, 200);
});

test('gerarPreview rejeita tamanho invalido', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto.jpg');
    await criarFotoFixture(original, 2000, 1500);

    await assert.rejects(() => previewImagem.gerarPreview(original, 'gigante'));
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd D:\syndi_qa && npm test`
Expected: FAIL — `Cannot find module './previewImagem'` (the module doesn't exist yet).

- [ ] **Step 5: Create `lib/previewImagem.js`**

```js
// lib/previewImagem.js
// Gera e cacheia previews reduzidos das fotos (exports finais do Lightroom, 15-18MB cada) pra
// exibicao em tela - o arquivo original nunca e alterado, so lido. Precisa de "sharp" (unica
// excecao a regra de zero-dependencia deste projeto - decisao consciente, ver
// docs/superpowers/specs/2026-07-28-syndi-qa-preview-imagem-design.md).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const CACHE_DIR = path.join(__dirname, '..', 'preview-cache');

const TAMANHOS = {
    mini: { largura: 500, qualidade: 78 },
    zoom: { largura: 2000, qualidade: 88 }
};

// Chave de cache = hash do caminho absoluto + mtime + tamanho do arquivo original. Se o
// arquivo for movido/renomeado (Aprovar, Retrabalho, tagging RT/IS/AP/_coding), o caminho
// muda, a chave muda, e uma entrada nova e gerada sob demanda - a antiga fica orfa (aceito
// por design, ver spec secao 3 - disco e barato pra arquivos desse tamanho).
function chaveCache(caminhoOriginal, tamanho) {
    const stat = fs.statSync(caminhoOriginal);
    return crypto.createHash('sha1')
        .update(path.resolve(caminhoOriginal) + '|' + stat.mtimeMs + '|' + stat.size)
        .digest('hex') + '-' + tamanho;
}

// Gera (ou reaproveita do cache) um preview JPEG reduzido do arquivo original. tamanho e
// 'mini' ou 'zoom' - ver TAMANHOS acima. Nunca aumenta uma foto menor que o alvo
// (withoutEnlargement). Devolve o caminho absoluto do arquivo de preview.
async function gerarPreview(caminhoOriginal, tamanho) {
    const config = TAMANHOS[tamanho];
    if (!config) {
        throw new Error('Tamanho de preview invalido: ' + tamanho);
    }
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const caminhoCache = path.join(CACHE_DIR, chaveCache(caminhoOriginal, tamanho) + '.jpg');
    if (fs.existsSync(caminhoCache)) return caminhoCache;
    await sharp(caminhoOriginal)
        .resize({ width: config.largura, withoutEnlargement: true })
        .jpeg({ quality: config.qualidade })
        .toFile(caminhoCache);
    return caminhoCache;
}

module.exports = { gerarPreview, CACHE_DIR };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd D:\syndi_qa && npm test`
Expected: PASS (all new tests + the existing 71 — note the exact new total in your report)

- [ ] **Step 7: Commit**

```bash
cd D:\syndi_qa
git add package.json package-lock.json .gitignore lib/previewImagem.js lib/previewImagem.test.js
git commit -m "feat: adiciona geracao e cache de preview reduzido de imagem (sharp)"
```

---

### Task 2: `GET /api/imagem` — servir preview quando pedido

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `previewImagem.gerarPreview(caminhoOriginal, tamanho)` (Task 1).
- Produces: `GET /api/imagem?...&tamanho=mini|zoom` serves the cached preview instead of the original; omitting `tamanho` (or any other value) preserves today's exact behavior (serves the original).

- [ ] **Step 1: Add the `require` and a small shared "send image file" helper**

In `server.js`, find this line near the top (after the other `require`s):

```js
const qaSyndi = require('./lib/qaSyndi');
const redmine = require('./lib/redmine');
```

Change to:

```js
const qaSyndi = require('./lib/qaSyndi');
const redmine = require('./lib/redmine');
const previewImagem = require('./lib/previewImagem');
```

Then find `enviarJson` (search for `function enviarJson`). Right after its closing `}`, insert:

```js

function enviarArquivoImagem(res, caminho) {
    fs.readFile(caminho, (err, content) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Erro no servidor');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(content);
    });
}
```

- [ ] **Step 2: Wire `tamanho` into the `/api/imagem` route**

In `server.js`, find the `GET /api/imagem` block. It currently reads (note: this is the version AFTER an earlier perf fix already merged — the `pastaOsNomeParam`/`pastaGtinNomeParam` fast-path logic is expected to already be there):

```js
        const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
        const caminhoImagem = qaSyndi.resolverImagemSegura(pastaGtinPath, nome);
        if (!caminhoImagem || !fs.existsSync(caminhoImagem)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Imagem nao encontrada');
            return;
        }
        fs.readFile(caminhoImagem, (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Erro no servidor');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(content);
        });
        return;
    }
```

Change to:

```js
        const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
        const caminhoImagem = qaSyndi.resolverImagemSegura(pastaGtinPath, nome);
        if (!caminhoImagem || !fs.existsSync(caminhoImagem)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Imagem nao encontrada');
            return;
        }
        const tamanho = query.get('tamanho') || '';
        if (tamanho === 'mini' || tamanho === 'zoom') {
            previewImagem.gerarPreview(caminhoImagem, tamanho)
                .then(caminhoPreview => enviarArquivoImagem(res, caminhoPreview))
                .catch(err => {
                    // Preview quebrado nunca pode deixar a tela em branco - cai pro
                    // original (mais lento, mas funciona).
                    console.error('Erro ao gerar preview, servindo original:', err);
                    enviarArquivoImagem(res, caminhoImagem);
                });
            return;
        }
        enviarArquivoImagem(res, caminhoImagem);
        return;
    }
```

Note: also add the `const pastaOsNomeParam = ...` / `pastaGtinNomeParam` lines' NEIGHBOR — this task assumes the earlier `os`/`gtin`/`nome`/`pastaOsNomeParam`/`pastaGtinNomeParam` declarations at the top of this route are already in place from the previous perf fix (`git log` should show commit `8025f5f` already in history); this task only touches the part AFTER `pastaGtinPath` is computed, shown above.

- [ ] **Step 3: Verify manually**

Port 3001 is this project's own port — never touch port 3000 (unrelated production system on this machine).

1. Start the server: `cd D:\syndi_qa && node server.js` (background).
2. Using a real OS/GTIN with a real photo (check `GET /api/fila` for one), run:
   - `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "http://localhost:3001/api/imagem?os=<os>&gtin=<gtin>&nome=<nome>"` — no `tamanho`, expect the ORIGINAL file size (same as before this change).
   - `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "http://localhost:3001/api/imagem?os=<os>&gtin=<gtin>&nome=<nome>&tamanho=mini"` — expect a MUCH smaller size (a few tens of KB, not MB).
   - Run the same `tamanho=mini` request again — should be noticeably faster (cache hit, no re-encoding).
   - `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "http://localhost:3001/api/imagem?os=<os>&gtin=<gtin>&nome=<nome>&tamanho=zoom"` — expect a size between the mini and the original, bigger than mini but still much smaller than the original.
3. Confirm `preview-cache/` now exists in the project root with `.jpg` files in it.
4. Stop the server afterward (kill only the PID you started; confirm port 3001 is free via `netstat -ano | grep :3001`).

- [ ] **Step 4: Commit**

```bash
cd D:\syndi_qa
git add server.js
git commit -m "feat: GET /api/imagem serve preview reduzido quando tamanho=mini|zoom e pedido"
```

---

### Task 3: Front-end — grade usa `mini`, ampliar usa `zoom`

**Files:**
- Modify: `js/qa.js`
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: `GET /api/imagem?...&tamanho=...` (Task 2).
- Produces: `urlImagem(nome, tamanho)` — `tamanho` optional, defaults to `'mini'`.

- [ ] **Step 1: Add the `tamanho` parameter to `urlImagem`**

In `js/qa.js`, find:

```js
        function urlImagem(nome) {
            if (!selecionado.value) return '';
            let url = API + '/api/imagem?os=' + encodeURIComponent(selecionado.value.os) +
                '&gtin=' + encodeURIComponent(selecionado.value.gtin) +
                '&nome=' + encodeURIComponent(nome);
            // Reaproveita os nomes de pasta decorados que GET /api/gtin ja resolveu -
            // evita o servidor varrer o disco de novo (readdirSync) pra cada foto da
            // grade, que antes rodava a cada miniatura carregada.
            if (detalhe.value && detalhe.value.pastaOsNome && detalhe.value.pastaGtinNome) {
                url += '&pastaOsNome=' + encodeURIComponent(detalhe.value.pastaOsNome) +
                    '&pastaGtinNome=' + encodeURIComponent(detalhe.value.pastaGtinNome);
            }
            return url;
        }
```

Change to:

```js
        function urlImagem(nome, tamanho) {
            if (!selecionado.value) return '';
            let url = API + '/api/imagem?os=' + encodeURIComponent(selecionado.value.os) +
                '&gtin=' + encodeURIComponent(selecionado.value.gtin) +
                '&nome=' + encodeURIComponent(nome) +
                '&tamanho=' + encodeURIComponent(tamanho || 'mini');
            // Reaproveita os nomes de pasta decorados que GET /api/gtin ja resolveu -
            // evita o servidor varrer o disco de novo (readdirSync) pra cada foto da
            // grade, que antes rodava a cada miniatura carregada.
            if (detalhe.value && detalhe.value.pastaOsNome && detalhe.value.pastaGtinNome) {
                url += '&pastaOsNome=' + encodeURIComponent(detalhe.value.pastaOsNome) +
                    '&pastaGtinNome=' + encodeURIComponent(detalhe.value.pastaGtinNome);
            }
            return url;
        }
```

- [ ] **Step 2: Syntax check**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: no output (exit code 0).

- [ ] **Step 3: Commit**

```bash
cd D:\syndi_qa
git add js/qa.js
git commit -m "feat: urlImagem aceita parametro tamanho, default mini"
```

- [ ] **Step 4: Zoom modal requests the `zoom` size**

In `syndi_qa.html`, find:

```html
                        <img v-if="imagemAmpliada" :src="urlImagem(imagemAmpliada)" :alt="imagemAmpliada" id="imgAmpliada">
```

Change to:

```html
                        <img v-if="imagemAmpliada" :src="urlImagem(imagemAmpliada, 'zoom')" :alt="imagemAmpliada" id="imgAmpliada">
```

Leave the two grid `<img>` tags (root and RT/IS/AP subpasta) UNCHANGED — they already call `urlImagem(img.nome)` / `urlImagem(tag + '/' + img.nome)` with no second argument, which now correctly defaults to `'mini'`.

- [ ] **Step 5: Manual end-to-end verification**

Port 3001 is this project's own port — never touch port 3000.

1. Start the server (`cd D:\syndi_qa && node server.js`, background).
2. `curl -s http://localhost:3001/ | grep -o "urlImagem(imagemAmpliada, 'zoom')"` — expected: prints the match, confirming the modal binding shipped.
3. With a real GTIN open in a browser: confirm the grid loads noticeably faster than before this plan (small previews, not 15-18MB originals), and that clicking to zoom shows a sharp, larger image (not the tiny 500px mini).
4. Stop the server afterward (kill only the PID you started; confirm port 3001 is free via `netstat -ano | grep :3001`).

- [ ] **Step 6: Commit**

```bash
cd D:\syndi_qa
git add syndi_qa.html
git commit -m "feat: modal de ampliar pede o preview tamanho=zoom"
```

---

## Post-plan: update memory

After this plan is fully implemented and merged, update
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md` (and `MEMORY.md` if
needed): note that Syndi_qa now has its first real npm dependency (`sharp`, for on-screen image
preview generation — deliberate, confirmed exception to the zero-dependency rule), that a new
machine setup now needs `npm install` (not just "copy the folder and run"), and where the preview
cache lives (`preview-cache/`, gitignored, self-healing on file move/rename via cache-key
invalidation, no active cleanup of orphaned entries). This is a memory-system update, not a code
task — do it in the finishing conversation, not as a plan step.
