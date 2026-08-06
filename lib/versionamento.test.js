// lib/versionamento.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const versionamento = require('./versionamento');

function criarDirTemp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'syndiqa-versionamento-'));
}

function criarExecSyncFake(respostas) {
    const chamadas = [];
    const fake = (cmd) => {
        chamadas.push(cmd);
        for (const regra of respostas) {
            if (typeof regra.cmd === 'string' ? cmd === regra.cmd : regra.cmd.test(cmd)) {
                if (regra.erro) throw new Error(regra.erro);
                return Buffer.from(regra.saida || '');
            }
        }
        throw new Error('comando inesperado: ' + cmd);
    };
    fake.chamadas = chamadas;
    return fake;
}

test('carregarVersao usa fallback quando versao.json nao existe', () => {
    const dirTemp = criarDirTemp();
    const resultado = versionamento.carregarVersao(dirTemp);
    assert.deepEqual(resultado, { nome: 'Syndi_qa', versao: 'dev', data: null });
});

test('carregarVersao le versao.json valido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'versao.json'), JSON.stringify({ nome: 'Syndi_qa', versao: '0.2.0', data: '2026-08-05' }));
    const resultado = versionamento.carregarVersao(dirTemp);
    assert.deepEqual(resultado, { nome: 'Syndi_qa', versao: '0.2.0', data: '2026-08-05' });
});

test('carregarVersao usa fallback quando versao.json esta corrompido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'versao.json'), '{ nao e json');
    const resultado = versionamento.carregarVersao(dirTemp);
    assert.deepEqual(resultado, { nome: 'Syndi_qa', versao: 'dev', data: null });
});

test('detectarAlvoAtualizacao usa upstream atual quando existe', () => {
    const execSync = criarExecSyncFake([
        { cmd: 'git rev-parse --abbrev-ref --symbolic-full-name @{u}', saida: 'origin/master\n' }
    ]);
    const resultado = versionamento.detectarAlvoAtualizacao('x', execSync);
    assert.equal(resultado, 'origin/master');
});

test('detectarAlvoAtualizacao cai para origin/HEAD quando upstream nao existe', () => {
    const execSync = criarExecSyncFake([
        { cmd: 'git rev-parse --abbrev-ref --symbolic-full-name @{u}', erro: 'sem upstream' },
        { cmd: 'git symbolic-ref refs/remotes/origin/HEAD', saida: 'refs/remotes/origin/master\n' }
    ]);
    const resultado = versionamento.detectarAlvoAtualizacao('x', execSync);
    assert.equal(resultado, 'origin/master');
});

test('detectarAlvoAtualizacao cai para origin/main e depois origin/master', () => {
    const execSync = criarExecSyncFake([
        { cmd: 'git rev-parse --abbrev-ref --symbolic-full-name @{u}', erro: 'sem upstream' },
        { cmd: 'git symbolic-ref refs/remotes/origin/HEAD', erro: 'sem head' },
        { cmd: 'git rev-parse --verify origin/main', erro: 'sem main' },
        { cmd: 'git rev-parse --verify origin/master', saida: 'abc123\n' }
    ]);
    const resultado = versionamento.detectarAlvoAtualizacao('x', execSync);
    assert.equal(resultado, 'origin/master');
});

test('verificarAtualizacao compara HEAD com alvo detectado', () => {
    const execSync = criarExecSyncFake([
        { cmd: 'git rev-parse --abbrev-ref --symbolic-full-name @{u}', saida: 'origin/master\n' },
        { cmd: 'git fetch origin master --tags', saida: '' },
        { cmd: 'git rev-list HEAD..origin/master --count', saida: '2\n' },
        { cmd: 'git describe --tags --always', saida: 'local123\n' },
        { cmd: 'git describe --tags --always origin/master', saida: 'remote456\n' }
    ]);
    const resultado = versionamento.verificarAtualizacao('x', execSync);
    assert.deepEqual(resultado, {
        ok: true,
        branchAtualizacao: 'origin/master',
        versaoAtual: 'local123',
        versaoDisponivel: 'remote456',
        temAtualizacao: true
    });
});
