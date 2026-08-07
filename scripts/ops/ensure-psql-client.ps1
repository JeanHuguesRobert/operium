# Ensure psql is on PATH from a user-space location (OP-BUG-004 residual hygiene).
# Scoop's postgresql package may report "Install failed" while still unpacking
# binaries under apps/postgresql/<ver>/pgsql/bin. We do not start a server.
#
# Usage:
#   pwsh -NoProfile -File scripts/ops/ensure-psql-client.ps1
#   pwsh -NoProfile -File scripts/ops/ensure-psql-client.ps1 -DryRun

param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$localBin = Join-Path $env:USERPROFILE ".local\bin"

function Write-Step([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

function Find-PsqlExe {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) {
    # Prefer real .exe when shim already works
    if ($cmd.Source -like "*.exe") { return $cmd.Source }
  }

  $scoopApps = Join-Path $env:USERPROFILE "scoop\apps\postgresql"
  if (Test-Path $scoopApps) {
    $found = Get-ChildItem -Path $scoopApps -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '\\pgsql\\bin\\psql\.exe$' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}

function Ensure-UserPathFront([string]$dir) {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($null -eq $userPath) { $userPath = "" }
  $parts = @($userPath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $dirN = $dir.TrimEnd('\')
  $rest = @($parts | Where-Object { $_.TrimEnd('\').ToLowerInvariant() -ne $dirN.ToLowerInvariant() })
  $nextStr = (@($dirN) + $rest) -join ';'
  $alreadyFirst = ($parts.Count -gt 0) -and ($parts[0].TrimEnd('\').ToLowerInvariant() -eq $dirN.ToLowerInvariant())
  if ($alreadyFirst) { return }
  if ($DryRun) {
    Write-Host "Would lead User PATH with $dirN"
    return
  }
  [Environment]::SetEnvironmentVariable("Path", $nextStr, "User")
  $env:PATH = "$dirN;$env:PATH"
  Write-Host "Persisted User PATH lead: $dirN"
}

Write-Step "Locate psql.exe"
$exe = Find-PsqlExe
if (-not $exe) {
  throw "psql.exe not found. Install with: scoop install postgresql (client only; do not start server)"
}
Write-Host "Found: $exe"

Write-Step "User-space shims in $localBin"
if (-not $DryRun) {
  New-Item -ItemType Directory -Force -Path $localBin | Out-Null
}

$cmdShim = Join-Path $localBin "psql.cmd"
$ps1Shim = Join-Path $localBin "psql.ps1"
$cmdBody = "@echo off`r`n`"$exe`" %*`r`n"
$ps1Body = "& '$($exe -replace "'", "''")' @args`r`nexit `$LASTEXITCODE`r`n"

if ($DryRun) {
  Write-Host "Would write $cmdShim and $ps1Shim"
} else {
  Set-Content -Path $cmdShim -Value $cmdBody -Encoding ascii
  Set-Content -Path $ps1Shim -Value $ps1Body -Encoding utf8
  Ensure-UserPathFront $localBin
  $env:PATH = "$localBin;$env:PATH"
}

Write-Step "Verify"
$resolved = Get-Command psql -ErrorAction SilentlyContinue
$version = $null
if ($resolved) {
  $version = (& psql --version 2>&1 | Out-String).Trim()
}

[pscustomobject]@{
  schema = "operium.ensure-psql-client.v1"
  dry_run = [bool]$DryRun
  psql_exe = $exe
  shim_cmd = $cmdShim
  shim_ps1 = $ps1Shim
  resolved = if ($resolved) { $resolved.Source } else { $null }
  version = $version
  server_started = $false
  note = "Client only. Do not register or start a local PostgreSQL service for JHN cloud migrations."
} | ConvertTo-Json -Depth 4
