@echo off
title Groei - Plant Care App
echo Starting Groei...
echo.

:: Start backend
start "Groei API" cmd /k "cd /d %~dp0groei\backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Wait a moment for backend to start
timeout /t 2 /nobreak >nul

:: Start frontend
start "Groei Frontend" cmd /k "cd /d %~dp0groei\frontend && npm run dev"

:: Wait for frontend to be ready
timeout /t 3 /nobreak >nul

:: Open in browser
start http://localhost:5173

echo Groei is running!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000
echo.
echo Close this window - the servers will keep running.
echo To stop, close the "Groei API" and "Groei Frontend" windows.
pause
