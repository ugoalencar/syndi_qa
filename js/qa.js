const { createApp, ref, reactive, computed, nextTick, onMounted } = Vue;
const API = 'http://localhost:3001';

createApp({
    setup() {
        const fila = ref([]);
        const carregandoFila = ref(false);
        const erroFila = ref('');

        const selecionado = ref(null);
        const detalhe = ref(null);
        const carregandoDetalhe = ref(false);
        const erroDetalhe = ref('');

        const motivos = ref([]);
        const marcadas = reactive({});
        const fotoAtiva = ref(null);

        const aprovando = ref(false);
        const enviandoRetrabalho = ref(false);
        const mensagem = ref('');
        const erro = ref('');

        // Identidade do analista (engrenagem) - mesmo mecanismo do sphoto: arquivo JSON
        // pessoal carregado uma vez, persistido em localStorage sob as mesmas chaves
        // (regra/user_id/nome_usuario) pra nao inventar um formato novo. Usado nas 3
        // gravacoes no Redmine (Aprovar, Retrabalho, aba QA para Edicao) - ver
        // docs/superpowers/specs/2026-07-28-syndi-qa-identidade-analista-design.md.
        const analistaId = ref(localStorage.getItem('user_id') || '');
        const analistaNome = ref(localStorage.getItem('nome_usuario') || '');
        const erroIdentidade = ref('');

        // Atualizacao via git (mesmo par verificar/aplicar do sphoto) - so aciona
        // sob demanda (botao), nunca sozinho no load: git fetch a cada abertura da
        // tela seria custo desnecessario pro uso normal do QA Hub.
        const atualizacaoInfo = ref(null);
        const verificandoAtualizacao = ref(false);
        const resultadoAtualizacao = ref(null);
        const aplicandoAtualizacao = ref(false);

        // Guarda o id do setTimeout de fecharDepoisDeConcluir. Sem isso, trocar de
        // GTIN dentro da janela de 2s deixa o timer do GTIN anterior orfao: ele
        // dispara depois e zera detalhe/selecionado/mensagem do GTIN novo que o
        // usuario ja esta revisando.
        let timeoutFecharDepoisDeConcluir = null;

        const marcandoDestino = ref(false);

        const imagemAmpliada = ref(null);
        const listaAmpliada = ref([]);

        // Painel de envio pra edicao - abre no "Aprovar GTIN" com os campos inferidos
        // da pasta (Mockup/Recorte + contagem sem _coding), editaveis antes de
        // confirmar. Situacao das Imagens nao aparece aqui de proposito: quem grava
        // e o robo SyncIMGSend, nunca o Syndi_qa.
        const painelEnvio = ref(null); // { destino, motivo } aberto, null fechado
        const preparandoEnvio = ref(false);
        const formEnvio = reactive({ responsavel: '', qtdRecorte: '', qtdMockup: '' });
        const opcoesResponsavel = ref({});

        // Aba "QA para Edicao" - fixa dentro do detalhe do GTIN, independente do Aprovar/
        // painelEnvio acima. Mostra e deixa editar os 4 campos do Redmine, Situacao incluida
        // (excecao deliberada - ver docs/superpowers/specs/2026-07-27-syndi-qa-aba-edicao-design.md).
        const abaDetalhe = ref('foto'); // 'foto' | 'edicao'
        const camposEdicao = reactive({ '15': '', '23': '', '175': '', '176': '' });
        const origemCampoEdicao = reactive({ '15': 'inferido', '23': 'inferido', '175': 'inferido', '176': 'inferido' });
        const carregandoEdicao = ref(false);
        const erroEdicao = ref(''); // erro ao CARREGAR - esconde o formulario
        const erroEnvioEdicao = ref(''); // erro ao GRAVAR - mensagem inline, nao esconde nada
        const mensagemEdicao = ref('');
        const enviandoEdicao = ref(false);
        const semFichaEdicao = ref(false);
        const opcoesSituacao = ref({});
        const CAMPOS_EDICAO_IDS = ['15', '23', '176', '175'];
        const CHAVE_SUGERIDO_EDICAO = { '23': 'responsavel', '176': 'qtdRecorte', '175': 'qtdMockup' };
        let edicaoCarregadaParaGtin = null; // "os|gtin" da ultima carga - evita recarregar toda vez que a aba abre

        // Agenda de Edicao - aba de topo separada da fila (viewAtiva), carregada sob
        // demanda na primeira vez que a aba abre (agendaCarregadaAlgumaVez), mesmo
        // principio do mudarParaAgenda do sphoto. Filtros (responsavel/periodo) sao
        // aplicados no front sobre o array ja carregado - base pequena, sem ida-e-volta
        // ao servidor por filtro.
        const viewAtiva = ref('fila'); // 'fila' | 'agenda'
        const agenda = ref([]);
        const carregandoAgenda = ref(false);
        const erroAgenda = ref('');
        let agendaCarregadaAlgumaVez = false;
        const filtroResponsavel = ref('todos'); // 'todos' | '32' (Virafilme) | '258' (Bright River)
        const filtroPeriodoDe = ref('');
        const filtroPeriodoAte = ref('');

        async function carregarFila() {
            carregandoFila.value = true;
            erroFila.value = '';
            try {
                const resp = await fetch(API + '/api/fila');
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                fila.value = dados.fila;
            } catch (err) {
                erroFila.value = 'Erro ao carregar fila: ' + err.message + ' (server.js rodando?)';
            } finally {
                carregandoFila.value = false;
            }
        }

        async function carregarMotivosDisponiveis() {
            try {
                const resp = await fetch(API + '/api/motivos');
                const dados = await resp.json();
                if (dados.ok) motivos.value = dados.motivos;
            } catch (err) {
                console.error('Erro ao carregar motivos:', err);
            }
        }

        async function carregarOpcoesResponsavel() {
            try {
                const resp = await fetch(API + '/redmine-campos.json');
                const dados = await resp.json();
                opcoesResponsavel.value = dados.campos.cf_23.opcoes;
                opcoesSituacao.value = dados.campos.cf_15.opcoes;
            } catch (err) {
                console.error('Erro ao carregar redmine-campos.json:', err);
            }
        }

        // Aplica a resposta de /api/edicao/detalhe no estado reativo - campos que ja tem
        // valor confirmado (do Redmine, ou editado manualmente nesta sessao) nao sao
        // sobrescritos por uma recarga. Mesmo principio do aplicarDetalhe do sphoto (js/qa.js).
        function aplicarDetalheEdicao(dados) {
            semFichaEdicao.value = !dados.issue;
            CAMPOS_EDICAO_IDS.forEach(id => {
                if (origemCampoEdicao[id] === 'manual') return;
                const valorRedmine = dados.issue ? dados.issue.customFields[id] : '';
                const chaveSugerido = CHAVE_SUGERIDO_EDICAO[id];
                if (valorRedmine) {
                    camposEdicao[id] = valorRedmine;
                    origemCampoEdicao[id] = 'manual';
                } else if (chaveSugerido && dados.sugeridos && dados.sugeridos[chaveSugerido] !== undefined) {
                    camposEdicao[id] = dados.sugeridos[chaveSugerido];
                    origemCampoEdicao[id] = 'inferido';
                } else {
                    // Se o campo pode ser sugerido (23/176/175) e a resposta atual nao
                    // trouxe sugestao pra ele, limpa em vez de manter o valor antigo -
                    // sem isso, uma sugestao que "some" numa reorganizacao de pasta
                    // (ex.: Recorte desmarcado) deixava o valor velho na tela, ainda
                    // marcado 'inferido', e ele acabava indo pro Redmine sem querer.
                    // Situacao (id '15') nunca e sugerida, entao mantem o comportamento
                    // antigo pra ela.
                    camposEdicao[id] = chaveSugerido ? '' : (camposEdicao[id] || '');
                    origemCampoEdicao[id] = 'inferido';
                }
            });
        }

        async function carregarDetalheEdicao() {
            if (!selecionado.value) return;
            const os = selecionado.value.os;
            const gtin = selecionado.value.gtin;
            carregandoEdicao.value = true;
            erroEdicao.value = '';
            try {
                const resp = await fetch(API + '/api/edicao/detalhe?os=' + encodeURIComponent(os) + '&gtin=' + encodeURIComponent(gtin));
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                // Resposta atrasada de um GTIN anterior nao pode aplicar campos errados
                // depois que o usuario ja trocou de selecao - mesmo guard do abrirPainelEnvio.
                if (!selecionado.value || selecionado.value.os !== os || selecionado.value.gtin !== gtin) return;
                aplicarDetalheEdicao(dados);
                edicaoCarregadaParaGtin = os + '|' + gtin;
            } catch (err) {
                if (selecionado.value && selecionado.value.os === os && selecionado.value.gtin === gtin) {
                    erroEdicao.value = 'Erro ao carregar dados de edicao: ' + err.message + ' (server.js rodando?)';
                }
            } finally {
                if (selecionado.value && selecionado.value.os === os && selecionado.value.gtin === gtin) carregandoEdicao.value = false;
            }
        }


        // Qualquer mudanca na organizacao da pasta (tagging) invalida a sugestao ja
        // carregada da aba "QA para Edicao" - ela recarrega sozinha na proxima vez que a
        // aba abrir, ou imediatamente se ja estiver aberta. Campos que o analista ja
        // editou manualmente (origemCampoEdicao 'manual') continuam intocados - essa
        // protecao ja existe em aplicarDetalheEdicao, nao muda. Ver
        // docs/superpowers/specs/2026-07-28-syndi-qa-correcoes-qa-design.md secao 2.
        function invalidarSugestaoEdicao() {
            edicaoCarregadaParaGtin = null;
            // Hoje isso nunca dispara na pratica (as 3 chamadoras so sao acionaveis
            // na aba "QA de Foto", nunca com "QA para Edicao" ativa ao mesmo tempo) -
            // mantido por seguranca caso o fluxo mude no futuro.
            if (abaDetalhe.value === 'edicao') carregarDetalheEdicao();
        }

        // Troca pra aba "QA para Edicao" e carrega os dados so na primeira vez pra este
        // GTIN (edicaoCarregadaParaGtin) - evita ida-e-volta ao Redmine toda vez que o
        // analista alterna entre as abas Foto/Edicao do mesmo GTIN.
        function abrirAbaEdicao() {
            abaDetalhe.value = 'edicao';
            if (!selecionado.value) return;
            const chave = selecionado.value.os + '|' + selecionado.value.gtin;
            if (edicaoCarregadaParaGtin !== chave) carregarDetalheEdicao();
        }

        function marcarTocadoEdicao(id) {
            origemCampoEdicao[id] = 'manual';
        }

        async function confirmarEnvioEdicao() {
            if (!selecionado.value || enviandoEdicao.value) return;
            if (!analistaId.value) {
                erroEnvioEdicao.value = 'Identidade nao configurada! Clique no icone de engrenagem.';
                return;
            }
            const os = selecionado.value.os;
            const gtin = selecionado.value.gtin;
            enviandoEdicao.value = true;
            mensagemEdicao.value = '';
            erroEnvioEdicao.value = '';
            try {
                const resp = await fetch(API + '/api/edicao/gravar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os,
                        gtin,
                        situacao: String(camposEdicao['15'] || ''),
                        responsavel: String(camposEdicao['23'] || ''),
                        qtdRecorte: String(camposEdicao['176'] || ''),
                        qtdMockup: String(camposEdicao['175'] || ''),
                        userId: analistaId.value
                    })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                // Resposta atrasada de um GTIN anterior nao pode aplicar mensagem/badges
                // errados depois que o usuario ja trocou de selecao - mesmo guard do
                // carregarDetalheEdicao.
                if (!selecionado.value || selecionado.value.os !== os || selecionado.value.gtin !== gtin) return;
                if (dados.gravado && dados.idsGravados && dados.idsGravados.length) {
                    // So os campos que realmente foram gravados viram "manual" - um campo
                    // que ficou vazio (pulado por montarCamposEdicaoCompleto) nao muda de
                    // origem, e a mensagem reflete exatamente o que foi escrito, nao um
                    // "gravado" generico que poderia sugerir que TODOS os campos foram.
                    const NOMES_CAMPO_EDICAO = { '15': 'Situação', '23': 'Responsável', '176': 'Qtd Recorte', '175': 'Qtd Mockup' };
                    dados.idsGravados.forEach(id => { origemCampoEdicao[id] = 'manual'; });
                    mensagemEdicao.value = 'Gravado no Redmine: ' + dados.idsGravados.map(id => NOMES_CAMPO_EDICAO[id] || id).join(', ') + '.';
                } else {
                    mensagemEdicao.value = 'Nenhum campo preenchido - nada foi gravado.';
                }
            } catch (err) {
                if (selecionado.value && selecionado.value.os === os && selecionado.value.gtin === gtin) {
                    erroEnvioEdicao.value = 'Erro ao gravar: ' + err.message;
                }
            } finally {
                if (selecionado.value && selecionado.value.os === os && selecionado.value.gtin === gtin) enviandoEdicao.value = false;
            }
        }

        async function carregarAgenda() {
            carregandoAgenda.value = true;
            erroAgenda.value = '';
            try {
                const resp = await fetch(API + '/api/agenda');
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                agenda.value = dados.itens;
                agendaCarregadaAlgumaVez = true;
            } catch (err) {
                erroAgenda.value = 'Erro ao carregar agenda: ' + err.message + ' (server.js rodando?)';
            } finally {
                carregandoAgenda.value = false;
            }
        }

        function mudarParaAgenda() {
            viewAtiva.value = 'agenda';
            if (!agendaCarregadaAlgumaVez) carregarAgenda();
        }

        const agendaFiltrada = computed(() => agenda.value.filter(item => {
            if (filtroResponsavel.value !== 'todos' && String(item.responsavel) !== filtroResponsavel.value) return false;
            if (filtroPeriodoDe.value && (!item.previsaoEntrega || item.previsaoEntrega < filtroPeriodoDe.value)) return false;
            if (filtroPeriodoAte.value && (!item.previsaoEntrega || item.previsaoEntrega > filtroPeriodoAte.value)) return false;
            return true;
        }));

        async function selecionarGtin(os, gtin) {
            // Cancela o timer orfao de reset de selecao (fecharDepoisDeConcluir) de um
            // GTIN anterior, se houver. Sem isso ele dispararia mais tarde e zeraria a
            // selecao deste GTIN novo.
            if (timeoutFecharDepoisDeConcluir) {
                clearTimeout(timeoutFecharDepoisDeConcluir);
                timeoutFecharDepoisDeConcluir = null;
            }
            selecionado.value = { os, gtin };
            detalhe.value = null;
            erroDetalhe.value = '';
            Object.keys(marcadas).forEach(chave => delete marcadas[chave]);
            fotoAtiva.value = null;
            painelEnvio.value = null;
            abaDetalhe.value = 'foto';
            edicaoCarregadaParaGtin = null;
            semFichaEdicao.value = false;
            erroEdicao.value = '';
            erroEnvioEdicao.value = '';
            mensagemEdicao.value = '';
            CAMPOS_EDICAO_IDS.forEach(id => {
                camposEdicao[id] = '';
                origemCampoEdicao[id] = 'inferido';
            });
            mensagem.value = '';
            erro.value = '';
            carregandoDetalhe.value = true;
            try {
                const resp = await fetch(API + '/api/gtin?os=' + encodeURIComponent(os) + '&gtin=' + encodeURIComponent(gtin));
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                detalhe.value = dados;
            } catch (err) {
                erroDetalhe.value = 'Erro ao carregar GTIN: ' + err.message;
            } finally {
                carregandoDetalhe.value = false;
            }
        }

        // Monta a URL da rota GET /api/imagem pro GTIN selecionado no momento - troca o
        // antigo base64 embutido no JSON (lento com fotos reais grandes) por uma URL
        // normal, que o navegador carrega em paralelo sem travar a tela toda.
        function urlImagem(nome, tamanho) {
            if (!selecionado.value) return '';
            let url = API + '/api/imagem?os=' + encodeURIComponent(selecionado.value.os) +
                '&gtin=' + encodeURIComponent(selecionado.value.gtin) +
                '&nome=' + encodeURIComponent(nome) +
                '&tamanho=' + encodeURIComponent(tamanho || 'mini');
            // Reaproveita os nomes de pasta decorados que GET /api/gtin ja resolveu -
            // evita o servidor varrer o disco de novo (readdirSync) pra cada foto da
            // grade, que antes rodava a cada miniatura carregada.
            if (detalhe.value && detalhe.value.pastaOsNome && detalhe.value.pastaGtinNome) {
                url += '&pastaOsNome=' + encodeURIComponent(detalhe.value.pastaOsNome) +
                    '&pastaGtinNome=' + encodeURIComponent(detalhe.value.pastaGtinNome);
            }
            return url;
        }

        // Recarrega so o detalhe do GTIN atual, sem mexer em fotoAtiva/marcadas (estado
        // do retrabalho, nao persistido) - usado depois de qualquer acao de tagging.
        async function recarregarDetalheAtual() {
            if (!selecionado.value) return;
            try {
                const resp = await fetch(API + '/api/gtin?os=' + encodeURIComponent(selecionado.value.os) + '&gtin=' + encodeURIComponent(selecionado.value.gtin));
                const dados = await resp.json();
                if (dados.ok) detalhe.value = dados;
            } catch (err) {
                console.error('Erro ao recarregar detalhe:', err);
            }
        }

        async function toggleCoding(nome) {
            if (!selecionado.value) return;
            try {
                const resp = await fetch(API + '/api/marcar-coding', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, nome })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
                invalidarSugestaoEdicao();
            } catch (err) {
                alert('Erro ao marcar _coding: ' + err.message);
            }
        }

        async function toggleSubpasta(nome, pasta) {
            if (!selecionado.value) return;
            try {
                const resp = await fetch(API + '/api/tag-subpasta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, nome, pasta })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
                invalidarSugestaoEdicao();
            } catch (err) {
                alert('Erro ao mover para ' + pasta + ': ' + err.message);
            }
        }

        async function marcarDestinoManual(tipo) {
            if (!selecionado.value || marcandoDestino.value) return;
            const jaAtivo = detalhe.value && detalhe.value.imagens.destino === tipo;
            const novoTipo = jaAtivo ? null : tipo;
            marcandoDestino.value = true;
            try {
                const resp = await fetch(API + '/api/marcar-destino', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, tipo: novoTipo })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
                invalidarSugestaoEdicao();
            } catch (err) {
                alert('Erro ao marcar destino: ' + err.message);
            } finally {
                marcandoDestino.value = false;
            }
        }

        // Clicar numa foto so a torna "ativa" (o painel abaixo do palco passa a mostrar
        // o estado dela) - nao marca nada sozinho. So marcar motivo (togglarMotivoAtivo)
        // e o que conta como "foto com problema".
        // Agora e um toggle (era so "seleciona") porque o gatilho virou um checkbox
        // dedicado (ver syndi_qa.html) em vez do clique no corpo da foto - o corpo
        // passou a ampliar. Ver docs/superpowers/specs/2026-07-28-syndi-qa-correcoes-qa-design.md secao 3.
        function selecionarFoto(nomeFoto) {
            fotoAtiva.value = fotoAtiva.value === nomeFoto ? null : nomeFoto;
        }

        function togglarMotivoAtivo(motivo) {
            if (!fotoAtiva.value) return;
            if (!marcadas[fotoAtiva.value]) marcadas[fotoAtiva.value] = [];
            const lista = marcadas[fotoAtiva.value];
            const idx = lista.indexOf(motivo);
            if (idx === -1) lista.push(motivo); else lista.splice(idx, 1);
            // Sem motivo nenhum marcado nao conta como "problema" - remove a entrada pra
            // nao acender o indicador na miniatura nem contar em temMarcacao/todasMarcacoesTemMotivo.
            if (lista.length === 0) delete marcadas[fotoAtiva.value];
        }

        function temMarcacao() {
            return Object.keys(marcadas).length > 0;
        }

        // Retrabalho so faz sentido se toda foto marcada tiver pelo menos um motivo
        // escolhido. togglarMotivoAtivo ja apaga a entrada de marcadas[foto] quando o
        // ultimo motivo e desmarcado, mas esta funcao continua existindo como cinto de
        // seguranca - sem ela "Confirmar Retrabalho" poderia habilitar com uma linha
        // vazia (sem motivo nenhum) indo pro retrabalho.txt, inutil pro fotografo corrigir.
        function todasMarcacoesTemMotivo() {
            const nomes = Object.keys(marcadas);
            return nomes.length > 0 && nomes.every(nome => marcadas[nome].length > 0);
        }

        // Zoom de miniatura - guarda o mesmo "nome composto" que urlImagem/selecionarFoto
        // ja usam (com prefixo de subpasta quando aplicavel, ex.: "RT/foto.jpg"), pra
        // urlImagem(imagemAmpliada) funcionar sem tratamento especial.
        function ampliarImagem(nomeComposto, lista) {
            imagemAmpliada.value = nomeComposto;
            listaAmpliada.value = lista;
            nextTick(() => {
                bootstrap.Modal.getOrCreateInstance(document.getElementById('modalImagem')).show();
            });
        }

        function navegarAmpliada(delta) {
            if (!imagemAmpliada.value || !listaAmpliada.value.length) return;
            const idx = listaAmpliada.value.indexOf(imagemAmpliada.value);
            const total = listaAmpliada.value.length;
            imagemAmpliada.value = listaAmpliada.value[(idx + delta + total) % total];
        }

        async function abrirPainelEnvio() {
            if (!selecionado.value || temMarcacao() || preparandoEnvio.value) return;
            const os = selecionado.value.os;
            const gtin = selecionado.value.gtin;
            preparandoEnvio.value = true;
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/aprovar/preparar?os=' + encodeURIComponent(os) + '&gtin=' + encodeURIComponent(gtin));
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                // Resposta atrasada de um GTIN anterior nao pode reabrir o painel com os
                // campos errados depois que o usuario ja trocou de selecao - conferir se
                // ainda estamos no mesmo GTIN antes de aplicar (mesmo padrao do sphoto).
                if (!selecionado.value || selecionado.value.os !== os || selecionado.value.gtin !== gtin) return;
                formEnvio.responsavel = dados.campos.responsavel || '';
                formEnvio.qtdRecorte = dados.campos.qtdRecorte || '';
                formEnvio.qtdMockup = dados.campos.qtdMockup || '';
                painelEnvio.value = { destino: dados.destino, motivo: dados.motivo };
            } catch (err) {
                if (selecionado.value && selecionado.value.os === os && selecionado.value.gtin === gtin) {
                    erro.value = 'Erro ao preparar envio: ' + err.message;
                }
            } finally {
                preparandoEnvio.value = false;
            }
        }

        function fecharPainelEnvio() {
            painelEnvio.value = null;
        }

        async function aprovarGtin() {
            if (!selecionado.value || !painelEnvio.value || aprovando.value) return;
            if (!analistaId.value) {
                erro.value = 'Identidade nao configurada! Clique no icone de engrenagem.';
                return;
            }
            aprovando.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/aprovar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os: selecionado.value.os,
                        gtin: selecionado.value.gtin,
                        responsavel: String(formEnvio.responsavel || ''),
                        qtdRecorte: String(formEnvio.qtdRecorte || ''),
                        qtdMockup: String(formEnvio.qtdMockup || ''),
                        userId: analistaId.value
                    })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                fecharPainelEnvio();
                mensagem.value = dados.redmineGravado
                    ? 'GTIN aprovado, campos gravados no Redmine e enviado para edição.'
                    : 'GTIN aprovado e enviado para edição (nenhum campo gravado no Redmine).';
                await carregarFila();
                // So limpa a selecao depois de um tempo pro usuario ver a mensagem de
                // sucesso. Zerar selecionado/detalhe no mesmo tick que a mensagem escondia
                // a mensagem na hora (ela fica dentro do "v-else" que depende de selecionado).
                fecharDepoisDeConcluir();
            } catch (err) {
                erro.value = 'Erro ao aprovar: ' + err.message;
            } finally {
                aprovando.value = false;
            }
        }

        async function confirmarRetrabalho() {
            if (!selecionado.value || !todasMarcacoesTemMotivo()) return;
            if (!analistaId.value) {
                erro.value = 'Identidade nao configurada! Clique no icone de engrenagem.';
                return;
            }
            enviandoRetrabalho.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/retrabalho', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, marcacoes: { ...marcadas }, userId: analistaId.value })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                if (dados.redmineOk === false) {
                    mensagem.value = 'Retrabalho registrado e GTIN movido. Aviso: nao foi possivel marcar no Redmine (' + dados.redmineError + ').';
                } else {
                    mensagem.value = 'Retrabalho registrado e GTIN movido.';
                }
                await carregarFila();
                fecharDepoisDeConcluir();
            } catch (err) {
                erro.value = 'Erro ao confirmar retrabalho: ' + err.message;
            } finally {
                enviandoRetrabalho.value = false;
            }
        }

        // Le o arquivo JSON pessoal selecionado no modal da engrenagem, extrai userId/userName
        // e persiste em localStorage - mesmas chaves que o sphoto usa (regra/user_id/
        // nome_usuario), mesmo formato de arquivo (campos de roteamento de regra que o sphoto
        // usa pra outra finalidade sao ignorados aqui de proposito).
        function carregarArquivoIdentidade(event) {
            const arquivo = event.target.files && event.target.files[0];
            if (!arquivo) return;
            erroIdentidade.value = '';
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const conteudo = e.target.result;
                    const obj = JSON.parse(conteudo);
                    if (!obj.userId || !obj.userName) {
                        erroIdentidade.value = 'Arquivo invalido: precisa ter userId e userName.';
                        return;
                    }
                    analistaId.value = String(obj.userId);
                    analistaNome.value = obj.userName;
                    localStorage.setItem('regra', conteudo);
                    localStorage.setItem('user_id', String(obj.userId));
                    localStorage.setItem('nome_usuario', obj.userName);
                    const modalEl = document.getElementById('modalIdentidade');
                    const modal = modalEl && bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                } catch (err) {
                    erroIdentidade.value = 'Erro ao ler arquivo JSON: ' + err.message;
                }
            };
            reader.readAsText(arquivo, 'UTF-8');
        }

        // Da tempo do usuario ler a mensagem de sucesso antes de voltar pra tela
        // "selecione um GTIN". Os botoes ficam desabilitados nesse meio-tempo
        // (:disabled="... || !!mensagem" no syndi_qa.html) pra nao reenviar uma pasta que
        // ja foi movida.
        function fecharDepoisDeConcluir() {
            timeoutFecharDepoisDeConcluir = setTimeout(() => {
                detalhe.value = null;
                selecionado.value = null;
                mensagem.value = '';
                timeoutFecharDepoisDeConcluir = null;
            }, 2000);
        }

        async function verificarAtualizacao() {
            verificandoAtualizacao.value = true;
            resultadoAtualizacao.value = null;
            try {
                const resp = await fetch(API + '/api/atualizacao/verificar');
                atualizacaoInfo.value = await resp.json();
            } catch (err) {
                // ok:false discreto - esperado sempre que nao ha rede/remoto configurado
                // nesta fase do projeto, nao pode quebrar a tela.
                atualizacaoInfo.value = { ok: false, error: 'Erro ao verificar: ' + err.message };
            } finally {
                verificandoAtualizacao.value = false;
            }
        }

        async function aplicarAtualizacao() {
            aplicandoAtualizacao.value = true;
            resultadoAtualizacao.value = null;
            try {
                const resp = await fetch(API + '/api/atualizacao/aplicar', { method: 'POST' });
                resultadoAtualizacao.value = await resp.json();
                // Reconsulta pra sino/mensagem "ja atualizado" refletirem o novo HEAD.
                // Nunca reinicia o servidor sozinho - se precisaReiniciar, quem le a tela
                // reinicia manualmente (auto-restart e proposital fora de escopo).
                if (resultadoAtualizacao.value.ok) {
                    await verificarAtualizacao();
                }
            } catch (err) {
                resultadoAtualizacao.value = { ok: false, error: 'Erro ao aplicar: ' + err.message };
            } finally {
                aplicandoAtualizacao.value = false;
            }
        }

        onMounted(() => {
            document.getElementById('modalImagem').addEventListener('hidden.bs.modal', () => {
                imagemAmpliada.value = null;
                listaAmpliada.value = [];
            });
            document.addEventListener('keydown', (e) => {
                if (!imagemAmpliada.value) return;
                if (e.key === 'ArrowLeft') navegarAmpliada(-1);
                if (e.key === 'ArrowRight') navegarAmpliada(1);
            });
        });

        carregarFila();
        carregarMotivosDisponiveis();
        carregarOpcoesResponsavel();

        return {
            fila, carregandoFila, erroFila,
            selecionado, detalhe, carregandoDetalhe, erroDetalhe,
            motivos, marcadas, fotoAtiva,
            aprovando, enviandoRetrabalho, mensagem, erro,
            analistaId, analistaNome, erroIdentidade, carregarArquivoIdentidade,
            atualizacaoInfo, verificandoAtualizacao, resultadoAtualizacao, aplicandoAtualizacao,
            marcandoDestino, marcarDestinoManual, toggleCoding, toggleSubpasta,
            imagemAmpliada, listaAmpliada, ampliarImagem, navegarAmpliada,
            carregarFila, selecionarGtin, urlImagem, selecionarFoto, togglarMotivoAtivo, temMarcacao, todasMarcacoesTemMotivo,
            aprovarGtin, confirmarRetrabalho, verificarAtualizacao, aplicarAtualizacao,
            painelEnvio, preparandoEnvio, formEnvio, opcoesResponsavel, abrirPainelEnvio, fecharPainelEnvio,
            viewAtiva, mudarParaAgenda, agenda, carregandoAgenda, erroAgenda, carregarAgenda,
            filtroResponsavel, filtroPeriodoDe, filtroPeriodoAte, agendaFiltrada,
            abaDetalhe, camposEdicao, origemCampoEdicao, carregandoEdicao, erroEdicao, erroEnvioEdicao,
            mensagemEdicao, enviandoEdicao, semFichaEdicao, opcoesSituacao,
            abrirAbaEdicao, marcarTocadoEdicao, confirmarEnvioEdicao
        };
    }
}).mount('#qaApp');
