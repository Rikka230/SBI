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
set IMAGE_WARN_KB=600
set /a IMAGE_WARN_BYTES=%IMAGE_WARN_KB%*1024
set FOUND_HEAVY=0
set FOUND_IMAGES=0

echo Fichiers dans public superieurs a %LIMIT_MB% Mo :
echo.

for /r "public" %%F in (*) do (
  set SIZE=%%~zF
  if !SIZE! GEQ %LIMIT_BYTES% (
    set FOUND_HEAVY=1
    set /a SIZE_MB=!SIZE!/1024/1024
    echo [LOURD] !SIZE_MB! Mo - %%F
  )
)

if "%FOUND_HEAVY%"=="0" (
  echo [OK] Aucun fichier superieur a %LIMIT_MB% Mo detecte dans public.
)

echo.
echo Images a surveiller dans public superieures a %IMAGE_WARN_KB% Ko :
echo.

for /r "public" %%F in (*.png *.jpg *.jpeg *.webp *.avif) do (
  set SIZE=%%~zF
  if !SIZE! GEQ %IMAGE_WARN_BYTES% (
    set FOUND_IMAGES=1
    set /a SIZE_KB=!SIZE!/1024
    echo [IMAGE] !SIZE_KB! Ko - %%F
  )
)

if "%FOUND_IMAGES%"=="0" (
  echo [OK] Aucune image superieure a %IMAGE_WARN_KB% Ko detectee.
)

echo.
echo Rappel : videos, gros fonds, grosses images et exports sources doivent aller dans Storage/CDN/Vimeo/YouTube.
echo Les assets publics non versionnes par hash doivent rester raisonnables pour eviter le cache lourd.
echo.
pause
endlocal
