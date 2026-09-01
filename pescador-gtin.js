#!/usr/bin/env node
// pescador-gtin.js
// CLI interativa pra Pescador de GTIN com barra de progresso, pause/resume e online check.
// Uso: node pescador-gtin.js

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const pescador = require('./lib/pescador');

const BASE_PATH = __dirname;
const CAMINHOS_CONFIG = path.join(BASE_PATH, 'caminhos-locais.json');

// Cores e formatacao
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BGDARK = '\x1b[40m';

function limparTela() {
    console.clear();
}

function cabecalho(titulo, origem, destino) {
    limparTela();
    console.log(BOLD + CYAN + '╔═══════════════════════════════════════════════════╗' + RESET);
    console.log(BOLD + CYAN + '║  PESCADOR DE GTIN v1.0 - Estado Persistido' + ' '.repeat(4) + '║' + RESET);
    console.log(BOLD + CYAN + '╠═══════════════════════════════════════════════════╣' + RESET);
    console.log(CYAN + '║ Origem:  ' + (origem || 'nao configurada').substring(0, 40).padEnd(40) + ' ║' + RESET);
    console.log(CYAN + '║ Destino: ' + (destino || 'nao configurada').substring(0, 40).padEnd(40) + ' ║' + RESET);
    console.log(BOLD + CYAN + '╠═══════════════════════════════════════════════════╣' + RESET);
}

function barraProgresso(processados, total) {
    const percentual = total > 0 ? Math.round((processados / total) * 100) : 0;
    const barSize = 20;
    const preenchido = Math.round((processados / total) * barSize);
    const vazio = barSize - preenchido;
    const barra = '[' + GREEN + '█'.repeat(preenchido) + RESET + '░'.repeat(vazio) + ']';
    return barra + ' ' + percentual.toString().padStart(3) + '%  (' + processados + '/' + total + ')';
}

function carregarCaminhos() {
    if (!fs.existsSync(CAMINHOS_CONFIG)) {
        return { legadoOrigemDir: '', legadoDestinoDir: '' };
    }
    try {
        const config = JSON.parse(fs.readFileSync(CAMINHOS_CONFIG, 'utf8'));
        return {
            legadoOrigemDir: config.legadoOrigemDir || '',
            legadoDestinoDir: config.legadoDestinoDir || ''
        };
    } catch (err) {
        return { legadoOrigemDir: '', legadoDestinoDir: '' };
    }
}

function validarCaminhos(origem, destino) {
    if (!origem || !destino) {
        console.log(RED + BOLD + '\n✗ Erro: Caminhos nao configurados!' + RESET);
        console.log(DIM + 'Configure legadoOrigemDir e legadoDestinoDir em: ' + CAMINHOS_CONFIG + RESET);
        return false;
    }
    if (!fs.existsSync(origem)) {
        console.log(RED + BOLD + '\n✗ Erro: Origem nao existe!' + RESET);
        console.log('  ' + origem);
        return false;
    }
    return true;
}

async function perguntarResumir(rl, estadoAnterior) {
    return new Promise((resolve) => {
        const minutos = Math.round((Date.now() - new Date(estadoAnterior.inicio).getTime()) / 60000);
        console.log(YELLOW + BOLD + '\n⚠ Sessao anterior encontrada!' + RESET);
        console.log('  Status: ' + estadoAnterior.status);
        console.log('  Inicio: ' + estadoAnterior.inicio);
        console.log('  Tempo: ' + minutos + ' minutos');
        console.log('  Processados: ' + Object.values(estadoAnterior.processados).reduce((a, b) => a + b.length, 0) + ' GTINs');

        rl.question('\n' + BOLD + 'Deseja retomar? (S/N) ' + RESET, (ans) => {
            resolve(ans.toLowerCase() === 's' || ans.toLowerCase() === 'sim');
        });
    });
}

async function rodaPescador(origem, destino, estadoAnterior = null) {
    let parado = false;
    let estatisticas = {
        inicio: Date.now(),
        novos: 0,
        jaExistiam: 0,
        erros: 0,
        totalGtins: 0,
        tamanhoCopiado: 0,
        ultimoGtin: null
    };

    const onStop = () => parado;

    const onCallback = (dados) => {
        const agora = new Date();
        const tempoDecorrido = Math.round((Date.now() - estatisticas.inicio) / 1000);
        const minutos = Math.floor(tempoDecorrido / 60);
        const segundos = tempoDecorrido % 60;

        switch (dados.tipo) {
            case 'resumindo':
                console.log(GREEN + '✓ Retomando sessao anterior...' + RESET);
                console.log('  ' + dados.processados + ' GTINs ja processados');
                break;

            case 'copiando':
                estatisticas.totalGtins = dados.total;
                cabecalho('Copiando', origem, destino);
                console.log('Processando ' + BOLD + dados.mes + RESET + ': ' + dados.processados + '/' + dados.total);
                console.log(barraProgresso(dados.processados - 1, dados.total));
                console.log(DIM + '→ ' + dados.gtin + ' (' + formatarTamanho(dados.tamanho) + ')' + RESET);
                console.log('');
                console.log('Tempo: ' + minutos + 'm ' + segundos + 's');
                break;

            case 'copiado':
                estatisticas.novos++;
                estatisticas.tamanhoCopiado += dados.tamanho;
                estatisticas.ultimoGtin = dados.gtin;
                const velocidade = estatisticas.tamanhoCopiado / (tempoDecorrido || 1);
                const tempoRestante = ((dados.total - dados.processados) / (dados.processados || 1)) * tempoDecorrido;

                cabecalho('Copiando', origem, destino);
                console.log('Processando ' + BOLD + (dados.mes || 'raiz') + RESET + ': ' + dados.processados + '/' + dados.total);
                console.log(barraProgresso(dados.processados, dados.total));
                console.log(GREEN + '✓ ' + RESET + dados.gtin + ' (' + formatarTamanho(dados.tamanho) + ')');
                console.log('');
                console.log('Tempo: ' + minutos + 'm ' + segundos + 's  |  Velocidade: ' + formatarTamanho(velocidade) + '/s');
                console.log('Estimado: ' + Math.round(tempoRestante / 60) + 'm ' + (tempoRestante % 60).toFixed(0) + 's');
                console.log('');
                console.log(DIM + '[P]ause  [Q]uit' + RESET);
                break;

            case 'ja-existe':
                estatisticas.jaExistiam++;
                console.log(DIM + '⊘ ' + dados.gtin + ' (ja existe)' + RESET);
                break;

            case 'erro':
                estatisticas.erros++;
                console.log(RED + '✗ ' + dados.gtin + ': ' + dados.msg + RESET);
                break;

            case 'pulado':
                console.log(DIM + '⊘ ' + dados.gtin + ' (ja processado)' + RESET);
                break;

            case 'concluido':
                cabecalho('Concluido', origem, destino);
                console.log(GREEN + BOLD + '✓ Pescador concluido com sucesso!' + RESET);
                console.log('');
                console.log('Resultados:');
                console.log('  ' + GREEN + dados.novos + ' novo(s)' + RESET);
                console.log('  ' + YELLOW + dados.jaExistiam + ' ja existia(m)' + RESET);
                if (dados.erros > 0) {
                    console.log('  ' + RED + dados.erros + ' erro(s)' + RESET);
                }
                console.log('');
                const tempoTotal = Math.round((Date.now() - estatisticas.inicio) / 1000);
                console.log('Tempo total: ' + (tempoTotal / 60).toFixed(1) + ' minutos');
                console.log('Dados copiados: ' + formatarTamanho(estatisticas.tamanhoCopiado));
                break;
        }
    };

    const resultado = await pescador.pescarGtinsComEstado(origem, destino, {
        onCallback,
        onStop,
        estadoAnterior
    });

    return resultado;
}

function formatarTamanho(bytes) {
    if (bytes === 0) return '0 B';
    const unidades = ['B', 'KB', 'MB', 'GB'];
    const indice = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, indice)).toFixed(1) + ' ' + unidades[indice];
}

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        const caminhos = carregarCaminhos();
        limparTela();

        if (!validarCaminhos(caminhos.legadoOrigemDir, caminhos.legadoDestinoDir)) {
            rl.close();
            process.exit(1);
        }

        // Verifica se ha sessao anterior
        const estadoAnterior = pescador.lerEstadoAnterior(caminhos.legadoDestinoDir);
        let estadoAUsar = null;

        if (estadoAnterior && estadoAnterior.status === 'parado') {
            const resumir = await perguntarResumir(rl, estadoAnterior);
            if (resumir) {
                estadoAUsar = estadoAnterior;
            }
        }

        // Setup de teclas (P = pause, Q = quit)
        let podeParar = true;
        const handleKeypress = (str, key) => {
            if (!podeParar) return;
            if (key && key.name === 'p') {
                parado = true;
                console.log(YELLOW + '\n⏸ Pausando...' + RESET);
            } else if (key && key.name === 'q') {
                parado = true;
                console.log(YELLOW + '\n⏹ Cancelando...' + RESET);
                process.exit(0);
            }
        };

        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.on('keypress', handleKeypress);
        }

        // Executa pescador
        const resultado = await rodaPescador(
            caminhos.legadoOrigemDir,
            caminhos.legadoDestinoDir,
            estadoAUsar
        );

        if (resultado.parado) {
            console.log(YELLOW + BOLD + '\n⏸ Pescador pausado.' + RESET);
            console.log('Execute novamente para retomar.');
        } else if (!resultado.ok) {
            console.log(RED + BOLD + '\n✗ Pescador finalizou com erros.' + RESET);
            if (resultado.erros.length > 0) {
                console.log('Erros:');
                resultado.erros.slice(0, 5).forEach(err => {
                    console.log('  ' + RED + '✗ ' + err + RESET);
                });
                if (resultado.erros.length > 5) {
                    console.log(DIM + '  ... e mais ' + (resultado.erros.length - 5) + ' erro(s)' + RESET);
                }
            }
        }

        rl.question('\nPressione Enter pra sair...', () => {
            rl.close();
            process.exit(resultado.ok && !resultado.parado ? 0 : 1);
        });

    } catch (err) {
        console.error(RED + BOLD + '\n✗ Erro fatal: ' + err.message + RESET);
        rl.close();
        process.exit(1);
    }
}

main();
