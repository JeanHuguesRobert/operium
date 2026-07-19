# Ensure Supabase CLI on Windows workstation (user-space).
# Strategy order:
#   1) Already on PATH and working
#   2) Reuse npx cache binary -> %USERPROFILE%\.local\bin
#   3) Scoop install (may be slow / flaky on GitHub)
# Does NOT require admin. Program Files residue cleanup is optional elevated.
# Usage:
#   pwsh -NoProfile -File scripts/ops/ensure-supabase-cli.ps1
#   pwsh -NoProfile -File scripts/ops/ensure-supabase-cli.ps1 -Smoke

param(
  [switch]$Smoke
)

$ErrorActionPreference = "Stop"
$localBin = Join-Path $env:USERPROFILE ".local\bin"
$localExe = Join-Path $localBin "supabase.exe"

function Write-Step([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

function Ensure-UserPath([string]$dir) {
  if ($env:PATH -notlike "*$dir*") { $env:PATH = "$dir;$env:PATH" }
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$dir*") {
    [Environment]::SetEnvironmentVariable("Path", "$dir;$userPath", "User")
    Write-Host "Persisted User PATH: $dir"
  }
}

function Test-SupabaseOk {
  try {
    $cmd = Get-Command supabase -ErrorAction SilentlyContinue
    if (-not $cmd) { return $false }
    & $cmd.Source --version 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0 -or $?)
  } catch { return $false }
}

Write-Step "Check existing supabase on PATH"
if (Test-SupabaseOk) {
  $cmd = Get-Command supabase
  Write-Host "Already OK: $($cmd.Source)"
  & supabase --version
} else {
  Write-Step "Try npx-cache binary -> $localExe"
  $npxExe = Get-ChildItem (Join-Path $env:LOCALAPPDATA "npm-cache\_npx") -Recurse -Filter "supabase.exe" -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending |
    Select-Object -First 1
  if ($npxExe) {
    New-Item -ItemType Directory -Force -Path $localBin | Out-Null
    Copy-Item -LiteralPath $npxExe.FullName -Destination $localExe -Force
    Ensure-UserPath $localBin
    Write-Host "Installed from npx cache: $($npxExe.FullName)"
    & $localExe --version
  } elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
    Write-Step "Fallback Scoop install (may take long)"
    $buckets = & scoop bucket list 2>&1 | Out-String
    if ($buckets -notmatch "(?i)supabase") {
      & scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
    }
    & scoop install supabase/supabase
    Ensure-UserPath (Join-Path $env:USERPROFILE "scoop\shims")
  } else {
    throw "No supabase on PATH, no npx cache binary, no Scoop. Install Scoop or run: npx supabase --version once, then re-run this script."
  }
}

if (-not (Test-SupabaseOk)) {
  throw "supabase still not usable after ensure steps"
}

$cmd = Get-Command supabase
Write-Host "Source: $($cmd.Source)"
& supabase --version

if ($Smoke) {
  Write-Step "Smoke: projects list (requires existing login or SUPABASE_ACCESS_TOKEN)"
  & supabase projects list
}

Write-Host ""
Write-Host "Done. Prefer user-space binary over: npm install -g supabase under Program Files."
if (Test-Path "C:\Program Files\nodejs\node_modules\supabase") {
  Write-Warning "Admin residue: C:\Program Files\nodejs\node_modules\supabase — remove in elevated PowerShell when ready."
}
