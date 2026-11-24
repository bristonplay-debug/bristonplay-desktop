@echo off
cd /d "%~dp0"
title BristonPlay - nova versao do notebook
echo Enviando a versao 1.0.1 para o GitHub...
git add -A
git commit -m "Versao 1.0.1: player do YouTube"
git push origin main
if errorlevel 1 (echo PUSH_FALHOU> "_desk101.log" & pause & exit /b)
git tag -f v1.0.1
git push -f origin v1.0.1
if errorlevel 1 (echo TAG_FALHOU> "_desk101.log") else (echo GITHUB_OK> "_desk101.log")
timeout /t 8
