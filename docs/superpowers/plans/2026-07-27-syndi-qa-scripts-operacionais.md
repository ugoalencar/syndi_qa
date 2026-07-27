# Scripts Operacionais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Syndi_qa the same start/stop/monitor/diagnose operational scripts `c:\sphoto-terminais` has, adapted for a single-process app (no camera, no Java platform) — a desktop shortcut that starts the server and opens the browser, a safe stop script, a status monitor page, and a one-file diagnostic collector.

**Architecture:** Every file here is a direct, minimally-adapted port of the equivalent file in `c:\sphoto-terminais` (read-only reference — nothing there is touched). The one deliberate behavioral change is `parar.bat`: instead of matching processes by name/command-line substring (unsafe on this dev machine, which runs three differently-pathed systems that each have a file called `server.js`), it identifies the server by which process is listening on port 3001, and the restart-loop by the absolute path of this folder's `iniciar-server.bat`. A new trivial `GET /api/status` route in `server.js` backs `monitor.html`, mirroring sphoto's `/api/status/servidor`.

**Tech Stack:** Windows Batch (`.bat`), VBScript (`.vbs`), Node.js core only (`launcher.js`, the new server route), plain HTML/CSS/JS (`monitor.html`, reusing `css/sphoto.css`) — no build step, no new dependency, matching the rest of the project.

## Global Constraints

- No npm install, no new dependency, no CDN, no build step.
- Port 3001 is this project's own port. Port 3000 belongs to a completely separate, unrelated production system on this machine and must NEVER be touched, queried for a kill target, or otherwise interacted with by any script in this plan.
- `parar.bat` must identify the server process by port (not by process name or command-line substring matching) — this dev machine runs three different systems (`c:\sphoto`, `c:\sphoto-terminais`, `d:\syndi_qa`) that each have a file named `server.js`; name-based matching could kill the wrong one.
- Nothing in `c:\sphoto-terminais` or `c:\sphoto` may be read as anything other than reference — no file in those folders is ever modified by this plan.
- `redmine-config.json`'s existence may be checked; its contents must never be printed/logged anywhere (including by `diagnostico.bat`).

---

### Task 1: Start cluster — `iniciar-server.bat`, `launcher.js`, `iniciar-oculto.vbs`, `iniciar-tudo.vbs`, `iniciar.bat`, `criar-atalho.vbs`

**Files:**
- Create: `iniciar-server.bat`, `launcher.js`, `iniciar-oculto.vbs`, `iniciar-tudo.vbs`, `iniciar.bat`, `criar-atalho.vbs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a working `node launcher.js` that starts `server.js` (via the restart-loop in `iniciar-server.bat`, launched hidden via `iniciar-oculto.vbs`) and opens `http://localhost:3001/` in a browser app-window; a desktop shortcut created by double-clicking `criar-atalho.vbs`.

- [ ] **Step 1: Create `iniciar-server.bat`**

```batch
@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
:loop
node server.js >> logs\server.log 2>&1
echo [%date% %time%] server.js encerrou - reiniciando em 3s >> logs\server.log
timeout /t 3 /nobreak >nul
goto loop
```

- [ ] **Step 2: Create `launcher.js`**

```js
// Syndi_qa - Executor unico: sobe o servidor (node), espera a porta 3001 ficar de pe, e
// abre a interface (syndi_qa.html) numa janela de app. Adaptado do launcher.js do
// c:\sphoto-terminais, sem as partes de camera/plataforma Java (o Syndi_qa e so 1 processo).
// Uso: node launcher.js   (no Windows, via iniciar-tudo.vbs pra rodar sem janela)

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const WIN = process.platform === 'win32';
// Caminho absoluto do cmd.exe - dependendo de quem lancou o node (ex.: shells
// alternativos), "cmd.exe" pode nao estar no PATH e o spawn falha com ENOENT.
const CMD = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
const LOGS = path.join(BASE, 'logs');
if (!fs.existsSync(LOGS)) fs.mkdirSync(LOGS);

function log(msg) {
    const linha = '[' + new Date().toLocaleString('pt-BR') + '] ' + msg;
    console.log(linha);
    try { fs.appendFileSync(path.join(LOGS, 'launcher.log'), linha + '\n'); } catch (e) {}
}

function portaOcupada(porta) {
    return new Promise((resolve) => {
        const s = net.connect({ port: porta, host: '127.0.0.1', timeout: 600 });
        s.on('connect', () => { s.destroy(); resolve(true); });
        s.on('error', () => resolve(false));
        s.on('timeout', () => { s.destroy(); resolve(false); });
    });
}

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function esperarPorta(porta, tentativas, intervaloMs) {
    for (let i = 0; i < tentativas; i++) {
        if (await portaOcupada(porta)) return true;
        await esperar(intervaloMs);
    }
    return false;
}

// Dispara um processo desanexado e sem janela - o launcher termina logo em
// seguida, mas o servidor continua rodando por conta propria.
function rodarOculto(comando, args) {
    const p = spawn(comando, args, {
        cwd: BASE,
        detached: true,
        windowsHide: true,
        stdio: 'ignore'
    });
    p.unref();
}

// Via iniciar-oculto.vbs: o windowsHide do spawn nao esconde a janela de forma
// confiavel quando combinado com detached - o WshShell.Run com flag 0 do VBS esconde
// de verdade. O VBS ja usa caminho absoluto internamente.
function rodarBatOculto(nomeArquivo) {
    const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
    rodarOculto(wscript, [path.join(BASE, 'iniciar-oculto.vbs'), nomeArquivo]);
}

async function iniciarServidor() {
    if (await portaOcupada(3001)) {
        log('servidor: ja rodando (porta 3001)');
        return true;
    }
    log('servidor: iniciando...');
    if (WIN) {
        // iniciar-server.bat tem o loop de reinicio automatico
        rodarBatOculto('iniciar-server.bat');
    } else {
        rodarOculto('sh', ['-c', 'while true; do node server.js >> logs/server.log 2>&1; sleep 3; done']);
    }
    const ok = await esperarPorta(3001, 30, 500);
    log(ok ? 'servidor: OK' : 'servidor: NAO subiu - veja logs/server.log');
    return ok;
}

function acharNavegador() {
    const candidatos = WIN ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ] : [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
    ];
    for (const c of candidatos) {
        try { if (c && fs.existsSync(c)) return c; } catch (e) {}
    }
    return null;
}

async function abrirInterface() {
    const url = 'http://localhost:3001/';
    const navegador = acharNavegador();
    if (navegador) {
        // Perfil proprio do Syndi_qa (pasta .perfil-navegador) - janela limpa, sem
        // interferencia de abas/cookies/favoritos do navegador pessoal do analista.
        const perfil = path.join(BASE, '.perfil-navegador');
        rodarOculto(navegador, [
            '--user-data-dir=' + perfil,
            '--app=' + url,
            '--no-first-run',
            '--no-default-browser-check'
        ]);
    } else if (WIN) {
        rodarOculto(CMD, ['/c', 'start', '', url]);
    } else {
        rodarOculto('xdg-open', [url]);
    }
    log('interface aberta: ' + url);
}

(async function main() {
    log('=== Syndi_qa executor (' + process.platform + ') ===');
    const servidorOk = await iniciarServidor();
    if (servidorOk) {
        await abrirInterface();
    } else {
        log('interface NAO aberta - servidor nao subiu');
    }
    log('=== pronto ===');
    process.exit(0);
})();
```

- [ ] **Step 3: Create `iniciar-oculto.vbs`**

```vbscript
' Executa um .bat desta mesma pasta sem nenhuma janela visivel - usado no lugar de
' "start" quando o monitor.html ja cobre a visibilidade de status.
' Uso: wscript iniciar-oculto.vbs nome-do-arquivo.bat

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pastaScript = fso.GetParentFolderName(WScript.ScriptFullName)

nomeArquivo = WScript.Arguments(0)

WshShell.Run "cmd /c """ & pastaScript & "\" & nomeArquivo & """", 0, False
```

- [ ] **Step 4: Create `iniciar-tudo.vbs`**

```vbscript
' Roda o executor unico (launcher.js) sem janela de terminal - e o alvo do atalho
' "Syndi_qa" da area de trabalho. Resolve a propria pasta, entao continua funcionando
' se a pasta for copiada pra outro lugar/computador.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pastaScript = fso.GetParentFolderName(WScript.ScriptFullName)

comando = "cmd /c cd /d """ & pastaScript & """ && (if not exist logs mkdir logs) && node launcher.js >> logs\launcher-boot.log 2>&1"
WshShell.Run comando, 0, False
```

- [ ] **Step 5: Create `iniciar.bat`**

```batch
@echo off
rem Mesmo fluxo do atalho da area de trabalho, so que com janela visivel
rem mostrando o progresso - util pra diagnosticar quando algo nao sobe.
cd /d "%~dp0"
node launcher.js
pause
```

- [ ] **Step 6: Create `criar-atalho.vbs`**

```vbscript
' Cria um atalho "Syndi_qa" na Area de Trabalho apontando para ESTE pacote,
' onde quer que ele tenha sido copiado. Basta dar um duplo-clique neste arquivo.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

pasta = fso.GetParentFolderName(WScript.ScriptFullName)
desktop = sh.SpecialFolders("Desktop")

Set lnk = sh.CreateShortcut(desktop & "\Syndi_qa.lnk")
lnk.TargetPath = "wscript.exe"
lnk.Arguments = """" & pasta & "\iniciar-tudo.vbs"""
lnk.WorkingDirectory = pasta
lnk.IconLocation = "C:\Windows\System32\imageres.dll,105"
lnk.Description = "Inicia o Syndi_qa (servidor e interface)"
lnk.Save

MsgBox "Pronto! O atalho 'Syndi_qa' foi criado na Area de Trabalho." & vbCrLf & _
       "Use ele pra ligar o Syndi_qa.", _
       64, "Syndi_qa"
```

- [ ] **Step 7: Ignore generated runtime artifacts**

In `.gitignore`, current content:

```
node_modules/
caminhos-locais.json
redmine-config.json
.claude/
graphify-out/
```

Change to (adds the folders/files these scripts create at runtime — none of them are project source):

```
node_modules/
caminhos-locais.json
redmine-config.json
.claude/
graphify-out/
logs/
.perfil-navegador/
diagnostico.txt
```

- [ ] **Step 8: Verify `launcher.js` syntax**

Run: `cd D:\syndi_qa && node --check launcher.js`
Expected: no output (exit code 0).

- [ ] **Step 9: Verify the full start flow end-to-end**

Port 3001 is this project's own port — never touch port 3000 (unrelated production system on this machine).

1. Confirm nothing is already listening on 3001: `netstat -ano | grep :3001` should show nothing.
2. Run `cd D:\syndi_qa && node launcher.js` and wait for it to exit (it should exit on its own within ~15s per `esperarPorta`'s timeout, after starting the server and attempting to open a browser — if no Chrome/Edge is found and this is a headless/CI-like environment, that's fine, the log will say so).
3. Check `logs\launcher.log` was created and contains lines like `servidor: iniciando...` and `servidor: OK`.
4. Check `logs\server.log` was created.
5. Confirm the server actually came up: `netstat -ano | grep :3001` should now show a `LISTENING` entry.
6. `curl -s http://localhost:3001/api/fila` should return `{"ok":true,...}` (pre-existing route, confirms the server launched by the loop is the real `server.js`).
7. Stop everything cleanly: find the PID listening on 3001 (`netstat -ano | grep :3001`) and the `cmd.exe` PID running `iniciar-server.bat` (`wmic process where "commandline like '%iniciar-server.bat%'" get processid` or equivalent), kill both. Confirm `netstat -ano | grep :3001` shows nothing listening afterward. (`parar.bat`, built in Task 3, will do this properly — for this task's verification, a manual kill is fine since `parar.bat` doesn't exist yet.)
8. If a browser window opened (`.perfil-navegador` folder was created), you may leave that folder — it's gitignored (Step 7) and harmless; closing the window it may have opened is optional but tidy.

- [ ] **Step 10: Commit**

```bash
cd D:\syndi_qa
git add iniciar-server.bat launcher.js iniciar-oculto.vbs iniciar-tudo.vbs iniciar.bat criar-atalho.vbs .gitignore
git commit -m "feat: adiciona scripts de inicializacao (iniciar-server.bat, launcher.js, atalho)"
```

---

### Task 2: Monitor — `GET /api/status` + `monitor.html`

**Files:**
- Modify: `server.js`
- Create: `monitor.html`

**Interfaces:**
- Produces: `GET /api/status` → `{ok: true}` (200), always, no side effects. `monitor.html` served statically, polls that route every 5s.

- [ ] **Step 1: Add the `GET /api/status` route**

In `server.js`, add this route right after the `OPTIONS` handler block (after its closing `}` and before the `GET /api/fila` block):

```js

    // So confirma que o server.js esta de pe (se respondeu, esta rodando) - usado
    // pelo monitor.html, nao toca em nenhum outro processo/porta.
    if (req.method === 'GET' && req.url === '/api/status') {
        enviarJson(res, 200, { ok: true });
        return;
    }
```

- [ ] **Step 2: Create `monitor.html`**

```html
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Syndi_qa - Monitor</title>

    <script>
        if (window.location.protocol === 'file:') {
            window.location.href = 'http://localhost:3001/monitor.html';
        }
    </script>

    <link href="css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/bootstrap-icons.css">
    <link rel="stylesheet" href="css/sphoto.css">

    <style>
        body {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .monitor-wrap {
            width: 100%;
            max-width: 420px;
            padding: 24px;
        }
        .monitor-titulo {
            text-align: center;
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 24px;
        }
        .monitor-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
        }
        .monitor-card {
            background-color: var(--bg-card);
            border: 2px solid var(--border);
            border-radius: 12px;
            padding: 28px 16px;
            text-align: center;
            transition: border-color 0.3s ease;
        }
        .monitor-card.ok { border-color: var(--success); }
        .monitor-card.erro { border-color: var(--danger); }
        .monitor-card.checando { border-color: var(--warning); }

        .monitor-icone {
            font-size: 2.5rem;
            margin-bottom: 12px;
        }
        .monitor-card.ok .monitor-icone { color: var(--success); }
        .monitor-card.erro .monitor-icone { color: var(--danger); }
        .monitor-card.checando .monitor-icone { color: var(--warning); }

        .monitor-nome {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .monitor-status {
            font-size: 0.95rem;
            color: var(--text-muted);
        }
        .monitor-card.ok .monitor-status { color: var(--success); }
        .monitor-card.erro .monitor-status { color: var(--danger); }

        .monitor-detalhe {
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-top: 6px;
            min-height: 1.2em;
        }
        .monitor-atualizado {
            text-align: center;
            color: var(--text-muted);
            font-size: 0.8rem;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="monitor-wrap">
        <div class="monitor-titulo">Syndi_qa - Monitor</div>
        <div class="monitor-grid">
            <div class="monitor-card checando" id="cardServer">
                <div class="monitor-icone"><i class="bi bi-hdd-network-fill"></i></div>
                <div class="monitor-nome">Servidor</div>
                <div class="monitor-status" id="statusServer">verificando...</div>
                <div class="monitor-detalhe" id="detalheServer"></div>
            </div>
        </div>
        <div class="monitor-atualizado" id="ultimaChecagem"></div>
    </div>

    <script>
        function aplicarStatus(prefixo, ok, textoOk, textoErro, detalhe) {
            var card = document.getElementById('card' + prefixo);
            var status = document.getElementById('status' + prefixo);
            var detalheEl = document.getElementById('detalhe' + prefixo);
            card.className = 'monitor-card ' + (ok ? 'ok' : 'erro');
            status.textContent = ok ? textoOk : textoErro;
            detalheEl.textContent = detalhe || '';
        }

        function checarServer() {
            fetch('http://localhost:3001/api/status')
                .then(function() {
                    aplicarStatus('Server', true, 'OK', 'Offline');
                })
                .catch(function() {
                    aplicarStatus('Server', false, 'OK', 'Offline', 'server.js não respondeu');
                });
        }

        function checarTudo() {
            checarServer();
            document.getElementById('ultimaChecagem').textContent =
                'Última checagem: ' + new Date().toLocaleTimeString('pt-BR');
        }

        checarTudo();
        setInterval(checarTudo, 5000);
    </script>
</body>
</html>
```

- [ ] **Step 3: Verify manually**

Port 3001 is this project's own port — never touch port 3000.

1. Start the server: `cd D:\syndi_qa && node server.js` (background).
2. `curl -s http://localhost:3001/api/status` → expected `{"ok":true}`.
3. `curl -s http://localhost:3001/monitor.html | grep -o "Syndi_qa - Monitor"` → expected prints the title text, confirming the file is served.
4. Stop the server (find the PID listening on 3001 via `netstat -ano | grep :3001`, kill only that PID). Confirm `netstat -ano | grep :3001` shows nothing afterward.

- [ ] **Step 4: Commit**

```bash
cd D:\syndi_qa
git add server.js monitor.html
git commit -m "feat: adiciona GET /api/status e monitor.html"
```

---

### Task 3: `parar.bat`

**Files:**
- Create: `parar.bat`

**Interfaces:**
- Produces: a `.bat` that, when run, stops exactly the Syndi_qa server (identified by whatever process is listening on port 3001, confirmed to be `node.exe`) and the `iniciar-server.bat` restart-loop (identified by the absolute path of this folder), and nothing else.

- [ ] **Step 1: Create `parar.bat`**

```batch
@echo off
rem Encerra o Syndi_qa: o servidor (identificado pela PORTA 3001, nao pelo nome do
rem processo) e o loop do iniciar-server.bat (identificado pelo CAMINHO ABSOLUTO desta
rem pasta). Casar so por nome/linha-de-comando NAO e seguro aqui: esta maquina roda
rem c:\sphoto, c:\sphoto-terminais e este pacote ao mesmo tempo, e os tres tem um
rem arquivo chamado "server.js" - um parar.bat que so olhasse o nome do arquivo
rem poderia matar o processo errado (inclusive o da porta 3000, que nunca pode ser
rem tocado). Ver docs/superpowers/specs/2026-07-27-syndi-qa-scripts-operacionais-design.md.
echo Encerrando o Syndi_qa...

powershell -NoProfile -Command "$pid3001 = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; if ($pid3001) { $p = Get-Process -Id $pid3001 -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $pid3001 -Force } }; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*%~dp0iniciar-server.bat*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }"

echo.
echo Syndi_qa encerrado. Pode fechar esta janela.
pause
```

- [ ] **Step 2: Verify the real kill behavior end-to-end**

This is the one script in this plan whose actual behavior (not just syntax) must be proven, since a mistake here risks killing the wrong process. Port 3001 is this project's own port — never touch port 3000 (unrelated production system on this machine) at any point in this verification.

1. Confirm nothing is listening on 3001: `netstat -ano | grep :3001` shows nothing.
2. Start the server via the real restart-loop (not a bare `node server.js`, so the loop-kill half of `parar.bat` has something real to find): `cd D:\syndi_qa && cmd /c start /b iniciar-server.bat` (or run `iniciar-server.bat` directly in a background shell).
3. Wait ~2s, then confirm the loop is really up: `netstat -ano | grep :3001` shows `LISTENING`, and `wmic process where "commandline like '%iniciar-server.bat%'" get processid` (or an equivalent PowerShell query) shows a `cmd.exe` PID.
4. Run `parar.bat` (since it has an interactive `pause` at the end, either pipe input to it or run it with a mechanism that doesn't block — e.g. `echo. | cmd /c parar.bat`).
5. Confirm BOTH are gone afterward: `netstat -ano | grep :3001` shows nothing, and the `cmd.exe` PID from step 3 is no longer in `tasklist`.
6. Separately, confirm the port-ownership check doesn't misfire: temporarily start something harmless-but-real on port 3001 that is NOT `node.exe` (e.g. `node -e "require('http').createServer((q,r)=>r.end('x')).listen(3001)"` counts as node, so instead use `python -m http.server 3001` if Python is available, or skip this specific sub-check and rely on the `$p.ProcessName -eq 'node'` guard read in code review) — if you cannot easily produce a non-node listener, skip this micro-test and just note in your report that the guard exists in the code (`if ($p -and $p.ProcessName -eq 'node')`) and was verified by inspection, not by a live non-node listener.
7. **Safety net:** if step 5 shows anything still listening on 3001 or the loop's `cmd.exe` still in `tasklist` after running `parar.bat` (i.e. `parar.bat` itself has a bug), do NOT leave it running — manually kill the leftover PID(s) via `taskkill /PID <pid> /F` before finishing this task, and report the discrepancy as a concern. Never end this task with a stray process still up on port 3001.

- [ ] **Step 3: Commit**

```bash
cd D:\syndi_qa
git add parar.bat
git commit -m "feat: adiciona parar.bat (identifica o servidor pela porta, nao pelo nome do processo)"
```

---

### Task 4: `diagnostico.bat`

**Files:**
- Create: `diagnostico.bat`

**Interfaces:**
- Produces: a `.bat` that writes `diagnostico.txt` (Node version, essential files present/missing, port 3001 status, whether `node.exe` is running, tails of `logs\server.log`/`logs\launcher.log`) and opens it in Notepad. Read-only — never starts, stops, or modifies anything.

- [ ] **Step 1: Create `diagnostico.bat`**

```batch
@echo off
REM Coleta TUDO que se precisa saber pra diagnosticar o Syndi_qa que nao sobe, e joga
REM num arquivo unico (diagnostico.txt) pra mandar pra analise. So LE - nao muda nada,
REM nao inicia nada, nao apaga nada. Pode rodar a vontade.
cd /d "%~dp0"
set SAIDA=diagnostico.txt

echo ============================================ > %SAIDA%
echo  SYNDI_QA - DIAGNOSTICO >> %SAIDA%
echo  Gerado em: %DATE% %TIME% >> %SAIDA%
echo  Pasta: %~dp0 >> %SAIDA%
echo  Maquina: %COMPUTERNAME%  ^|  Usuario: %USERNAME% >> %SAIDA%
echo ============================================ >> %SAIDA%
echo. >> %SAIDA%

echo --- [1] NODE (o Servidor depende dele) --- >> %SAIDA%
node -v >> %SAIDA% 2>&1
if errorlevel 1 echo   ^>^>^> NODE NAO ENCONTRADO NO PATH >> %SAIDA%
echo. >> %SAIDA%

echo --- [2] ARQUIVOS ESSENCIAIS (a copia veio completa?) --- >> %SAIDA%
for %%A in (server.js syndi_qa.html iniciar-server.bat launcher.js parar.bat) do (
  if exist "%%A" (echo   OK    %%A) else (echo   FALTA %%A)
) >> %SAIDA% 2>&1
if exist "js\vue.global.js" (echo   OK    js\vue.global.js ^(offline^)) else (echo   FALTA js\vue.global.js - a tela vai abrir EM BRANCO sem internet) >> %SAIDA% 2>&1
if exist "css\bootstrap-icons.css" (echo   OK    css\bootstrap-icons.css) else (echo   FALTA css\bootstrap-icons.css) >> %SAIDA% 2>&1
if exist "redmine-config.json" (echo   OK    redmine-config.json ^(existe - conteudo NAO exibido^)) else (echo   FALTA redmine-config.json - envio pro Redmine nao vai funcionar) >> %SAIDA% 2>&1
echo. >> %SAIDA%

echo --- [3] PORTA (3001 = servidor) --- >> %SAIDA%
netstat -ano | findstr ":3001" >> %SAIDA% 2>&1
if errorlevel 1 echo   nada escutando na 3001 >> %SAIDA%
echo. >> %SAIDA%

echo --- [4] PROCESSO RODANDO --- >> %SAIDA%
tasklist /fi "imagename eq node.exe" 2>&1 | findstr /i "node.exe" >> %SAIDA%
if errorlevel 1 echo   node.exe NAO esta rodando >> %SAIDA%
echo. >> %SAIDA%

echo --- [5] LOG DO SERVIDOR (server.log) - AQUI COSTUMA ESTAR A RESPOSTA --- >> %SAIDA%
if exist "logs\server.log" (
  powershell -NoProfile -Command "Get-Content 'logs\server.log' -Tail 20" >> %SAIDA% 2>&1
) else (
  echo   logs\server.log NAO EXISTE - o servidor talvez nem tenha rodado ainda >> %SAIDA%
)
echo. >> %SAIDA%

echo --- [6] LOG DO LAUNCHER (launcher.log) --- >> %SAIDA%
if exist "logs\launcher.log" (
  powershell -NoProfile -Command "Get-Content 'logs\launcher.log' -Tail 20" >> %SAIDA% 2>&1
) else (
  echo   logs\launcher.log nao existe >> %SAIDA%
)
echo. >> %SAIDA%

echo ============================================ >> %SAIDA%
echo  FIM >> %SAIDA%
echo ============================================ >> %SAIDA%

echo.
echo   Diagnostico gerado em: %~dp0%SAIDA%
echo   Abra o arquivo e mande o conteudo pra analise.
echo.
start "" notepad %SAIDA%
```

- [ ] **Step 2: Verify manually**

1. Run `cd D:\syndi_qa && diagnostico.bat`. This will open Notepad at the end (`start "" notepad diagnostico.txt`) — it does not block the `.bat` from finishing, but Notepad will stay open until closed.
2. Confirm `diagnostico.txt` was created and contains all 6 numbered sections (`[1]` through `[6]`), the Node version, and either "OK" or "FALTA" for each essential file.
3. Confirm `redmine-config.json`'s line says only `OK ... (existe - conteudo NAO exibido)` or `FALTA ...` — never its actual contents.
4. Close the Notepad window that opened (`taskkill /IM notepad.exe /F` if you can't close it interactively, or find its specific PID and kill only that one if other Notepad windows might be open for unrelated reasons).
5. `diagnostico.txt` is now gitignored (Task 1 Step 7) — confirm `git status --porcelain` does NOT list it.

- [ ] **Step 3: Commit**

```bash
cd D:\syndi_qa
git add diagnostico.bat
git commit -m "feat: adiciona diagnostico.bat"
```

---

## Post-plan: update memory

After this plan is fully implemented and merged, update
`C:\Users\Ugo Alencar\.claude\projects\c--sphoto\memory\syndi_qa_project.md` (and `MEMORY.md` if
needed): mark the operational scripts sub-project as built, and note the `parar.bat`
port-based-identification decision (useful precedent if `sphoto`/`sphoto-terminais` ever need the
same fix, though this plan does not touch those projects). This is a memory-system update, not a
code task — do it in the finishing conversation, not as a plan step.
