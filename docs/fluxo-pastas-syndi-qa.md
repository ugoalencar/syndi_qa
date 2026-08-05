# Fluxo de pastas do Syndi_qa / SyncIMGSend

Este documento descreve a estrutura de pastas necessária para testar o fluxo do Syndi_qa: de onde vem a fila do QA, para onde a pasta vai ao aprovar, para onde vai no retrabalho e quais sinais dentro da pasta do GTIN influenciam a decisão.

## 1. Base do SyncIMGSend

O Syndi_qa lê e move imagens dentro da base local do robô SyncIMGSend.

Base padrão:

```text
C:\Apps\SyncIMGSend
```

Pode ser sobrescrita por `caminhos-locais.json` na raiz do projeto:

```json
{
  "syncimgSendBase": "D:\\algum\\caminho"
}
```

Diretórios principais derivados dessa base:

```text
<syncimgSendBase>\AgConferencia  ← entrada / fila do QA
<syncimgSendBase>\AgEnvio        ← saída ao aprovar / enviar para edição
<syncimgSendBase>\Retrabalho     ← saída ao confirmar retrabalho
```

No padrão atual:

```text
C:\Apps\SyncIMGSend\AgConferencia
C:\Apps\SyncIMGSend\AgEnvio
C:\Apps\SyncIMGSend\Retrabalho
```

Referências no código:

- `lib/qaSyndi.js:10-30` define default, lê `caminhos-locais.json` e deriva `AGCONFERENCIA`, `AGENVIO`, `RETRABALHO`.
- `server.js:100-103` lê a fila a partir de `qaSyndi.AGCONFERENCIA`.

## 2. Entrada: fila do QA

A fila exibida na tela vem exclusivamente de:

```text
C:\Apps\SyncIMGSend\AgConferencia
```

Estrutura mínima:

```text
C:\Apps\SyncIMGSend\AgConferencia\
  OS_<numero>---(...opcional...)\
    <gtin>\
      foto_0.jpg
      foto_1.jpg
```

Exemplo válido:

```text
C:\Apps\SyncIMGSend\AgConferencia\
  OS_99999---(1 GTINs)---2026-08-05\
    7890000000001\
      foto_0.jpg
      foto_1.jpg
```

Regras de nome:

- A pasta da OS precisa começar com `OS_` seguido do número.
- A pasta do GTIN precisa começar com os dígitos do GTIN.
- Pastas fora desse padrão são ignoradas pela fila.

Referências:

- `lib/qaSyndi.js:55-81` define regex e lista OS/GTINs.
- `server.js:99-103` expõe `GET /api/fila`.

## 3. Aprovar / Enviar para edição

Na tela, o botão **Aprovar GTIN** abre o painel **Enviar para Edição**. O movimento real acontece no botão **Confirmar e Enviar**.

Fluxo físico:

```text
Origem:
C:\Apps\SyncIMGSend\AgConferencia\<pasta OS>\<pasta GTIN>\

Destino:
C:\Apps\SyncIMGSend\AgEnvio\<pasta OS>\<pasta GTIN>\
```

Exemplo:

```text
C:\Apps\SyncIMGSend\AgConferencia\OS_99999---(1 GTINs)---2026-08-05\7890000000001\
↓
C:\Apps\SyncIMGSend\AgEnvio\OS_99999---(1 GTINs)---2026-08-05\7890000000001\
```

A unidade de decisão é o GTIN inteiro: a pasta inteira do GTIN é movida, preservando fotos e subpastas.

Antes de mover, o backend tenta gravar campos no Redmine. Se essa gravação falhar, a pasta não é enviada.

Campos que podem ser gravados nesse fluxo:

- Responsável Pós-Produção
- Qtd Imagens Recorte
- Qtd Imagens Mockup
- Responsável QA Imagem
- Responsável 3º Check

O Syndi_qa não grava `Situação das Imagens` nesse fluxo; isso continua sob responsabilidade do robô.

Referências:

- `server.js:335-423` implementa `POST /api/aprovar`.
- `server.js:407-418` grava Redmine antes de mover.
- `lib/qaSyndi.js:374-390` implementa `aprovarGtin`.
- `lib/redmine.js:96-129` monta/grava campos de edição.

### TXT que viaja junto ao aprovar

Se o destino do GTIN for `Mockup`, o servidor exige o número do mockup e cria:

```text
Mockup_<gtin>.txt
```

Se o destino for `Recorte` e houver orientações selecionadas, o servidor cria:

```text
Recorte_<gtin>.txt
```

Esses arquivos são criados dentro da pasta do GTIN ainda em `AgConferencia`, antes do move. Assim, viajam junto para `AgEnvio`.

Referências:

- `server.js:379-399` detecta `Mockup`/`Recorte` e prepara os dados de TXT.
- `lib/qaSyndi.js:350-367` grava `Mockup_<gtin>.txt` e `Recorte_<gtin>.txt`.
- `lib/qaSyndi.js:374-390` grava TXT antes de mover a pasta.

## 4. Retrabalho

Ao confirmar retrabalho, a pasta inteira do GTIN sai da fila e vai para `Retrabalho`.

Fluxo físico:

```text
Origem:
C:\Apps\SyncIMGSend\AgConferencia\<pasta OS>\<pasta GTIN>\

Destino:
C:\Apps\SyncIMGSend\Retrabalho\<pasta OS>\<pasta GTIN>\
```

Exemplo:

```text
C:\Apps\SyncIMGSend\AgConferencia\OS_99996---(1 GTINs)---2026-08-05\7890000000004\
↓
C:\Apps\SyncIMGSend\Retrabalho\OS_99996---(1 GTINs)---2026-08-05\7890000000004\
```

Mesmo que apenas uma foto tenha sido marcada, a pasta inteira do GTIN é movida. Isso preserva contexto para o fotógrafo.

Além do move, o sistema cria/anexa um TXT único por OS:

```text
C:\Apps\SyncIMGSend\Retrabalho\<pasta OS>\Retrabalho_OS_<numero-da-os>.txt
```

Formato de linha:

```text
<gtin> - <arquivo>: <motivo1>, <motivo2>
```

Exemplo:

```text
7890000000004 - foto_0.jpg: Fotografia tremida
```

Depois do move e do TXT, o backend tenta marcar o Redmine como `Retrabalho Fotografia`. Se o Redmine falhar, o move e o TXT não são desfeitos; a tela apenas mostra aviso.

Referências:

- `server.js:426-486` implementa `POST /api/retrabalho`.
- `server.js:466-480` move, gera TXT e tenta Redmine.
- `lib/qaSyndi.js:461-492` gera linha/TXT e move a pasta para retrabalho.
- `lib/redmine.js:64-85` marca `Retrabalho Fotografia` no Redmine.

## 5. Sinais dentro da pasta do GTIN

Dentro de cada pasta de GTIN, existem três tipos de sinal.

### 5.1 Fotos na raiz

```text
<GTIN>\
  foto_0.jpg
  foto_1.jpg
```

Fotos na raiz aparecem na grade principal e são usadas para contagem de quantidade, exceto quando têm `_coding` no nome.

### 5.2 `_coding`

Exemplo:

```text
foto_1_coding.jpg
```

Significado:

- foto de referência/coding;
- não entra na contagem de `Qtd Recorte` ou `Qtd Mockup`;
- quando não há `Mockup`, `Recorte` nem `RT/IS/AP`, pode indicar fallback para `Recorte / Bright River`.

Referências:

- `lib/qaSyndi.js:137-151` adiciona/remove `_coding`.
- `server.js:236-270` expõe `/api/marcar-coding`.
- `lib/qaSyndi.js:198-249` usa `_coding` na inferência.

### 5.3 Subpastas de tag: RT / IS / AP

```text
<GTIN>\RT\
<GTIN>\IS\
<GTIN>\AP\
```

Significados:

```text
RT = Rótulo
IS = Insumos
AP = Apoio
```

Essas são subpastas reais que podem conter fotos.

Impacto:

- fotos em `RT/IS/AP` não entram na quantidade de Recorte/Mockup;
- existência de foto em `RT/IS/AP` é sinal de trabalho local/Virafilme;
- se houver `Recorte` + `RT/IS/AP`, o sinal `RT/IS/AP` tem prioridade e sugere Virafilme.

Referências:

- `lib/qaSyndi.js:53-55` define `RT`, `IS`, `AP`, `Mockup`, `Recorte`.
- `lib/qaSyndi.js:118-135` move foto para/de `RT/IS/AP`.
- `server.js:198-234` expõe `/api/tag-subpasta`.
- `lib/qaSyndi.js:198-249` usa `RT/IS/AP` na inferência.

### 5.4 Subpastas-sinal: Mockup / Recorte

```text
<GTIN>\Mockup\
<GTIN>\Recorte\
```

Essas pastas são sinalizadores. Normalmente ficam vazias. A existência da pasta é o sinal.

Impacto:

- `Mockup` marcado:
  - sugere Virafilme;
  - preenche `Qtd Mockup` com fotos da raiz sem `_coding`;
  - exige `Número do Mockup` no envio.
- `Recorte` marcado:
  - com `_coding` e sem `RT/IS/AP`, sugere Bright River;
  - com `RT/IS/AP`, sugere Virafilme;
  - sem `_coding` e sem `RT/IS/AP`, fica indefinido.
- `Mockup` e `Recorte` ao mesmo tempo geram conflito/indefinido.

Referências:

- `lib/qaSyndi.js:159-174` cria/remove subpasta-sinal `Mockup`/`Recorte`.
- `server.js:273-308` expõe `/api/marcar-destino`.
- `lib/qaSyndi.js:198-249` implementa a inferência.

## 6. Cenários de teste prontos

### Cenário A — Recorte / Bright River

```text
C:\Apps\SyncIMGSend\AgConferencia\
  OS_99999---(1 GTINs)---2026-08-05\
    7890000000001\
      foto_0.jpg
      foto_1_coding.jpg
      Recorte\
```

Esperado:

- aparece na fila;
- destino mostra `Recorte`;
- painel de envio tende a sugerir Bright River;
- se marcar orientações, ao aprovar gera `Recorte_7890000000001.txt` em `AgEnvio`.

### Cenário B — Mockup / Virafilme

```text
C:\Apps\SyncIMGSend\AgConferencia\
  OS_99998---(1 GTINs)---2026-08-05\
    7890000000002\
      foto_0.jpg
      foto_1.jpg
      Mockup\
```

Esperado:

- aparece na fila;
- destino mostra `Mockup`;
- painel exige `Número do Mockup`;
- ao aprovar gera `Mockup_7890000000002.txt` em `AgEnvio`.

### Cenário C — Recorte com RT/IS/AP / Virafilme

```text
C:\Apps\SyncIMGSend\AgConferencia\
  OS_99997---(1 GTINs)---2026-08-05\
    7890000000003\
      foto_0.jpg
      foto_1_coding.jpg
      Recorte\
      RT\
        rotulo.jpg
```

Esperado:

- destino mostra `Recorte`;
- por existir foto em `RT`, a inferência tende a Virafilme;
- quantidade de Recorte conta apenas fotos da raiz sem `_coding`.

### Cenário D — Retrabalho

```text
C:\Apps\SyncIMGSend\AgConferencia\
  OS_99996---(1 GTINs)---2026-08-05\
    7890000000004\
      foto_0.jpg
      foto_1.jpg
```

Na tela:

1. selecione uma foto para retrabalho;
2. marque um motivo;
3. clique **Confirmar Retrabalho**.

Esperado:

```text
C:\Apps\SyncIMGSend\Retrabalho\OS_99996---(1 GTINs)---2026-08-05\7890000000004\
C:\Apps\SyncIMGSend\Retrabalho\OS_99996---(1 GTINs)---2026-08-05\Retrabalho_OS_99996.txt
```

## 7. Resumo visual em texto

```text
ENTRADA / FILA QA
C:\Apps\SyncIMGSend\AgConferencia\<OS>\<GTIN>
        │
        ├─ Aprovar / Confirmar e Enviar
        │      ├─ grava campos no Redmine antes do move
        │      ├─ se Mockup: cria Mockup_<gtin>.txt
        │      ├─ se Recorte com orientações: cria Recorte_<gtin>.txt
        │      ▼
        │   C:\Apps\SyncIMGSend\AgEnvio\<OS>\<GTIN>
        │
        └─ Confirmar Retrabalho
               ├─ move a pasta inteira do GTIN
               ├─ cria/anexa Retrabalho_OS_<os>.txt na pasta da OS
               ├─ tenta marcar Redmine depois do move
               ▼
            C:\Apps\SyncIMGSend\Retrabalho\<OS>\<GTIN>
```

## 8. Prompt para pedir um material visual a outro agente

Use o prompt abaixo para pedir a outro agente um diagrama visual do fluxo:

```text
Crie um material visual claro sobre o fluxo de pastas do sistema Syndi_qa / SyncIMGSend.

Contexto:
- O sistema lê a fila de QA em C:\Apps\SyncIMGSend\AgConferencia.
- Cada item da fila tem estrutura C:\Apps\SyncIMGSend\AgConferencia\<OS>\<GTIN>.
- Ao aprovar / confirmar envio para edição, a pasta inteira do GTIN sai de AgConferencia e vai para C:\Apps\SyncIMGSend\AgEnvio\<OS>\<GTIN>.
- Antes de mover para AgEnvio, o backend tenta gravar campos de edição no Redmine. Se falhar, não move.
- Se o destino for Mockup, cria Mockup_<gtin>.txt dentro da pasta do GTIN antes do move.
- Se o destino for Recorte e houver orientações, cria Recorte_<gtin>.txt dentro da pasta do GTIN antes do move.
- Ao confirmar retrabalho, a pasta inteira do GTIN sai de AgConferencia e vai para C:\Apps\SyncIMGSend\Retrabalho\<OS>\<GTIN>.
- No retrabalho, também cria/anexa C:\Apps\SyncIMGSend\Retrabalho\<OS>\Retrabalho_OS_<os>.txt.
- Depois do move para Retrabalho, tenta marcar Redmine como Retrabalho Fotografia; se falhar, não desfaz o move/TXT.

Sinais dentro de <GTIN>:
- fotos .jpg na raiz: fotos principais do QA.
- *_coding.jpg: foto de referência/coding; não conta na quantidade de Recorte/Mockup.
- RT\, IS\, AP\: subpastas reais com fotos; significam Rótulo, Insumos e Apoio; sinalizam trabalho local/Virafilme.
- Mockup\ e Recorte\: subpastas-sinal normalmente vazias; indicam tipo de pós-produção.

Quero um visual em português, estilo documentação operacional, para alguém montar cenários de teste manual.

Entregue:
1. Um diagrama principal do fluxo com três colunas: Entrada QA, Enviar para Edição, Retrabalho.
2. Um mini-diagrama da estrutura interna de uma pasta <GTIN>, mostrando fotos, *_coding.jpg, RT/IS/AP, Mockup e Recorte.
3. Uma tabela curta com “ação na tela”, “origem”, “destino”, “arquivos TXT gerados” e “efeito no Redmine”.
4. Destaques visuais para alertas:
   - Aprovar bloqueia se Redmine falhar antes do move.
   - Retrabalho não desfaz move/TXT se Redmine falhar depois.
   - Após aprovar ou retrabalhar, o GTIN some da fila porque saiu de AgConferencia.

Formato preferido:
- Se puder gerar imagem/HTML, faça um layout limpo em 16:9, com setas e blocos.
- Se não puder gerar imagem, entregue Mermaid e uma versão ASCII.
- Use cores consistentes: AgConferencia em azul, AgEnvio em verde, Retrabalho em laranja/vermelho, Redmine em roxo/cinza.
```
