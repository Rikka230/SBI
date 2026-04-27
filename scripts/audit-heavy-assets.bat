@echo off
setlocal enabledelayedexpansion

title SBI - Audit heavy assets
cd /d "%~dp0.."

echo.
echo ========================================
echo   SBI - Audit fichiers lourds public
echo ========================================
echo.

if not exist "public" (
  echo [ERREUR] Dossier public introuvable.
  pause
  exit /b 1
)

set LIMIT_MB=3
set /a LIMIT_BYTES=%LIMIT_MB%*1024*1024
set FOUND=0

echo Fichiers dans public superieurs a %LIMIT_MB% Mo :
echo.

for /r "public" %%F in (*) do (
  set SIZE=%%~zF
  if !SIZE! GEQ %LIMIT_BYTES% (
    set FOUND=1
    set /a SIZE_MB=!SIZE!/1024/1024
    echo [LOURD] !SIZE_MB! Mo - %%F
  )
)

if "%FOUND%"=="0" (
  echo [OK] Aucun fichier superieur a %LIMIT_MB% Mo detecte dans public.
)

echo.
echo Rappel : videos, gros fonds, grosses images et exports sources doivent aller dans Storage/CDN/Vimeo/YouTube.
echo.
pause
endlocal
