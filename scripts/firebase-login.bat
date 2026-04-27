@echo off
setlocal

title SBI - Firebase Login

echo.
echo ========================================
echo   SBI - Firebase Login
echo ========================================
echo.

where firebase >nul 2>nul
if errorlevel 1 (
  echo [INFO] Firebase CLI non trouvee. Installation globale...
  call npm install -g firebase-tools
)

firebase login
firebase use sbi-web-4f6b4

echo.
echo [OK] Firebase pret pour SBI.
echo.
pause
endlocal
