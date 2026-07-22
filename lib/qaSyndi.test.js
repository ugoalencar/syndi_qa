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

test('listarFila ignora pastas sem prefixo OS_ e GTINs sem imagem', () => {
    const dirTemp = criarDirTemp();
    const pastaOs = path.join(dirTemp, 'OS_49800---(2 GTINs)---2026-07-20');
    fs.mkdirSync(path.join(pastaOs, '7898133020049'), { recursive: true });
    fs.mkdirSync(path.join(pastaOs, '7898133020001'), { recursive: true });
    fs.mkdirSync(path.join(dirTemp, 'lixo-sem-prefixo'), { recursive: true });

    const fila = qaSyndi.listarFila(dirTemp);
    assert.equal(fila.length, 1);
    assert.equal(fila[0].os, '49800');
    assert.equal(fila[0].pastaOsNome, 'OS_49800---(2 GTINs)---2026-07-20');
    assert.deepEqual(
        fila[0].gtins.map(g => g.gtin).sort(),
        ['7898133020001', '7898133020049']
    );
});

test('listarFila devolve array vazio quando a pasta nao existe', () => {
    const dirTemp = criarDirTemp();
    const fila = qaSyndi.listarFila(path.join(dirTemp, 'nao-existe'));
    assert.deepEqual(fila, []);
});

test('listarImagensGtin le raiz e subpastas RT/IS/AP, ignora tag sem foto', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), Buffer.from([1, 2, 3]));
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_2.jpg'), Buffer.from([4, 5, 6]));

    const imagens = qaSyndi.listarImagensGtin(dirTemp);
    assert.equal(imagens.raiz.length, 1);
    assert.equal(imagens.raiz[0].nome, 'foto_0.jpg');
    assert.equal(imagens.raiz[0].arquivo, Buffer.from([1, 2, 3]).toString('base64'));
    assert.equal(imagens.subpastas.RT.length, 1);
    assert.equal(imagens.subpastas.RT[0].nome, 'foto_2.jpg');
    assert.equal('IS' in imagens.subpastas, false);
    assert.equal('AP' in imagens.subpastas, false);
});
