# Syndi_qa — Peça 1: Interface de QA + Retrabalho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o Syndi_qa (Node + Vue sem build), a interface remota de QA que lê fotos em `C:\Apps\SyncIMGSend\AgConferencia`, permite aprovar um GTIN inteiro (move pra `AgEnvio`) ou acionar retrabalho (checkboxes de motivo por foto, gera um TXT por GTIN, move pra `Retrabalho`).

**Architecture:** Servidor Node puro (sem framework) servindo um front-end Vue (Composition API, sem build) e uma API JSON própria. Lógica de negócio isolada em `lib/qaSyndi.js` (funções puras/testáveis, recebem os diretórios como parâmetro em vez de ler constantes globais, pra dar pra testar com pastas temporárias). `server.js` só resolve os caminhos reais e faz a ponte HTTP.

**Tech Stack:** Node.js (core `http`/`fs`/`path`/`child_process`, sem dependências novas), Vue 3 (arquivo estático copiado do sphoto, sem CDN), Bootstrap 5 + Bootstrap Icons (estáticos, copiados do sphoto), `node:test` + `node:assert/strict` (nativo do Node, sem framework de teste novo) para a lógica em `lib/`.

## Global Constraints

- Sem CDN, sem `npm install`, sem dependência nova — tudo offline, mesma filosofia do sphoto (`c:\sphoto\CLAUDE.md`).
- Servidor na porta `3000` (máquina separada do sphoto/terminais, sem conflito).
- GTIN é a unidade de decisão: aprovar e retrabalho sempre operam na pasta do GTIN inteira, nunca foto a foto isoladamente (spec seção 7).
- Subpastas `RT`/`IS`/`AP` dentro da pasta do GTIN são preservadas em qualquer move.
- Caminho do robô (`C:\Apps\SyncIMGSend` por padrão) fica em `caminhos-locais.json`, opcional e **gitignored** — sem o arquivo, usa o default embutido no código.
- Nomenclatura real das pastas que o robô `syncIMG.jar` cria (confirmada em `C:\Apps\SyncIMGSend\ini.conf`, `PROCESSO_6`): pasta de OS decorada como `OS_<os>---(<n> GTINs)---<data>` (regex `/^OS_(\d+)/` pra extrair o número), pasta de GTIN **sem decoração**, só o número (regex `/^(\d+)/`, que também cobre variantes decoradas de outros processos, então a mesma função serve pros dois níveis).
- Testes: lógica pura em `lib/qaSyndi.js` usa `node:test` com pastas temporárias (`fs.mkdtempSync`) — determinístico, sem depender de `C:\Apps\SyncIMGSend` real. Rotas HTTP em `server.js` são verificadas manualmente via `curl`, seguindo o padrão que o próprio sphoto já usa (documentado em `REGISTRO-DESENVOLVIMENTO.md` como "testado: N cenários") — não há framework de teste HTTP no projeto de referência e não vamos introduzir um novo.
- Arquivos sensíveis (`caminhos-locais.json`, `credencial.txt`, `credenciais.txt`, `valores.txt`, `.env`, `*.key/.pem/.pfx/.p12`) nunca podem ser servidos pelo handler estático — mesmo princípio do `ARQUIVOS_BLOQUEADOS` do sphoto.

---

## Task 1: Caminhos locais e constantes de pasta

**Files:**
- Create: `lib/qaSyndi.js`
- Create: `lib/qaSyndi.test.js`

**Interfaces:**
- Produces: `carregarCaminhosLocais(basePath)` → `{ syncimgSendBase: string }`; constantes `BASE_PATH`, `AGCONFERENCIA`, `AGENVIO`, `RETRABALHO` (strings, caminhos absolutos resolvidos a partir de `carregarCaminhosLocais`); `localizarPastaDecoradaPorPrefixo(baseDir, prefixoAlvo, prefixoRegex)` → `string|null`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// lib/qaSyndi.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const qaSyndi = require('./qaSyndi');

function criarDirTemp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'syndiqa-'));
}

test('carregarCaminhosLocais usa default quando nao ha caminhos-locais.json', () => {
    const dirTemp = criarDirTemp();
    const resultado = qaSyndi.carregarCaminhosLocais(dirTemp);
    assert.equal(resultado.syncimgSendBase, 'C:\\Apps\\SyncIMGSend');
});

test('carregarCaminhosLocais usa valor do arquivo quando presente', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'caminhos-locais.json'), JSON.stringify({ syncimgSendBase: 'D:\\Outro\\Caminho' }));
    const resultado = qaSyndi.carregarCaminhosLocais(dirTemp);
    assert.equal(resultado.syncimgSendBase, 'D:\\Outro\\Caminho');
});

test('carregarCaminhosLocais cai no default se o JSON estiver corrompido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'caminhos-locais.json'), '{ isso nao e json');
    const resultado = qaSyndi.carregarCaminhosLocais(dirTemp);
    assert.equal(resultado.syncimgSendBase, 'C:\\Apps\\SyncIMGSend');
});

test('localizarPastaDecoradaPorPrefixo acha pasta decorada pelo prefixo numerico', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'OS_49800---(2 GTINs)---2026-07-20'));
    const encontrada = qaSyndi.localizarPastaDecoradaPorPrefixo(dirTemp, '49800', /^OS_(\d+)/);
    assert.equal(encontrada, 'OS_49800---(2 GTINs)---2026-07-20');
});

test('localizarPastaDecoradaPorPrefixo devolve null quando nao acha', () => {
    const dirTemp = criarDirTemp();
    const encontrada = qaSyndi.localizarPastaDecoradaPorPrefixo(dirTemp, '99999', /^OS_(\d+)/);
    assert.equal(encontrada, null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test lib/qaSyndi.test.js`
Expected: FALHA — `Cannot find module './qaSyndi'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `lib/qaSyndi.js`**

```js
// lib/qaSyndi.js
// Le e organiza a fila de conferencia do robo externo C:\Apps\SyncIMGSend, fora do
// codigo do sphoto (sistema separado - a unica ligacao entre eles e o status no
// Redmine, nao codigo compartilhado). Ver docs/superpowers/specs/2026-07-21-syndi-qa-retrabalho-design.md.

const fs = require('fs');
const path = require('path');

const BASE_PATH = path.join(__dirname, '..');

const DEFAULTS_CAMINHOS_LOCAIS = { syncimgSendBase: 'C:\\Apps\\SyncIMGSend' };

// Caminho do robo varia por maquina - fica em caminhos-locais.json (gitignored,
// mesmo padrao ja usado no sphoto), NAO no codigo, pra "git pull" atualizar funcao
// sem sobrescrever o ajuste local de cada estacao.
function carregarCaminhosLocais(basePath) {
    const configPath = path.join(basePath, 'caminhos-locais.json');
    if (!fs.existsSync(configPath)) return Object.assign({}, DEFAULTS_CAMINHOS_LOCAIS);
    try {
        return Object.assign({}, DEFAULTS_CAMINHOS_LOCAIS, JSON.parse(fs.readFileSync(configPath, 'utf8')));
    } catch (err) {
        return Object.assign({}, DEFAULTS_CAMINHOS_LOCAIS);
    }
}

const CAMINHOS_LOCAIS = carregarCaminhosLocais(BASE_PATH);
const SYNCIMGSEND_BASE = CAMINHOS_LOCAIS.syncimgSendBase;
const AGCONFERENCIA = path.join(SYNCIMGSEND_BASE, 'AgConferencia');
const AGENVIO = path.join(SYNCIMGSEND_BASE, 'AgEnvio');
const RETRABALHO = path.join(SYNCIMGSEND_BASE, 'Retrabalho');

// As pastas que o robo de recebimento cria vem decoradas (ex.: "OS_49800---(3
// GTINs)---2026-07-20"), entao localizamos pelo prefixo numerico em vez do nome
// exato. Mesma funcao serve pro nivel OS (regex com "OS_") e pro nivel GTIN (regex
// so com digitos, decorado ou nao - ver PROCESSO_6 do ini.conf: GTIN nao e decorado
// nesse processo, mas a regex cobre os dois casos).
function localizarPastaDecoradaPorPrefixo(baseDir, prefixoAlvo, prefixoRegex) {
    if (!fs.existsSync(baseDir)) return null;
    const candidatos = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name);
    return candidatos.find(nome => {
        const m = nome.match(prefixoRegex);
        return m && m[1] === prefixoAlvo;
    }) || null;
}

module.exports = {
    BASE_PATH,
    AGCONFERENCIA,
    AGENVIO,
    RETRABALHO,
    carregarCaminhosLocais,
    localizarPastaDecoradaPorPrefixo
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS — 5 testes, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: caminhos locais configuraveis e localizacao de pasta decorada"
```

---

## Task 2: Listar fila (AgConferencia) e imagens de um GTIN

**Files:**
- Modify: `lib/qaSyndi.js`
- Modify: `lib/qaSyndi.test.js`

**Interfaces:**
- Consumes: `localizarPastaDecoradaPorPrefixo` (Task 1)
- Produces: `listarFila(agConferenciaDir)` → `Array<{ os: string, pastaOsNome: string, gtins: Array<{ gtin: string, pastaGtinNome: string }> }>`; `listarImagensGtin(pastaGtinPath)` → `{ raiz: Array<{nome, arquivo}>, subpastas: { [tag: 'RT'|'IS'|'AP']: Array<{nome, arquivo}> } }` (`arquivo` = conteúdo em base64).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `lib/qaSyndi.test.js`:

```js
test('listarFila ignora pastas sem prefixo OS_ e GTINs sem imagem', () => {
    const dirTemp = criarDirTemp();
    const pastaOs = path.join(dirTemp, 'OS_49800---(2 GTINs)---2026-07-20');
    fs.mkdirSync(path.join(pastaOs, '7898133020049'), { recursive: true });
    fs.mkdirSync(path.join(pastaOs, '7898133020001'), { recursive: true });
    fs.mkdirSync(path.join(dirTemp, 'lixo-sem-prefixo'), { recursive: true });

    const fila = qaSyndi.listarFila(dirTemp);
    assert.equal(fila.length, 1);
    assert.equal(fila[0].os, '49800');
    assert.equal(fila[0].pastaOsNome, 'OS_49800---(2 GTINs)---2026-07-20');
    assert.deepEqual(
        fila[0].gtins.map(g => g.gtin).sort(),
        ['7898133020001', '7898133020049']
    );
});

test('listarFila devolve array vazio quando a pasta nao existe', () => {
    const dirTemp = criarDirTemp();
    const fila = qaSyndi.listarFila(path.join(dirTemp, 'nao-existe'));
    assert.deepEqual(fila, []);
});

test('listarImagensGtin le raiz e subpastas RT/IS/AP, ignora tag sem foto', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), Buffer.from([1, 2, 3]));
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_2.jpg'), Buffer.from([4, 5, 6]));

    const imagens = qaSyndi.listarImagensGtin(dirTemp);
    assert.equal(imagens.raiz.length, 1);
    assert.equal(imagens.raiz[0].nome, 'foto_0.jpg');
    assert.equal(imagens.raiz[0].arquivo, Buffer.from([1, 2, 3]).toString('base64'));
    assert.equal(imagens.subpastas.RT.length, 1);
    assert.equal(imagens.subpastas.RT[0].nome, 'foto_2.jpg');
    assert.equal('IS' in imagens.subpastas, false);
    assert.equal('AP' in imagens.subpastas, false);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test lib/qaSyndi.test.js`
Expected: FALHA — `qaSyndi.listarFila is not a function`.

- [ ] **Step 3: Implementar**

Adicionar em `lib/qaSyndi.js`, antes de `module.exports`:

```js
const SUBPASTAS_TAG = ['RT', 'IS', 'AP'];
const REGEX_PASTA_OS = /^OS_(\d+)/;
const REGEX_PASTA_GTIN = /^(\d+)/;

// Le todas as OS/GTIN pendentes em AgConferencia. So entra na lista quem tem
// pasta valida (prefixo numerico reconhecivel) - o resto (lixo, pasta manual) e
// ignorado silenciosamente, mesmo principio do QA Hub do sphoto.
function listarFila(agConferenciaDir) {
    if (!fs.existsSync(agConferenciaDir)) return [];
    const pastasOs = fs.readdirSync(agConferenciaDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name)
        .filter(nome => REGEX_PASTA_OS.test(nome));

    return pastasOs.map(pastaOsNome => {
        const os = pastaOsNome.match(REGEX_PASTA_OS)[1];
        const pastaOsPath = path.join(agConferenciaDir, pastaOsNome);
        const gtins = fs.readdirSync(pastaOsPath, { withFileTypes: true })
            .filter(entrada => entrada.isDirectory())
            .map(entrada => entrada.name)
            .filter(nome => REGEX_PASTA_GTIN.test(nome))
            .map(pastaGtinNome => ({
                gtin: pastaGtinNome.match(REGEX_PASTA_GTIN)[1],
                pastaGtinNome
            }));
        return { os, pastaOsNome, gtins };
    });
}

function listarImagensDir(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(entrada => entrada.isFile() && /\.(jpg|jpeg)$/i.test(entrada.name))
        .map(entrada => {
            const bytes = fs.readFileSync(path.join(dirPath, entrada.name));
            return { nome: entrada.name, arquivo: bytes.toString('base64') };
        });
}

// Fotos do Syndi_qa sao sempre JPEG (ja passaram pelo tratamento do fotografo -
// ver prompt_sistema_qa.md item 1), entao nao precisa da complexidade de preview
// de RAW que o sphoto tem (lib/cr2Preview.js) - so le o arquivo direto.
function listarImagensGtin(pastaGtinPath) {
    const raiz = listarImagensDir(pastaGtinPath);
    const subpastas = {};
    SUBPASTAS_TAG.forEach(tag => {
        const imagens = listarImagensDir(path.join(pastaGtinPath, tag));
        if (imagens.length) subpastas[tag] = imagens;
    });
    return { raiz, subpastas };
}
```

Atualizar o `module.exports` para incluir `listarFila` e `listarImagensGtin`:

```js
module.exports = {
    BASE_PATH,
    AGCONFERENCIA,
    AGENVIO,
    RETRABALHO,
    carregarCaminhosLocais,
    localizarPastaDecoradaPorPrefixo,
    listarFila,
    listarImagensGtin
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS — 8 testes, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: listar fila de conferencia e imagens de um GTIN"
```

---

## Task 3: Aprovar GTIN (mover pra AgEnvio)

**Files:**
- Modify: `lib/qaSyndi.js`
- Modify: `lib/qaSyndi.test.js`

**Interfaces:**
- Produces: `moverPasta(origem, destino)` → `void` (interno, não exportado); `aprovarGtin(agConferenciaDir, agEnvioDir, pastaOsNome, pastaGtinNome)` → `{ destino: string }`, lança `Error` se a pasta de origem não existir.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('aprovarGtin move a pasta inteira do GTIN pra AgEnvio preservando subpastas', () => {
    const agConferencia = criarDirTemp();
    const agEnvio = criarDirTemp();
    const pastaOsNome = 'OS_49800---(1 GTINs)---2026-07-20';
    const pastaGtinNome = '7898133020049';
    const origem = path.join(agConferencia, pastaOsNome, pastaGtinNome);
    fs.mkdirSync(path.join(origem, 'RT'), { recursive: true });
    fs.writeFileSync(path.join(origem, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(origem, 'RT', 'foto_2.jpg'), 'b');

    const resultado = qaSyndi.aprovarGtin(agConferencia, agEnvio, pastaOsNome, pastaGtinNome);

    assert.equal(fs.existsSync(origem), false);
    const destino = path.join(agEnvio, pastaOsNome, pastaGtinNome);
    assert.equal(resultado.destino, destino);
    assert.equal(fs.existsSync(path.join(destino, 'foto_0.jpg')), true);
    assert.equal(fs.existsSync(path.join(destino, 'RT', 'foto_2.jpg')), true);
});

test('aprovarGtin lanca erro quando a pasta de origem nao existe', () => {
    const agConferencia = criarDirTemp();
    const agEnvio = criarDirTemp();
    assert.throws(
        () => qaSyndi.aprovarGtin(agConferencia, agEnvio, 'OS_1---(1 GTINs)---2026-01-01', '123'),
        /Pasta do GTIN nao encontrada/
    );
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test lib/qaSyndi.test.js`
Expected: FALHA — `qaSyndi.aprovarGtin is not a function`.

- [ ] **Step 3: Implementar**

Adicionar em `lib/qaSyndi.js`, antes de `module.exports`:

```js
// Move (nao copia) a pasta inteira. As duas pastas (AgConferencia e AgEnvio) vivem
// sob o mesmo SYNCIMGSEND_BASE - mesmo volume - entao rename e atomico e nao precisa
// de copia+delete manual.
function moverPasta(origem, destino) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.renameSync(origem, destino);
}

// GTIN e a unidade de decisao (ver Global Constraints do plano) - aprova a pasta
// inteira, nunca foto a foto. Preserva o nome exato das pastas (OS decorada + GTIN)
// pra o robo SyncIMGSend (PROCESSO_1/5) so espelhar a estrutura pro bucket sem
// precisar remapear nada.
function aprovarGtin(agConferenciaDir, agEnvioDir, pastaOsNome, pastaGtinNome) {
    const origem = path.join(agConferenciaDir, pastaOsNome, pastaGtinNome);
    if (!fs.existsSync(origem)) {
        throw new Error('Pasta do GTIN nao encontrada: ' + origem);
    }
    const destino = path.join(agEnvioDir, pastaOsNome, pastaGtinNome);
    moverPasta(origem, destino);
    return { destino };
}
```

Atualizar `module.exports` acrescentando `aprovarGtin`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS — 10 testes, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: aprovar GTIN move pasta inteira para AgEnvio"
```

---

## Task 4: Motivos de retrabalho e geração do TXT

**Files:**
- Create: `motivos-retrabalho.json`
- Modify: `lib/qaSyndi.js`
- Modify: `lib/qaSyndi.test.js`

**Interfaces:**
- Produces: `carregarMotivos(basePath)` → `string[]`; `gerarConteudoTxt(gtin, marcacoes, data)` → `string` (`marcacoes`: `{ [nomeFoto: string]: string[] }`, `data`: `Date`).

- [ ] **Step 1: Criar a lista inicial de motivos**

```json
[
    "desfoque",
    "exposição/iluminação",
    "enquadramento errado",
    "fundo sujo",
    "produto sujo/amassado",
    "sombra/reflexo indesejado",
    "cor/balanço de branco errado",
    "resolução baixa",
    "etiqueta ilegível"
]
```

Salvar em `motivos-retrabalho.json` na raiz do projeto.

- [ ] **Step 2: Escrever o teste que falha**

```js
test('carregarMotivos le motivos-retrabalho.json quando existe', () => {
    const conteudo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'motivos-retrabalho.json'), 'utf8'));
    const motivos = qaSyndi.carregarMotivos(path.join(__dirname, '..'));
    assert.deepEqual(motivos, conteudo);
    assert.equal(motivos.includes('desfoque'), true);
});

test('carregarMotivos cai numa lista default quando o arquivo nao existe', () => {
    const dirTemp = criarDirTemp();
    const motivos = qaSyndi.carregarMotivos(dirTemp);
    assert.equal(Array.isArray(motivos), true);
    assert.equal(motivos.length > 0, true);
});

test('gerarConteudoTxt formata GTIN, data e uma linha por foto marcada', () => {
    const conteudo = qaSyndi.gerarConteudoTxt(
        '7898133020049',
        { 'foto_2.jpg': ['desfoque', 'iluminação'], 'foto_5.jpg': ['fundo sujo'] },
        new Date(2026, 6, 21)
    );
    assert.equal(
        conteudo,
        'GTIN: 7898133020049\nData: 2026-07-21\nfoto_2.jpg: desfoque, iluminação\nfoto_5.jpg: fundo sujo\n'
    );
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `node --test lib/qaSyndi.test.js`
Expected: FALHA — `qaSyndi.carregarMotivos is not a function`.

- [ ] **Step 4: Implementar**

Adicionar em `lib/qaSyndi.js`, antes de `module.exports`:

```js
const MOTIVOS_DEFAULT = [
    'desfoque',
    'exposição/iluminação',
    'enquadramento errado',
    'fundo sujo',
    'produto sujo/amassado',
    'sombra/reflexo indesejado',
    'cor/balanço de branco errado',
    'resolução baixa',
    'etiqueta ilegível'
];

// Lista de motivos de retrabalho e configuravel (motivos-retrabalho.json, versionado -
// diferente de caminhos-locais.json, isso NAO e segredo nem varia por maquina, e
// conteudo de negocio) - se faltar ou estiver corrompido, cai na lista embutida.
function carregarMotivos(basePath) {
    const configPath = path.join(basePath, 'motivos-retrabalho.json');
    if (!fs.existsSync(configPath)) return MOTIVOS_DEFAULT.slice();
    try {
        const dados = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return Array.isArray(dados) && dados.length ? dados : MOTIVOS_DEFAULT.slice();
    } catch (err) {
        return MOTIVOS_DEFAULT.slice();
    }
}

function formatarDataISO(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// Um TXT por GTIN (nao por foto) - ver spec secao 6. `marcacoes` mapeia nome da foto
// (relativo a raiz do GTIN, ex: "foto_2.jpg" ou "RT/foto_2.jpg") pros motivos
// selecionados. `data` e injetada (nao usa new Date() aqui dentro) pra a funcao ficar
// pura e testavel.
function gerarConteudoTxt(gtin, marcacoes, data) {
    const linhas = [`GTIN: ${gtin}`, `Data: ${formatarDataISO(data)}`];
    Object.keys(marcacoes).forEach(nomeFoto => {
        linhas.push(`${nomeFoto}: ${marcacoes[nomeFoto].join(', ')}`);
    });
    return linhas.join('\n') + '\n';
}
```

Atualizar `module.exports` acrescentando `carregarMotivos` e `gerarConteudoTxt`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS — 13 testes, 0 falhas.

- [ ] **Step 6: Commit**

```bash
git add motivos-retrabalho.json lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: lista de motivos configuravel e geracao do TXT de retrabalho"
```

---

## Task 5: Retrabalho (mover pra Retrabalho + gravar TXT)

**Files:**
- Modify: `lib/qaSyndi.js`
- Modify: `lib/qaSyndi.test.js`

**Interfaces:**
- Consumes: `moverPasta` (Task 3, interno), `gerarConteudoTxt` (Task 4)
- Produces: `retrabalharGtin(agConferenciaDir, retrabalhoDir, pastaOsNome, pastaGtinNome, gtin, marcacoes)` → `{ destino: string }`, lança `Error` se a pasta de origem não existir.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('retrabalharGtin move a pasta inteira e grava retrabalho.txt no destino', () => {
    const agConferencia = criarDirTemp();
    const retrabalho = criarDirTemp();
    const pastaOsNome = 'OS_49800---(1 GTINs)---2026-07-20';
    const pastaGtinNome = '7898133020049';
    const origem = path.join(agConferencia, pastaOsNome, pastaGtinNome);
    fs.mkdirSync(origem, { recursive: true });
    fs.writeFileSync(path.join(origem, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(origem, 'foto_2.jpg'), 'b');

    const resultado = qaSyndi.retrabalharGtin(
        agConferencia, retrabalho, pastaOsNome, pastaGtinNome,
        '7898133020049', { 'foto_2.jpg': ['desfoque'] }
    );

    assert.equal(fs.existsSync(origem), false);
    const destino = path.join(retrabalho, pastaOsNome, pastaGtinNome);
    assert.equal(resultado.destino, destino);
    assert.equal(fs.existsSync(path.join(destino, 'foto_0.jpg')), true);
    assert.equal(fs.existsSync(path.join(destino, 'foto_2.jpg')), true);
    const txt = fs.readFileSync(path.join(destino, 'retrabalho.txt'), 'utf8');
    assert.match(txt, /^GTIN: 7898133020049\nData: \d{4}-\d{2}-\d{2}\nfoto_2\.jpg: desfoque\n$/);
});

test('retrabalharGtin lanca erro quando a pasta de origem nao existe', () => {
    const agConferencia = criarDirTemp();
    const retrabalho = criarDirTemp();
    assert.throws(
        () => qaSyndi.retrabalharGtin(agConferencia, retrabalho, 'OS_1---(1 GTINs)---2026-01-01', '123', '123', {}),
        /Pasta do GTIN nao encontrada/
    );
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test lib/qaSyndi.test.js`
Expected: FALHA — `qaSyndi.retrabalharGtin is not a function`.

- [ ] **Step 3: Implementar**

Adicionar em `lib/qaSyndi.js`, antes de `module.exports`:

```js
// Mesma unidade de decisao que aprovarGtin: move o GTIN inteiro (nao so as fotos
// marcadas) - o fotografo recebe a pasta completa de volta, com contexto, e reenvia
// o GTIN inteiro depois de corrigir. Ver spec secao 7 ("GTIN inteiro retido").
function retrabalharGtin(agConferenciaDir, retrabalhoDir, pastaOsNome, pastaGtinNome, gtin, marcacoes) {
    const origem = path.join(agConferenciaDir, pastaOsNome, pastaGtinNome);
    if (!fs.existsSync(origem)) {
        throw new Error('Pasta do GTIN nao encontrada: ' + origem);
    }
    const destino = path.join(retrabalhoDir, pastaOsNome, pastaGtinNome);
    moverPasta(origem, destino);
    const conteudoTxt = gerarConteudoTxt(gtin, marcacoes, new Date());
    fs.writeFileSync(path.join(destino, 'retrabalho.txt'), conteudoTxt, 'utf8');
    return { destino };
}
```

Atualizar `module.exports` acrescentando `retrabalharGtin`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test lib/qaSyndi.test.js`
Expected: PASS — 15 testes, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: retrabalho move GTIN inteiro e grava TXT com motivos"
```

---

## Task 6: Servidor HTTP — scaffold, handler estático e assets

**Files:**
- Create: `server.js`
- Create: `.gitignore`
- Create: `package.json`
- Copy (from `c:\sphoto`): `js/vue.global.js`, `js/bootstrap.bundle.min.js`, `css/bootstrap.min.css`, `css/bootstrap-icons.css`, `css/fonts/` (diretório inteiro), `css/qa.css`

**Interfaces:**
- Consumes: `qaSyndi` module (Task 1-5), usado só via `require` nesta task (rotas de API entram na Task 7)
- Produces: servidor HTTP ouvindo na porta 3000, handler estático servindo qualquer arquivo da raiz do projeto (exceto os bloqueados), `enviarJson(res, status, dados)`, `isNomeSeguro(valor)`, `lerCorpo(req)` — helpers reaproveitados pelas próximas tasks.

- [ ] **Step 1: Copiar os assets estáticos do sphoto**

```bash
mkdir -p js css/fonts
cp /c/sphoto/js/vue.global.js js/vue.global.js
cp /c/sphoto/js/bootstrap.bundle.min.js js/bootstrap.bundle.min.js
cp /c/sphoto/css/bootstrap.min.css css/bootstrap.min.css
cp /c/sphoto/css/bootstrap-icons.css css/bootstrap-icons.css
cp -r /c/sphoto/css/fonts/. css/fonts/
cp /c/sphoto/css/qa.css css/qa.css
```

- [ ] **Step 2: Criar `.gitignore`**

```
node_modules/
caminhos-locais.json
```

- [ ] **Step 3: Criar `package.json`**

```json
{
  "name": "syndi-qa",
  "version": "0.1.0",
  "private": true,
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test lib/"
  }
}
```

- [ ] **Step 4: Implementar `server.js`**

```js
const http = require('http');
const fs = require('fs');
const path = require('path');
const qaSyndi = require('./lib/qaSyndi');

// So loga antes de encerrar - depois de um erro nao tratado o processo fica em
// estado indefinido, entao nao deve continuar rodando "zumbi". Mesmo padrao do
// server.js do sphoto.
process.on('uncaughtException', (err) => {
    console.error('Erro nao tratado, encerrando:', err);
    process.exit(1);
});
process.on('unhandledRejection', (err) => {
    console.error('Promise rejeitada sem catch, encerrando:', err);
    process.exit(1);
});

const PORT = 3000;
const BASE_PATH = __dirname;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

// Arquivos que NUNCA podem sair pelo HTTP - mesmo motivo do sphoto (handler
// estatico entrega qualquer arquivo da pasta do projeto).
const ARQUIVOS_BLOQUEADOS = ['caminhos-locais.json', 'credencial.txt', 'credenciais.txt', 'valores.txt', '.env'];

function ehArquivoBloqueado(caminho) {
    const nome = path.basename(caminho).toLowerCase();
    return ARQUIVOS_BLOQUEADOS.includes(nome) || /\.(key|pem|pfx|p12)$/i.test(nome);
}

function isNomeSeguro(valor) {
    return typeof valor === 'string' && valor.length > 0 &&
        !valor.includes('..') && !valor.includes('/') && !valor.includes('\\');
}

function lerCorpo(req) {
    return new Promise((resolve, reject) => {
        let corpo = '';
        req.on('data', chunk => { corpo += chunk; });
        req.on('end', () => resolve(corpo));
        req.on('error', reject);
    });
}

function enviarJson(res, status, dados) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dados));
}

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // ROTAS_API

    // Handler estatico - serve qa.html, css, js e qualquer outro arquivo da raiz
    // do projeto, exceto os bloqueados.
    const urlSemQuery = req.url.split('?')[0];
    let filePath = path.join(BASE_PATH, urlSemQuery === '/' ? 'qa.html' : urlSemQuery);

    if (ehArquivoBloqueado(filePath)) {
        console.error('Bloqueado acesso HTTP a arquivo sensivel:', urlSemQuery);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Acesso negado');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Arquivo nao encontrado');
                return;
            }
            res.writeHead(500);
            res.end('Erro no servidor: ' + err.code);
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  Syndi_qa rodando em:`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`========================================\n`);
});
```

- [ ] **Step 5: Verificar manualmente (handler estático)**

Iniciar o servidor em background:

Run: `node server.js &`

Testar 404 (qa.html ainda não existe até a Task 9):

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`
Expected: `404`

Testar bloqueio de arquivo sensível:

Run: `echo '{}' > caminhos-locais.json && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/caminhos-locais.json && rm caminhos-locais.json`
Expected: `403`

Parar o servidor:

Run: `kill %1`

- [ ] **Step 6: Commit**

```bash
git add server.js .gitignore package.json js/vue.global.js js/bootstrap.bundle.min.js css/bootstrap.min.css css/bootstrap-icons.css css/fonts css/qa.css
git commit -m "feat: scaffold do servidor HTTP e assets estaticos (Vue/Bootstrap offline)"
```

---

## Task 7: Rotas de API (fila, GTIN, aprovar, retrabalho, motivos)

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `qaSyndi.AGCONFERENCIA`, `qaSyndi.AGENVIO`, `qaSyndi.RETRABALHO`, `qaSyndi.localizarPastaDecoradaPorPrefixo`, `qaSyndi.listarFila`, `qaSyndi.listarImagensGtin`, `qaSyndi.aprovarGtin`, `qaSyndi.retrabalharGtin`, `qaSyndi.carregarMotivos` (Tasks 1-5); `isNomeSeguro`, `lerCorpo`, `enviarJson`, `BASE_PATH` (Task 6)
- Produces: `GET /api/fila`, `GET /api/gtin?os=&gtin=`, `POST /api/aprovar`, `POST /api/retrabalho`, `GET /api/motivos`

- [ ] **Step 1: Inserir as rotas em `server.js`**

Usar Edit para substituir a linha `    // ROTAS_API` (dentro do `createServer`) pelo bloco abaixo (a linha do handler estático continua logo depois, sem mudança):

```js
    if (req.method === 'GET' && req.url === '/api/fila') {
        try {
            const fila = qaSyndi.listarFila(qaSyndi.AGCONFERENCIA);
            enviarJson(res, 200, { ok: true, fila });
        } catch (err) {
            enviarJson(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/gtin')) {
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
        const pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
        const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
        if (!pastaGtinNome) {
            enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
            return;
        }
        const imagens = qaSyndi.listarImagensGtin(path.join(pastaOsPath, pastaGtinNome));
        enviarJson(res, 200, { ok: true, os, gtin, pastaOsNome, pastaGtinNome, imagens });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/aprovar') {
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
            try {
                const resultado = qaSyndi.aprovarGtin(qaSyndi.AGCONFERENCIA, qaSyndi.AGENVIO, pastaOsNome, pastaGtinNome);
                enviarJson(res, 200, { ok: true, destino: resultado.destino });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/retrabalho') {
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
            const marcacoes = dados.marcacoes;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin) || typeof marcacoes !== 'object' || !marcacoes || Object.keys(marcacoes).length === 0) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin/marcacoes invalidos' });
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
            try {
                const resultado = qaSyndi.retrabalharGtin(qaSyndi.AGCONFERENCIA, qaSyndi.RETRABALHO, pastaOsNome, pastaGtinNome, gtin, marcacoes);
                enviarJson(res, 200, { ok: true, destino: resultado.destino });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'GET' && req.url === '/api/motivos') {
        enviarJson(res, 200, { ok: true, motivos: qaSyndi.carregarMotivos(BASE_PATH) });
        return;
    }
```

- [ ] **Step 2: Verificar manualmente**

```bash
mkdir -p /tmp/syndiqa-manual/AgConferencia/"OS_49800---(1 GTINs)---2026-07-20"/7898133020049
echo teste > /tmp/syndiqa-manual/AgConferencia/"OS_49800---(1 GTINs)---2026-07-20"/7898133020049/foto_0.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-manual"}' > caminhos-locais.json
node server.js &
sleep 1
curl -s http://localhost:3000/api/fila
curl -s "http://localhost:3000/api/gtin?os=49800&gtin=7898133020049"
curl -s http://localhost:3000/api/motivos
curl -s -X POST http://localhost:3000/api/aprovar -H "Content-Type: application/json" -d '{"os":"49800","gtin":"7898133020049"}'
curl -s http://localhost:3000/api/fila
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-manual
```

Expected: `/api/fila` inicialmente devolve o GTIN `7898133020049`; `/api/gtin` devolve `imagens.raiz` com `foto_0.jpg`; `/api/motivos` devolve a lista de 9 motivos; `/api/aprovar` devolve `{"ok":true,"destino":".../AgEnvio/OS_49800---(1 GTINs)---2026-07-20/7898133020049"}`; `/api/fila` depois do aprovar devolve `fila: []` (o GTIN saiu de AgConferencia).

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: rotas de API fila/gtin/aprovar/retrabalho/motivos"
```

---

## Task 8: Atualização via git (verificar/aplicar)

**Files:**
- Modify: `server.js`

**Interfaces:**
- Produces: `GET /api/atualizacao/verificar`, `POST /api/atualizacao/aplicar` (mesmo contrato do sphoto)

- [ ] **Step 1: Adicionar `execSync` ao import do `child_process`**

Editar a linha de imports do topo de `server.js`:

De:
```js
const qaSyndi = require('./lib/qaSyndi');
```

Para:
```js
const { execSync } = require('child_process');
const qaSyndi = require('./lib/qaSyndi');
```

- [ ] **Step 2: Inserir as rotas de atualização**

Usar Edit para inserir o bloco abaixo logo depois do fechamento do handler `/api/motivos` (antes do comentário `// Handler estatico`):

```js
    // So compara HEAD local com origin/main (git fetch, sem baixar/aplicar nada) -
    // alimenta a tela de configuracao. Pasta sem .git ou sem rede cai no catch e
    // devolve ok:false. Mesmo endpoint que o sphoto ja usa (server.js dele).
    if (req.method === 'GET' && req.url === '/api/atualizacao/verificar') {
        try {
            execSync('git fetch origin main --tags', { cwd: BASE_PATH, stdio: 'pipe' });
            const commitsAtras = parseInt(execSync('git rev-list HEAD..origin/main --count', { cwd: BASE_PATH }).toString().trim(), 10) || 0;
            const versaoAtual = execSync('git describe --tags --always', { cwd: BASE_PATH }).toString().trim();
            const versaoDisponivel = execSync('git describe --tags --always origin/main', { cwd: BASE_PATH }).toString().trim();
            enviarJson(res, 200, { ok: true, versaoAtual, versaoDisponivel, temAtualizacao: commitsAtras > 0 });
        } catch (err) {
            enviarJson(res, 200, { ok: false, error: 'Nao foi possivel consultar atualizacoes (sem rede, sem remoto configurado, ou esta pasta nao e um repositorio git)' });
        }
        return;
    }

    // Traz o codigo novo com "git pull --ff-only" - nunca cria merge/resolve conflito
    // sozinho, entao se a pasta tiver alteracao local nao commitada ou o historico
    // tiver divergido, aborta e devolve erro em vez de arriscar quebrar a pasta.
    if (req.method === 'POST' && req.url === '/api/atualizacao/aplicar') {
        try {
            const statusSujo = execSync('git status --porcelain', { cwd: BASE_PATH }).toString().trim();
            if (statusSujo) {
                enviarJson(res, 200, { ok: false, error: 'Ha alteracoes locais nao commitadas nesta pasta - resolva manualmente (git status) antes de atualizar' });
                return;
            }
            const antes = execSync('git rev-parse HEAD', { cwd: BASE_PATH }).toString().trim();
            execSync('git pull --ff-only origin main', { cwd: BASE_PATH, stdio: 'pipe' });
            const depois = execSync('git rev-parse HEAD', { cwd: BASE_PATH }).toString().trim();
            const arquivosMudados = antes === depois ? [] : execSync('git diff --name-only ' + antes + ' ' + depois, { cwd: BASE_PATH })
                .toString().trim().split('\n').filter(Boolean);
            const precisaReiniciar = arquivosMudados.some((f) => f === 'server.js' || f.startsWith('lib/'));
            const versaoAtual = execSync('git describe --tags --always', { cwd: BASE_PATH }).toString().trim();
            enviarJson(res, 200, { ok: true, jaEstavaAtualizado: antes === depois, versaoAtual, arquivosMudados, precisaReiniciar });
        } catch (err) {
            enviarJson(res, 200, { ok: false, error: 'git pull falhou: ' + (err.message || String(err)).slice(0, 500) });
        }
        return;
    }
```

- [ ] **Step 3: Verificar manualmente**

```bash
node server.js &
sleep 1
curl -s http://localhost:3000/api/atualizacao/verificar
kill %1
```

Expected: como o repositório ainda não tem `origin` remoto configurado, devolve `{"ok":false,"error":"Nao foi possivel consultar atualizacoes ..."}` sem derrubar o servidor. Quando o repositório ganhar um remoto de verdade, o mesmo comando passa a devolver `versaoAtual`/`versaoDisponivel`/`temAtualizacao`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: atualizacao via git (verificar/aplicar), mesmo padrao do sphoto"
```

---

## Task 9: Front-end (qa.html + js/qa.js)

**Files:**
- Create: `qa.html`
- Create: `js/qa.js`

**Interfaces:**
- Consumes: `GET /api/fila`, `GET /api/gtin`, `GET /api/motivos`, `POST /api/aprovar`, `POST /api/retrabalho` (Task 7)

- [ ] **Step 1: Criar `qa.html`**

```html
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Syndi_qa</title>

    <link href="css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/bootstrap-icons.css">
    <link rel="stylesheet" href="css/qa.css">
</head>
<body>
    <div id="qaApp">
        <header class="header">
            <div class="header-inner">
                <div class="header-left">
                    <span class="header-title">Syndi_qa</span>
                </div>
                <div class="header-right">
                    <button type="button" class="btn btn-sm btn-outline-light" @click="carregarFila" :disabled="carregandoFila">
                        <i class="bi bi-arrow-clockwise"></i> Atualizar fila
                    </button>
                </div>
            </div>
        </header>

        <div class="qa-layout">
            <aside class="qa-arvore">
                <div v-if="carregandoFila" class="qa-vazio">Carregando...</div>
                <div v-else-if="erroFila" class="text-danger p-2">{{ erroFila }}</div>
                <div v-else-if="fila.length === 0" class="qa-vazio">Nenhum GTIN aguardando conferência.</div>
                <div v-else>
                    <div class="qa-os-grupo" v-for="grupo in fila" :key="grupo.os">
                        <div class="qa-os-titulo"><span>OS {{ grupo.os }} ({{ grupo.gtins.length }})</span></div>
                        <div
                            class="qa-gtin-item"
                            v-for="item in grupo.gtins"
                            :key="item.gtin"
                            :class="{ ativo: selecionado && selecionado.os === grupo.os && selecionado.gtin === item.gtin }"
                            @click="selecionarGtin(grupo.os, item.gtin)"
                        >
                            <span>{{ item.gtin }}</span>
                        </div>
                    </div>
                </div>
            </aside>

            <main class="qa-detalhe">
                <div v-if="!selecionado" class="qa-vazio">Selecione um GTIN na lista ao lado.</div>

                <div v-else>
                    <h5 class="mb-3">GTIN {{ selecionado.gtin }} <small class="text-muted">- OS {{ selecionado.os }}</small></h5>

                    <div v-if="carregandoDetalhe" class="qa-vazio">Carregando pasta...</div>
                    <div v-else-if="erroDetalhe" class="text-danger p-3">{{ erroDetalhe }}</div>

                    <template v-else-if="detalhe">
                        <div class="qa-subpasta-titulo">Raiz ({{ detalhe.imagens.raiz.length }})</div>
                        <div class="qa-grid">
                            <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.raiz" :key="img.nome">
                                <div class="qa-miniatura">
                                    <img :src="'data:image/jpeg;base64,' + img.arquivo" :alt="img.nome">
                                </div>
                                <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                <label class="qa-acoes-mini">
                                    <input type="checkbox" :checked="!!marcadas[img.nome]" @change="togglarProblema(img.nome)"> marcar problema
                                </label>
                                <div v-if="marcadas[img.nome]" class="qa-motivos">
                                    <label v-for="motivo in motivos" :key="motivo" class="qa-motivo-item">
                                        <input type="checkbox" :checked="marcadas[img.nome].includes(motivo)" @change="togglarMotivo(img.nome, motivo)"> {{ motivo }}
                                    </label>
                                </div>
                            </div>
                        </div>

                        <template v-for="tag in ['RT', 'IS', 'AP']" :key="tag">
                            <template v-if="detalhe.imagens.subpastas[tag] && detalhe.imagens.subpastas[tag].length">
                                <div class="qa-subpasta-titulo">{{ tag }} ({{ detalhe.imagens.subpastas[tag].length }})</div>
                                <div class="qa-grid">
                                    <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.subpastas[tag]" :key="img.nome">
                                        <div class="qa-miniatura">
                                            <img :src="'data:image/jpeg;base64,' + img.arquivo" :alt="img.nome">
                                        </div>
                                        <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                        <label class="qa-acoes-mini">
                                            <input type="checkbox" :checked="!!marcadas[tag + '/' + img.nome]" @change="togglarProblema(tag + '/' + img.nome)"> marcar problema
                                        </label>
                                        <div v-if="marcadas[tag + '/' + img.nome]" class="qa-motivos">
                                            <label v-for="motivo in motivos" :key="motivo" class="qa-motivo-item">
                                                <input type="checkbox" :checked="marcadas[tag + '/' + img.nome].includes(motivo)" @change="togglarMotivo(tag + '/' + img.nome, motivo)"> {{ motivo }}
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </template>

                        <div class="qa-enviar-conferencia mt-3">
                            <button type="button" class="btn btn-primary btn-sm" :disabled="temMarcacao() || aprovando" @click="aprovarGtin">
                                <i class="bi bi-check2-circle"></i> Aprovar GTIN
                            </button>
                            <button type="button" class="btn btn-warning btn-sm" :disabled="!temMarcacao() || enviandoRetrabalho" @click="confirmarRetrabalho">
                                <i class="bi bi-arrow-counterclockwise"></i> Confirmar Retrabalho
                            </button>
                            <span v-if="mensagem" class="ms-3 text-success">{{ mensagem }}</span>
                            <span v-if="erro" class="ms-3 text-danger">{{ erro }}</span>
                        </div>
                    </template>
                </div>
            </main>
        </div>
    </div>

    <script src="js/bootstrap.bundle.min.js"></script>
    <script src="js/vue.global.js"></script>
    <script src="js/qa.js"></script>
</body>
</html>
```

- [ ] **Step 2: Criar `js/qa.js`**

```js
const { createApp, ref, reactive } = Vue;
const API = 'http://localhost:3000';

createApp({
    setup() {
        const fila = ref([]);
        const carregandoFila = ref(false);
        const erroFila = ref('');

        const selecionado = ref(null);
        const detalhe = ref(null);
        const carregandoDetalhe = ref(false);
        const erroDetalhe = ref('');

        const motivos = ref([]);
        const marcadas = reactive({});

        const aprovando = ref(false);
        const enviandoRetrabalho = ref(false);
        const mensagem = ref('');
        const erro = ref('');

        async function carregarFila() {
            carregandoFila.value = true;
            erroFila.value = '';
            try {
                const resp = await fetch(API + '/api/fila');
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                fila.value = dados.fila;
            } catch (err) {
                erroFila.value = 'Erro ao carregar fila: ' + err.message + ' (server.js rodando?)';
            } finally {
                carregandoFila.value = false;
            }
        }

        async function carregarMotivosDisponiveis() {
            try {
                const resp = await fetch(API + '/api/motivos');
                const dados = await resp.json();
                if (dados.ok) motivos.value = dados.motivos;
            } catch (err) {
                console.error('Erro ao carregar motivos:', err);
            }
        }

        async function selecionarGtin(os, gtin) {
            selecionado.value = { os, gtin };
            detalhe.value = null;
            erroDetalhe.value = '';
            Object.keys(marcadas).forEach(chave => delete marcadas[chave]);
            mensagem.value = '';
            erro.value = '';
            carregandoDetalhe.value = true;
            try {
                const resp = await fetch(API + '/api/gtin?os=' + encodeURIComponent(os) + '&gtin=' + encodeURIComponent(gtin));
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                detalhe.value = dados;
            } catch (err) {
                erroDetalhe.value = 'Erro ao carregar GTIN: ' + err.message;
            } finally {
                carregandoDetalhe.value = false;
            }
        }

        function togglarProblema(nomeFoto) {
            if (marcadas[nomeFoto]) {
                delete marcadas[nomeFoto];
            } else {
                marcadas[nomeFoto] = [];
            }
        }

        function togglarMotivo(nomeFoto, motivo) {
            const lista = marcadas[nomeFoto];
            if (!lista) return;
            const idx = lista.indexOf(motivo);
            if (idx === -1) lista.push(motivo); else lista.splice(idx, 1);
        }

        function temMarcacao() {
            return Object.keys(marcadas).length > 0;
        }

        async function aprovarGtin() {
            if (!selecionado.value || temMarcacao()) return;
            aprovando.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/aprovar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                mensagem.value = 'GTIN aprovado e enviado para edição.';
                detalhe.value = null;
                selecionado.value = null;
                await carregarFila();
            } catch (err) {
                erro.value = 'Erro ao aprovar: ' + err.message;
            } finally {
                aprovando.value = false;
            }
        }

        async function confirmarRetrabalho() {
            if (!selecionado.value || !temMarcacao()) return;
            enviandoRetrabalho.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/retrabalho', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, marcacoes: { ...marcadas } })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                mensagem.value = 'Retrabalho registrado e GTIN movido.';
                detalhe.value = null;
                selecionado.value = null;
                await carregarFila();
            } catch (err) {
                erro.value = 'Erro ao confirmar retrabalho: ' + err.message;
            } finally {
                enviandoRetrabalho.value = false;
            }
        }

        carregarFila();
        carregarMotivosDisponiveis();

        return {
            fila, carregandoFila, erroFila,
            selecionado, detalhe, carregandoDetalhe, erroDetalhe,
            motivos, marcadas,
            aprovando, enviandoRetrabalho, mensagem, erro,
            carregarFila, selecionarGtin, togglarProblema, togglarMotivo, temMarcacao,
            aprovarGtin, confirmarRetrabalho
        };
    }
}).mount('#qaApp');
```

- [ ] **Step 3: Verificar manualmente com fixture completa**

```bash
mkdir -p /tmp/syndiqa-e2e/AgConferencia/"OS_1---(1 GTINs)---2026-07-21"/1234567890123/RT
echo teste > /tmp/syndiqa-e2e/AgConferencia/"OS_1---(1 GTINs)---2026-07-21"/1234567890123/foto_0.jpg
echo teste > /tmp/syndiqa-e2e/AgConferencia/"OS_1---(1 GTINs)---2026-07-21"/1234567890123/RT/foto_2.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-e2e"}' > caminhos-locais.json
node server.js &
sleep 1
```

Abrir `http://localhost:3000/` no navegador. Confirmar visualmente:
1. GTIN `1234567890123` aparece na lista à esquerda, sob OS 1.
2. Ao selecionar, aparecem as miniaturas `foto_0.jpg` (Raiz) e `foto_2.jpg` (RT).
3. Marcar "problema" em `foto_2.jpg`, escolher motivo "desfoque" — botão "Aprovar GTIN" fica desabilitado, "Confirmar Retrabalho" habilita.
4. Clicar "Confirmar Retrabalho" — mensagem de sucesso aparece, GTIN some da lista.
5. Verificar no disco: `ls /tmp/syndiqa-e2e/Retrabalho/OS_1---(1 GTINs)---2026-07-21/1234567890123/` mostra `foto_0.jpg`, `RT/foto_2.jpg` e `retrabalho.txt` com o conteúdo `GTIN: 1234567890123 / Data: ... / RT/foto_2.jpg: desfoque`.

```bash
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-e2e
```

- [ ] **Step 4: Commit**

```bash
git add qa.html js/qa.js
git commit -m "feat: front-end do Syndi_qa - fila, grade de fotos, aprovar e retrabalho"
```

---

## Task 10: Verificação end-to-end final

**Files:** nenhum arquivo novo — checklist de verificação manual cobrindo os dois caminhos completos.

- [ ] **Step 1: Rodar toda a suíte automatizada**

Run: `node --test lib/`
Expected: PASS — todos os testes das Tasks 1-5 (15 testes), 0 falhas.

- [ ] **Step 2: Fluxo de aprovação ponta a ponta**

Repetir a fixture do Task 9 Step 3, mas **sem** marcar nenhuma foto: clicar direto em "Aprovar GTIN". Verificar que a pasta some de `AgConferencia` e aparece inteira (com subpasta `RT`) em `AgEnvio`, e que `GET /api/fila` volta vazio.

- [ ] **Step 3: Fluxo de retrabalho com múltiplas fotos marcadas**

Fixture com 3 fotos na raiz, marcar 2 delas com motivos diferentes, confirmar retrabalho. Verificar que `retrabalho.txt` tem uma linha por foto marcada (não pela terceira, que não foi marcada) e que a pasta inteira (as 3 fotos) foi movida — nenhuma foto "boa" fica pra trás em `AgConferencia` (regra do GTIN retido por inteiro).

- [ ] **Step 4: Commit final (se algo foi ajustado nos passos acima)**

```bash
git add -A
git commit -m "chore: ajustes finais da verificacao end-to-end da Peca 1"
```

(Pular este commit se nada precisou de ajuste.)
