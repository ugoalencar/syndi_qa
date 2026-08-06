// lib/versionamento.js
// Le versao do projeto, commit Git atual e detecta branch remota pra atualizacoes,
// evitando travar fixo em origin/main ou origin/master.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function carregarVersao(basePath) {
    const caminho = path.join(basePath, 'versao.json');
    if (!fs.existsSync(caminho)) return { nome: 'Syndi_qa', versao: 'dev', data: null };
    try {
        const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
        return {
            nome: dados.nome || 'Syndi_qa',
            versao: dados.versao || 'dev',
            data: dados.data || null
        };
    } catch (err) {
        return { nome: 'Syndi_qa', versao: 'dev', data: null };
    }
}

function obterGitDescribe(basePath, exec = execSync) {
    try {
        return exec('git describe --tags --always', { cwd: basePath, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    } catch (err) {
        return null;
    }
}

function obterSaidaGit(basePath, cmd, exec = execSync) {
    return exec(cmd, { cwd: basePath, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
}

function detectarAlvoAtualizacao(basePath, exec = execSync) {
    const tentativas = [
        'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
        'git symbolic-ref refs/remotes/origin/HEAD',
        'git rev-parse --verify origin/main',
        'git rev-parse --verify origin/master'
    ];
    for (const cmd of tentativas) {
        try {
            const saida = obterSaidaGit(basePath, cmd, exec);
            if (cmd.includes('@{u}')) return saida.replace('refs/remotes/', '');
            if (cmd.includes('symbolic-ref')) return saida.replace('refs/remotes/', '');
            if (cmd.includes('origin/main')) return 'origin/main';
            if (cmd.includes('origin/master')) return 'origin/master';
        } catch (err) {
            // próximo candidato
        }
    }
    return 'origin/main';
}

function branchFromTarget(target) {
    return target.replace(/^origin\//, '');
}

function obterGitDescribeRemoto(basePath, target, exec = execSync) {
    try {
        return obterGitDescribe(basePath, exec);
    } catch (err) {
        return null;
    }
}

function verificarAtualizacao(basePath, exec = execSync) {
    try {
        const target = detectarAlvoAtualizacao(basePath, exec);
        const branch = branchFromTarget(target);
        obterSaidaGit(basePath, `git fetch ${target.split('/')[0]} ${branch} --tags`, exec);
        const commitsAtras = parseInt(obterSaidaGit(basePath, `git rev-list HEAD..${target} --count`, exec), 10) || 0;
        return {
            ok: true,
            branchAtualizacao: target,
            versaoAtual: obterGitDescribe(basePath, exec),
            versaoDisponivel: obterSaidaGit(basePath, `git describe --tags --always ${target}`, exec) || obterGitDescribe(basePath, exec),
            temAtualizacao: commitsAtras > 0
        };
    } catch (err) {
        return { ok: false, error: 'Nao foi possivel consultar atualizacoes (sem rede, sem remoto configurado, ou esta pasta nao e um repositorio git)' };
    }
}

function aplicarAtualizacao(basePath, exec = execSync) {
    try {
        const status = obterSaidaGit(basePath, 'git status --porcelain', exec);
        if (status) {
            return { ok: false, error: 'Ha alteracoes locais nao commitadas nesta pasta - resolva manualmente (git status) antes de atualizar' };
        }
        const target = detectarAlvoAtualizacao(basePath, exec);
        const branch = branchFromTarget(target);
        const antes = obterGitDescribe(basePath, exec);
        obterSaidaGit(basePath, `git pull --ff-only ${target.split('/')[0]} ${branch}`, exec);
        const depois = obterGitDescribe(basePath, exec);
        const arquivosMudados = antes === depois ? [] : obterSaidaGit(basePath, `git diff --name-only ${antes} ${depois}`, exec).split('\n').filter(Boolean);
        const precisaReiniciar = arquivosMudados.some(f => f === 'server.js' || f.startsWith('lib/'));
        return {
            ok: true,
            jaEstavaAtualizado: antes === depois,
            branchAtualizacao: target,
            versaoAtual: depois,
            arquivosMudados,
            precisaReiniciar
        };
    } catch (err) {
        return { ok: false, error: 'git pull falhou: ' + (err.message || String(err)).slice(0, 500) };
    }
}

module.exports = {
    carregarVersao,
    obterGitDescribe,
    detectarAlvoAtualizacao,
    verificarAtualizacao,
    aplicarAtualizacao
};
