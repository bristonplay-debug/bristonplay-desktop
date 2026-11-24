@echo off
cd /d "%~dp0"
title BristonPlay - nova versao do notebook
echo Enviando a versao 1.0.3 para o GitHub...
git add -A
git commit -m "Versao 1.0.3: destaques por categoria"
git push origin main
if errorlevel 1 (echo PUSH_FALHOU> "_desk103.log" & pause & exit /b)
git tag -f v1.0.3
git push -f origin v1.0.3
if errorlevel 1 (echo TAG_FALHOU> "_desk103.log") else (echo GITHUB_OK> "_desk103.log")
timeout /t 8
