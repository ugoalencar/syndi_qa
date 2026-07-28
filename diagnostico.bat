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
(
for %%A in (server.js syndi_qa.html iniciar-server.bat launcher.js parar.bat) do (
  if exist "%%A" (echo   OK    %%A) else (echo   FALTA %%A)
)
if exist "js\vue.global.js" (
  echo   OK    js\vue.global.js ^(offline^)
) else (
  echo   FALTA js\vue.global.js - a tela vai abrir EM BRANCO sem internet
)
if exist "css\bootstrap-icons.css" (
  echo   OK    css\bootstrap-icons.css
) else (
  echo   FALTA css\bootstrap-icons.css
)
if exist "redmine-config.json" (
  echo   OK    redmine-config.json ^(existe - conteudo NAO exibido^)
) else (
  echo   FALTA redmine-config.json - envio pro Redmine nao vai funcionar
)
) >> %SAIDA% 2>&1
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
