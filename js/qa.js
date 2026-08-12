const { createApp, ref, reactive, computed, nextTick, onMounted } = Vue;
const API = 'http://localhost:3001';

createApp({
    setup() {
        const fila = ref([]);
        const carregandoFila = ref(false);
        const erroFila = ref('');

        const mostrarOsNone = ref(false);
        const osNone = ref([]);
        const carregandoOsNone = ref(false);
        const erroOsNone = ref('');
        const verificandoOsNone = ref(false);
        const resultadoVerificacao = ref(null);

        const osExpandida = ref(null);
        const selecionado = ref(null);
        const detalhe = ref(null);
        const carregandoDetalhe = ref(false);
        const erroDetalhe = ref('');

        const motivos = ref([]);
        const marcadas = reactive({});
        const marcadasOcr = reactive({});
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
        const versaoSistema = ref(null);

        // Guarda o id do setTimeout de fecharDepoisDeConcluir. Sem isso, trocar de
        // GTIN dentro da janela de 2s deixa o timer do GTIN anterior orfao: ele
        // dispara depois e zera detalhe/selecionado/mensagem do GTIN novo que o
        // usuario ja esta revisando.
        let timeoutFecharDepoisDeConcluir = null;

        const marcandoDestino = ref(false);

        const imagemAmpliada = ref(null);
        const listaAmpliada = ref([]);
        const zoomEscala = ref(1);
        const zoomOffsetX = ref(0);
        const zoomOffsetY = ref(0);
        const zoomArrastando = ref(false);
        const zoomMoveuDuranteArrasto = ref(false);
        let zoomInicioX = 0;
        let zoomInicioY = 0;
        let zoomOffsetInicioX = 0;
        let zoomOffsetInicioY = 0;

        const ZOOM_MIN = 1;
        const ZOOM_MAX = 4;
        const ZOOM_DETALHE = 2;
        const ZOOM_PASSO_WHEEL = 0.25;
        const ZOOM_LIMIAR_CLIQUE = 4;

        const estiloImagemAmpliada = computed(() => ({
            transform: `translate(${zoomOffsetX.value}px, ${zoomOffsetY.value}px) scale(${zoomEscala.value})`
        }));

        const classeImagemAmpliada = computed(() => ({
            'qa-img-zoomada': zoomEscala.value > 1,
            'qa-img-arrastando': zoomArrastando.value
        }));

        // Painel de envio pra edicao - abre no "Aprovar GTIN" com os campos inferidos
        // da pasta (Mockup/Recorte + contagem sem _coding), editaveis antes de
        // confirmar. Situacao das Imagens nao aparece aqui de proposito: quem grava
        // e o robo SyncIMGSend, nunca o Syndi_qa.
        const painelEnvio = ref(null); // { destino, motivo } aberto, null fechado
        const preparandoEnvio = ref(false);
        const formEnvio = reactive({ responsavel: '', qtdRecorte: '', qtdMockup: '', numeroMockup: '', orientacoesMockup: [], orientacoesRecorte: [], observacoesMockup: '', observacoesRecorte: '', responsavelQaImagem: '', responsavel3Check: '' });
        const opcoesResponsavel = ref({});
        const opcoesResponsavelQaImagem = ref({});
        const opcoesResponsavel3Check = ref({});
        const orientacoesMockup = ref([]);
        const orientacoesRecorte = ref([]);
        const catalogoMockups = ref([]);

        const mockupsFiltrados = computed(() => {
            if (!formEnvio.numeroMockup.trim()) return catalogoMockups.value.slice(0, 10);
            const filtro = formEnvio.numeroMockup.toLowerCase();
            return catalogoMockups.value
                .filter(m => m.id.toLowerCase().includes(filtro) || m.nome.toLowerCase().includes(filtro))
                .sort((a, b) => {
                    // Prioriza matches que começam com o filtro
                    const aStartsWith = a.nome.toLowerCase().startsWith(filtro);
                    const bStartsWith = b.nome.toLowerCase().startsWith(filtro);
                    if (aStartsWith && !bStartsWith) return -1;
                    if (!aStartsWith && bStartsWith) return 1;
                    return 0;
                })
                .slice(0, 15);
        });

        // Controla se a lista de checkboxes de motivos/orientacoes esta expandida
        // (dropdown inline, nao overlay - ver docs/superpowers/specs/
        // 2026-07-29-syndi-qa-dropdown-checkboxes-design.md). Fecham sozinhos ao trocar
        // de contexto (foto ativa / novo painel de envio) pra nao vazar estado "aberto"
        // de uma selecao pra outra.
        const mostrarDropdownMotivos = ref(false);
        const mostrarDropdownOrientacoesMockup = ref(false);
        const mostrarDropdownOrientacoesRecorte = ref(false);
        const mostrarDropdownMockup = ref(false);

        // Aba "QA para Edicao" - fixa dentro do detalhe do GTIN, independente do Aprovar/
        // painelEnvio acima. Mostra e deixa editar os 6 campos do Redmine, Situacao incluida
        // (excecao deliberada - ver docs/superpowers/specs/2026-07-27-syndi-qa-aba-edicao-design.md).
        const abaDetalhe = ref('foto'); // 'foto' | 'edicao'
        const camposEdicao = reactive({ '15': '', '23': '', '175': '', '176': '', '85': '', '172': '' });
        const origemCampoEdicao = reactive({ '15': 'inferido', '23': 'inferido', '175': 'inferido', '176': 'inferido', '85': 'inferido', '172': 'inferido' });
        const carregandoEdicao = ref(false);
        const erroEdicao = ref(''); // erro ao CARREGAR - esconde o formulario
        const erroEnvioEdicao = ref(''); // erro ao GRAVAR - mensagem inline, nao esconde nada
        const mensagemEdicao = ref('');
        const enviandoEdicao = ref(false);
        const semFichaEdicao = ref(false);
        const opcoesSituacao = ref({});
        const CAMPOS_EDICAO_IDS = ['15', '23', '176', '175', '85', '172'];
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

        async function carregarOsNone() {
            carregandoOsNone.value = true;
            erroOsNone.value = '';
            try {
                const resp = await fetch(API + '/api/os-none');
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                osNone.value = dados.gtins;
            } catch (err) {
                erroOsNone.value = 'Erro ao carregar OS_NONE: ' + err.message + ' (server.js rodando?)';
            } finally {
                carregandoOsNone.value = false;
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

        async function carregarOrientacoesMockupDisponiveis() {
            try {
                const resp = await fetch(API + '/api/orientacoes-mockup');
                const dados = await resp.json();
                if (dados.ok) orientacoesMockup.value = dados.orientacoes;
            } catch (err) {
                console.error('Erro ao carregar orientacoes de mockup:', err);
            }
        }

        async function carregarOrientacoesRecorteDisponiveis() {
            try {
                const resp = await fetch(API + '/api/orientacoes-recorte');
                const dados = await resp.json();
                if (dados.ok) orientacoesRecorte.value = dados.orientacoes;
            } catch (err) {
                console.error('Erro ao carregar orientacoes de recorte:', err);
            }
        }

        async function carregarCatalogoMockups() {
            try {
                const resp = await fetch(API + '/api/mockup-catalogo');
                const dados = await resp.json();
                if (dados.ok) catalogoMockups.value = dados.mockups;
            } catch (err) {
                console.error('Erro ao carregar catalogo de mockups:', err);
            }
        }

        async function carregarOpcoesResponsavel() {
            try {
                const resp = await fetch(API + '/redmine-campos.json');
                const dados = await resp.json();
                opcoesResponsavel.value = dados.campos.cf_23.opcoes;
                opcoesSituacao.value = dados.campos.cf_15.opcoes;
                opcoesResponsavelQaImagem.value = dados.campos.cf_85.opcoes;
                opcoesResponsavel3Check.value = dados.campos.cf_172.opcoes;
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
                        userId: analistaId.value,
                        responsavelQaImagem: String(camposEdicao['85'] || ''),
                        responsavel3Check: String(camposEdicao['172'] || '')
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
                    // cf_85 (Responsavel QA Imagem) e cf_172 (Responsavel 3 Check) sao
                    // campos comuns desta aba, iguais aos outros 4 - o filtro abaixo so
                    // existe pra ignorar qualquer id que a resposta do servidor mande e
                    // que nao tenha nome mapeado aqui (defesa, nao exclusao deliberada).
                    const NOMES_CAMPO_EDICAO = { '15': 'Situação', '23': 'Responsável', '176': 'Qtd Recorte', '175': 'Qtd Mockup', '85': 'Responsável QA Imagem', '172': 'Responsável 3º Check' };
                    const idsCamposDaAba = dados.idsGravados.filter(id => NOMES_CAMPO_EDICAO[id]);
                    idsCamposDaAba.forEach(id => { origemCampoEdicao[id] = 'manual'; });
                    mensagemEdicao.value = idsCamposDaAba.length
                        ? 'Gravado no Redmine: ' + idsCamposDaAba.map(id => NOMES_CAMPO_EDICAO[id]).join(', ') + '.'
                        : 'Nenhum campo preenchido - nada foi gravado.';
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
            Object.keys(marcadasOcr).forEach(chave => delete marcadasOcr[chave]);
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

                // Carrega marcas de OCR apos detalhe estar pronto
                try {
                    const respOcr = await fetch(API + '/api/marcas-ocr?os=' + encodeURIComponent(os) + '&gtin=' + encodeURIComponent(gtin));
                    const dadosOcr = await respOcr.json();
                    if (dadosOcr.ok) {
                        Object.keys(marcadasOcr).forEach(chave => delete marcadasOcr[chave]);
                        Object.assign(marcadasOcr, dadosOcr.marcas || {});
                    }
                } catch (errOcr) {
                    console.error('Erro ao carregar marcas de OCR:', errOcr);
                }
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

        async function toggleOcr(nome) {
            if (!selecionado.value) return;
            const marcado = !marcadasOcr[nome];
            try {
                const resp = await fetch(API + '/api/marcar-ocr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, foto: nome, marcado })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                if (marcado) {
                    marcadasOcr[nome] = true;
                    mensagem.value = 'Marcado para OCR';
                } else {
                    delete marcadasOcr[nome];
                    mensagem.value = 'Desmarcado para OCR';
                }
                setTimeout(() => { mensagem.value = ''; }, 2000);
            } catch (err) {
                erro.value = 'Erro ao marcar OCR: ' + err.message;
                setTimeout(() => { erro.value = ''; }, 3000);
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

        async function deletarFoto(nome) {
            if (!selecionado.value) return;
            if (!confirm('Tem certeza que deseja deletar ' + nome + '? Esta acao nao pode ser desfeita.')) return;
            try {
                const resp = await fetch(API + '/api/deletar-foto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, nome })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                await recarregarDetalheAtual();
                invalidarSugestaoEdicao();
            } catch (err) {
                alert('Erro ao deletar foto: ' + err.message);
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
            mostrarDropdownMotivos.value = false;
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

        // Toggle de orientacao de mockup - local ao formEnvio (nao vai ao servidor ate o
        // Aprovar ser confirmado), mesmo principio do togglarMotivoAtivo mas sem o
        // agrupamento por foto (mockup e por GTIN, nao por foto individual).
        function togglarOrientacaoMockup(orientacao) {
            const idx = formEnvio.orientacoesMockup.indexOf(orientacao);
            if (idx === -1) formEnvio.orientacoesMockup.push(orientacao); else formEnvio.orientacoesMockup.splice(idx, 1);
        }

        // Toggle de orientacao de recorte - local ao formEnvio (nao vai ao servidor ate o
        // Aprovar ser confirmado), mesmo principio do togglarOrientacaoMockup.
        function togglarOrientacaoRecorte(orientacao) {
            const idx = formEnvio.orientacoesRecorte.indexOf(orientacao);
            if (idx === -1) formEnvio.orientacoesRecorte.push(orientacao); else formEnvio.orientacoesRecorte.splice(idx, 1);
        }

        function toggleDropdownMotivos() {
            mostrarDropdownMotivos.value = !mostrarDropdownMotivos.value;
        }

        function toggleDropdownOrientacoesMockup() {
            mostrarDropdownOrientacoesMockup.value = !mostrarDropdownOrientacoesMockup.value;
        }

        function toggleDropdownOrientacoesRecorte() {
            mostrarDropdownOrientacoesRecorte.value = !mostrarDropdownOrientacoesRecorte.value;
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

        function limitarZoom(valor) {
            return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, valor));
        }

        function aplicarEscalaZoom(novaEscala) {
            zoomEscala.value = limitarZoom(novaEscala);
            if (zoomEscala.value === ZOOM_MIN) {
                zoomOffsetX.value = 0;
                zoomOffsetY.value = 0;
            }
        }

        function resetarZoomImagem() {
            zoomEscala.value = ZOOM_MIN;
            zoomOffsetX.value = 0;
            zoomOffsetY.value = 0;
            zoomArrastando.value = false;
            zoomMoveuDuranteArrasto.value = false;
        }

        function alternarZoomImagem() {
            if (zoomMoveuDuranteArrasto.value) {
                zoomMoveuDuranteArrasto.value = false;
                return;
            }
            if (zoomEscala.value === ZOOM_MIN) {
                aplicarEscalaZoom(ZOOM_DETALHE);
            } else {
                resetarZoomImagem();
            }
        }

        function ajustarZoomImagem(event) {
            event.preventDefault();
            const direcao = event.deltaY < 0 ? 1 : -1;
            aplicarEscalaZoom(zoomEscala.value + (direcao * ZOOM_PASSO_WHEEL));
        }

        function iniciarArrastoZoom(event) {
            if (zoomEscala.value <= ZOOM_MIN) return;
            zoomArrastando.value = true;
            zoomMoveuDuranteArrasto.value = false;
            zoomInicioX = event.clientX;
            zoomInicioY = event.clientY;
            zoomOffsetInicioX = zoomOffsetX.value;
            zoomOffsetInicioY = zoomOffsetY.value;
            if (event.currentTarget && event.currentTarget.setPointerCapture) {
                event.currentTarget.setPointerCapture(event.pointerId);
            }
        }

        function moverArrastoZoom(event) {
            if (!zoomArrastando.value) return;
            const dx = event.clientX - zoomInicioX;
            const dy = event.clientY - zoomInicioY;
            if (Math.abs(dx) > ZOOM_LIMIAR_CLIQUE || Math.abs(dy) > ZOOM_LIMIAR_CLIQUE) {
                zoomMoveuDuranteArrasto.value = true;
            }
            zoomOffsetX.value = zoomOffsetInicioX + dx;
            zoomOffsetY.value = zoomOffsetInicioY + dy;
        }

        function finalizarArrastoZoom(event) {
            if (!zoomArrastando.value) return;
            zoomArrastando.value = false;
            if (event && event.currentTarget && event.currentTarget.releasePointerCapture) {
                try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (err) {}
            }
        }

        // Zoom de miniatura - guarda o mesmo "nome composto" que urlImagem/selecionarFoto
        // ja usam (com prefixo de subpasta quando aplicavel, ex.: "RT/foto.jpg"), pra
        // urlImagem(imagemAmpliada) funcionar sem tratamento especial.
        function ampliarImagem(nomeComposto, lista) {
            resetarZoomImagem();
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
            resetarZoomImagem();
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
                formEnvio.numeroMockup = '';
                formEnvio.orientacoesMockup = [];
                formEnvio.orientacoesRecorte = [];
                formEnvio.responsavelQaImagem = '';
                formEnvio.responsavel3Check = '';
                mostrarDropdownOrientacoesMockup.value = false;
                mostrarDropdownOrientacoesRecorte.value = false;
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
            if (detalhe.value && detalhe.value.imagens.destino === 'Mockup' && !formEnvio.numeroMockup.trim()) {
                erro.value = 'Numero do Mockup e obrigatorio quando o destino e Mockup.';
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
                        userId: analistaId.value,
                        numeroMockup: formEnvio.numeroMockup.trim(),
                        orientacoesMockup: formEnvio.orientacoesMockup,
                        observacoesMockup: formEnvio.observacoesMockup,
                        orientacoesRecorte: formEnvio.orientacoesRecorte,
                        observacoesRecorte: formEnvio.observacoesRecorte,
                        responsavelQaImagem: String(formEnvio.responsavelQaImagem || ''),
                        responsavel3Check: String(formEnvio.responsavel3Check || '')
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

        // Verifica e organiza OS_NONE: varre GTINs marcados com OCR (minimo 2),
        // valida e move arquivos pra C:\Cadastro\OCR. Auto-atualiza fila e OS_NONE
        // apos conclusao.
        async function verificarOsNone() {
            if (verificandoOsNone.value) return;
            verificandoOsNone.value = true;
            resultadoVerificacao.value = null;
            try {
                const resp = await fetch(API + '/api/verificar-os-none', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const dados = await resp.json();
                resultadoVerificacao.value = dados;
                if (dados.ok) {
                    // Aguarda 1.5s pra usuario ver o resultado, depois atualiza listas
                    setTimeout(() => {
                        carregarFila();
                        carregarOsNone();
                    }, 1500);
                }
            } catch (err) {
                resultadoVerificacao.value = { ok: false, error: 'Erro de conexao: ' + err.message };
            } finally {
                verificandoOsNone.value = false;
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

        async function carregarVersaoSistema() {
            try {
                const resp = await fetch(API + '/api/versao');
                versaoSistema.value = await resp.json();
            } catch (err) {
                versaoSistema.value = { ok: false, nome: 'Syndi_qa', versao: 'dev', data: null, git: null };
            }
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
                resetarZoomImagem();
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
        carregarOrientacoesMockupDisponiveis();
        carregarOrientacoesRecorteDisponiveis();
        carregarCatalogoMockups();
        carregarOpcoesResponsavel();
        carregarVersaoSistema();

        return {
            fila, carregandoFila, erroFila,
            mostrarOsNone, osNone, carregandoOsNone, erroOsNone, carregarOsNone, verificandoOsNone, resultadoVerificacao, verificarOsNone,
            osExpandida, selecionado, detalhe, carregandoDetalhe, erroDetalhe,
            motivos, marcadas, marcadasOcr, fotoAtiva,
            aprovando, enviandoRetrabalho, mensagem, erro,
            analistaId, analistaNome, erroIdentidade, carregarArquivoIdentidade,
            atualizacaoInfo, verificandoAtualizacao, resultadoAtualizacao, aplicandoAtualizacao, versaoSistema,
            marcandoDestino, marcarDestinoManual, toggleCoding, toggleOcr, toggleSubpasta,
            imagemAmpliada, listaAmpliada, ampliarImagem, navegarAmpliada,
            zoomEscala, zoomOffsetX, zoomOffsetY, zoomArrastando,
            estiloImagemAmpliada, classeImagemAmpliada,
            resetarZoomImagem, alternarZoomImagem, ajustarZoomImagem,
            iniciarArrastoZoom, moverArrastoZoom, finalizarArrastoZoom,
            carregarFila, selecionarGtin, urlImagem, selecionarFoto, togglarMotivoAtivo, temMarcacao, todasMarcacoesTemMotivo,
            aprovarGtin, confirmarRetrabalho, verificarAtualizacao, aplicarAtualizacao, deletarFoto,
            painelEnvio, preparandoEnvio, formEnvio, opcoesResponsavel, abrirPainelEnvio, fecharPainelEnvio,
            orientacoesMockup, orientacoesRecorte, catalogoMockups, mockupsFiltrados, togglarOrientacaoMockup, togglarOrientacaoRecorte,
            mostrarDropdownMotivos, mostrarDropdownOrientacoesMockup, mostrarDropdownOrientacoesRecorte, mostrarDropdownMockup,
            toggleDropdownMotivos, toggleDropdownOrientacoesMockup, toggleDropdownOrientacoesRecorte,
            viewAtiva, mudarParaAgenda, agenda, carregandoAgenda, erroAgenda, carregarAgenda,
            filtroResponsavel, filtroPeriodoDe, filtroPeriodoAte, agendaFiltrada,
            abaDetalhe, camposEdicao, origemCampoEdicao, carregandoEdicao, erroEdicao, erroEnvioEdicao,
            mensagemEdicao, enviandoEdicao, semFichaEdicao, opcoesSituacao,
            opcoesResponsavelQaImagem, opcoesResponsavel3Check,
            abrirAbaEdicao, marcarTocadoEdicao, confirmarEnvioEdicao
        };
    }
}).mount('#qaApp');
