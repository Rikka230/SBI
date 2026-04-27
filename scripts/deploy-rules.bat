@echo off
setlocal

title SBI - Firebase Rules Deploy

echo.
echo ========================================
echo   SBI - Firebase Rules Deploy
echo ========================================
echo.

cd /d "%~dp0.."

where firebase >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Firebase CLI introuvable. Lance scripts\setup-sbi-local.bat d'abord.
  pause
  exit /b 1
)

echo [SECURITE] Ce script deploie Firestore rules + Storage rules.
echo Il ne deploie PAS le Hosting.
echo.
echo Projet cible : sbi-web-4f6b4
echo.
set /p CONFIRM=Ecris RULES pour confirmer : 
if /I not "%CONFIRM%"=="RULES" (
  echo Annule.
  pause
  exit /b 0
)

firebase deploy --only "firestore:rules,storage" --project sbi-web-4f6b4

if errorlevel 1 (
  echo.
  echo [ERREUR] Deploy rules echoue.
  pause
  exit /b 1
)

echo.
echo [OK] Firestore rules + Storage rules deployees.
echo.
pause
endlocal
