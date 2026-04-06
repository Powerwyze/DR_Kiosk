$ErrorActionPreference = 'Stop'

$runValueName = 'RoyalWineCaptureService'
$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $projectRoot 'scripts\start-capture-service.ps1'
$runCommand = "PowerShell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

if (-not (Test-Path $scriptPath)) {
    throw "Missing startup script at $scriptPath"
}

Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $runValueName -Value $runCommand
& (Join-Path $PSScriptRoot 'start-capture-service.ps1')
Write-Output "Automatic startup enabled via HKCU\\Run with value '$runValueName'."
