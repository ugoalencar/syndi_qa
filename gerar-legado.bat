@echo off
REM Gera snapshot do legado: marca todos os GTINs existentes em DESTINO como "legado"
REM Assim, GTINs novos que vierem via Pescador serão "pendente"
REM
REM Uso: gerar-legado.bat
REM
REM Requisitos: curl disponível no PATH, servidor rodando em localhost:3001

setlocal enabledelayedexpansion

echo.
echo =========================================
echo  Gerando Snapshot do Legado
echo =========================================
echo.
echo Este script marca todos os GTINs em DESTINO como "legado"
echo Novos GTINs vindo do Pescador serao marcados como "pendente"
echo.

REM Chamar o endpoint
echo Aguardando resposta do servidor...
for /f %%A in ('curl -s -X POST http://localhost:3001/api/legado/scan -H "Content-Type: application/json" -d "{}"') do (
    echo %%A
)

echo.
echo =========================================
echo  Snapshot gerado com sucesso!
echo =========================================
echo.
pause
