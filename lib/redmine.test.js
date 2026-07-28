// lib/redmine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const redmine = require('./redmine');

function criarDirTemp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'syndiqa-redmine-'));
}

test('carregarConfigRedmine devolve null quando o arquivo nao existe', () => {
    const dirTemp = criarDirTemp();
    assert.equal(redmine.carregarConfigRedmine(dirTemp), null);
});

test('carregarConfigRedmine le baseUrl/apiKey do arquivo', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'redmine-config.json'), JSON.stringify({ baseUrl: 'https://redmine.exemplo.com', apiKey: 'chave123' }));
    const config = redmine.carregarConfigRedmine(dirTemp);
    assert.deepEqual(config, { baseUrl: 'https://redmine.exemplo.com', apiKey: 'chave123' });
});

test('carregarConfigRedmine devolve null se o JSON estiver corrompido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'redmine-config.json'), '{ nao e json');
    assert.equal(redmine.carregarConfigRedmine(dirTemp), null);
});

test('montarCamposEdicao mapeia os 3 campos pros cf ids certos', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32', qtdRecorte: '3', qtdMockup: '5' });
    assert.deepEqual(lista, [
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' }
    ]);
});

test('montarCamposEdicao pula campos vazios', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '258', qtdRecorte: '', qtdMockup: '' });
    assert.deepEqual(lista, [{ id: 23, value: '258' }]);
});

test('montarCamposEdicao devolve vazio quando nada foi preenchido', () => {
    assert.deepEqual(redmine.montarCamposEdicao({ responsavel: '', qtdRecorte: '', qtdMockup: '' }), []);
    assert.deepEqual(redmine.montarCamposEdicao({}), []);
});

test('montarCamposEdicao inclui cf_85 quando userId presente', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32', qtdRecorte: '3', qtdMockup: '5', userId: '15' });
    assert.deepEqual(lista, [
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' },
        { id: 85, value: '15' }
    ]);
});

test('montarCamposEdicao nao inclui cf_85 quando userId ausente', () => {
    const lista = redmine.montarCamposEdicao({ responsavel: '32' });
    assert.deepEqual(lista, [{ id: 23, value: '32' }]);
});

test('gravarCamposEdicao devolve gravado:false sem tocar na rede quando todos os campos estao vazios', async () => {
    const dirTemp = criarDirTemp();
    const resultado = await redmine.gravarCamposEdicao(dirTemp, '7898133020049', { responsavel: '', qtdRecorte: '', qtdMockup: '' });
    assert.deepEqual(resultado, { gravado: false });
});

test('montarCamposEdicaoCompleto mapeia os 4 campos, incluindo situacao', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '85', responsavel: '32', qtdRecorte: '3', qtdMockup: '5' });
    assert.deepEqual(lista, [
        { id: 15, value: '85' },
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' }
    ]);
});

test('montarCamposEdicaoCompleto pula campos vazios, incluindo situacao vazia', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '', responsavel: '258', qtdRecorte: '', qtdMockup: '' });
    assert.deepEqual(lista, [{ id: 23, value: '258' }]);
});

test('montarCamposEdicaoCompleto devolve vazio quando nada foi preenchido', () => {
    assert.deepEqual(redmine.montarCamposEdicaoCompleto({ situacao: '', responsavel: '', qtdRecorte: '', qtdMockup: '' }), []);
    assert.deepEqual(redmine.montarCamposEdicaoCompleto({}), []);
});

test('montarCamposEdicaoCompleto inclui cf_85 quando userId presente', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '85', responsavel: '32', qtdRecorte: '3', qtdMockup: '5', userId: '16' });
    assert.deepEqual(lista, [
        { id: 15, value: '85' },
        { id: 23, value: '32' },
        { id: 176, value: '3' },
        { id: 175, value: '5' },
        { id: 85, value: '16' }
    ]);
});

test('montarCamposEdicaoCompleto nao inclui cf_85 quando userId ausente', () => {
    const lista = redmine.montarCamposEdicaoCompleto({ situacao: '85' });
    assert.deepEqual(lista, [{ id: 15, value: '85' }]);
});

test('gravarCamposEdicaoCompleto devolve gravado:false sem tocar na rede quando todos os campos estao vazios', async () => {
    const dirTemp = criarDirTemp();
    const resultado = await redmine.gravarCamposEdicaoCompleto(dirTemp, '7898133020049', { situacao: '', responsavel: '', qtdRecorte: '', qtdMockup: '' });
    assert.deepEqual(resultado, { gravado: false });
});
