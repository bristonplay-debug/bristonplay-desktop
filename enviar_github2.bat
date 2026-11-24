@echo off
cd /d "%~dp0"
title BristonPlay - enviar para o GitHub
echo ===============================================
echo  BristonPlay - enviando para o GitHub
echo  Se aparecer um CODIGO abaixo, abra no navegador:
echo     https://github.com/login/device
echo  e digite o codigo. Depois volte aqui.
echo ===============================================
echo.
git config --global credential.guiPrompt false
git config --global credential.gitHubAuthModes device
git remote remove origin 2>nul
git remote add origin https://github.com/bristonplay-debug/bristonplay-desktop.git
git push -u origin main
if errorlevel 1 (echo PUSH_FALHOU> "_github2.log" & echo. & echo DEU ERRO - avise o Claude & pause & exit /b)
git tag -f v1.0.0
git push -f origin v1.0.0
if errorlevel 1 (echo TAG_FALHOU> "_github2.log") else (echo GITHUB_OK> "_github2.log")
echo.
echo PRONTO! Pode fechar esta janela.
pause
