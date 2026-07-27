const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const qaSyndi = require('./lib/qaSyndi');
const redmine = require('./lib/redmine');

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

function hojeISO() {
    const agora = new Date();
    return agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');
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

    if (req.method === 'GET' && req.url.startsWith('/api/imagem')) {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const os = query.get('os') || '';
        const gtin = query.get('gtin') || '';
        const nome = query.get('nome') || '';
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
        const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
        const caminhoImagem = qaSyndi.resolverImagemSegura(pastaGtinPath, nome);
        if (!caminhoImagem || !fs.existsSync(caminhoImagem)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Imagem nao encontrada');
            return;
        }
        fs.readFile(caminhoImagem, (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Erro no servidor');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(content);
        });
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
            const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
            try {
                const resultado = qaSyndi.moverParaSubpastaSyndi(pastaGtinPath, nome, pasta);
                enviarJson(res, 200, { ok: true, destino: resultado.destino });
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
            const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
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
            const pastaGtinPath = path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome);
            try {
                qaSyndi.marcarDestinoSyndi(pastaGtinPath, tipo);
                enviarJson(res, 200, { ok: true });
            } catch (err) {
                enviarJson(res, 400, { ok: false, error: err.message });
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
        const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(path.join(qaSyndi.AGCONFERENCIA, pastaOsNome), gtin, /^(\d+)/);
        if (!pastaGtinNome) {
            enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
            return;
        }
        const inferido = qaSyndi.inferirCamposEdicao(path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome));
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
            if (!/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup)) {
                enviarJson(res, 400, { ok: false, error: 'responsavel/qtdRecorte/qtdMockup devem ser numericos ou vazios' });
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
            // Grava Responsavel/Quantidades ANTES de mover - falha aqui IMPEDE o aprovar
            // (diferente do retrabalho, que segue com aviso): sem esses campos o editor
            // nao sabe o que fazer com o material. Campos todos vazios = pula o Redmine
            // (escolha explicita do analista). Situacao das Imagens continua do robo.
            let redmineGravado = false;
            try {
                const r = await redmine.gravarCamposEdicao(BASE_PATH, gtin, { responsavel, qtdRecorte, qtdMockup });
                redmineGravado = r.gravado;
            } catch (err) {
                console.error('Erro ao gravar campos de edicao no Redmine para GTIN', gtin, err);
                enviarJson(res, 500, { ok: false, error: 'Nao foi possivel gravar no Redmine - o GTIN NAO foi enviado: ' + err.message });
                return;
            }
            try {
                const resultado = qaSyndi.aprovarGtin(qaSyndi.AGCONFERENCIA, qaSyndi.AGENVIO, pastaOsNome, pastaGtinNome);
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
                    await redmine.marcarRetrabalhoFotografia(BASE_PATH, gtin);
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
        const pastaGtinNome = qaSyndi.localizarPastaDecoradaPorPrefixo(path.join(qaSyndi.AGCONFERENCIA, pastaOsNome), gtin, /^(\d+)/);
        if (!pastaGtinNome) {
            enviarJson(res, 404, { ok: false, error: 'GTIN nao encontrado nesta OS' });
            return;
        }
        redmine.buscarDetalheEdicao(BASE_PATH, gtin).then(resultado => {
            const inferido = qaSyndi.inferirCamposEdicao(path.join(qaSyndi.AGCONFERENCIA, pastaOsNome, pastaGtinNome));
            enviarJson(res, 200, { ok: true, issue: resultado.issue, sugeridos: inferido.campos });
        }).catch(err => {
            enviarJson(res, 500, { ok: false, error: err.message });
        });
        return;
    }

    // Grava os 4 campos da aba "QA para Edicao" (incluindo Situacao) - independente do
    // Aprovar, nunca move pasta. Reaproveita o mesmo padrao de validacao numerica de
    // /api/aprovar.
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
            if (!/^\d*$/.test(situacao) || !/^\d*$/.test(responsavel) || !/^\d*$/.test(qtdRecorte) || !/^\d*$/.test(qtdMockup)) {
                enviarJson(res, 400, { ok: false, error: 'situacao/responsavel/qtdRecorte/qtdMockup devem ser numericos ou vazios' });
                return;
            }
            try {
                const resultado = await redmine.gravarCamposEdicaoCompleto(BASE_PATH, gtin, { situacao, responsavel, qtdRecorte, qtdMockup });
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
    console.log(`\n========================================`);
    console.log(`  Syndi_qa rodando em:`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`========================================\n`);
});
