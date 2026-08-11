@echo off
REM Atualiza Syndi_qa do terminal a partir de Y:\Syndi_qa
REM Este script para o servidor, copia arquivos novos e reinicia

setlocal enabledelayedexpansion
cd /d %~dp0

echo.
echo ====================================
echo  Atualizacao - Syndi_qa Terminal
echo ====================================
echo.

REM Para o servidor se estiver rodando
echo [1/4] Parando servidor...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

REM Copia arquivos da Y: para c:
echo [2/4] Copiando arquivos de Y:\Syndi_qa para c:\syndi_qa...
robocopy Y:\Syndi_qa c:\syndi_qa /MIR /NFL /NDL /NJH /NJS /nc /ns /np >nul

REM Verifica se copiou
if %errorlevel% leq 3 (
    echo [3/4] Arquivos copiados com sucesso!
) else (
    echo [ERRO] Falha ao copiar arquivos
    pause
    exit /b 1
)

REM Reinicia o servidor
echo [4/4] Iniciando servidor...
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
