@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting PokemonHelper server...
echo Frontend: http://127.0.0.1:5173
echo API:      http://127.0.0.1:5174

start "PokemonHelper Server" cmd /k "cd /d ""%~dp0"" && npm run dev"

endlocal
