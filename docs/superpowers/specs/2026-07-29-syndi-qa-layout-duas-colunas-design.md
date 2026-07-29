# Syndi_qa — Sub-projeto: layout em duas colunas na aba "QA de Foto"

A aba "QA de Foto" (dentro do detalhe de um GTIN) hoje empilha tudo verticalmente: legenda,
botões Recorte/Mockup, grades RAIZ/RT/IS/AP, painel de motivos de retrabalho, e o painel de
"Enviar para Edição" (com os campos de Mockup, adicionados no sub-projeto anterior) — nessa
ordem, um embaixo do outro. Com GTINs de muitas fotos, o analista precisa rolar bastante pra
alcançar os campos de ação (motivos, aprovar, número do mockup), que só aparecem no fim da
página. Este spec reorganiza em duas colunas: grade de fotos rolando à esquerda, painel de ação
sempre visível à direita.

Decidido visualmente com o usuário via mockup interativo (companheiro visual da skill de
brainstorming) — confirmado sem ressalvas.

## 0. Contexto — decomposição maior

1-14. (ver specs anteriores.)
15. **Este spec** — layout em duas colunas na aba QA de Foto, pra reduzir rolagem.

## 1. Decisões confirmadas com o usuário

- **Duas colunas**: coluna esquerda com a grade de fotos (RAIZ + RT/IS/AP), rolando de forma
  independente; coluna direita com o painel de ação — legenda de cores, botões Recorte/Mockup,
  motivos de retrabalho, painel "Enviar para Edição" (incluindo Número do Mockup/Orientações), e
  os botões Aprovar GTIN/Confirmar Retrabalho — sempre visível, sem precisar rolar até o fim da
  grade de fotos pra alcançar.
- **Coluna direita com scroll interno próprio**: tem altura igual à coluna esquerda; se o
  conteúdo dela for maior que essa altura (ex.: painel de motivos + painel de envio completo
  abertos ao mesmo tempo), rola só dentro dela — nunca sai da área visível da tela.
- **Fallback pra telas estreitas**: abaixo de ~900px de largura de viewport, volta pro layout
  empilhado de hoje (1 coluna, tudo em sequência vertical) — evita colunas espremidas demais pra
  ler em notebooks pequenos.
- **Escopo: só a aba "QA de Foto"** — a aba "QA para Edição" (formulário com os 6 campos do
  Redmine) não muda, continua com seu layout atual.

## 2. O que entra em cada coluna

**Coluna esquerda** (`qa-coluna-fotos`):
- Título/contagem "Raiz (N)" + grade RAIZ
- Títulos/contagem + grades RT/IS/AP (quando existirem fotos nelas)

**Coluna direita** (`qa-coluna-acoes`):
- Legenda de cores (`_coding`/RT/IS/AP)
- Botões "Tipo de pós-produção" (Recorte/Mockup)
- Painel de motivos (`qa-motivos-painel`, só quando uma foto está ativa)
- Painel "Enviar para Edição" (`qa-editadas-recebidas`, só quando `painelEnvio` está aberto —
  Responsável Pós-Produção, Qtd Recorte, Qtd Mockup, e — quando destino é Mockup — Número do
  Mockup + Orientações)
- Botões "Aprovar GTIN" / "Confirmar Retrabalho" (sempre visíveis nessa coluna, não dentro do
  painel de envio) + mensagens de sucesso/erro

Nada muda de COMPORTAMENTO (nenhuma lógica JS nova) — é reorganização pura de onde os elementos
já existentes aparecem na tela. As condicionais `v-if`/`v-show` já existentes continuam as
mesmas, só mudam de qual container HTML os elementos ficam dentro.

## 3. CSS

Nova classe `.qa-foto-layout` (flex container, `display: flex`, `gap`), envolvendo as duas
colunas. `.qa-coluna-fotos` (`flex: 1.4`, `overflow-y: auto`) e `.qa-coluna-acoes` (`flex: 1`,
`overflow-y: auto`, com uma borda/fundo sutil pra separar visualmente da grade, como no mockup
aprovado). Ambas com a mesma `height` (calculada a partir do espaço disponível abaixo da
legenda/abas — mesmo princípio que `.qa-detalhe` já usa hoje com `flex: 1; overflow-y: auto`).

Media query: abaixo de `900px` de largura, `.qa-foto-layout` vira `flex-direction: column` (ou
`display: block`), removendo a altura fixa/scroll interno das colunas — volta a empilhar e rolar
a página inteira, mesmo comportamento de hoje.

## 4. O que fica de fora

- Qualquer mudança na aba "QA para Edição" (fica como está).
- Qualquer mudança de comportamento/lógica — é só reposicionamento visual dos elementos que já
  existem hoje.
- Redesenho da grade de fotos em si (tamanho de miniatura, colunas do grid) — só o container ao
  redor dela muda.

## 5. Testes

Sem lógica nova, sem testes automatizados aplicáveis (mudança é HTML/CSS). Verificação manual:
abrir um GTIN com bastante fotos (RAIZ+RT+IS), confirmar que a coluna direita permanece visível
sem rolar a página, que motivos/envio/mockup aparecem e funcionam como antes dentro da coluna
direita, e que em uma janela estreita (redimensionar abaixo de 900px) o layout volta a empilhar
como hoje.
