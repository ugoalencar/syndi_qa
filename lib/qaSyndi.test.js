// lib/qaSyndi.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const qaSyndi = require('./qaSyndi');

function criarDirTemp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'syndiqa-'));
}

test('carregarCaminhosLocais usa default quando nao ha caminhos-locais.json', () => {
    const dirTemp = criarDirTemp();
    const resultado = qaSyndi.carregarCaminhosLocais(dirTemp);
    assert.equal(resultado.syncimgSendBase, 'C:\\Apps\\SyncIMGSend');
});

test('carregarCaminhosLocais usa valor do arquivo quando presente', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'caminhos-locais.json'), JSON.stringify({ syncimgSendBase: 'D:\\Outro\\Caminho' }));
    const resultado = qaSyndi.carregarCaminhosLocais(dirTemp);
    assert.equal(resultado.syncimgSendBase, 'D:\\Outro\\Caminho');
});

test('carregarCaminhosLocais cai no default se o JSON estiver corrompido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'caminhos-locais.json'), '{ isso nao e json');
    const resultado = qaSyndi.carregarCaminhosLocais(dirTemp);
    assert.equal(resultado.syncimgSendBase, 'C:\\Apps\\SyncIMGSend');
});

test('localizarPastaDecoradaPorPrefixo acha pasta decorada pelo prefixo numerico', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'OS_49800---(2 GTINs)---2026-07-20'));
    const encontrada = qaSyndi.localizarPastaDecoradaPorPrefixo(dirTemp, '49800', /^OS_(\d+)/);
    assert.equal(encontrada, 'OS_49800---(2 GTINs)---2026-07-20');
});

test('localizarPastaDecoradaPorPrefixo devolve null quando nao acha', () => {
    const dirTemp = criarDirTemp();
    const encontrada = qaSyndi.localizarPastaDecoradaPorPrefixo(dirTemp, '99999', /^OS_(\d+)/);
    assert.equal(encontrada, null);
});
