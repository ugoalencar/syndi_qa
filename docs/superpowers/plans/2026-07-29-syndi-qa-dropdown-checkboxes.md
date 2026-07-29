# Dropdown com Checkboxes (motivos + orientações) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** os painéis de motivos de retrabalho e orientações de mockup, hoje sempre abertos
(checkboxes empilhados), viram um dropdown compacto — fechado, mostra um resumo por contagem;
aberto, expande a lista de checkboxes inline (empurra o conteúdo abaixo, sem virar overlay).

**Architecture:** dois novos estados booleanos (`mostrarDropdownMotivos`/
`mostrarDropdownOrientacoes`) controlam a visibilidade condicional da lista de checkboxes já
existente; um botão-resumo novo faz o toggle. Nenhuma lógica de armazenamento de motivos/
orientações muda (`marcadas`/`formEnvio.orientacoesMockup` continuam exatamente como estão).

**Tech Stack:** Vue 3 (sem build), HTML/CSS puro.

## Global Constraints

- Continua sendo seleção múltipla — nenhuma mudança na estrutura de dados (`marcadas[fotoAtiva]`
  array, `formEnvio.orientacoesMockup` array).
- Fechado, mostra resumo por CONTAGEM: "Selecionar motivos" (0 marcados) / "Motivos (N)" (N>0) —
  mesmo padrão pros dois painéis ("Selecionar orientações"/"Orientações (N)"). Não lista nomes.
- Expande INLINE (empurra conteúdo abaixo), nunca overlay/`position:absolute` — a coluna de ação
  tem scroll interno próprio (`.qa-coluna-acoes`, `overflow-y:auto`), um overlay correria risco
  de ficar cortado.
- Fecha só ao re-clicar no próprio botão-resumo — sem necessidade de detectar clique fora.
- Aplica nos dois painéis (motivos de retrabalho E orientações de mockup), reaproveitando a
  MESMA classe CSS pro botão-resumo nos dois lugares.
- `mostrarDropdownMotivos` fecha automaticamente ao trocar de foto ativa (`selecionarFoto`).
  `mostrarDropdownOrientacoes` fecha automaticamente ao abrir um novo painel de envio
  (`abrirPainelEnvio`).

---

### Task 1: Estado de aberto/fechado + HTML/CSS do dropdown

**Files:**
- Modify: `js/qa.js`
- Modify: `syndi_qa.html`
- Modify: `css/qa.css`

**Interfaces:**
- Consumes: nada de tarefas anteriores (única tarefa do plano).
- Produces: `mostrarDropdownMotivos`/`mostrarDropdownOrientacoes` (refs booleanas),
  `toggleDropdownMotivos()`/`toggleDropdownOrientacoes()` — não consumidos por nenhum outro
  arquivo, só usados dentro de `syndi_qa.html`.

- [ ] **Step 1: Estado novo em `js/qa.js`**

Logo depois de `const orientacoesMockup = ref([]);` (por volta da linha 62), adicione:

```js
        // Controla se a lista de checkboxes de motivos/orientacoes esta expandida
        // (dropdown inline, nao overlay - ver docs/superpowers/specs/
        // 2026-07-29-syndi-qa-dropdown-checkboxes-design.md). Fecham sozinhos ao trocar
        // de contexto (foto ativa / novo painel de envio) pra nao vazar estado "aberto"
        // de uma selecao pra outra.
        const mostrarDropdownMotivos = ref(false);
        const mostrarDropdownOrientacoes = ref(false);
```

- [ ] **Step 2: Funções de toggle**

Logo depois da função `togglarOrientacaoMockup` (procure esse texto, por volta da linha 464-467),
adicione:

```js
        function toggleDropdownMotivos() {
            mostrarDropdownMotivos.value = !mostrarDropdownMotivos.value;
        }

        function toggleDropdownOrientacoes() {
            mostrarDropdownOrientacoes.value = !mostrarDropdownOrientacoes.value;
        }
```

- [ ] **Step 3: Fechar automaticamente ao trocar de contexto**

Encontre a função `selecionarFoto` (procure `function selecionarFoto`, por volta da linha
446-448):

```js
        function selecionarFoto(nomeFoto) {
            fotoAtiva.value = fotoAtiva.value === nomeFoto ? null : nomeFoto;
        }
```

troque por:

```js
        function selecionarFoto(nomeFoto) {
            fotoAtiva.value = fotoAtiva.value === nomeFoto ? null : nomeFoto;
            mostrarDropdownMotivos.value = false;
        }
```

Encontre a função `abrirPainelEnvio` (procure `formEnvio.orientacoesMockup = [];`, por volta da
linha 518-519):

```js
                formEnvio.numeroMockup = '';
                formEnvio.orientacoesMockup = [];
                painelEnvio.value = { destino: dados.destino, motivo: dados.motivo };
```

troque por:

```js
                formEnvio.numeroMockup = '';
                formEnvio.orientacoesMockup = [];
                mostrarDropdownOrientacoes.value = false;
                painelEnvio.value = { destino: dados.destino, motivo: dados.motivo };
```

- [ ] **Step 4: Expor no `return` do `setup()`**

No `return` final de `js/qa.js`, encontre a linha que já expõe `togglarOrientacaoMockup` (procure
esse nome no `return`) e adicione logo depois, na mesma linha ou na seguinte:
`mostrarDropdownMotivos, mostrarDropdownOrientacoes, toggleDropdownMotivos,
toggleDropdownOrientacoes,`.

- [ ] **Step 5: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check js/qa.js`
Expected: sem saída (exit code 0).

- [ ] **Step 6: HTML do dropdown de motivos**

Em `syndi_qa.html`, encontre o bloco (por volta da linha 235-242):

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

troque por:

```html
                            <div v-if="fotoAtiva" class="qa-motivos-painel">
                                <div class="qa-motivos-titulo">Motivos para {{ fotoAtiva }}</div>
                                <button type="button" class="qa-dropdown-toggle" @click="toggleDropdownMotivos">
                                    <span>{{ (marcadas[fotoAtiva] || []).length ? 'Motivos (' + (marcadas[fotoAtiva] || []).length + ')' : 'Selecionar motivos' }}</span>
                                    <i class="bi" :class="mostrarDropdownMotivos ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                                </button>
                                <div v-if="mostrarDropdownMotivos" class="qa-motivos qa-dropdown-lista">
                                    <label v-for="motivo in motivos" :key="motivo" class="qa-motivo-item">
                                        <input type="checkbox" :checked="(marcadas[fotoAtiva] || []).includes(motivo)" @change="togglarMotivoAtivo(motivo)"> {{ motivo }}
                                    </label>
                                </div>
                            </div>
```

- [ ] **Step 7: HTML do dropdown de orientações**

Encontre o bloco (por volta da linha 270-277, dentro do `<template v-if="detalhe.imagens.destino
=== 'Mockup'">`):

```html
                                    <div class="qa-motivos-painel">
                                        <div class="qa-motivos-titulo">Orientações pro editor (opcional)</div>
                                        <div class="qa-motivos">
                                            <label v-for="orientacao in orientacoesMockup" :key="orientacao" class="qa-motivo-item">
                                                <input type="checkbox" :checked="formEnvio.orientacoesMockup.includes(orientacao)" @change="togglarOrientacaoMockup(orientacao)"> {{ orientacao }}
                                            </label>
                                        </div>
                                    </div>
```

troque por:

```html
                                    <div class="qa-motivos-painel">
                                        <div class="qa-motivos-titulo">Orientações pro editor (opcional)</div>
                                        <button type="button" class="qa-dropdown-toggle" @click="toggleDropdownOrientacoes">
                                            <span>{{ formEnvio.orientacoesMockup.length ? 'Orientações (' + formEnvio.orientacoesMockup.length + ')' : 'Selecionar orientações' }}</span>
                                            <i class="bi" :class="mostrarDropdownOrientacoes ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                                        </button>
                                        <div v-if="mostrarDropdownOrientacoes" class="qa-motivos qa-dropdown-lista">
                                            <label v-for="orientacao in orientacoesMockup" :key="orientacao" class="qa-motivo-item">
                                                <input type="checkbox" :checked="formEnvio.orientacoesMockup.includes(orientacao)" @change="togglarOrientacaoMockup(orientacao)"> {{ orientacao }}
                                            </label>
                                        </div>
                                    </div>
```

- [ ] **Step 8: CSS do botão-resumo**

Em `css/qa.css`, logo depois da regra `.qa-motivos-titulo { ... }` (procure esse seletor, por
volta da linha 352-357, adicione depois do fechamento `}` dela):

```css
.qa-dropdown-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-top: 4px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background-color: var(--bg-input);
    color: var(--text);
    font-size: 0.85rem;
    cursor: pointer;
}

.qa-dropdown-toggle:hover {
    border-color: var(--primary);
}

.qa-dropdown-lista {
    margin-top: 4px;
}
```

- [ ] **Step 9: Verificação manual**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. No navegador: selecione uma foto pra retrabalho (marca o checkbox de retrabalho) — confirme
   que aparece o botão "Selecionar motivos" (fechado por padrão) em vez da lista sempre aberta.
3. Clique no botão — confirme que a lista de checkboxes expande logo abaixo, empurrando o
   conteúdo seguinte pra baixo (não flutua por cima de nada).
4. Marque 2 motivos — confirme que o botão passa a mostrar "Motivos (2)".
5. Selecione outra foto — confirme que o dropdown fecha sozinho (mostra "Selecionar motivos" de
   novo, fechado).
6. Marque destino "Mockup" e clique "Aprovar GTIN" — confirme que o painel de orientações também
   aparece como dropdown fechado por padrão, com o mesmo comportamento de abrir/fechar/contagem.
7. Feche o painel de envio e abra de novo (ou troque de GTIN e volte) — confirme que o dropdown
   de orientações nasce fechado.
8. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 10: Commit**

```bash
cd D:\syndi_qa
git add js/qa.js syndi_qa.html css/qa.css
git commit -m "feat: motivos de retrabalho e orientacoes de mockup viram dropdown com checkboxes"
```

---

## Post-plan: update memory

Depois deste plano implementado e mergeado, atualizar
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md`: documentar o
padrão de dropdown-inline-com-checkboxes (reaproveitável se mais listas de múltipla escolha
aparecerem no projeto). Isso é uma atualização de memória, não uma tarefa de código — fazer na
conversa de finalização, não como step do plano.
