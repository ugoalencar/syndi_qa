// Syndi_qa - Executor unico: sobe o servidor (node), espera a porta 3001 ficar de pe, e
// abre a interface (syndi_qa.html) numa janela de app. Adaptado do launcher.js do
// c:\sphoto-terminais, sem as partes de camera/plataforma Java (o Syndi_qa e so 1 processo).
// Uso: node launcher.js   (no Windows, via iniciar-tudo.vbs pra rodar sem janela)

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const WIN = process.platform === 'win32';
// Caminho absoluto do cmd.exe - dependendo de quem lancou o node (ex.: shells
// alternativos), "cmd.exe" pode nao estar no PATH e o spawn falha com ENOENT.
const CMD = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
const LOGS = path.join(BASE, 'logs');
if (!fs.existsSync(LOGS)) fs.mkdirSync(LOGS);

function log(msg) {
    const linha = '[' + new Date().toLocaleString('pt-BR') + '] ' + msg;
    console.log(linha);
    try { fs.appendFileSync(path.join(LOGS, 'launcher.log'), linha + '\n'); } catch (e) {}
}

function portaOcupada(porta) {
    return new Promise((resolve) => {
        const s = net.connect({ port: porta, host: '127.0.0.1', timeout: 600 });
        s.on('connect', () => { s.destroy(); resolve(true); });
        s.on('error', () => resolve(false));
        s.on('timeout', () => { s.destroy(); resolve(false); });
    });
}

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function esperarPorta(porta, tentativas, intervaloMs) {
    for (let i = 0; i < tentativas; i++) {
        if (await portaOcupada(porta)) return true;
        await esperar(intervaloMs);
    }
    return false;
}

// Dispara um processo desanexado e sem janela - o launcher termina logo em
// seguida, mas o servidor continua rodando por conta propria.
function rodarOculto(comando, args) {
    const p = spawn(comando, args, {
        cwd: BASE,
        detached: true,
        windowsHide: true,
        stdio: 'ignore'
    });
    p.unref();
}

// Via iniciar-oculto.vbs: o windowsHide do spawn nao esconde a janela de forma
// confiavel quando combinado com detached - o WshShell.Run com flag 0 do VBS esconde
// de verdade. O VBS ja usa caminho absoluto internamente.
function rodarBatOculto(nomeArquivo) {
    const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
    rodarOculto(wscript, [path.join(BASE, 'iniciar-oculto.vbs'), nomeArquivo]);
}

async function iniciarServidor() {
    if (await portaOcupada(3001)) {
        log('servidor: ja rodando (porta 3001)');
        return true;
    }
    log('servidor: iniciando...');
    if (WIN) {
        // iniciar-server.bat tem o loop de reinicio automatico
        rodarBatOculto('iniciar-server.bat');
    } else {
        rodarOculto('sh', ['-c', 'while true; do node server.js >> logs/server.log 2>&1; sleep 3; done']);
    }
    const ok = await esperarPorta(3001, 30, 500);
    log(ok ? 'servidor: OK' : 'servidor: NAO subiu - veja logs/server.log');
    return ok;
}

function acharNavegador() {
    const candidatos = WIN ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ] : [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
    ];
    for (const c of candidatos) {
        try { if (c && fs.existsSync(c)) return c; } catch (e) {}
    }
    return null;
}

async function abrirInterface() {
    const url = 'http://localhost:3001/';
    const navegador = acharNavegador();
    if (navegador) {
        // Perfil proprio do Syndi_qa (pasta .perfil-navegador) - janela limpa, sem
        // interferencia de abas/cookies/favoritos do navegador pessoal do analista.
        const perfil = path.join(BASE, '.perfil-navegador');
        rodarOculto(navegador, [
            '--user-data-dir=' + perfil,
            '--app=' + url,
            '--no-first-run',
            '--no-default-browser-check'
        ]);
    } else if (WIN) {
        rodarOculto(CMD, ['/c', 'start', '', url]);
    } else {
        rodarOculto('xdg-open', [url]);
    }
    log('interface aberta: ' + url);
}

(async function main() {
    log('=== Syndi_qa executor (' + process.platform + ') ===');
    const servidorOk = await iniciarServidor();
    if (servidorOk) {
        await abrirInterface();
    } else {
        log('interface NAO aberta - servidor nao subiu');
    }
    log('=== pronto ===');
    process.exit(0);
})();
