# Syndi_qa — Sub-projeto: motivos de retrabalho e orientações de mockup em dropdown

Os dois painéis de checkbox da aba "QA de Foto" (motivos de retrabalho, orientações de mockup)
hoje ficam sempre abertos, empilhados verticalmente — mesmo com só 4 opções cada, ocupam espaço
fixo na coluna de ação o tempo todo. Este spec transforma os dois num dropdown compacto:
fechado, mostra só um resumo numa linha; aberto, expande a lista de checkboxes no lugar
(empurrando o conteúdo abaixo), sem virar um overlay flutuante.

## 0. Contexto — decomposição maior

1-15. (ver specs anteriores — a mais relevante aqui é a do layout em duas colunas, que criou a
coluna de ação onde esses dois painéis vivem hoje.)
16. **Este spec** — dropdown com checkboxes pros dois painéis de múltipla escolha.

## 1. Decisões confirmadas com o usuário

- **Motivo da mudança**: layout em duas colunas já aprovado e mergeado; o pedido agora é deixar
  os painéis de motivos/orientações mais compactos, "em lista", dentro da coluna de ação.
- **Continua sendo seleção múltipla** — um select HTML tradicional (`<select>`) só permite 1
  escolha por vez, o que perderia a capacidade de marcar vários motivos/orientações ao mesmo
  tempo (já usada hoje, ex.: uma foto com "desfoque" E "fundo sujo"). Por isso, não é um select
  nativo — é um dropdown customizado com checkboxes dentro.
- **Fechado, mostra um resumo por contagem**: "Selecionar motivos" (nenhum marcado) ou "Motivos
  (N)" (N marcados) — mesmo padrão nos dois painéis ("Selecionar orientações" / "Orientações
  (N)"). Não lista os nomes marcados (evita texto longo/cortado quando marcar vários itens).
- **Expande inline, não flutua por cima**: como a coluna de ação (`.qa-coluna-acoes`, do spec de
  layout anterior) tem scroll interno próprio, um dropdown com `position: absolute` correria o
  risco de ficar cortado visualmente pela borda da coluna quando abre perto do fim da área
  visível. A lista de checkboxes expande INLINE (empurra o conteúdo abaixo pra baixo, como um
  acordeão), sempre dentro do fluxo normal da coluna — sem esse risco.
- **Fecha só ao clicar de novo no botão-resumo** — como não é mais um overlay flutuante (não tem
  nada "por cima" de outro conteúdo), não precisa detectar clique fora da área pra fechar
  automaticamente; um toggle simples no clique do próprio botão já resolve.
- **Aplica nos dois painéis** — motivos de retrabalho E orientações de mockup, mesmo componente
  (bloco de HTML) reaproveitado nos dois lugares (o projeto não usa sistema de componentes Vue,
  então é duplicado, seguindo o padrão já usado no resto do arquivo).

## 2. Estado novo

- `mostrarDropdownMotivos` (`ref(false)`) — controla se a lista de checkboxes de motivos está
  expandida. Fecha automaticamente ao trocar de foto ativa (`selecionarFoto`) — evita ficar
  aberto mostrando os motivos de uma foto que não é mais a selecionada.
- `mostrarDropdownOrientacoes` (`ref(false)`) — controla se a lista de checkboxes de orientações
  está expandida. Fecha automaticamente ao abrir um novo painel de envio (`abrirPainelEnvio`) —
  mesmo princípio, evita estado "aberto" vazando de um GTIN pro outro.

## 3. HTML/CSS

- Novo bloco `qa-dropdown-checkboxes` reaproveitando as classes de cor/espaçamento já existentes
  (`qa-motivo-item` continua valendo pros checkboxes internos) — a diferença visual é só o botão
  de resumo no topo e a lista ficando condicional (`v-if`) ao estado de aberto/fechado.
- Botão de resumo: `<button type="button" class="qa-dropdown-toggle">` com o texto calculado
  (contagem) e um ícone de seta (`bi-chevron-down`/`bi-chevron-up` conforme aberto/fechado, mesmo
  padrão de ícone Bootstrap Icons já usado no resto do projeto).
- A lista de checkboxes (`v-if="mostrarDropdownMotivos"` / `v-if="mostrarDropdownOrientacoes"`)
  fica logo abaixo do botão, reaproveitando a estrutura de checkbox+label já existente hoje —
  só passa a ser condicional em vez de sempre visível.
- CSS novo: `.qa-dropdown-toggle` (botão full-width, alinhado com o resto do painel),
  `.qa-dropdown-lista` (mesma lista de hoje, sem mudança visual interna, só o container pai que
  muda de sempre-visível pra condicional).

## 4. O que fica de fora

- Fechar automaticamente ao clicar fora da lista — desnecessário, já que a lista expande inline
  (não é overlay), então não há "fora" que sobreponha outro conteúdo.
- Busca/filtro dentro do dropdown — as listas são curtas (4 itens cada hoje), não precisa.
- Componentização real (Vue component reutilizável) — fora do padrão do projeto (sem build,
  tudo num arquivo `js/qa.js` + `syndi_qa.html`); o bloco fica duplicado nos 2 lugares, mesmo
  princípio já usado pra outras estruturas repetidas no projeto.

## 5. Testes

Sem lógica de negócio nova (motivos/orientações continuam guardados exatamente do mesmo jeito —
`marcadas[fotoAtiva]`/`formEnvio.orientacoesMockup` — só a exibição muda), sem testes
automatizados aplicáveis. Verificação manual: marcar uma foto ativa, confirmar que o dropdown de
motivos abre/fecha ao clicar no botão-resumo, que o resumo mostra a contagem certa, que trocar de
foto fecha o dropdown, que o mesmo vale pra orientações de mockup dentro do painel de envio.
