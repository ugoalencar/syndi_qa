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

// Gera (ou reaproveita do cache) um preview JPEG reduzido do arquivo original. tamanho e
// 'mini' ou 'zoom' - ver TAMANHOS acima. Nunca aumenta uma foto menor que o alvo
// (withoutEnlargement). Devolve o caminho absoluto do arquivo de preview.
async function gerarPreview(caminhoOriginal, tamanho) {
    const config = TAMANHOS[tamanho];
    if (!config) {
        throw new Error('Tamanho de preview invalido: ' + tamanho);
    }
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const caminhoCache = path.join(CACHE_DIR, chaveCache(caminhoOriginal, tamanho) + '.jpg');
    if (fs.existsSync(caminhoCache)) return caminhoCache;
    await sharp(caminhoOriginal)
        .resize({ width: config.largura, withoutEnlargement: true })
        .jpeg({ quality: config.qualidade })
        .toFile(caminhoCache);
    return caminhoCache;
}

module.exports = { gerarPreview, CACHE_DIR };
