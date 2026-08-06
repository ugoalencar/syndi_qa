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

test('nomeDecoradoBate confirma nome decorado que bate com o prefixo alvo', () => {
    assert.equal(qaSyndi.nomeDecoradoBate('OS_49800---(2 GTINs)---2026-07-20', '49800', /^OS_(\d+)/), true);
});

test('nomeDecoradoBate rejeita prefixo diferente (evita match parcial tipo "4" batendo com "49800")', () => {
    assert.equal(qaSyndi.nomeDecoradoBate('OS_49800---(2 GTINs)---2026-07-20', '4', /^OS_(\d+)/), false);
});

test('nomeDecoradoBate rejeita nome que nao bate com o padrao regex nenhum', () => {
    assert.equal(qaSyndi.nomeDecoradoBate('lixo-qualquer', '49800', /^OS_(\d+)/), false);
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

test('diagnosticarFila mostra caminho, existencia e pastas ignoradas', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'OS_49800---(1 GTINs)---2026-07-20', '7898133020049'), { recursive: true });
    fs.mkdirSync(path.join(dirTemp, '49799-sem-prefixo-os'), { recursive: true });

    const diagnostico = qaSyndi.diagnosticarFila(dirTemp);

    assert.equal(diagnostico.agConferenciaDir, dirTemp);
    assert.equal(diagnostico.existe, true);
    assert.equal(diagnostico.totalPastas, 2);
    assert.deepEqual(diagnostico.pastasOsReconhecidas, ['OS_49800---(1 GTINs)---2026-07-20']);
    assert.deepEqual(diagnostico.pastasIgnoradas, ['49799-sem-prefixo-os']);
    assert.equal(diagnostico.fila.length, 1);
});

test('diagnosticarFila explica quando AgConferencia nao existe', () => {
    const dirTemp = criarDirTemp();
    const alvo = path.join(dirTemp, 'nao-existe');

    const diagnostico = qaSyndi.diagnosticarFila(alvo);

    assert.equal(diagnostico.agConferenciaDir, alvo);
    assert.equal(diagnostico.existe, false);
    assert.deepEqual(diagnostico.fila, []);
    assert.match(diagnostico.mensagem, /nao existe/);
});

test('listarImagensGtin le raiz e subpastas RT/IS/AP, ignora tag sem foto', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), Buffer.from([1, 2, 3]));
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_2.jpg'), Buffer.from([4, 5, 6]));

    const imagens = qaSyndi.listarImagensGtin(dirTemp);
    assert.deepEqual(imagens.raiz, [{ nome: 'foto_0.jpg' }]);
    assert.deepEqual(imagens.subpastas.RT, [{ nome: 'foto_2.jpg' }]);
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

test('gravarTxtMockup grava GTIN, numero e orientacoes no arquivo', () => {
    const dirTemp = criarDirTemp();
    const caminho = qaSyndi.gravarTxtMockup(dirTemp, '7898133020049', 'MK-042', ['Usar fundo branco', 'Manter proporcao']);

    assert.equal(caminho, path.join(dirTemp, 'Mockup_7898133020049.txt'));
    const conteudo = fs.readFileSync(caminho, 'utf8');
    assert.match(conteudo, /GTIN: 7898133020049/);
    assert.match(conteudo, /Numero do Mockup: MK-042/);
    assert.match(conteudo, /- Usar fundo branco/);
    assert.match(conteudo, /- Manter proporcao/);
});

test('gravarTxtMockup omite o bloco de orientacoes quando a lista vem vazia', () => {
    const dirTemp = criarDirTemp();
    const caminho = qaSyndi.gravarTxtMockup(dirTemp, '7898133020049', 'MK-042', []);

    const conteudo = fs.readFileSync(caminho, 'utf8');
    assert.match(conteudo, /Numero do Mockup: MK-042/);
    assert.doesNotMatch(conteudo, /Orientacoes:/);
});

test('gravarTxtMockup remove quebra de linha do numero e das orientacoes (nao forja linhas extras no TXT)', () => {
    const dirTemp = criarDirTemp();
    const caminho = qaSyndi.gravarTxtMockup(dirTemp, '7898133020049', 'MK-1\nOrientacoes:\n- Falso', ['linha\r\nquebrada']);

    const conteudo = fs.readFileSync(caminho, 'utf8');
    const linhas = conteudo.split('\n');
    assert.equal(linhas[1], 'Numero do Mockup: MK-1 Orientacoes: - Falso');
    assert.match(conteudo, /- linha quebrada/);
});

test('aprovarGtin grava o TXT de mockup dentro da pasta antes de mover, quando mockupInfo e passado', () => {
    const agConferencia = criarDirTemp();
    const agEnvio = criarDirTemp();
    const pastaOsNome = 'OS_49800---(1 GTINs)---2026-07-20';
    const pastaGtinNome = '7898133020049';
    const origem = path.join(agConferencia, pastaOsNome, pastaGtinNome);
    fs.mkdirSync(origem, { recursive: true });
    fs.writeFileSync(path.join(origem, 'foto_0.jpg'), 'a');

    qaSyndi.aprovarGtin(agConferencia, agEnvio, pastaOsNome, pastaGtinNome, { gtin: pastaGtinNome, numero: 'MK-042', orientacoes: ['Usar fundo branco'] });

    const destino = path.join(agEnvio, pastaOsNome, pastaGtinNome);
    const caminhoTxt = path.join(destino, `Mockup_${pastaGtinNome}.txt`);
    assert.equal(fs.existsSync(caminhoTxt), true);
    const conteudo = fs.readFileSync(caminhoTxt, 'utf8');
    assert.match(conteudo, /Numero do Mockup: MK-042/);
});

test('aprovarGtin nao gera TXT de mockup quando mockupInfo nao e passado', () => {
    const agConferencia = criarDirTemp();
    const agEnvio = criarDirTemp();
    const pastaOsNome = 'OS_49800---(1 GTINs)---2026-07-20';
    const pastaGtinNome = '7898133020049';
    const origem = path.join(agConferencia, pastaOsNome, pastaGtinNome);
    fs.mkdirSync(origem, { recursive: true });
    fs.writeFileSync(path.join(origem, 'foto_0.jpg'), 'a');

    qaSyndi.aprovarGtin(agConferencia, agEnvio, pastaOsNome, pastaGtinNome);

    const destino = path.join(agEnvio, pastaOsNome, pastaGtinNome);
    const arquivos = fs.readdirSync(destino);
    assert.deepEqual(arquivos, ['foto_0.jpg']);
});

test('aprovarGtin grava TXT de recorte com orientacoes dentro da pasta antes de mover', () => {
    const agConferencia = criarDirTemp();
    const agEnvio = criarDirTemp();
    const pastaOsNome = 'OS_49800---(1 GTINs)---2026-07-20';
    const pastaGtinNome = '7898133020049';
    const origem = path.join(agConferencia, pastaOsNome, pastaGtinNome);
    fs.mkdirSync(origem, { recursive: true });
    fs.writeFileSync(path.join(origem, 'foto_0.jpg'), 'a');

    qaSyndi.aprovarGtin(agConferencia, agEnvio, pastaOsNome, pastaGtinNome, null, { gtin: pastaGtinNome, orientacoes: ['Verificar bordas', 'linha\nquebrada'] });

    const destino = path.join(agEnvio, pastaOsNome, pastaGtinNome);
    const caminhoTxt = path.join(destino, `Recorte_${pastaGtinNome}.txt`);
    assert.equal(fs.existsSync(caminhoTxt), true);
    const conteudo = fs.readFileSync(caminhoTxt, 'utf8');
    assert.equal(conteudo, 'GTIN: 7898133020049\nOrientacoes:\n- Verificar bordas\n- linha quebrada\n');
});

test('carregarMotivos le motivos-retrabalho.json quando existe', () => {
    const conteudo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'motivos-retrabalho.json'), 'utf8'));
    const motivos = qaSyndi.carregarMotivos(path.join(__dirname, '..'));
    assert.deepEqual(motivos, conteudo);
    assert.equal(motivos.includes('Fotografia tremida'), true);
});

test('carregarMotivos cai numa lista default quando o arquivo nao existe', () => {
    const dirTemp = criarDirTemp();
    const motivos = qaSyndi.carregarMotivos(dirTemp);
    assert.equal(Array.isArray(motivos), true);
    assert.equal(motivos.length > 0, true);
});

test('carregarOrientacoesMockup usa default quando nao ha orientacoes-mockup.json', () => {
    const dirTemp = criarDirTemp();
    const resultado = qaSyndi.carregarOrientacoesMockup(dirTemp);
    assert.equal(Array.isArray(resultado), true);
    assert.ok(resultado.length > 0);
});

test('carregarOrientacoesMockup usa valor do arquivo quando presente', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'orientacoes-mockup.json'), JSON.stringify(['Orientacao customizada']));
    const resultado = qaSyndi.carregarOrientacoesMockup(dirTemp);
    assert.deepEqual(resultado, ['Orientacao customizada']);
});

test('carregarOrientacoesMockup cai no default se o JSON estiver corrompido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'orientacoes-mockup.json'), '{ isso nao e json');
    const resultado = qaSyndi.carregarOrientacoesMockup(dirTemp);
    assert.ok(resultado.length > 0);
});

test('retrabalharGtin move a pasta inteira e anexa no TXT unico da OS', () => {
    const agConferencia = criarDirTemp();
    const retrabalho = criarDirTemp();
    const pastaOsNome = 'OS_49800---(1 GTINs)---2026-07-20';
    const pastaGtinNome = '7898133020049';
    const origem = path.join(agConferencia, pastaOsNome, pastaGtinNome);
    fs.mkdirSync(origem, { recursive: true });
    fs.writeFileSync(path.join(origem, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(origem, 'foto_2.jpg'), 'b');

    const resultado = qaSyndi.retrabalharGtin(
        agConferencia, retrabalho, pastaOsNome, pastaGtinNome,
        '49800', '7898133020049', { 'foto_2.jpg': ['desfoque'] }
    );

    assert.equal(fs.existsSync(origem), false);
    const destino = path.join(retrabalho, pastaOsNome, pastaGtinNome);
    assert.equal(resultado.destino, destino);
    assert.equal(fs.existsSync(path.join(destino, 'foto_0.jpg')), true);
    assert.equal(fs.existsSync(path.join(destino, 'foto_2.jpg')), true);
    const caminhoTxt = path.join(retrabalho, pastaOsNome, 'Retrabalho_OS_49800.txt');
    assert.equal(resultado.caminhoTxt, caminhoTxt);
    assert.equal(fs.readFileSync(caminhoTxt, 'utf8'), '7898133020049 - foto_2.jpg: desfoque\n');
});

test('retrabalharGtin lanca erro quando a pasta de origem nao existe', () => {
    const agConferencia = criarDirTemp();
    const retrabalho = criarDirTemp();
    assert.throws(
        () => qaSyndi.retrabalharGtin(agConferencia, retrabalho, 'OS_1---(1 GTINs)---2026-01-01', '123', '1', '123', {}),
        /Pasta do GTIN nao encontrada/
    );
});

test('resolverImagemSegura resolve foto na raiz e em subpasta', () => {
    const dirTemp = criarDirTemp();
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, 'foto_0.jpg'), path.join(dirTemp, 'foto_0.jpg'));
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, 'RT/foto_2.jpg'), path.join(dirTemp, 'RT', 'foto_2.jpg'));
});

test('resolverImagemSegura bloqueia path traversal', () => {
    const dirTemp = criarDirTemp();
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, '../../windows/win.ini'), null);
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, '..\\..\\windows\\win.ini'), null);
});

test('resolverImagemSegura bloqueia extensao que nao seja jpg/jpeg', () => {
    const dirTemp = criarDirTemp();
    assert.equal(qaSyndi.resolverImagemSegura(dirTemp, 'arquivo.txt'), null);
});

test('gerarLinhaTxt formata gtin, arquivo e motivos numa linha', () => {
    assert.equal(
        qaSyndi.gerarLinhaTxt('7896061302527', 'foto_0.jpg', ['desfoque', 'iluminação']),
        '7896061302527 - foto_0.jpg: desfoque, iluminação'
    );
});

test('anexarTxtRetrabalho cria Retrabalho_OS_<numero>.txt na raiz da pasta da OS', () => {
    const retrabalho = criarDirTemp();
    const pastaOsNome = 'OS_49800---(2 GTINs)---2026-07-20';
    const caminho = qaSyndi.anexarTxtRetrabalho(retrabalho, pastaOsNome, '49800', '7896061302527', {
        '7896061302527_06_07_2026_11_45_34_0.jpg': ['desfoque']
    });
    assert.equal(caminho, path.join(retrabalho, pastaOsNome, 'Retrabalho_OS_49800.txt'));
    assert.equal(
        fs.readFileSync(caminho, 'utf8'),
        '7896061302527 - 7896061302527_06_07_2026_11_45_34_0.jpg: desfoque\n'
    );
});

test('anexarTxtRetrabalho anexa linhas de outro GTIN no mesmo arquivo da OS', () => {
    const retrabalho = criarDirTemp();
    const pastaOsNome = 'OS_49800---(2 GTINs)---2026-07-20';
    qaSyndi.anexarTxtRetrabalho(retrabalho, pastaOsNome, '49800', '7896061302527', {
        'foto_0.jpg': ['desfoque']
    });
    const caminho = qaSyndi.anexarTxtRetrabalho(retrabalho, pastaOsNome, '49800', '7898994680758', {
        'foto_1.jpg': ['iluminação', 'enquadramento errado']
    });
    assert.equal(
        fs.readFileSync(caminho, 'utf8'),
        '7896061302527 - foto_0.jpg: desfoque\n7898994680758 - foto_1.jpg: iluminação, enquadramento errado\n'
    );
});

test('moverParaSubpastaSyndi move da raiz pra subpasta e de volta (toggle)', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r1 = qaSyndi.moverParaSubpastaSyndi(dirTemp, 'foto_0.jpg', 'RT');
    assert.equal(r1.destino, 'RT');
    assert.equal(fs.existsSync(path.join(dirTemp, 'foto_0.jpg')), false);
    assert.equal(fs.existsSync(path.join(dirTemp, 'RT', 'foto_0.jpg')), true);

    const r2 = qaSyndi.moverParaSubpastaSyndi(dirTemp, 'foto_0.jpg', 'RT');
    assert.equal(r2.destino, 'raiz');
    assert.equal(fs.existsSync(path.join(dirTemp, 'foto_0.jpg')), true);
    assert.equal(fs.existsSync(path.join(dirTemp, 'RT', 'foto_0.jpg')), false);
});

test('moverParaSubpastaSyndi move entre subpastas diferentes', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_0.jpg'), 'a');

    const r = qaSyndi.moverParaSubpastaSyndi(dirTemp, 'foto_0.jpg', 'IS');
    assert.equal(r.destino, 'IS');
    assert.equal(fs.existsSync(path.join(dirTemp, 'RT', 'foto_0.jpg')), false);
    assert.equal(fs.existsSync(path.join(dirTemp, 'IS', 'foto_0.jpg')), true);
});

test('moverParaSubpastaSyndi lanca erro pra pasta invalida', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    assert.throws(() => qaSyndi.moverParaSubpastaSyndi(dirTemp, 'foto_0.jpg', 'XX'), /Pasta deve ser RT, IS ou AP/);
});

test('moverParaSubpastaSyndi lanca erro quando arquivo nao existe', () => {
    const dirTemp = criarDirTemp();
    assert.throws(() => qaSyndi.moverParaSubpastaSyndi(dirTemp, 'nao-existe.jpg', 'RT'), /Arquivo nao encontrado/);
});

test('toggleCodingSyndi adiciona e remove o sufixo _coding', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r1 = qaSyndi.toggleCodingSyndi(dirTemp, 'foto_0.jpg');
    assert.equal(r1.novoNome, 'foto_0_coding.jpg');
    assert.equal(fs.existsSync(path.join(dirTemp, 'foto_0_coding.jpg')), true);

    const r2 = qaSyndi.toggleCodingSyndi(dirTemp, 'foto_0_coding.jpg');
    assert.equal(r2.novoNome, 'foto_0.jpg');
    assert.equal(fs.existsSync(path.join(dirTemp, 'foto_0.jpg')), true);
});

test('toggleCodingSyndi lanca erro quando arquivo nao existe', () => {
    const dirTemp = criarDirTemp();
    assert.throws(() => qaSyndi.toggleCodingSyndi(dirTemp, 'nao-existe.jpg'), /Arquivo nao encontrado/);
});

test('marcarDestinoSyndi cria e remove as subpastas-sinal Mockup/Recorte', () => {
    const dirTemp = criarDirTemp();

    qaSyndi.marcarDestinoSyndi(dirTemp, 'Mockup');
    assert.equal(fs.existsSync(path.join(dirTemp, 'Mockup')), true);
    assert.equal(fs.existsSync(path.join(dirTemp, 'Recorte')), false);

    qaSyndi.marcarDestinoSyndi(dirTemp, 'Recorte');
    assert.equal(fs.existsSync(path.join(dirTemp, 'Mockup')), false);
    assert.equal(fs.existsSync(path.join(dirTemp, 'Recorte')), true);

    qaSyndi.marcarDestinoSyndi(dirTemp, null);
    assert.equal(fs.existsSync(path.join(dirTemp, 'Mockup')), false);
    assert.equal(fs.existsSync(path.join(dirTemp, 'Recorte')), false);
});

test('marcarDestinoSyndi lanca erro pra tipo invalido', () => {
    const dirTemp = criarDirTemp();
    assert.throws(() => qaSyndi.marcarDestinoSyndi(dirTemp, 'Outro'), /tipo deve ser/);
});

test('listarImagensGtin inclui destino Mockup/Recorte quando marcado', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    const imagens = qaSyndi.listarImagensGtin(dirTemp);
    assert.equal(imagens.destino, 'Mockup');
});

test('listarImagensGtin destino e null quando nenhuma subpasta-sinal existe', () => {
    const dirTemp = criarDirTemp();
    const imagens = qaSyndi.listarImagensGtin(dirTemp);
    assert.equal(imagens.destino, null);
});

test('inferirCamposEdicao com Mockup marcado infere Virafilme e conta sem _coding', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1.jpg'), 'b');
    fs.writeFileSync(path.join(dirTemp, 'foto_2_coding.jpg'), 'c');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32', qtdMockup: '2' });
});

test('inferirCamposEdicao com Mockup marcado infere Virafilme mesmo com subpasta RT/IS/AP (M manda mais que S)', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_rt.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32', qtdMockup: '1' });
});

test('inferirCamposEdicao com Mockup mas todas as fotos _coding e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0_coding.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});

test('inferirCamposEdicao com Mockup E Recorte e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Mockup'));
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
    assert.match(r.motivo, /Mockup e Recorte/);
});

test('inferirCamposEdicao com Recorte marcado e foto _coding, sem subpasta RT/IS/AP, infere Bright River', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1_coding.jpg'), 'b');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'eua');
    assert.deepEqual(r.campos, { responsavel: '258', qtdRecorte: '1' });
});

test('inferirCamposEdicao com Recorte marcado e subpasta RT/IS/AP com fotos infere Virafilme (subpasta manda mais que _coding)', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.mkdirSync(path.join(dirTemp, 'IS'));
    fs.writeFileSync(path.join(dirTemp, 'IS', 'foto_is.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1_coding.jpg'), 'b');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32', qtdRecorte: '1' });
});

test('inferirCamposEdicao com Recorte marcado e subpasta RT/IS/AP mas sem _coding ainda infere Virafilme (extrapolacao: subpasta manda sozinha)', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.mkdirSync(path.join(dirTemp, 'AP'));
    fs.writeFileSync(path.join(dirTemp, 'AP', 'foto_ap.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32', qtdRecorte: '1' });
});

test('inferirCamposEdicao com Recorte marcado e subpasta RT/IS/AP mas todas as fotos da raiz _coding e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_rt.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0_coding.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});

test('inferirCamposEdicao com Recorte marcado, sem subpasta RT/IS/AP e sem _coding e indefinido (Recorte sozinho nao decide mais)', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'Recorte'));
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});

test('inferirCamposEdicao sem Mockup/Recorte mas com subpasta RT/IS/AP com fotos infere Virafilme sem quantidade', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'foto_rt.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32' });
});

test('inferirCamposEdicao ignora arquivo nao-foto (ex.: Thumbs.db) dentro da subpasta RT/IS/AP ao decidir S', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'RT'));
    fs.writeFileSync(path.join(dirTemp, 'RT', 'Thumbs.db'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});

test('inferirCamposEdicao sem Mockup/Recorte, com subpasta RT/IS/AP com fotos E com _coding na raiz ainda infere Virafilme (S manda mais que C)', () => {
    const dirTemp = criarDirTemp();
    fs.mkdirSync(path.join(dirTemp, 'IS'));
    fs.writeFileSync(path.join(dirTemp, 'IS', 'foto_is.jpg'), 'z');
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1_coding.jpg'), 'b');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'brasil');
    assert.deepEqual(r.campos, { responsavel: '32' });
});

test('inferirCamposEdicao sem subpasta nenhuma mas com _coding cai no fallback Bright River', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');
    fs.writeFileSync(path.join(dirTemp, 'foto_1.jpg'), 'b');
    fs.writeFileSync(path.join(dirTemp, 'foto_2_coding.jpg'), 'c');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'eua');
    assert.deepEqual(r.campos, { responsavel: '258', qtdRecorte: '2' });
});

test('inferirCamposEdicao sem subpasta nenhuma e sem _coding e indefinido', () => {
    const dirTemp = criarDirTemp();
    fs.writeFileSync(path.join(dirTemp, 'foto_0.jpg'), 'a');

    const r = qaSyndi.inferirCamposEdicao(dirTemp);
    assert.equal(r.destino, 'indefinido');
    assert.deepEqual(r.campos, {});
});

function addDias(dataISO, dias) {
    const d = new Date(dataISO + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

test('calcularProgresso: situacao 97 (entregue) e sempre 100% verde, mesmo sem datas', () => {
    const r = qaSyndi.calcularProgresso(null, null, '97', '2026-07-07');
    assert.deepEqual(r, { progresso: 100, cor: 'verde' });
});

test('calcularProgresso: situacao 97 (entregue) e 100% verde mesmo com prazo no futuro', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const r = qaSyndi.calcularProgresso(inicio, fim, '97', addDias(inicio, 10));
    assert.deepEqual(r, { progresso: 100, cor: 'verde' });
});

test('calcularProgresso: sem dtEnvio devolve cinza (sem dado suficiente)', () => {
    const r = qaSyndi.calcularProgresso(null, '2026-07-08', '85', '2026-07-07');
    assert.deepEqual(r, { progresso: null, cor: 'cinza' });
});

test('calcularProgresso: sem previsaoEntrega devolve cinza (sem dado suficiente)', () => {
    const r = qaSyndi.calcularProgresso('2026-07-06', null, '85', '2026-07-07');
    assert.deepEqual(r, { progresso: null, cor: 'cinza' });
});

test('calcularProgresso: 0% decorrido = verde', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', inicio);
    assert.deepEqual(r, { progresso: 0, cor: 'verde' });
});

test('calcularProgresso: 29% decorrido = verde (limite superior da faixa verde)', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 29);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 29, cor: 'verde' });
});

test('calcularProgresso: 30% decorrido = amarelo (limite inferior da faixa amarela)', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 30);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 30, cor: 'amarelo' });
});

test('calcularProgresso: 59% decorrido = amarelo (limite superior da faixa amarela)', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 59);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 59, cor: 'amarelo' });
});

test('calcularProgresso: 60% decorrido = vermelho (limite inferior da faixa vermelha)', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 60);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 60, cor: 'vermelho' });
});

test('calcularProgresso: prazo estourado sem entrega = 100% vermelho', () => {
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 100);
    const hoje = addDias(inicio, 250);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 100, cor: 'vermelho' });
});

test('calcularProgresso: percentual bruto 29.6% arredonda para 30 mas cor usa valor sem arredondar (verde)', () => {
    // 8/27*100 = 29.629...% bruto -> verde (<30), mas Math.round(29.629) = 30 arredondado.
    // Se o arredondamento acontecesse antes da comparacao, cairia errado em amarelo.
    const inicio = '2026-01-01';
    const fim = addDias(inicio, 27);
    const hoje = addDias(inicio, 8);
    const r = qaSyndi.calcularProgresso(inicio, fim, '85', hoje);
    assert.deepEqual(r, { progresso: 30, cor: 'verde' });
});

test('montarItemAgenda extrai gtin/produto/responsavel/previsao quando cf_1 esta preenchido', () => {
    const issue = {
        id: 555,
        subject: '7896061302107 - Produto Exemplo',
        custom_fields: [
            { id: 1, value: '7896061302107' },
            { id: 2, value: '49800' },
            { id: 15, value: '85' },
            { id: 21, value: '2026-07-06' },
            { id: 23, value: '32' },
            { id: 34, value: '2026-07-08' }
        ]
    };
    const resultado = qaSyndi.montarItemAgenda(issue, '2026-07-07');
    assert.deepEqual(resultado, {
        issueId: 555,
        os: '49800',
        gtin: '7896061302107',
        produto: 'Produto Exemplo',
        responsavel: '32',
        previsaoEntrega: '2026-07-08',
        progresso: 50,
        cor: 'amarelo'
    });
});

test('montarItemAgenda cai pro subject quando cf_1 nao esta preenchido', () => {
    const issue = {
        id: 556,
        subject: '7896061399999 - Outro Produto',
        custom_fields: []
    };
    const resultado = qaSyndi.montarItemAgenda(issue, '2026-07-07');
    assert.deepEqual(resultado, {
        issueId: 556,
        os: null,
        gtin: '7896061399999',
        produto: 'Outro Produto',
        responsavel: null,
        previsaoEntrega: null,
        progresso: null,
        cor: 'cinza'
    });
});
