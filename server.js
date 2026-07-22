const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const qaSyndi = require('./lib/qaSyndi');

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

const PORT = 3000;
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
const ARQUIVOS_BLOQUEADOS = ['caminhos-locais.json', 'credencial.txt', 'credenciais.txt', 'valores.txt', '.env'];

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

    if (req.method === 'GET' && req.url === '/api/fila') {
        try {
            const fila = qaSyndi.listarFila(qaSyndi.AGCONFERENCIA);
            enviarJson(res, 200, { ok: true, fila });
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
        const imagens = qaSyndi.listarImagensGtin(path.join(pastaOsPath, pastaGtinNome));
        enviarJson(res, 200, { ok: true, os, gtin, pastaOsNome, pastaGtinNome, imagens });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/aprovar') {
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
            if (!isNomeSeguro(os) || !isNomeSeguro(gtin)) {
                enviarJson(res, 400, { ok: false, error: 'Parametros os/gtin invalidos' });
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
                const resultado = qaSyndi.aprovarGtin(qaSyndi.AGCONFERENCIA, qaSyndi.AGENVIO, pastaOsNome, pastaGtinNome);
                enviarJson(res, 200, { ok: true, destino: resultado.destino });
            } catch (err) {
                enviarJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/retrabalho') {
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
                const resultado = qaSyndi.retrabalharGtin(qaSyndi.AGCONFERENCIA, qaSyndi.RETRABALHO, pastaOsNome, pastaGtinNome, gtin, marcacoes);
                enviarJson(res, 200, { ok: true, destino: resultado.destino });
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

    // So compara HEAD local com origin/main (git fetch, sem baixar/aplicar nada) -
    // alimenta a tela de configuracao. Pasta sem .git ou sem rede cai no catch e
    // devolve ok:false. Mesmo endpoint que o sphoto ja usa (server.js dele).
    if (req.method === 'GET' && req.url === '/api/atualizacao/verificar') {
        try {
            execSync('git fetch origin main --tags', { cwd: BASE_PATH, stdio: 'pipe' });
            const commitsAtras = parseInt(execSync('git rev-list HEAD..origin/main --count', { cwd: BASE_PATH }).toString().trim(), 10) || 0;
            const versaoAtual = execSync('git describe --tags --always', { cwd: BASE_PATH }).toString().trim();
            const versaoDisponivel = execSync('git describe --tags --always origin/main', { cwd: BASE_PATH }).toString().trim();
            enviarJson(res, 200, { ok: true, versaoAtual, versaoDisponivel, temAtualizacao: commitsAtras > 0 });
        } catch (err) {
            enviarJson(res, 200, { ok: false, error: 'Nao foi possivel consultar atualizacoes (sem rede, sem remoto configurado, ou esta pasta nao e um repositorio git)' });
        }
        return;
    }

    // Traz o codigo novo com "git pull --ff-only" - nunca cria merge/resolve conflito
    // sozinho, entao se a pasta tiver alteracao local nao commitada ou o historico
    // tiver divergido, aborta e devolve erro em vez de arriscar quebrar a pasta.
    if (req.method === 'POST' && req.url === '/api/atualizacao/aplicar') {
        try {
            const statusSujo = execSync('git status --porcelain', { cwd: BASE_PATH }).toString().trim();
            if (statusSujo) {
                enviarJson(res, 200, { ok: false, error: 'Ha alteracoes locais nao commitadas nesta pasta - resolva manualmente (git status) antes de atualizar' });
                return;
            }
            const antes = execSync('git rev-parse HEAD', { cwd: BASE_PATH }).toString().trim();
            execSync('git pull --ff-only origin main', { cwd: BASE_PATH, stdio: 'pipe' });
            const depois = execSync('git rev-parse HEAD', { cwd: BASE_PATH }).toString().trim();
            const arquivosMudados = antes === depois ? [] : execSync('git diff --name-only ' + antes + ' ' + depois, { cwd: BASE_PATH })
                .toString().trim().split('\n').filter(Boolean);
            const precisaReiniciar = arquivosMudados.some((f) => f === 'server.js' || f.startsWith('lib/'));
            const versaoAtual = execSync('git describe --tags --always', { cwd: BASE_PATH }).toString().trim();
            enviarJson(res, 200, { ok: true, jaEstavaAtualizado: antes === depois, versaoAtual, arquivosMudados, precisaReiniciar });
        } catch (err) {
            enviarJson(res, 200, { ok: false, error: 'git pull falhou: ' + (err.message || String(err)).slice(0, 500) });
        }
        return;
    }

    // Handler estatico - serve qa.html, css, js e qualquer outro arquivo da raiz
    // do projeto, exceto os bloqueados.
    const urlSemQuery = req.url.split('?')[0];
    let filePath = path.join(BASE_PATH, urlSemQuery === '/' ? 'qa.html' : urlSemQuery);

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
    console.log(`\n========================================`);
    console.log(`  Syndi_qa rodando em:`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`========================================\n`);
});
