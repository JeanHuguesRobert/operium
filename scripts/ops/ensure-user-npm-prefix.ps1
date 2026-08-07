# Ensure npm global prefix is user-space and precedes Program Files on User PATH.
# Does not require admin. Does not delete Program Files packages (optional elevated cleanup).
# Usage:
#   pwsh -NoProfile -File scripts/ops/ensure-user-npm-prefix.ps1
#   pwsh -NoProfile -File scripts/ops/ensure-user-npm-prefix.ps1 -DryRun

param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$userPrefix = Join-Path $env:USERPROFILE ".npm-global"
$scoopShims = Join-Path $env:USERPROFILE "scoop\shims"
$localBin = Join-Path $env:USERPROFILE ".local\bin"

function Write-Step([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

function Ensure-UserPathFront([string]$dir) {
  if (-not (Test-Path -LiteralPath $dir)) {
    if ($DryRun) {
      Write-Host "Would create directory: $dir"
    } else {
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
  }

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($null -eq $userPath) { $userPath = "" }
  $parts = @(
    $userPath -split ';' |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ -ne '' }
  )
  $dirN = $dir.TrimEnd('\')
  $rest = @(
    $parts | Where-Object {
      $_.TrimEnd('\').ToLowerInvariant() -ne $dirN.ToLowerInvariant()
    }
  )
  $next = @($dirN) + $rest
  $nextStr = ($next -join ';')

  $alreadyFirst = ($parts.Count -gt 0) -and (
    $parts[0].TrimEnd('\').ToLowerInvariant() -eq $dirN.ToLowerInvariant()
  )
  if ($alreadyFirst) {
    Write-Host "User PATH already leads with: $dirN"
    return
  }

  if ($DryRun) {
    Write-Host "Would set User PATH lead: $dirN"
    return
  }

  [Environment]::SetEnvironmentVariable("Path", $nextStr, "User")
  $env:PATH = "$dirN;$env:PATH"
  Write-Host "Persisted User PATH lead: $dirN"
}

Write-Step "npm prefix (user-space)"
$current = (& npm config get prefix 2>$null | Out-String).Trim()
Write-Host "Current prefix: $current"

if ($current -ne $userPrefix) {
  if ($DryRun) {
    Write-Host "Would: npm config set prefix $userPrefix"
  } else {
    & npm config set prefix $userPrefix
    Write-Host "Set npm prefix -> $userPrefix"
  }
} else {
  Write-Host "npm prefix already user-space"
}

Write-Step "User PATH precedence (user tools before Machine Program Files)"
# Lead order: scoop shims, user npm-global, .local\bin
if (Test-Path $localBin) { Ensure-UserPathFront $localBin }
Ensure-UserPathFront $userPrefix
if (Test-Path $scoopShims) { Ensure-UserPathFront $scoopShims }

$sessionLead = @($scoopShims, $userPrefix, $localBin) | Where-Object { Test-Path $_ }
foreach ($d in ($sessionLead | Select-Object -Unique)) {
  $env:PATH = "$d;$env:PATH"
}

Write-Step "Verify"
$prefixNow = (& npm config get prefix 2>$null | Out-String).Trim()
$netlify = Get-Command netlify -ErrorAction SilentlyContinue
$supabase = Get-Command supabase -ErrorAction SilentlyContinue

[pscustomobject]@{
  schema = "operium.ensure-user-npm-prefix.v1"
  dry_run = [bool]$DryRun
  npm_prefix = $prefixNow
  npm_prefix_user_space = ($prefixNow -eq $userPrefix)
  netlify_source = if ($netlify) { $netlify.Source } else { $null }
  supabase_source = if ($supabase) { $supabase.Source } else { $null }
  note = "New consoles pick up User PATH. OpenSSH -NoProfile may still inherit old service env until refresh."
} | ConvertTo-Json -Depth 4
