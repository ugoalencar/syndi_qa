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
