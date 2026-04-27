@echo off
setlocal

title SBI - Firebase Preview Deploy

echo.
echo ========================================
echo   SBI - Firebase Preview Deploy
echo ========================================
echo.

cd /d "%~dp0.."

where firebase >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Firebase CLI introuvable. Lance scripts\setup-sbi-local.bat d'abord.
  pause
  exit /b 1
)

set CHANNEL=avatar-profile-test

echo [INFO] Branche locale :
git branch --show-current

echo.
echo [INFO] Deploy preview Firebase Hosting channel : %CHANNEL%
firebase hosting:channel:deploy %CHANNEL% --expires 7d --project sbi-web-4f6b4

if errorlevel 1 (
  echo.
  echo [ERREUR] Deploy preview echoue.
  pause
  exit /b 1
)

echo.
echo [OK] Preview Firebase deployee.
echo Copie l'URL affichee au-dessus.
echo.
pause
endlocal
