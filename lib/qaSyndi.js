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

const SUBPASTAS_TAG = ['RT', 'IS', 'AP'];
const REGEX_PASTA_OS = /^OS_(\d+)/;
const REGEX_PASTA_GTIN = /^(\d+)/;

// Le todas as OS/GTIN pendentes em AgConferencia. So entra na lista quem tem
// pasta valida (prefixo numerico reconhecivel) - o resto (lixo, pasta manual) e
// ignorado silenciosamente, mesmo principio do QA Hub do sphoto.
function listarFila(agConferenciaDir) {
    if (!fs.existsSync(agConferenciaDir)) return [];
    const pastasOs = fs.readdirSync(agConferenciaDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name)
        .filter(nome => REGEX_PASTA_OS.test(nome));

    return pastasOs.map(pastaOsNome => {
        const os = pastaOsNome.match(REGEX_PASTA_OS)[1];
        const pastaOsPath = path.join(agConferenciaDir, pastaOsNome);
        const gtins = fs.readdirSync(pastaOsPath, { withFileTypes: true })
            .filter(entrada => entrada.isDirectory())
            .map(entrada => entrada.name)
            .filter(nome => REGEX_PASTA_GTIN.test(nome))
            .map(pastaGtinNome => ({
                gtin: pastaGtinNome.match(REGEX_PASTA_GTIN)[1],
                pastaGtinNome
            }));
        return { os, pastaOsNome, gtins };
    });
}

function listarImagensDir(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(entrada => entrada.isFile() && /\.(jpg|jpeg)$/i.test(entrada.name))
        .map(entrada => {
            const bytes = fs.readFileSync(path.join(dirPath, entrada.name));
            return { nome: entrada.name, arquivo: bytes.toString('base64') };
        });
}

// Fotos do Syndi_qa sao sempre JPEG (ja passaram pelo tratamento do fotografo -
// ver prompt_sistema_qa.md item 1), entao nao precisa da complexidade de preview
// de RAW que o sphoto tem (lib/cr2Preview.js) - so le o arquivo direto.
function listarImagensGtin(pastaGtinPath) {
    const raiz = listarImagensDir(pastaGtinPath);
    const subpastas = {};
    SUBPASTAS_TAG.forEach(tag => {
        const imagens = listarImagensDir(path.join(pastaGtinPath, tag));
        if (imagens.length) subpastas[tag] = imagens;
    });
    return { raiz, subpastas };
}

// Move (nao copia) a pasta inteira. As duas pastas (AgConferencia e AgEnvio) vivem
// sob o mesmo SYNCIMGSEND_BASE - mesmo volume - entao rename e atomico e nao precisa
// de copia+delete manual.
function moverPasta(origem, destino) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.renameSync(origem, destino);
}

// GTIN e a unidade de decisao (ver Global Constraints do plano) - aprova a pasta
// inteira, nunca foto a foto. Preserva o nome exato das pastas (OS decorada + GTIN)
// pra o robo SyncIMGSend (PROCESSO_1/5) so espelhar a estrutura pro bucket sem
// precisar remapear nada.
function aprovarGtin(agConferenciaDir, agEnvioDir, pastaOsNome, pastaGtinNome) {
    const origem = path.join(agConferenciaDir, pastaOsNome, pastaGtinNome);
    if (!fs.existsSync(origem)) {
        throw new Error('Pasta do GTIN nao encontrada: ' + origem);
    }
    const destino = path.join(agEnvioDir, pastaOsNome, pastaGtinNome);
    moverPasta(origem, destino);
    return { destino };
}

const MOTIVOS_DEFAULT = [
    'desfoque',
    'exposição/iluminação',
    'enquadramento errado',
    'fundo sujo',
    'produto sujo/amassado',
    'sombra/reflexo indesejado',
    'cor/balanço de branco errado',
    'resolução baixa',
    'etiqueta ilegível'
];

// Lista de motivos de retrabalho e configuravel (motivos-retrabalho.json, versionado -
// diferente de caminhos-locais.json, isso NAO e segredo nem varia por maquina, e
// conteudo de negocio) - se faltar ou estiver corrompido, cai na lista embutida.
function carregarMotivos(basePath) {
    const configPath = path.join(basePath, 'motivos-retrabalho.json');
    if (!fs.existsSync(configPath)) return MOTIVOS_DEFAULT.slice();
    try {
        const dados = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return Array.isArray(dados) && dados.length ? dados : MOTIVOS_DEFAULT.slice();
    } catch (err) {
        return MOTIVOS_DEFAULT.slice();
    }
}

function formatarDataISO(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// Um TXT por GTIN (nao por foto) - ver spec secao 6. `marcacoes` mapeia nome da foto
// (relativo a raiz do GTIN, ex: "foto_2.jpg" ou "RT/foto_2.jpg") pros motivos
// selecionados. `data` e injetada (nao usa new Date() aqui dentro) pra a funcao ficar
// pura e testavel.
function gerarConteudoTxt(gtin, marcacoes, data) {
    const linhas = [`GTIN: ${gtin}`, `Data: ${formatarDataISO(data)}`];
    Object.keys(marcacoes).forEach(nomeFoto => {
        linhas.push(`${nomeFoto}: ${marcacoes[nomeFoto].join(', ')}`);
    });
    return linhas.join('\n') + '\n';
}

// Mesma unidade de decisao que aprovarGtin: move o GTIN inteiro (nao so as fotos
// marcadas) - o fotografo recebe a pasta completa de volta, com contexto, e reenvia
// o GTIN inteiro depois de corrigir. Ver spec secao 7 ("GTIN inteiro retido").
function retrabalharGtin(agConferenciaDir, retrabalhoDir, pastaOsNome, pastaGtinNome, gtin, marcacoes) {
    const origem = path.join(agConferenciaDir, pastaOsNome, pastaGtinNome);
    if (!fs.existsSync(origem)) {
        throw new Error('Pasta do GTIN nao encontrada: ' + origem);
    }
    const destino = path.join(retrabalhoDir, pastaOsNome, pastaGtinNome);
    moverPasta(origem, destino);
    const conteudoTxt = gerarConteudoTxt(gtin, marcacoes, new Date());
    fs.writeFileSync(path.join(destino, 'retrabalho.txt'), conteudoTxt, 'utf8');
    return { destino };
}

module.exports = {
    BASE_PATH,
    AGCONFERENCIA,
    AGENVIO,
    RETRABALHO,
    carregarCaminhosLocais,
    localizarPastaDecoradaPorPrefixo,
    listarFila,
    listarImagensGtin,
    aprovarGtin,
    carregarMotivos,
    gerarConteudoTxt,
    retrabalharGtin
};
