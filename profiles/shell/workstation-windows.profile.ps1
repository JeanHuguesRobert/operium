#Requires -Version 5.1
<#
.SYNOPSIS
  Operium-managed PowerShell profile for the Windows corpus workstation.

.DESCRIPTION
  Sourced from the thin user $PROFILE after cd into C:\tweesic.
  Authority: Operium (git). Do not put secrets here — use inseme/.env and
  ~/.cogentia/secrets/.

  Interactive shells only. Scheduled tasks / gateway use -NoProfile and must
  not depend on this file.

.NOTES
  profile_id: shell.workstation-windows.v1
  See: docs/workstation-shell-profile.md
#>

# Idempotent: safe if dotted twice
if ($env:TWEESIC_WORKSPACE_PROFILE_LOADED -eq '1') {
    return
}
$env:TWEESIC_WORKSPACE_PROFILE_LOADED = '1'

$script:WorkspaceRoot = if ($env:TWEESIC_ROOT) {
    $env:TWEESIC_ROOT
} else {
    'C:\tweesic'
}

# --- Corpus registry (single source of truth) ---
# Prefer JeanHuguesRobert full registry; do not reintroduce a root .cogentia.json subset.
$registryCandidate = Join-Path $script:WorkspaceRoot 'JeanHuguesRobert'
if (Test-Path (Join-Path $registryCandidate '.cogentia.json')) {
    $env:COGENTIA_REGISTRY = $registryCandidate
} elseif (Test-Path (Join-Path $registryCandidate 'JeanHuguesRobert\.cogentia.json')) {
    $env:COGENTIA_REGISTRY = Join-Path $registryCandidate 'JeanHuguesRobert'
}

# --- Convenience locations ---
$env:TWEESIC_ROOT = $script:WorkspaceRoot
$env:OPERIUM_ROOT = Join-Path $script:WorkspaceRoot 'operium'
$env:COGENTIA_ROOT = Join-Path $script:WorkspaceRoot 'cogentia'
$env:INSEME_ROOT = Join-Path $script:WorkspaceRoot 'inseme'

# --- User-space tooling PATH (OP-BUG-004) ---
# Prefer Scoop shims + user npm global + ~/.local/bin over Program Files\nodejs
# admin globals (EPERM / stale netlify). Does not delete admin installs.
$script:UserToolPaths = @(
    (Join-Path $env:USERPROFILE 'scoop\shims'),
    (Join-Path $env:USERPROFILE '.npm-global'),
    (Join-Path $env:USERPROFILE '.local\bin')
) | Where-Object { Test-Path $_ }
foreach ($toolPath in ($script:UserToolPaths | Select-Object -Unique)) {
    if ($env:PATH -notlike "$toolPath;*") {
        $env:PATH = "$toolPath;$env:PATH"
    }
}

# --- Helpers (global so they survive the profile scope) ---
function global:Set-TweesicLocation {
    param([string]$SubPath = '')
    $root = if ($env:TWEESIC_ROOT) { $env:TWEESIC_ROOT } else { 'C:\tweesic' }
    $target = if ($SubPath) { Join-Path $root $SubPath } else { $root }
    if (-not (Test-Path $target)) {
        Write-Warning "Path not found: $target"
        return
    }
    Set-Location $target
}

function global:Invoke-Operium {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $bin = Join-Path $env:OPERIUM_ROOT 'bin\operium.js'
    if (-not (Test-Path $bin)) {
        Write-Error "operium not found at $bin"
        return
    }
    & node $bin @Args
}

function global:Invoke-Cogentia {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $bin = Join-Path $env:COGENTIA_ROOT 'scripts\cogentia.js'
    if (-not (Test-Path $bin)) {
        Write-Error "cogentia.js not found at $bin"
        return
    }
    & node $bin @Args
}

Set-Alias -Name tweesic -Value Set-TweesicLocation -Scope Global -Force
Set-Alias -Name operium -Value Invoke-Operium -Scope Global -Force
Set-Alias -Name cogentia -Value Invoke-Cogentia -Scope Global -Force

# --- Prompt hint (optional, lightweight) ---
if (-not (Get-Variable -Name TweesicPromptHooked -Scope Global -ErrorAction SilentlyContinue)) {
    $global:TweesicPromptHooked = $true
    $global:TweesicPriorPrompt = $function:prompt
    function global:prompt {
        $loc = (Get-Location).Path
        $mark = if ($env:TWEESIC_ROOT -and $loc -like "$($env:TWEESIC_ROOT)*") { 'tweesic' } else { '' }
        if ($mark -and $env:COGENTIA_REGISTRY) {
            Write-Host "[$mark|reg]" -NoNewline -ForegroundColor DarkCyan
            Write-Host ' ' -NoNewline
        } elseif ($mark) {
            Write-Host "[$mark]" -NoNewline -ForegroundColor DarkCyan
            Write-Host ' ' -NoNewline
        }
        if ($global:TweesicPriorPrompt) {
            & $global:TweesicPriorPrompt
        } else {
            "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) "
        }
    }
}

Write-Host "Operium workspace profile loaded (COGENTIA_REGISTRY=$env:COGENTIA_REGISTRY)" -ForegroundColor DarkGray
