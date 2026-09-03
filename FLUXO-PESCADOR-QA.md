# Fluxo Pescador de GTIN + Verificador de OS

**Data:** 2026-09-03  
**Versão:** 1.0  
**Status:** Implementado e Commitado

---

## 📋 Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                   INTERFACE SYNDI_QA.HTML                       │
│                                                                  │
│  Mostrar OS_NONE  →  Expandir  →  [Pescador] [Verificar/Org]   │
└──────────────┬──────────────────────────────────────────────────┘
               │
        ┌──────▼────────────────────────────────────────────────┐
        │  1️⃣  CLICK BOTÃO "PESCADOR DE GTIN"                  │
        │                                                        │
        │  POST /api/abrir-pescador-gtin                        │
        │  → spawn('cmd.exe', 'start pescador-gtin.bat')       │
        │  → Abre novo terminal com CLI do Pescador            │
        └──────┬─────────────────────────────────────────────────┘
               │
        ┌──────▼────────────────────────────────────────────────┐
        │  2️⃣  PESCADOR-GTIN.BAT                               │
        │  → Lê caminhos-locais.json                           │
        │  → Origem: legadoOrigemDir (drive externo)           │
        │  → Destino: legadoDestinoDir (backup QA)             │
        │                                                        │
        │  ╔════════════════════════════════════════════╗      │
        │  ║ PESCADOR DE GTIN v1.0                      ║      │
        │  ║ Status: Copiando Outubro 5/10               ║      │
        │  ║ [████░░░░░░░░░░░░░░] 50%                  ║      │
        │  ║ ✓ 1111111111111 (123 MB)                   ║      │
        │  ║ Tempo: 2m 15s | Velocidade: 18.7 MB/s    ║      │
        │  ║ [P]ause  [Q]uit                            ║      │
        │  ╚════════════════════════════════════════════╝      │
        │                                                        │
        │  Funcionalidades:                                     │
        │  ✓ Valida conectividade (online check)               │
        │  ✓ Varre todas as subpastas de mês da origem         │
        │  ✓ Confronta cada GTIN com destino                  │
        │  ✓ Copia apenas novos (idempotente)                 │
        │  ✓ Pause/Resume se cair conexão                     │
        │  ✓ Atualiza controle-legado.json                    │
        │  ✓ Estado persistido em pescador-estado.json         │
        │                                                        │
        │  RESULTADO:                                           │
        │  ├─ controle-legado.json atualizado                  │
        │  └─ GTINs novos em legadoDestinoDir                  │
        └──────┬─────────────────────────────────────────────────┘
               │
        ┌──────▼────────────────────────────────────────────────┐
        │  3️⃣  USUÁRIO VOLTA À INTERFACE                       │
        │  → Clica "Recarregar OS_NONE"                        │
        │  → syndi_qa exibe novos GTINs com status             │
        │     • [legado] - já existia antes                    │
        │     • [pendente] - trazido pelo Pescador             │
        └──────┬─────────────────────────────────────────────────┘
               │
        ┌──────▼────────────────────────────────────────────────┐
        │  4️⃣  CLICK BOTÃO "VERIFICAR/ORGANIZAR"               │
        │                                                        │
        │  POST /api/verificar-os-none                         │
        │                                                        │
        │  Parâmetros:                                          │
        │  • Origem: legadoDestinoDir (Pescador colocou lá)    │
        │  • Destino: AGCONFERENCIA (onde criar OS)            │
        │  • OCR: cadastroOcrDir (onde copiar JPG comprimido)  │
        │  • Aguardando Confer.: AgConferencia/OS_XX/          │
        └──────┬─────────────────────────────────────────────────┘
               │
        ┌──────▼────────────────────────────────────────────────┐
        │  5️⃣  VERIFICADOR (verificarEOrganizarOsNone)          │
        │                                                        │
        │  A. Escaneia legadoDestinoDir                        │
        │     └─ Encontra GTINs com fotos marcadas OCR         │
        │                                                        │
        │  B. Valida marcas OCR (mín 2)                        │
        │     └─ Confere quais fotos têm marca de OCR          │
        │                                                        │
        │  C. Busca OS no Redmine                              │
        │     └─ Consulta /issues com GTIN                     │
        │                                                        │
        │  D. Se houver OS válida:                             │
        │     ├─ Cria: AgConferencia/OS_123/1111111111111/    │
        │     ├─ Copia JPG comprimido → cadastroOcrDir         │
        │     └─ Atualiza status no Redmine                    │
        │                                                        │
        │  E. Se não houver OS:                                │
        │     └─ Gera aviso no resultado                       │
        │                                                        │
        │  RESULTADO:                                           │
        │  ├─ AgConferencia/OS_123/1111111111111/              │
        │  ├─ Y:\OCR\1111111111111_01.jpg (comprimido)        │
        │  └─ Redmine: Status atualizado                       │
        └──────┬─────────────────────────────────────────────────┘
               │
        ┌──────▼────────────────────────────────────────────────┐
        │  6️⃣  RESULTADO NA TELA                               │
        │                                                        │
        │  Green Alert:  "Movidos: 5 GTINs"                    │
        │  Yellow Alert: "Avisos: 2 GTINs sem OS no Redmine"  │
        │  Red Alert:    "Erros: 1 GTIN com falha"            │
        │                                                        │
        │  Lista detalhada de cada ação                        │
        │  + atualiza fila/agenda automaticamente              │
        └──────────────────────────────────────────────────────┘
```

---

## 🗂️ Caminhos Configuráveis (em syndi_qa → Configurações)

| Campo | Exemplo | Função |
|-------|---------|--------|
| **legadoOrigemDir** | `\\servidor\fotos\Externo` | Origem do Pescador (drive externo) |
| **legadoDestinoDir** | `\\servidor\fotos\QA_Legado` | Onde Pescador copia GTINs |
| **cadastroOcrDir** | `Y:\OCR` | Onde copiar JPG comprimido |
| **syncimgSendBase** | `C:\Apps\SyncIMGSend` | Base do SyncIMG (p/ AgConferencia, etc) |

---

## 📁 Arquivos do Sistema

```
d:\syndi_qa\
├── pescador-gtin.bat              ← Launcher (clique ou execute via interface)
├── pescador-gtin.js               ← CLI interativa (barra de progresso, P/Q)
├── lib/pescador.js                ← Módulo core (cópia, estado, online check)
├── diagnostico-pescador.js        ← Verifica ciclo completo
│
├── syndi_qa.html                  ← Interface (botão Pescador + Verificar)
├── js/qa.js                       ← Funções Vue (abrirPescadorGtin, etc)
├── server.js                      ← Endpoints (/api/abrir-pescador-gtin, etc)
│
├── caminhos-locais.json           ← Configuração (lido por Pescador + server)
├── controle-legado.json           ← Status de cada GTIN (legado vs pendente)
└── pescador-estado.json           ← Recuperação de pause/falha (por sessão)
```

---

## 🔄 Ciclo de Dados

```
1. ORIGEM (drive externo)
   └─ Agosto/1111111111111/ ... Setembro/2222222222222/ ...
        ↓ pescarGtinsComEstado()
        
2. DESTINO (legadoDestinoDir)
   └─ 1111111111111/ (novo, cópia feita)
      2222222222222/ (novo, cópia feita)
      3333333333333/ (já existia, pulado)
        ↓ escreverControleLegado()
        
3. CONTROLE-LEGADO.JSON
   ├─ "1111111111111": { status: "pendente", mesOrigem: "Agosto" }
   ├─ "2222222222222": { status: "pendente", mesOrigem: "Setembro" }
   └─ "3333333333333": { status: "legado" }
        ↓ listarOsNone()
        
4. SYNDI_QA EXIBE
   ├─ [pendente] 1111111111111  ← novo, pronto pro Verificador
   ├─ [pendente] 2222222222222  ← novo, pronto pro Verificador
   └─ [legado] 3333333333333    ← antigo, filtro opcional
        ↓ verificarOsNone()
        
5. AGCONFERENCIA (resultado)
   ├─ OS_123/1111111111111/      ← criada
   ├─ OS_456/2222222222222/      ← criada
   └─ Y:\OCR\1111111111111_01.jpg (JPG comprimido)
```

---

## ⚙️ Configuração e Testes

### 1. Verificar Ciclo Completo
```bash
cd d:\syndi_qa
node diagnostico-pescador.js
```

Mostra:
- ✓ Origem (quantos GTINs)
- ✓ Destino (quantos copiados)
- ✓ JSON (legado vs pendente)
- ✓ Como syndi_qa vê

### 2. Configurar Caminhos
- Abra syndi_qa.html
- Clique "Configurações" (ícone ⚙️)
- Preencha os 4 caminhos
- Clique "Salvar"

### 3. Executar Pescador
- Opção A: Clique botão "Pescador de GTIN" na interface
- Opção B: Terminal → `pescador-gtin.bat`

### 4. Recarregar e Verificar
- Clique "Recarregar OS_NONE"
- Confirme que novos GTINs aparecem com [pendente]
- Clique "Verificar/Organizar" para criar OS

---

## 🛡️ Segurança e Confiabilidade

✅ **Online Check** - Valida conectividade a cada GTIN (timeout 2s)  
✅ **Pause/Resume** - Estado persistido em pescador-estado.json  
✅ **Idempotente** - Rodar 2x = resultado idêntico (não duplica)  
✅ **Validação** - Verifica origem/destino/OCR antes de iniciar  
✅ **Logs** - Histórico em logs/pescador.log (se implementado)  
✅ **Recover** - Se falhar, Pescador sabe de onde continuar  

---

## 📊 Status de Implementação

| Item | Status | Evidência |
|------|--------|-----------|
| Pescador (lib/pescador.js) | ✅ | Módulo completo com pause/resume |
| CLI (pescador-gtin.js + .bat) | ✅ | Interface com barra de progresso |
| Integração UI (syndi_qa.html) | ✅ | Botão "Pescador" + "Verificar" |
| Endpoint (/api/abrir-pescador-gtin) | ✅ | Abre .bat em novo terminal |
| Caminhos configuráveis | ✅ | Modal Settings → caminhos-locais.json |
| Verificador aponta ao Pescador | ✅ | verificarOsNone() usa legadoDestinoDir |
| JSON controle-legado.json | ✅ | Status legado/pendente |
| Diagnóstico | ✅ | diagnostico-pescador.js valida ciclo |

---

## 🚀 Próximos Passos (Opcionais)

- [ ] Adicionar logs em `logs/pescador.log`
- [ ] Criar atalho do desktop para `pescador-gtin.bat`
- [ ] Notificação quando Pescador termina (opcional)
- [ ] Dashboard de histórico de sessões
- [ ] Webhook Redmine quando OS criada

---

## 📞 Comandos Rápidos

```bash
# Verificar ciclo
node d:\syndi_qa\diagnostico-pescador.js

# Rodar Pescador via terminal (alternativa)
d:\syndi_qa\pescador-gtin.bat

# Ver logs (se implementado)
tail -f d:\syndi_qa\logs\pescador.log

# Testar Verificador
curl -X POST http://localhost:3001/api/verificar-os-none
```

---

**Implementado em:** 2026-09-03  
**Commits:** 8ff8ae4, 51f9f18, c32a8b9  
**Próxima atualização:** Quando novo requisito aparecer
