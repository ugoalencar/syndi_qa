#!/usr/bin/env node
// diagnostico-pescador.js
// Verifica se o ciclo Origem → Pescador → JSON → syndi_qa está correto

const fs = require('fs');
const path = require('path');
const qaSyndi = require('./lib/qaSyndi');
const pescador = require('./lib/pescador');

const CAMINHOS_CONFIG = path.join(__dirname, 'caminhos-locais.json');
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

function log(tipo, msg) {
    const prefixos = {
        OK: GREEN + '✓' + RESET,
        ERRO: RED + '✗' + RESET,
        INFO: CYAN + 'ℹ' + RESET,
        AVISO: YELLOW + '⚠' + RESET,
    };
    console.log(prefixos[tipo] + ' ' + msg);
}

async function diagnosticar() {
    console.log(BOLD + CYAN + '═══════════════════════════════════════════════' + RESET);
    console.log(BOLD + CYAN + 'DIAGNÓSTICO: Ciclo Origem → Pescador → JSON' + RESET);
    console.log(BOLD + CYAN + '═══════════════════════════════════════════════' + RESET);

    // 1. Verifica caminhos
    console.log(BOLD + '\n1. VALIDANDO CAMINHOS' + RESET);
    if (!fs.existsSync(CAMINHOS_CONFIG)) {
        log('ERRO', 'caminhos-locais.json não encontrado');
        return;
    }

    const caminhos = JSON.parse(fs.readFileSync(CAMINHOS_CONFIG, 'utf8'));
    const origem = caminhos.legadoOrigemDir;
    const destino = caminhos.legadoDestinoDir;

    if (!origem || !destino) {
        log('ERRO', 'Caminhos não configurados em caminhos-locais.json');
        return;
    }

    log('OK', 'Origem: ' + origem);
    log('OK', 'Destino: ' + destino);

    if (!fs.existsSync(origem)) {
        log('ERRO', 'Pasta de origem não existe');
        return;
    }
    log('OK', 'Pasta de origem acessível');

    if (!fs.existsSync(destino)) {
        log('AVISO', 'Pasta de destino não existe (será criada pelo Pescador)');
    } else {
        log('OK', 'Pasta de destino existe');
    }

    // 2. Varre estrutura da origem
    console.log(BOLD + '\n2. ESTRUTURA DA ORIGEM' + RESET);
    let totalOrigemGtins = 0;
    const mesesEncontrados = {};

    try {
        const entradasRaiz = fs.readdirSync(origem, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name);

        for (const entrada of entradasRaiz) {
            const pastaPath = path.join(origem, entrada);
            const subEntradas = fs.readdirSync(pastaPath, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .filter(e => /^\d+/.test(e.name)); // GTIN começa com dígito

            if (subEntradas.length > 0) {
                mesesEncontrados[entrada] = subEntradas.length;
                totalOrigemGtins += subEntradas.length;
                log('INFO', entrada + ': ' + subEntradas.length + ' GTINs');
            }
        }

        log('OK', 'Total de GTINs na origem: ' + totalOrigemGtins);
    } catch (err) {
        log('ERRO', 'Erro ao varrer origem: ' + err.message);
        return;
    }

    // 3. Verifica JSON de controle
    console.log(BOLD + '\n3. CONTROLE-LEGADO.JSON' + RESET);
    const controleLegado = pescador.lerControleLegado(destino);
    const gtinsNoJson = Object.keys(controleLegado);
    const legados = gtinsNoJson.filter(g => controleLegado[g].status === 'legado').length;
    const pendentes = gtinsNoJson.filter(g => controleLegado[g].status === 'pendente').length;

    if (gtinsNoJson.length === 0) {
        log('AVISO', 'controle-legado.json vazio ou não existe');
    } else {
        log('OK', 'Total no JSON: ' + gtinsNoJson.length);
        log('INFO', 'Legado: ' + legados + '  |  Pendente: ' + pendentes);
    }

    // 4. Verifica pasta de destino
    console.log(BOLD + '\n4. PASTA DE DESTINO' + RESET);
    let totalDestinoGtins = 0;
    if (fs.existsSync(destino)) {
        const pastasDentro = fs.readdirSync(destino, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .filter(e => /^\d+/.test(e.name));

        totalDestinoGtins = pastasDentro.length;
        log('OK', 'GTINs no destino: ' + totalDestinoGtins);

        // Verifica se estão no JSON
        const faltamNoJson = pastasDentro.filter(e => !controleLegado[e.name]);
        if (faltamNoJson.length > 0) {
            log('AVISO', faltamNoJson.length + ' GTINs no destino mas NÃO no JSON');
            log('AVISO', 'Rodar "Gerar snapshot do legado" para marcar como legado');
        }
    } else {
        log('AVISO', 'Pasta de destino ainda não existe');
    }

    // 5. Verifica estado persistido
    console.log(BOLD + '\n5. ESTADO PERSISTIDO (pescador-estado.json)' + RESET);
    const estadoPath = pescador.caminhoPescadorEstado(destino);
    if (fs.existsSync(estadoPath)) {
        const estado = JSON.parse(fs.readFileSync(estadoPath, 'utf8'));
        log('OK', 'Última sessão: ' + estado.inicio);
        log('INFO', 'Status: ' + estado.status);
        const processados = Object.values(estado.processados).reduce((a, b) => a + b.length, 0);
        log('INFO', 'Já processados: ' + processados + ' GTINs');
    } else {
        log('INFO', 'Nenhuma sessão anterior');
    }

    // 6. Validação do ciclo
    console.log(BOLD + '\n6. VALIDAÇÃO DO CICLO' + RESET);
    if (totalOrigemGtins === 0) {
        log('AVISO', 'Origem vazia - nada a pescar');
    } else if (totalDestinoGtins === 0) {
        log('INFO', 'Destino vazio - Pescador ainda não rodou');
    } else if (totalDestinoGtins > totalOrigemGtins) {
        log('AVISO', 'Mais GTINs no destino que na origem!?');
    } else if (totalDestinoGtins < totalOrigemGtins) {
        log('INFO', 'Destino tem ' + (totalOrigemGtins - totalDestinoGtins) + ' GTINs pendentes da origem');
    } else {
        log('OK', 'Origem e destino sincronizados (' + totalDestinoGtins + ' GTINs)');
    }

    if (totalDestinoGtins > 0 && gtinsNoJson < totalDestinoGtins) {
        log('AVISO', 'JSON desatualizado - faltam ' + (totalDestinoGtins - gtinsNoJson) + ' GTINs');
    }

    // 7. Como o syndi_qa vê
    console.log(BOLD + '\n7. COMO O SYNDI_QA VÊ (listarOsNone)' + RESET);
    const osNone = qaSyndi.listarOsNone(destino);
    log('OK', 'syndi_qa vê: ' + osNone.length + ' GTINs');
    if (osNone.length > 0) {
        const statusCount = {};
        osNone.forEach(item => {
            statusCount[item.status] = (statusCount[item.status] || 0) + 1;
        });
        Object.entries(statusCount).forEach(([status, count]) => {
            log('INFO', status.toUpperCase() + ': ' + count);
        });

        // Mostra os primeiros 3
        console.log(BOLD + '\nPrimeiros 3 GTINs:' + RESET);
        osNone.slice(0, 3).forEach(item => {
            const statusColor = item.status === 'legado' ? YELLOW : GREEN;
            console.log('  ' + item.gtin + ' [' + statusColor + item.status + RESET + ']  (' + item.arquivos.length + ' arquivos)');
        });
    }

    console.log(BOLD + CYAN + '\n═══════════════════════════════════════════════' + RESET);
    console.log(BOLD + 'RESUMO DO CICLO:' + RESET);
    console.log('  Origem → ' + totalOrigemGtins + ' GTINs');
    console.log('  Destino → ' + totalDestinoGtins + ' GTINs (' + (totalOrigemGtins - totalDestinoGtins) + ' faltam)');
    console.log('  JSON → ' + gtinsNoJson.length + ' GTINs (' + legados + ' legado, ' + pendentes + ' pendente)');
    console.log('  syndi_qa vê → ' + osNone.length + ' GTINs');
    console.log(BOLD + CYAN + '═══════════════════════════════════════════════' + RESET);
}

diagnosticar().catch(err => {
    console.error(RED + 'Erro fatal: ' + err.message + RESET);
    process.exit(1);
});
