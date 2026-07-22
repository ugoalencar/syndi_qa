# Syndi_qa — Parte 1: Correções no Retrabalho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a Peça 1 do Syndi_qa já em produção: performance ao abrir um GTIN (imagens por URL em vez de base64), UX do retrabalho (painel único de motivos abaixo do palco), TXT de retrabalho (um por OS agregando todos os GTINs, não mais um por GTIN), e marcação de "Retrabalho Fotografia" no Redmine.

**Architecture:** Continua Node puro + Vue 3 sem build. `lib/qaSyndi.js` ganha uma rota de leitura de imagem individual (sem base64) e troca a geração do TXT por GTIN por um append num TXT único por OS. Novo `lib/redmine.js` isola toda chamada REST ao Redmine, seguindo o mesmo padrão já usado em `c:\sphoto\lib\qaHub.js` (`redmineFetch`/`buscarIssueAbertaPorGtin`/PUT de custom_fields).

**Tech Stack:** Node.js core (`http`/`fs`/`path`/`fetch` nativo do Node 22, sem dependência nova), Vue 3 Composition API (já em uso), `node:test` para `lib/`.

## Global Constraints

- Sem CDN, sem `npm install`, sem dependência nova.
- GTIN continua a unidade de decisão: aprovar e retrabalho sempre movem a pasta inteira do GTIN, nunca foto a foto.
- Subpastas RT/IS/AP continuam preservadas em qualquer move.
- Caminhos por máquina (`caminhos-locais.json`) e agora também a credencial do Redmine (`redmine-config.json`) ficam fora do código, gitignored — mesmo padrão do sphoto.
- `redmine-config.json` precisa entrar em `ARQUIVOS_BLOQUEADOS` no `server.js` (credencial nunca sai pelo HTTP) — mesmo cuidado que o sphoto já tem.
- Testes de lógica pura em `lib/*.js` usam `node:test` nativo com pastas temporárias. Chamadas de rede reais ao Redmine (`lib/redmine.js`, funções que usam `fetch`) não entram em teste automatizado — mesmo padrão do sphoto, que também não testa isso automatizado; verificação manual na hora da implementação. Rotas HTTP em `server.js` são verificadas manualmente via `curl`.
- **Cuidado nas verificações manuais:** esta máquina roda o sphoto de produção real na porta 3000. Nunca usar a porta 3000 pros testes manuais do Syndi_qa (usar 3001, já é o default, ou outra porta livre pra rodar em paralelo), e nunca matar/reiniciar processo nela.
- Formato da linha do TXT por OS: `<gtin> - <arquivo>: <motivo1>, <motivo2>` (confirmado com o usuário).
- Nome do arquivo TXT: `Retrabalho_OS_<numero-da-os>.txt` (só o número, não o nome decorado da pasta), na raiz da pasta da OS dentro de `Retrabalho\`.
- `cf_15` (Situação das Imagens) = `24` ("Retrabalho Fotografia") é o valor a gravar no Redmine ao confirmar retrabalho (confirmado em `c:\sphoto\redmine-campos.json`).

---

## Task 1: Imagens por nome (sem base64) + resolução segura de caminho

**Files:**
- Modify: `lib/qaSyndi.js`
- Modify: `lib/qaSyndi.test.js`

**Interfaces:**
- Consumes: nada novo (usa `fs`/`path` já importados)
- Produces: `listarImagensDir(dirPath)` e `listarImagensGtin(pastaGtinPath)` agora devolvem `{ nome }` (sem `arquivo`/base64); `resolverImagemSegura(pastaGtinPath, nomeRelativo)` → caminho absoluto (`string`) ou `null` se escaparia da pasta do GTIN ou não for `.jpg`/`.jpeg`.

- [ ] **Step 1: Escrever os testes que falham**

Em `lib/qaSyndi.test.js`, substituir o teste existente `'listarImagensGtin le raiz e subpastas RT/IS/AP, ignora tag sem foto'` (linhas 69-83) por:

```js
test('listarImagensGtin le raiz e subpastas RT/IS/AP, ignora tag sem foto', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), Buffer.from([1, 2, 3]));
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_2.jpg'), Buffer.from([4, 5, 6]));

    const imagens = qaSyndi.listarImagensGtin(dirTemp);
    assert.deepEqual(imagens.raiz, [{ nome: 'foto_0.jpg' }]);
    assert.deepEqual(imagens.subpastas.RT, [{ nome: 'foto_2.jpg' }]);
    assert.equal('IS' in imagens.subpastas, false);
    assert.equal('AP' in imagens.subpastas, false);
});
```

E adicionar ao final do arquivo (depois do último teste, `'retrabalharGtin lanca erro quando a pasta de origem nao existe'`):

```js
test('resolverImagemSegura resolve foto na raiz e em subpasta', () => {
    const dirTemp = criarDirTemp();
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, 'foto_0.jpg'), path.join(dirTemp, 'foto_0.jpg'));
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, 'RT/foto_2.jpg'), path.join(dirTemp, 'RT', 'foto_2.jpg'));
});

test('resolverImagemSegura bloqueia path traversal', () => {
    const dirTemp = criarDirTemp();
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, '../../windows/win.ini'), null);
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, '..\\..\\windows\\win.ini'), null);
});

test('resolverImagemSegura bloqueia extensao que nao seja jpg/jpeg', () => {
    const dirTemp = criarDirTemp();
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, 'arquivo.txt'), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FALHA — o teste de `listarImagensGtin` quebra (`imagens.raiz` ainda tem campo `arquivo`) e `qaSyndi.resolverImagemSegura is not a function`.

- [ ] **Step 3: Implementar**

Em `lib/qaSyndi.js`, substituir a função `listarImagensDir` (linhas 77-85) inteira por:

```js
function listarImagensDir(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(entrada => entrada.isFile() && /\.(jpg|jpeg)$/i.test(entrada.name))
        .map(entrada => ({ nome: entrada.name }));
}
```

Adicionar, logo depois da função `listarImagensGtin` (depois da linha `}` que fecha `listarImagensGtin`, antes do comentário `// Move (nao copia) a pasta inteira...`):

```js
// Resolve o caminho absoluto de uma foto dentro da pasta do GTIN, a partir do "nome"
// relativo que o front-end manda (ex.: "foto_0.jpg" ou "RT/foto_2.jpg"). Devolve null
// se o resultado escaparia de pastaGtinPath (path traversal, ex.: "../../windows/win.ini")
// ou se nao for um .jpg/.jpeg - mesma logica de contencao ja usada no handler estatico
// do server.js, so que aqui e testavel isoladamente.
function resolverImagemSegura(pastaGtinPath, nomeRelativo) {
    if (typeof nomeRelativo !== 'string' || !nomeRelativo) return null;
    const raiz = path.resolve(pastaGtinPath);
    const caminho = path.resolve(raiz, nomeRelativo);
    if (caminho !== raiz && !caminho.startsWith(raiz + path.sep)) return null;
    if (!/\.(jpg|jpeg)$/i.test(caminho)) return null;
    return caminho;
}
```

No `module.exports` no final do arquivo, adicionar `resolverImagemSegura` à lista.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS — 18 testes, 0 falhas (15 anteriores + 3 novos de `resolverImagemSegura`, o teste de `listarImagensGtin` modificado conta no total anterior).

- [ ] **Step 5: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js
git commit -m "feat: imagens por nome sem base64 e resolucao segura de caminho"
```

---

## Task 2: Rota `GET /api/imagem`

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `qaSyndi.resolverImagemSegura`, `qaSyndi.localizarPastaDecoradaPorPrefixo`, `qaSyndi.AGCONFERENCIA` (Task 1 e Peça 1), `isNomeSeguro`, `enviarJson` (já existentes em `server.js`)
- Produces: `GET /api/imagem?os=&gtin=&nome=` → bytes da imagem (`Content-Type: image/jpeg`) ou 404

- [ ] **Step 1: Inserir a rota em `server.js`**

Usar Edit para inserir o bloco abaixo logo depois do fechamento do handler `/api/gtin` (a linha `    }` que fecha esse bloco) e antes do comentário/bloco `if (req.method === 'POST' && req.url === '/api/aprovar') {`:

```js
    if (req.method === 'GET' && req.url.startsWith('/api/imagem')) {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const os = query.get('os') || '';
        const gtin = query.get('gtin') || '';
        const nome = query.get('nome') || '';
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

- [ ] **Step 2: Verificar manualmente**

```bash
mkdir -p /tmp/syndiqa-img/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/RT
printf '\xff\xd8\xff\xe0teste' > /tmp/syndiqa-img/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/foto_0.jpg
printf '\xff\xd8\xff\xe0teste-rt' > /tmp/syndiqa-img/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/RT/foto_2.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-img"}' > caminhos-locais.json
node server.js &
sleep 1
curl -s -o /dev/null -w "raiz: %{http_code}\n" "http://localhost:3001/api/imagem?os=1&gtin=1234567890123&nome=foto_0.jpg"
curl -s -o /dev/null -w "subpasta: %{http_code}\n" "http://localhost:3001/api/imagem?os=1&gtin=1234567890123&nome=RT/foto_2.jpg"
curl -s --path-as-is -o /dev/null -w "traversal: %{http_code}\n" "http://localhost:3001/api/imagem?os=1&gtin=1234567890123&nome=../../../../prompt_sistema_qa.md"
curl -s -o /dev/null -w "extensao errada: %{http_code}\n" "http://localhost:3001/api/imagem?os=1&gtin=1234567890123&nome=../caminhos-locais.json"
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-img
```

Expected: `raiz: 200`, `subpasta: 200`, `traversal: 404` (nunca 200 com conteúdo do arquivo), `extensao errada: 404`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: rota GET /api/imagem serve foto individual sem base64"
```

---

## Task 3: Front-end — imagens por URL

**Files:**
- Modify: `js/qa.js`
- Modify: `qa.html`

**Interfaces:**
- Consumes: `GET /api/imagem` (Task 2)
- Produces: `urlImagem(nome)` (função nova em `js/qa.js`, usada no template)

- [ ] **Step 1: Adicionar `urlImagem` em `js/qa.js`**

Adicionar, logo depois da função `selecionarGtin` (depois do `}` que a fecha):

```js
        // Monta a URL da rota GET /api/imagem pro GTIN selecionado no momento - troca o
        // antigo base64 embutido no JSON (lento com fotos reais grandes) por uma URL
        // normal, que o navegador carrega em paralelo sem travar a tela toda.
        function urlImagem(nome) {
            if (!selecionado.value) return '';
            return API + '/api/imagem?os=' + encodeURIComponent(selecionado.value.os) +
                '&gtin=' + encodeURIComponent(selecionado.value.gtin) +
                '&nome=' + encodeURIComponent(nome);
        }
```

No `return { ... }` do `setup()`, adicionar `urlImagem` à lista exportada.

- [ ] **Step 2: Trocar o `src` das imagens em `qa.html`**

Trocar (grade "Raiz"):
```html
                                    <img :src="'data:image/jpeg;base64,' + img.arquivo" :alt="img.nome">
```
pela primeira ocorrência (dentro do bloco da Raiz, logo depois de `<div class="qa-miniatura">`):
```html
                                    <img :src="urlImagem(img.nome)" :alt="img.nome" loading="lazy">
```

Trocar a segunda ocorrência (dentro do `v-for` de subpastas RT/IS/AP):
```html
                                            <img :src="'data:image/jpeg;base64,' + img.arquivo" :alt="img.nome">
```
por:
```html
                                            <img :src="urlImagem(tag + '/' + img.nome)" :alt="img.nome" loading="lazy">
```

- [ ] **Step 3: Verificar manualmente**

```bash
mkdir -p /tmp/syndiqa-front/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/RT
printf '\xff\xd8\xff\xe0teste' > /tmp/syndiqa-front/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/foto_0.jpg
printf '\xff\xd8\xff\xe0teste-rt' > /tmp/syndiqa-front/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/RT/foto_2.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-front"}' > caminhos-locais.json
node server.js &
sleep 1
```

Abrir `http://localhost:3001/` no navegador (ou usar a skill `webapp-testing`), selecionar o GTIN, confirmar que as miniaturas aparecem (mesmo com um JPEG minúsculo/inválido de teste — se o navegador não conseguir decodificar, tudo bem, o importante é confirmar que a requisição `GET /api/imagem?...` foi feita e voltou 200 nas ferramentas de rede do navegador, não que a imagem é visualmente válida).

```bash
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-front
```

- [ ] **Step 4: Commit**

```bash
git add js/qa.js qa.html
git commit -m "feat: miniaturas carregam por URL individual em vez de base64"
```

---

## Task 4: TXT único por OS

**Files:**
- Modify: `lib/qaSyndi.js`
- Modify: `lib/qaSyndi.test.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `moverPasta` (interna, já existe)
- Produces: `gerarLinhaTxt(gtin, arquivo, motivosLista)` → `string` (pura); `anexarTxtRetrabalho(retrabalhoDir, pastaOsNome, os, gtin, marcacoes)` → caminho do TXT (`string`), cria/anexa; `retrabalharGtin(agConferenciaDir, retrabalhoDir, pastaOsNome, pastaGtinNome, os, gtin, marcacoes)` — **assinatura muda**: ganha o parâmetro `os` (novo, antes de `gtin`), devolve `{ destino, caminhoTxt }`.

- [ ] **Step 1: Escrever os testes que falham**

Em `lib/qaSyndi.test.js`, **remover** o teste `'gerarConteudoTxt formata GTIN, data e uma linha por foto marcada'` (linhas 127-137) — a função que ele testa deixa de existir.

Substituir o teste `'retrabalharGtin move a pasta inteira e grava retrabalho.txt no destino'` (linhas 139-161) por:

```js
test('retrabalharGtin move a pasta inteira e anexa no TXT unico da OS', () => {
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
        '49800', '7898133020049', { 'foto_2.jpg': ['desfoque'] }
    );

    assert.equal(fs.existsSync(origem), false);
    const destino = path.join(retrabalho, pastaOsNome, pastaGtinNome);
    assert.equal(resultado.destino, destino);
    assert.equal(fs.existsSync(path.join(destino, 'foto_0.jpg')), true);
    assert.equal(fs.existsSync(path.join(destino, 'foto_2.jpg')), true);
    const caminhoTxt = path.join(retrabalho, pastaOsNome, 'Retrabalho_OS_49800.txt');
    assert.equal(resultado.caminhoTxt, caminhoTxt);
    assert.equal(fs.readFileSync(caminhoTxt, 'utf8'), '7898133020049 - foto_2.jpg: desfoque\n');
});
```

Substituir o teste `'retrabalharGtin lanca erro quando a pasta de origem nao existe'` (linhas 163-170) por:

```js
test('retrabalharGtin lanca erro quando a pasta de origem nao existe', () => {
    const agConferencia = criarDirTemp();
    const retrabalho = criarDirTemp();
    assert.throws(
        () => qaSyndi.retrabalharGtin(agConferencia, retrabalho, 'OS_1---(1 GTINs)---2026-01-01', '123', '1', '123', {}),
        /Pasta do GTIN nao encontrada/
    );
});
```

Adicionar ao final do arquivo (depois dos testes de `resolverImagemSegura` da Task 1):

```js
test('gerarLinhaTxt formata gtin, arquivo e motivos numa linha', () => {
    assert.equal(
        qaSyndi.gerarLinhaTxt('7896061302527', 'foto_0.jpg', ['desfoque', 'iluminação']),
        '7896061302527 - foto_0.jpg: desfoque, iluminação'
    );
});

test('anexarTxtRetrabalho cria Retrabalho_OS_<numero>.txt na raiz da pasta da OS', () => {
    const retrabalho = criarDirTemp();
    const pastaOsNome = 'OS_49800---(2 GTINs)---2026-07-20';
    const caminho = qaSyndi.anexarTxtRetrabalho(retrabalho, pastaOsNome, '49800', '7896061302527', {
        '7896061302527_06_07_2026_11_45_34_0.jpg': ['desfoque']
    });
    assert.equal(caminho, path.join(retrabalho, pastaOsNome, 'Retrabalho_OS_49800.txt'));
    assert.equal(
        fs.readFileSync(caminho, 'utf8'),
        '7896061302527 - 7896061302527_06_07_2026_11_45_34_0.jpg: desfoque\n'
    );
});

test('anexarTxtRetrabalho anexa linhas de outro GTIN no mesmo arquivo da OS', () => {
    const retrabalho = criarDirTemp();
    const pastaOsNome = 'OS_49800---(2 GTINs)---2026-07-20';
    qaSyndi.anexarTxtRetrabalho(retrabalho, pastaOsNome, '49800', '7896061302527', {
        'foto_0.jpg': ['desfoque']
    });
    const caminho = qaSyndi.anexarTxtRetrabalho(retrabalho, pastaOsNome, '49800', '7898994680758', {
        'foto_1.jpg': ['iluminação', 'enquadramento errado']
    });
    assert.equal(
        fs.readFileSync(caminho, 'utf8'),
        '7896061302527 - foto_0.jpg: desfoque\n7898994680758 - foto_1.jpg: iluminação, enquadramento errado\n'
    );
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FALHA — `qaSyndi.gerarLinhaTxt is not a function`, `qaSyndi.anexarTxtRetrabalho is not a function`, e os testes de `retrabalharGtin` quebram (assinatura antiga).

- [ ] **Step 3: Implementar em `lib/qaSyndi.js`**

Remover as funções `formatarDataISO` e `gerarConteudoTxt` inteiras (o bloco de comentário + função de cada uma).

No lugar delas, escrever:

```js
// Uma linha por foto marcada no TXT unico da OS - ver spec secao 4. Pura e testavel.
function gerarLinhaTxt(gtin, arquivo, motivosLista) {
    return `${gtin} - ${arquivo}: ${motivosLista.join(', ')}`;
}

// Anexa (cria se nao existir) as linhas de retrabalho de um GTIN no TXT unico da OS -
// Retrabalho_OS_<numero>.txt na raiz da pasta da OS dentro de Retrabalho (nao mais um
// TXT por GTIN dentro da propria pasta do GTIN). Quando mais de um GTIN da mesma OS
// tiver retrabalho, cada confirmacao so ANEXA suas linhas - nunca reescreve o arquivo
// inteiro, entao retrabalhos de GTINs diferentes da mesma OS convivem no mesmo arquivo.
function anexarTxtRetrabalho(retrabalhoDir, pastaOsNome, os, gtin, marcacoes) {
    const pastaOsDestino = path.join(retrabalhoDir, pastaOsNome);
    fs.mkdirSync(pastaOsDestino, { recursive: true });
    const caminhoTxt = path.join(pastaOsDestino, `Retrabalho_OS_${os}.txt`);
    const linhasNovas = Object.keys(marcacoes).map(arquivo => gerarLinhaTxt(gtin, arquivo, marcacoes[arquivo]));
    fs.appendFileSync(caminhoTxt, linhasNovas.join('\n') + '\n', 'utf8');
    return caminhoTxt;
}
```

Substituir a função `retrabalharGtin` inteira por:

```js
// Mesma unidade de decisao que aprovarGtin: move o GTIN inteiro (nao so as fotos
// marcadas) - o fotografo recebe a pasta completa de volta, com contexto, e reenvia
// o GTIN inteiro depois de corrigir. Ver spec secao 7 ("GTIN inteiro retido"). `os` e o
// numero puro (nao a pasta decorada) - e o que nomeia o TXT unico da OS.
function retrabalharGtin(agConferenciaDir, retrabalhoDir, pastaOsNome, pastaGtinNome, os, gtin, marcacoes) {
    const origem = path.join(agConferenciaDir, pastaOsNome, pastaGtinNome);
    if (!fs.existsSync(origem)) {
        throw new Error('Pasta do GTIN nao encontrada: ' + origem);
    }
    const destino = path.join(retrabalhoDir, pastaOsNome, pastaGtinNome);
    moverPasta(origem, destino);
    const caminhoTxt = anexarTxtRetrabalho(retrabalhoDir, pastaOsNome, os, gtin, marcacoes);
    return { destino, caminhoTxt };
}
```

No `module.exports`, remover `gerarConteudoTxt` e adicionar `gerarLinhaTxt` e `anexarTxtRetrabalho`.

- [ ] **Step 4: Atualizar o call site em `server.js`**

Na rota `POST /api/retrabalho`, trocar:

```js
                const resultado = qaSyndi.retrabalharGtin(qaSyndi.AGCONFERENCIA, qaSyndi.RETRABALHO, pastaOsNome, pastaGtinNome, gtin, marcacoes);
```

por:

```js
                const resultado = qaSyndi.retrabalharGtin(qaSyndi.AGCONFERENCIA, qaSyndi.RETRABALHO, pastaOsNome, pastaGtinNome, os, gtin, marcacoes);
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS — 20 testes, 0 falhas (18 da Task 1, menos 1 removido de `gerarConteudoTxt`, mais 3 novos: `gerarLinhaTxt` + 2 de `anexarTxtRetrabalho`).

- [ ] **Step 6: Verificar manualmente o fluxo HTTP completo**

```bash
mkdir -p /tmp/syndiqa-txt/AgConferencia/"OS_49800---(2 GTINs)---2026-07-22"/7896061302527
mkdir -p /tmp/syndiqa-txt/AgConferencia/"OS_49800---(2 GTINs)---2026-07-22"/7898994680758
echo teste > /tmp/syndiqa-txt/AgConferencia/"OS_49800---(2 GTINs)---2026-07-22"/7896061302527/foto_0.jpg
echo teste > /tmp/syndiqa-txt/AgConferencia/"OS_49800---(2 GTINs)---2026-07-22"/7898994680758/foto_1.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-txt"}' > caminhos-locais.json
node server.js &
sleep 1
curl -s -X POST http://localhost:3001/api/retrabalho -H "Content-Type: application/json" \
  -d '{"os":"49800","gtin":"7896061302527","marcacoes":{"foto_0.jpg":["desfoque"]}}'
echo
curl -s -X POST http://localhost:3001/api/retrabalho -H "Content-Type: application/json" \
  -d '{"os":"49800","gtin":"7898994680758","marcacoes":{"foto_1.jpg":["iluminação","enquadramento errado"]}}'
echo
cat "/tmp/syndiqa-txt/Retrabalho/OS_49800---(2 GTINs)---2026-07-22/Retrabalho_OS_49800.txt"
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-txt
```

Expected: as duas chamadas devolvem `{"ok":true, ...}`; o arquivo `Retrabalho_OS_49800.txt` tem as duas linhas, uma de cada GTIN:
```
7896061302527 - foto_0.jpg: desfoque
7898994680758 - foto_1.jpg: iluminação, enquadramento errado
```

- [ ] **Step 7: Commit**

```bash
git add lib/qaSyndi.js lib/qaSyndi.test.js server.js
git commit -m "feat: TXT de retrabalho passa a ser um por OS, agregando todos os GTINs"
```

---

## Task 5: Módulo Redmine + credencial

**Files:**
- Create: `lib/redmine.js`
- Create: `lib/redmine.test.js`
- Modify: `.gitignore`
- Modify: `server.js` (`ARQUIVOS_BLOQUEADOS`)

**Interfaces:**
- Produces: `carregarConfigRedmine(basePath)` → `{baseUrl, apiKey} | null`; `buscarIssueAbertaPorGtin(basePath, gtin)` → issue do Redmine ou `null`; `escreverCampoRedmine(basePath, issueId, campoId, valor)` → `void` (lança erro se falhar); `marcarRetrabalhoFotografia(basePath, gtin)` → `{ issueId }` (lança erro se não achar issue aberta ou a escrita falhar)

- [ ] **Step 1: Proteger a credencial antes de criar o arquivo**

Adicionar `redmine-config.json` ao `.gitignore` (mesma seção de `caminhos-locais.json`):

```
node_modules/
caminhos-locais.json
redmine-config.json
```

Em `server.js`, na constante `ARQUIVOS_BLOQUEADOS`, adicionar `'redmine-config.json'`:

```js
const ARQUIVOS_BLOQUEADOS = ['caminhos-locais.json', 'redmine-config.json', 'credencial.txt', 'credenciais.txt', 'valores.txt', '.env'];
```

- [ ] **Step 2: Escrever o teste que falha**

```js
// lib/redmine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const redmine = require('./redmine');

function criarDirTemp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'syndiqa-redmine-'));
}

test('carregarConfigRedmine devolve null quando o arquivo nao existe', () => {
    const dirTemp = criarDirTemp();
    assert.equal(redmine.carregarConfigRedmine(dirTemp), null);
});

test('carregarConfigRedmine le baseUrl/apiKey do arquivo', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'redmine-config.json'), JSON.stringify({ baseUrl: 'https://redmine.exemplo.com', apiKey: 'chave123' }));
    const config = redmine.carregarConfigRedmine(dirTemp);
    assert.deepEqual(config, { baseUrl: 'https://redmine.exemplo.com', apiKey: 'chave123' });
});

test('carregarConfigRedmine devolve null se o JSON estiver corrompido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'redmine-config.json'), '{ nao e json');
    assert.equal(redmine.carregarConfigRedmine(dirTemp), null);
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `node --test lib/redmine.test.js`
Expected: FALHA — `Cannot find module './redmine'`.

- [ ] **Step 4: Implementar `lib/redmine.js`**

```js
// lib/redmine.js
// Escreve status no Redmine quando o Syndi_qa confirma um retrabalho. Mesmo padrao de
// credencial/fetch ja usado em c:\sphoto\lib\qaHub.js (redmineFetch/buscarIssueAbertaPorGtin/
// PUT de custom_fields via issues/:id.json) - nao reinventa, replica o que ja funciona la.
const fs = require('fs');
const path = require('path');

function carregarConfigRedmine(basePath) {
    const configPath = path.join(basePath, 'redmine-config.json');
    if (!fs.existsSync(configPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
        return null;
    }
}

async function redmineFetch(basePath, caminho, opcoes) {
    const config = carregarConfigRedmine(basePath);
    if (!config || !config.baseUrl || !config.apiKey) {
        throw new Error('redmine-config.json ausente ou incompleto (precisa de baseUrl e apiKey)');
    }
    const cabecalhos = Object.assign({
        'X-Redmine-API-Key': config.apiKey,
        'Content-Type': 'application/json'
    }, (opcoes && opcoes.headers) || {});
    return fetch(config.baseUrl + caminho, Object.assign({}, opcoes, { headers: cabecalhos }));
}

// Mesma consulta que o sphoto ja usa: cf_1 = GTIN, tracker_id=2 (GTIN), status aberto.
async function buscarIssueAbertaPorGtin(basePath, gtin) {
    const resp = await redmineFetch(basePath, '/issues.json?cf_1=' + encodeURIComponent(gtin) + '&status_id=open&tracker_id=2&limit=5');
    if (!resp.ok) throw new Error('Redmine respondeu ' + resp.status + ' ao buscar GTIN ' + gtin);
    const dados = await resp.json();
    if (!dados.issues || dados.issues.length === 0) return null;
    return dados.issues[0];
}

async function escreverCampoRedmine(basePath, issueId, campoId, valor) {
    const resp = await redmineFetch(basePath, '/issues/' + issueId + '.json', {
        method: 'PUT',
        body: JSON.stringify({ issue: { custom_fields: [{ id: campoId, value: valor }] } })
    });
    if (!resp.ok) {
        const texto = await resp.text();
        throw new Error('Redmine respondeu ' + resp.status + ' ao gravar campo: ' + texto);
    }
}

const CF_SITUACAO_IMAGENS = 15;
const OPCAO_RETRABALHO_FOTOGRAFIA = '24';

// Busca a issue aberta do GTIN e marca Situacao das Imagens = "Retrabalho Fotografia" (24).
// Lanca erro se nao achar issue aberta ou se a escrita falhar - quem chama (server.js)
// decide o que fazer com a falha (nao desfaz o move/TXT locais que ja aconteceram).
async function marcarRetrabalhoFotografia(basePath, gtin) {
    const issue = await buscarIssueAbertaPorGtin(basePath, gtin);
    if (!issue) {
        throw new Error('Nenhuma ficha aberta encontrada no Redmine para o GTIN ' + gtin);
    }
    await escreverCampoRedmine(basePath, issue.id, CF_SITUACAO_IMAGENS, OPCAO_RETRABALHO_FOTOGRAFIA);
    return { issueId: issue.id };
}

module.exports = {
    carregarConfigRedmine,
    buscarIssueAbertaPorGtin,
    escreverCampoRedmine,
    marcarRetrabalhoFotografia
};
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node --test lib/redmine.test.js`
Expected: PASS — 3 testes, 0 falhas.

Run: `npm test`
Expected: PASS — 23 testes, 0 falhas (20 de `lib/qaSyndi.test.js` + 3 de `lib/redmine.test.js` — o script `node --test lib/*.test.js` já pega os dois arquivos).

- [ ] **Step 6: Copiar a credencial real (mesma que o sphoto já usa)**

```bash
cp "C:\sphoto\redmine-config.json" "redmine-config.json"
git status --porcelain
```

Expected: `git status` não mostra `redmine-config.json` (já está no `.gitignore` desde o Step 1).

- [ ] **Step 7: Verificar manualmente que a credencial não sai pelo HTTP**

```bash
node server.js &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/redmine-config.json
kill %1
```

Expected: `403`.

- [ ] **Step 8: Commit**

```bash
git add lib/redmine.js lib/redmine.test.js .gitignore server.js
git commit -m "feat: modulo redmine.js para marcar status via API REST"
```

(Não commitar `redmine-config.json` — deve continuar fora do git, protegido pelo `.gitignore`.)

---

## Task 6: Marcar "Retrabalho Fotografia" no Redmine ao confirmar retrabalho

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `redmine.marcarRetrabalhoFotografia(basePath, gtin)` (Task 5)
- Produces: `POST /api/retrabalho` passa a devolver também `redmineOk` (`boolean`) e `redmineError` (`string|null`)

- [ ] **Step 1: Importar o módulo**

No topo de `server.js`, logo depois de `const qaSyndi = require('./lib/qaSyndi');`, adicionar:

```js
const redmine = require('./lib/redmine');
```

- [ ] **Step 2: Tornar o handler assíncrono e chamar o Redmine depois do move**

Na rota `POST /api/retrabalho`, trocar `lerCorpo(req).then(corpo => {` por `lerCorpo(req).then(async corpo => {` (só essa linha).

Trocar o bloco:

```js
            try {
                const resultado = qaSyndi.retrabalharGtin(qaSyndi.AGCONFERENCIA, qaSyndi.RETRABALHO, pastaOsNome, pastaGtinNome, os, gtin, marcacoes);
                enviarJson(res, 200, { ok: true, destino: resultado.destino });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
```

por:

```js
            try {
                const resultado = qaSyndi.retrabalharGtin(qaSyndi.AGCONFERENCIA, qaSyndi.RETRABALHO, pastaOsNome, pastaGtinNome, os, gtin, marcacoes);
                // O move de pasta + TXT ja aconteceram e sao a fonte de verdade local -
                // se o Redmine falhar (rede, GTIN sem ficha aberta, etc.) NAO desfaz nada,
                // so avisa via redmineOk/redmineError. Mesmo principio do qaHub.js do sphoto
                // ("falha aqui nao derruba o retorno, so loga/avisa").
                let redmineOk = true;
                let redmineError = null;
                try {
                    await redmine.marcarRetrabalhoFotografia(BASE_PATH, gtin);
                } catch (err) {
                    redmineOk = false;
                    redmineError = err.message;
                    console.error('Erro ao marcar Retrabalho Fotografia no Redmine para GTIN', gtin, err);
                }
                enviarJson(res, 200, { ok: true, destino: resultado.destino, redmineOk, redmineError });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
```

- [ ] **Step 3: Verificar manualmente**

```bash
mkdir -p /tmp/syndiqa-redmine/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/0000000000000
echo teste > /tmp/syndiqa-redmine/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/0000000000000/foto_0.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-redmine"}' > caminhos-locais.json
node server.js &
sleep 1
curl -s -X POST http://localhost:3001/api/retrabalho -H "Content-Type: application/json" \
  -d '{"os":"1","gtin":"0000000000000","marcacoes":{"foto_0.jpg":["desfoque"]}}'
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-redmine
```

`0000000000000` é um GTIN inexistente no Redmine de propósito, pra testar o caminho de falha sem depender de dados reais. Expected: resposta HTTP `200`, corpo com `"ok":true`, `"destino":...` preenchido, e `"redmineOk":false` com `"redmineError"` mencionando "Nenhuma ficha aberta encontrada" (confirma que a falha do Redmine não derruba a resposta nem desfaz o move local).

Se quiser confirmar também o caminho de sucesso: repita o teste com um GTIN real que tenha ficha aberta no Redmine (ver `redmine-config.json` recém-copiado) e confira no Redmine que `Situação das Imagens` virou "Retrabalho Fotografia".

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: marca Retrabalho Fotografia no Redmine ao confirmar retrabalho"
```

---

## Task 7: Front-end — painel único de motivos abaixo do palco

**Files:**
- Modify: `js/qa.js`
- Modify: `qa.html`
- Modify: `css/qa.css`

**Interfaces:**
- Produces: `fotoAtiva` (`ref<string|null>`), `selecionarFoto(nomeFoto)`, `togglarMotivoAtivo(motivo)` — substituem `togglarProblema`/`togglarMotivo`, que são removidas.

- [ ] **Step 1: Trocar a lógica de marcação em `js/qa.js`**

Adicionar, junto das outras `ref`/`reactive` no início do `setup()` (logo depois de `const marcadas = reactive({});`):

```js
        const fotoAtiva = ref(null);
```

Remover as funções `togglarProblema` e `togglarMotivo` inteiras e substituir por:

```js
        // Clicar numa foto so a torna "ativa" (o painel abaixo do palco passa a mostrar
        // o estado dela) - nao marca nada sozinho. So marcar motivo (togglarMotivoAtivo)
        // e o que conta como "foto com problema".
        function selecionarFoto(nomeFoto) {
            fotoAtiva.value = nomeFoto;
        }

        function togglarMotivoAtivo(motivo) {
            if (!fotoAtiva.value) return;
            if (!marcadas[fotoAtiva.value]) marcadas[fotoAtiva.value] = [];
            const lista = marcadas[fotoAtiva.value];
            const idx = lista.indexOf(motivo);
            if (idx === -1) lista.push(motivo); else lista.splice(idx, 1);
            // Sem motivo nenhum marcado nao conta como "problema" - remove a entrada pra
            // nao acender o indicador na miniatura nem contar em temMarcacao/todasMarcacoesTemMotivo.
            if (lista.length === 0) delete marcadas[fotoAtiva.value];
        }
```

Em `selecionarGtin`, logo depois da linha `Object.keys(marcadas).forEach(chave => delete marcadas[chave]);`, adicionar:

```js
            fotoAtiva.value = null;
```

No `return { ... }` do `setup()`: remover `togglarProblema, togglarMotivo` da lista, adicionar `fotoAtiva, selecionarFoto, togglarMotivoAtivo`.

- [ ] **Step 2: Reescrever a grade e adicionar o painel em `qa.html`**

Trocar o bloco da grade "Raiz" inteiro (de `<div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.raiz" :key="img.nome">` até o `</div>` que fecha esse `v-for`, incluindo o checkbox e a lista de motivos antigos) por:

```html
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
```

Trocar o bloco da grade de subpastas (dentro do `v-for="tag in ['RT', 'IS', 'AP']"`, o `v-for="img in detalhe.imagens.subpastas[tag]"` inteiro) por:

```html
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
```

Adicionar o painel único, depois do `</template>` que fecha o `v-for="tag in ['RT', 'IS', 'AP']"` e antes da `<div class="qa-enviar-conferencia mt-3">`:

```html
                        <div v-if="fotoAtiva" class="qa-motivos-painel">
                            <div class="qa-motivos-titulo">Motivos para {{ fotoAtiva }}</div>
                            <div class="qa-motivos">
                                <label v-for="motivo in motivos" :key="motivo" class="qa-motivo-item">
                                    <input type="checkbox" :checked="(marcadas[fotoAtiva] || []).includes(motivo)" @change="togglarMotivoAtivo(motivo)"> {{ motivo }}
                                </label>
                            </div>
                        </div>
```

- [ ] **Step 3: Adicionar estilos em `css/qa.css`**

Adicionar, logo depois da regra `.qa-miniatura.tem-ap { ... }`:

```css
.qa-miniatura.ativa { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary); cursor: pointer; }
.qa-miniatura.marcada { border-color: var(--danger); box-shadow: 0 0 0 2px var(--danger); }
.qa-miniatura { cursor: pointer; }

.qa-motivos-painel {
    margin: 12px 0;
}

.qa-motivos-titulo {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 6px;
}
```

- [ ] **Step 4: Verificar manualmente com Playwright**

```bash
mkdir -p /tmp/syndiqa-ux/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123
printf '\xff\xd8\xff\xe0a' > /tmp/syndiqa-ux/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/foto_0.jpg
printf '\xff\xd8\xff\xe0b' > /tmp/syndiqa-ux/AgConferencia/"OS_1---(1 GTINs)---2026-07-22"/1234567890123/foto_1.jpg
echo '{"syncimgSendBase":"/tmp/syndiqa-ux"}' > caminhos-locais.json
node server.js &
sleep 1
```

Usando a skill `webapp-testing` (Playwright), abrir `http://localhost:3001/`, selecionar o GTIN, e confirmar:
1. Clicar em `foto_0.jpg` abre o painel "Motivos para foto_0.jpg" abaixo da grade, todos os checkboxes desmarcados.
2. Marcar "desfoque" — a miniatura de `foto_0.jpg` ganha a borda/indicador de "marcada".
3. Clicar em `foto_1.jpg` — o painel muda pra "Motivos para foto_1.jpg", **sem** nenhum motivo marcado (estado zerado, independente do que foi marcado em `foto_0.jpg`).
4. Clicar de volta em `foto_0.jpg` — o painel mostra "desfoque" ainda marcado (o estado é por foto, não se perde).
5. Desmarcar o único motivo de `foto_0.jpg` — o indicador de "marcada" na miniatura some.

```bash
kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-ux
```

- [ ] **Step 5: Commit**

```bash
git add js/qa.js qa.html css/qa.css
git commit -m "feat: painel unico de motivos abaixo do palco substitui lista por miniatura"
```

---

## Task 8: Verificação end-to-end final

**Files:** nenhum arquivo novo — checklist cobrindo o cenário completo que motivou esta correção.

- [ ] **Step 1: Rodar toda a suíte automatizada**

Run: `npm test`
Expected: PASS — 23 testes, 0 falhas.

- [ ] **Step 2: Cenário completo — OS com 2 GTINs, retrabalho nos dois, um TXT só**

```bash
mkdir -p /tmp/syndiqa-e2e/AgConferencia/"OS_777---(2 GTINs)---2026-07-22"/7896061302527
mkdir -p /tmp/syndiqa-e2e/AgConferencia/"OS_777---(2 GTINs)---2026-07-22"/7898994680758
printf '\xff\xd8\xff\xe0a' > "/tmp/syndiqa-e2e/AgConferencia/OS_777---(2 GTINs)---2026-07-22/7896061302527/7896061302527_06_07_2026_11_45_34_0.jpg"
printf '\xff\xd8\xff\xe0b' > "/tmp/syndiqa-e2e/AgConferencia/OS_777---(2 GTINs)---2026-07-22/7898994680758/foto_1.jpg"
echo '{"syncimgSendBase":"/tmp/syndiqa-e2e"}' > caminhos-locais.json
node server.js &
sleep 1

curl -s http://localhost:3001/api/fila
echo
curl -s "http://localhost:3001/api/imagem?os=777&gtin=7896061302527&nome=7896061302527_06_07_2026_11_45_34_0.jpg" -o /dev/null -w "imagem: %{http_code}\n"
curl -s -X POST http://localhost:3001/api/retrabalho -H "Content-Type: application/json" \
  -d '{"os":"777","gtin":"7896061302527","marcacoes":{"7896061302527_06_07_2026_11_45_34_0.jpg":["desfoque"]}}'
echo
curl -s -X POST http://localhost:3001/api/retrabalho -H "Content-Type: application/json" \
  -d '{"os":"777","gtin":"7898994680758","marcacoes":{"foto_1.jpg":["fundo sujo"]}}'
echo
curl -s http://localhost:3001/api/fila
echo
cat "/tmp/syndiqa-e2e/Retrabalho/OS_777---(2 GTINs)---2026-07-22/Retrabalho_OS_777.txt"

kill %1
rm caminhos-locais.json
rm -rf /tmp/syndiqa-e2e
```

Expected:
- `GET /api/fila` inicial lista os 2 GTINs da OS 777.
- `GET /api/imagem` devolve `200` (confirma o fix de performance funcionando ponta a ponta).
- As duas chamadas de `/api/retrabalho` devolvem `ok:true` (com `redmineOk`/`redmineError` variando conforme o GTIN de teste existir ou não no Redmine — isso é esperado, não é falha).
- `GET /api/fila` final volta vazio (os dois GTINs saíram de `AgConferencia`).
- `Retrabalho_OS_777.txt` tem exatamente:
```
7896061302527 - 7896061302527_06_07_2026_11_45_34_0.jpg: desfoque
7898994680758 - foto_1.jpg: fundo sujo
```

- [ ] **Step 3: Commit final (se algo precisou de ajuste nos passos acima)**

```bash
git add -A
git commit -m "chore: ajustes finais da verificacao end-to-end da Parte 1 (correcoes)"
```

(Pular este commit se nada precisou de ajuste.)
