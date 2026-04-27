@echo off
setlocal

title SBI - Pull latest branch
cd /d "%~dp0.."

echo.
echo ========================================
echo   SBI - Pull latest avatar-profile-test
echo ========================================
echo.

git fetch origin
git checkout avatar-profile-test
git pull origin avatar-profile-test

if errorlevel 1 (
  echo.
  echo [ERREUR] Pull impossible. Verifie les modifications locales.
  pause
  exit /b 1
)

echo.
echo [OK] Branche a jour.
echo.
pause
endlocal
