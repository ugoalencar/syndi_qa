// lib/previewImagem.js
// Gera e cacheia previews reduzidos das fotos (exports finais do Lightroom, 15-18MB cada) pra
// exibicao em tela - o arquivo original nunca e alterado, so lido. Precisa de "sharp" (unica
// excecao a regra de zero-dependencia deste projeto - decisao consciente, ver
// docs/superpowers/specs/2026-07-28-syndi-qa-preview-imagem-design.md).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const CACHE_DIR = path.join(__dirname, '..', 'preview-cache');

const TAMANHOS = {
    mini: { largura: 500, qualidade: 78 },
    zoom: { largura: 2000, qualidade: 88 }
};

// Chave de cache = hash do caminho absoluto + mtime + tamanho do arquivo original. Se o
// arquivo for movido/renomeado (Aprovar, Retrabalho, tagging RT/IS/AP/_coding), o caminho
// muda, a chave muda, e uma entrada nova e gerada sob demanda - a antiga fica orfa (aceito
// por design, ver spec secao 3 - disco e barato pra arquivos desse tamanho).
function chaveCache(caminhoOriginal, tamanho) {
    const stat = fs.statSync(caminhoOriginal);
    return crypto.createHash('sha1')
        .update(path.resolve(caminhoOriginal) + '|' + stat.mtimeMs + '|' + stat.size)
        .digest('hex') + '-' + tamanho;
}

// Ler estado de rotacao (em graus) de todas as fotos de um GTIN.
// Arquivo .rotacao.json na pasta do GTIN: { "foto.jpg": 90, "outra.jpg": 180 }
function lerRotacoes(pastaGtinPath) {
    const caminhoRotacao = path.join(pastaGtinPath, '.rotacao.json');
    if (!fs.existsSync(caminhoRotacao)) return {};
    try {
        return JSON.parse(fs.readFileSync(caminhoRotacao, 'utf8'));
    } catch (e) {
        console.warn('Erro ao ler .rotacao.json:', e.message);
        return {};
    }
}

// Salvar rotacao de uma foto (em graus, 0-270).
function salvarRotacao(pastaGtinPath, nomeFoto, rotacao) {
    const caminhoRotacao = path.join(pastaGtinPath, '.rotacao.json');
    let rotacoes = lerRotacoes(pastaGtinPath);
    if (rotacao === 0 || rotacao % 360 === 0) {
        delete rotacoes[nomeFoto];
    } else {
        rotacoes[nomeFoto] = rotacao % 360;
    }
    fs.writeFileSync(caminhoRotacao, JSON.stringify(rotacoes, null, 2), 'utf8');
}

// Gera (ou reaproveita do cache) um preview JPEG reduzido do arquivo original. tamanho e
// 'mini' ou 'zoom' - ver TAMANHOS acima. Nunca aumenta uma foto menor que o alvo
// (withoutEnlargement). Devolve o caminho absoluto do arquivo de preview.
// Se rotacao for passada (em graus), aplica a rotacao via sharp antes de gerar o preview.
async function gerarPreview(caminhoOriginal, tamanho, rotacao = 0) {
    const config = TAMANHOS[tamanho];
    if (!config) {
        throw new Error('Tamanho de preview invalido: ' + tamanho);
    }
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    // Chave de cache agora inclui a rotacao pra nao reutilizar preview de versao diferente
    const chave = chaveCache(caminhoOriginal, tamanho);
    const rotacaoNormalizada = ((rotacao % 360) + 360) % 360;
    const caminhoCache = path.join(CACHE_DIR, chave + (rotacaoNormalizada !== 0 ? '-rot' + rotacaoNormalizada : '') + '.jpg');
    if (fs.existsSync(caminhoCache)) return caminhoCache;

    let transform = sharp(caminhoOriginal);
    if (rotacaoNormalizada !== 0) {
        transform = transform.rotate(rotacaoNormalizada);
    }
    await transform
        .resize({ width: config.largura, withoutEnlargement: true })
        .jpeg({ quality: config.qualidade })
        .toFile(caminhoCache);
    return caminhoCache;
}

module.exports = { gerarPreview, lerRotacoes, salvarRotacao, CACHE_DIR };
