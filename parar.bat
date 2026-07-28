@echo off
rem Encerra o Syndi_qa: primeiro o loop do iniciar-server.bat (identificado pelo CAMINHO
rem ABSOLUTO desta pasta), DEPOIS o servidor na porta 3001 (identificado pela porta, nao
rem pelo nome do processo, e so se for node.exe) - NESSA ORDEM. Matar o servidor antes do
rem loop deixa uma janela de ate 3s em que o loop reinicia um node.exe novo sem que este
rem script perceba (a porta e consultada so uma vez, no fim, com o loop ja morto - assim
rem nao ha mais ninguem pra reiniciar nada). Bug real encontrado em teste ao vivo durante
rem o desenvolvimento deste script - ver o relatorio da Task 3 no plano.
rem
rem Casar so por nome/linha-de-comando NAO e seguro aqui: esta maquina roda c:\sphoto,
rem c:\sphoto-terminais e este pacote ao mesmo tempo, e os tres tem um arquivo chamado
rem "server.js" - um parar.bat que so olhasse o nome do arquivo poderia matar o processo
rem errado (inclusive o da porta 3000, que nunca pode ser tocado).
rem Ver docs/superpowers/specs/2026-07-27-syndi-qa-scripts-operacionais-design.md.
echo Encerrando o Syndi_qa...

powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*%~dp0iniciar-server.bat*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }; Start-Sleep -Milliseconds 300; $pid3001 = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; if ($pid3001) { $p = Get-Process -Id $pid3001 -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $pid3001 -Force } }"

echo.
echo Syndi_qa encerrado. Pode fechar esta janela.
pause
