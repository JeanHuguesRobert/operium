# Ensure Supabase CLI on Windows workstation (user-space via Scoop).
# Does NOT require admin. Does NOT remove Program Files residue (optional elevated step).
# Usage:
#   pwsh -NoProfile -File scripts/ops/ensure-supabase-cli.ps1
#   pwsh -NoProfile -File scripts/ops/ensure-supabase-cli.ps1 -Smoke

param(
  [switch]$Smoke
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
  throw "Scoop not found. Install Scoop as the current user first: https://scoop.sh"
}

$buckets = & scoop bucket list 2>&1 | Out-String
if ($buckets -notmatch "(?i)supabase") {
  Write-Step "Adding Scoop bucket: supabase"
  & scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
}

$apps = & scoop list 2>&1 | Out-String
if ($apps -match "(?m)^\s*supabase\b" -or $apps -match "supabase\s") {
  Write-Step "supabase already installed via Scoop — updating"
  & scoop update supabase
} else {
  Write-Step "Installing supabase via Scoop"
  & scoop install supabase
}

Write-Step "which / version"
$cmd = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $cmd) {
  Write-Warning "supabase not on PATH yet. Ensure scoop shims are on PATH: $env:USERPROFILE\scoop\shims"
  Write-Host "Current PATH entries (scoop):"
  $env:PATH -split ';' | Where-Object { $_ -match 'scoop' }
  throw "supabase command not found after install"
}

Write-Host "Source: $($cmd.Source)"
& supabase --version

if ($Smoke) {
  Write-Step "Smoke: projects list (requires existing login or SUPABASE_ACCESS_TOKEN)"
  & supabase projects list
}

Write-Host ""
Write-Host "Done. Prefer this binary over: npm install -g supabase (especially under Program Files)."
Write-Host "Optional elevated cleanup: remove 'C:\Program Files\nodejs\node_modules\supabase' if still present."
if (Test-Path "C:\Program Files\nodejs\node_modules\supabase") {
  Write-Warning "Residue still present: C:\Program Files\nodejs\node_modules\supabase (EPERM without admin)"
}
