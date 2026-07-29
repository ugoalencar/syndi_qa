# Campos Idênticos entre Aprovar e QA para Edição Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o painel "Enviar para Edição" (Aprovar GTIN) ganha os mesmos 2 campos que já existem
na aba "QA para Edição" — Responsável QA Imagem e Responsável 3º Check — pra resolver o caso
comum (editar tudo e aprovar) numa aba só, sem precisar trocar de aba.

**Architecture:** mesmo padrão já usado quando esses 2 campos foram adicionados à aba Edição
(sub-projeto anterior) — `lib/redmine.js` para de usar `userId` pra `cf_85` em
`montarCamposEdicao` (só essa função, a irmã `montarCamposEdicaoCompleto` já não usa desde o
sub-projeto anterior), `server.js` lê os 2 campos novos do corpo de `/api/aprovar`, front-end
ganha os 2 dropdowns no painel de envio.

**Tech Stack:** Node.js core (`node:test`), Vue 3 (sem build).

## Global Constraints

- Node.js core-only + Vue 3, sem build.
- Comentários em código: português sem acento, explicando o PORQUÊ.
- `marcarRetrabalhoFotografia` (usada só pelo Retrabalho) NÃO muda nesta feature — continua
  gravando `cf_85` automaticamente via `userId`, exatamente como hoje.
- Só `montarCamposEdicao` (usada só pelo Aprovar) muda: `campos.userId` deixa de virar `cf_85` —
  em vez disso, `campos.responsavelQaImagem` (novo) vira `cf_85` e `campos.responsavel3Check`
  (novo) vira `cf_172`.
- O bloqueio "precisa identidade configurada" em `POST /api/aprovar` (client + server) NÃO muda —
  continua obrigatório pra poder aprovar qualquer coisa, só o PUT em si deixa de incluir `cf_85`
  automaticamente.
- Os 2 campos novos no painel de Aprovar nascem SEMPRE VAZIOS ao abrir (sem consultar o Redmine
  antes — `abrirPainelEnvio`/`GET /api/aprovar/preparar` continuam só lendo a pasta local).
- `cf_85 = 85` (`CF_RESPONSAVEL_QA_IMAGEM`) e `cf_172 = 172` (`CF_RESPONSAVEL_3_CHECK`) já
  existem em `lib/redmine.js` (não precisam ser recriados).

---

### Task 1: `lib/redmine.js` — `montarCamposEdicao` para de usar `userId` pra `cf_85`

**Files:**
- Modify: `lib/redmine.js`
- Test: `lib/redmine.test.js`

**Interfaces:**
- Consumes: nada de tarefas anteriores (primeira tarefa do plano).
- Produces: `montarCamposEdicao(campos)` — aceita `campos.responsavelQaImagem` (→ `cf_85`) e
  `campos.responsavel3Check` (→ `cf_172`); NÃO usa mais `campos.userId`.

- [ ] **Step 1: Escrever os testes que falham**

Em `lib/redmine.test.js`, encontre os 2 testes existentes que usam `userId` com
`montarCamposEdicao` (procure `'montarCamposEdicao inclui cf_85 quando userId presente'` e
`'montarCamposEdicao nao inclui cf_85 quando userId ausente'`, por volta das linhas 50-63):

```js
test('montarCamposEdicao inclui cf_85 quando userId presente', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32', qtdRecorte: '3', qtdMockup: '5', userId: '15' });
    assert.deepEqual(lista, [
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' },
        { id: 85, value: '15' }
    ]);
});

test('montarCamposEdicao nao inclui cf_85 quando userId ausente', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32' });
    assert.deepEqual(lista, [{ id: 23, value: '32' }]);
});
```

Troque os 2 testes acima por estes 3 (o comportamento de `userId` mudou, então os testes que o
verificavam precisam ser adaptados, mesma situação já resolvida antes em
`montarCamposEdicaoCompleto`):

```js
test('montarCamposEdicao inclui cf_85 e cf_172 quando os campos novos vem preenchidos', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32', qtdRecorte: '3', qtdMockup: '5', responsavelQaImagem: '15', responsavel3Check: '34' });
    assert.deepEqual(lista, [
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' },
        { id: 85, value: '15' },
        { id: 172, value: '34' }
    ]);
});

test('montarCamposEdicao NAO usa mais userId pra cf_85 (campo removido desta funcao)', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32', userId: '15' });
    assert.deepEqual(lista, [{ id: 23, value: '32' }]);
});

test('montarCamposEdicao pula responsavelQaImagem/responsavel3Check quando vazios', () => {
    const lista = redmine.montarCamposEdicao({ responsavelQaImagem: '', responsavel3Check: '' });
    assert.deepEqual(lista, []);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: FAIL — o primeiro teste novo falha porque `cf_172` ainda não é gerado por
`montarCamposEdicao` (só existe em `montarCamposEdicaoCompleto`); o segundo falha porque `userId`
AINDA vira `cf_85` hoje (o teste espera que pare de virar).

- [ ] **Step 3: Atualizar `montarCamposEdicao`**

Em `lib/redmine.js`, troque a função `montarCamposEdicao` existente (procure `function
montarCamposEdicao`, por volta da linha 97-104):

```js
function montarCamposEdicao(campos) {
    const lista = [];
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    if (campos.userId) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.userId) });
    return lista;
}
```

por:

```js
function montarCamposEdicao(campos) {
    const lista = [];
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    if (campos.responsavelQaImagem) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.responsavelQaImagem) });
    if (campos.responsavel3Check) lista.push({ id: CF_RESPONSAVEL_3_CHECK, value: String(campos.responsavel3Check) });
    return lista;
}
```

Nota: `campos.userId` NÃO entra mais nesta função de propósito — `cf_85` vira comum, só gravado
se `responsavelQaImagem` vier preenchido (dropdown manual, Task 3). `marcarRetrabalhoFotografia`
continua intocada, ainda usando `userId` pra `cf_85` como já funcionava.

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd D:\syndi_qa && node --test lib/redmine.test.js`
Expected: os 3 testes novos passam, e todos os testes já existentes continuam passando.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd D:\syndi_qa && npm test`
Expected: todos os testes passam.

- [ ] **Step 6: Commit**

```bash
cd D:\syndi_qa
git add lib/redmine.js lib/redmine.test.js
git commit -m "feat: montarCamposEdicao para de usar userId pra cf_85, aceita responsavelQaImagem/responsavel3Check"
```

---

### Task 2: `server.js` — ler os 2 campos novos do corpo em `/api/aprovar`

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `redmine.gravarCamposEdicao(basePath, gtin, campos)` com `campos` aceitando
  `responsavelQaImagem`/`responsavel3Check` (Task 1).
- Produces: `POST /api/aprovar` passa a ler `responsavelQaImagem`/`responsavel3Check` do corpo e
  repassar pra `redmine.gravarCamposEdicao`.

- [ ] **Step 1: Ler os 2 campos novos e parar de repassar `userId` pro objeto `campos`**

Em `server.js`, dentro do handler de `POST /api/aprovar`, encontre este trecho (por volta das
linhas 396):

```js
                const r = await redmine.gravarCamposEdicao(BASE_PATH, gtin, { responsavel, qtdRecorte, qtdMockup, userId });
```

E logo acima dele, encontre onde `responsavel`/`qtdRecorte`/`qtdMockup` são lidos e validados
(por volta das linhas 351-362):

```js
            const responsavel = typeof dados.responsavel === 'string' ? dados.responsavel.trim() : '';
            const qtdRecorte = typeof dados.qtdRecorte === 'string' ? dados.qtdRecorte.trim() : '';
            const qtdMockup = typeof dados.qtdMockup === 'string' ? dados.qtdMockup.trim() : '';
            if (!/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup)) {
                enviarJson(res, 400, { ok: false, error: 'responsavel/qtdRecorte/qtdMockup devem ser numericos ou vazios' });
                return;
            }
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
```

Troque esse trecho por:

```js
            const responsavel = typeof dados.responsavel === 'string' ? dados.responsavel.trim() : '';
            const qtdRecorte = typeof dados.qtdRecorte === 'string' ? dados.qtdRecorte.trim() : '';
            const qtdMockup = typeof dados.qtdMockup === 'string' ? dados.qtdMockup.trim() : '';
            // userId so serve pro bloqueio de identidade abaixo (obrigatoria pra aprovar
            // QUALQUER coisa) - NAO entra mais no objeto campos, cf_85 virou um dropdown
            // manual comum (responsavelQaImagem), igual ja e na aba QA para Edicao.
            const responsavelQaImagem = typeof dados.responsavelQaImagem === 'string' ? dados.responsavelQaImagem.trim() : '';
            const responsavel3Check = typeof dados.responsavel3Check === 'string' ? dados.responsavel3Check.trim() : '';
            if (!/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup) ||
                !/^\d*$/.test(responsavelQaImagem) || !/^\d*$/.test(responsavel3Check)) {
                enviarJson(res, 400, { ok: false, error: 'responsavel/qtdRecorte/qtdMockup/responsavelQaImagem/responsavel3Check devem ser numericos ou vazios' });
                return;
            }
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
```

E troque a chamada de `gravarCamposEdicao`:

```js
                const r = await redmine.gravarCamposEdicao(BASE_PATH, gtin, { responsavel, qtdRecorte, qtdMockup, userId });
```

por:

```js
                const r = await redmine.gravarCamposEdicao(BASE_PATH, gtin, { responsavel, qtdRecorte, qtdMockup, responsavelQaImagem, responsavel3Check });
```

- [ ] **Step 2: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check server.js`
Expected: sem saída (exit code 0).

- [ ] **Step 3: Rodar a suíte inteira**

Run: `cd D:\syndi_qa && npm test`
Expected: todos os testes continuam passando.

- [ ] **Step 4: Verificação manual via curl**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. Com um GTIN de teste real que tenha ficha aberta no Redmine e destino diferente de Mockup,
   aprove com `responsavelQaImagem`/`responsavel3Check` preenchidos (`curl -X POST
   http://localhost:3001/api/aprovar -H "Content-Type: application/json" -d
   "{\"os\":\"<os>\",\"gtin\":\"<gtin>\",\"userId\":\"15\",\"responsavelQaImagem\":\"15\",\"responsavel3Check\":\"34\"}"`)
   — esperado: `{"ok":true,...}`, confirme no Redmine (ou via `GET /api/edicao/detalhe`) que
   cf_85 e cf_172 foram atualizados pros valores enviados.
3. Aprove sem `userId` no corpo — esperado: `400` com a mensagem de identidade obrigatória (o
   bloqueio continua intacto).
4. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 5: Commit**

```bash
cd D:\syndi_qa
git add server.js
git commit -m "feat: rota /api/aprovar le responsavelQaImagem/responsavel3Check, para de usar userId pra cf_85"
```

---

### Task 3: Front-end — 2 dropdowns novos no painel de Aprovar

**Files:**
- Modify: `js/qa.js`
- Modify: `syndi_qa.html`

**Interfaces:**
- Consumes: `POST /api/aprovar` aceitando `responsavelQaImagem`/`responsavel3Check` no corpo
  (Task 2). `opcoesResponsavelQaImagem`/`opcoesResponsavel3Check` (refs já existentes, carregadas
  globalmente por `carregarOpcoesResponsavel` desde o sub-projeto anterior).
- Produces: nada consumido por tarefas futuras (última tarefa do plano).

- [ ] **Step 1: Campos novos em `formEnvio`**

Em `js/qa.js`, encontre a linha (procure `const formEnvio = reactive`, por volta da linha 58):

```js
        const formEnvio = reactive({ responsavel: '', qtdRecorte: '', qtdMockup: '', numeroMockup: '', orientacoesMockup: [] });
```

troque por:

```js
        const formEnvio = reactive({ responsavel: '', qtdRecorte: '', qtdMockup: '', numeroMockup: '', orientacoesMockup: [], responsavelQaImagem: '', responsavel3Check: '' });
```

- [ ] **Step 2: Reset ao abrir o painel de envio**

Encontre a função `abrirPainelEnvio` (procure `formEnvio.orientacoesMockup = [];`, por volta da
linha 518-519):

```js
                formEnvio.numeroMockup = '';
                formEnvio.orientacoesMockup = [];
```

troque por:

```js
                formEnvio.numeroMockup = '';
                formEnvio.orientacoesMockup = [];
                formEnvio.responsavelQaImagem = '';
                formEnvio.responsavel3Check = '';
```

- [ ] **Step 3: Enviar os 2 campos novos no corpo de `aprovarGtin`**

Encontre a função `aprovarGtin` e o corpo do `fetch` de `/api/aprovar` (procure
`numeroMockup: formEnvio.numeroMockup.trim()`):

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

troque por:

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
                        orientacoesMockup: formEnvio.orientacoesMockup,
                        responsavelQaImagem: String(formEnvio.responsavelQaImagem || ''),
                        responsavel3Check: String(formEnvio.responsavel3Check || '')
                    })
                });
```

- [ ] **Step 4: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: sem saída (exit code 0).

- [ ] **Step 5: 2 dropdowns novos em `syndi_qa.html`**

Encontre o bloco do campo "Qtd Imagens Mockup" dentro do painel `qa-editadas-recebidas` (procure
`v-model="formEnvio.qtdMockup"`):

```html
                                <div class="qa-campo-linha">
                                    <span class="qa-campo-label">Qtd Imagens Mockup</span>
                                    <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="formEnvio.qtdMockup">
                                </div>
```

Logo depois desse bloco (e antes do `<template v-if="detalhe.imagens.destino === 'Mockup'">`),
adicione:

```html
                                <div class="qa-campo-linha">
                                    <span class="qa-campo-label">Responsável QA Imagem</span>
                                    <select class="form-select form-select-sm w-auto" v-model="formEnvio.responsavelQaImagem">
                                        <option value="">-</option>
                                        <option v-for="(rotulo, id) in opcoesResponsavelQaImagem" :key="id" :value="id">{{ rotulo }}</option>
                                    </select>
                                </div>
                                <div class="qa-campo-linha">
                                    <span class="qa-campo-label">Responsável 3º Check</span>
                                    <select class="form-select form-select-sm w-auto" v-model="formEnvio.responsavel3Check">
                                        <option value="">-</option>
                                        <option v-for="(rotulo, id) in opcoesResponsavel3Check" :key="id" :value="id">{{ rotulo }}</option>
                                    </select>
                                </div>
```

- [ ] **Step 6: Verificação manual end-to-end**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. No navegador: abra um GTIN de teste, clique "Aprovar GTIN" — confirme que os 2 selects novos
   aparecem, populados com as opções certas (mesmas listas já usadas na aba QA para Edição), e
   nascem vazios.
3. Escolha um valor em cada um dos 2, aprove — confirme que a issue no Redmine recebe os valores
   corretos (via `GET /api/edicao/detalhe` ou olhando o Redmine diretamente).
4. Abra o painel de Aprovar de novo (outro GTIN) — confirme que os 2 campos nascem vazios de
   novo (não herdam valor do GTIN anterior).
5. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 7: Commit**

```bash
cd D:\syndi_qa
git add js/qa.js syndi_qa.html
git commit -m "feat: painel de Aprovar ganha Responsavel QA Imagem e Responsavel 3 Check"
```

---

## Post-plan: update memory

Depois deste plano implementado e mergeado, atualizar
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md`: documentar que
`cf_85` deixou de ser automático também no Aprovar (só o Retrabalho continua automático agora),
e que os campos do painel de Aprovar e da aba QA para Edição estão praticamente idênticos agora
(Situação continua sendo a única diferença, exclusiva da aba Edição). Isso é uma atualização de
memória, não uma tarefa de código — fazer na conversa de finalização, não como step do plano.
