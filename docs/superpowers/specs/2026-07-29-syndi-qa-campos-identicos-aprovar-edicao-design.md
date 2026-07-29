# Syndi_qa — Sub-projeto: campos idênticos entre Aprovar e QA para Edição

O painel "Enviar para Edição" (Aprovar GTIN) e a aba "QA para Edição" gravam quase os mesmos
campos no Redmine, mas não exatamente os mesmos: faltam "Responsável QA Imagem" e "Responsável
3º Check" no painel de Aprovar. Isso obriga o analista a trocar de aba quando precisa desses 2
campos. Este spec deixa os dois conjuntos de campos idênticos (exceto Situação, que continua só
na aba Edição), pra resolver o caso comum ("editar tudo e aprovar") numa aba só — a aba QA para
Edição continua existindo, pro caso de corrigir campos sem mover a pasta.

## 0. Contexto — decomposição maior

1-16. (ver specs anteriores — as mais relevantes aqui são identidade do analista, que criou a
gravação automática de `cf_85` no Aprovar, e campos-edicao-3check, que adicionou
`responsavelQaImagem`/`responsavel3Check` só na aba Edição.)
17. **Este spec** — os mesmos 2 campos passam a existir também no painel de Aprovar.

## 1. Decisões confirmadas com o usuário

- **As duas abas continuam existindo** — não é fusão/eliminação. Aprovar grava campos E move a
  pasta (ação definitiva); QA para Edição grava campos sem mover nada (correção pontual, a
  qualquer momento). O pedido é só igualar os CAMPOS disponíveis nas duas, pra resolver o caso
  comum sem precisar trocar de aba.
- **Painel de Aprovar ganha "Responsável QA Imagem" e "Responsável 3º Check"** — mesmos
  dropdowns já usados na aba Edição, mesmas opções (`redmine-campos.json`, `cf_85`/`cf_172`).
- **Sempre vazios ao abrir o painel** — sem consultar o Redmine antes de aprovar (o painel de
  Aprovar hoje só lê a pasta local pra inferir sugestões, nunca chama o Redmine antes de
  confirmar; isso não muda). Se o analista quiser ver o valor JÁ gravado na issue, abre a aba QA
  para Edição.
- **"Responsável QA Imagem" deixa de ser gravado automaticamente via identidade NO APROVAR** —
  vira um campo manual (dropdown), igual já é na aba Edição desde o spec anterior. O analista
  pode deixar como está (equivalente a reatribuir pra si mesmo, se quiser) ou escolher outra
  pessoa.
- **Retrabalho NÃO muda** — continua gravando `cf_85` automaticamente via identidade, exatamente
  como hoje. Não tem um formulário de campos como Aprovar/Edição, então essa mudança não se
  aplica lá.
- **Bloqueio de identidade obrigatória continua no Aprovar** — ainda precisa da engrenagem
  configurada pra poder aprovar (mesmo princípio já usado na aba Edição: o bloqueio é sobre
  poder gravar QUALQUER coisa nesse fluxo, não sobre o valor específico de `cf_85`). Só o PUT em
  si deixa de incluir `userId` automaticamente — o valor de `cf_85` vem do novo dropdown.

## 2. Backend

- `lib/redmine.js`: `montarCamposEdicao(campos)` (usada só pelo Aprovar) — troca a linha
  `if (campos.userId) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.userId) });`
  por duas novas condicionais, no MESMO padrão já usado em `montarCamposEdicaoCompleto`:
  ```js
  if (campos.responsavelQaImagem) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.responsavelQaImagem) });
  if (campos.responsavel3Check) lista.push({ id: CF_RESPONSAVEL_3_CHECK, value: String(campos.responsavel3Check) });
  ```
  `marcarRetrabalhoFotografia` **não muda** — continua usando `userId` pra `cf_85` como hoje.
- `server.js`, rota `POST /api/aprovar`: continua validando `userId` obrigatório (bloqueio de
  identidade, sem mudança nessa checagem), mas passa a ler `responsavelQaImagem`/
  `responsavel3Check` do corpo (mesmo padrão `typeof === 'string' ? trim() : ''` já usado pros
  outros campos dessa rota) e NÃO inclui mais `userId` dentro do objeto `campos` passado pra
  `redmine.gravarCamposEdicao` — em vez disso, inclui os 2 campos novos.

## 3. Front-end

- `js/qa.js`: `formEnvio` ganha `responsavelQaImagem: ''`/`responsavel3Check: ''`. Resetados pra
  vazio em `abrirPainelEnvio` (mesmo lugar onde `numeroMockup`/`orientacoesMockup` já são
  resetados hoje). `aprovarGtin` passa a incluir os 2 campos no corpo do `POST /api/aprovar`
  (substituindo o `userId: analistaId.value` que ia nesse mesmo objeto — `userId` continua
  sendo enviado no corpo, só que agora só serve pro bloqueio de identidade do lado do servidor,
  não vira mais `cf_85` automaticamente).
- `syndi_qa.html`: painel `.qa-editadas-recebidas` (Enviar para Edição) ganha 2 blocos
  `qa-campo-linha` novos, logo depois de "Qtd Imagens Mockup" e antes do bloco condicional de
  Mockup (número/orientações) — mesmos selects já usados na aba Edição, reaproveitando as
  mesmas refs `opcoesResponsavelQaImagem`/`opcoesResponsavel3Check` (já carregadas globalmente
  por `carregarOpcoesResponsavel`, sem precisar duplicar a chamada).

## 4. O que fica de fora

- Qualquer mudança na aba "QA para Edição" em si — ela continua exatamente como está.
- Qualquer mudança no Retrabalho — `cf_85` continua automático lá.
- Sugestão automática/inferência local pros 2 campos novos no Aprovar — nascem vazios, mesmo
  princípio já usado na aba Edição (sem heurística de pasta pra esses 2 campos).
- Consulta ao Redmine antes de abrir o painel de Aprovar — continua só lendo a pasta local.

## 5. Testes

- `lib/redmine.test.js`: `montarCamposEdicao` — inclui `cf_85`/`cf_172` quando
  `responsavelQaImagem`/`responsavel3Check` vêm preenchidos; NÃO inclui `cf_85` quando só
  `userId` vem preenchido (confirma que a remoção do uso de `userId` funcionou, mesmo padrão do
  teste já existente pra `montarCamposEdicaoCompleto`).
- `server.js`: verificação manual via curl — aprovar com os 2 campos novos preenchidos, confirma
  que a issue recebe os ids 85/172 corretos; aprovar sem `userId` no corpo continua bloqueando
  com 400 (bloqueio de identidade intacto).
- Front-end: verificação manual — os 2 selects aparecem no painel de Aprovar, populados com as
  opções certas; abrir o painel de novo (outro GTIN) confirma que nascem vazios.
