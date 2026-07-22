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
