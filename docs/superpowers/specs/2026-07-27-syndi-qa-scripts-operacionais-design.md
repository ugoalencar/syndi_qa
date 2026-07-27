# Syndi_qa — Sub-projeto 5: Scripts Operacionais

Adaptado de `c:\sphoto-terminais` (iniciar/parar/monitor/diagnostico), mas para **1 processo só**
(sem câmera, sem plataforma Java) — o Syndi_qa é `node server.js` na porta 3001, nada mais.

## 0. Contexto — decomposição maior

1. Peça 1 + correções — retrabalho (mergeado).
2. Sub-projeto 1 — tagging RT/IS/AP/`_coding`/Mockup-Recorte + zoom (mergeado).
3. Sub-projeto 2 — envio pra edição, Responsável/Quantidade via painel do Aprovar (mergeado).
4. Sub-projeto 3 — Agenda de Edição (mergeado).
5. Sub-projeto 4 — aba "QA para Edição" (mergeado).
6. **Este spec** — scripts operacionais.
7. Mecanismo de entrega do TXT de retrabalho pro fotógrafo — depois.

## 1. Decisões confirmadas com o usuário

- Iniciar o Syndi_qa **abre o navegador automaticamente** na tela (`syndi_qa.html`) — não só sobe
  o servidor em segundo plano.
- Inclui **atalho de área de trabalho** (`criar-atalho.vbs`), mesmo padrão do sphoto.
- Inclui **`diagnostico.bat`**, mais simples que o do sphoto (1 processo só).
- `parar.bat` identifica o servidor **pela porta 3001** (`Get-NetTCPConnection -LocalPort 3001
  -State Listen`), confirma que é um `node.exe`, e mata só esse PID — **não** casa por
  nome/linha-de-comando de processo como o `parar.bat` do sphoto faz. Motivo: esta máquina de
  desenvolvimento tem `c:\sphoto`, `c:\sphoto-terminais` e `d:\syndi_qa`, todos com um arquivo
  `server.js` — casar só pelo nome arriscaria matar o processo errado (inclusive o da porta 3000,
  que nunca pode ser tocado). O loop do `iniciar-server.bat` é identificado à parte, ancorado no
  **caminho absoluto desta pasta** (`%~dp0iniciar-server.bat`), não só no nome do arquivo — pelo
  mesmo motivo (sphoto-terminais tem um arquivo de mesmo nome).

## 2. Arquivos novos (raiz de `d:\syndi_qa`)

| Arquivo | Papel |
|---|---|
| `iniciar-server.bat` | Loop de reinício automático do `node server.js` + log (`logs\server.log`) |
| `launcher.js` | Sobe o servidor, espera a porta 3001 responder, abre o navegador (perfil próprio, modo app) em `syndi_qa.html` |
| `iniciar-oculto.vbs` | Roda um `.bat` desta pasta sem janela visível |
| `iniciar-tudo.vbs` | Roda `launcher.js` sem janela — alvo do atalho de área de trabalho |
| `iniciar.bat` | Versão visível (roda `launcher.js` com `pause`) pra diagnosticar quando algo não sobe |
| `criar-atalho.vbs` | Cria atalho "Syndi_qa" na Área de Trabalho, resolve o próprio caminho (funciona em qualquer pasta) |
| `parar.bat` | Encerra só os processos do Syndi_qa (porta 3001 + loop do `iniciar-server.bat`) |
| `monitor.html` | Painel com 1 card: "Servidor" |
| `diagnostico.bat` | Coleta node/porta/processo/logs num arquivo só, abre no Notepad |

## 3. `launcher.js`

Porta enxuta do `c:\sphoto-terminais\launcher.js`, sem as partes de câmera/plataforma Java:

- `iniciarServidor()`: se a porta 3001 já estiver ocupada, loga e não faz nada (idempotente). Senão,
  dispara `iniciar-server.bat` via `iniciar-oculto.vbs` (processo desanexado, sem janela), espera
  até 15s (`esperarPorta(3001, 30, 500)`, mesma função do sphoto) a porta responder.
- `abrirInterface()`: só uma URL (`http://localhost:3001/`), não duas como o sphoto. Usa o mesmo
  `acharNavegador()` (procura Chrome/Edge em caminhos conhecidos) + perfil dedicado
  `.perfil-navegador` + `--app=`. Sem Chrome/Edge instalado, cai pro navegador padrão (`start`).
- Log em `logs\launcher.log`, mesmo formato (`[data/hora] mensagem`).
- `main()`: sobe servidor, se subiu abre a interface, loga "pronto", `process.exit(0)`.

## 4. `parar.bat`

```
powershell -NoProfile -Command "
  $pid3001 = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
             Select-Object -First 1 -ExpandProperty OwningProcess
  if ($pid3001) {
    $p = Get-Process -Id $pid3001 -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $pid3001 -Force }
  }
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*<CAMINHO_ABSOLUTO>\iniciar-server.bat*' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
"
```

`<CAMINHO_ABSOLUTO>` é `%~dp0` do próprio `.bat` (resolve pra `D:\syndi_qa\` ou onde a pasta
estiver copiada). Sem `pause` bloqueante indefinido — mensagem final + `pause` só pra não fechar a
janela sozinho, mesmo padrão do sphoto.

## 5. `monitor.html`

- Reaproveita `css/sphoto.css` (variáveis `--success`/`--danger`/etc., classes `.monitor-card`
  já documentadas no `monitor.html` do sphoto) — sem CSS novo.
- 1 card "Servidor", `fetch(API + '/api/status')` a cada 5s (`setInterval`).
- **Nova rota** `GET /api/status` em `server.js` — responde `{ok:true}`, não toca em nada (mesmo
  padrão do `/api/status/servidor` do sphoto).

## 6. `diagnostico.bat`

Gera `diagnostico.txt` (não modifica nada, só lê):
1. Cabeçalho (data, pasta, máquina, usuário).
2. `node -v`.
3. Arquivos essenciais presentes: `server.js`, `syndi_qa.html`, `js/vue.global.js`,
   `css/bootstrap-icons.css`, e **se `redmine-config.json` existe** (nunca o conteúdo).
4. Porta 3001 (`netstat -ano | findstr ":3001"`).
5. Processo `node.exe` rodando (`tasklist`).
6. Últimas linhas de `logs\server.log` (20) e `logs\launcher.log` (20), se existirem.

Abre automaticamente no Notepad ao final (`start "" notepad diagnostico.txt`), mesmo padrão do
sphoto.

## 7. O que fica de fora

- Perfil dedicado do navegador não é estritamente necessário aqui (o Syndi_qa não usa
  Jetty/WebSocket, então não tem o bug de cookie 8KB que motivou isso no sphoto) — mantido mesmo
  assim por boa prática (janela limpa, sem interferência de outra sessão local).
- Firewall/teste de conectividade de rede (`Test-NetConnection`) — o sphoto testa isso pra
  diagnosticar a Plataforma Java na porta 8099; sem Plataforma aqui, sem necessidade.
- Qualquer mudança nos scripts/comportamento do `c:\sphoto`/`c:\sphoto-terminais` — só leitura de
  referência, nada é copiado/alterado lá.
