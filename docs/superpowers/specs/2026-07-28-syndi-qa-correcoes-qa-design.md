# Syndi_qa — Sub-projeto: Correções QA de Foto / QA para Edição

Três correções de comportamento encontradas em uso real das abas já mergeadas (Sub-projeto 1
tagging+zoom, Sub-projeto 2 envio-edição, Sub-projeto 4 aba QA para Edição). Não é uma feature
nova — é acerto de regra de negócio + UX de algo já construído.

## 0. Contexto — decomposição maior

1. Peça 1 + correções — retrabalho (mergeado).
2. Sub-projeto 1 — tagging RT/IS/AP/`_coding`/Mockup-Recorte + zoom (mergeado).
3. Sub-projeto 2 — envio pra edição, Responsável/Quantidade via painel do Aprovar (mergeado).
4. Sub-projeto 3 — Agenda de Edição (mergeado).
5. Sub-projeto 4 — aba "QA para Edição" (mergeado).
6. Sub-projeto 5 — scripts operacionais (mergeado).
7. **Este spec** — correções na regra de inferência + refresh de sugestões + UX de clique na foto.
8. Analyst identity ("engrenagem") pra gravações no Redmine — ainda na fila, spec próprio.

## 1. Regra de inferência de Responsável Pós-Produção — correção

`inferirCamposEdicao` (`lib/qaSyndi.js`), usada tanto pelo painel do Aprovar quanto pela aba "QA
para Edição", tinha uma regra simples demais: subpasta **Recorte** marcada sempre virava **Bright
River**, subpasta **Mockup** sempre **Virafilme (Best Image)** — sem considerar mais nada. Isso
gerava responsável errado em casos reais.

**Tabela de decisão confirmada com o usuário** (M = subpasta Mockup marcada, R = subpasta Recorte
marcada, S = existe subpasta RT/IS/AP com pelo menos 1 foto, C = existe foto com sufixo `_coding`
na raiz):

| M | R | S | C | Resultado |
|---|---|---|---|---|
| X | X | - | - | indefinido (conflito Mockup+Recorte, igual hoje) |
| X | - | - | - | Virafilme (Best Image) |
| X | - | X | - | Virafilme (Best Image) |
| - | X | - | X | Bright River |
| - | X | X | X | Virafilme (Best Image) — subpasta manda mais que `_coding` |
| - | X | - | sem C | indefinido (Recorte sozinho não decide mais) |
| - | - | X | - | Virafilme (Best Image) |
| - | - | - | X | Bright River (igual ao fallback atual) |
| - | - | - | - | indefinido (sem sinal nenhum, igual hoje) |

**Extrapolação necessária, não coberta explicitamente na tabela acima (assumida pelo
desenvolvedor, revisar se estiver errada):** Recorte marcado + subpasta (S) presente, **sem**
`_coding` (a linha "R, S, sem C" não está na tabela) — segue a mesma regra da linha "R+S+C": S
manda mais, resultado é Virafilme (Best Image). Ou seja, sempre que R está marcado e S está
presente, o resultado é Virafilme independente de C.

**Campo de quantidade:** desacoplado do responsável — reflete a subpasta fisicamente marcada, não
quem vai executar. `qtdMockup` é preenchido quando M está marcado (contagem de fotos sem
`_coding` na raiz); `qtdRecorte` é preenchido quando R está marcado (mesma contagem). Na linha
"S sozinho" (sem M, sem R) não há subpasta de destino marcada, então nenhum campo de quantidade é
sugerido — só o responsável (Virafilme). O analista preenche a quantidade manualmente nesse caso.

## 2. Sugestões da aba "QA para Edição" ficam desatualizadas

Hoje a aba carrega a sugestão (Responsável/Quantidades inferidos) **uma única vez** por GTIN
(`edicaoCarregadaParaGtin`), pra evitar ida-e-volta desnecessária ao Redmine. Mas se o analista
reorganiza a pasta **depois** disso (marca/desmarca `_coding`, move foto pra RT/IS/AP, marca/
desmarca Mockup/Recorte) — na aba "QA de Foto" — a sugestão não reflete mais o estado real da
pasta na próxima vez que a aba "QA para Edição" é reaberta.

**Correção:** toda ação de tagging bem-sucedida (`toggleCoding`, `toggleSubpasta`,
`marcarDestinoManual`) no GTIN selecionado invalida o cache (`edicaoCarregadaParaGtin = null`).
Na próxima vez que a aba "QA para Edição" abrir (ou, se já estiver aberta, imediatamente), a
sugestão é recarregada. Campos que o analista **já editou manualmente** nesta sessão
(`origemCampoEdicao[id] === 'manual'`) continuam intocados — mesma proteção que já existe hoje,
não muda.

## 3. Clique na foto: zoom no corpo, checkbox pra retrabalho

Hoje, clicar no corpo da miniatura (`@click="selecionarFoto(...)"`) só marca a foto como "ativa"
(abre o painel de motivos de retrabalho abaixo) — não amplia. Ampliar só funciona pelo botão
dedicado de lupa. Isso confunde: o clique mais natural (na própria foto) não faz a ação mais
esperada (ver a foto grande).

**Correção:**
- Clicar no **corpo** da miniatura (a `<div class="qa-miniatura">`, tanto na raiz quanto nas
  subpastas RT/IS/AP) passa a chamar `ampliarImagem(...)` — mesmo comportamento que já existe no
  botão de lupa, agora também no clique direto na foto.
- Um **checkbox novo**, ao lado dos botões existentes (`C`/`RT`/`IS`/`AP`/lupa na raiz;
  `Voltar p/ raiz`/lupa nas subpastas), passa a ser o jeito de selecionar a foto pro retrabalho —
  chama `selecionarFoto(...)` (mesma função de hoje, só que disparada pelo checkbox em vez do
  clique no corpo). O painel de motivos abaixo continua funcionando exatamente igual, só muda o
  gatilho.
- O botão de lupa dedicado continua existindo (redundante com o clique no corpo agora, mas sem
  motivo pra remover — não atrapalha).

## 4. O que fica de fora

- Qualquer mudança no fluxo do Aprovar além de reaproveitar a `inferirCamposEdicao` corrigida —
  `aprovarGtin`, `/api/aprovar*` continuam intocados estruturalmente.
- Sub-projeto da identidade do analista ("engrenagem") — spec próprio, ainda não escrito.

## 5. Testes

- `inferirCamposEdicao`: reescreve a suíte de testes existente em `lib/qaSyndi.test.js` pra cobrir
  as 9 linhas da tabela (`node:test`, usando `fs.mkdtempSync` como já é padrão no arquivo).
- Invalidação de cache da aba Edição: sem lógica pura nova (é só resetar uma variável de estado no
  Vue) — verificação manual (mover uma foto, reabrir a aba, conferir que a sugestão mudou).
- Clique/checkbox: sem lógica nova além de trocar o binding do `@click` e adicionar um checkbox
  que chama uma função já existente — verificação manual (estrutural via curl + comportamental via
  navegador, mesmo padrão já usado nos sub-projetos anteriores).
