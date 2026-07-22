const { createApp, ref, reactive } = Vue;
const API = 'http://localhost:3000';

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

        const aprovando = ref(false);
        const enviandoRetrabalho = ref(false);
        const mensagem = ref('');
        const erro = ref('');

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

        async function selecionarGtin(os, gtin) {
            selecionado.value = { os, gtin };
            detalhe.value = null;
            erroDetalhe.value = '';
            Object.keys(marcadas).forEach(chave => delete marcadas[chave]);
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

        function togglarProblema(nomeFoto) {
            if (marcadas[nomeFoto]) {
                delete marcadas[nomeFoto];
            } else {
                marcadas[nomeFoto] = [];
            }
        }

        function togglarMotivo(nomeFoto, motivo) {
            const lista = marcadas[nomeFoto];
            if (!lista) return;
            const idx = lista.indexOf(motivo);
            if (idx === -1) lista.push(motivo); else lista.splice(idx, 1);
        }

        function temMarcacao() {
            return Object.keys(marcadas).length > 0;
        }

        async function aprovarGtin() {
            if (!selecionado.value || temMarcacao()) return;
            aprovando.value = true;
            mensagem.value = '';
            erro.value = '';
            try {
                const resp = await fetch(API + '/api/aprovar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ os: selecionado.value.os, gtin: selecionado.value.gtin })
                });
                const dados = await resp.json();
                if (!dados.ok) throw new Error(dados.error || 'Erro desconhecido');
                mensagem.value = 'GTIN aprovado e enviado para edição.';
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
            if (!selecionado.value || !temMarcacao()) return;
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
                mensagem.value = 'Retrabalho registrado e GTIN movido.';
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
        // (:disabled="... || !!mensagem" no qa.html) pra nao reenviar uma pasta que
        // ja foi movida.
        function fecharDepoisDeConcluir() {
            setTimeout(() => {
                detalhe.value = null;
                selecionado.value = null;
                mensagem.value = '';
            }, 2000);
        }

        carregarFila();
        carregarMotivosDisponiveis();

        return {
            fila, carregandoFila, erroFila,
            selecionado, detalhe, carregandoDetalhe, erroDetalhe,
            motivos, marcadas,
            aprovando, enviandoRetrabalho, mensagem, erro,
            carregarFila, selecionarGtin, togglarProblema, togglarMotivo, temMarcacao,
            aprovarGtin, confirmarRetrabalho
        };
    }
}).mount('#qaApp');
