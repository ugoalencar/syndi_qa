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

test('aprovarGtin move a pasta inteira do GTIN pra AgEnvio preservando subpastas', () => {
    const agConferencia = criarDirTemp();
    const agEnvio = criarDirTemp();
    const pastaOsNome = 'OS_49800---(1 GTINs)---2026-07-20';
    const pastaGtinNome = '7898133020049';
    const origem = path.join(agConferencia, pastaOsNome, pastaGtinNome);
    fs.mkdirSync(path.join(origem, 'RT'), { recursive: true });
    fs.writeFileSync(path.join(origem, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(origem, 'RT', 'foto_2.jpg'), 'b');

    const resultado = qaSyndi.aprovarGtin(agConferencia, agEnvio, pastaOsNome, pastaGtinNome);

    assert.equal(fs.existsSync(origem), false);
    const destino = path.join(agEnvio, pastaOsNome, pastaGtinNome);
    assert.equal(resultado.destino, destino);
    assert.equal(fs.existsSync(path.join(destino, 'foto_0.jpg')), true);
    assert.equal(fs.existsSync(path.join(destino, 'RT', 'foto_2.jpg')), true);
});

test('aprovarGtin lanca erro quando a pasta de origem nao existe', () => {
    const agConferencia = criarDirTemp();
    const agEnvio = criarDirTemp();
    assert.throws(
        () => qaSyndi.aprovarGtin(agConferencia, agEnvio, 'OS_1---(1 GTINs)---2026-01-01', '123'),
        /Pasta do GTIN nao encontrada/
    );
});

test('carregarMotivos le motivos-retrabalho.json quando existe', () => {
    const conteudo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'motivos-retrabalho.json'), 'utf8'));
    const motivos = qaSyndi.carregarMotivos(path.join(__dirname, '..'));
    assert.deepEqual(motivos, conteudo);
    assert.equal(motivos.includes('desfoque'), true);
});

test('carregarMotivos cai numa lista default quando o arquivo nao existe', () => {
    const dirTemp = criarDirTemp();
    const motivos = qaSyndi.carregarMotivos(dirTemp);
    assert.equal(Array.isArray(motivos), true);
    assert.equal(motivos.length > 0, true);
});

test('gerarConteudoTxt formata GTIN, data e uma linha por foto marcada', () => {
    const conteudo = qaSyndi.gerarConteudoTxt(
        '7898133020049',
        { 'foto_2.jpg': ['desfoque', 'iluminação'], 'foto_5.jpg': ['fundo sujo'] },
        new Date(2026, 6, 21)
    );
    assert.equal(
        conteudo,
        'GTIN: 7898133020049\nData: 2026-07-21\nfoto_2.jpg: desfoque, iluminação\nfoto_5.jpg: fundo sujo\n'
    );
});
