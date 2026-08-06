# Versao e Atualizacao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar a versão instalada do Syndi_qa e tornar o atualizador Git robusto para repositórios com `main` ou `master`.

**Architecture:** Criar um módulo pequeno `lib/versionamento.js` para concentrar leitura de `versao.json`, commit atual e descoberta do alvo remoto de atualização. `server.js` expõe `/api/versao` e reaproveita o módulo nas rotas `/api/atualizacao/*`; o front carrega essa rota no início e mostra `vX.Y.Z` no header.

**Tech Stack:** Node.js core (`fs`, `path`, `child_process`), Vue global já existente, `node:test`.

## Global Constraints

- Não depender fixo de `origin/main`; detectar upstream atual, `origin/HEAD`, `origin/main` ou `origin/master`.
- Não executar atualização automática no load; apenas carregar versão no load.
- `POST /api/atualizacao/aplicar` continua recusando working tree sujo.
- `GET /api/versao` não pode quebrar se `versao.json` estiver ausente/corrompido ou se Git não estiver disponível.
- Não commitar sem pedido explícito.

---

### Task 1: Criar módulo de versão/update com testes

**Files:**
- Create: `versao.json`
- Create: `lib/versionamento.js`
- Create: `lib/versionamento.test.js`

**Interfaces:**
- Produces: `carregarVersao(basePath)`, `obterGitDescribe(basePath)`, `detectarAlvoAtualizacao(basePath)`, `verificarAtualizacao(basePath)`, `aplicarAtualizacao(basePath)`.

- [ ] **Step 1:** criar `versao.json` com `{ "nome": "Syndi_qa", "versao": "0.2.0", "data": "2026-08-05" }`.
- [ ] **Step 2:** escrever testes em `lib/versionamento.test.js` cobrindo fallback de `carregarVersao`, leitura de arquivo válido e detecção de alvo via comandos Git falsos.
- [ ] **Step 3:** criar `lib/versionamento.js` com as funções acima, recebendo opcionalmente `execSync` injetável em funções internas para teste.
- [ ] **Step 4:** rodar `npm test` e confirmar todos os testes passando.

---

### Task 2: Ligar server.js ao módulo

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `versionamento.carregarVersao`, `obterGitDescribe`, `verificarAtualizacao`, `aplicarAtualizacao`.
- Produces: `GET /api/versao`, atualização com `branchAtualizacao`.

- [ ] **Step 1:** adicionar `const versionamento = require('./lib/versionamento');`.
- [ ] **Step 2:** adicionar rota `GET /api/versao` antes do handler estático.
- [ ] **Step 3:** substituir lógica hardcoded de `/api/atualizacao/verificar` por `versionamento.verificarAtualizacao(BASE_PATH)`.
- [ ] **Step 4:** substituir lógica hardcoded de `/api/atualizacao/aplicar` por `versionamento.aplicarAtualizacao(BASE_PATH)`.
- [ ] **Step 5:** rodar `node --check server.js` e `npm test`.

---

### Task 3: Mostrar versão no header

**Files:**
- Modify: `js/qa.js`
- Modify: `syndi_qa.html`
- Modify: `css/qa.css`

**Interfaces:**
- Consumes: `GET /api/versao`.
- Produces: estado `versaoSistema` e exibição `vX.Y.Z` no header.

- [ ] **Step 1:** em `js/qa.js`, adicionar `versaoSistema = ref(null)` e `carregarVersaoSistema()` que chama `/api/versao`.
- [ ] **Step 2:** chamar `carregarVersaoSistema()` no load, sem chamar verificação de atualização.
- [ ] **Step 3:** retornar `versaoSistema`.
- [ ] **Step 4:** em `syndi_qa.html`, exibir `v{{ versaoSistema.versao }}` ao lado do título quando carregado.
- [ ] **Step 5:** em `css/qa.css`, adicionar estilo discreto `.qa-versao-sistema`.
- [ ] **Step 6:** rodar `node --check js/qa.js` e `npm test`.

---

### Task 4: Verificação runtime

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: app em `http://localhost:3001`.

- [ ] **Step 1:** iniciar app se necessário.
- [ ] **Step 2:** chamar `GET /api/versao` e confirmar JSON com `versao` e `git`.
- [ ] **Step 3:** chamar `GET /api/atualizacao/verificar` e confirmar que retorna ou erro controlado, sem travar em `origin/main` quando o alvo for `master`.
- [ ] **Step 4:** abrir tela e confirmar `v0.2.0` no header.
