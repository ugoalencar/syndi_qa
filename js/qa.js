const { createApp, ref, reactive, nextTick, onMounted } = Vue;
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
            } catch (err) {
                console.error('Erro ao carregar redmine-campos.json:', err);
            }
        }

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
        function urlImagem(nome) {
            if (!selecionado.value) return '';
            return API + '/api/imagem?os=' + encodeURIComponent(selecionado.value.os) +
                '&gtin=' + encodeURIComponent(selecionado.value.gtin) +
                '&nome=' + encodeURIComponent(nome);
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
            } catch (err) {
                alert('Erro ao marcar destino: ' + err.message);
            } finally {
                marcandoDestino.value = false;
            }
        }

        // Clicar numa foto so a torna "ativa" (o painel abaixo do palco passa a mostrar
        // o estado dela) - nao marca nada sozinho. So marcar motivo (togglarMotivoAtivo)
        // e o que conta como "foto com problema".
        function selecionarFoto(nomeFoto) {
            fotoAtiva.value = nomeFoto;
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
                        qtdMockup: String(formEnvio.qtdMockup || '')
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
            enviandoRetrabalho.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/retrabalho', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin, marcacoes: { ...marcadas } })
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
            atualizacaoInfo, verificandoAtualizacao, resultadoAtualizacao, aplicandoAtualizacao,
            marcandoDestino, marcarDestinoManual, toggleCoding, toggleSubpasta,
            imagemAmpliada, listaAmpliada, ampliarImagem, navegarAmpliada,
            carregarFila, selecionarGtin, urlImagem, selecionarFoto, togglarMotivoAtivo, temMarcacao, todasMarcacoesTemMotivo,
            aprovarGtin, confirmarRetrabalho, verificarAtualizacao, aplicarAtualizacao,
            painelEnvio, preparandoEnvio, formEnvio, opcoesResponsavel, abrirPainelEnvio, fecharPainelEnvio
        };
    }
}).mount('#qaApp');
