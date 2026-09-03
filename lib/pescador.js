// lib/pescador.js
// Modulo isolado pra copia de GTINs de origem -> destino com estado persistido,
// online check, e recuperacao de falhas. Reutilizavel por qualquer CLI/interface.

const fs = require('fs');
const path = require('path');

const REGEX_PASTA_GTIN = /^(\d+)/;
const TIMEOUT_CONEXAO = 5000; // 5s pra verificar se drive esta acessivel
const INTERVALO_PERSISTENCIA = 500; // Grava estado a cada GTIN copiado

// Arquivo de estado persistido na raiz do destino (mesmo lugar do controle-legado.json)
function caminhoPescadorEstado(destinoDir) {
    return path.join(destinoDir, 'pescador-estado.json');
}

// Lê arquivo de estado anterior (se existir)
function lerEstadoAnterior(destinoDir) {
    const caminho = caminhoPescadorEstado(destinoDir);
    if (!fs.existsSync(caminho)) return null;
    try {
        const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
        return typeof dados === 'object' && dados ? dados : null;
    } catch (err) {
        return null;
    }
}

// Grava estado para recuperacao em caso de falha/pausa
function gravarEstadoPescador(destinoDir, estado) {
    try {
        fs.writeFileSync(caminhoPescadorEstado(destinoDir), JSON.stringify(estado, null, 2) + '\n', 'utf8');
    } catch (err) {
        console.error('Erro ao gravar estado do Pescador:', err.message);
    }
}

// Valida se um diretorio e acessivel (testa timeout de conexao)
async function testarAcesso(caminho, timeoutMs = TIMEOUT_CONEXAO) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        try {
            if (fs.existsSync(caminho)) {
                clearTimeout(timer);
                resolve(true);
            } else {
                clearTimeout(timer);
                resolve(false);
            }
        } catch (err) {
            clearTimeout(timer);
            resolve(false);
        }
    });
}

// Copia um diretorio inteiro recursivamente
function copiarDiretorioRecursivo(src, dst) {
    if (!fs.existsSync(dst)) {
        fs.mkdirSync(dst, { recursive: true });
    }
    const arquivos = fs.readdirSync(src, { withFileTypes: true });
    for (const arquivo of arquivos) {
        const srcPath = path.join(src, arquivo.name);
        const dstPath = path.join(dst, arquivo.name);
        if (arquivo.isDirectory()) {
            copiarDiretorioRecursivo(srcPath, dstPath);
        } else {
            fs.copyFileSync(srcPath, dstPath);
        }
    }
}

// Calcula tamanho total de um diretorio (para progress bar)
function obterTamanhoDiretorio(caminho) {
    let total = 0;
    try {
        const arquivos = fs.readdirSync(caminho, { withFileTypes: true });
        for (const arquivo of arquivos) {
            const fullPath = path.join(caminho, arquivo.name);
            if (arquivo.isDirectory()) {
                total += obterTamanhoDiretorio(fullPath);
            } else {
                total += fs.statSync(fullPath).size;
            }
        }
    } catch (err) {
        return 0;
    }
    return total;
}

// Lê ou cria controle-legado.json
function lerControleLegado(destinoDir) {
    const caminho = path.join(destinoDir, 'controle-legado.json');
    if (!fs.existsSync(caminho)) return {};
    try {
        const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
        return typeof dados === 'object' && dados ? dados : {};
    } catch (err) {
        return {};
    }
}

function escreverControleLegado(destinoDir, mapa) {
    const caminho = path.join(destinoDir, 'controle-legado.json');
    fs.writeFileSync(caminho, JSON.stringify(mapa, null, 2) + '\n', 'utf8');
}

// Funcao principal: varre origem (subpastas de mes + GTIN) e copia pro destino
// Se onCallback provided, chama a cada GTIN processado { gtin, status, msg }
// onStop e chamado periodicamente pra verificar se user pediu pause (deve retornar true pra parar)
async function pescarGtinsComEstado(origemDir, destinoDir, opcoes = {}) {
    opcoes = opcoes || {};
    const onCallback = opcoes.onCallback || (() => {});
    const onStop = opcoes.onStop || (() => false);
    const estadoAnterior = opcoes.estadoAnterior || null;

    const resultado = {
        ok: true,
        novos: [],
        jaExistiam: [],
        erros: [],
        parado: false,
        resumivel: false,
        estado: null
    };

    const estado = estadoAnterior || {
        sessaoId: Date.now().toString(36),
        inicio: new Date().toISOString(),
        origem: origemDir,
        destino: destinoDir,
        status: 'em-progresso',
        processados: {}, // { 'Agosto': ['GTIN1', 'GTIN2'], ... }
        proximos: {}, // { 'Setembro': ['GTIN3', ...], ... }
        erros: {}, // { 'GTIN': 'mensagem de erro', ... }
        ultimaVerificacao: new Date().toISOString(),
        tamanhoCopiado: 0,
        tamanhoTotal: 0
    };

    try {
        // Validacao de caminhos
        if (!fs.existsSync(origemDir)) {
            resultado.ok = false;
            resultado.erros.push('Pasta de origem nao existe: ' + origemDir);
            return resultado;
        }

        if (!fs.existsSync(destinoDir)) {
            fs.mkdirSync(destinoDir, { recursive: true });
        }

        // Se tem estado anterior, continua de onde parou
        if (estadoAnterior && estadoAnterior.proximos) {
            onCallback({ tipo: 'resumindo', processados: Object.keys(estadoAnterior.processados).length });
        }

        // Varre origem: GTIN direto na raiz OU dentro de subpastas de mes
        const entradasRaiz = fs.readdirSync(origemDir, { withFileTypes: true })
            .filter(entrada => entrada.isDirectory())
            .map(entrada => entrada.name);

        estado.proximos = {};

        // Primeiro, monta a lista completa de GTIN a processar (se nao tiver anterior)
        if (!estadoAnterior || !estadoAnterior.proximos || Object.keys(estadoAnterior.proximos).length === 0) {
            for (const nomeEntrada of entradasRaiz) {
                if (REGEX_PASTA_GTIN.test(nomeEntrada)) {
                    // GTIN direto na raiz
                    if (!estado.proximos['raiz']) estado.proximos['raiz'] = [];
                    estado.proximos['raiz'].push(nomeEntrada);
                    continue;
                }

                // Subpasta de mes
                const pastaMesPath = path.join(origemDir, nomeEntrada);
                try {
                    const pastasGtin = fs.readdirSync(pastaMesPath, { withFileTypes: true })
                        .filter(entrada => entrada.isDirectory())
                        .map(entrada => entrada.name)
                        .filter(nome => REGEX_PASTA_GTIN.test(nome));

                    if (pastasGtin.length > 0) {
                        estado.proximos[nomeEntrada] = pastasGtin;
                    }
                } catch (err) {
                    onCallback({ tipo: 'erro', mes: nomeEntrada, msg: 'Erro ao varrer: ' + err.message });
                }
            }
        }

        const controleLegado = lerControleLegado(destinoDir);
        const totalGtins = Object.values(estado.proximos).reduce((acc, arr) => acc + arr.length, 0);
        let processados = 0;

        // Processa cada mes/GTIN
        for (const mes of Object.keys(estado.proximos)) {
            if (onStop()) {
                estado.status = 'parado';
                resultado.parado = true;
                resultado.resumivel = true;
                gravarEstadoPescador(destinoDir, estado);
                return resultado;
            }

            estado.processados[mes] = estado.processados[mes] || [];
            const gtinsDoMes = estado.proximos[mes];

            for (const pastaGtinNome of gtinsDoMes) {
                processados++;

                // Ja foi processado? (retoma de pausa)
                if (estado.processados[mes].includes(pastaGtinNome)) {
                    resultado.jaExistiam.push(pastaGtinNome);
                    onCallback({
                        tipo: 'pulado',
                        gtin: pastaGtinNome,
                        mes: mes,
                        processados: processados,
                        total: totalGtins
                    });
                    continue;
                }

                const gtin = pastaGtinNome.match(REGEX_PASTA_GTIN)[1];
                const originemPath = mes === 'raiz'
                    ? path.join(origemDir, pastaGtinNome)
                    : path.join(origemDir, mes, pastaGtinNome);
                const destinoGtinPath = path.join(destinoDir, pastaGtinNome);

                try {
                    // Valida acessibilidade (online check a cada GTIN)
                    const acessoOk = await testarAcesso(originemPath, 2000);
                    if (!acessoOk) {
                        throw new Error('Drive offline ou caminho inutil');
                    }

                    // Verifica se GTIN ja esta no JSON de legado (ja foi processado antes)
                    if (controleLegado[gtin]) {
                        resultado.jaExistiam.push(gtin);
                        estado.processados[mes].push(pastaGtinNome);
                        onCallback({
                            tipo: 'ja-existe',
                            gtin,
                            mes: mes !== 'raiz' ? mes : null,
                            processados,
                            total: totalGtins
                        });
                        continue;
                    }

                    if (fs.existsSync(destinoGtinPath)) {
                        resultado.jaExistiam.push(gtin);
                        estado.processados[mes].push(pastaGtinNome);
                        onCallback({
                            tipo: 'ja-existe',
                            gtin,
                            mes: mes !== 'raiz' ? mes : null,
                            processados,
                            total: totalGtins
                        });
                    } else {
                        const tamanho = obterTamanhoDiretorio(originemPath);
                        onCallback({
                            tipo: 'copiando',
                            gtin,
                            mes: mes !== 'raiz' ? mes : null,
                            tamanho,
                            processados,
                            total: totalGtins
                        });

                        copiarDiretorioRecursivo(originemPath, destinoGtinPath);

                        // Registra no controle-legado.json
                        controleLegado[gtin] = {
                            status: 'pendente',
                            data: new Date().toISOString(),
                            mesOrigem: mes !== 'raiz' ? mes : null
                        };

                        estado.processados[mes].push(pastaGtinNome);
                        estado.tamanhoCopiado += tamanho;
                        resultado.novos.push(gtin);

                        onCallback({
                            tipo: 'copiado',
                            gtin,
                            mes: mes !== 'raiz' ? mes : null,
                            tamanho,
                            processados,
                            total: totalGtins
                        });
                    }
                } catch (err) {
                    estado.erros[gtin] = err.message;
                    resultado.erros.push('GTIN ' + gtin + (mes !== 'raiz' ? ' (' + mes + ')' : '') + ': ' + err.message);
                    onCallback({
                        tipo: 'erro',
                        gtin,
                        mes: mes !== 'raiz' ? mes : null,
                        msg: err.message,
                        processados,
                        total: totalGtins
                    });
                }

                // Verifica pause a cada GTIN
                if (onStop()) {
                    estado.status = 'parado';
                    resultado.parado = true;
                    resultado.resumivel = true;
                    gravarEstadoPescador(destinoDir, estado);
                    return resultado;
                }

                // Grava estado periodicamente
                estado.ultimaVerificacao = new Date().toISOString();
                gravarEstadoPescador(destinoDir, estado);
            }

            // Remove este mes da fila de proximos
            delete estado.proximos[mes];
        }

        // Terminou com sucesso
        estado.status = 'concluido';
        estado.ultimaVerificacao = new Date().toISOString();
        escreverControleLegado(destinoDir, controleLegado);
        gravarEstadoPescador(destinoDir, estado);
        resultado.estado = estado;

        onCallback({
            tipo: 'concluido',
            novos: resultado.novos.length,
            jaExistiam: resultado.jaExistiam.length,
            erros: resultado.erros.length
        });

    } catch (err) {
        resultado.ok = false;
        resultado.erros.push('Erro geral: ' + err.message);
        estado.status = 'erro';
        gravarEstadoPescador(destinoDir, estado);
    }

    return resultado;
}

module.exports = {
    pescarGtinsComEstado,
    testarAcesso,
    lerEstadoAnterior,
    gravarEstadoPescador,
    caminhoPescadorEstado,
    lerControleLegado,
    escreverControleLegado,
    obterTamanhoDiretorio
};
