# Prompt para Desenvolvimento: Sistema de QA de Imagens

**Contexto e Objetivo**
Atue como um Desenvolvedor de Software / Arquiteto de Sistemas. O objetivo é desenvolver e ajustar as regras de negócio e a interface de um sistema de QA (Garantia de Qualidade) de imagens. Este sistema atua no meio do fluxo: ele recebe as imagens (.jpg) que já passaram pelo tratamento inicial do fotógrafo e permite que um analista faça a verificação e o roteamento dessas imagens (Aprovação para Edição ou Acionamento de Retrabalho).

**Requisitos e Regras de Negócio**

### 1. Gestão e Recebimento de Imagens
* A interface do sistema deve exibir as imagens recebidas (todas em formato JPEG, convertidas após o trabalho do fotógrafo).
* O analista de QA deve conseguir visualizar as imagens, bem como fazer leitura, gerenciamento e eventuais correções nas subpastas organizadas.
* Se a imagem estiver com a qualidade exigida, o analista a aprova e despacha para a etapa de edição.
* Caso haja algum problema (ex: necessidade de repetir a foto), o analista aciona o fluxo de **Retrabalho**.

### 2. Fluxo de Retrabalho (Novo Módulo de QA)
* Deve ser criada uma nova interface/módulo dedicada exclusivamente ao fluxo de QA (essa parte é independente do módulo `S_Foto` que lida com a câmera).
* Ao marcar uma imagem com o status de "Retrabalho", o sistema deve abrir campos de seleção.
* **Geração de Arquivos TXT:** O sistema deverá criar arquivos `.txt` dentro de uma pasta chamada `retrabalho`.
* **Motivos em Checkbox:** A interface deve exibir uma lista de mensagens pré-definidas de erros (ex: "desfoque", "iluminação", etc.) através de checkboxes. O analista selecionará o(s) erro(s) e o sistema escreverá essas informações dentro dos TXTs correspondentes.
* O sistema despacha a informação (imagem + TXT com o motivo) de volta para o fotógrafo.

### 3. Integração de Status (Redmine / S_Foto)
* O módulo `S_Foto` (integrado ao Redmine) deve ser atualizado para escutar e receber as indicações de retrabalho.
* Quando o analista acionar o retrabalho, o Redmine deverá receber uma notificação, e um novo **Status de Retrabalho** deve ser atribuído à tarefa do fotógrafo para que ele possa acompanhar e resolver as pendências.

### 4. Automação de Envio (Robôs / agen_envio)
* No robô de automação (conhecido como `agen_envio`), deve ser configurada uma nova pasta chamada `retrabalho`.
* Quando houver arquivos de retrabalho, o robô deve pescá-los (utilizando, por exemplo, uma aplicação `.jar` dedicada) e dispará-los de volta para o computador da pessoa responsável por corrigir.

### 5. Aprovação e Encaminhamento para Edição
* Ao aprovar as imagens, elas seguem para a Edição. Esta etapa deve herdar a lógica visual e funcional do QA de imagens antigo:
* **Regra de Contagem e Subtração:** O sistema deve calcular quantas fotos de fato precisam ser editadas (recortadas/tratadas) com base no que está fora das subpastas de exceção.
  * Fotos em subpastas específicas (como `RT`, `AP`) ou marcadas com a tag `coding` não vão para a edição padrão. 
  * *Exemplo lógico:* Se há um total de 5 fotos, mas 2 são `coding`, o sistema deve popular o campo informando que apenas 3 fotos serão recortadas/editadas.
* O tipo de edição necessária (ex: "recorte", "mockup") deve ser parametrizado no topo da interface.

**Diretrizes de Implementação:**
* As interfaces de QA podem compartilhar as mesmas características visuais das interfaces anteriores para manter consistência, mas com as funções distintas operando por trás.
* Inicie implementando a criação de pastas e geração estruturada dos TXTs de retrabalho, e avance em seguida para os webhooks/atualizações de status do Redmine.
