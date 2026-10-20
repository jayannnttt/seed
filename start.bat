@echo off
REM SeedSathi - starts backend (port 8000) and frontend (port 5173)
echo Starting SeedSathi backend on http://127.0.0.1:8000 ...
start "SeedSathi API" cmd /k "cd /d %~dp0backend && python run.py"
timeout /t 3 /nobreak >nul
echo Starting SeedSathi frontend on http://localhost:5173 ...
start "SeedSathi Web" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.
echo Backend docs:  http://127.0.0.1:8000/docs
echo Application:   http://localhost:5173
