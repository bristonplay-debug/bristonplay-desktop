@echo off
cd /d "%~dp0"
title BristonPlay - nova versao do notebook
git add -A
git commit -m "Versao 1.0.4: sinopse dos filmes e series"
git push origin main
if errorlevel 1 (echo PUSH_FALHOU> "_desk104.log" & exit /b)
git tag -f v1.0.4
git push -f origin v1.0.4
if errorlevel 1 (echo TAG_FALHOU> "_desk104.log") else (echo GITHUB_OK> "_desk104.log")
