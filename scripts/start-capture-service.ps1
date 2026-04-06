$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$serviceScript = Join-Path $projectRoot 'caricature_server.py'
$existingListener = Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue
if ($existingListener) {
    $pids = ($existingListener | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique) -join ','
    Write-Output "capture service already running on port 5001 (PID(s): $pids)"
    exit 0
}

$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        throw "Python not found. Install Python and ensure it's on PATH, or create a .venv in project root."
    }
    $pythonExe = $pythonCommand.Source
}

$process = Start-Process -FilePath $pythonExe `
    -ArgumentList $serviceScript `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -PassThru

Write-Output "capture service started (PID: $($process.Id))"
