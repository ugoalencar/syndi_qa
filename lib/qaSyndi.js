// lib/qaSyndi.js
// Le e organiza a fila de conferencia do robo externo C:\Apps\SyncIMGSend, fora do
// codigo do sphoto (sistema separado - a unica ligacao entre eles e o status no
// Redmine, nao codigo compartilhado). Ver docs/superpowers/specs/2026-07-21-syndi-qa-retrabalho-design.md.

const fs = require('fs');
const path = require('path');

const BASE_PATH = path.join(__dirname, '..');

const DEFAULTS_CAMINHOS_LOCAIS = { syncimgSendBase: 'C:\\Apps\\SyncIMGSend' };

// Caminho do robo varia por maquina - fica em caminhos-locais.json (gitignored,
// mesmo padrao ja usado no sphoto), NAO no codigo, pra "git pull" atualizar funcao
// sem sobrescrever o ajuste local de cada estacao.
function carregarCaminhosLocais(basePath) {
    const configPath = path.join(basePath, 'caminhos-locais.json');
    if (!fs.existsSync(configPath)) return Object.assign({}, DEFAULTS_CAMINHOS_LOCAIS);
    try {
        return Object.assign({}, DEFAULTS_CAMINHOS_LOCAIS, JSON.parse(fs.readFileSync(configPath, 'utf8')));
    } catch (err) {
        return Object.assign({}, DEFAULTS_CAMINHOS_LOCAIS);
    }
}

const CAMINHOS_LOCAIS = carregarCaminhosLocais(BASE_PATH);
const SYNCIMGSEND_BASE = CAMINHOS_LOCAIS.syncimgSendBase;
const AGCONFERENCIA = path.join(SYNCIMGSEND_BASE, 'AgConferencia');
const AGENVIO = path.join(SYNCIMGSEND_BASE, 'AgEnvio');
const RETRABALHO = path.join(SYNCIMGSEND_BASE, 'Retrabalho');

// As pastas que o robo de recebimento cria vem decoradas (ex.: "OS_49800---(3
// GTINs)---2026-07-20"), entao localizamos pelo prefixo numerico em vez do nome
// exato. Mesma funcao serve pro nivel OS (regex com "OS_") e pro nivel GTIN (regex
// so com digitos, decorado ou nao - ver PROCESSO_6 do ini.conf: GTIN nao e decorado
// nesse processo, mas a regex cobre os dois casos).
function localizarPastaDecoradaPorPrefixo(baseDir, prefixoAlvo, prefixoRegex) {
    if (!fs.existsSync(baseDir)) return null;
    const candidatos = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name);
    return candidatos.find(nome => {
        const m = nome.match(prefixoRegex);
        return m && m[1] === prefixoAlvo;
    }) || null;
}

module.exports = {
    BASE_PATH,
    AGCONFERENCIA,
    AGENVIO,
    RETRABALHO,
    carregarCaminhosLocais,
    localizarPastaDecoradaPorPrefixo
};
