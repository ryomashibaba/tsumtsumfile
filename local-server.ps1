$projectRoot = Split-Path -Parent $PSCommandPath
$serverScript = Join-Path $projectRoot 'scripts\serve.mjs'
$previousPort = $env:PORT
$serverExitCode = 0

try {
  $env:PORT = '8000'
  & node $serverScript
  $serverExitCode = $LASTEXITCODE
} finally {
  if ($null -eq $previousPort) {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  } else {
    $env:PORT = $previousPort
  }
}

exit $serverExitCode
