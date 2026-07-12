@echo off
setlocal
cd /d "%~dp0"
set PORT=8000
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:%PORT%/index.html
  py -3 -m http.server %PORT% --bind 127.0.0.1
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:%PORT%/index.html
  python -m http.server %PORT% --bind 127.0.0.1
  exit /b
)
echo Python est requis pour lancer le serveur local.
pause
