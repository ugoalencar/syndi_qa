// lib/qaSyndi.js
// Le e organiza a fila de conferencia do robo externo C:\Apps\SyncIMGSend, fora do
// codigo do sphoto (sistema separado - a unica ligacao entre eles e o status no
// Redmine, nao codigo compartilhado). Ver docs/superpowers/specs/2026-07-21-syndi-qa-retrabalho-design.md.

const fs = require('fs');
const path = require('path');
const previewImagem = require('./previewImagem');

const BASE_PATH = path.join(__dirname, '..');

const DEFAULTS_CAMINHOS_LOCAIS = {
    syncimgSendBase: 'C:\\Apps\\SyncIMGSend',
    legadoOrigemDir: '',
    legadoDestinoDir: '',
    cadastroOcrDir: 'C:\\Cadastro\\OCR'
};

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

// Devolve o caminho absoluto do arquivo caminhos-locais.json
function caminhoArquivoCaminhosLocais() {
    return path.join(BASE_PATH, 'caminhos-locais.json');
}

const CAMINHOS_LOCAIS = carregarCaminhosLocais(BASE_PATH);
const SYNCIMGSEND_BASE = CAMINHOS_LOCAIS.syncimgSendBase;
const AGCONFERENCIA = path.join(SYNCIMGSEND_BASE, 'AgConferencia');
const AGENVIO = path.join(SYNCIMGSEND_BASE, 'AgEnvio');
const RETRABALHO = path.join(SYNCIMGSEND_BASE, 'Retrabalho');

// Re-le caminhos-locais.json e atualiza CAMINHOS_LOCAIS na mesma referencia (nao troca o
// objeto) - assim quem guardou "qaSyndi.CAMINHOS_LOCAIS" continua vendo os valores novos
// sem precisar re-importar o modulo. So os campos novos (legado/OCR) tem efeito
// imediato; syncimgSendBase/AGCONFERENCIA/AGENVIO/RETRABALHO continuam exigindo reinicio
// (mesmo comportamento de antes desta mudanca).
function recarregarCaminhosLocais(basePath) {
    const novo = carregarCaminhosLocais(basePath || BASE_PATH);
    Object.assign(CAMINHOS_LOCAIS, novo);
    return CAMINHOS_LOCAIS;
}

// Confere se um nome de pasta decorado (ex.: "OS_49800---(3 GTINs)---2026-07-20")
// bate com o prefixo alvo - extraida de localizarPastaDecoradaPorPrefixo pra poder
// validar um UNICO candidato (ex.: nome que o front-end ja mandou) sem precisar
// varrer o diretorio inteiro de novo. Mesma regra exata, sem duplicar logica.
function nomeDecoradoBate(nome, prefixoAlvo, prefixoRegex) {
    const m = nome.match(prefixoRegex);
    return !!m && m[1] === prefixoAlvo;
}

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
    return candidatos.find(nome => nomeDecoradoBate(nome, prefixoAlvo, prefixoRegex)) || null;
}

const SUBPASTAS_TAG = ['RT', 'IS', 'AP', 'Aplicar'];
const SUBPASTAS_DESTINO = ['Mockup', 'Recorte'];
const REGEX_PASTA_OS = /^OS_(\d+)/;
const REGEX_PASTA_GTIN = /^(\d+)/;

// Destinos do GTIN guardados em um arquivo TXT na raiz da OS - em vez de pasta
// fisica dentro do GTIN. Formato: <gtin>=Mockup ou <gtin>=Recorte, uma por linha.
// O arquivo nao vira junto com o GTIN pra AgEnvio (vive num nivel acima).
function caminhoDestinosOs(pastaOsPath) {
    return path.join(pastaOsPath, '_destinos_qa.txt');
}

function lerDestinosOs(pastaOsPath) {
    const caminho = caminhoDestinosOs(pastaOsPath);
    if (!fs.existsSync(caminho)) return {};
    const mapa = {};
    fs.readFileSync(caminho, 'utf8').split(/\r?\n/).forEach(linha => {
        const [gtin, tipo] = linha.split('=');
        if (gtin && tipo && SUBPASTAS_DESTINO.includes(tipo.trim())) {
            mapa[gtin.trim()] = tipo.trim();
        }
    });
    return mapa;
}

function escreverDestinosOs(pastaOsPath, mapa) {
    const caminho = caminhoDestinosOs(pastaOsPath);
    const chaves = Object.keys(mapa);
    if (chaves.length === 0) {
        if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
        return;
    }
    const conteudo = chaves.map(gtin => `${gtin}=${mapa[gtin]}`).join('\n') + '\n';
    fs.writeFileSync(caminho, conteudo, 'utf8');
}

function obterDestinoGtin(pastaOsPath, gtin) {
    return lerDestinosOs(pastaOsPath)[gtin] || null;
}

function removerDestinoGtin(pastaOsPath, gtin) {
    const mapa = lerDestinosOs(pastaOsPath);
    if (mapa[gtin]) {
        delete mapa[gtin];
        escreverDestinosOs(pastaOsPath, mapa);
    }
}

// Marcas de OCR do GTIN guardadas em _ocr.json na raiz da pasta do GTIN.
// Formato JSON: { "foto.jpg": true, "RT/foto2.jpg": true, ... }
// Viaja junto com o GTIN pra AgEnvio (diferente de _destinos_qa.txt).
function caminhoMarcasOcr(pastaGtinPath) {
    return path.join(pastaGtinPath, '_ocr.json');
}

function lerMarcasOcr(pastaGtinPath) {
    const caminho = caminhoMarcasOcr(pastaGtinPath);
    if (!fs.existsSync(caminho)) return {};
    try {
        const conteudo = fs.readFileSync(caminho, 'utf8');
        const dados = JSON.parse(conteudo);
        return typeof dados === 'object' ? dados : {};
    } catch (err) {
        return {};
    }
}

function escreverMarcasOcr(pastaGtinPath, mapa) {
    const caminho = caminhoMarcasOcr(pastaGtinPath);
    const chaves = Object.keys(mapa);
    if (chaves.length === 0) {
        if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
        return;
    }
    const conteudo = JSON.stringify(mapa, null, 2) + '\n';
    fs.writeFileSync(caminho, conteudo, 'utf8');
}

function obterMarcasOcr(pastaGtinPath) {
    return lerMarcasOcr(pastaGtinPath);
}

function toggleMarcaOcr(pastaGtinPath, nomeArquivo, marcado) {
    if (typeof marcado !== 'boolean') {
        throw new Error('marcado deve ser true ou false');
    }
    const mapa = lerMarcasOcr(pastaGtinPath);
    if (marcado) {
        mapa[nomeArquivo] = true;
    } else {
        delete mapa[nomeArquivo];
    }
    escreverMarcasOcr(pastaGtinPath, mapa);
    return { marcado };
}

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

// Controle de legado: separa GTINs que ja passaram por QA manual antes deste sistema
// (status "legado") dos que o Pescador trouxe depois (status "pendente"). Gravado em
// controle-legado.json na raiz do proprio destino (fica no drive compartilhado, visivel
// a qualquer analista que aponte pro mesmo legadoDestinoDir). So separa os dois grupos
// pro filtro da tela - nao rastreia conclusao de QA (isso ja e resolvido pelo fluxo
// existente de organizar/Finalizadas).
function caminhoControleLegado(destinoDir) {
    return path.join(destinoDir, 'controle-legado.json');
}

function lerControleLegado(destinoDir) {
    const caminho = caminhoControleLegado(destinoDir);
    if (!fs.existsSync(caminho)) return {};
    try {
        const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
        return typeof dados === 'object' && dados ? dados : {};
    } catch (err) {
        return {};
    }
}

function escreverControleLegado(destinoDir, mapa) {
    fs.writeFileSync(caminhoControleLegado(destinoDir), JSON.stringify(mapa, null, 2) + '\n', 'utf8');
}

// Scan de uma vez so: marca como "legado" todo GTIN que ja existe no destino e ainda nao
// tem entrada no JSON (roda sob acao explicita do usuario - ver endpoint em server.js).
async function gerarSnapshotLegado(destinoDir) {
    const mapa = lerControleLegado(destinoDir);
    const resultado = { ok: true, marcados: [], ja: [] };

    if (!fs.existsSync(destinoDir)) {
        resultado.ok = false;
        resultado.error = 'Pasta de destino nao existe: ' + destinoDir;
        return resultado;
    }

    const pastasGtin = fs.readdirSync(destinoDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name)
        .filter(nome => REGEX_PASTA_GTIN.test(nome));

    const marcarComoLegado = {};
    for (const pastaGtinNome of pastasGtin) {
        const gtin = pastaGtinNome.match(REGEX_PASTA_GTIN)[1];
        // Marca como legado MESMO SE JA EXISTE (atualiza de pendente)
        const stat = fs.statSync(path.join(destinoDir, pastaGtinNome));
        const statusAnterior = mapa[gtin] && mapa[gtin].status;
        marcarComoLegado[gtin] = { status: 'legado', data: stat.mtime.toISOString() };
        if (statusAnterior) {
            resultado.ja.push(gtin + ' (atualizado de ' + statusAnterior + ')');
        } else {
            resultado.marcados.push(gtin);
        }
    }

    // Reles o arquivo de controle logo antes de escrever, pra nao perder entradas que o
    // Pescador de GTIN (ou outro scan) possa ter escrito enquanto este loop rodava (pode
    // demorar - statSync por GTIN em drive de rede). Sempre atualiza para legado.
    const mapaAtual = lerControleLegado(destinoDir);
    for (const gtin of Object.keys(marcarComoLegado)) {
        mapaAtual[gtin] = marcarComoLegado[gtin];
    }

    escreverControleLegado(destinoDir, mapaAtual);
    return resultado;
}

// Lista todos os GTINs na pasta de legado configurada em Settings (legadoDestinoDir) -
// fotos do fotografo externo que ainda nao tem OS atribuida.
function listarOsNone(osNoneDir) {
    if (!osNoneDir || !fs.existsSync(osNoneDir)) return [];

    const gtins = [];
    const pastasDentro = fs.readdirSync(osNoneDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name)
        .filter(nome => REGEX_PASTA_GTIN.test(nome));

    const controleLegado = lerControleLegado(osNoneDir);

    return pastasDentro.map(pastaGtinNome => {
        const gtin = pastaGtinNome.match(REGEX_PASTA_GTIN)[1];
        const pastaGtinPath = path.join(osNoneDir, pastaGtinNome);
        const status = (controleLegado[gtin] && controleLegado[gtin].status) || 'pendente';

        // Lista arquivos na raiz
        const arquivos = [];
        const adicionarArquivos = (dirPath, subpasta) => {
            if (!fs.existsSync(dirPath)) return;
            fs.readdirSync(dirPath, { withFileTypes: true })
                .filter(entrada => entrada.isFile() && /\.(jpg|jpeg|png|cr2)$/i.test(entrada.name))
                .forEach(entrada => {
                    arquivos.push({
                        nome: entrada.name,
                        subpasta: subpasta || null
                    });
                });
        };

        // Adiciona arquivos da raiz
        adicionarArquivos(pastaGtinPath, null);

        // Adiciona arquivos de subpastas
        SUBPASTAS_TAG.forEach(tag => {
            adicionarArquivos(path.join(pastaGtinPath, tag), tag);
        });

        return {
            gtin,
            pastaGtinNome,
            arquivos,
            status
        };
    }).filter(item => item.status === 'pendente');
}

function diagnosticarFila(agConferenciaDir) {
    const diagnostico = {
        syncimgSendBase: SYNCIMGSEND_BASE,
        agConferenciaDir,
        existe: fs.existsSync(agConferenciaDir),
        totalPastas: 0,
        pastasOsReconhecidas: [],
        pastasIgnoradas: [],
        fila: []
    };

    if (!diagnostico.existe) {
        diagnostico.mensagem = 'AgConferencia nao existe neste caminho';
        return diagnostico;
    }

    const pastas = fs.readdirSync(agConferenciaDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name);
    diagnostico.totalPastas = pastas.length;
    diagnostico.pastasOsReconhecidas = pastas.filter(nome => REGEX_PASTA_OS.test(nome));
    diagnostico.pastasIgnoradas = pastas.filter(nome => !REGEX_PASTA_OS.test(nome));
    diagnostico.fila = listarFila(agConferenciaDir);

    if (diagnostico.fila.length === 0) {
        diagnostico.mensagem = diagnostico.totalPastas === 0
            ? 'AgConferencia existe, mas nao tem pastas dentro'
            : 'AgConferencia tem pastas, mas nenhuma comecando com OS_ seguido de numero';
    }

    return diagnostico;
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
// O destino (Mockup/Recorte) e passado do caller (ja resolvido no servidor antes
// de chamar, via obterDestinoGtin) - nao mais checado por fs.existsSync de pasta.
function listarImagensGtin(pastaGtinPath, destino) {
    const raiz = listarImagensDir(pastaGtinPath);
    const subpastas = {};
    SUBPASTAS_TAG.forEach(tag => {
        const imagens = listarImagensDir(path.join(pastaGtinPath, tag));
        if (imagens.length) subpastas[tag] = imagens;
    });
    return { raiz, subpastas, destino: destino || null };
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
// Apos voltar pra raiz, remove a subpasta de origem se ficar vazia.
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
    if (vaiParaRaiz) {
        removerSePastaVaziaSyndi(path.join(pastaGtinPath, pastaAtual));
    }
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

// Marca/desmarca o tipo de pos-producao do GTIN guardando em _destinos_qa.txt na
// raiz da OS (nao mais em pasta fisica dentro do GTIN). tipo=null remove a entrada
// do GTIN do arquivo.
function marcarDestinoSyndi(pastaOsPath, gtin, tipo) {
    if (tipo !== null && !SUBPASTAS_DESTINO.includes(tipo)) {
        throw new Error('tipo deve ser "Mockup", "Recorte" ou null');
    }
    const mapa = lerDestinosOs(pastaOsPath);
    if (tipo === null) {
        delete mapa[gtin];
    } else {
        mapa[gtin] = tipo;
    }
    escreverDestinosOs(pastaOsPath, mapa);
}

// Opcoes do campo Responsavel Pos-Producao (cf_23) no Redmine - so as duas que a
// inferencia usa (ver c:\sphoto\redmine-campos.json pro mapa completo, servido
// estatico pro front popular o select).
const OPCAO_VIRA_FILMES = '32';
const OPCAO_BRIGHT_RIVER = '258';

function temSufixo(nome, sufixo) {
    const ext = path.extname(nome);
    return nome.slice(0, -ext.length).endsWith(sufixo);
}

// Deriva os defaults do formulario de envio pra edicao a partir do que existe na
// pasta do GTIN - tudo aqui e so sugestao, o analista pode sobrescrever na tela.
// Portado de inferirCampos() do sphoto (c:\sphoto\lib\qaHub.js) com ajustes:
// (1) NAO inclui Situacao das Imagens; (2) chaves amigaveis em vez de IDs de cf;
// (3) Quantidade (qtdMockup/qtdRecorte) sempre preenche quando a subpasta esta
// marcada, independente de decidir o responsavel.
//
// Regra de responsavel (ver docs/superpowers/specs/2026-07-28-syndi-qa-correcoes-qa-design.md):
// Recorte sozinho NAO decide Bright River - precisa ter _coding ou ja ter RT/IS/AP
// com fotos (sinal de trabalho local). Mockup sempre decide Virafilme.
function inferirCamposEdicao(pastaGtinPath, destinoOs) {
    const temSubpastaTag = SUBPASTAS_TAG.some(tag => listarImagensDir(path.join(pastaGtinPath, tag)).length > 0);
    const arquivosRaiz = listarImagensDir(pastaGtinPath).map(i => i.nome);
    const semCoding = arquivosRaiz.filter(nome => !temSufixo(nome, '_coding'));
    const comCoding = arquivosRaiz.filter(nome => temSufixo(nome, '_coding'));

    if (destinoOs === 'Mockup' && destinoOs === 'Recorte') {
        // Anomalia: nao deveria ter as duas - mas por precaucao, trata como indefinido
        return { destino: 'indefinido', motivo: 'Pasta tem subpasta Mockup e Recorte ao mesmo tempo', campos: {} };
    }

    // Mockup: sempre Virafilme (Brasil), quantidade ja preenchida.
    if (destinoOs === 'Mockup') {
        const campos = { qtdMockup: String(semCoding.length) };
        if (semCoding.length === 0) {
            return { destino: 'indefinido', motivo: 'Nenhuma foto de produto pra contar - verifique a seleção', campos };
        }
        campos.responsavel = OPCAO_VIRA_FILMES;
        return { destino: 'brasil', motivo: null, campos };
    }

    // Recorte: quantidade ja preenchida sempre. Responsavel so decidido se tiver
    // RT/IS/AP com fotos ou _coding.
    if (destinoOs === 'Recorte') {
        const campos = { qtdRecorte: String(semCoding.length) };
        if (temSubpastaTag) {
            if (semCoding.length === 0) {
                return { destino: 'indefinido', motivo: 'Nenhuma foto de produto pra contar - preencha responsavel manualmente', campos };
            }
            campos.responsavel = OPCAO_VIRA_FILMES;
            return { destino: 'brasil', motivo: null, campos };
        }
        if (comCoding.length === 0) {
            return { destino: 'indefinido', motivo: 'Preencha responsavel manualmente', campos };
        }
        campos.responsavel = OPCAO_BRIGHT_RIVER;
        return { destino: 'eua', motivo: null, campos };
    }

    // Sem destino marcado (Mockup/Recorte)
    if (temSubpastaTag) {
        return { destino: 'brasil', motivo: null, campos: { responsavel: OPCAO_VIRA_FILMES } };
    }

    if (comCoding.length === 0) {
        return { destino: 'indefinido', motivo: 'Sem subpasta Mockup/Recorte/RT-IS-AP e sem nenhuma foto _coding - sem sinal de destino', campos: {} };
    }

    // Fallback: _coding mas nenhuma subpasta marcada = Bright River/Recorte.
    return { destino: 'eua', motivo: null, campos: { responsavel: OPCAO_BRIGHT_RIVER, qtdRecorte: String(semCoding.length) } };
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

// Deleta um arquivo de foto (JPEG) da pasta do GTIN - usa resolverImagemSegura pra
// evitar path traversal, mesmo tratamento que /api/imagem.
function deletarFotoSyndi(pastaGtinPath, nomeArquivo) {
    const caminho = resolverImagemSegura(pastaGtinPath, nomeArquivo);
    if (!caminho || !fs.existsSync(caminho)) {
        throw new Error('Arquivo nao encontrado: ' + nomeArquivo);
    }
    fs.unlinkSync(caminho);
}

const SITUACAO_QUALIDADE_APROVADA = '97';

// Barra de progresso semaforo ate a previsao de entrega - ver spec secao 3
// (docs/superpowers/specs/2026-07-23-syndi-qa-agenda-edicao-design.md). Pura e
// testavel: hoje e sempre injetado, nunca lido de new Date() aqui dentro.
function calcularProgresso(dtEnvio, previsaoEntrega, situacao, hoje) {
    if (situacao === SITUACAO_QUALIDADE_APROVADA) {
        return { progresso: 100, cor: 'verde' };
    }
    if (!dtEnvio || !previsaoEntrega) {
        return { progresso: null, cor: 'cinza' };
    }
    const inicio = new Date(dtEnvio);
    const fim = new Date(previsaoEntrega);
    const agora = new Date(hoje);
    const totalMs = fim - inicio;
    // Prazo invertido/zerado (previsao <= envio) - trata como totalmente decorrido
    // em vez de dividir por zero/negativo, cai na faixa vermelha (>=60%).
    const percentualBruto = totalMs <= 0 ? 100 : ((agora - inicio) / totalMs) * 100;
    const percentualClampeado = Math.max(0, Math.min(100, percentualBruto));
    let cor;
    if (percentualClampeado < 30) cor = 'verde';
    else if (percentualClampeado < 60) cor = 'amarelo';
    else cor = 'vermelho';
    return { progresso: Math.round(percentualClampeado), cor };
}

const CF_AGENDA_GTIN = 1;
const CF_AGENDA_OS = 2;
const CF_AGENDA_SITUACAO_IMAGENS = 15;
const CF_AGENDA_DT_ENVIO_EDICAO = 21;
const CF_AGENDA_RESPONSAVEL_POS_PRODUCAO = 23;
const CF_AGENDA_PREVISAO_ENTREGA_POS_PRODUCAO = 34;

function valorCf(issue, id) {
    const campo = (issue.custom_fields || []).find(c => c.id === id);
    return (campo && campo.value) || null;
}

// Deriva uma linha da Agenda de Edicao a partir de uma issue Redmine crua - porta
// montarItemAgenda do sphoto (c:\sphoto\lib\qaHub.js), acrescentando responsavel e a
// barra de progresso (calcularProgresso). hoje e injetado, mesmo principio do resto
// do arquivo.
function montarItemAgenda(issue, hoje) {
    const gtin = valorCf(issue, CF_AGENDA_GTIN) || issue.subject.split(' - ')[0];
    const produto = issue.subject.startsWith(gtin) ? issue.subject.slice(gtin.length + 3) : issue.subject;
    const dtEnvio = valorCf(issue, CF_AGENDA_DT_ENVIO_EDICAO);
    const previsaoEntrega = valorCf(issue, CF_AGENDA_PREVISAO_ENTREGA_POS_PRODUCAO);
    const situacao = valorCf(issue, CF_AGENDA_SITUACAO_IMAGENS);
    const { progresso, cor } = calcularProgresso(dtEnvio, previsaoEntrega, situacao, hoje);

    return {
        issueId: issue.id,
        os: valorCf(issue, CF_AGENDA_OS),
        gtin,
        produto,
        responsavel: valorCf(issue, CF_AGENDA_RESPONSAVEL_POS_PRODUCAO),
        previsaoEntrega,
        progresso,
        cor
    };
}

// Move (nao copia) a pasta inteira. As duas pastas (AgConferencia e AgEnvio) vivem
// sob o mesmo SYNCIMGSEND_BASE - mesmo volume - entao rename e atomico e nao precisa
// de copia+delete manual.
function moverPasta(origem, destino) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.renameSync(origem, destino);
}

// Gera o TXT de mockup dentro da propria pasta do GTIN (ainda em AgConferencia, antes do
// move) - assim ele viaja junto pra AgEnvio automaticamente quando aprovarGtin move a pasta
// inteira, sem lógica extra de mover ele separado (diferente do retrabalho, que so manda o
// TXT porque as fotos ja estao de volta com o fotografo - aqui as imagens SAO enviadas, o
// TXT so vai junto). Numero e obrigatorio (validado em server.js antes de chamar isso),
// orientacoes e opcional - bloco "Orientacoes:" so aparece se a lista nao vier vazia.
// Remove quebra de linha de um valor que vai virar UMA linha do TXT - sem isso, um
// numeroMockup ou orientacao com \n/\r forjaria linhas extras no arquivo (ex.: um bloco
// "Orientacoes:" falso), ja que o conteudo do TXT nao tem nenhum outro escape.
function semQuebraDeLinha(valor) {
    return String(valor).replace(/[\r\n]+/g, ' ').trim();
}

// Arquivo unificado com tudo: mockup + recorte + orientacoes + observacoes customizadas.
// Um so txt por GTIN, ja que ambos viajam juntos no GTIN inteiro pra AgEnvio.
function gravarTxtUnificado(pastaGtinPath, gtin, mockupInfo, recorteInfo) {
    let conteudo = `GTIN: ${semQuebraDeLinha(gtin)}\n\n`;

    if (mockupInfo) {
        conteudo += `[MOCKUP]\n`;
        conteudo += `Numero: ${semQuebraDeLinha(mockupInfo.numero)}\n`;
        if (mockupInfo.orientacoes && mockupInfo.orientacoes.length) {
            conteudo += 'Orientacoes:\n' + mockupInfo.orientacoes.map(o => `  - ${semQuebraDeLinha(o)}`).join('\n') + '\n';
        }
        if (mockupInfo.observacoes) {
            conteudo += `Observacoes: ${semQuebraDeLinha(mockupInfo.observacoes)}\n`;
        }
        conteudo += '\n';
    }

    if (recorteInfo) {
        conteudo += `[RECORTE]\n`;
        if (recorteInfo.orientacoes && recorteInfo.orientacoes.length) {
            conteudo += 'Orientacoes:\n' + recorteInfo.orientacoes.map(o => `  - ${semQuebraDeLinha(o)}`).join('\n') + '\n';
        }
        if (recorteInfo.observacoes) {
            conteudo += `Observacoes: ${semQuebraDeLinha(recorteInfo.observacoes)}\n`;
        }
        conteudo += '\n';
    }

    const caminhoTxt = path.join(pastaGtinPath, `QA_${gtin}.txt`);
    fs.writeFileSync(caminhoTxt, conteudo, 'utf8');
    return caminhoTxt;
}

// GTIN e a unidade de decisao (ver Global Constraints do plano) - aprova a pasta
// inteira, nunca foto a foto. Preserva o nome exato das pastas (OS decorada + GTIN)
// pra o robo SyncIMGSend (PROCESSO_1/5) so espelhar a estrutura pro bucket sem
// precisar remapear nada. Depois de mover com sucesso e o Redmine confirmado,
// remove a entrada do GTIN do arquivo de destinos da OS (_destinos_qa.txt).
function aprovarGtin(agConferenciaDir, agEnvioDir, pastaOsNome, pastaGtinNome, gtin, mockupInfo, recorteInfo) {
    const origem = path.join(agConferenciaDir, pastaOsNome, pastaGtinNome);
    if (!fs.existsSync(origem)) {
        throw new Error('Pasta do GTIN nao encontrada: ' + origem);
    }
    if (mockupInfo || (recorteInfo && recorteInfo.orientacoes && recorteInfo.orientacoes.length)) {
        // Grava tudo em um unico TXT: mockup, recorte, orientacoes, observacoes.
        // Assim a pasta GTIN viaja com um arquivo so de instrucoes pra producao.
        gravarTxtUnificado(origem, gtin, mockupInfo, recorteInfo);
    }
    const destino = path.join(agEnvioDir, pastaOsNome, pastaGtinNome);
    moverPasta(origem, destino);
    const pastaOsPath = path.join(agConferenciaDir, pastaOsNome);
    removerDestinoGtin(pastaOsPath, gtin);
    return { destino };
}

// Espelha as 4 opcoes reais do cf_187 "Motivo Retrabalho Fotografia" no Redmine (ver
// docs/superpowers/specs/2026-07-28-syndi-qa-mockup-motivos-redmine-design.md secao 1/2) -
// usado so se motivos-retrabalho.json faltar ou corromper, entao precisa ser mantido em
// sincronia com o Redmine tambem, senao a UI oferece motivos que nao existem la.
const MOTIVOS_DEFAULT = [
    'Fotografia tremida',
    'Falta Fotografia',
    'Iluminação / Cor',
    'Angulação errada'
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

const ORIENTACOES_MOCKUP_DEFAULT = [
    'Usar mockup na cor original',
    'Manter fundo transparente',
    'Aplicar sombra suave',
    'Ajustar proporção pro padrão do mockup'
];

const ORIENTACOES_RECORTE_DEFAULT = [
    'Verificar bordas do recorte',
    'Conferir qualidade em alta resolução',
    'Checar detalhes finos (cabelo, tecido, etc)',
    'Validar fundo transparente',
    'Revisar sombras e reflexos'
];

// Lista de orientacoes de mockup e configuravel (orientacoes-mockup.json, versionado, mesmo
// padrao de motivos-retrabalho.json) - se faltar ou estiver corrompido, cai na lista embutida.
// So informa o editor, nunca e gravado no Redmine.
function carregarOrientacoesMockup(basePath) {
    const configPath = path.join(basePath, 'orientacoes-mockup.json');
    if (!fs.existsSync(configPath)) return ORIENTACOES_MOCKUP_DEFAULT.slice();
    try {
        const dados = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return Array.isArray(dados) && dados.length ? dados : ORIENTACOES_MOCKUP_DEFAULT.slice();
    } catch (err) {
        return ORIENTACOES_MOCKUP_DEFAULT.slice();
    }
}

// Lista de orientacoes de recorte e configuravel (orientacoes-recorte.json, versionado, mesmo
// padrao de orientacoes-mockup.json) - se faltar ou estiver corrompido, cai na lista embutida.
// So informa o editor, nunca e gravado no Redmine.
function carregarOrientacoesRecorte(basePath) {
    const configPath = path.join(basePath, 'orientacoes-recorte.json');
    if (!fs.existsSync(configPath)) return ORIENTACOES_RECORTE_DEFAULT.slice();
    try {
        const dados = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return Array.isArray(dados) && dados.length ? dados : ORIENTACOES_RECORTE_DEFAULT.slice();
    } catch (err) {
        return ORIENTACOES_RECORTE_DEFAULT.slice();
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

// Obtem a contagem de GTINs esperados vs. chegados para cada OS a partir de
// AgConferencia e do Redmine. Esperado vem dos campos de quantidade (cf_175 Mockup +
// cf_176 Recorte) na issue do GTIN. Chegado e a quantidade de arquivos JPEG na raiz
// da pasta do GTIN (nao em subpastas de tag). Erros do Redmine sao logados mas nao
// interrompem a funcao - retorna os dados que conseguiu coletar.
async function obterContagemGtins(redmineApi) {
    const resultado = {};
    const fila = listarFila(AGCONFERENCIA);

    for (const osItem of fila) {
        const os = osItem.os;
        const pastaOsNome = osItem.pastaOsNome;
        const pastaOsPath = path.join(AGCONFERENCIA, pastaOsNome);
        const osKey = 'OS_' + os;
        resultado[osKey] = {};

        for (const gtinItem of osItem.gtins) {
            const gtin = gtinItem.gtin;
            const pastaGtinPath = path.join(pastaOsPath, gtinItem.pastaGtinNome);

            // Conta imagens JPEG na raiz da pasta do GTIN
            let chegou = 0;
            if (fs.existsSync(pastaGtinPath)) {
                const imagens = listarImagensDir(pastaGtinPath);
                chegou = imagens.length;
            }

            // Busca esperado no Redmine
            let esperado = 0;
            try {
                const issue = await redmineApi.buscarIssueAbertaPorGtin(gtin);
                if (issue) {
                    const qtdMockup = parseInt((issue.custom_fields || [])
                        .find(c => c.id === 175)?.value || '0', 10) || 0;
                    const qtdRecorte = parseInt((issue.custom_fields || [])
                        .find(c => c.id === 176)?.value || '0', 10) || 0;
                    esperado = qtdMockup + qtdRecorte;
                }
            } catch (err) {
                console.warn('Erro ao buscar contagem de GTIN', gtin, 'no Redmine:', err.message);
            }

            resultado[osKey][gtin] = { esperado, chegou };
        }
    }

    return resultado;
}

// Valida a quantidade de marcas OCR para um GTIN - retorna resultado
// com validacao booleana, mensagem descritiva e lista de arquivos marcados.
function validarMarcasOcrParaGtin(pastaGtinPath, minimo = 2) {
    const mapa = lerMarcasOcr(pastaGtinPath);
    const arquivos = Object.keys(mapa).filter(nome => mapa[nome] === true);
    const quantidade = arquivos.length;

    if (quantidade === 0) {
        return {
            valido: false,
            mensagem: 'nenhuma foto marcada para OCR - ignorado',
            arquivos: []
        };
    }

    if (quantidade < minimo) {
        return {
            valido: false,
            mensagem: 'apenas ' + quantidade + ' foto' + (quantidade === 1 ? '' : 's') + ' marcada' + (quantidade === 1 ? '' : 's') + ' para OCR (minimo ' + minimo + ')',
            arquivos
        };
    }

    return {
        valido: true,
        mensagem: null,
        arquivos
    };
}

// Localiza um GTIN em uma das OS existentes em AgConferencia, procurando
// por pasta que comece com o numero do GTIN. Retorna { os, pastaOsNome } ou null.
function localizarGtinEmAgConferencia(agConferenciaDir, gtin) {
    if (!fs.existsSync(agConferenciaDir)) return null;

    const pastasOs = fs.readdirSync(agConferenciaDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name)
        .filter(nome => REGEX_PASTA_OS.test(nome));

    for (const pastaOsNome of pastasOs) {
        const os = pastaOsNome.match(REGEX_PASTA_OS)[1];
        const pastaOsPath = path.join(agConferenciaDir, pastaOsNome);

        const pastasGtin = fs.readdirSync(pastaOsPath, { withFileTypes: true })
            .filter(entrada => entrada.isDirectory())
            .map(entrada => entrada.name)
            .filter(nome => REGEX_PASTA_GTIN.test(nome));

        const encontrado = pastasGtin.find(pastaGtinNome => {
            const pastaGtinNumbero = pastaGtinNome.match(REGEX_PASTA_GTIN)[1];
            return pastaGtinNumbero === gtin;
        });

        if (encontrado) {
            return { os, pastaOsNome };
        }
    }

    return null;
}

// Copia um diretorio inteiro recursivamente (arquivos e subpastas). Usado tanto pra
// reorganizar OS_NONE quanto pro Pescador de GTIN - mesma logica, dois pontos de uso.
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

// Verificacao e reorganizacao de OS_NONE: varre GTINs marcados com OCR (minimo 2),
// encontra suas OS de destino, e move os arquivos OCR pra C:\Cadastro\OCR.
// Retorna { ok, movidos, avisos, erros } com detalhes de cada operacao.
async function verificarEOrganizarOsNone(agConferenciaDir, legadoDestinoDir, cadastroOcrDir, opcoes) {
    opcoes = opcoes || {};

    const resultado = {
        ok: true,
        movidos: [],
        avisos: [],
        erros: []
    };

    // Garante que o diretorio de destino OCR existe
    if (!fs.existsSync(cadastroOcrDir)) {
        fs.mkdirSync(cadastroOcrDir, { recursive: true });
    }

    const osNoneData = listarOsNone(legadoDestinoDir);

    // Varre cada GTIN em OS_NONE
    for (const item of osNoneData) {
        const gtin = item.gtin;
        const pastaGtinNome = item.pastaGtinNome;
        const pastaOsNonePath = path.join(legadoDestinoDir, pastaGtinNome);

        // Verifica as marcas OCR (sem exigir - so pra saber quais fotos vao pro OCR)
        const validacao = validarMarcasOcrParaGtin(pastaOsNonePath, 1); // Minimo 1, nao 2

        // Encontra a OS de destino para este GTIN (busca em AgConferencia)
        let osInfo = localizarGtinEmAgConferencia(agConferenciaDir, gtin);

        // Se nao achar em AgConferencia, tenta buscar no Redmine
        if (!osInfo && opcoes.redmine && opcoes.basePath) {
            try {
                console.log('[Verificador] Buscando GTIN ' + gtin + ' no Redmine...');
                const osRedmine = await opcoes.redmine.buscarOsDoGtin(opcoes.basePath, gtin);
                console.log('[Verificador] Resultado Redmine para ' + gtin + ':', osRedmine);
                if (osRedmine && osRedmine.os) {
                    // Cria pasta da OS em AgConferencia se nao existir
                    const pastaOsNome = 'OS_' + osRedmine.os;
                    const pastaOsPath = path.join(agConferenciaDir, pastaOsNome);
                    if (!fs.existsSync(pastaOsPath)) {
                        fs.mkdirSync(pastaOsPath, { recursive: true });
                    }
                    osInfo = { os: osRedmine.os, pastaOsNome };
                    console.log('[Verificador] OS encontrada para ' + gtin + ': OS_' + osRedmine.os);
                } else {
                    console.log('[Verificador] Nenhuma OS encontrada para ' + gtin);
                }
            } catch (err) {
                console.error('[Verificador] Erro ao buscar ' + gtin + ' no Redmine:', err.message);
                resultado.avisos.push('GTIN ' + gtin + ': erro ao buscar no Redmine - ' + err.message);
            }
        }

        if (!osInfo) {
            resultado.avisos.push('GTIN ' + gtin + ': nao encontrado em nenhuma OS');
            continue;
        }

        try {
            // PASSO 1: Reorganizar GTIN de OS_NONE para sua OS correspondente
            const pastaOsPath = path.join(agConferenciaDir, osInfo.pastaOsNome);
            const pastaGtinDestino = path.join(pastaOsPath, pastaGtinNome);

            // Cria a pasta do GTIN na OS se nao existir
            if (!fs.existsSync(pastaGtinDestino)) {
                fs.mkdirSync(pastaGtinDestino, { recursive: true });
            }

            // Copia todos os arquivos (nao move, pra manter backup em OS_NONE)
            copiarDiretorioRecursivo(pastaOsNonePath, pastaGtinDestino);

            // Marca como "finalizado" no controle-legado.json
            controleLegado[gtin] = {
                status: 'finalizado',
                data: new Date().toISOString(),
                os: osInfo.os
            };

            resultado.movidos.push('GTIN ' + gtin + ' reorganizado para OS_' + osInfo.os);

            // PASSO 2: Copiar arquivos OCR marcados para C:\Cadastro\OCR
            // Estrutura: OCR/OS_123/GTIN/foto.jpg (sem subpastas RT/IS/AP)
            const arquivosOcr = validacao.arquivos;
            const pastaOcrGtin = path.join(cadastroOcrDir, 'OS_' + osInfo.os, pastaGtinNome);

            if (arquivosOcr.length > 0) {
                if (!fs.existsSync(pastaOcrGtin)) {
                    fs.mkdirSync(pastaOcrGtin, { recursive: true });
                }
            }

            for (const nomeArquivo of arquivosOcr) {
                // Resolve o caminho relativo (pode estar em subpasta RT/IS/AP)
                let caminhoOrigem = null;
                let nomeBaseArquivo = nomeArquivo;

                if (nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
                    const partes = nomeArquivo.split(/[/\\]/);
                    nomeBaseArquivo = partes[partes.length - 1];
                    caminhoOrigem = path.join(pastaOsNonePath, nomeArquivo);
                } else {
                    caminhoOrigem = path.join(pastaOsNonePath, nomeArquivo);
                }

                if (!fs.existsSync(caminhoOrigem)) {
                    resultado.erros.push('GTIN ' + gtin + '/' + nomeArquivo + ': arquivo nao encontrado');
                    continue;
                }

                // Copia para pastaOcrGtin SEM manter estrutura RT/IS/AP (imagens na raiz)
                // Estrutura: OCR/OS_123/GTIN/foto.jpg (comprimido)
                const caminhoDestino = path.join(pastaOcrGtin, nomeBaseArquivo);

                // Comprime a imagem (reduz tamanho e qualidade) para OCR
                try {
                    const caminhoComprimido = await previewImagem.gerarPreview(caminhoOrigem, 'mini', 0);
                    if (fs.existsSync(caminhoComprimido)) {
                        fs.copyFileSync(caminhoComprimido, caminhoDestino);
                        fs.unlinkSync(caminhoComprimido);
                    } else {
                        fs.copyFileSync(caminhoOrigem, caminhoDestino);
                    }
                } catch (err) {
                    // Se falhar a compressao, copia original
                    fs.copyFileSync(caminhoOrigem, caminhoDestino);
                }

                resultado.movidos.push('  OCR: ' + nomeArquivo + ' -> OCR\\OS_' + osInfo.os + '\\' + pastaGtinNome + '\\' + nomeBaseArquivo);
            }

            // PASSO 3: Gravar fotografo "Flavio Demarchi" no Redmine (se redmine foi passado)
            if (opcoes.redmine && opcoes.basePath) {
                const r = await opcoes.redmine.gravarFotografoOsNone(opcoes.basePath, gtin);
                if (r.gravado) {
                    resultado.movidos.push('  Redmine: fotografo "Flavio Demarchi" atribuído');
                } else if (r.motivo !== 'Issue nao encontrada') {
                    resultado.avisos.push('GTIN ' + gtin + ' Redmine: ' + r.motivo);
                }
            }

        } catch (err) {
            resultado.erros.push('GTIN ' + gtin + ': erro ao reorganizar - ' + err.message);
            resultado.ok = false;
        }
    }

    return resultado;
}

// Pescador de GTIN: varre as subpastas de mes da origem (drive externo, so leitura) e
// copia pro destino (backup no drive, pasta plana) so os GTINs que ainda nao existem la.
// Nunca mexe na origem. Idempotente - rodar de novo sem nada de novo na origem nao
// copia nada.
async function pescarGtins(origemDir, destinoDir) {
    const resultado = { novos: [], jaExistiam: [], erros: [] };

    if (!fs.existsSync(origemDir)) {
        resultado.erros.push('Pasta de origem nao existe: ' + origemDir);
        return resultado;
    }

    if (!fs.existsSync(destinoDir)) {
        fs.mkdirSync(destinoDir, { recursive: true });
    }

    // Copia um GTIN encontrado (de origemPath) pra destinoDir se ainda nao existir la,
    // e grava a entrada pendente no controle-legado.json. mesOrigem e null quando o GTIN
    // estava direto na raiz da origem (sem pasta de mes por cima).
    const copiarGtinSeNovo = (origemPath, pastaGtinNome, mesOrigem) => {
        const gtin = pastaGtinNome.match(REGEX_PASTA_GTIN)[1];
        const destinoGtinPath = path.join(destinoDir, pastaGtinNome);

        if (fs.existsSync(destinoGtinPath)) {
            resultado.jaExistiam.push(gtin);
            return;
        }

        try {
            copiarDiretorioRecursivo(origemPath, destinoGtinPath);
            const controleLegado = lerControleLegado(destinoDir);
            controleLegado[gtin] = { status: 'pendente', data: new Date().toISOString(), mesOrigem };
            escreverControleLegado(destinoDir, controleLegado);
            resultado.novos.push(gtin);
        } catch (err) {
            resultado.erros.push('GTIN ' + gtin + (mesOrigem ? ' (' + mesOrigem + ')' : '') + ': ' + err.message);
        }
    };

    // A origem pode misturar as duas formas: GTIN direto na raiz, ou GTIN dentro de uma
    // pasta de mes - varre cada entrada da raiz e decide pelo proprio nome (pasta de mes
    // nao bate no regex de GTIN, que exige comecar com digito).
    const entradasRaiz = fs.readdirSync(origemDir, { withFileTypes: true })
        .filter(entrada => entrada.isDirectory())
        .map(entrada => entrada.name);

    for (const nomeEntrada of entradasRaiz) {
        if (REGEX_PASTA_GTIN.test(nomeEntrada)) {
            copiarGtinSeNovo(path.join(origemDir, nomeEntrada), nomeEntrada, null);
            continue;
        }

        const pastaMesPath = path.join(origemDir, nomeEntrada);
        const pastasGtin = fs.readdirSync(pastaMesPath, { withFileTypes: true })
            .filter(entrada => entrada.isDirectory())
            .map(entrada => entrada.name)
            .filter(nome => REGEX_PASTA_GTIN.test(nome));

        for (const pastaGtinNome of pastasGtin) {
            copiarGtinSeNovo(path.join(pastaMesPath, pastaGtinNome), pastaGtinNome, nomeEntrada);
        }
    }

    return resultado;
}

module.exports = {
    BASE_PATH,
    AGCONFERENCIA,
    AGENVIO,
    RETRABALHO,
    carregarCaminhosLocais,
    CAMINHOS_LOCAIS,
    recarregarCaminhosLocais,
    caminhoArquivoCaminhosLocais,
    nomeDecoradoBate,
    localizarPastaDecoradaPorPrefixo,
    listarFila,
    listarOsNone,
    diagnosticarFila,
    listarImagensDir,
    listarImagensGtin,
    moverParaSubpastaSyndi,
    toggleCodingSyndi,
    marcarDestinoSyndi,
    inferirCamposEdicao,
    resolverImagemSegura,
    deletarFotoSyndi,
    calcularProgresso,
    montarItemAgenda,
    gravarTxtUnificado,
    aprovarGtin,
    carregarMotivos,
    carregarOrientacoesMockup,
    carregarOrientacoesRecorte,
    gerarLinhaTxt,
    anexarTxtRetrabalho,
    retrabalharGtin,
    lerDestinosOs,
    escreverDestinosOs,
    obterDestinoGtin,
    removerDestinoGtin,
    caminhoDestinosOs,
    obterContagemGtins,
    caminhoMarcasOcr,
    lerMarcasOcr,
    escreverMarcasOcr,
    obterMarcasOcr,
    toggleMarcaOcr,
    validarMarcasOcrParaGtin,
    localizarGtinEmAgConferencia,
    verificarEOrganizarOsNone,
    pescarGtins,
    caminhoControleLegado,
    lerControleLegado,
    escreverControleLegado,
    gerarSnapshotLegado
};
