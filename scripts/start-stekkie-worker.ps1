param(
    [int]$Port = 8002
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot 'backend'
$python = Join-Path $backendRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    throw "Backend virtual environment not found at $python. Create it before starting Stekkie."
}

Set-Location $backendRoot
& $python -m uvicorn stekkie_worker:app --host 127.0.0.1 --port $Port
