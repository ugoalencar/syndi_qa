# Layout em Duas Colunas (QA de Foto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a aba "QA de Foto" passa a mostrar a grade de fotos numa coluna que rola sozinha, e o
painel de ação (legenda, Recorte/Mockup, motivos, Enviar para Edição, Aprovar/Retrabalho) numa
segunda coluna sempre visível ao lado, sem precisar rolar a página inteira pra alcançá-lo.

**Architecture:** reorganização pura de HTML (nenhum `v-if`/`v-show`/lógica JS muda) — os mesmos
blocos que já existem em `syndi_qa.html` são movidos pra dentro de dois novos containers
(`.qa-coluna-fotos`/`.qa-coluna-acoes`), com CSS novo em `css/qa.css` dando a cada coluna scroll
independente, e uma media query fazendo o layout voltar a empilhar em telas estreitas.

**Tech Stack:** HTML/CSS puro, Vue 3 (sem build) — nenhuma mudança em `js/qa.js` nesta feature.

## Global Constraints

- Nenhuma mudança de comportamento/lógica — só onde os elementos existentes aparecem na tela.
  Todas as condicionais (`v-if="fotoAtiva"`, `v-if="painelEnvio"`, `v-if="detalhe.imagens.destino
  === 'Mockup'"`, etc.) continuam exatamente como estão, só mudam de container pai.
- Escopo: só a aba "QA de Foto" (`v-show="abaDetalhe === 'foto'"`). A aba "QA para Edição" não
  muda.
- Abaixo de 900px de largura de viewport, o layout volta a empilhar em 1 coluna (mesmo
  comportamento de hoje).

---

### Task 1: HTML em duas colunas + CSS

**Files:**
- Modify: `syndi_qa.html:166-289`
- Modify: `css/qa.css`

**Interfaces:**
- Consumes: nada de tarefas anteriores (única tarefa do plano).
- Produces: classes CSS novas `.qa-foto-layout`, `.qa-coluna-fotos`, `.qa-coluna-acoes` — não
  consumidas por nenhum outro arquivo, só usadas dentro de `syndi_qa.html`.

- [ ] **Step 1: Reorganizar o HTML em duas colunas**

Em `syndi_qa.html`, encontre o bloco que começa em `<div v-show="abaDetalhe === 'foto'">` (por
volta da linha 166) e termina no `</div>` de fechamento correspondente (por volta da linha 289,
logo antes de `<div v-show="abaDetalhe === 'edicao'">`). O bloco INTEIRO hoje é:

```html
                    <div v-show="abaDetalhe === 'foto'">
                    <div class="qa-legenda">
                        <span class="qa-legenda-item"><span class="qa-legenda-cor coding"></span> _coding (referência de edição)</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor rt"></span> RT - Rótulo</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor is"></span> IS - Insumos</span>
                        <span class="qa-legenda-item"><span class="qa-legenda-cor ap"></span> AP - Apoio</span>
                    </div>

                    <div v-if="carregandoDetalhe" class="qa-vazio">Carregando pasta...</div>
                    <div v-else-if="erroDetalhe" class="text-danger p-3">{{ erroDetalhe }}</div>

                    <template v-else-if="detalhe">
                        <div class="qa-destino-manual">
                            <span class="qa-destino-manual-label">Tipo de pós-produção:</span>
                            <button type="button" class="qa-destino-btn recorte" :class="{ ativa: detalhe.imagens.destino === 'Recorte' }" :disabled="marcandoDestino" @click="marcarDestinoManual('Recorte')">Recorte</button>
                            <button type="button" class="qa-destino-btn mockup" :class="{ ativa: detalhe.imagens.destino === 'Mockup' }" :disabled="marcandoDestino" @click="marcarDestinoManual('Mockup')">Mockup</button>
                        </div>
                        <div class="qa-subpasta-titulo">Raiz ({{ detalhe.imagens.raiz.length }})</div>
                        <div class="qa-grid">
                            <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.raiz" :key="img.nome">
                                <div
                                    class="qa-miniatura"
                                    :class="{ ativa: fotoAtiva === img.nome, marcada: !!marcadas[img.nome], 'tem-coding': img.nome.includes('_coding') }"
                                    @click="ampliarImagem(img.nome, detalhe.imagens.raiz.map(i => i.nome))"
                                >
                                    <img :src="urlImagem(img.nome)" :alt="img.nome" loading="lazy">
                                </div>
                                <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                <div class="qa-acoes-mini">
                                    <input type="checkbox" class="qa-checkbox-retrabalho" title="Selecionar para retrabalho" :checked="fotoAtiva === img.nome" @change="selecionarFoto(img.nome)">
                                    <button type="button" class="qa-acao-mini coding" :class="{ ativa: img.nome.includes('_coding') }" title="Marcar/desmarcar _coding" @click="toggleCoding(img.nome)">C</button>
                                    <button type="button" class="qa-acao-mini rt" title="Mover para Rótulo" @click="toggleSubpasta(img.nome, 'RT')">RT</button>
                                    <button type="button" class="qa-acao-mini is" title="Mover para Insumos" @click="toggleSubpasta(img.nome, 'IS')">IS</button>
                                    <button type="button" class="qa-acao-mini ap" title="Mover para Apoio" @click="toggleSubpasta(img.nome, 'AP')">AP</button>
                                    <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(img.nome, detalhe.imagens.raiz.map(i => i.nome))"><i class="bi bi-zoom-in"></i></button>
                                </div>
                            </div>
                        </div>

                        <template v-for="tag in ['RT', 'IS', 'AP']" :key="tag">
                            <template v-if="detalhe.imagens.subpastas[tag] && detalhe.imagens.subpastas[tag].length">
                                <div class="qa-subpasta-titulo">{{ tag }} ({{ detalhe.imagens.subpastas[tag].length }})</div>
                                <div class="qa-grid">
                                    <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.subpastas[tag]" :key="img.nome">
                                        <div
                                            class="qa-miniatura"
                                            :class="{ ativa: fotoAtiva === (tag + '/' + img.nome), marcada: !!marcadas[tag + '/' + img.nome], ['tem-' + tag.toLowerCase()]: true }"
                                            @click="ampliarImagem(tag + '/' + img.nome, detalhe.imagens.subpastas[tag].map(i => tag + '/' + i.nome))"
                                        >
                                            <img :src="urlImagem(tag + '/' + img.nome)" :alt="img.nome" loading="lazy">
                                        </div>
                                        <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                        <div class="qa-acoes-mini">
                                            <input type="checkbox" class="qa-checkbox-retrabalho" title="Selecionar para retrabalho" :checked="fotoAtiva === (tag + '/' + img.nome)" @change="selecionarFoto(tag + '/' + img.nome)">
                                            <button type="button" class="qa-acao-mini voltar" title="Tirar da subpasta" @click="toggleSubpasta(img.nome, tag)">Voltar p/ raiz</button>
                                            <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(tag + '/' + img.nome, detalhe.imagens.subpastas[tag].map(i => tag + '/' + i.nome))"><i class="bi bi-zoom-in"></i></button>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </template>

                        <div v-if="fotoAtiva" class="qa-motivos-painel">
                            <div class="qa-motivos-titulo">Motivos para {{ fotoAtiva }}</div>
                            <div class="qa-motivos">
                                <label v-for="motivo in motivos" :key="motivo" class="qa-motivo-item">
                                    <input type="checkbox" :checked="(marcadas[fotoAtiva] || []).includes(motivo)" @change="togglarMotivoAtivo(motivo)"> {{ motivo }}
                                </label>
                            </div>
                        </div>

                        <div v-if="painelEnvio" class="qa-editadas-recebidas">
                            <div class="qa-editadas-header"><span>Enviar para Edição</span></div>
                            <div v-if="painelEnvio.destino === 'indefinido'" class="qa-conflito-aviso">
                                <i class="bi bi-exclamation-triangle-fill"></i>
                                Não foi possível inferir automaticamente: {{ painelEnvio.motivo }}. Preencha os campos manualmente (ou confirme sem preencher pra não gravar nada no Redmine).
                            </div>
                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Responsável Pós-Produção</span>
                                <select class="form-select form-select-sm w-auto" v-model="formEnvio.responsavel">
                                    <option value="">-</option>
                                    <option v-for="(rotulo, id) in opcoesResponsavel" :key="id" :value="id">{{ rotulo }}</option>
                                </select>
                            </div>
                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Qtd Imagens Recorte</span>
                                <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="formEnvio.qtdRecorte">
                            </div>
                            <div class="qa-campo-linha">
                                <span class="qa-campo-label">Qtd Imagens Mockup</span>
                                <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="formEnvio.qtdMockup">
                            </div>
                            <template v-if="detalhe.imagens.destino === 'Mockup'">
                                <div class="qa-campo-linha">
                                    <span class="qa-campo-label">Número do Mockup</span>
                                    <input type="text" class="form-control form-control-sm" style="width:160px" v-model="formEnvio.numeroMockup" placeholder="ex.: MK-042">
                                </div>
                                <div class="qa-motivos-painel">
                                    <div class="qa-motivos-titulo">Orientações pro editor (opcional)</div>
                                    <div class="qa-motivos">
                                        <label v-for="orientacao in orientacoesMockup" :key="orientacao" class="qa-motivo-item">
                                            <input type="checkbox" :checked="formEnvio.orientacoesMockup.includes(orientacao)" @change="togglarOrientacaoMockup(orientacao)"> {{ orientacao }}
                                        </label>
                                    </div>
                                </div>
                            </template>
                            <button type="button" class="btn btn-primary btn-sm" :disabled="aprovando || !!mensagem" @click="aprovarGtin">
                                <i class="bi bi-cloud-upload"></i> Confirmar e Enviar
                            </button>
                            <button type="button" class="btn btn-outline-light btn-sm ms-2" :disabled="aprovando" @click="fecharPainelEnvio">Cancelar</button>
                        </div>

                        <div class="qa-enviar-conferencia mt-3">
                            <button type="button" class="btn btn-primary btn-sm" :disabled="temMarcacao() || preparandoEnvio || !!painelEnvio || aprovando || !!mensagem" @click="abrirPainelEnvio">
                                <i class="bi bi-check2-circle"></i> Aprovar GTIN
                            </button>
                            <button type="button" class="btn btn-warning btn-sm" :disabled="!todasMarcacoesTemMotivo() || enviandoRetrabalho || !!mensagem" @click="confirmarRetrabalho">
                                <i class="bi bi-arrow-counterclockwise"></i> Confirmar Retrabalho
                            </button>
                            <span v-if="mensagem" class="ms-3 text-success">{{ mensagem }}</span>
                            <span v-if="erro" class="ms-3 text-danger">{{ erro }}</span>
                        </div>
                    </template>
                    </div>
```

Substitua o bloco INTEIRO acima por:

```html
                    <div v-show="abaDetalhe === 'foto'">
                    <div v-if="carregandoDetalhe" class="qa-vazio">Carregando pasta...</div>
                    <div v-else-if="erroDetalhe" class="text-danger p-3">{{ erroDetalhe }}</div>

                    <template v-else-if="detalhe">
                    <div class="qa-foto-layout">
                        <div class="qa-coluna-fotos">
                            <div class="qa-subpasta-titulo">Raiz ({{ detalhe.imagens.raiz.length }})</div>
                            <div class="qa-grid">
                                <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.raiz" :key="img.nome">
                                    <div
                                        class="qa-miniatura"
                                        :class="{ ativa: fotoAtiva === img.nome, marcada: !!marcadas[img.nome], 'tem-coding': img.nome.includes('_coding') }"
                                        @click="ampliarImagem(img.nome, detalhe.imagens.raiz.map(i => i.nome))"
                                    >
                                        <img :src="urlImagem(img.nome)" :alt="img.nome" loading="lazy">
                                    </div>
                                    <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                    <div class="qa-acoes-mini">
                                        <input type="checkbox" class="qa-checkbox-retrabalho" title="Selecionar para retrabalho" :checked="fotoAtiva === img.nome" @change="selecionarFoto(img.nome)">
                                        <button type="button" class="qa-acao-mini coding" :class="{ ativa: img.nome.includes('_coding') }" title="Marcar/desmarcar _coding" @click="toggleCoding(img.nome)">C</button>
                                        <button type="button" class="qa-acao-mini rt" title="Mover para Rótulo" @click="toggleSubpasta(img.nome, 'RT')">RT</button>
                                        <button type="button" class="qa-acao-mini is" title="Mover para Insumos" @click="toggleSubpasta(img.nome, 'IS')">IS</button>
                                        <button type="button" class="qa-acao-mini ap" title="Mover para Apoio" @click="toggleSubpasta(img.nome, 'AP')">AP</button>
                                        <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(img.nome, detalhe.imagens.raiz.map(i => i.nome))"><i class="bi bi-zoom-in"></i></button>
                                    </div>
                                </div>
                            </div>

                            <template v-for="tag in ['RT', 'IS', 'AP']" :key="tag">
                                <template v-if="detalhe.imagens.subpastas[tag] && detalhe.imagens.subpastas[tag].length">
                                    <div class="qa-subpasta-titulo">{{ tag }} ({{ detalhe.imagens.subpastas[tag].length }})</div>
                                    <div class="qa-grid">
                                        <div class="qa-miniatura-wrap" v-for="img in detalhe.imagens.subpastas[tag]" :key="img.nome">
                                            <div
                                                class="qa-miniatura"
                                                :class="{ ativa: fotoAtiva === (tag + '/' + img.nome), marcada: !!marcadas[tag + '/' + img.nome], ['tem-' + tag.toLowerCase()]: true }"
                                                @click="ampliarImagem(tag + '/' + img.nome, detalhe.imagens.subpastas[tag].map(i => tag + '/' + i.nome))"
                                            >
                                                <img :src="urlImagem(tag + '/' + img.nome)" :alt="img.nome" loading="lazy">
                                            </div>
                                            <div class="qa-miniatura-nome">{{ img.nome }}</div>
                                            <div class="qa-acoes-mini">
                                                <input type="checkbox" class="qa-checkbox-retrabalho" title="Selecionar para retrabalho" :checked="fotoAtiva === (tag + '/' + img.nome)" @change="selecionarFoto(tag + '/' + img.nome)">
                                                <button type="button" class="qa-acao-mini voltar" title="Tirar da subpasta" @click="toggleSubpasta(img.nome, tag)">Voltar p/ raiz</button>
                                                <button type="button" class="qa-acao-mini zoom" title="Ampliar" @click="ampliarImagem(tag + '/' + img.nome, detalhe.imagens.subpastas[tag].map(i => tag + '/' + i.nome))"><i class="bi bi-zoom-in"></i></button>
                                            </div>
                                        </div>
                                    </div>
                                </template>
                            </template>
                        </div>

                        <div class="qa-coluna-acoes">
                            <div class="qa-legenda">
                                <span class="qa-legenda-item"><span class="qa-legenda-cor coding"></span> _coding (referência de edição)</span>
                                <span class="qa-legenda-item"><span class="qa-legenda-cor rt"></span> RT - Rótulo</span>
                                <span class="qa-legenda-item"><span class="qa-legenda-cor is"></span> IS - Insumos</span>
                                <span class="qa-legenda-item"><span class="qa-legenda-cor ap"></span> AP - Apoio</span>
                            </div>

                            <div class="qa-destino-manual">
                                <span class="qa-destino-manual-label">Tipo de pós-produção:</span>
                                <button type="button" class="qa-destino-btn recorte" :class="{ ativa: detalhe.imagens.destino === 'Recorte' }" :disabled="marcandoDestino" @click="marcarDestinoManual('Recorte')">Recorte</button>
                                <button type="button" class="qa-destino-btn mockup" :class="{ ativa: detalhe.imagens.destino === 'Mockup' }" :disabled="marcandoDestino" @click="marcarDestinoManual('Mockup')">Mockup</button>
                            </div>

                            <div v-if="fotoAtiva" class="qa-motivos-painel">
                                <div class="qa-motivos-titulo">Motivos para {{ fotoAtiva }}</div>
                                <div class="qa-motivos">
                                    <label v-for="motivo in motivos" :key="motivo" class="qa-motivo-item">
                                        <input type="checkbox" :checked="(marcadas[fotoAtiva] || []).includes(motivo)" @change="togglarMotivoAtivo(motivo)"> {{ motivo }}
                                    </label>
                                </div>
                            </div>

                            <div v-if="painelEnvio" class="qa-editadas-recebidas">
                                <div class="qa-editadas-header"><span>Enviar para Edição</span></div>
                                <div v-if="painelEnvio.destino === 'indefinido'" class="qa-conflito-aviso">
                                    <i class="bi bi-exclamation-triangle-fill"></i>
                                    Não foi possível inferir automaticamente: {{ painelEnvio.motivo }}. Preencha os campos manualmente (ou confirme sem preencher pra não gravar nada no Redmine).
                                </div>
                                <div class="qa-campo-linha">
                                    <span class="qa-campo-label">Responsável Pós-Produção</span>
                                    <select class="form-select form-select-sm w-auto" v-model="formEnvio.responsavel">
                                        <option value="">-</option>
                                        <option v-for="(rotulo, id) in opcoesResponsavel" :key="id" :value="id">{{ rotulo }}</option>
                                    </select>
                                </div>
                                <div class="qa-campo-linha">
                                    <span class="qa-campo-label">Qtd Imagens Recorte</span>
                                    <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="formEnvio.qtdRecorte">
                                </div>
                                <div class="qa-campo-linha">
                                    <span class="qa-campo-label">Qtd Imagens Mockup</span>
                                    <input type="number" min="0" class="form-control form-control-sm" style="width:100px" v-model="formEnvio.qtdMockup">
                                </div>
                                <template v-if="detalhe.imagens.destino === 'Mockup'">
                                    <div class="qa-campo-linha">
                                        <span class="qa-campo-label">Número do Mockup</span>
                                        <input type="text" class="form-control form-control-sm" style="width:160px" v-model="formEnvio.numeroMockup" placeholder="ex.: MK-042">
                                    </div>
                                    <div class="qa-motivos-painel">
                                        <div class="qa-motivos-titulo">Orientações pro editor (opcional)</div>
                                        <div class="qa-motivos">
                                            <label v-for="orientacao in orientacoesMockup" :key="orientacao" class="qa-motivo-item">
                                                <input type="checkbox" :checked="formEnvio.orientacoesMockup.includes(orientacao)" @change="togglarOrientacaoMockup(orientacao)"> {{ orientacao }}
                                            </label>
                                        </div>
                                    </div>
                                </template>
                                <button type="button" class="btn btn-primary btn-sm" :disabled="aprovando || !!mensagem" @click="aprovarGtin">
                                    <i class="bi bi-cloud-upload"></i> Confirmar e Enviar
                                </button>
                                <button type="button" class="btn btn-outline-light btn-sm ms-2" :disabled="aprovando" @click="fecharPainelEnvio">Cancelar</button>
                            </div>

                            <div class="qa-enviar-conferencia mt-3">
                                <button type="button" class="btn btn-primary btn-sm" :disabled="temMarcacao() || preparandoEnvio || !!painelEnvio || aprovando || !!mensagem" @click="abrirPainelEnvio">
                                    <i class="bi bi-check2-circle"></i> Aprovar GTIN
                                </button>
                                <button type="button" class="btn btn-warning btn-sm" :disabled="!todasMarcacoesTemMotivo() || enviandoRetrabalho || !!mensagem" @click="confirmarRetrabalho">
                                    <i class="bi bi-arrow-counterclockwise"></i> Confirmar Retrabalho
                                </button>
                                <span v-if="mensagem" class="ms-3 text-success">{{ mensagem }}</span>
                                <span v-if="erro" class="ms-3 text-danger">{{ erro }}</span>
                            </div>
                        </div>
                    </div>
                    </template>
                    </div>
```

Nota o que mudou de posição (sem mudar nenhuma condicional): `.qa-legenda` e `.qa-destino-manual`
saíram de fora/início do bloco e foram pra dentro de `.qa-coluna-acoes` (a legenda deixa de
aparecer durante `carregandoDetalhe`/`erroDetalhe`, já que agora só existe dentro do
`template v-else-if="detalhe"` — isso é intencional, reflete o mockup aprovado, onde a legenda
faz parte do painel de ação). Todo o resto — grades RAIZ/RT/IS/AP na coluna esquerda; motivos,
envio (com Mockup) e os botões finais na coluna direita — preserva exatamente as mesmas
condicionais (`v-if`/`v-for`) e handlers (`@click`) que já existiam.

- [ ] **Step 2: Checagem de sintaxe**

Run: `cd D:\syndi_qa && node --check js/qa.js` (garante que nada em `js/qa.js` foi tocado por
engano)
Expected: sem saída (exit code 0).

Não há como fazer checagem de sintaxe de HTML puro via linha de comando neste projeto — a
verificação real é visual (Step 4).

- [ ] **Step 3: CSS novo**

Em `css/qa.css`, logo depois da regra `.qa-tab-btn.ativa` (por volta da linha 192-195, antes do
comentário `/* Grid de miniaturas 100x100 ... */`), adicione:

```css
/* Layout em duas colunas da aba QA de Foto - grade de fotos rola independente na
   esquerda, painel de acao (legenda, motivos, envio, aprovar) fica sempre visivel na
   direita, com scroll proprio se o conteudo for maior que a altura disponivel. Abaixo
   de 900px volta a empilhar (media query no fim deste arquivo). */
.qa-foto-layout {
    display: flex;
    gap: 16px;
    height: calc(100vh - 160px);
}

.qa-coluna-fotos {
    flex: 1.4;
    overflow-y: auto;
    min-width: 0;
}

.qa-coluna-acoes {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
    background-color: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
}
```

No FINAL do arquivo `css/qa.css` (depois da última regra existente), adicione:

```css
@media (max-width: 900px) {
    .qa-foto-layout {
        display: block;
        height: auto;
    }

    .qa-coluna-fotos,
    .qa-coluna-acoes {
        overflow-y: visible;
    }

    .qa-coluna-acoes {
        margin-top: 16px;
    }
}
```

- [ ] **Step 4: Verificação manual**

Porta 3001 é a porta do próprio projeto — nunca mexer na porta 3000.

1. Suba o servidor (`cd D:\syndi_qa && node server.js`, em background).
2. No navegador: abra um GTIN de teste com fotos em RAIZ e pelo menos uma subpasta (RT/IS/AP) —
   confirme que a grade de fotos fica numa coluna à esquerda e o painel (legenda, Recorte/Mockup)
   aparece numa coluna à direita, lado a lado.
3. Marque uma foto pra retrabalho (abre o painel de motivos) e depois clique "Aprovar GTIN" (abre
   o painel de envio) — confirme que ambos aparecem dentro da coluna direita, sem empurrar a
   grade de fotos.
4. Marque destino "Mockup" e clique "Aprovar GTIN" de novo — confirme que os campos "Número do
   Mockup" e "Orientações" aparecem normalmente dentro do painel de envio, na coluna direita.
5. Se a coluna direita ficar com conteúdo maior que a altura disponível (ex.: motivos + envio
   completo abertos ao mesmo tempo), confirme que ela rola SOZINHA (o scroll interno da coluna),
   sem mover a coluna de fotos.
6. Redimensione a janela do navegador pra menos de 900px de largura (ou abra o DevTools em modo
   responsivo) — confirme que o layout volta a empilhar em 1 coluna, como era antes desta
   mudança.
7. Se a altura das colunas (`calc(100vh - 160px)`) deixar um espaço vazio grande embaixo, ou
   cortar conteúdo indevidamente, ajuste o valor `160px` em `.qa-foto-layout` — é uma estimativa
   baseada no CSS existente (`.qa-layout { height: calc(100vh - 60px) }`, mais o padding de
   `.qa-detalhe` e a altura de `.qa-tabs`), pode precisar de um ajuste fino de poucos pixels.
8. Pare o servidor (mate só o PID que você iniciou; confirme porta 3001 livre via
   `netstat -ano | grep :3001`).

- [ ] **Step 5: Commit**

```bash
cd D:\syndi_qa
git add syndi_qa.html css/qa.css
git commit -m "feat: layout em duas colunas na aba QA de Foto (grade rola a esquerda, painel de acao fixo a direita)"
```

---

## Post-plan: update memory

Depois deste plano implementado e mergeado, atualizar
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md`: documentar o
layout em duas colunas (motivo: reduzir rolagem com muitas fotos), e — se o Step 4/7 exigir
ajuste do valor `160px` — registrar o valor final usado. Isso é uma atualização de memória, não
uma tarefa de código — fazer na conversa de finalização, não como step do plano.
