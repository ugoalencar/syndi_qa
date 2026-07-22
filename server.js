const http = require('http');
const fs = require('fs');
const path = require('path');
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

    // ROTAS_API

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
