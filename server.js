const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const qaSyndi = require('./lib/qaSyndi');
const redmine = require('./lib/redmine');
const previewImagem = require('./lib/previewImagem');
const versionamento = require('./lib/versionamento');

// So loga antes de encerrar - depois de um erro nao tratado o processo fica em
// estado indefinido, entao nao deve continuar rodando "zumbi". Mesmo padrao do
// server.js do sphoto.
process.on('uncaughtException', (err) => {
    console.error('Erro nao tratado, encerrando:', err);
    process.exit(1);
});
process.on('unhandledRejection', (err) => {
    console.error('Promise rejeitada sem catch, encerrando:', err);
    process.exit(1);
});

const PORT = 3001;
const BASE_PATH = __dirname;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

// Arquivos que NUNCA podem sair pelo HTTP - mesmo motivo do sphoto (handler
// estatico entrega qualquer arquivo da pasta do projeto).
const ARQUIVOS_BLOQUEADOS = ['caminhos-locais.json', 'redmine-config.json', 'credencial.txt', 'credenciais.txt', 'valores.txt', '.env'];

function ehArquivoBloqueado(caminho) {
    const nome = path.basename(caminho).toLowerCase();
    return ARQUIVOS_BLOQUEADOS.includes(nome) || /\.(key|pem|pfx|p12)$/i.test(nome);
}

function isNomeSeguro(valor) {
    return typeof valor === 'string' && valor.length > 0 &&
        !valor.includes('..') && !valor.includes('/') && !valor.includes('\\');
}

function lerCorpo(req) {
    return new Promise((resolve, reject) => {
        let corpo = '';
        req.on('data', chunk => { corpo += chunk; });
        req.on('end', () => resolve(corpo));
        req.on('error', reject);
    });
}

function enviarJson(res, status, dados) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dados));
}

function enviarArquivoImagem(res, caminho) {
    fs.readFile(caminho, (err, content) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Erro no servidor');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(content);
    });
}

function hojeISO() {
    const agora = new Date();
    return agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');
}

function obterPastaOsPath(osParam) {
    if (osParam === 'OS_NONE') {
        const pastaOsNone = path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE');
        if (!fs.existsSync(pastaOsNone)) {
            return null;
        }
        return { pastaOsNome: 'OS_NONE', pastaOsPath: pastaOsNone };
    }
    const pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, osParam, /^OS_(\d+)/);
    if (!pastaOsNome) {
        return null;
    }
    return { pastaOsNome, pastaOsPath: path.join(qaSyndi.AGCONFERENCIA, pastaOsNome) };
}

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // So confirma que o server.js esta de pe (se respondeu, esta rodando) - usado
    // pelo monitor.html, nao toca em nenhum outro processo/porta.
    if (req.method === 'GET' && req.url === '/api/status') {
        enviarJson(res, 200, { ok: true });
        return;
    }

    if (req.method === 'GET' && req.url === '/api/versao') {
        const versao = versionamento.carregarVersao(BASE_PATH);
        const git = versionamento.obterGitDescribe(BASE_PATH);
        enviarJson(res, 200, { ok: true, nome: versao.nome, versao: versao.versao, data: versao.data, git });
        return;
    }

    if (req.method === 'GET' && req.url === '/api/fila') {
        try {
            const fila = qaSyndi.listarFila(qaSyndi.AGCONFERENCIA);
            enviarJson(res, 200, { ok: true, fila });
        } catch (err) {
            enviarJson(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    if (req.method === 'GET' && req.url === '/api/os-none') {
        try {
            const gtins = qaSyndi.listarOsNone(qaSyndi.AGCONFERENCIA);
            enviarJson(res, 200, { ok: true, gtins });
        } catch (err) {
            enviarJson(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    if (req.method === 'GET' && req.url === '/api/diagnostico-fila') {
        try {
            enviarJson(res, 200, { ok: true, diagnostico: qaSyndi.diagnosticarFila(qaSyndi.AGCONFERENCIA) });
        } catch (err) {
            enviarJson(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    if (req.method === 'GET' && req.url === '/api/gtin-counts') {
        try {
            qaSyndi.obterContagemGtins(redmine).then(counts => {
                enviarJson(res, 200, { ok: true, counts });
            }).catch(err => {
                enviarJson(res, 500, { ok: false, error: err.message });
            });
        } catch (err) {
            enviarJson(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/gtin')) {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const os = query.get('os') || '';
        const gtin = query.get('gtin') || '';
        if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
            enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
            return;
        }

        let pastaOsNome, pastaOsPath;

        // Caso especial: OS_NONE
        if (os === 'OS_NONE') {
            pastaOsNome = 'OS_NONE';
            pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE');
            if (!fs.existsSync(pastaOsPath)) {
                enviarJson(res, 404, { ok: false, error: 'OS_NONE nao existe' });
                return;
            }
        } else {
            pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
            if (!pastaOsNome) {
                enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                return;
            }
            pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
        }

        const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
        if (!pastaGtinNome) {
            enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
            return;
        }
        const destino = qaSyndi.obterDestinoGtin(pastaOsPath, gtin);
        const imagens = qaSyndi.listarImagensGtin(path.join(pastaOsPath, pastaGtinNome), destino);
        enviarJson(res, 200, { ok: true, os, gtin, pastaOsNome, pastaGtinNome, imagens });
        return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/imagem')) {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const os = query.get('os') || '';
        const gtin = query.get('gtin') || '';
        const nome = query.get('nome') || '';
        const pastaOsNomeParam = query.get('pastaOsNome') || '';
        const pastaGtinNomeParam = query.get('pastaGtinNome') || '';
        if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
            enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
            return;
        }
        // Se o front-end ja mandou os nomes decorados (obtidos de GET /api/gtin, que ja
        // fez essa resolucao uma vez), reaproveita em vez de varrer a pasta de novo pra
        // cada foto - varredura sincrona (readdirSync) bloqueava o event loop a cada
        // imagem carregada, e um GTIN tem dezenas de fotos. So aceita se o nome bate
        // exatamente com o prefixo esperado pro os/gtin pedido (nomeDecoradoBate) E a
        // pasta existir de verdade - nunca confia cegamente no valor do cliente pra
        // montar o caminho. Sem esses parametros (uso direto da URL, por ex.), cai no
        // comportamento antigo.
        let pastaOsNome = null;
        let pastaOsPath = null;

        if (os === 'OS_NONE') {
            pastaOsNome = 'OS_NONE';
            pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE');
            if (!fs.existsSync(pastaOsPath)) {
                enviarJson(res, 404, { ok: false, error: 'OS_NONE nao existe' });
                return;
            }
        } else {
            if (isNomeSeguro(pastaOsNomeParam) && qaSyndi.nomeDecoradoBate(pastaOsNomeParam, os, /^OS_(\d+)/) &&
                fs.existsSync(path.join(qaSyndi.AGCONFERENCIA, pastaOsNomeParam))) {
                pastaOsNome = pastaOsNomeParam;
            } else {
                pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
            }
            if (!pastaOsNome) {
                enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                return;
            }
            pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
        }
        let pastaGtinNome = null;
        if (isNomeSeguro(pastaGtinNomeParam) && qaSyndi.nomeDecoradoBate(pastaGtinNomeParam, gtin, /^(\d+)/) &&
            fs.existsSync(path.join(pastaOsPath, pastaGtinNomeParam))) {
            pastaGtinNome = pastaGtinNomeParam;
        } else {
            pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
        }
        if (!pastaGtinNome) {
            enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
            return;
        }
        const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
        const caminhoImagem = qaSyndi.resolverImagemSegura(pastaGtinPath, nome);
        if (!caminhoImagem || !fs.existsSync(caminhoImagem)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Imagem nao encontrada');
            return;
        }
        const tamanho = query.get('tamanho') || '';
        if (tamanho === 'mini' || tamanho === 'zoom') {
            previewImagem.gerarPreview(caminhoImagem, tamanho)
                .then(caminhoPreview => enviarArquivoImagem(res, caminhoPreview))
                .catch(err => {
                    // Preview quebrado nunca pode deixar a tela em branco - cai pro
                    // original (mais lento, mas funciona).
                    console.error('Erro ao gerar preview, servindo original:', err);
                    enviarArquivoImagem(res, caminhoImagem);
                });
            return;
        }
        enviarArquivoImagem(res, caminhoImagem);
        return;
    }

    if (req.method === 'POST' && req.url === '/api/tag-subpasta') {
        lerCorpo(req).then(corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            const nome = dados.nome;
            const pasta = dados.pasta;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin) || !isNomeSeguro(nome)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin/nome invalidos' });
                return;
            }
            const osInfo = obterPastaOsPath(os);
            if (!osInfo) {
                enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                return;
            }
            const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(osInfo.pastaOsPath, gtin, /^(\d+)/);
            if (!pastaGtinNome) {
                enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
                return;
            }
            const pastaGtinPath = path.join(osInfo.pastaOsPath, pastaGtinNome);
            try {
                const resultado = qaSyndi.moverParaSubpastaSyndi(pastaGtinPath, nome, pasta);
                enviarJson(res, 200, { ok: true, destino: resultado.destino });
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/deletar-foto') {
        lerCorpo(req).then(corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            const nome = dados.nome;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin) || !isNomeSeguro(nome)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin/nome invalidos' });
                return;
            }
            let pastaOsNome, pastaOsPath;
            if (os === 'OS_NONE') {
                pastaOsNome = 'OS_NONE';
                pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE');
                if (!fs.existsSync(pastaOsPath)) {
                    enviarJson(res, 404, { ok: false, error: 'OS_NONE nao existe' });
                    return;
                }
            } else {
                pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
                if (!pastaOsNome) {
                    enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                    return;
                }
                pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
            }
            const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
            if (!pastaGtinNome) {
                enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
                return;
            }
            const pastaGtinPath = path.join(pastaOsPath, pastaGtinNome);
            try {
                qaSyndi.deletarFotoSyndi(pastaGtinPath, nome);
                enviarJson(res, 200, { ok: true });
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/marcar-coding') {
        lerCorpo(req).then(corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            const nome = dados.nome;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin) || !isNomeSeguro(nome)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin/nome invalidos' });
                return;
            }
            let pastaOsNome, pastaOsPath;
            if (os === 'OS_NONE') {
                pastaOsNome = 'OS_NONE';
                pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE');
                if (!fs.existsSync(pastaOsPath)) {
                    enviarJson(res, 404, { ok: false, error: 'OS_NONE nao existe' });
                    return;
                }
            } else {
                pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
                if (!pastaOsNome) {
                    enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                    return;
                }
                pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
            }
            const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
            if (!pastaGtinNome) {
                enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
                return;
            }
            const pastaGtinPath = path.join(pastaOsPath, pastaGtinNome);
            try {
                const resultado = qaSyndi.toggleCodingSyndi(pastaGtinPath, nome);
                enviarJson(res, 200, { ok: true, novoNome: resultado.novoNome });
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/marcar-destino') {
        lerCorpo(req).then(corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            const tipo = dados.tipo === undefined ? null : dados.tipo;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
                return;
            }
            let pastaOsNome, pastaOsPath;
            if (os === 'OS_NONE') {
                pastaOsNome = 'OS_NONE';
                pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE');
                if (!fs.existsSync(pastaOsPath)) {
                    enviarJson(res, 404, { ok: false, error: 'OS_NONE nao existe' });
                    return;
                }
            } else {
                pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
                if (!pastaOsNome) {
                    enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                    return;
                }
                pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
            }
            const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
            if (!pastaGtinNome) {
                enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
                return;
            }
            try {
                qaSyndi.marcarDestinoSyndi(pastaOsPath, gtin, tipo);
                enviarJson(res, 200, { ok: true });
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/marcas-ocr')) {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const os = query.get('os') || '';
        const gtin = query.get('gtin') || '';
        if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
            enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
            return;
        }
        let pastaOsNome, pastaOsPath;
        if (os === 'OS_NONE') {
            pastaOsNome = 'OS_NONE';
            pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE');
            if (!fs.existsSync(pastaOsPath)) {
                enviarJson(res, 404, { ok: false, error: 'OS_NONE nao existe' });
                return;
            }
        } else {
            pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
            if (!pastaOsNome) {
                enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                return;
            }
            pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
        }
        const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
        if (!pastaGtinNome) {
            enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
            return;
        }
        const pastaGtinPath = path.join(pastaOsPath, pastaGtinNome);
        try {
            const marcas = qaSyndi.obterMarcasOcr(pastaGtinPath);
            enviarJson(res, 200, { ok: true, marcas });
        } catch (err) {
            enviarJson(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    if (req.method === 'POST' && req.url === '/api/marcar-ocr') {
        lerCorpo(req).then(corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            const foto = dados.foto;
            const marcado = dados.marcado;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin) || !isNomeSeguro(foto)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin/foto invalidos' });
                return;
            }
            if (typeof marcado !== 'boolean') {
                enviarJson(res, 400, { ok: false, error: 'marcado deve ser true ou false' });
                return;
            }
            let pastaOsNome, pastaOsPath;
            if (os === 'OS_NONE') {
                pastaOsNome = 'OS_NONE';
                pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, 'OS_NONE');
                if (!fs.existsSync(pastaOsPath)) {
                    enviarJson(res, 404, { ok: false, error: 'OS_NONE nao existe' });
                    return;
                }
            } else {
                pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
                if (!pastaOsNome) {
                    enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                    return;
                }
                pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
            }
            const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
            if (!pastaGtinNome) {
                enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
                return;
            }
            const pastaGtinPath = path.join(pastaOsPath, pastaGtinNome);
            try {
                qaSyndi.toggleMarcaOcr(pastaGtinPath, foto, marcado);
                enviarJson(res, 200, { ok: true });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

    // Campos inferidos pro formulario de envio pra edicao (responsavel/quantidades) -
    // so leitura, nada e gravado nem movido aqui.
    if (req.method === 'GET' && req.url.startsWith('/api/aprovar/preparar')) {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const os = query.get('os') || '';
        const gtin = query.get('gtin') || '';
        if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
            enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
            return;
        }
        const pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
        if (!pastaOsNome) {
            enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
            return;
        }
        const pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
        const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
        if (!pastaGtinNome) {
            enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
            return;
        }
        const destino = qaSyndi.obterDestinoGtin(pastaOsPath, gtin);
        const inferido = qaSyndi.inferirCamposEdicao(path.join(pastaOsPath, pastaGtinNome), destino);
        enviarJson(res, 200, { ok: true, destino: inferido.destino, motivo: inferido.motivo || null, campos: inferido.campos });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/aprovar') {
        lerCorpo(req).then(async corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
                return;
            }
            const responsavel = typeof dados.responsavel === 'string' ? dados.responsavel.trim() : '';
            const qtdRecorte = typeof dados.qtdRecorte === 'string' ? dados.qtdRecorte.trim() : '';
            const qtdMockup = typeof dados.qtdMockup === 'string' ? dados.qtdMockup.trim() : '';
            // userId so serve pro bloqueio de identidade abaixo (obrigatoria pra aprovar
            // QUALQUER coisa) - NAO entra mais no objeto campos, cf_85 virou um dropdown
            // manual comum (responsavelQaImagem), igual ja e na aba QA para Edicao.
            const responsavelQaImagem = typeof dados.responsavelQaImagem === 'string' ? dados.responsavelQaImagem.trim() : '';
            const responsavel3Check = typeof dados.responsavel3Check === 'string' ? dados.responsavel3Check.trim() : '';
            if (!/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup) ||
                !/^\d*$/.test(responsavelQaImagem) || !/^\d*$/.test(responsavel3Check)) {
                enviarJson(res, 400, { ok: false, error: 'responsavel/qtdRecorte/qtdMockup/responsavelQaImagem/responsavel3Check devem ser numericos ou vazios' });
                return;
            }
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
            const pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
            if (!pastaOsNome) {
                enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                return;
            }
            const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(path.join(qaSyndi.AGCONFERENCIA, pastaOsNome), gtin, /^(\d+)/);
            if (!pastaGtinNome) {
                enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
                return;
            }
            const pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
            const pastaGtinPath = path.join(pastaOsPath, pastaGtinNome);
            const destinoAtual = qaSyndi.obterDestinoGtin(pastaOsPath, gtin);
            let mockupInfo;
            let recorteInfo;
            if (destinoAtual === 'Mockup') {
                const numeroMockup = typeof dados.numeroMockup === 'string' ? dados.numeroMockup.trim() : '';
                if (!numeroMockup) {
                    enviarJson(res, 400, { ok: false, error: 'Numero do Mockup e obrigatorio quando o destino e Mockup' });
                    return;
                }
                const orientacoesMockup = Array.isArray(dados.orientacoesMockup)
                    ? dados.orientacoesMockup.filter(o => typeof o === 'string')
                    : [];
                const observacoesMockup = typeof dados.observacoesMockup === 'string' ? dados.observacoesMockup.trim() : '';
                mockupInfo = { gtin, numero: numeroMockup, orientacoes: orientacoesMockup, observacoes: observacoesMockup };
            }
            if (destinoAtual === 'Recorte') {
                const orientacoesRecorte = Array.isArray(dados.orientacoesRecorte)
                    ? dados.orientacoesRecorte.filter(o => typeof o === 'string')
                    : [];
                const observacoesRecorte = typeof dados.observacoesRecorte === 'string' ? dados.observacoesRecorte.trim() : '';
                recorteInfo = { gtin, orientacoes: orientacoesRecorte, observacoes: observacoesRecorte };
            }
            // Grava Responsavel/Quantidades/Responsaveis QA ANTES de mover - falha aqui IMPEDE
            // o aprovar (diferente do retrabalho, que segue com aviso): sem esses campos o
            // editor nao sabe o que fazer com o material. userId continua obrigatorio pra poder
            // aprovar (ver checagem acima), mas NAO entra mais nesta lista de custom_fields -
            // se todos os campos (responsavel/qtdRecorte/qtdMockup/responsavelQaImagem/
            // responsavel3Check) ficarem em branco, a lista fica vazia e nada e gravado no
            // Redmine (aprova mesmo assim, sem exigir ficha aberta). Situacao das Imagens
            // continua do robo.
            let redmineGravado = false;
            try {
                const r = await redmine.gravarCamposEdicao(BASE_PATH, gtin, { responsavel, qtdRecorte, qtdMockup, responsavelQaImagem, responsavel3Check });
                redmineGravado = r.gravado;
            } catch (err) {
                console.error('Erro ao gravar campos de edicao no Redmine para GTIN', gtin, err);
                enviarJson(res, 500, { ok: false, error: 'Nao foi possivel gravar no Redmine - o GTIN NAO foi enviado: ' + err.message });
                return;
            }
            try {
                const resultado = qaSyndi.aprovarGtin(qaSyndi.AGCONFERENCIA, qaSyndi.AGENVIO, pastaOsNome, pastaGtinNome, gtin, mockupInfo, recorteInfo);
                enviarJson(res, 200, { ok: true, destino: resultado.destino, redmineGravado });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/retrabalho') {
        lerCorpo(req).then(async corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            const marcacoes = dados.marcacoes;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin) || typeof marcacoes !== 'object' || !marcacoes || Object.keys(marcacoes).length === 0) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin/marcacoes invalidos' });
                return;
            }
            // Defesa em profundidade: o front-end ja impede marcar retrabalho sem motivo
            // (todasMarcacoesTemMotivo em qa.js), mas o servidor nao pode confiar cegamente
            // no cliente - foto marcada sem motivo vira linha vazia e inutil no retrabalho.txt.
            const temFotoSemMotivo = Object.values(marcacoes).some(lista => !Array.isArray(lista) || lista.length === 0);
            if (temFotoSemMotivo) {
                enviarJson(res, 400, { ok: false, error: 'Toda foto marcada precisa de pelo menos um motivo selecionado' });
                return;
            }
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
            const pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
            if (!pastaOsNome) {
                enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
                return;
            }
            const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(path.join(qaSyndi.AGCONFERENCIA, pastaOsNome), gtin, /^(\d+)/);
            if (!pastaGtinNome) {
                enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
                return;
            }
            try {
                const resultado = qaSyndi.retrabalharGtin(qaSyndi.AGCONFERENCIA, qaSyndi.RETRABALHO, pastaOsNome, pastaGtinNome, os, gtin, marcacoes);
                // O move de pasta + TXT ja aconteceram e sao a fonte de verdade local -
                // se o Redmine falhar (rede, GTIN sem ficha aberta, etc.) NAO desfaz nada,
                // so avisa via redmineOk/redmineError. Mesmo principio do qaHub.js do sphoto
                // ("falha aqui nao derruba o retorno, so loga/avisa").
                let redmineOk = true;
                let redmineError = null;
                try {
                    await redmine.marcarRetrabalhoFotografia(BASE_PATH, gtin, userId);
                } catch (err) {
                    redmineOk = false;
                    redmineError = err.message;
                    console.error('Erro ao marcar Retrabalho Fotografia no Redmine para GTIN', gtin, err);
                }
                enviarJson(res, 200, { ok: true, destino: resultado.destino, redmineOk, redmineError });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'GET' && req.url === '/api/motivos') {
        enviarJson(res, 200, { ok: true, motivos: qaSyndi.carregarMotivos(BASE_PATH) });
        return;
    }

    if (req.method === 'GET' && req.url === '/api/orientacoes-mockup') {
        enviarJson(res, 200, { ok: true, orientacoes: qaSyndi.carregarOrientacoesMockup(BASE_PATH) });
        return;
    }

    if (req.method === 'GET' && req.url === '/api/orientacoes-recorte') {
        enviarJson(res, 200, { ok: true, orientacoes: qaSyndi.carregarOrientacoesRecorte(BASE_PATH) });
        return;
    }

    if (req.method === 'GET' && req.url === '/api/mockup-catalogo') {
        try {
            const catalogo = JSON.parse(fs.readFileSync(path.join(BASE_PATH, 'mockup-catalogo.json'), 'utf8'));
            enviarJson(res, 200, { ok: true, mockups: catalogo });
        } catch (err) {
            enviarJson(res, 500, { ok: false, error: 'Erro ao carregar catalogo de mockups: ' + err.message });
        }
        return;
    }

    // Detalhe da aba "QA para Edicao" - situacao atual no Redmine (se houver ficha aberta)
    // + sugestoes locais de Responsavel/Quantidades (mesma inferencia do Aprovar). So
    // leitura, nada e gravado nem movido aqui.
    if (req.method === 'GET' && req.url.startsWith('/api/edicao/detalhe')) {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const os = query.get('os') || '';
        const gtin = query.get('gtin') || '';
        if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
            enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
            return;
        }
        const pastaOsNome = qaSyndi.localizarPastaDecoradaPorPrefixo(qaSyndi.AGCONFERENCIA, os, /^OS_(\d+)/);
        if (!pastaOsNome) {
            enviarJson(res, 404, { ok: false, error: 'OS nao encontrada em AgConferencia' });
            return;
        }
        const pastaOsPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome);
        const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(pastaOsPath, gtin, /^(\d+)/);
        if (!pastaGtinNome) {
            enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
            return;
        }
        const destino = qaSyndi.obterDestinoGtin(pastaOsPath, gtin);
        redmine.buscarDetalheEdicao(BASE_PATH, gtin).then(resultado => {
            const inferido = qaSyndi.inferirCamposEdicao(path.join(pastaOsPath, pastaGtinNome), destino);
            enviarJson(res, 200, { ok: true, issue: resultado.issue, sugeridos: inferido.campos });
        }).catch(err => {
            enviarJson(res, 500, { ok: false, error: err.message });
        });
        return;
    }

    // Grava os 6 campos da aba "QA para Edicao" (incluindo Situacao, Responsavel QA Imagem
    // e Responsavel 3 Check) - independente do Aprovar, nunca move pasta. Reaproveita o
    // mesmo padrao de validacao numerica de /api/aprovar.
    if (req.method === 'POST' && req.url === '/api/edicao/gravar') {
        lerCorpo(req).then(async corpo => {
            let dados;
            try {
                dados = JSON.parse(corpo);
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: 'JSON invalido' });
                return;
            }
            const os = dados.os;
            const gtin = dados.gtin;
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
                return;
            }
            const situacao = typeof dados.situacao === 'string' ? dados.situacao.trim() : '';
            const responsavel = typeof dados.responsavel === 'string' ? dados.responsavel.trim() : '';
            const qtdRecorte = typeof dados.qtdRecorte === 'string' ? dados.qtdRecorte.trim() : '';
            const qtdMockup = typeof dados.qtdMockup === 'string' ? dados.qtdMockup.trim() : '';
            // userId so serve pro bloqueio de identidade abaixo (obrigatoria pra gravar
            // QUALQUER coisa nesta aba) - NAO entra no objeto campos, cf_85 virou um
            // dropdown manual comum (responsavelQaImagem), igual aos outros campos.
            const responsavelQaImagem = typeof dados.responsavelQaImagem === 'string' ? dados.responsavelQaImagem.trim() : '';
            const responsavel3Check = typeof dados.responsavel3Check === 'string' ? dados.responsavel3Check.trim() : '';
            if (!/^\d*$/.test(situacao) || !/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup) ||
                !/^\d*$/.test(responsavelQaImagem) || !/^\d*$/.test(responsavel3Check)) {
                enviarJson(res, 400, { ok: false, error: 'situacao/responsavel/qtdRecorte/qtdMockup/responsavelQaImagem/responsavel3Check devem ser numericos ou vazios' });
                return;
            }
            const userId = typeof dados.userId === 'string' ? dados.userId.trim() : '';
            if (!/^\d+$/.test(userId)) {
                enviarJson(res, 400, { ok: false, error: 'Identidade do analista obrigatoria (configure a engrenagem)' });
                return;
            }
            try {
                const resultado = await redmine.gravarCamposEdicaoCompleto(BASE_PATH, gtin, { situacao, responsavel, qtdRecorte, qtdMockup, responsavelQaImagem, responsavel3Check });
                enviarJson(res, 200, { ok: true, gravado: resultado.gravado, issueId: resultado.issueId || null, idsGravados: resultado.idsGravados || [] });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

    // Agenda de Edicao - so leitura, nenhuma escrita no Redmine (ver spec
    // docs/superpowers/specs/2026-07-23-syndi-qa-agenda-edicao-design.md).
    if (req.method === 'GET' && req.url === '/api/agenda') {
        redmine.buscarIssuesAgenda(BASE_PATH).then(issues => {
            const hoje = hojeISO();
            const itens = issues.map(issue => qaSyndi.montarItemAgenda(issue, hoje));
            enviarJson(res, 200, { ok: true, itens });
        }).catch(err => {
            enviarJson(res, 500, { ok: false, error: err.message });
        });
        return;
    }

    // So compara HEAD local com origin/main (git fetch, sem baixar/aplicar nada) -
    // alimenta a tela de configuracao. Pasta sem .git ou sem rede cai no catch e
    // devolve ok:false. Mesmo endpoint que o sphoto ja usa (server.js dele).
    if (req.method === 'GET' && req.url === '/api/atualizacao/verificar') {
        enviarJson(res, 200, versionamento.verificarAtualizacao(BASE_PATH));
        return;
    }

    // Traz o codigo novo com "git pull --ff-only" - nunca cria merge/resolve conflito
    // sozinho, entao se a pasta tiver alteracao local nao commitada ou o historico
    // tiver divergido, aborta e devolve erro em vez de arriscar quebrar a pasta.
    if (req.method === 'POST' && req.url === '/api/atualizacao/aplicar') {
        enviarJson(res, 200, versionamento.aplicarAtualizacao(BASE_PATH));
        return;
    }

    // Verificacao e reorganizacao de OS_NONE: varre fotos marcadas com OCR,
    // valida (minimo 2), localiza OS de destino, e copia arquivos pra C:\Cadastro\OCR.
    // Retorna { ok, movidos, avisos, erros } com detalhes completos.
    if (req.method === 'POST' && req.url === '/api/verificar-os-none') {
        qaSyndi.verificarEOrganizarOsNone(qaSyndi.AGCONFERENCIA, undefined, {
            redmine: redmine,
            basePath: BASE_PATH
        }).then(resultado => {
            enviarJson(res, 200, resultado);
        }).catch(err => {
            enviarJson(res, 500, { ok: false, error: err.message });
        });
        return;
    }

    // Handler estatico - serve syndi_qa.html, css, js e qualquer outro arquivo da raiz
    // do projeto, exceto os bloqueados.
    const urlSemQuery = req.url.split('?')[0];
    let filePath = path.join(BASE_PATH, urlSemQuery === '/' ? 'syndi_qa.html' : urlSemQuery);

    // Contencao contra path traversal: um cliente pode mandar '..' literal na URL
    // sem normalizar (ex.: curl --path-as-is) e o path.join acima escapa de BASE_PATH.
    // Resolve o caminho final e confere que ainda esta dentro da pasta do projeto.
    filePath = path.resolve(filePath);
    if (filePath !== BASE_PATH && !filePath.startsWith(BASE_PATH + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Acesso negado');
        return;
    }

    if (ehArquivoBloqueado(filePath)) {
        console.error('Bloqueado acesso HTTP a arquivo sensivel:', urlSemQuery);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Acesso negado');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Arquivo nao encontrado');
                return;
            }
            res.writeHead(500);
            res.end('Erro no servidor: ' + err.code);
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

server.listen(PORT, () => {
    const diagnosticoFila = qaSyndi.diagnosticarFila(qaSyndi.AGCONFERENCIA);
    console.log(`\n========================================`);
    console.log(`  Syndi_qa rodando em:`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  AgConferencia: ${diagnosticoFila.agConferenciaDir}`);
    console.log(`  Existe: ${diagnosticoFila.existe ? 'sim' : 'nao'}`);
    console.log(`  OS reconhecidas: ${diagnosticoFila.pastasOsReconhecidas.length}`);
    if (diagnosticoFila.mensagem) console.log(`  Diagnostico: ${diagnosticoFila.mensagem}`);
    if (diagnosticoFila.pastasIgnoradas.length) console.log(`  Pastas ignoradas: ${diagnosticoFila.pastasIgnoradas.slice(0, 5).join(', ')}`);
    console.log(`========================================\n`);
});
