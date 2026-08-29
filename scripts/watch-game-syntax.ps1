$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$target = Join-Path $workspace "game.js"

if (-not (Test-Path -LiteralPath $target)) {
  Write-Host "[syntax] ERROR: game.js not found: $target"
  exit 1
}

function Get-PreferredNodePath {
  $candidates = @()
  $fixedPrimaryNode = "C:\Users\ryoma\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

  if (Test-Path -LiteralPath $fixedPrimaryNode) {
    $candidates += $fixedPrimaryNode
  }

  try {
    $bundled = Get-ChildItem -Path "C:\Program Files\WindowsApps" -Filter "OpenAI.Codex_*" -Directory -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending
    foreach ($dir in $bundled) {
      $nodePath = Join-Path $dir.FullName "app\resources\node.exe"
      if (Test-Path -LiteralPath $nodePath) {
        $candidates += $nodePath
      }
    }
  } catch {
    # Fallback handled below.
  }

  try {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) {
      $candidates += $cmd.Source
    }
  } catch {
    # No node on PATH.
  }

  $seen = @{}
  foreach ($path in $candidates) {
    if (-not $seen.ContainsKey($path)) {
      $seen[$path] = $true
      return $path
    }
  }
  return $null
}

function Invoke-SyntaxCheck {
  param([string]$FilePath)

  if (-not $script:resolvedNodePath) {
    $script:resolvedNodePath = Get-PreferredNodePath
    if ($script:resolvedNodePath) {
      Write-Host "[syntax] node: $script:resolvedNodePath"
    }
  }
  $nodePath = $script:resolvedNodePath
  if (-not $nodePath) {
    Write-Host "[syntax] ERROR: node.exe not found"
    return
  }

  $output = & $nodePath --check $FilePath 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[syntax] OK game.js"
    return
  }

  Write-Host "[syntax] ERROR game.js"
  if ($output) {
    $output | ForEach-Object { Write-Host $_ }
  }
}

Write-Host "[syntax] Watching game.js (save to check)"
Invoke-SyntaxCheck -FilePath $target

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = Split-Path -Parent $target
$watcher.Filter = Split-Path -Leaf $target
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

$debounceMs = 180
$script:lastRunAt = [DateTime]::MinValue

$action = {
  $now = Get-Date
  if (($now - $script:lastRunAt).TotalMilliseconds -lt $debounceMs) {
    return
  }
  $script:lastRunAt = $now
  Start-Sleep -Milliseconds 60
  Invoke-SyntaxCheck -FilePath $target
}

Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $action | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $action | Out-Null

while ($true) {
  Wait-Event -Timeout 1 | Out-Null
}
