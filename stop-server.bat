@echo off
setlocal

cd /d "%~dp0"

echo Stopping PokemonHelper server processes...

taskkill /FI "WINDOWTITLE eq PokemonHelper Server*" /T /F >nul 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = (Resolve-Path '.').Path; $names = @('node.exe','esbuild.exe'); $procs = Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name -and $_.CommandLine -and $_.CommandLine.Contains($root) }; if (-not $procs) { Write-Host 'No PokemonHelper server processes found.'; exit 0 }; foreach ($proc in $procs) { Write-Host ('Stopping PID {0}: {1}' -f $proc.ProcessId, $proc.Name); Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Done.
endlocal
