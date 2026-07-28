# Syndi_qa — Sub-projeto: Preview reduzido de imagens

Encontrado ao investigar uma reclamação de lentidão comparada ao sphoto: as fotos que chegam em
`AgConferencia` são exports finais do Lightroom em altíssima qualidade — **15 a 18 MB cada uma**.
Um GTIN com 6-10 fotos significa carregar 100-200 MB só pra abrir a grade de miniaturas. O sphoto
não tem esse problema porque, pro RAW, ele extrai um JPEG **já embutido pela câmera** (mesma
resolução, ~12x mais leve) — truque que não existe pra um JPEG já exportado (só tem uma thumbnail
de EXIF de ~160px, pequena demais pra conferência de defeito). É preciso gerar um preview de
verdade (decodificar + redimensionar + recomprimir).

Uma correção menor e independente já foi commitada direto em `master` (`8025f5f`): o front-end
agora reaproveita os nomes de pasta que `GET /api/gtin` já resolveu, evitando que `GET /api/imagem`
varra o disco de novo a cada foto. Isso ajuda, mas o gargalo real é o tamanho do arquivo, não a
resolução do caminho — daí este spec.

## 0. Contexto — decomposição maior

1-6. (ver specs anteriores, todos mergeados: retrabalho, tagging+zoom, envio-edição, Agenda de
Edição, aba QA para Edição, scripts operacionais).
7. Correções QA de Foto/QA para Edição (mergeado 2026-07-28).
8. Correção pontual: reaproveitar nomes de pasta em `/api/imagem` (mergeado 2026-07-28, `8025f5f`).
9. **Este spec** — preview reduzido de imagens.
10. Analyst identity ("engrenagem") pra gravações no Redmine — ainda na fila.

## 1. Decisões confirmadas com o usuário

- **Tamanho do arquivo é proposital** — são fotos de entrega em altíssima qualidade, não dá pra
  pedir que a exportação do Lightroom mude. A solução é gerar um preview só pra exibição em tela,
  nunca tocar no arquivo original (que continua saindo intacto pra `AgEnvio`/entrega).
- **Adicionar uma dependência nova** (`sharp`, biblioteca madura de imagem baseada em libvips) —
  quebra a regra histórica de "zero dependência" do projeto, decisão consciente do usuário. `sharp`
  baixa um binário pré-compilado por plataforma no `npm install` — precisa de internet **uma vez**,
  na instalação da máquina, não em tempo de execução (a tela em si continua funcionando 100%
  offline depois de instalada, mesma regra de sempre).
- **Miniatura da grade E o modal de ampliar usam preview reduzido** — não só a miniatura. O modal
  usa uma versão maior que a miniatura, mas ainda muito menor que o original.
- **Cache em disco**, gerado uma vez, reaproveitado depois — não gera em memória a cada request.

## 2. Tamanhos e qualidade

| Uso | Largura máxima | Qualidade JPEG |
|---|---|---|
| Miniatura (grade) | 500px | 78 |
| Ampliar (modal) | 2000px | 88 |

(Só redimensiona se a imagem original for maior que o alvo — nunca aumenta uma foto pequena.)

## 3. Onde o preview fica gravado

Pasta própria no projeto, fora de `AgConferencia` (não pode se misturar com as pastas de GTIN que o
robô gerencia, nem ser varrida por `listarImagensDir`): `preview-cache/` na raiz do Syndi_qa,
gitignored (mesmo padrão de `logs/`).

**Chave do cache**: hash (SHA1) do caminho absoluto do arquivo original + `mtimeMs` + `size` — se o
arquivo for movido (Aprovar move pra `AgEnvio`, Retrabalho move pra `Retrabalho`) ou renomeado
(`_coding`, mover pra RT/IS/AP), o caminho muda, a chave muda, e uma entrada de cache nova é gerada
sob demanda no próximo pedido — a entrada antiga fica órfã (nunca mais é pedida, nunca é limpa
ativamente nesta primeira versão; ver seção 6). Isso evita ensinar `aprovarGtin`/`retrabalharGtin`/
`moverParaSubpastaSyndi`/`toggleCodingSyndi` (já testados e mergeados) a mover/renomear cache junto
— o custo é disco extra com previews órfãos pequenos (centenas de KB cada), não uma inconsistência
visível pro analista.

Nome do arquivo de cache: `<sha1>-mini.jpg` / `<sha1>-zoom.jpg` (o hash já incorpora mtime+size, não
precisa repetir no nome).

## 4. Backend

- Novo módulo `lib/previewImagem.js`:
  - `gerarPreview(caminhoOriginal, tamanho)` — `tamanho` é `'mini'` ou `'zoom'`. Calcula a chave de
    cache (hash do caminho absoluto + `fs.statSync` pra mtime/size), confere se o arquivo de cache
    já existe (`preview-cache/<chave>-<tamanho>.jpg`) — se sim, devolve o caminho dele direto, sem
    tocar no `sharp`. Se não, usa `sharp(caminhoOriginal).resize({width: <alvo>, withoutEnlargement:
    true}).jpeg({quality: <qualidade>}).toFile(caminhoCache)`, depois devolve o caminho gerado.
  - Cria `preview-cache/` se não existir (`fs.mkdirSync({recursive:true})`, mesmo padrão de `logs/`
    no `launcher.js`).
- `server.js`: `GET /api/imagem` ganha um novo parâmetro opcional `tamanho` (`mini` | `zoom`,
  ausente = comportamento atual, serve o original direto — usado por curl/debug manual e mantém
  compatibilidade). Quando presente e válido, depois de resolver `caminhoImagem` (lógica atual,
  intocada), chama `previewImagem.gerarPreview` e serve o arquivo de preview em vez do original.
  Falha ao gerar preview (ex.: `sharp` não conseguiu decodificar) cai pro original, com log de aviso
  — nunca quebra a tela por causa do preview.

## 5. Front-end

- `js/qa.js`: `urlImagem(nome, tamanho)` — `tamanho` default `'mini'` quando omitido pelas
  miniaturas da grade (root e subpastas RT/IS/AP); o modal de ampliar passa `'zoom'` explicitamente.
- `syndi_qa.html`: as duas grades de miniatura (raiz e subpastas) chamam `urlImagem(nome)` sem
  mudar nada (já usa o default `'mini'`); o `<img>` do `#modalImagem` passa a chamar
  `urlImagem(imagemAmpliada, 'zoom')`.

## 6. O que fica de fora

- Limpeza ativa de previews órfãos (arquivo original movido/renomeado, cache velho nunca mais
  pedido) — disco é barato pra arquivos desse tamanho, revisitar só se virar problema de verdade.
- Pré-geração em lote (gerar todos os previews de um GTIN assim que ele chega em `AgConferencia`,
  antes do analista abrir a tela) — geração sob demanda (primeiro `GET` de cada tamanho) é
  suficiente por ora; a primeira abertura de um GTIN ainda paga o custo de decodificar+redimensionar
  uma vez, mas isso já é ordens de magnitude mais rápido que transferir 18MB por foto.
- Mudar a extração de preview do RAW do sphoto (`cr2Preview.js`) pra usar `sharp` também — sistemas
  diferentes, sem necessidade de unificar.

## 7. Testes

- `previewImagem.gerarPreview`: `node:test`, usando `fs.mkdtempSync` (mesmo padrão do resto do
  projeto) com uma imagem JPEG real pequena de fixture. Cobre: gera preview na primeira chamada
  (arquivo de cache aparece, dimensão reduzida confirmada via `sharp(...).metadata()`), reaproveita
  na segunda chamada sem regenerar (comparar mtime do arquivo de cache antes/depois), chaves
  diferentes pra `'mini'`/`'zoom'` do mesmo arquivo, chave muda se o caminho de origem mudar.
- `GET /api/imagem?tamanho=mini|zoom`: verificação manual via curl (comparar tamanho de resposta
  com/sem `tamanho`, confirmar que a segunda chamada é bem mais rápida que a primeira pelo cache).
