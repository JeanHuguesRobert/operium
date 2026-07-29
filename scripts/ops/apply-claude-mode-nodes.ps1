# Apply Operium claude-mode on Fractanet nodes that run Claude Code.
# Desired-state authority: operium/docs/claude-code-mode.md + profiles.
#
# Usage (from trusted workstation with Tailscale SSH aliases):
#   .\operium\scripts\ops\apply-claude-mode-nodes.ps1 -Mode pro
#   .\operium\scripts\ops\apply-claude-mode-nodes.ps1 -Mode zai -Nodes @('i7-thinkpad-jhr')
#   .\operium\scripts\ops\apply-claude-mode-nodes.ps1 -Mode status -CheckOnly
#
# Local PC is always applied first when -IncludeLocal is set (default).
# Remote: rsync/scp is NOT required if operium is already mirrored; we run node on the node.

param(
    [ValidateSet('pro', 'zai', 'status', 'doctor')]
    [string]$Mode = 'status',

    # Nodes that typically host Claude Code (workstations / capable mobiles).
    # fracta VPS is public Guide — not a Claude Code interactive host by default.
    [string[]]$Nodes = @('i7-thinkpad-jhr'),

    [switch]$IncludeLocal = $true,
    [switch]$CheckOnly,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'

$OperiumRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$ScriptRel = 'scripts/ops/claude-mode.js'
$LocalScript = Join-Path $OperiumRoot $ScriptRel

if (-not (Test-Path $LocalScript)) {
    throw "Missing $LocalScript — run from a checkout that includes Operium."
}

function Invoke-LocalClaudeMode {
    param([string]$Cmd)
    Write-Host "==> local ($env:COMPUTERNAME)" -ForegroundColor Cyan
    $args = @($LocalScript, $Cmd)
    if ($Json) { $args += '--json' }
    if ($CheckOnly -and $Cmd -in @('pro', 'zai')) { $args += '--dry-run' }
    & node @args
    if ($LASTEXITCODE -ne 0) {
        throw "local claude-mode $Cmd failed (exit $LASTEXITCODE)"
    }
}

function Invoke-RemoteClaudeMode {
    param([string]$Node, [string]$Cmd)
    Write-Host "==> $Node" -ForegroundColor Cyan
    # Prefer ~/tweesic/operium or /c/tweesic/operium (Git Bash style on Windows OpenSSH)
    $remote = @"
set -e
if [ -f "`$HOME/tweesic/operium/$ScriptRel" ]; then
  ROOT="`$HOME/tweesic/operium"
elif [ -f /c/tweesic/operium/$ScriptRel ]; then
  ROOT=/c/tweesic/operium
elif [ -f /mnt/c/tweesic/operium/$ScriptRel ]; then
  ROOT=/mnt/c/tweesic/operium
else
  echo "operium claude-mode.js not found on $Node" >&2
  exit 2
fi
ARGS="$Cmd"
if [ "$($Json.IsPresent.ToString().ToLower())" = "true" ]; then ARGS="`$ARGS --json"; fi
if [ "$($CheckOnly.IsPresent.ToString().ToLower())" = "true" ] && { [ "$Cmd" = "pro" ] || [ "$Cmd" = "zai" ]; }; then
  ARGS="`$ARGS --dry-run"
fi
node "`$ROOT/$ScriptRel" `$ARGS
"@
    ssh $Node $remote
    if ($LASTEXITCODE -ne 0) {
        throw "ssh $Node claude-mode failed (exit $LASTEXITCODE)"
    }
}

$failed = @()

if ($IncludeLocal) {
    try {
        Invoke-LocalClaudeMode -Cmd $Mode
    } catch {
        Write-Host $_ -ForegroundColor Red
        $failed += 'local'
    }
}

foreach ($n in $Nodes) {
    try {
        Invoke-RemoteClaudeMode -Node $n -Cmd $Mode
    } catch {
        Write-Host $_ -ForegroundColor Red
        $failed += $n
    }
}

if ($failed.Count -gt 0) {
    Write-Host "Failed: $($failed -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host "✓ claude-mode $Mode applied (local=$IncludeLocal nodes=$($Nodes -join ','))" -ForegroundColor Green
