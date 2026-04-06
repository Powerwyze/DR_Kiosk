$runValueName = 'RoyalWineCaptureService'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

if (Get-ItemProperty -Path $runKey -Name $runValueName -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $runKey -Name $runValueName
    Write-Output "Removed startup entry '$runValueName'."
} else {
    Write-Output "Startup entry '$runValueName' not found."
}
