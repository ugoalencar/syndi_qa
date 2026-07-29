# Campos QA Imagem + 3º Check na aba Edição Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a aba "QA para Edição" ganha 2 campos editáveis novos — Responsável QA Imagem (`cf_85`)
e Responsável 3º Check (`cf_172`) — no mesmo padrão dos 4 já existentes; a gravação automática de
`cf_85` via identidade do analista logado é removida especificamente desta aba (vira um dropdown
manual), sem afetar Aprovar nem Retrabalho.

**Architecture:** back-end (`lib/redmine.js`) ganha a constante `CF_RESPONSAVEL_3_CHECK` e
`montarCamposEdicaoCompleto`/`buscarDetalheEdicao` passam a lidar com os 2 campos novos;
`server.js` lê os 2 campos do corpo da requisição; front-end (`js/qa.js` + `syndi_qa.html`) ganha
2 dropdowns novos, reaproveitando a infraestrutura genérica já existente (`CAMPOS_EDICAO_IDS`).

**Tech Stack:** Node.js core (`node:test`, `fetch` global), Vue 3 (sem build).

## Global Constraints

- Node.js core-only + Vue 3, sem build, sem CDN — nenhuma dependência nova.
- Comentários em código: português sem acento, explicando o PORQUÊ.
- `montarCamposEdicao` (usada só pelo Aprovar) e `marcarRetrabalhoFotografia` (usada só pelo
  Retrabalho) NÃO mudam nesta feature — continuam gravando `cf_85` automaticamente via `userId`.
- Só `montarCamposEdicaoCompleto` (aba QA para Edição) muda: `campos.userId` deixa de virar
  `cf_85` nessa função — em vez disso, `campos.responsavelQaImagem` (novo) vira `cf_85` e
  `campos.responsavel3Check` (novo) vira `cf_172`.
- O bloqueio "precisa identidade configurada" em `POST /api/edicao/gravar` (client + server) NÃO
  muda — continua obrigatório pra gravar qualquer coisa nessa aba, só o PUT em si deixa de incluir
  `cf_85` automaticamente.
- `cf_85 = 85` já existe como `CF_RESPONSAVEL_QA_IMAGEM` em `lib/redmine.js`. `cf_172 = 172` é
  novo, nome da constante: `CF_RESPONSAVEL_3_CHECK`.

---

### Task 1: `lib/redmine.js` — constante, `montarCamposEdicaoCompleto` e `buscarDetalheEdicao`

**Files:**
- Modify: `lib/redmine.js`
- Test: `lib/redmine.test.js`

**Interfaces:**
- Consumes: nada de tarefas anteriores (primeira tarefa do plano).
- Produces: `montarCamposEdicaoCompleto(campos)` — aceita `campos.responsavelQaImagem` (→ `cf_85`)
  e `campos.responsavel3Check` (→ `cf_172`); NÃO usa mais `campos.userId`. `buscarDetalheEdicao`
  devolve `customFields` com as chaves `'85'` e `'172'` também.

- [ ] **Step 1: Escrever os testes que falham**

Em `lib/redmine.test.js`, encontre o teste `'montarCamposEdicaoCompleto mapeia os 4 campos,
incluindo situacao'` (procure esse texto) e adicione, logo depois dos testes existentes de
`montarCamposEdicaoCompleto` (depois do teste `'montarCamposEdicaoCompleto devolve vazio quando
nada foi preenchido'`), estes 3 testes novos:

```js
test('montarCamposEdicaoCompleto inclui cf_85 e cf_172 quando os campos novos vem preenchidos', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '85', responsavelQaImagem: '15', responsavel3Check: '34' });
    assert.deepEqual(lista, [
        { id: 15, value: '85' },
        { id: 85, value: '15' },
        { id: 172, value: '34' }
    ]);
});

test('montarCamposEdicaoCompleto NAO usa mais userId pra cf_85 (campo removido desta funcao)', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '85', userId: '15' });
    assert.deepEqual(lista, [{ id: 15, value: '85' }]);
});

test('montarCamposEdicaoCompleto pula responsavelQaImagem/responsavel3Check quando vazios', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ responsavelQaImagem: '', responsavel3Check: '' });
    assert.deepEqual(lista, []);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: FAIL — o primeiro teste falha porque `cf_172`/`CF_RESPONSAVEL_3_CHECK` ainda não
existem; o segundo falha porque hoje `userId` AINDA vira `cf_85` (o teste espera que pare de
virar).

- [ ] **Step 3: Adicionar a constante `CF_RESPONSAVEL_3_CHECK`**

Em `lib/redmine.js`, logo depois da linha `const CF_RESPONSAVEL_QA_IMAGEM = 85;` (procure esse
texto, por volta da linha 55), adicione:

```js
// cf_172 "Responsavel 3o Check Imagem" - processo posterior de outra equipe, editavel na aba
// QA para Edicao junto com os demais campos (ver docs/superpowers/specs/
// 2026-07-28-syndi-qa-campos-edicao-3check-design.md).
const CF_RESPONSAVEL_3_CHECK = 172;
```

- [ ] **Step 4: Atualizar `montarCamposEdicaoCompleto`**

Troque a função `montarCamposEdicaoCompleto` existente (procure `function
montarCamposEdicaoCompleto`, por volta da linha 184-191):

```js
function montarCamposEdicaoCompleto(campos) {
    const lista = [];
    if (campos.situacao) lista.push({ id: CF_SITUACAO_IMAGENS, value: String(campos.situacao) });
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    if (campos.userId) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.userId) });
    return lista;
}
```

por:

```js
function montarCamposEdicaoCompleto(campos) {
    const lista = [];
    if (campos.situacao) lista.push({ id: CF_SITUACAO_IMAGENS, value: String(campos.situacao) });
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    if (campos.responsavelQaImagem) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.responsavelQaImagem) });
    if (campos.responsavel3Check) lista.push({ id: CF_RESPONSAVEL_3_CHECK, value: String(campos.responsavel3Check) });
    return lista;
}
```

Nota: `campos.userId` NÃO entra mais nesta função de propósito — o campo `cf_85` vira comum, só
gravado se `responsavelQaImagem` vier preenchido (dropdown manual, Task 3). `montarCamposEdicao`
(função irmã, usada só pelo Aprovar) e `marcarRetrabalhoFotografia` continuam intocadas, ainda
usando `userId` pra `cf_85` como já funcionava.

- [ ] **Step 5: Rodar os testes de novo e confirmar que passam**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: os 3 testes novos passam, e todos os testes já existentes continuam passando (os
testes antigos de `montarCamposEdicaoCompleto` não usam `userId`, então não são afetados).

- [ ] **Step 6: Escrever o teste que falha pra `buscarDetalheEdicao`**

Este arquivo nunca mockou `fetch` pra `buscarDetalheEdicao` diretamente antes (só pra
`marcarRetrabalhoFotografia`, adicionado numa feature anterior). Adicione, no FINAL de
`lib/redmine.test.js`:

```js
test('buscarDetalheEdicao traz os campos 85 e 172 no customFields devolvido', async () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'redmine-config.json'), JSON.stringify({ baseUrl: 'https://redmine.exemplo.com', apiKey: 'chave123' }));

    const fetchOriginal = global.fetch;
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            issues: [{
                id: 999,
                updated_on: '2026-07-28T10:00:00Z',
                custom_fields: [
                    { id: 85, value: '15' },
                    { id: 172, value: '34' }
                ]
            }]
        })
    });

    try {
        const resultado = await redmine.buscarDetalheEdicao(dirTemp, '7898133020049');
        assert.equal(resultado.issue.customFields['85'], '15');
        assert.equal(resultado.issue.customFields['172'], '34');
    } finally {
        global.fetch = fetchOriginal;
    }
});
```

- [ ] **Step 7: Rodar o teste e confirmar que falha**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: FAIL — `resultado.issue.customFields['85']`/`['172']` vêm `undefined`, já que
`buscarDetalheEdicao` ainda não lê esses dois campos.

- [ ] **Step 8: Atualizar `buscarDetalheEdicao`**

Encontre a função `buscarDetalheEdicao` (procure `function buscarDetalheEdicao`, por volta da
linha 143-158):

```js
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
```

troque por:

```js
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
                '176': valorCfEdicao(issue, CF_QTD_IMAGENS_RECORTE),
                '85': valorCfEdicao(issue, CF_RESPONSAVEL_QA_IMAGEM),
                '172': valorCfEdicao(issue, CF_RESPONSAVEL_3_CHECK)
            }
        }
    };
}
```

- [ ] **Step 9: Rodar os testes de novo e confirmar que passam**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: todos os testes passam.

- [ ] **Step 10: Rodar a suíte inteira**

Run: `cd D:\syndi_qa && npm test`
Expected: todos os testes passam (81 anteriores + 4 novos desta task = 85).

- [ ] **Step 11: Commit**

```bash
cd D:\syndi_qa
git add lib/redmine.js lib/redmine.test.js
git commit -m "feat: cf_172 (Responsavel 3 Check), remove uso de userId pra cf_85 em montarCamposEdicaoCompleto"
```

---

### Task 2: `server.js` — ler os 2 campos novos do corpo da requisição

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `redmine.gravarCamposEdicaoCompleto(basePath, gtin, campos)` com `campos` aceitando
  `responsavelQaImagem`/`responsavel3Check` (Task 1).
- Produces: `POST /api/edicao/gravar` passa a ler `responsavelQaImagem`/`responsavel3Check` do
  corpo e repassar pra `redmine.gravarCamposEdicaoCompleto`.

- [ ] **Step 1: Ler os 2 campos novos e parar de repassar `userId` pro objeto `campos`**

Em `server.js`, dentro do handler de `POST /api/edicao/gravar` (procure `req.url ===
'/api/edicao/gravar'`), encontre este bloco (por volta das linhas 501-510):

```js
            const situacao = typeof dados.situacao === 'string' ? dados.situacao.trim() : '';
            const responsavel = typeof dados.responsavel === 'string' ? dados.responsavel.trim() : '';
            const qtdRecorte = typeof dados.qtdRecorte === 'string' ? dados.qtdRecorte.trim() : '';
            const qtdMockup = typeof dados.qtdMockup === 'string' ? dados.qtdMockup.trim() : '';
            if (!/^\d*$/.test(situacao) || !/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup)) {
                enviarJson(res, 400, { ok: false, error: 'situacao/responsavel/qtdRecorte/qtdMockup devem ser numericos ou vazios' });
                return;
            }
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
            try {
                const resultado = await redmine.gravarCamposEdicaoCompleto(BASE_PATH, gtin, { situacao, responsavel, qtdRecorte, qtdMockup, userId });
                enviarJson(res, 200, { ok: true, gravado: resultado.gravado, issueId: resultado.issueId || null, idsGravados: resultado.idsGravados || [] });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
```

troque por:

```js
            const situacao = typeof dados.situacao === 'string' ? dados.situacao.trim() : '';
            const responsavel = typeof dados.responsavel === 'string' ? dados.responsavel.trim() : '';
            const qtdRecorte = typeof dados.qtdRecorte === 'string' ? dados.qtdRecorte.trim() : '';
            const qtdMockup = typeof dados.qtdMockup === 'string' ? dados.qtdMockup.trim() : '';
            if (!/^\d*$/.test(situacao) || !/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup)) {
                enviarJson(res, 400, { ok: false, error: 'situacao/responsavel/qtdRecorte/qtdMockup devem ser numericos ou vazios' });
                return;
            }
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
            // userId so serve pro bloqueio acima (identidade obrigatoria pra gravar QUALQUER
            // coisa nesta aba) - NAO entra mais no objeto campos, cf_85 virou um dropdown
            // manual comum (responsavelQaImagem), igual aos outros campos do formulario.
            const responsavelQaImagem = typeof dados.responsavelQaImagem === 'string' ? dados.responsavelQaImagem.trim() : '';
            const responsavel3Check = typeof dados.responsavel3Check === 'string' ? dados.responsavel3Check.trim() : '';
            try {
                const resultado = await redmine.gravarCamposEdicaoCompleto(BASE_PATH, gtin, { situacao, responsavel, qtdRecorte, qtdMockup, responsavelQaImagem, responsavel3Check });
                enviarJson(res, 200, { ok: true, gravado: resultado.gravado, issueId: resultado.issueId || null, idsGravados: resultado.idsGravados || [] });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
```

- [ ] **Step 2: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check server.js`
Expected: sem saída (exit code 0).

- [ ] **Step 3: Rodar a suíte inteira**

Run: `cd D:\syndi_qa && npm test`
Expected: todos os testes continuam passando (nenhum teste de `server.js` isolado neste projeto,
mas confirma que nada em `lib/` quebrou).

- [ ] **Step 4: Verificação manual via curl**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. Com um GTIN de teste real que tenha ficha aberta no Redmine, grave com
   `responsavelQaImagem`/`responsavel3Check` preenchidos (`curl -X POST
   http://localhost:3001/api/edicao/gravar -H "Content-Type: application/json" -d
   "{\"os\":\"<os>\",\"gtin\":\"<gtin>\",\"userId\":\"15\",\"responsavelQaImagem\":\"15\",\"responsavel3Check\":\"34\"}"`)
   — esperado: `{"ok":true,"gravado":true,...}`, confirme no Redmine (ou via
   `GET /api/edicao/detalhe`) que cf_85 e cf_172 foram atualizados pros valores enviados.
3. Grave sem `userId` no corpo — esperado: `400` com a mensagem de identidade obrigatória (o
   bloqueio continua intacto).
4. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 5: Commit**

```bash
cd D:\syndi_qa
git add server.js
git commit -m "feat: rota /api/edicao/gravar le responsavelQaImagem/responsavel3Check, para de usar userId pra cf_85"
```

---

### Task 3: Front-end — 2 dropdowns novos na aba QA para Edição

**Files:**
- Modify: `js/qa.js`
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: `GET /redmine-campos.json` já servido estaticamente (opções de `cf_85`/`cf_172`
  ficam em `dados.campos.cf_85.opcoes`/`dados.campos.cf_172.opcoes`). `POST /api/edicao/gravar`
  aceitando `responsavelQaImagem`/`responsavel3Check` no corpo (Task 2).
- Produces: estado `opcoesResponsavelQaImagem`, `opcoesResponsavel3Check`, expostos no `return`
  do `setup()`.

- [ ] **Step 1: `CAMPOS_EDICAO_IDS` ganha os 2 ids novos**

Em `js/qa.js`, troque a linha (procure `const CAMPOS_EDICAO_IDS`, por volta da linha 74):

```js
        const CAMPOS_EDICAO_IDS = ['15', '23', '176', '175'];
```

por:

```js
        const CAMPOS_EDICAO_IDS = ['15', '23', '176', '175', '85', '172'];
```

Isso já faz `aplicarDetalheEdicao` e `selecionarGtin` (que já iteram genericamente sobre
`CAMPOS_EDICAO_IDS`) tratarem os 2 campos novos automaticamente — sem sugestão local (não estão
em `CHAVE_SUGERIDO_EDICAO`, então caem sempre no ramo "sem sugestão, limpa o campo" quando o
Redmine não tem valor pra eles, exatamente o comportamento pedido no spec).

- [ ] **Step 2: Estado das novas opções e carregamento**

Logo depois de `const opcoesResponsavel = ref({});` (por volta da linha 59-60), adicione:

```js
        const opcoesResponsavelQaImagem = ref({});
        const opcoesResponsavel3Check = ref({});
```

Encontre a função `carregarOpcoesResponsavel` (por volta das linhas 117-124):

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

troque por:

```js
        async function carregarOpcoesResponsavel() {
            try {
                const resp = await fetch(API + '/redmine-campos.json');
                const dados = await resp.json();
                opcoesResponsavel.value = dados.campos.cf_23.opcoes;
                opcoesSituacao.value = dados.campos.cf_15.opcoes;
                opcoesResponsavelQaImagem.value = dados.campos.cf_85.opcoes;
                opcoesResponsavel3Check.value = dados.campos.cf_172.opcoes;
            } catch (err) {
                console.error('Erro ao carregar redmine-campos.json:', err);
            }
        }
```

- [ ] **Step 3: Enviar os 2 campos novos no corpo de `confirmarEnvioEdicao`**

Encontre a função `confirmarEnvioEdicao` (por volta das linhas 210-234) e troque o corpo do
`fetch`:

```js
                const resp = await fetch(API + '/api/edicao/gravar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os,
                        gtin,
                        situacao: String(camposEdicao['15'] || ''),
                        responsavel: String(camposEdicao['23'] || ''),
                        qtdRecorte: String(camposEdicao['176'] || ''),
                        qtdMockup: String(camposEdicao['175'] || ''),
                        userId: analistaId.value
                    })
                });
```

por:

```js
                const resp = await fetch(API + '/api/edicao/gravar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os,
                        gtin,
                        situacao: String(camposEdicao['15'] || ''),
                        responsavel: String(camposEdicao['23'] || ''),
                        qtdRecorte: String(camposEdicao['176'] || ''),
                        qtdMockup: String(camposEdicao['175'] || ''),
                        userId: analistaId.value,
                        responsavelQaImagem: String(camposEdicao['85'] || ''),
                        responsavel3Check: String(camposEdicao['172'] || '')
                    })
                });
```

- [ ] **Step 4: `NOMES_CAMPO_EDICAO` ganha os 2 rótulos novos**

Ainda em `confirmarEnvioEdicao`, encontre a linha (procure `const NOMES_CAMPO_EDICAO`):

```js
                    const NOMES_CAMPO_EDICAO = { '15': 'Situação', '23': 'Responsável', '176': 'Qtd Recorte', '175': 'Qtd Mockup' };
```

troque por:

```js
                    const NOMES_CAMPO_EDICAO = { '15': 'Situação', '23': 'Responsável', '176': 'Qtd Recorte', '175': 'Qtd Mockup', '85': 'Responsável QA Imagem', '172': 'Responsável 3º Check' };
```

- [ ] **Step 5: Expor no `return` do `setup()`**

No `return` final de `js/qa.js`, encontre a linha `mensagemEdicao, enviandoEdicao,
semFichaEdicao, opcoesSituacao,` e troque por:

```js
            mensagemEdicao, enviandoEdicao, semFichaEdicao, opcoesSituacao,
            opcoesResponsavelQaImagem, opcoesResponsavel3Check,
```

- [ ] **Step 6: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: sem saída (exit code 0).

- [ ] **Step 7: 2 dropdowns novos em `syndi_qa.html`**

Encontre o bloco do campo "Qtd Imagens Mockup" dentro da aba "QA para Edição" (`v-show="abaDetalhe
=== 'edicao'"`) — é o último dos 4 campos existentes, com `v-model="camposEdicao['175']"`. Logo
depois desse bloco (e antes de qualquer botão "Gravar" que vier em seguida), adicione:

```html
                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Responsável QA Imagem</span>
                                <select class="form-select form-select-sm w-auto" v-model="camposEdicao['85']" @change="marcarTocadoEdicao('85')">
                                    <option value="">-</option>
                                    <option v-for="(rotulo, id) in opcoesResponsavelQaImagem" :key="id" :value="id">{{ rotulo }}</option>
                                </select>
                                <span class="qa-campo-origem" :class="origemCampoEdicao['85']">{{ origemCampoEdicao['85'] }}</span>
                            </div>
                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Responsável 3º Check</span>
                                <select class="form-select form-select-sm w-auto" v-model="camposEdicao['172']" @change="marcarTocadoEdicao('172')">
                                    <option value="">-</option>
                                    <option v-for="(rotulo, id) in opcoesResponsavel3Check" :key="id" :value="id">{{ rotulo }}</option>
                                </select>
                                <span class="qa-campo-origem" :class="origemCampoEdicao['172']">{{ origemCampoEdicao['172'] }}</span>
                            </div>
```

- [ ] **Step 8: Verificação manual end-to-end**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. No navegador: abra um GTIN de teste na aba "QA para Edição" — confirme que os 2 selects novos
   aparecem, populados com as opções certas (Responsável QA Imagem: Ugo Alencar/Nelyana
   Girardi/etc.; Responsável 3º Check: lista maior de nomes).
3. Escolha um valor em cada um dos 2 novos, clique "Gravar" — confirme que a mensagem "Gravado no
   Redmine: ..." inclui "Responsável QA Imagem"/"Responsável 3º Check" (não os ids crus 85/172).
4. Recarregue a página, volte pro mesmo GTIN — confirme que os valores gravados aparecem
   pré-preenchidos, com o badge "manual" (vieram do Redmine).
5. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 9: Commit**

```bash
cd D:\syndi_qa
git add js/qa.js syndi_qa.html
git commit -m "feat: dropdowns de Responsavel QA Imagem e Responsavel 3 Check na aba QA para Edicao"
```

---

## Post-plan: update memory

Depois deste plano implementado e mergeado, atualizar
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md`: documentar os 2
campos novos na aba QA para Edição e, principalmente, a mudança de comportamento de `cf_85` —
deixou de ser gravado automaticamente via identidade NESSA aba especificamente (continua
automático em Aprovar/Retrabalho) — pra não confundir uma investigação futura sobre por que os
dois caminhos de gravação de `cf_85` divergem. Isso é uma atualização de memória, não uma tarefa
de código — fazer na conversa de finalização, não como step do plano.
