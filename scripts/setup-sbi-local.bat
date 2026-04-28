@echo off
setlocal

title SBI - Setup local Git + Firebase

echo.
echo ========================================
echo   SBI - Setup local Git + Firebase
echo ========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Git n'est pas installe ou pas dans le PATH.
  echo Installe Git for Windows puis relance ce script.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe ou pas dans le PATH.
  echo Installe Node.js LTS puis relance ce script.
  pause
  exit /b 1
)

where firebase >nul 2>nul
if errorlevel 1 (
  echo [INFO] Firebase CLI non trouvee. Installation globale...
  call npm install -g firebase-tools
  if errorlevel 1 (
    echo [ERREUR] Installation Firebase CLI impossible.
    pause
    exit /b 1
  )
)

set REPO_URL=https://github.com/Rikka230/SBI.git
set FOLDER=SBI

if exist "%FOLDER%\.git" (
  echo [OK] Dossier SBI deja clone.
  cd /d "%FOLDER%"
) else (
  echo [INFO] Clonage du repo...
  git clone %REPO_URL% %FOLDER%
  if errorlevel 1 (
    echo [ERREUR] Clone Git impossible.
    pause
    exit /b 1
  )
  cd /d "%FOLDER%"
)

echo [INFO] Passage sur la branche avatar-profile-test...
git fetch origin
git checkout avatar-profile-test
if errorlevel 1 (
  echo [ERREUR] Branche avatar-profile-test introuvable.
  pause
  exit /b 1
)

echo [INFO] Installation des dependances locales...
call npm install
if errorlevel 1 (
  echo [ERREUR] npm install a echoue.
  pause
  exit /b 1
)

echo.
echo [INFO] Connexion Firebase si necessaire...
firebase login

echo.
echo [INFO] Selection du projet Firebase SBI...
firebase use sbi-web-4f6b4

echo.
echo ========================================
echo   Setup termine.
echo ========================================
echo.
echo Prochaines commandes utiles :
echo   scripts\deploy-preview.bat
echo   scripts\deploy-hosting.bat
echo.
pause
endlocal
