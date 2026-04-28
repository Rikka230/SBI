@echo off
setlocal

title SBI - Firebase Hosting Deploy MAIN LIVE

echo.
echo ========================================
echo   SBI - Firebase Hosting Deploy MAIN LIVE
echo ========================================
echo.

cd /d "%~dp0.."

where firebase >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Firebase CLI introuvable. Lance scripts\setup-sbi-local.bat d'abord.
  pause
  exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current') do set BRANCH=%%B

echo [INFO] Branche locale : %BRANCH%
if /I not "%BRANCH%"=="main" (
  echo.
  echo [STOP] Le deploy LIVE est autorise uniquement depuis main.
  echo Pour une branche de travail, utilise scripts\deploy-preview.bat.
  echo.
  pause
  exit /b 1
)

echo [SECURITE] Ce script deploie le Hosting LIVE Firebase depuis main.
echo Il ne deploie PAS Firestore rules ni Storage rules.
echo.
set /p CONFIRM=Ecris DEPLOY pour confirmer : 
if /I not "%CONFIRM%"=="DEPLOY" (
  echo Annule.
  pause
  exit /b 0
)

firebase deploy --only hosting --project sbi-web-4f6b4

if errorlevel 1 (
  echo.
  echo [ERREUR] Deploy live echoue.
  pause
  exit /b 1
)

echo.
echo [OK] Hosting LIVE deploye depuis main.
echo.
pause
endlocal
