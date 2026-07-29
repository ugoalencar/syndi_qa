# Syndi_qa — Sub-projeto: aba QA para Edição ganha Responsável QA Imagem e Responsável 3º Check

A aba "QA para Edição" hoje edita 4 campos do Redmine (Situação, Responsável Pós-Produção, Qtd
Recorte, Qtd Mockup). Este spec adiciona mais 2, editáveis do mesmo jeito: Responsável QA Imagem
(`cf_85`) e Responsável 3º Check Imagem (`cf_172`) — ambos já mapeados em `redmine-campos.json`.

## 0. Contexto — decomposição maior

1-11. (ver specs anteriores, todos mergeados — o mais recente relevante aqui é a identidade do
analista, `2026-07-28-syndi-qa-identidade-analista-design.md`, que introduziu a gravação
automática de `cf_85` via `userId` logado.)
12. **Este spec** — 2 campos novos na aba QA para Edição. Spec irmã, mesmo pedido do usuário:
    `2026-07-28-syndi-qa-mockup-motivos-redmine-design.md` (mockup + motivos via Redmine),
    tratada separadamente.

## 1. Decisões confirmadas com o usuário

- **Os 2 campos novos são editáveis**, mesmo padrão dos 4 já existentes: dropdown + badge
  "manual"/"inferido" + gravados junto no mesmo botão "Gravar" da aba.
- **Opções vêm do `redmine-campos.json` estático** (mesmo mecanismo já usado pra `cf_23`/`cf_15`
  hoje) — sem a complexidade de consulta viva ao Redmine que o spec irmão introduz só pros
  motivos de retrabalho.
- **Conflito resolvido com a feature de identidade do analista**: `cf_85` já é gravado
  automaticamente com `userId` (identidade de quem está logado) em toda gravação da aba, desde o
  spec anterior. Como agora existe um dropdown editável pro mesmo campo, **a gravação automática
  de `cf_85` é removida especificamente desta aba** — `cf_85` vira um campo comum do formulário,
  só entra no PUT se o analista mexer no dropdown (mesma regra de "campo vazio não entra" que já
  vale pros outros).
- **O bloqueio de identidade continua valendo nesta aba** (client + server ainda exigem `userId`
  configurado pra poder gravar QUALQUER coisa, mesmo os campos antigos) — só o PUT em si deixa de
  incluir `cf_85` automaticamente. **Aprovar e Retrabalho não mudam em nada** — a gravação
  automática de `cf_85` via identidade continua ativa nesses dois pontos.

## 2. Backend

- `lib/redmine.js`:
  - Nova constante `CF_RESPONSAVEL_3_CHECK = 172`.
  - `montarCamposEdicaoCompleto(campos)` — remove o uso de `campos.userId` pra `cf_85` (linha que
    hoje é `if (campos.userId) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, ... })`), substitui por
    dois novos campos condicionais:
    ```js
    if (campos.responsavelQaImagem) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.responsavelQaImagem) });
    if (campos.responsavel3Check) lista.push({ id: CF_RESPONSAVEL_3_CHECK, value: String(campos.responsavel3Check) });
    ```
  - `montarCamposEdicao` (usada só pelo Aprovar) e `marcarRetrabalhoFotografia` (usada só pelo
    Retrabalho) **não mudam** — continuam usando `campos.userId`/`userId` pra `cf_85` exatamente
    como estão hoje.
  - `buscarDetalheEdicao(basePath, gtin)` — o objeto `customFields` devolvido ganha as chaves
    `'85'` e `'172'`, lidas da issue com `valorCfEdicao(issue, CF_RESPONSAVEL_QA_IMAGEM)` /
    `valorCfEdicao(issue, CF_RESPONSAVEL_3_CHECK)` (mesma função já usada pros outros 4 campos).
- `server.js`, rota `POST /api/edicao/gravar`:
  - Lê `responsavelQaImagem`/`responsavel3Check` do corpo (mesma validação `typeof === 'string' ?
    trim() : ''` já usada pros outros campos — sem regex numérica, são ids de opção de select,
    mas continuam vindo como string do front, igual `responsavel` já funciona hoje).
  - A checagem de `userId` obrigatório (bloqueio de identidade, já existente) **não muda** — ainda
    roda antes de qualquer IO.
  - A chamada a `redmine.gravarCamposEdicaoCompleto` passa a receber
    `{ situacao, responsavel, qtdRecorte, qtdMockup, responsavelQaImagem, responsavel3Check }` —
    **`userId` deixa de ser incluído neste objeto** (continua sendo validado como obrigatório pra
    liberar a chamada, só não é mais repassado pra dentro do PUT).

## 3. Front-end

- `js/qa.js`:
  - `CAMPOS_EDICAO_IDS` ganha `'85'` e `'172'` (array usado por `selecionarGtin` pra resetar
    `camposEdicao`/`origemCampoEdicao` ao trocar de GTIN).
  - Novo estado `opcoesResponsavelQaImagem = ref({})` e `opcoesResponsavel3Check = ref({})`,
    carregados em `carregarOpcoesResponsavel` (já existente) a partir do mesmo
    `/redmine-campos.json`: `dados.campos.cf_85.opcoes` e `dados.campos.cf_172.opcoes`.
  - `confirmarEnvioEdicao` — o corpo do POST ganha
    `responsavelQaImagem: String(camposEdicao['85'] || '')` e
    `responsavel3Check: String(camposEdicao['172'] || '')`.
  - `NOMES_CAMPO_EDICAO` (usado pra montar a mensagem "Gravado no Redmine: ...") ganha
    `'85': 'Responsável QA Imagem'` e `'172': 'Responsável 3º Check'`.
- `syndi_qa.html`, dentro da aba "QA para Edição" (`v-show="abaDetalhe === 'edicao'"`), logo
  depois do campo "Qtd Imagens Mockup" existente (mesmo padrão visual `qa-campo-linha` +
  `qa-campo-origem`, dois blocos novos):
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

## 4. O que fica de fora

- Qualquer inferência local automática pros 2 campos novos (diferente de Responsável
  Pós-Produção/Qtd Recorte/Qtd Mockup, que têm sugestão vinda de `inferirCamposEdicao`) — ambos
  nascem vazios/"inferido" até o analista escolher manualmente, sem heurística de pasta.
- Mudar `montarCamposEdicao`/`marcarRetrabalhoFotografia` (Aprovar/Retrabalho) — ficam exatamente
  como estão, gravando `cf_85` automaticamente via identidade.
- Retrogravar `cf_172` em issues já processadas — só issues gravadas a partir de agora, mesmo
  princípio já usado pro spec da identidade.

## 5. Testes

- `lib/redmine.js`: `montarCamposEdicaoCompleto` — com `responsavelQaImagem`/`responsavel3Check`
  presentes (aparecem na lista, ids 85/172); com `userId` presente mas SEM
  `responsavelQaImagem`/`responsavel3Check` (cf_85 NÃO aparece mais — confirma que a remoção do
  uso de `userId` pra esta função específica funcionou); `buscarDetalheEdicao` traz os campos
  `'85'`/`'172'` no objeto devolvido (mock de `fetch`).
- `server.js`: verificação manual via curl — grava com os 2 campos novos preenchidos, confirma
  que a issue no Redmine recebe os ids 85/172 corretos; grava sem `userId` no corpo, confirma que
  ainda bloqueia com 400 (bloqueio de identidade intacto).
- Front-end: verificação manual — os 2 selects aparecem populados com as opções certas, gravar
  atualiza a mensagem "Gravado no Redmine: ..." incluindo os nomes certos quando preenchidos.
