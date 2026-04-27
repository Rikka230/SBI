@echo off
setlocal

title SBI - Firebase Hosting Deploy

echo.
echo ========================================
echo   SBI - Firebase Hosting Deploy LIVE
echo ========================================
echo.

cd /d "%~dp0.."

where firebase >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Firebase CLI introuvable. Lance scripts\setup-sbi-local.bat d'abord.
  pause
  exit /b 1
)

echo [SECURITE] Ce script deploie le Hosting LIVE Firebase.
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
echo [OK] Hosting LIVE deploye.
echo.
pause
endlocal
