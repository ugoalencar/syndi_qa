// lib/redmine.js
// Escreve status no Redmine quando o Syndi_qa confirma um retrabalho. Mesmo padrao de
// credencial/fetch ja usado em c:\sphoto\lib\qaHub.js (redmineFetch/buscarIssueAbertaPorGtin/
// PUT de custom_fields via issues/:id.json) - nao reinventa, replica o que ja funciona la.
const fs = require('fs');
const path = require('path');

function carregarConfigRedmine(basePath) {
    const configPath = path.join(basePath, 'redmine-config.json');
    if (!fs.existsSync(configPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
        return null;
    }
}

async function redmineFetch(basePath, caminho, opcoes) {
    const config = carregarConfigRedmine(basePath);
    if (!config || !config.baseUrl || !config.apiKey) {
        throw new Error('redmine-config.json ausente ou incompleto (precisa de baseUrl e apiKey)');
    }
    const cabecalhos = Object.assign({
        'X-Redmine-API-Key': config.apiKey,
        'Content-Type': 'application/json'
    }, (opcoes && opcoes.headers) || {});
    return fetch(config.baseUrl + caminho, Object.assign({}, opcoes, { headers: cabecalhos }));
}

// Mesma consulta que o sphoto ja usa: cf_1 = GTIN, tracker_id=2 (GTIN), status aberto.
async function buscarIssueAbertaPorGtin(basePath, gtin) {
    const resp = await redmineFetch(basePath, '/issues.json?cf_1=' + encodeURIComponent(gtin) + '&status_id=open&tracker_id=2&limit=5');
    if (!resp.ok) throw new Error('Redmine respondeu ' + resp.status + ' ao buscar GTIN ' + gtin);
    const dados = await resp.json();
    if (!dados.issues || dados.issues.length === 0) return null;
    return dados.issues[0];
}

async function escreverCampoRedmine(basePath, issueId, campoId, valor) {
    const resp = await redmineFetch(basePath, '/issues/' + issueId + '.json', {
        method: 'PUT',
        body: JSON.stringify({ issue: { custom_fields: [{ id: campoId, value: valor }] } })
    });
    if (!resp.ok) {
        const texto = await resp.text();
        throw new Error('Redmine respondeu ' + resp.status + ' ao gravar campo: ' + texto);
    }
}

const CF_SITUACAO_IMAGENS = 15;
const OPCAO_RETRABALHO_FOTOGRAFIA = '24';

// Busca a issue aberta do GTIN e marca Situacao das Imagens = "Retrabalho Fotografia" (24).
// Lanca erro se nao achar issue aberta ou se a escrita falhar - quem chama (server.js)
// decide o que fazer com a falha (nao desfaz o move/TXT locais que ja aconteceram).
async function marcarRetrabalhoFotografia(basePath, gtin) {
    const issue = await buscarIssueAbertaPorGtin(basePath, gtin);
    if (!issue) {
        throw new Error('Nenhuma ficha aberta encontrada no Redmine para o GTIN ' + gtin);
    }
    await escreverCampoRedmine(basePath, issue.id, CF_SITUACAO_IMAGENS, OPCAO_RETRABALHO_FOTOGRAFIA);
    return { issueId: issue.id };
}

module.exports = {
    carregarConfigRedmine,
    buscarIssueAbertaPorGtin,
    escreverCampoRedmine,
    marcarRetrabalhoFotografia
};
