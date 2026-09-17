@echo off
title Touba Quincaillerie Sarr & Frere
cd /d "%~dp0"

echo ============================================
echo   Touba Quincaillerie Sarr & Frere - demarrage en cours...
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERREUR : Node.js n'est pas installe sur cet ordinateur.
    echo Telechargez-le sur https://nodejs.org puis relancez ce fichier.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Premiere installation, patientez quelques instants...
    call npm install
    echo.
)

echo L'application va s'ouvrir dans votre navigateur.
echo Pour arreter l'application, fermez cette fenetre noire.
echo.

set APP_PASSWORD=modou2002
start "" http://localhost:3001
node server.js

pause
