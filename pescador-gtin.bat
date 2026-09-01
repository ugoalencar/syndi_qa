@echo off
REM pescador-gtin.bat
REM Interface CLI para Pescador de GTIN com barra de progresso, pause/resume e online check

setlocal enabledelayedexpansion

REM Detecta a pasta do script
set SCRIPT_DIR=%~dp0

REM Chama o Node.js com pescador-gtin.js
node "%SCRIPT_DIR%pescador-gtin.js" %*

exit /b !errorlevel!
