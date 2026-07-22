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

// IDs dos custom_fields do formulario de envio pra edicao (ver redmine-campos.json).
// Situacao das Imagens (cf_15) NAO entra aqui de proposito - quem grava e o robo.
const CF_RESPONSAVEL_POS_PRODUCAO = 23;
const CF_QTD_IMAGENS_MOCKUP = 175;
const CF_QTD_IMAGENS_RECORTE = 176;

// Monta o array de custom_fields pro PUT a partir dos campos do formulario - pura e
// testavel. Campo vazio nao entra (nao sobrescreve o que ja estiver no Redmine).
function montarCamposEdicao(campos) {
    const lista = [];
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    return lista;
}

// Grava Responsavel/Quantidades na issue aberta do GTIN, num PUT so. Todos os campos
// vazios = nada a gravar, devolve { gravado: false } sem tocar na rede (escolha
// explicita do analista de nao preencher). Lanca erro se nao achar issue aberta ou o
// PUT falhar - quem chama (POST /api/aprovar) BLOQUEIA o aprovar nesse caso, diferente
// do retrabalho: sem responsavel/quantidade o editor nao sabe o que fazer com o material.
async function gravarCamposEdicao(basePath, gtin, campos) {
    const customFields = montarCamposEdicao(campos);
    if (customFields.length === 0) return { gravado: false };
    const issue = await buscarIssueAbertaPorGtin(basePath, gtin);
    if (!issue) {
        throw new Error('Nenhuma ficha aberta encontrada no Redmine para o GTIN ' + gtin);
    }
    const resp = await redmineFetch(basePath, '/issues/' + issue.id + '.json', {
        method: 'PUT',
        body: JSON.stringify({ issue: { custom_fields: customFields } })
    });
    if (!resp.ok) {
        const texto = await resp.text();
        throw new Error('Redmine respondeu ' + resp.status + ' ao gravar campos de edicao: ' + texto);
    }
    return { gravado: true, issueId: issue.id };
}

module.exports = {
    carregarConfigRedmine,
    buscarIssueAbertaPorGtin,
    escreverCampoRedmine,
    marcarRetrabalhoFotografia,
    montarCamposEdicao,
    gravarCamposEdicao
};
