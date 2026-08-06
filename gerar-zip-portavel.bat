@echo off
setlocal EnableExtensions

rem Gera um ZIP portatil do projeto atual, sem dependencias instaladas,
rem caches, historico git ou arquivos locais/secretos.
rem Execute este arquivo na raiz do projeto que deseja empacotar.

for %%I in ("%CD%") do set "PROJECT_NAME=%%~nxI"
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"

set "ROOT_DIR=%CD%"
set "TEMP_DIR=%TEMP%\%PROJECT_NAME%-portable-%STAMP%"
set "ZIP_PATH=%ROOT_DIR%\%PROJECT_NAME%-portable-%STAMP%.zip"
set "README_PATH=%TEMP_DIR%\README-PORTABLE.txt"

echo.
echo ========================================
echo   Gerador de ZIP portatil
echo ========================================
echo Projeto: %PROJECT_NAME%
echo Origem : %ROOT_DIR%
echo Saida  : %ZIP_PATH%
echo.

if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%" >nul 2>nul
if errorlevel 1 (
    echo ERRO: nao foi possivel criar pasta temporaria:
    echo %TEMP_DIR%
    exit /b 1
)

echo Copiando arquivos necessarios...
robocopy "%ROOT_DIR%" "%TEMP_DIR%" /E /R:2 /W:1 ^
    /XD ".git" "node_modules" "preview-cache" "logs" ".perfil-navegador" ".claude" ".superpowers" "graphify-out" ^
    /XF ".env" "caminhos-locais.json" "redmine-config.json" "credencial.txt" "credenciais.txt" "valores.txt" "diagnostico.txt" "*.zip" >nul

rem Robocopy usa codigos 0-7 para sucesso/avisos; 8+ e erro real.
if errorlevel 8 (
    echo ERRO: robocopy falhou ao copiar o projeto.
    rmdir /s /q "%TEMP_DIR%" >nul 2>nul
    exit /b 1
)

(
    echo # Pacote portatil - %PROJECT_NAME%
    echo.
    echo Este ZIP foi gerado por gerar-zip-portavel.bat.
    echo.
    echo ## Como usar no destino
    echo.
    echo 1. Descompacte o ZIP em uma pasta local.
    echo 2. Abra um terminal nessa pasta.
    echo 3. Se for projeto Node.js, rode:
    echo.
    echo    npm install
    echo    npm start
    echo.
    echo ## Arquivos que NAO vao no pacote
    echo.
    echo - node_modules/ ^(recriar com npm install^)
    echo - .git/ ^(historico do repositorio^)
    echo - preview-cache/, logs/, caches e perfis locais
    echo - .env, caminhos-locais.json, redmine-config.json e arquivos de credenciais
    echo.
    echo ## Observacao para o Syndi_qa
    echo.
    echo Se este pacote for do Syndi_qa, recrie no destino, se necessario:
    echo.
    echo - caminhos-locais.json, para apontar syncimgSendBase da maquina local
    echo - redmine-config.json, com baseUrl/apiKey do Redmine
    echo.
    echo Esses arquivos sao locais/secretos e ficam fora do ZIP de proposito.
) > "%README_PATH%"

if exist "%ZIP_PATH%" del "%ZIP_PATH%" >nul 2>nul

echo Compactando...
powershell -NoProfile -Command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath '%ZIP_PATH%' -Force"
if errorlevel 1 (
    echo ERRO: falha ao criar ZIP.
    rmdir /s /q "%TEMP_DIR%" >nul 2>nul
    exit /b 1
)

rmdir /s /q "%TEMP_DIR%" >nul 2>nul

echo.
echo ZIP criado com sucesso:
echo %ZIP_PATH%
echo.
echo No destino, descompacte e leia README-PORTABLE.txt.
echo.
pause
endlocal
