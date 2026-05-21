@echo off
title Groei - Mobiel / WiFi mode
echo ============================================
echo  Groei - bouwen voor telefoon (home WiFi)
echo ============================================
echo.

:: Build the frontend
echo Stap 1/2: Frontend bouwen...
cd /d %~dp0groei\groei\frontend
call npm run build:mobile
if %errorlevel% neq 0 (
    echo [FOUT] Build mislukt. Controleer de output hierboven.
    pause
    exit /b 1
)
echo Build klaar!
echo.

:: Start only the backend (it now serves the frontend too)
echo Stap 2/2: Backend starten (serveert ook de app)...
cd /d %~dp0groei\groei\backend
echo.
echo ============================================
echo  App draait op: http://localhost:1415
echo.
echo  Open op je telefoon (zelfde WiFi):
echo  http://192.168.1.139:1415
echo ============================================
echo.
.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 1415
