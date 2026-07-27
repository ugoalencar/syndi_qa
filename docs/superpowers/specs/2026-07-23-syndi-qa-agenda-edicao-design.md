# Syndi_qa — Sub-projeto 3: Agenda de Edição

Terceiro sub-projeto da decomposição "portar QA Hub do sphoto" (depois de tagging+zoom e
envio-pra-edição, já mergeados). Nasceu de pedido explícito do usuário desde a primeira rodada
de feedback: painel de acompanhamento com abas por responsável, filtro de período, e barra de
progresso semáforo até a previsão de entrega.

## 0. Contexto — decomposição maior

1. Peça 1 + correções — retrabalho (mergeado).
2. Sub-projeto 1 — tagging RT/IS/AP/`_coding`/Mockup-Recorte + zoom (mergeado).
3. Sub-projeto 2 — envio pra edição, Responsável/Quantidade (mergeado).
4. **Este spec** — Agenda de Edição.
5. Scripts operacionais (iniciar/parar/monitor) — próximo.
6. Mecanismo de entrega do TXT de retrabalho pro fotógrafo — depois.

## 1. Campos do Redmine — confirmados contra dados reais

Descobertos consultando uma issue real via API (não documentados em `redmine-campos.json`, que
só cobre um subconjunto de campos):

| Campo | cf_id | Exemplo de valor |
|---|---|---|
| DT Envio para Edição | **21** | `"2026-07-06"` |
| Previsão entrega Pós-Produção | **34** | `"2026-07-08"` (já usado pelo `montarAgendaEdicao` do sphoto como `PREVISAO_ENTREGA_POS_PRODUCAO`) |
| Situação das Imagens | 15 | `85` = "Em Edição", `97` = "Qualidade Aprovada" (= entregue, confirmado com o usuário) |
| Responsável Pós-Produção | 23 | `32` = Virafilme(Best Image), `258` = Bright River |
| GTIN | 1 | — |
| OS | 2 | — |

## 2. Escopo

**Entra:**
- Nova aba "Agenda de Edição" ao lado da fila atual (mesmo padrão visual de abas de topo do
  sphoto: `qa-top-tabs`/`qa-top-tab-btn`).
- Busca issues com `Situação das Imagens` em `{85, 97}` — diferente do `montarAgendaEdicao` do
  sphoto, que só busca `85`. Precisa incluir `97` (entregue) senão o item some da lista assim
  que fica pronto, e a regra de "100% verde quando entregue" nunca teria o que mostrar.
- Tabela: OS, GTIN, Produto, Responsável, Previsão de Entrega, barra de progresso.
- 3 abas internas de filtro por responsável: Todos / Virafilme(Best Image) / Bright River.
- Filtro de período: dois campos de data (de/até) sobre a Previsão de Entrega.
- Filtros aplicados **no front**, sobre os dados já carregados (base pequena, sem ida-e-volta
  ao servidor por filtro).

**Fica de fora:**
- Qualquer escrita no Redmine — esta aba é só leitura.
- Scripts operacionais, entrega do TXT — sub-projetos seguintes.

## 3. Cálculo da barra de progresso

```
inicio = DT Envio para Edição (cf_21)
fim = Previsão entrega Pós-Produção (cf_34)
hoje = data atual (YYYY-MM-DD)

Se Situação == 97 (Qualidade Aprovada):
    progresso = 100, cor = verde  (sempre, independente da data)
Senão se inicio ou fim ausente:
    progresso = null, cor = cinza (sem dado suficiente pra calcular)
Senão:
    percentualBruto = (hoje - inicio) / (fim - inicio) * 100
    progresso = percentualBruto limitado a [0, 100]
    Se progresso < 30: cor = verde
    Senão se progresso < 60: cor = amarelo
    Senão: cor = vermelho
```

(O caso "vermelho, prazo estourado e não entregue" já cai naturalmente na última faixa —
`progresso` fica em 100 quando `hoje >= fim`, e a cor correspondente a `>= 60` é vermelho.)

Datas comparadas como string `YYYY-MM-DD` (mesmo formato que o Redmine já devolve) convertidas
pra `Date`/timestamp só na hora do cálculo — sem fuso-horário envolvido, comparação por dia.

## 4. Backend

- `lib/redmine.js`: nova `buscarIssuesAgenda(basePath)` — `GET /issues.json` filtrando
  `cf_15` em `[85, 97]` (duas chamadas ou um filtro OR, a decidir na implementação — Redmine REST
  não faz OR nativo em custom field simples, então provavelmente duas buscas paginadas
  concatenadas, mesmo padrão de paginação de `buscarIssuesEmEdicao` do sphoto). Devolve os
  `custom_fields` brutos de cada issue.
- `lib/qaSyndi.js`: nova `calcularProgresso(dtEnvio, previsaoEntrega, situacao, hoje)` → `{
  progresso: number|null, cor: 'verde'|'amarelo'|'vermelho'|'cinza' }` — pura, testável, regra da
  seção 3. `hoje` é parâmetro injetado (não `new Date()` interno), mesmo princípio já usado em
  `gerarLinhaTxt`/`anexarTxtRetrabalho`.
- `lib/qaSyndi.js`: nova `montarItemAgenda(issue, hoje)` — porta `montarItemAgenda` do sphoto
  (extrai GTIN/produto do subject, mesma lógica), acrescentando `responsavel` (cf_23 bruto) e o
  resultado de `calcularProgresso`.
- Nova rota `GET /api/agenda` → `{ ok, itens: [...] }`, cada item com `{ os, gtin, produto,
  responsavel, previsaoEntrega, progresso, cor }`.

## 5. Front-end

- Aba de topo "Agenda de Edição" (`viewAtiva`, mesmo padrão do sphoto).
- 3 botões de filtro de responsável (Todos/Virafilme/Bright River) — filtra o array já carregado
  em memória.
- Dois `<input type="date">` (de/até) — filtra por `previsaoEntrega` dentro do intervalo,
  também em memória.
- Tabela com barra de progresso: `<div>` com largura = `progresso`% e cor de fundo conforme
  `cor` — CSS novo (`qa-progresso-barra`/`qa-progresso-preenchido`), já que não existe nada
  parecido no `qa.css` atual.
- Carrega a agenda sob demanda (só quando a aba é aberta pela primeira vez), mesmo princípio do
  `mudarParaAgenda`/`agendaCarregadaAlgumaVez` do sphoto — evita custo de rede toda vez que o
  analista alterna de aba.

## 6. Testes

- `calcularProgresso`: `node:test`, cobrindo os 5 ramos (entregue, sem dados, verde, amarelo,
  vermelho) incluindo os limites exatos (29%/30%/59%/60%/100%).
- `montarItemAgenda`: extração de GTIN/produto do subject (casos com e sem `cf_1` preenchido).
- `buscarIssuesAgenda`: sem teste automatizado (rede real) — verificação manual, mesmo padrão já
  usado no projeto pras funções de `lib/redmine.js` que fazem fetch.
- `GET /api/agenda`: verificação manual via curl contra o Redmine real.
