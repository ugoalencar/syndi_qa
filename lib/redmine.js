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

// cf_85 "Responsavel QA Imagem" - id do analista que fez a acao no Syndi_qa (Aprovar,
// Retrabalho ou aba QA para Edicao). userId do arquivo de identidade ja bate com o id da
// opcao em cf_85 no Redmine, sem camada de mapeamento - ver
// docs/superpowers/specs/2026-07-28-syndi-qa-identidade-analista-design.md secao 1.
const CF_RESPONSAVEL_QA_IMAGEM = 85;

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
// Tem uma irma quase identica, montarCamposEdicaoCompleto (mais abaixo neste arquivo) -
// se mudar o mapeamento de campo aqui, confira se a outra tambem precisa mudar.
function montarCamposEdicao(campos) {
    const lista = [];
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    if (campos.userId) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.userId) });
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

// Todas as issues GTIN abertas em edicao ou recem-aprovadas, pra Agenda de Edicao -
// cf_15 em {85 "Em Edicao", 97 "Qualidade Aprovada"}. Precisa das duas (nao so 85,
// diferente do montarAgendaEdicao do sphoto) senao o item some da lista assim que
// fica pronto, e a regra de "100% verde quando entregue" nunca teria o que mostrar -
// ver spec secao 2. Redmine REST nao faz OR nativo em custom field simples, entao sao
// duas buscas paginadas concatenadas (mesmo padrao de paginacao do buscarIssuesEmEdicao
// do sphoto).
async function buscarIssuesAgenda(basePath) {
    const SITUACOES = ['85', '97'];
    const PAGINA = 100;
    const TETO_PAGINAS = 10;
    let resultado = [];

    for (const situacao of SITUACOES) {
        for (let pagina = 0; pagina < TETO_PAGINAS; pagina++) {
            const resp = await redmineFetch(basePath, '/issues.json?tracker_id=2&status_id=open&cf_15=' + situacao +
                '&limit=' + PAGINA + '&offset=' + (pagina * PAGINA));
            if (!resp.ok) throw new Error('Redmine respondeu ' + resp.status + ' ao buscar issues da agenda (situacao ' + situacao + ')');
            const dados = await resp.json();
            const issues = dados.issues || [];
            resultado = resultado.concat(issues);
            const totalDaSituacao = dados.total_count || 0;
            if ((pagina + 1) * PAGINA >= totalDaSituacao || issues.length === 0) break;
        }
    }

    return resultado;
}

function valorCfEdicao(issue, id) {
    const campo = (issue.custom_fields || []).find(c => c.id === id);
    return campo ? campo.value : '';
}

// Busca a issue aberta do GTIN com os 4 campos da aba "QA para Edicao" (Situacao +
// Responsavel + Quantidades) - so leitura, usado pra pre-preencher a tela antes do
// analista editar. issue:null se nao achar ficha aberta (front mostra aviso, igual sphoto).
async function buscarDetalheEdicao(basePath, gtin) {
    const issue = await buscarIssueAbertaPorGtin(basePath, gtin);
    if (!issue) return { issue: null };
    return {
        issue: {
            id: issue.id,
            updatedOn: issue.updated_on,
            customFields: {
                '15': valorCfEdicao(issue, CF_SITUACAO_IMAGENS),
                '23': valorCfEdicao(issue, CF_RESPONSAVEL_POS_PRODUCAO),
                '175': valorCfEdicao(issue, CF_QTD_IMAGENS_MOCKUP),
                '176': valorCfEdicao(issue, CF_QTD_IMAGENS_RECORTE)
            }
        }
    };
}

// Monta os custom_fields do PUT da aba "QA para Edicao" - DIFERENTE de montarCamposEdicao:
// esta INCLUI Situacao das Imagens (cf_15), excecao deliberada e confirmada a regra de
// "so o robo grava cf_15" - ver spec docs/superpowers/specs/2026-07-27-syndi-qa-aba-edicao-design.md
// secao 1. Campo vazio nao entra (nao sobrescreve o que ja estiver no Redmine).
function montarCamposEdicaoCompleto(campos) {
    const lista = [];
    if (campos.situacao) lista.push({ id: CF_SITUACAO_IMAGENS, value: String(campos.situacao) });
    if (campos.responsavel) lista.push({ id: CF_RESPONSAVEL_POS_PRODUCAO, value: String(campos.responsavel) });
    if (campos.qtdRecorte) lista.push({ id: CF_QTD_IMAGENS_RECORTE, value: String(campos.qtdRecorte) });
    if (campos.qtdMockup) lista.push({ id: CF_QTD_IMAGENS_MOCKUP, value: String(campos.qtdMockup) });
    if (campos.userId) lista.push({ id: CF_RESPONSAVEL_QA_IMAGEM, value: String(campos.userId) });
    return lista;
}

// Grava Situacao/Responsavel/Quantidades na issue aberta do GTIN, num PUT so - usada pela
// aba "QA para Edicao", independente do fluxo do Aprovar (que usa gravarCamposEdicao e
// nunca grava Situacao). Todos os campos vazios = nada a gravar, devolve { gravado: false }
// sem tocar na rede. Lanca erro se nao achar issue aberta ou o PUT falhar.
async function gravarCamposEdicaoCompleto(basePath, gtin, campos) {
    const customFields = montarCamposEdicaoCompleto(campos);
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
        throw new Error('Redmine respondeu ' + resp.status + ' ao gravar campos da aba de edicao: ' + texto);
    }
    return { gravado: true, issueId: issue.id, idsGravados: customFields.map(c => String(c.id)) };
}

module.exports = {
    carregarConfigRedmine,
    buscarIssueAbertaPorGtin,
    escreverCampoRedmine,
    marcarRetrabalhoFotografia,
    montarCamposEdicao,
    gravarCamposEdicao,
    buscarIssuesAgenda,
    buscarDetalheEdicao,
    montarCamposEdicaoCompleto,
    gravarCamposEdicaoCompleto
};
