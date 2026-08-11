@echo off
REM Atualiza Syndi_qa via Git (GitHub)
REM Terminal executa: atualizacao.bat
REM Parar servidor, fazer git pull e reiniciar

setlocal enabledelayedexpansion
cd /d %~dp0

echo.
echo ====================================
echo  Atualizacao - Syndi_qa Terminal
echo ====================================
echo.

REM Para o servidor se estiver rodando
echo [1/3] Parando servidor...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

REM Faz git pull
echo [2/3] Atualizando via Git...
git pull origin main
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao fazer git pull
    pause
    exit /b 1
)

REM Reinicia o servidor
echo [3/3] Iniciando servidor...
cd c:\syndi_qa
if exist iniciar-server.bat (
    call iniciar-server.bat
) else (
    start node server.js
)

echo.
echo ====================================
echo  Atualizacao concluida!
echo ====================================
echo.
timeout /t 3
