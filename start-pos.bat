@echo off
title Cehizlik POS Server
color 0A

echo ===================================================
echo             Cehizlik POS is starting...
echo ===================================================
echo.
echo Zəhmət olmasa gözləyin, server işə düşür...
echo Sayt avtomatik olaraq brauzerdə açılacaq.
echo.
echo Bu pəncərəni BAĞLAMAYIN! (Bağlasanız sayt işləməyəcək)
echo.

:: Saytı 5 saniyə sonra avtomatik açmaq üçün arxa planda komanda göndəririk
start /b cmd /c "timeout /t 5 >nul & start http://localhost:3000"

:: Qovluğa keçirik və pnpm dev işə salırıq
cd /d "%~dp0"
pnpm dev
