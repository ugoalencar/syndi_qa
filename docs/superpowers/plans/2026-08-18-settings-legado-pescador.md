# Settings de caminhos + Pescador de GTIN + Legado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o modelo de copia local de OS_NONE por leitura direta de uma pasta de
backup no drive de rede (configuravel via UI), com um botao que pesca GTINs novos da
origem externa pra esse backup e um JSON de controle que separa GTINs legado (QA manual
anterior) de pendente (a fazer no sistema novo).

**Architecture:** `lib/qaSyndi.js` ganha os novos caminhos configuraveis, as funcoes de
pesca e o JSON de controle; `server.js` expoe 3 endpoints novos e troca as ~10 ocorrencias
de `path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE')` por um caminho configuravel;
`syndi_qa.html`/`js/qa.js` ganham um modal de Settings, um botao "Pescador de GTIN", um
botao de snapshot do legado, e um filtro Legado/Pendente/Todos na lista de OS_NONE.

**Tech Stack:** Node.js (sem framework HTTP, `http` nativo), Vue 3 (sem build), testes com
`node:test` (`node --test lib/*.test.js`).

## Global Constraints

- Sem CDN, sem dependencia nova, sem build step (projeto roda offline, copia a pasta e
  funciona) — ver `CLAUDE.md`.
- Comentario em codigo: so explica o porque, em portugues sem acento, so quando nao-obvio.
- `caminhos-locais.json` continua bloqueado de leitura estatica (`ARQUIVOS_BLOQUEADOS` em
  `server.js`), so acessivel pelos endpoints dedicados.
- Nunca escrever na pasta de origem do legado (`legadoOrigemDir`) — so leitura.

---

## Task 1: Settings — caminhos configuraveis em `lib/qaSyndi.js`

**Files:**
- Modify: `lib/qaSyndi.js:11,26-30,919-961` (defaults, export)
- Test: `lib/qaSyndi.test.js`

**Interfaces:**
- Produces: `qaSyndi.CAMINHOS_LOCAIS` (objeto mutavel, mesma referencia sempre — outras
  tasks leem `qaSyndi.CAMINHOS_LOCAIS.legadoOrigemDir`,
  `qaSyndi.CAMINHOS_LOCAIS.legadoDestinoDir`, `qaSyndi.CAMINHOS_LOCAIS.cadastroOcrDir`,
  `qaSyndi.CAMINHOS_LOCAIS.syncimgSendBase`).
- Produces: `qaSyndi.recarregarCaminhosLocais()` — re-le `caminhos-locais.json` e atualiza
  `CAMINHOS_LOCAIS` na mesma referencia (sem trocar o objeto, pra quem guardou a
  referencia continuar vendo os valores novos).
- Produces: `qaSyndi.caminhoArquivoCaminhosLocais()` — devolve o path absoluto do
  `caminhos-locais.json` (`BASE_PATH/caminhos-locais.json`), usado pelo endpoint de
  Settings pra ler/escrever o arquivo bruto.

- [ ] **Step 1: Escreva o teste que falha**

Adicione ao final de `lib/qaSyndi.test.js`:

```javascript
test('carregarCaminhosLocais inclui defaults dos campos novos (legado/OCR)', () => {
    const dirTemp = criarDirTemp();
    const resultado = qaSyndi.carregarCaminhosLocais(dirTemp);
    assert.equal(resultado.legadoOrigemDir, '');
    assert.equal(resultado.legadoDestinoDir, '');
    assert.equal(resultado.cadastroOcrDir, 'C:\\Cadastro\\OCR');
});

test('recarregarCaminhosLocais atualiza CAMINHOS_LOCAIS na mesma referencia', () => {
    const dirTemp = criarDirTemp();
    const referenciaOriginal = qaSyndi.CAMINHOS_LOCAIS;
    fs.writeFileSync(path.join(dirTemp, 'caminhos-locais.json'), JSON.stringify({
        legadoOrigemDir: '\\\\servidor\\origem',
        legadoDestinoDir: '\\\\servidor\\destino',
        cadastroOcrDir: 'D:\\OCR'
    }));
    qaSyndi.recarregarCaminhosLocais(dirTemp);
    assert.equal(qaSyndi.CAMINHOS_LOCAIS, referenciaOriginal);
    assert.equal(qaSyndi.CAMINHOS_LOCAIS.legadoOrigemDir, '\\\\servidor\\origem');
    assert.equal(qaSyndi.CAMINHOS_LOCAIS.legadoDestinoDir, '\\\\servidor\\destino');
    assert.equal(qaSyndi.CAMINHOS_LOCAIS.cadastroOcrDir, 'D:\\OCR');
    // restaura pro resto da suite nao quebrar (mesmo processo, modulo cacheado)
    qaSyndi.recarregarCaminhosLocais(qaSyndi.BASE_PATH);
});

test('caminhoArquivoCaminhosLocais aponta pra caminhos-locais.json dentro de BASE_PATH', () => {
    assert.equal(
        qaSyndi.caminhoArquivoCaminhosLocais(),
        path.join(qaSyndi.BASE_PATH, 'caminhos-locais.json')
    );
});
```

- [ ] **Step 2: Rode os testes pra confirmar que falham**

Run: `node --test lib/qaSyndi.test.js`
Expected: FAIL — `qaSyndi.CAMINHOS_LOCAIS is undefined`, `recarregarCaminhosLocais is not
a function`, `caminhoArquivoCaminhosLocais is not a function`, e os defaults novos
ausentes.

- [ ] **Step 3: Implemente**

Em `lib/qaSyndi.js`, troque o bloco de `DEFAULTS_CAMINHOS_LOCAIS` (linha 11) e as 4 linhas
seguintes (26-30):

```javascript
const DEFAULTS_CAMINHOS_LOCAIS = {
    syncimgSendBase: 'C:\\Apps\\SyncIMGSend',
    legadoOrigemDir: '',
    legadoDestinoDir: '',
    cadastroOcrDir: 'C:\\Cadastro\\OCR'
};
```

```javascript
function caminhoArquivoCaminhosLocais() {
    return path.join(BASE_PATH, 'caminhos-locais.json');
}

const CAMINHOS_LOCAIS = carregarCaminhosLocais(BASE_PATH);
const SYNCIMGSEND_BASE = CAMINHOS_LOCAIS.syncimgSendBase;
const AGCONFERENCIA = path.join(SYNCIMGSEND_BASE, 'AgConferencia');
const AGENVIO = path.join(SYNCIMGSEND_BASE, 'AgEnvio');
const RETRABALHO = path.join(SYNCIMGSEND_BASE, 'Retrabalho');

// Re-le caminhos-locais.json e atualiza CAMINHOS_LOCAIS na mesma referencia (nao troca o
// objeto) - assim quem guardou "qaSyndi.CAMINHOS_LOCAIS" continua vendo os valores novos
// sem precisar re-importar o modulo. So os campos novos (legado/OCR) tem efeito
// imediato; syncimgSendBase/AGCONFERENCIA/AGENVIO/RETRABALHO continuam exigindo reinicio
// (mesmo comportamento de antes desta mudanca).
function recarregarCaminhosLocais(basePath) {
    const novo = carregarCaminhosLocais(basePath || BASE_PATH);
    Object.assign(CAMINHOS_LOCAIS, novo);
    return CAMINHOS_LOCAIS;
}
```

No `module.exports` (linha ~919), adicione `CAMINHOS_LOCAIS`, `recarregarCaminhosLocais` e
`caminhoArquivoCaminhosLocais` logo apos `carregarCaminhosLocais,`:

```javascript
    carregarCaminhosLocais,
    CAMINHOS_LOCAIS,
    recarregarCaminhosLocais,
    caminhoArquivoCaminhosLocais,
```

- [ ] **Step 4: Rode os testes pra confirmar que passam**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS (todos os testes, incluindo os 3 novos)

- [ ] **Step 5: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: caminhos configuraveis de legado/OCR em caminhos-locais.json"
```

---

## Task 2: Endpoints de Settings em `server.js`

**Files:**
- Modify: `server.js` (novo bloco de rotas, perto da rota `/api/atualizacao/*` ~linha 898)
- Test: manual (sem suite de servidor no projeto — ver Task 8 pra verificacao end-to-end)

**Interfaces:**
- Consumes: `qaSyndi.CAMINHOS_LOCAIS`, `qaSyndi.recarregarCaminhosLocais()`,
  `qaSyndi.caminhoArquivoCaminhosLocais()` (Task 1); `lerCorpo(req)`,
  `enviarJson(res, status, dados)` (ja existem em `server.js`).
- Produces: `GET /api/settings/caminhos` → `{ ok: true, caminhos: { syncimgSendBase,
  legadoOrigemDir, legadoDestinoDir, cadastroOcrDir } }`. `POST /api/settings/caminhos`
  (corpo JSON com os mesmos 4 campos, todos string) → `{ ok: true, caminhos: {...} }` ou
  `{ ok: false, error }`.

- [ ] **Step 1: Adicione as rotas**

Em `server.js`, logo depois do bloco de `/api/atualizacao/aplicar` (apos a linha 909, antes
do comentario `// Verificacao e reorganizacao de OS_NONE`), adicione:

```javascript
    // Devolve os caminhos configuraveis por maquina (caminhos-locais.json). Endpoint
    // dedicado porque o arquivo esta em ARQUIVOS_BLOQUEADOS - nao pode ser lido pelo
    // handler estatico.
    if (req.method === 'GET' && req.url === '/api/settings/caminhos') {
        enviarJson(res, 200, { ok: true, caminhos: qaSyndi.CAMINHOS_LOCAIS });
        return;
    }

    // Grava caminhos-locais.json com os 4 campos e recarrega em memoria. Os campos de
    // legado/OCR tem efeito imediato (recarregarCaminhosLocais); syncimgSendBase exige
    // reiniciar o servidor pra AGCONFERENCIA/AGENVIO/RETRABALHO recalcularem.
    if (req.method === 'POST' && req.url === '/api/settings/caminhos') {
        lerCorpo(req).then(corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const campos = ['syncimgSendBase', 'legadoOrigemDir', 'legadoDestinoDir', 'cadastroOcrDir'];
            const caminhos = {};
            for (const campo of campos) {
                if (typeof dados[campo] !== 'string') {
                    enviarJson(res, 400, { ok: false, error: 'Campo "' + campo + '" deve ser texto' });
                    return;
                }
                caminhos[campo] = dados[campo];
            }
            try {
                fs.writeFileSync(qaSyndi.caminhoArquivoCaminhosLocais(), JSON.stringify(caminhos, null, 2) + '\n', 'utf8');
                qaSyndi.recarregarCaminhosLocais(BASE_PATH);
                enviarJson(res, 200, { ok: true, caminhos: qaSyndi.CAMINHOS_LOCAIS });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

```

- [ ] **Step 2: Teste manual do endpoint**

Run (com o servidor rodando via `node server.js` numa aba separada):
```bash
curl http://localhost:3001/api/settings/caminhos
curl -X POST http://localhost:3001/api/settings/caminhos -H "Content-Type: application/json" -d "{\"syncimgSendBase\":\"C:\\\\Apps\\\\SyncIMGSend\",\"legadoOrigemDir\":\"D:\\\\teste-origem\",\"legadoDestinoDir\":\"D:\\\\teste-destino\",\"cadastroOcrDir\":\"C:\\\\Cadastro\\\\OCR\"}"
curl http://localhost:3001/api/settings/caminhos
```
Expected: primeiro GET devolve os defaults; POST devolve `ok:true` com os valores
enviados; segundo GET confirma que persistiu (e `caminhos-locais.json` na raiz do projeto
tem o conteudo novo).

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: endpoints GET/POST /api/settings/caminhos"
```

---

## Task 3: Modal de Settings no front-end

**Files:**
- Modify: `syndi_qa.html` (novo modal, botao no header)
- Modify: `js/qa.js` (estado + funcoes)

**Interfaces:**
- Consumes: `GET /api/settings/caminhos`, `POST /api/settings/caminhos` (Task 2).
- Produces: nenhuma outra task depende do front-end desta task.

- [ ] **Step 1: Adicione o botao no header**

Em `syndi_qa.html`, logo apos o botao de identidade (apos a linha 46, `</button>` do botao
`modalIdentidade`), adicione:

```html
                    <button type="button" class="btn btn-sm btn-outline-light" data-bs-toggle="modal" data-bs-target="#modalSettingsCaminhos" @click="carregarSettingsCaminhos">
                        <i class="bi bi-hdd-network"></i> Caminhos
                    </button>
```

- [ ] **Step 2: Adicione o modal**

Logo apos o fechamento do `modalIdentidade` (apos a linha 100, `</div>` que fecha
`modal-content` de `modalIdentidade`), adicione:

```html
        <div class="modal fade" id="modalSettingsCaminhos" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content bg-dark">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-hdd-network"></i> Caminhos de rede</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label for="inputLegadoOrigem" class="form-label">Origem do legado (drive externo, so leitura)</label>
                            <input type="text" class="form-control" id="inputLegadoOrigem" v-model="settingsCaminhosForm.legadoOrigemDir" placeholder="\\servidor\fotos\Externo">
                        </div>
                        <div class="mb-3">
                            <label for="inputLegadoDestino" class="form-label">Destino do legado (backup no drive, onde o QA acontece)</label>
                            <input type="text" class="form-control" id="inputLegadoDestino" v-model="settingsCaminhosForm.legadoDestinoDir" placeholder="\\servidor\fotos\QA_Legado">
                        </div>
                        <div class="mb-3">
                            <label for="inputCadastroOcr" class="form-label">Destino do OCR</label>
                            <input type="text" class="form-control" id="inputCadastroOcr" v-model="settingsCaminhosForm.cadastroOcrDir" placeholder="C:\Cadastro\OCR">
                        </div>
                        <div class="mb-3">
                            <label for="inputSyncimgSendBase" class="form-label">Pasta base do robo SyncIMGSend</label>
                            <input type="text" class="form-control" id="inputSyncimgSendBase" v-model="settingsCaminhosForm.syncimgSendBase" placeholder="C:\Apps\SyncIMGSend">
                        </div>
                        <div v-if="erroSettingsCaminhos" class="alert alert-danger mb-0">{{ erroSettingsCaminhos }}</div>
                        <div v-if="settingsCaminhosSalvo" class="alert alert-success mb-0">Salvo. Origem/destino do legado ja tem efeito; a pasta do robo exige reiniciar o servidor.</div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" @click="salvarSettingsCaminhos" :disabled="salvandoSettingsCaminhos">
                            <i class="bi bi-check-circle"></i> Salvar
                        </button>
                    </div>
                </div>
            </div>
        </div>
```

- [ ] **Step 3: Adicione estado e funcoes no `js/qa.js`**

Apos a declaracao de `const erroIdentidade` (procure por ela perto do topo do `setup()` —
mesma regiao das outras refs de identidade), adicione:

```javascript
        const settingsCaminhosForm = reactive({ syncimgSendBase: '', legadoOrigemDir: '', legadoDestinoDir: '', cadastroOcrDir: '' });
        const erroSettingsCaminhos = ref('');
        const settingsCaminhosSalvo = ref(false);
        const salvandoSettingsCaminhos = ref(false);
```

Depois da funcao `carregarOsNone` (apos a linha 186 do arquivo original, `}`), adicione:

```javascript
        async function carregarSettingsCaminhos() {
            erroSettingsCaminhos.value = '';
            settingsCaminhosSalvo.value = false;
            try {
                const resp = await fetch(API + '/api/settings/caminhos');
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                Object.assign(settingsCaminhosForm, dados.caminhos);
            } catch (err) {
                erroSettingsCaminhos.value = 'Erro ao carregar caminhos: ' + err.message;
            }
        }

        async function salvarSettingsCaminhos() {
            salvandoSettingsCaminhos.value = true;
            erroSettingsCaminhos.value = '';
            settingsCaminhosSalvo.value = false;
            try {
                const resp = await fetch(API + '/api/settings/caminhos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settingsCaminhosForm)
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                Object.assign(settingsCaminhosForm, dados.caminhos);
                settingsCaminhosSalvo.value = true;
            } catch (err) {
                erroSettingsCaminhos.value = 'Erro ao salvar: ' + err.message;
            } finally {
                salvandoSettingsCaminhos.value = false;
            }
        }
```

No `return { ... }` do `setup()` (linha ~1041, mesma linha que ja expoe `mostrarOsNone,
osNone, ...`), adicione ao final da lista:

```javascript
            settingsCaminhosForm, erroSettingsCaminhos, settingsCaminhosSalvo, salvandoSettingsCaminhos, carregarSettingsCaminhos, salvarSettingsCaminhos,
```

- [ ] **Step 4: Verificacao manual no navegador**

Run: `node server.js` (ou o `.bat` de iniciar), abrir `http://localhost:3001` (ou porta
configurada), clicar no botao "Caminhos", conferir que o modal abre, carrega os valores
atuais, e que Salvar grava (conferir no GET seguinte ou reabrindo o modal).

- [ ] **Step 5: Commit**

```bash
git add syndi_qa.html js/qa.js
git commit -m "feat: modal de settings pra caminhos de rede (legado/OCR/robo)"
```

---

## Task 4: `listarOsNone` le direto do destino configuravel

**Files:**
- Modify: `lib/qaSyndi.js:178-220` (assinatura de `listarOsNone`)
- Modify: `server.js` (todas as ocorrencias de `path.join(qaSyndi.AGCONFERENCIA,
  'OS_NONE')`)
- Test: `lib/qaSyndi.test.js`

**Interfaces:**
- Consumes: nada de tasks anteriores (so muda a assinatura de uma funcao ja existente).
- Produces: `qaSyndi.listarOsNone(legadoDestinoDir)` — mesmo formato de retorno de antes
  (`[{ gtin, pastaGtinNome, arquivos }]`), mas agora recebe o path final direto (sem
  concatenar `'OS_NONE'`).

- [ ] **Step 1: Escreva o teste que falha**

Adicione ao `lib/qaSyndi.test.js`:

```javascript
test('listarOsNone le direto do diretorio recebido, sem concatenar OS_NONE', () => {
    const dirTemp = criarDirTemp();
    const destino = path.join(dirTemp, 'QualquerNomeDeDestino');
    fs.mkdirSync(path.join(destino, '7891234567890'), { recursive: true });
    fs.writeFileSync(path.join(destino, '7891234567890', 'foto.jpg'), 'x');
    const resultado = qaSyndi.listarOsNone(destino);
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].gtin, '7891234567890');
    assert.equal(resultado[0].arquivos.length, 1);
});

test('listarOsNone devolve array vazio quando o diretorio nao existe', () => {
    const resultado = qaSyndi.listarOsNone(path.join(criarDirTemp(), 'nao-existe'));
    assert.deepEqual(resultado, []);
});
```

- [ ] **Step 2: Rode pra confirmar que falha**

Run: `node --test lib/qaSyndi.test.js`
Expected: FAIL — os testes passam de fato hoje tambem (a funcao ja aceita um dir e lista
GTINs dentro), MAS confirme rodando antes do Step 3 que o comportamento atual bate 1:1
(a mudanca real esta nos *callers*, nao no corpo de `listarOsNone`). Se passar aqui, siga
direto pro Step 3 sem alterar `listarOsNone` (ela ja funciona assim — o problema esta em
quem monta o path antes de chamar).

- [ ] **Step 3: Ajuste `listarOsNone` e os callers**

Em `lib/qaSyndi.js`, na funcao `listarOsNone` (linha 178), troque:

```javascript
function listarOsNone(agConferenciaDir) {
    const osNoneDir = path.join(agConferenciaDir, 'OS_NONE');
    if (!fs.existsSync(osNoneDir)) return [];
```

por:

```javascript
// Recebe o path final direto (legadoDestinoDir de caminhos-locais.json) - nao concatena
// mais 'OS_NONE' porque essa pasta agora e uma pasta de backup no drive, configurada em
// Settings, independente da estrutura de AgConferencia.
function listarOsNone(osNoneDir) {
    if (!osNoneDir || !fs.existsSync(osNoneDir)) return [];
```

Atualize o comentario da funcao (linhas 175-177) removendo a mencao a "suas subpastas" -
troque para:

```javascript
// Lista todos os GTINs na pasta de legado configurada em Settings (legadoDestinoDir) -
// fotos do fotografo externo que ainda nao tem OS atribuida.
```

Em `server.js`, substitua **todas** as ocorrencias (9 no total, listadas nas linhas 84,
179, 228, 379, 427, 475, 514, 566) de:

```javascript
path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE')
```

por:

```javascript
qaSyndi.CAMINHOS_LOCAIS.legadoDestinoDir
```

Use replace-all no editor (string identica em todas as ocorrencias). Confira com grep
depois que zerou:

```bash
grep -n "AGCONFERENCIA, 'OS_NONE'" server.js
```
Expected: nenhuma linha.

Tambem no endpoint `/api/os-none` (linha 133-139 originalmente), troque a chamada:

```javascript
const gtins = qaSyndi.listarOsNone(qaSyndi.AGCONFERENCIA);
```

por:

```javascript
const gtins = qaSyndi.listarOsNone(qaSyndi.CAMINHOS_LOCAIS.legadoDestinoDir);
```

- [ ] **Step 4: Rode os testes pra confirmar que passam**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS

- [ ] **Step 5: Teste manual**

Configure `legadoDestinoDir` via o modal de Settings (Task 3) apontando pra uma pasta
local de teste com uma subpasta de GTIN dentro (ex.: `C:\teste-legado\7891234567890\`
com uma foto `.jpg`), marque "Mostrar OS_NONE" na tela, e confirme que o GTIN aparece na
lista.

- [ ] **Step 6: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js server.js
git commit -m "refactor: OS_NONE le direto de legadoDestinoDir configuravel, sem copia local"
```

---

## Task 5: `verificarEOrganizarOsNone` usa os caminhos configuraveis

**Files:**
- Modify: `lib/qaSyndi.js:797-917`
- Modify: `server.js` (chamada do endpoint `/api/verificar-os-none`)
- Test: `lib/qaSyndi.test.js`

**Interfaces:**
- Consumes: `qaSyndi.CAMINHOS_LOCAIS` (Task 1), `qaSyndi.listarOsNone` com a nova
  assinatura (Task 4).
- Produces: `qaSyndi.verificarEOrganizarOsNone(agConferenciaDir, legadoDestinoDir,
  cadastroOcrDir, opcoes)` — mesmo retorno de antes (`{ ok, movidos, avisos, erros }`),
  agora com um parametro a mais (`legadoDestinoDir`) entre `agConferenciaDir` e
  `cadastroOcrDir`.

- [ ] **Step 1: Escreva o teste que falha**

Adicione ao `lib/qaSyndi.test.js`:

```javascript
test('verificarEOrganizarOsNone reorganiza do legadoDestinoDir pra pasta da OS em agConferenciaDir', async () => {
    const dirTemp = criarDirTemp();
    const agConferenciaDir = path.join(dirTemp, 'AgConferencia');
    const legadoDestinoDir = path.join(dirTemp, 'QA_Legado');
    const cadastroOcrDir = path.join(dirTemp, 'Cadastro_OCR');

    fs.mkdirSync(path.join(agConferenciaDir, 'OS_555'), { recursive: true });
    const pastaGtinLegado = path.join(legadoDestinoDir, '7891234567890');
    fs.mkdirSync(pastaGtinLegado, { recursive: true });
    fs.writeFileSync(path.join(pastaGtinLegado, 'foto1.jpg'), 'a');
    fs.writeFileSync(path.join(pastaGtinLegado, 'foto2.jpg'), 'b');
    qaSyndi.escreverMarcasOcr(pastaGtinLegado, { 'foto1.jpg': true, 'foto2.jpg': true });

    const resultado = await qaSyndi.verificarEOrganizarOsNone(agConferenciaDir, legadoDestinoDir, cadastroOcrDir, {});

    assert.equal(resultado.ok, true);
    assert.ok(fs.existsSync(path.join(agConferenciaDir, 'OS_555', '7891234567890', 'foto1.jpg')));
    assert.ok(fs.existsSync(path.join(cadastroOcrDir, '7891234567890_foto1.jpg')));
    assert.ok(fs.existsSync(path.join(cadastroOcrDir, '7891234567890_foto2.jpg')));
});
```

- [ ] **Step 2: Rode pra confirmar que falha**

Run: `node --test lib/qaSyndi.test.js`
Expected: FAIL — `TypeError` (assinatura antiga espera 3 argumentos, `opcoes` recebe o
`cadastroOcrDir` do teste no lugar errado, ou o arquivo nao e movido pro path esperado).

- [ ] **Step 3: Ajuste a funcao**

Em `lib/qaSyndi.js`, troque a assinatura e o corpo relevante (linhas 800-824):

```javascript
async function verificarEOrganizarOsNone(agConferenciaDir, legadoDestinoDir, cadastroOcrDir, opcoes) {
    if (!cadastroOcrDir) {
        cadastroOcrDir = 'C:\\Cadastro\\OCR';
    }
    opcoes = opcoes || {};

    const resultado = {
        ok: true,
        movidos: [],
        avisos: [],
        erros: []
    };

    if (!fs.existsSync(cadastroOcrDir)) {
        fs.mkdirSync(cadastroOcrDir, { recursive: true });
    }

    const osNoneData = listarOsNone(legadoDestinoDir);

    for (const item of osNoneData) {
        const gtin = item.gtin;
        const pastaGtinNome = item.pastaGtinNome;
        const pastaOsNonePath = path.join(legadoDestinoDir, pastaGtinNome);
```

(o resto do corpo da funcao, da validacao de marcas OCR em diante, continua igual - so a
assinatura e essas 4 linhas do topo mudam).

- [ ] **Step 4: Atualize o caller em `server.js`**

No endpoint `/api/verificar-os-none` (linha ~914), troque:

```javascript
        qaSyndi.verificarEOrganizarOsNone(qaSyndi.AGCONFERENCIA, undefined, {
            redmine: redmine,
            basePath: BASE_PATH
        }).then(resultado => {
```

por:

```javascript
        qaSyndi.verificarEOrganizarOsNone(qaSyndi.AGCONFERENCIA, qaSyndi.CAMINHOS_LOCAIS.legadoDestinoDir, qaSyndi.CAMINHOS_LOCAIS.cadastroOcrDir, {
            redmine: redmine,
            basePath: BASE_PATH
        }).then(resultado => {
```

- [ ] **Step 5: Rode os testes pra confirmar que passam**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js server.js
git commit -m "refactor: verificarEOrganizarOsNone recebe legadoDestinoDir e cadastroOcrDir explicitos"
```

---

## Task 6: Pescador de GTIN

**Files:**
- Modify: `lib/qaSyndi.js` (nova funcao, apos `verificarEOrganizarOsNone`)
- Modify: `server.js` (novo endpoint)
- Test: `lib/qaSyndi.test.js`

**Interfaces:**
- Consumes: `REGEX_PASTA_GTIN` (const ja existente em `lib/qaSyndi.js:57`), helper de copia
  recursiva (extraido do que ja existe dentro de `verificarEOrganizarOsNone` — ver Step 3).
- Produces: `qaSyndi.pescarGtins(origemDir, destinoDir)` → `Promise<{ novos: string[],
  jaExistiam: string[], erros: string[] }>` (arrays de GTIN, exceto `erros` que sao
  mensagens de texto).

- [ ] **Step 1: Escreva o teste que falha**

Adicione ao `lib/qaSyndi.test.js`:

```javascript
test('pescarGtins copia GTINs novos das subpastas de mes da origem pro destino plano', async () => {
    const dirTemp = criarDirTemp();
    const origem = path.join(dirTemp, 'Origem');
    const destino = path.join(dirTemp, 'Destino');

    fs.mkdirSync(path.join(origem, 'Agosto', '1111111111111'), { recursive: true });
    fs.writeFileSync(path.join(origem, 'Agosto', '1111111111111', 'foto.jpg'), 'a');
    fs.mkdirSync(path.join(origem, 'Setembro', '2222222222222'), { recursive: true });
    fs.writeFileSync(path.join(origem, 'Setembro', '2222222222222', 'foto.jpg'), 'b');

    fs.mkdirSync(path.join(destino, '1111111111111'), { recursive: true });
    fs.writeFileSync(path.join(destino, '1111111111111', 'foto.jpg'), 'ja-existente');

    const resultado = await qaSyndi.pescarGtins(origem, destino);

    assert.deepEqual(resultado.novos, ['2222222222222']);
    assert.deepEqual(resultado.jaExistiam, ['1111111111111']);
    assert.equal(resultado.erros.length, 0);
    assert.ok(fs.existsSync(path.join(destino, '2222222222222', 'foto.jpg')));
    // nao mexeu no que ja existia
    assert.equal(fs.readFileSync(path.join(destino, '1111111111111', 'foto.jpg'), 'utf8'), 'ja-existente');
    // origem intocada
    assert.ok(fs.existsSync(path.join(origem, 'Setembro', '2222222222222', 'foto.jpg')));
});

test('pescarGtins e idempotente - rodar duas vezes na sequencia nao copia de novo', async () => {
    const dirTemp = criarDirTemp();
    const origem = path.join(dirTemp, 'Origem');
    const destino = path.join(dirTemp, 'Destino');
    fs.mkdirSync(path.join(origem, 'Agosto', '3333333333333'), { recursive: true });
    fs.writeFileSync(path.join(origem, 'Agosto', '3333333333333', 'foto.jpg'), 'x');

    await qaSyndi.pescarGtins(origem, destino);
    const segunda = await qaSyndi.pescarGtins(origem, destino);

    assert.deepEqual(segunda.novos, []);
    assert.deepEqual(segunda.jaExistiam, ['3333333333333']);
});

test('pescarGtins devolve erro claro quando origem nao existe', async () => {
    const dirTemp = criarDirTemp();
    const resultado = await qaSyndi.pescarGtins(path.join(dirTemp, 'nao-existe'), path.join(dirTemp, 'destino'));
    assert.equal(resultado.novos.length, 0);
    assert.ok(resultado.erros.length > 0);
});
```

- [ ] **Step 2: Rode pra confirmar que falha**

Run: `node --test lib/qaSyndi.test.js`
Expected: FAIL — `qaSyndi.pescarGtins is not a function`

- [ ] **Step 3: Implemente**

Primeiro, extraia o helper de copia recursiva que ja existe *dentro* de
`verificarEOrganizarOsNone` (linhas 853-867 do arquivo original) pro escopo do modulo, pra
`pescarGtins` reusar sem duplicar. Logo antes de `async function
verificarEOrganizarOsNone`, adicione:

```javascript
// Copia um diretorio inteiro recursivamente (arquivos e subpastas). Usado tanto pra
// reorganizar OS_NONE quanto pro Pescador de GTIN - mesma logica, dois pontos de uso.
function copiarDiretorioRecursivo(src, dst) {
    if (!fs.existsSync(dst)) {
        fs.mkdirSync(dst, { recursive: true });
    }
    const arquivos = fs.readdirSync(src, { withFileTypes: true });
    for (const arquivo of arquivos) {
        const srcPath = path.join(src, arquivo.name);
        const dstPath = path.join(dst, arquivo.name);
        if (arquivo.isDirectory()) {
            copiarDiretorioRecursivo(srcPath, dstPath);
        } else {
            fs.copyFileSync(srcPath, dstPath);
        }
    }
}
```

Dentro de `verificarEOrganizarOsNone`, remova a declaracao local
`const copiarDiretorioRecursivo = (src, dst) => { ... };` (linhas 853-867 originais) e
mantenha so a chamada `copiarDiretorioRecursivo(pastaOsNonePath, pastaGtinDestino);` (a
funcao de modulo cobre o mesmo caso).

Agora adicione `pescarGtins`, logo apos `verificarEOrganizarOsNone`:

```javascript
// Pescador de GTIN: varre as subpastas de mes da origem (drive externo, so leitura) e
// copia pro destino (backup no drive, pasta plana) so os GTINs que ainda nao existem la.
// Nunca mexe na origem. Idempotente - rodar de novo sem nada de novo na origem nao
// copia nada.
async function pescarGtins(origemDir, destinoDir) {
    const resultado = { novos: [], jaExistiam: [], erros: [] };

    if (!fs.existsSync(origemDir)) {
        resultado.erros.push('Pasta de origem nao existe: ' + origemDir);
        return resultado;
    }

    if (!fs.existsSync(destinoDir)) {
        fs.mkdirSync(destinoDir, { recursive: true });
    }

    const subpastasMes = fs.readdirSync(origemDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name);

    for (const nomeMes of subpastasMes) {
        const pastaMesPath = path.join(origemDir, nomeMes);
        const pastasGtin = fs.readdirSync(pastaMesPath, { withFileTypes: true })
            .filter(entrada => entrada.isDirectory())
            .map(entrada => entrada.name)
            .filter(nome => REGEX_PASTA_GTIN.test(nome));

        for (const pastaGtinNome of pastasGtin) {
            const gtin = pastaGtinNome.match(REGEX_PASTA_GTIN)[1];
            const destinoGtinPath = path.join(destinoDir, pastaGtinNome);

            if (fs.existsSync(destinoGtinPath)) {
                resultado.jaExistiam.push(gtin);
                continue;
            }

            try {
                copiarDiretorioRecursivo(path.join(pastaMesPath, pastaGtinNome), destinoGtinPath);
                resultado.novos.push(gtin);
            } catch (err) {
                resultado.erros.push('GTIN ' + gtin + ' (' + nomeMes + '): ' + err.message);
            }
        }
    }

    return resultado;
}
```

No `module.exports`, adicione `pescarGtins,` apos `verificarEOrganizarOsNone`.

- [ ] **Step 4: Rode os testes pra confirmar que passam**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS

- [ ] **Step 5: Adicione o endpoint em `server.js`**

Apos o bloco de `/api/verificar-os-none` (Task 5, apos a chave de fechamento do `.then`),
adicione:

```javascript
    // Pescador de GTIN: copia da origem do legado (drive externo, so leitura) pro
    // destino (backup no drive, onde o QA acontece) so os GTINs que ainda nao existem
    // no destino. Requer os dois caminhos configurados em Settings.
    if (req.method === 'POST' && req.url === '/api/pescador-gtin') {
        const origem = qaSyndi.CAMINHOS_LOCAIS.legadoOrigemDir;
        const destino = qaSyndi.CAMINHOS_LOCAIS.legadoDestinoDir;
        if (!origem || !destino) {
            enviarJson(res, 400, { ok: false, error: 'Configure origem e destino do legado em Settings > Caminhos antes de usar o Pescador de GTIN' });
            return;
        }
        qaSyndi.pescarGtins(origem, destino).then(resultado => {
            enviarJson(res, 200, Object.assign({ ok: resultado.erros.length === 0 }, resultado));
        }).catch(err => {
            enviarJson(res, 500, { ok: false, error: err.message });
        });
        return;
    }

```

- [ ] **Step 6: Teste manual**

Com o servidor rodando e `legadoOrigemDir`/`legadoDestinoDir` configurados (pastas locais
de teste servem — nao precisa ser drive de rede pra validar a logica):

```bash
curl -X POST http://localhost:3001/api/pescador-gtin
```
Expected: `{ "ok": true, "novos": [...], "jaExistiam": [...], "erros": [] }` refletindo o
conteudo das pastas de teste.

- [ ] **Step 7: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js server.js
git commit -m "feat: Pescador de GTIN copia origem->destino no drive, so o que falta"
```

---

## Task 7: JSON de controle de legado (`controle-legado.json`)

**Files:**
- Modify: `lib/qaSyndi.js` (funcoes novas + integracao em `listarOsNone` e `pescarGtins`)
- Modify: `server.js` (endpoint de scan)
- Test: `lib/qaSyndi.test.js`

**Interfaces:**
- Consumes: `qaSyndi.pescarGtins` (Task 6, pra gravar `pendente` nos GTINs novos),
  `qaSyndi.listarOsNone` (Task 4, pra incluir `status` no retorno).
- Produces: `qaSyndi.caminhoControleLegado(destinoDir)`,
  `qaSyndi.lerControleLegado(destinoDir)` → `{ [gtin]: { status, data, mesOrigem? } }`,
  `qaSyndi.escreverControleLegado(destinoDir, mapa)`,
  `qaSyndi.gerarSnapshotLegado(destinoDir)` → `Promise<{ ok, marcados: string[], ja:
  string[] }>` (so marca GTINs que ainda nao tem entrada no JSON). Muda o retorno de
  `qaSyndi.listarOsNone` pra incluir `status` em cada item (`'legado' | 'pendente'`).

- [ ] **Step 1: Escreva o teste que falha**

Adicione ao `lib/qaSyndi.test.js`:

```javascript
test('gerarSnapshotLegado marca GTINs existentes como legado, sem duplicar quem ja tem entrada', async () => {
    const dirTemp = criarDirTemp();
    const destino = path.join(dirTemp, 'Destino');
    fs.mkdirSync(path.join(destino, '4444444444444'), { recursive: true });
    fs.mkdirSync(path.join(destino, '5555555555555'), { recursive: true });
    qaSyndi.escreverControleLegado(destino, { '5555555555555': { status: 'pendente', data: '2026-08-20T00:00:00.000Z' } });

    const resultado = await qaSyndi.gerarSnapshotLegado(destino);

    assert.deepEqual(resultado.marcados, ['4444444444444']);
    assert.deepEqual(resultado.ja, ['5555555555555']);
    const mapa = qaSyndi.lerControleLegado(destino);
    assert.equal(mapa['4444444444444'].status, 'legado');
    assert.equal(mapa['5555555555555'].status, 'pendente'); // nao foi sobrescrito
});

test('pescarGtins grava status pendente no controle-legado.json pros GTINs novos', async () => {
    const dirTemp = criarDirTemp();
    const origem = path.join(dirTemp, 'Origem');
    const destino = path.join(dirTemp, 'Destino');
    fs.mkdirSync(path.join(origem, 'Outubro', '6666666666666'), { recursive: true });
    fs.writeFileSync(path.join(origem, 'Outubro', '6666666666666', 'foto.jpg'), 'x');

    await qaSyndi.pescarGtins(origem, destino);

    const mapa = qaSyndi.lerControleLegado(destino);
    assert.equal(mapa['6666666666666'].status, 'pendente');
    assert.equal(mapa['6666666666666'].mesOrigem, 'Outubro');
    assert.ok(mapa['6666666666666'].data);
});

test('listarOsNone inclui status do controle-legado.json, default pendente quando sem entrada', () => {
    const dirTemp = criarDirTemp();
    const destino = path.join(dirTemp, 'Destino');
    fs.mkdirSync(path.join(destino, '7777777777777'), { recursive: true });
    fs.writeFileSync(path.join(destino, '7777777777777', 'foto.jpg'), 'x');
    fs.mkdirSync(path.join(destino, '8888888888888'), { recursive: true });
    fs.writeFileSync(path.join(destino, '8888888888888', 'foto.jpg'), 'x');
    qaSyndi.escreverControleLegado(destino, { '7777777777777': { status: 'legado', data: '2026-08-18T00:00:00.000Z' } });

    const resultado = qaSyndi.listarOsNone(destino);
    const item7 = resultado.find(i => i.gtin === '7777777777777');
    const item8 = resultado.find(i => i.gtin === '8888888888888');
    assert.equal(item7.status, 'legado');
    assert.equal(item8.status, 'pendente');
});
```

- [ ] **Step 2: Rode pra confirmar que falha**

Run: `node --test lib/qaSyndi.test.js`
Expected: FAIL — `qaSyndi.gerarSnapshotLegado is not a function`,
`qaSyndi.escreverControleLegado is not a function`, `mapa['6666666666666'] is undefined`,
`item7.status is undefined`.

- [ ] **Step 3: Implemente as funcoes de JSON**

Logo antes de `function listarOsNone` (linha 175 original), adicione:

```javascript
// Controle de legado: separa GTINs que ja passaram por QA manual antes deste sistema
// (status "legado") dos que o Pescador trouxe depois (status "pendente"). Gravado em
// controle-legado.json na raiz do proprio destino (fica no drive compartilhado, visivel
// a qualquer analista que aponte pro mesmo legadoDestinoDir). So separa os dois grupos
// pro filtro da tela - nao rastreia conclusao de QA (isso ja e resolvido pelo fluxo
// existente de organizar/Finalizadas).
function caminhoControleLegado(destinoDir) {
    return path.join(destinoDir, 'controle-legado.json');
}

function lerControleLegado(destinoDir) {
    const caminho = caminhoControleLegado(destinoDir);
    if (!fs.existsSync(caminho)) return {};
    try {
        const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
        return typeof dados === 'object' && dados ? dados : {};
    } catch (err) {
        return {};
    }
}

function escreverControleLegado(destinoDir, mapa) {
    fs.writeFileSync(caminhoControleLegado(destinoDir), JSON.stringify(mapa, null, 2) + '\n', 'utf8');
}

// Scan de uma vez so: marca como "legado" todo GTIN que ja existe no destino e ainda nao
// tem entrada no JSON (roda sob acao explicita do usuario - ver endpoint em server.js).
async function gerarSnapshotLegado(destinoDir) {
    const mapa = lerControleLegado(destinoDir);
    const resultado = { ok: true, marcados: [], ja: [] };

    if (!fs.existsSync(destinoDir)) {
        resultado.ok = false;
        return resultado;
    }

    const pastasGtin = fs.readdirSync(destinoDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name)
        .filter(nome => REGEX_PASTA_GTIN.test(nome));

    for (const pastaGtinNome of pastasGtin) {
        const gtin = pastaGtinNome.match(REGEX_PASTA_GTIN)[1];
        if (mapa[gtin]) {
            resultado.ja.push(gtin);
            continue;
        }
        const stat = fs.statSync(path.join(destinoDir, pastaGtinNome));
        mapa[gtin] = { status: 'legado', data: stat.mtime.toISOString() };
        resultado.marcados.push(gtin);
    }

    escreverControleLegado(destinoDir, mapa);
    return resultado;
}
```

- [ ] **Step 4: Integre em `listarOsNone`**

Na funcao `listarOsNone` (ja ajustada na Task 4), logo antes do `return
pastasDentro.map(...)`, adicione a leitura do mapa, e inclua `status` no objeto
retornado:

```javascript
    const controleLegado = lerControleLegado(osNoneDir);

    return pastasDentro.map(pastaGtinNome => {
        const gtin = pastaGtinNome.match(REGEX_PASTA_GTIN)[1];
        const pastaGtinPath = path.join(osNoneDir, pastaGtinNome);
```

(mantenha o corpo existente do `.map` igual ate o `return` final dele, que passa a ser):

```javascript
        return {
            gtin,
            pastaGtinNome,
            arquivos,
            status: (controleLegado[gtin] && controleLegado[gtin].status) || 'pendente'
        };
    });
```

- [ ] **Step 5: Integre em `pescarGtins`**

Na funcao `pescarGtins` (Task 6), no bloco onde grava `resultado.novos.push(gtin);`
dentro do `try`, adicione a gravacao no controle logo antes:

```javascript
            try {
                copiarDiretorioRecursivo(path.join(pastaMesPath, pastaGtinNome), destinoGtinPath);
                const controleLegado = lerControleLegado(destinoDir);
                controleLegado[gtin] = { status: 'pendente', data: new Date().toISOString(), mesOrigem: nomeMes };
                escreverControleLegado(destinoDir, controleLegado);
                resultado.novos.push(gtin);
            } catch (err) {
                resultado.erros.push('GTIN ' + gtin + ' (' + nomeMes + '): ' + err.message);
            }
```

(substitui o bloco `try`/`catch` equivalente escrito na Task 6, Step 3).

No `module.exports`, adicione `caminhoControleLegado, lerControleLegado,
escreverControleLegado, gerarSnapshotLegado,` apos `pescarGtins,`.

- [ ] **Step 6: Rode os testes pra confirmar que passam**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS (suite inteira, incluindo os testes das Tasks 1-6 - confirma que nada
quebrou)

- [ ] **Step 7: Adicione o endpoint de scan em `server.js`**

Apos o bloco de `/api/pescador-gtin` (Task 6), adicione:

```javascript
    // Scan inicial do legado: marca como "legado" todo GTIN que ja existe no destino e
    // ainda nao tem entrada em controle-legado.json. So acao explicita do usuario -
    // rodar de novo e seguro (nao sobrescreve entrada existente), mas o front-end so
    // habilita o botao antes do primeiro scan (ver Task 8).
    if (req.method === 'POST' && req.url === '/api/legado/scan') {
        const destino = qaSyndi.CAMINHOS_LOCAIS.legadoDestinoDir;
        if (!destino) {
            enviarJson(res, 400, { ok: false, error: 'Configure o destino do legado em Settings > Caminhos antes de gerar o snapshot' });
            return;
        }
        qaSyndi.gerarSnapshotLegado(destino).then(resultado => {
            enviarJson(res, 200, resultado);
        }).catch(err => {
            enviarJson(res, 500, { ok: false, error: err.message });
        });
        return;
    }

```

E o endpoint pra checar se ja existe snapshot (usado pelo front-end pra habilitar/
desabilitar o botao):

```javascript
    if (req.method === 'GET' && req.url === '/api/legado/status') {
        const destino = qaSyndi.CAMINHOS_LOCAIS.legadoDestinoDir;
        if (!destino) {
            enviarJson(res, 200, { ok: true, existeSnapshot: false });
            return;
        }
        enviarJson(res, 200, { ok: true, existeSnapshot: fs.existsSync(qaSyndi.caminhoControleLegado(destino)) });
        return;
    }

```

- [ ] **Step 8: Teste manual**

```bash
curl http://localhost:3001/api/legado/status
curl -X POST http://localhost:3001/api/legado/scan
curl http://localhost:3001/api/legado/status
curl http://localhost:3001/api/os-none
```
Expected: primeiro status `existeSnapshot:false`; scan marca os GTINs existentes na pasta
de teste; segundo status `existeSnapshot:true`; `/api/os-none` traz `status:"legado"` nos
GTINs que ja existiam antes do scan.

- [ ] **Step 9: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js server.js
git commit -m "feat: controle-legado.json separa GTINs legado x pendente"
```

---

## Task 8: Front-end — Pescador, snapshot de legado e filtro

**Files:**
- Modify: `syndi_qa.html` (botoes + filtro na secao OS_NONE)
- Modify: `js/qa.js` (estado + funcoes)

**Interfaces:**
- Consumes: `POST /api/pescador-gtin`, `POST /api/legado/scan`, `GET /api/legado/status`
  (Task 7), `item.status` no retorno de `/api/os-none` (Task 7).

- [ ] **Step 1: Adicione estado no `js/qa.js`**

Apos `settingsCaminhosForm`/`salvandoSettingsCaminhos` (Task 3), adicione:

```javascript
        const pescandoGtins = ref(false);
        const resultadoPescador = ref(null);
        const existeSnapshotLegado = ref(true); // otimista ate carregar - evita mostrar o botao piscando
        const gerandoSnapshotLegado = ref(false);
        const resultadoSnapshotLegado = ref(null);
        const filtroLegado = ref('todos'); // 'todos' | 'legado' | 'pendente'
```

- [ ] **Step 2: Adicione as funcoes**

Apos `verificarOsNone` (Task existente, ja no arquivo), adicione:

```javascript
        async function pescarGtinsAcao() {
            if (pescandoGtins.value) return;
            pescandoGtins.value = true;
            resultadoPescador.value = null;
            try {
                const resp = await fetch(API + '/api/pescador-gtin', { method: 'POST' });
                const dados = await resp.json();
                resultadoPescador.value = dados;
                if (dados.ok) carregarOsNone();
            } catch (err) {
                resultadoPescador.value = { ok: false, error: 'Erro de conexao: ' + err.message };
            } finally {
                pescandoGtins.value = false;
            }
        }

        async function carregarStatusLegado() {
            try {
                const resp = await fetch(API + '/api/legado/status');
                const dados = await resp.json();
                if (dados.ok) existeSnapshotLegado.value = dados.existeSnapshot;
            } catch (err) {
                console.error('Erro ao checar status do legado:', err);
            }
        }

        async function gerarSnapshotLegadoAcao() {
            if (gerandoSnapshotLegado.value) return;
            gerandoSnapshotLegado.value = true;
            resultadoSnapshotLegado.value = null;
            try {
                const resp = await fetch(API + '/api/legado/scan', { method: 'POST' });
                const dados = await resp.json();
                resultadoSnapshotLegado.value = dados;
                if (dados.ok) {
                    existeSnapshotLegado.value = true;
                    carregarOsNone();
                }
            } catch (err) {
                resultadoSnapshotLegado.value = { ok: false, error: 'Erro de conexao: ' + err.message };
            } finally {
                gerandoSnapshotLegado.value = false;
            }
        }

        const osNoneFiltrado = computed(() => {
            if (filtroLegado.value === 'todos') return osNone.value;
            return osNone.value.filter(item => item.status === filtroLegado.value);
        });
```

Chame `carregarStatusLegado()` dentro do `onMounted` existente (procure o bloco
`onMounted(() => { ... })` no `setup()` e adicione a chamada la dentro, junto das outras
chamadas iniciais).

No `return { ... }` do `setup()`, adicione:

```javascript
            pescandoGtins, resultadoPescador, pescarGtinsAcao, existeSnapshotLegado, gerandoSnapshotLegado, resultadoSnapshotLegado, gerarSnapshotLegadoAcao, filtroLegado, osNoneFiltrado,
```

- [ ] **Step 3: Adicione a UI em `syndi_qa.html`**

Na secao de OS_NONE (dentro de `osExpandida === 'OS_NONE' && !carregandoOsNone`, apos a
`div.qa-os-none-items` abrir, antes do `v-for` de `item in osNone` — que passa a iterar
`osNoneFiltrado`), adicione o filtro e os botoes:

Troque `v-for="item in osNone"` por `v-for="item in osNoneFiltrado"` (linha original 168).

Logo apos a abertura de `<div v-if="osExpandida === 'OS_NONE' && !carregandoOsNone"
class="qa-os-none-items">` (linha 167), adicione:

```html
                            <div class="qa-os-none-toolbar mb-2 d-flex gap-2 align-items-center flex-wrap">
                                <select class="form-select form-select-sm w-auto" v-model="filtroLegado">
                                    <option value="todos">Todos</option>
                                    <option value="legado">Legado</option>
                                    <option value="pendente">Pendente</option>
                                </select>
                                <button type="button" class="btn btn-sm btn-outline-light" @click="pescarGtinsAcao" :disabled="pescandoGtins">
                                    <i v-if="pescandoGtins" class="bi bi-hourglass-split qa-girando"></i>
                                    <i v-else class="bi bi-search"></i> Pescador de GTIN
                                </button>
                                <button v-if="!existeSnapshotLegado" type="button" class="btn btn-sm btn-outline-warning" @click="gerarSnapshotLegadoAcao" :disabled="gerandoSnapshotLegado">
                                    <i v-if="gerandoSnapshotLegado" class="bi bi-hourglass-split qa-girando"></i>
                                    <i v-else class="bi bi-camera"></i> Gerar snapshot do legado
                                </button>
                            </div>
                            <div v-if="resultadoPescador" class="alert mb-2" :class="resultadoPescador.ok ? 'alert-success' : 'alert-danger'">
                                <template v-if="resultadoPescador.ok">Pescador: {{ resultadoPescador.novos.length }} novo(s), {{ resultadoPescador.jaExistiam.length }} ja existiam.</template>
                                <template v-else>{{ resultadoPescador.error }}</template>
                            </div>
                            <div v-if="resultadoSnapshotLegado" class="alert mb-2" :class="resultadoSnapshotLegado.ok ? 'alert-success' : 'alert-danger'">
                                <template v-if="resultadoSnapshotLegado.ok">Snapshot: {{ resultadoSnapshotLegado.marcados.length }} marcado(s) como legado.</template>
                                <template v-else>{{ resultadoSnapshotLegado.error }}</template>
                            </div>
```

E dentro do `v-for` de itens, adicione um badge de status ao lado do GTIN (troque o
`<span>{{ item.gtin }}</span>` original por):

```html
                                <span>{{ item.gtin }}</span>
                                <span class="badge ms-2" :class="item.status === 'legado' ? 'bg-secondary' : 'bg-warning text-dark'">{{ item.status }}</span>
```

- [ ] **Step 4: Verificacao manual no navegador**

Com `legadoOrigemDir`/`legadoDestinoDir` configurados (Task 3) apontando pra pastas de
teste com GTINs de exemplo: abrir a tela, marcar "Mostrar OS_NONE", clicar "Gerar
snapshot do legado" (deve sumir depois de rodar), confirmar que os GTINs existentes viram
badge "legado"; adicionar um GTIN novo numa subpasta de mes na origem de teste, clicar
"Pescador de GTIN", confirmar que ele aparece na lista com badge "pendente"; trocar o
filtro entre Todos/Legado/Pendente e confirmar que a lista filtra corretamente.

- [ ] **Step 5: Commit**

```bash
git add syndi_qa.html js/qa.js
git commit -m "feat: Pescador de GTIN, snapshot de legado e filtro legado/pendente na tela"
```

---

## Verificacao final

- [ ] **Rode a suite inteira**

Run: `npm test` (equivalente a `node --test lib/*.test.js`)
Expected: PASS, todos os testes (antigos + novos das 8 tasks)

- [ ] **Suba o servidor e faça o fluxo completo manualmente**

Run: `node server.js`, abrir a tela, configurar os 3 caminhos novos em Settings > Caminhos
(pastas locais de teste servem), gerar o snapshot do legado, rodar o Pescador de GTIN
depois de adicionar um GTIN novo na origem de teste, conferir o filtro
Legado/Pendente/Todos, e por fim rodar "Verificar/Organizar OS_NONE" pra confirmar que um
GTIN com 2+ marcas OCR ainda se move corretamente pra pasta da OS certa em
`AgConferencia` e copia os arquivos OCR pro `cadastroOcrDir` configurado.
