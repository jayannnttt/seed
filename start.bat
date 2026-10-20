@echo off
REM Seed Vault - starts backend (port 8000) and frontend (port 5173)
echo Starting Seed Vault backend on http://127.0.0.1:8000 ...
start "Seed Vault API" cmd /k "cd /d %~dp0backend && python run.py"
timeout /t 3 /nobreak >nul
echo Starting Seed Vault frontend on http://localhost:5173 ...
start "Seed Vault Web" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.
echo Backend docs:  http://127.0.0.1:8000/docs
echo Application:   http://localhost:5173
