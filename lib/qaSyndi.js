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
const SUBPASTAS_DESTINO = ['Mockup', 'Recorte'];
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
        .map(entrada => ({ nome: entrada.name }));
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
    let destino = null;
    SUBPASTAS_DESTINO.forEach(tag => {
        if (fs.existsSync(path.join(pastaGtinPath, tag))) destino = tag;
    });
    return { raiz, subpastas, destino };
}

// Acha onde o arquivo esta agora dentro da pasta do GTIN: null = raiz, tag = numa
// subpasta RT/IS/AP, undefined = nao encontrado em lugar nenhum.
function localizarArquivoAtual(pastaGtinPath, nomeArquivo) {
    if (fs.existsSync(path.join(pastaGtinPath, nomeArquivo))) return null;
    for (const tag of SUBPASTAS_TAG) {
        if (fs.existsSync(path.join(pastaGtinPath, tag, nomeArquivo))) return tag;
    }
    return undefined;
}

// Toggle RT/IS/AP: se o arquivo ja esta na subpasta pedida, volta pra raiz; senao,
// move da raiz (ou de outra subpasta de tag) pra la. Adaptado de moverParaSubpasta do
// sphoto, sem a logica de pares JPG+RAW - aqui e sempre um arquivo so.
function moverParaSubpastaSyndi(pastaGtinPath, nomeArquivo, pasta) {
    if (!SUBPASTAS_TAG.includes(pasta)) {
        throw new Error('Pasta deve ser RT, IS ou AP');
    }
    const pastaAtual = localizarArquivoAtual(pastaGtinPath, nomeArquivo);
    if (pastaAtual === undefined) {
        throw new Error('Arquivo nao encontrado: ' + nomeArquivo);
    }
    const vaiParaRaiz = pastaAtual === pasta;
    const origem = pastaAtual ? path.join(pastaGtinPath, pastaAtual, nomeArquivo) : path.join(pastaGtinPath, nomeArquivo);
    const destino = vaiParaRaiz ? path.join(pastaGtinPath, nomeArquivo) : path.join(pastaGtinPath, pasta, nomeArquivo);
    if (!vaiParaRaiz) fs.mkdirSync(path.join(pastaGtinPath, pasta), { recursive: true });
    fs.renameSync(origem, destino);
    return { destino: vaiParaRaiz ? 'raiz' : pasta };
}

// Adiciona ou remove o sufixo "_coding" do nome do arquivo (antes da extensao).
// Adaptado de handleMarcarQa do sphoto, sem pareamento JPG+RAW.
function toggleCodingSyndi(pastaGtinPath, nomeArquivo) {
    const caminhoAtual = path.join(pastaGtinPath, nomeArquivo);
    if (!fs.existsSync(caminhoAtual)) {
        throw new Error('Arquivo nao encontrado: ' + nomeArquivo);
    }
    const ext = path.extname(nomeArquivo);
    const semExt = nomeArquivo.slice(0, -ext.length);
    const sufixo = '_coding';
    const novoNome = semExt.endsWith(sufixo)
        ? semExt.slice(0, -sufixo.length) + ext
        : semExt + sufixo + ext;
    fs.renameSync(caminhoAtual, path.join(pastaGtinPath, novoNome));
    return { novoNome };
}

function removerSePastaVaziaSyndi(pastaTag) {
    if (!fs.existsSync(pastaTag)) return;
    if (fs.readdirSync(pastaTag).length === 0) fs.rmdirSync(pastaTag);
}

// Marca/desmarca o tipo de pos-producao do GTIN criando/removendo uma subpasta-sinal
// vazia (Mockup ou Recorte) - a mera existencia da pasta e o sinal, nenhuma foto entra
// nela. tipo=null desmarca as duas. Identico a handleMarcarDestino do sphoto.
function marcarDestinoSyndi(pastaGtinPath, tipo) {
    if (tipo !== null && !SUBPASTAS_DESTINO.includes(tipo)) {
        throw new Error('tipo deve ser "Mockup", "Recorte" ou null');
    }
    SUBPASTAS_DESTINO.forEach(tag => {
        const pastaTag = path.join(pastaGtinPath, tag);
        if (tipo === tag) {
            fs.mkdirSync(pastaTag, { recursive: true });
        } else {
            removerSePastaVaziaSyndi(pastaTag);
        }
    });
}

// Resolve o caminho absoluto de uma foto dentro da pasta do GTIN, a partir do "nome"
// relativo que o front-end manda (ex.: "foto_0.jpg" ou "RT/foto_2.jpg"). Devolve null
// se o resultado escaparia de pastaGtinPath (path traversal, ex.: "../../windows/win.ini")
// ou se nao for um .jpg/.jpeg - mesma logica de contencao ja usada no handler estatico
// do server.js, so que aqui e testavel isoladamente.
function resolverImagemSegura(pastaGtinPath, nomeRelativo) {
    if (typeof nomeRelativo !== 'string' || !nomeRelativo) return null;
    const raiz = path.resolve(pastaGtinPath);
    const caminho = path.resolve(raiz, nomeRelativo);
    if (caminho !== raiz && !caminho.startsWith(raiz + path.sep)) return null;
    if (!/\.(jpg|jpeg)$/i.test(caminho)) return null;
    return caminho;
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

// Uma linha por foto marcada no TXT unico da OS - ver spec secao 4. Pura e testavel.
function gerarLinhaTxt(gtin, arquivo, motivosLista) {
    return `${gtin} - ${arquivo}: ${motivosLista.join(', ')}`;
}

// Anexa (cria se nao existir) as linhas de retrabalho de um GTIN no TXT unico da OS -
// Retrabalho_OS_<numero>.txt na raiz da pasta da OS dentro de Retrabalho (nao mais um
// TXT por GTIN dentro da propria pasta do GTIN). Quando mais de um GTIN da mesma OS
// tiver retrabalho, cada confirmacao so ANEXA suas linhas - nunca reescreve o arquivo
// inteiro, entao retrabalhos de GTINs diferentes da mesma OS convivem no mesmo arquivo.
function anexarTxtRetrabalho(retrabalhoDir, pastaOsNome, os, gtin, marcacoes) {
    const pastaOsDestino = path.join(retrabalhoDir, pastaOsNome);
    fs.mkdirSync(pastaOsDestino, { recursive: true });
    const caminhoTxt = path.join(pastaOsDestino, `Retrabalho_OS_${os}.txt`);
    const linhasNovas = Object.keys(marcacoes).map(arquivo => gerarLinhaTxt(gtin, arquivo, marcacoes[arquivo]));
    fs.appendFileSync(caminhoTxt, linhasNovas.join('\n') + '\n', 'utf8');
    return caminhoTxt;
}

// Mesma unidade de decisao que aprovarGtin: move o GTIN inteiro (nao so as fotos
// marcadas) - o fotografo recebe a pasta completa de volta, com contexto, e reenvia
// o GTIN inteiro depois de corrigir. Ver spec secao 7 ("GTIN inteiro retido"). `os` e o
// numero puro (nao a pasta decorada) - e o que nomeia o TXT unico da OS.
function retrabalharGtin(agConferenciaDir, retrabalhoDir, pastaOsNome, pastaGtinNome, os, gtin, marcacoes) {
    const origem = path.join(agConferenciaDir, pastaOsNome, pastaGtinNome);
    if (!fs.existsSync(origem)) {
        throw new Error('Pasta do GTIN nao encontrada: ' + origem);
    }
    const destino = path.join(retrabalhoDir, pastaOsNome, pastaGtinNome);
    moverPasta(origem, destino);
    const caminhoTxt = anexarTxtRetrabalho(retrabalhoDir, pastaOsNome, os, gtin, marcacoes);
    return { destino, caminhoTxt };
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
    moverParaSubpastaSyndi,
    toggleCodingSyndi,
    marcarDestinoSyndi,
    resolverImagemSegura,
    aprovarGtin,
    carregarMotivos,
    gerarLinhaTxt,
    anexarTxtRetrabalho,
    retrabalharGtin
};
