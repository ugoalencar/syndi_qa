# Mockup (número + orientações) e Motivos de Retrabalho Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** marcar destino "Mockup" num GTIN passa a exigir um número de identificação do mockup
(obrigatório) e permite marcar orientações opcionais pro editor, entregues via TXT dentro da
própria pasta que segue pra `AgEnvio`; a lista de motivos de retrabalho passa a espelhar as 4
opções reais já cadastradas no Redmine (`cf_187`), substituindo as 9 genéricas de hoje.

**Architecture:** back-end (`lib/qaSyndi.js`) ganha `gravarTxtMockup`/`carregarOrientacoesMockup`
e `aprovarGtin` ganha um 5º parâmetro opcional; `server.js` valida o número obrigatório e monta
esse parâmetro antes de chamar `aprovarGtin`; front-end (`js/qa.js` + `syndi_qa.html`) ganha os
dois campos novos no painel de envio, reaproveitando o CSS do painel de motivos.

**Tech Stack:** Node.js core (`node:test`, `fs`), Vue 3 (sem build).

## Global Constraints

- Node.js core-only + Vue 3, sem build, sem CDN — nenhuma dependência nova nesta feature.
- Comentários em código: português sem acento, explicando o PORQUÊ.
- Strings de erro em JS seguem o padrão do projeto: português sem acento.
- Número do Mockup é OBRIGATÓRIO quando o destino do GTIN é "Mockup" — bloqueia client E server.
  Orientações são OPCIONAIS.
- O TXT do mockup é gravado dentro da pasta do GTIN, em `AgConferencia`, ANTES do move pra
  `AgEnvio` — segue junto com as fotos automaticamente via `moverPasta`, sem lógica extra.
- Motivos de retrabalho: mudança de CONTEÚDO de arquivo só, nenhuma mudança de código.

---

### Task 1: `lib/qaSyndi.js` — geração do TXT de mockup e leitura das orientações

**Files:**
- Modify: `lib/qaSyndi.js`
- Test: `lib/qaSyndi.test.js`

**Interfaces:**
- Consumes: nada de tarefas anteriores (primeira tarefa do plano).
- Produces: `gravarTxtMockup(pastaGtinPath, gtin, numeroMockup, orientacoes)` → caminho do arquivo
  escrito (string). `carregarOrientacoesMockup(basePath)` → array de strings. `aprovarGtin`
  ganha um 5º parâmetro opcional `mockupInfo` (`{numero, orientacoes} | undefined`).

- [ ] **Step 1: Escrever os testes que falham pra `gravarTxtMockup`**

Em `lib/qaSyndi.test.js`, adicione estes testes logo depois do teste
`'aprovarGtin lanca erro quando a pasta de origem nao existe'` (procure esse texto, é por volta
da linha 120):

```js
test('gravarTxtMockup grava GTIN, numero e orientacoes no arquivo', () => {
    const dirTemp = criarDirTemp();
    const caminho = qaSyndi.gravarTxtMockup(dirTemp, '7898133020049', 'MK-042', ['Usar fundo branco', 'Manter proporcao']);

    assert.equal(caminho, path.join(dirTemp, 'Mockup_7898133020049.txt'));
    const conteudo = fs.readFileSync(caminho, 'utf8');
    assert.match(conteudo, /GTIN: 7898133020049/);
    assert.match(conteudo, /Numero do Mockup: MK-042/);
    assert.match(conteudo, /- Usar fundo branco/);
    assert.match(conteudo, /- Manter proporcao/);
});

test('gravarTxtMockup omite o bloco de orientacoes quando a lista vem vazia', () => {
    const dirTemp = criarDirTemp();
    const caminho = qaSyndi.gravarTxtMockup(dirTemp, '7898133020049', 'MK-042', []);

    const conteudo = fs.readFileSync(caminho, 'utf8');
    assert.match(conteudo, /Numero do Mockup: MK-042/);
    assert.doesNotMatch(conteudo, /Orientacoes:/);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd D:\syndi_qa && node --test lib/qaSyndi.test.js`
Expected: FAIL com "qaSyndi.gravarTxtMockup is not a function".

- [ ] **Step 3: Implementar `gravarTxtMockup`**

Em `lib/qaSyndi.js`, logo depois da função `moverPasta` (procure `function moverPasta`, por volta
da linha 332-335), adicione:

```js
// Gera o TXT de mockup dentro da propria pasta do GTIN (ainda em AgConferencia, antes do
// move) - assim ele viaja junto pra AgEnvio automaticamente quando aprovarGtin move a pasta
// inteira, sem lógica extra de mover ele separado (diferente do retrabalho, que so manda o
// TXT porque as fotos ja estao de volta com o fotografo - aqui as imagens SAO enviadas, o
// TXT so vai junto). Numero e obrigatorio (validado em server.js antes de chamar isso),
// orientacoes e opcional - bloco "Orientacoes:" so aparece se a lista nao vier vazia.
function gravarTxtMockup(pastaGtinPath, gtin, numeroMockup, orientacoes) {
    let conteudo = `GTIN: ${gtin}\nNumero do Mockup: ${numeroMockup}\n`;
    if (orientacoes && orientacoes.length) {
        conteudo += 'Orientacoes:\n' + orientacoes.map(o => `- ${o}`).join('\n') + '\n';
    }
    const caminhoTxt = path.join(pastaGtinPath, `Mockup_${gtin}.txt`);
    fs.writeFileSync(caminhoTxt, conteudo, 'utf8');
    return caminhoTxt;
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd D:\syndi_qa && node --test lib/qaSyndi.test.js`
Expected: os 2 testes novos passam.

- [ ] **Step 5: Escrever os testes que falham pra `aprovarGtin` com `mockupInfo`**

Logo depois dos 2 testes que você acabou de adicionar, adicione:

```js
test('aprovarGtin grava o TXT de mockup dentro da pasta antes de mover, quando mockupInfo e passado', () => {
    const agConferencia = criarDirTemp();
    const agEnvio = criarDirTemp();
    const pastaOsNome = 'OS_49800---(1 GTINs)---2026-07-20';
    const pastaGtinNome = '7898133020049';
    const origem = path.join(agConferencia, pastaOsNome, pastaGtinNome);
    fs.mkdirSync(origem, { recursive: true });
    fs.writeFileSync(path.join(origem, 'foto_0.jpg'), 'a');

    qaSyndi.aprovarGtin(agConferencia, agEnvio, pastaOsNome, pastaGtinNome, { numero: 'MK-042', orientacoes: ['Usar fundo branco'] });

    const destino = path.join(agEnvio, pastaOsNome, pastaGtinNome);
    const caminhoTxt = path.join(destino, `Mockup_${pastaGtinNome}.txt`);
    assert.equal(fs.existsSync(caminhoTxt), true);
    const conteudo = fs.readFileSync(caminhoTxt, 'utf8');
    assert.match(conteudo, /Numero do Mockup: MK-042/);
});

test('aprovarGtin nao gera TXT de mockup quando mockupInfo nao e passado', () => {
    const agConferencia = criarDirTemp();
    const agEnvio = criarDirTemp();
    const pastaOsNome = 'OS_49800---(1 GTINs)---2026-07-20';
    const pastaGtinNome = '7898133020049';
    const origem = path.join(agConferencia, pastaOsNome, pastaGtinNome);
    fs.mkdirSync(origem, { recursive: true });
    fs.writeFileSync(path.join(origem, 'foto_0.jpg'), 'a');

    qaSyndi.aprovarGtin(agConferencia, agEnvio, pastaOsNome, pastaGtinNome);

    const destino = path.join(agEnvio, pastaOsNome, pastaGtinNome);
    const arquivos = fs.readdirSync(destino);
    assert.deepEqual(arquivos, ['foto_0.jpg']);
});
```

- [ ] **Step 6: Rodar os testes e confirmar que falham**

Run: `cd D:\syndi_qa && node --test lib/qaSyndi.test.js`
Expected: FAIL — o primeiro teste novo falha porque `aprovarGtin` ainda não aceita/usa
`mockupInfo` (o TXT não é gerado).

- [ ] **Step 7: Atualizar `aprovarGtin`**

Em `lib/qaSyndi.js`, troque a função `aprovarGtin` existente (procure `function aprovarGtin`, por
volta da linha 341-349):

```js
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

por:

```js
function aprovarGtin(agConferenciaDir, agEnvioDir, pastaOsNome, pastaGtinNome, mockupInfo) {
    const origem = path.join(agConferenciaDir, pastaOsNome, pastaGtinNome);
    if (!fs.existsSync(origem)) {
        throw new Error('Pasta do GTIN nao encontrada: ' + origem);
    }
    if (mockupInfo) {
        gravarTxtMockup(origem, pastaGtinNome, mockupInfo.numero, mockupInfo.orientacoes);
    }
    const destino = path.join(agEnvioDir, pastaOsNome, pastaGtinNome);
    moverPasta(origem, destino);
    return { destino };
}
```

- [ ] **Step 8: Rodar os testes de novo e confirmar que passam**

Run: `cd D:\syndi_qa && node --test lib/qaSyndi.test.js`
Expected: todos os testes passam.

- [ ] **Step 9: Escrever os testes que falham pra `carregarOrientacoesMockup`**

Logo depois dos testes de `aprovarGtin` que você acabou de adicionar, adicione:

```js
test('carregarOrientacoesMockup usa default quando nao ha orientacoes-mockup.json', () => {
    const dirTemp = criarDirTemp();
    const resultado = qaSyndi.carregarOrientacoesMockup(dirTemp);
    assert.equal(Array.isArray(resultado), true);
    assert.ok(resultado.length > 0);
});

test('carregarOrientacoesMockup usa valor do arquivo quando presente', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'orientacoes-mockup.json'), JSON.stringify(['Orientacao customizada']));
    const resultado = qaSyndi.carregarOrientacoesMockup(dirTemp);
    assert.deepEqual(resultado, ['Orientacao customizada']);
});

test('carregarOrientacoesMockup cai no default se o JSON estiver corrompido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'orientacoes-mockup.json'), '{ isso nao e json');
    const resultado = qaSyndi.carregarOrientacoesMockup(dirTemp);
    assert.ok(resultado.length > 0);
});
```

- [ ] **Step 10: Rodar os testes e confirmar que falham**

Run: `cd D:\syndi_qa && node --test lib/qaSyndi.test.js`
Expected: FAIL com "qaSyndi.carregarOrientacoesMockup is not a function".

- [ ] **Step 11: Implementar `carregarOrientacoesMockup`**

Em `lib/qaSyndi.js`, logo depois da função `carregarMotivos` (procure `function carregarMotivos`,
por volta da linha 366-375), adicione:

```js
const ORIENTACOES_MOCKUP_DEFAULT = [
    'Usar mockup na cor original',
    'Manter fundo transparente',
    'Aplicar sombra suave',
    'Ajustar proporção pro padrão do mockup'
];

// Lista de orientacoes de mockup e configuravel (orientacoes-mockup.json, versionado, mesmo
// padrao de motivos-retrabalho.json) - se faltar ou estiver corrompido, cai na lista embutida.
// So informa o editor, nunca e gravado no Redmine.
function carregarOrientacoesMockup(basePath) {
    const configPath = path.join(basePath, 'orientacoes-mockup.json');
    if (!fs.existsSync(configPath)) return ORIENTACOES_MOCKUP_DEFAULT.slice();
    try {
        const dados = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return Array.isArray(dados) && dados.length ? dados : ORIENTACOES_MOCKUP_DEFAULT.slice();
    } catch (err) {
        return ORIENTACOES_MOCKUP_DEFAULT.slice();
    }
}
```

- [ ] **Step 12: Rodar os testes de novo e confirmar que passam**

Run: `cd D:\syndi_qa && node --test lib/qaSyndi.test.js`
Expected: todos os testes passam.

- [ ] **Step 13: Exportar as duas novas funções**

Em `lib/qaSyndi.js`, no `module.exports` no final do arquivo, adicione `gravarTxtMockup,` e
`carregarOrientacoesMockup,` à lista já existente (mantenha as demais entradas como estão).

- [ ] **Step 14: Criar o arquivo `orientacoes-mockup.json` versionado**

Crie `D:\syndi_qa\orientacoes-mockup.json` com o conteúdo:

```json
[
    "Usar mockup na cor original",
    "Manter fundo transparente",
    "Aplicar sombra suave",
    "Ajustar proporção pro padrão do mockup"
]
```

- [ ] **Step 15: Atualizar o conteúdo de `motivos-retrabalho.json`**

Substitua o conteúdo de `D:\syndi_qa\motivos-retrabalho.json` (arquivo já existente) por:

```json
[
    "Fotografia tremida",
    "Falta Fotografia",
    "Iluminação / Cor",
    "Angulação errada"
]
```

- [ ] **Step 16: Rodar a suíte inteira e confirmar que passa**

Run: `cd D:\syndi_qa && npm test`
Expected: todos os testes passam (81 anteriores + 7 novos desta task = 88).

- [ ] **Step 17: Commit**

```bash
cd D:\syndi_qa
git add lib/qaSyndi.js lib/qaSyndi.test.js orientacoes-mockup.json motivos-retrabalho.json
git commit -m "feat: gravarTxtMockup/carregarOrientacoesMockup, aprovarGtin aceita mockupInfo, motivos-retrabalho espelha cf_187"
```

---

### Task 2: `server.js` — validar número obrigatório e montar `mockupInfo`

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `qaSyndi.gravarTxtMockup`, `qaSyndi.carregarOrientacoesMockup`, `qaSyndi.aprovarGtin`
  com o 5º parâmetro `mockupInfo` (Task 1). `qaSyndi.listarImagensGtin(pastaGtinPath).destino`
  (já existe, devolve `'Mockup' | 'Recorte' | null`).
- Produces: `POST /api/aprovar` responde `400` quando o destino do GTIN é Mockup e
  `numeroMockup` vier vazio. Nova rota `GET /api/orientacoes-mockup`.

- [ ] **Step 1: Nova rota `GET /api/orientacoes-mockup`**

Em `server.js`, logo depois da rota `GET /api/motivos` existente (procure
`req.url === '/api/motivos'`, por volta da linha 461-464), adicione:

```js
    if (req.method === 'GET' && req.url === '/api/orientacoes-mockup') {
        enviarJson(res, 200, { ok: true, orientacoes: qaSyndi.carregarOrientacoesMockup(BASE_PATH) });
        return;
    }
```

- [ ] **Step 2: Validar número do mockup e montar `mockupInfo` em `POST /api/aprovar`**

Em `server.js`, dentro do handler de `/api/aprovar`, logo depois do bloco que resolve
`pastaGtinNome` (procure `GTIN nao encontrado nesta OS`, por volta das linhas 368-372) e ANTES do
comentário `// Grava Responsavel/Quantidades/identidade ANTES de mover` (linha 373), adicione:

```js
            const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
            const destinoAtual = qaSyndi.listarImagensGtin(pastaGtinPath).destino;
            let mockupInfo;
            if (destinoAtual === 'Mockup') {
                const numeroMockup = typeof dados.numeroMockup === 'string' ? dados.numeroMockup.trim() : '';
                if (!numeroMockup) {
                    enviarJson(res, 400, { ok: false, error: 'Numero do Mockup e obrigatorio quando o destino e Mockup' });
                    return;
                }
                const orientacoesMockup = Array.isArray(dados.orientacoesMockup)
                    ? dados.orientacoesMockup.filter(o => typeof o === 'string')
                    : [];
                mockupInfo = { numero: numeroMockup, orientacoes: orientacoesMockup };
            }
```

- [ ] **Step 3: Repassar `mockupInfo` pra `aprovarGtin`**

Na mesma rota, troque a chamada existente (procure `qaSyndi.aprovarGtin(qaSyndi.AGCONFERENCIA`,
por volta da linha 390):

```js
                const resultado = qaSyndi.aprovarGtin(qaSyndi.AGCONFERENCIA, qaSyndi.AGENVIO, pastaOsNome, pastaGtinNome);
```

por:

```js
                const resultado = qaSyndi.aprovarGtin(qaSyndi.AGCONFERENCIA, qaSyndi.AGENVIO, pastaOsNome, pastaGtinNome, mockupInfo);
```

- [ ] **Step 4: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check server.js`
Expected: sem saída (exit code 0).

- [ ] **Step 5: Verificação manual via curl**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. `curl -s http://localhost:3001/api/orientacoes-mockup` — esperado: `{"ok":true,"orientacoes":[...]}`
   com as 4 orientações do `orientacoes-mockup.json`.
3. `curl -s http://localhost:3001/api/motivos` — esperado: `{"ok":true,"motivos":["Fotografia tremida","Falta Fotografia","Iluminação / Cor","Angulação errada"]}`.
4. Com um GTIN de teste real que tenha destino=Mockup marcado (ou marque um via
   `POST /api/marcar-destino`), tente `POST /api/aprovar` sem `numeroMockup` no corpo — esperado:
   `400` com a mensagem "Numero do Mockup e obrigatorio quando o destino e Mockup".
5. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 6: Commit**

```bash
cd D:\syndi_qa
git add server.js
git commit -m "feat: valida numero do mockup obrigatorio, nova rota GET /api/orientacoes-mockup"
```

---

### Task 3: Front-end — campos de mockup no painel de envio

**Files:**
- Modify: `js/qa.js`
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: `GET /api/orientacoes-mockup`, `POST /api/aprovar` aceitando
  `numeroMockup`/`orientacoesMockup` no corpo (Task 2).
- Produces: estado `orientacoesMockup`, `formEnvio.numeroMockup`, `formEnvio.orientacoesMockup`
  e função `togglarOrientacaoMockup(orientacao)`, expostos no `return` do `setup()`.

- [ ] **Step 1: Estado e carregamento das orientações em `js/qa.js`**

Logo depois da declaração `const opcoesResponsavel = ref({});` (por volta da linha 59-60),
adicione:

```js
        const orientacoesMockup = ref([]);
```

Logo depois da função `carregarMotivosDisponiveis` (por volta das linhas 107-115), adicione:

```js
        async function carregarOrientacoesMockupDisponiveis() {
            try {
                const resp = await fetch(API + '/api/orientacoes-mockup');
                const dados = await resp.json();
                if (dados.ok) orientacoesMockup.value = dados.orientacoes;
            } catch (err) {
                console.error('Erro ao carregar orientacoes de mockup:', err);
            }
        }
```

Logo depois da linha `carregarMotivosDisponiveis();` (procure essa chamada direta, por volta da
linha 671, perto do final do `setup()`, antes do `return`), adicione:

```js
        carregarOrientacoesMockupDisponiveis();
```

- [ ] **Step 2: Campos novos em `formEnvio` e função de toggle**

Encontre a declaração `const formEnvio = reactive({ responsavel: '', qtdRecorte: '', qtdMockup: '' });`
(por volta da linha 49) e troque por:

```js
        const formEnvio = reactive({ responsavel: '', qtdRecorte: '', qtdMockup: '', numeroMockup: '', orientacoesMockup: [] });
```

Logo depois da função `togglarMotivoAtivo` (por volta das linhas 433-442), adicione:

```js
        // Toggle de orientacao de mockup - local ao formEnvio (nao vai ao servidor ate o
        // Aprovar ser confirmado), mesmo principio do togglarMotivoAtivo mas sem o
        // agrupamento por foto (mockup e por GTIN, nao por foto individual).
        function togglarOrientacaoMockup(orientacao) {
            const idx = formEnvio.orientacoesMockup.indexOf(orientacao);
            if (idx === -1) formEnvio.orientacoesMockup.push(orientacao); else formEnvio.orientacoesMockup.splice(idx, 1);
        }
```

- [ ] **Step 3: Reset dos campos ao abrir o painel de envio e ao trocar de GTIN**

Encontre a função `abrirPainelEnvio` (por volta da linha 455-480) e, dentro do bloco `try`, logo
depois das linhas que já preenchem `formEnvio.responsavel`/`formEnvio.qtdRecorte`/
`formEnvio.qtdMockup` (procure `formEnvio.qtdMockup = dados.campos.qtdMockup || '';`), adicione
logo em seguida:

```js
                formEnvio.numeroMockup = '';
                formEnvio.orientacoesMockup = [];
```

- [ ] **Step 4: Validação obrigatória e envio no corpo, em `aprovarGtin`**

Encontre a função `aprovarGtin` (por volta da linha 486-519, já modificada pela feature de
identidade — ela já tem um bloqueio de `analistaId` no início). Logo depois do bloqueio de
identidade existente:

```js
            if (!analistaId.value) {
                erro.value = 'Identidade nao configurada! Clique no icone de engrenagem.';
                return;
            }
```

adicione um novo bloqueio:

```js
            if (detalhe.value && detalhe.value.imagens.destino === 'Mockup' && !formEnvio.numeroMockup.trim()) {
                erro.value = 'Numero do Mockup e obrigatorio quando o destino e Mockup.';
                return;
            }
```

Depois, no corpo do `fetch` de `/api/aprovar` (já modificado pela feature de identidade, que
adicionou `userId: analistaId.value`), acrescente `numeroMockup`/`orientacoesMockup`:

```js
                const resp = await fetch(API + '/api/aprovar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os: selecionado.value.os,
                        gtin: selecionado.value.gtin,
                        responsavel: String(formEnvio.responsavel || ''),
                        qtdRecorte: String(formEnvio.qtdRecorte || ''),
                        qtdMockup: String(formEnvio.qtdMockup || ''),
                        userId: analistaId.value,
                        numeroMockup: formEnvio.numeroMockup.trim(),
                        orientacoesMockup: formEnvio.orientacoesMockup
                    })
                });
```

- [ ] **Step 5: Expor no `return` do `setup()`**

No `return` final de `js/qa.js`, adicione `orientacoesMockup, togglarOrientacaoMockup,` — pode
entrar logo depois de `painelEnvio, preparandoEnvio, formEnvio, opcoesResponsavel,
abrirPainelEnvio, fecharPainelEnvio,` (mantenha essa linha como está, só acrescente as duas novas
entradas em seguida, na mesma linha ou na próxima).

- [ ] **Step 6: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: sem saída (exit code 0).

- [ ] **Step 7: Campos novos no painel de envio, `syndi_qa.html`**

Encontre o bloco do campo "Qtd Imagens Mockup" dentro do painel `qa-editadas-recebidas`:

```html
                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Qtd Imagens Mockup</span>
                                <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="formEnvio.qtdMockup">
                            </div>
```

Logo depois desse bloco (ainda dentro do `<div v-if="painelEnvio" class="qa-editadas-recebidas">`,
antes do botão "Confirmar e Enviar"), adicione:

```html
                            <template v-if="detalhe.imagens.destino === 'Mockup'">
                                <div class="qa-campo-linha">
                                    <span class="qa-campo-label">Número do Mockup</span>
                                    <input type="text" class="form-control form-control-sm" style="width:160px" v-model="formEnvio.numeroMockup" placeholder="ex.: MK-042">
                                </div>
                                <div class="qa-motivos-painel">
                                    <div class="qa-motivos-titulo">Orientações pro editor (opcional)</div>
                                    <div class="qa-motivos">
                                        <label v-for="orientacao in orientacoesMockup" :key="orientacao" class="qa-motivo-item">
                                            <input type="checkbox" :checked="formEnvio.orientacoesMockup.includes(orientacao)" @change="togglarOrientacaoMockup(orientacao)"> {{ orientacao }}
                                        </label>
                                    </div>
                                </div>
                            </template>
```

- [ ] **Step 8: Verificação manual end-to-end**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. No navegador: abra um GTIN de teste, marque o destino "Mockup" (botão já existente), clique
   "Aprovar GTIN" — confirme que aparecem os campos "Número do Mockup" e o painel de orientações.
3. Tente confirmar sem preencher o número — confirme que aparece o aviso e nenhuma requisição de
   rede é feita (aba Network do DevTools).
4. Preencha um número, marque 1-2 orientações, confirme — confirme que aprova normalmente e que
   um arquivo `Mockup_<gtin>.txt` aparece dentro da pasta do GTIN em `AgEnvio`, com o número e as
   orientações marcadas.
5. Abra a mesma tela pra um GTIN SEM destino Mockup — confirme que os campos novos NÃO aparecem e
   Aprovar continua funcionando normalmente.
6. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 9: Commit**

```bash
cd D:\syndi_qa
git add js/qa.js syndi_qa.html
git commit -m "feat: campos de numero do mockup e orientacoes no painel de Aprovar GTIN"
```

---

## Post-plan: update memory

Depois deste plano implementado e mergeado, atualizar
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md`: documentar o TXT de
mockup (formato, onde é gravado, que segue junto pra `AgEnvio`), a mudança de conteúdo de
`motivos-retrabalho.json` (agora espelha `cf_187`, não mais genérico) e a tentativa (documentada
no spec) de consulta viva ao Redmine que falhou por falta de permissão de admin — útil pra não
repetir a mesma investigação se o assunto voltar no futuro. Isso é uma atualização de memória, não
uma tarefa de código — fazer na conversa de finalização, não como step do plano.
