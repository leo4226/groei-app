@echo off
title Floreren - Plant Care App
echo Starting Floreren...
echo.

:: Start backend
start "Floreren API" cmd /k "cd /d %~dp0backend && .venv\Scripts\python -m uvicorn main:app --reload --host 0.0.0.0 --port 1415"

:: Wait a moment for backend to start
timeout /t 2 /nobreak >nul

:: Start frontend
start "Floreren Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Wait for frontend to be ready
timeout /t 3 /nobreak >nul

:: Open in browser
start http://localhost:5173

echo Floreren is running!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:1415
echo.
echo Close this window - the servers will keep running.
echo To stop, close the "Floreren API" and "Floreren Frontend" windows.
pause
