// lib/previewImagem.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const previewImagem = require('./previewImagem');

function criarDirTemp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'syndiqa-preview-'));
}

async function criarFotoFixture(caminho, largura, altura) {
    await sharp({
        create: { width: largura, height: altura, channels: 3, background: { r: 200, g: 50, b: 50 } }
    }).jpeg().toFile(caminho);
}

test('gerarPreview cria um arquivo de cache reduzido na primeira chamada', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto.jpg');
    await criarFotoFixture(original, 2000, 1500);

    const caminhoPreview = await previewImagem.gerarPreview(original, 'mini');
    assert.ok(fs.existsSync(caminhoPreview));
    const metadados = await sharp(caminhoPreview).metadata();
    assert.equal(metadados.width, 500);
});

test('gerarPreview reaproveita o cache na segunda chamada (nao regenera)', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto.jpg');
    await criarFotoFixture(original, 2000, 1500);

    const caminho1 = await previewImagem.gerarPreview(original, 'mini');
    const mtimeAntes = fs.statSync(caminho1).mtimeMs;
    const caminho2 = await previewImagem.gerarPreview(original, 'mini');
    const mtimeDepois = fs.statSync(caminho2).mtimeMs;

    assert.equal(caminho1, caminho2);
    assert.equal(mtimeAntes, mtimeDepois);
});

test('gerarPreview usa chaves diferentes pra mini e zoom do mesmo arquivo', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto.jpg');
    await criarFotoFixture(original, 2000, 1500);

    const caminhoMini = await previewImagem.gerarPreview(original, 'mini');
    const caminhoZoom = await previewImagem.gerarPreview(original, 'zoom');

    assert.notEqual(caminhoMini, caminhoZoom);
    const metaMini = await sharp(caminhoMini).metadata();
    const metaZoom = await sharp(caminhoZoom).metadata();
    assert.equal(metaMini.width, 500);
    assert.equal(metaZoom.width, 2000);
});

test('gerarPreview nao aumenta uma foto menor que o alvo (withoutEnlargement)', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto-pequena.jpg');
    await criarFotoFixture(original, 200, 150);

    const caminhoPreview = await previewImagem.gerarPreview(original, 'mini');
    const metadados = await sharp(caminhoPreview).metadata();
    assert.equal(metadados.width, 200);
});

test('gerarPreview rejeita tamanho invalido', async () => {
    const dirTemp = criarDirTemp();
    const original = path.join(dirTemp, 'foto.jpg');
    await criarFotoFixture(original, 2000, 1500);

    await assert.rejects(() => previewImagem.gerarPreview(original, 'gigante'));
});
