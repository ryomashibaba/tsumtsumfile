$ErrorActionPreference = 'Stop'
$projectPath = Split-Path $PSScriptRoot -Parent
$env:PORT = '8786'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$serverProcess = $null
try {
    $serverProcess = Start-Process -FilePath $nodePath -ArgumentList 'scripts/serve.mjs' -WorkingDirectory $projectPath -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 150
        $serverProcess.Refresh()
        if ($serverProcess.HasExited) { throw 'Server could not start. Check whether port 8786 is already in use.' }
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8786/tsums/autoChain/definition.js' -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
    }
    if (-not $ready) { throw 'The local game server did not become ready.' }
    Start-Process 'http://127.0.0.1:8786/?tdk=1&tsum=autoChain&sl=6&types=5'
    Write-Host 'AUTO CHAIN SL6 / development only / no saved progress'
    Write-Host 'Click スキル充填, then press Space. Click 最強 OFF for strongest mode.'
    Read-Host 'Press Enter here to stop the local server'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Press Enter to close'
} finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
    }
}
