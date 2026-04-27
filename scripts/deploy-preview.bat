@echo off
setlocal enabledelayedexpansion

title SBI - Firebase Preview Deploy Branch

echo.
echo ========================================
echo   SBI - Firebase Preview Deploy BRANCH
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
if "%BRANCH%"=="" set BRANCH=preview

set CHANNEL=%BRANCH:/=-%
set CHANNEL=%CHANNEL:_=-%
set CHANNEL=%CHANNEL:.=-%

echo [INFO] Branche locale : %BRANCH%
echo [INFO] Channel Firebase : %CHANNEL%
echo.
echo [INFO] Deploy preview Firebase Hosting...
firebase hosting:channel:deploy %CHANNEL% --expires 7d --project sbi-web-4f6b4

if errorlevel 1 (
  echo.
  echo [ERREUR] Deploy preview echoue.
  pause
  exit /b 1
)

echo.
echo [OK] Preview Firebase deployee pour la branche %BRANCH%.
echo Copie l'URL affichee au-dessus.
echo.
pause
endlocal
