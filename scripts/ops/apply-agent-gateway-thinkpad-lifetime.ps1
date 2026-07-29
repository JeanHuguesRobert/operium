# Operium apply: durable Agent CLI Gateway on this Windows tool host (logon task).
# App installers live in Cogentia; this wrapper is the ops entrypoint (systemd-style lifetime).
#
# Usage (on ThinkPad / i7-thinkpad-jhr):
#   pwsh -NoProfile -File apply-agent-gateway-thinkpad-lifetime.ps1
#   pwsh -NoProfile -File apply-agent-gateway-thinkpad-lifetime.ps1 -SkipStart

param(
    [ValidateSet('loopback', 'tailscale', 'all')]
    [string]$Bind = 'tailscale',
    [int]$Port = 8793,
    [switch]$SkipStart,
    [string]$CogentiaRoot = ''
)

$ErrorActionPreference = 'Stop'

if (-not $CogentiaRoot) {
    $here = $PSScriptRoot
    # operium/scripts/ops -> workspace/cogentia
    $candidate = Join-Path $here '..\..\..\cogentia'
    if (Test-Path (Join-Path $candidate 'scripts\ops\install-agent-gateway-windows.ps1')) {
        $CogentiaRoot = (Resolve-Path $candidate).Path
    } else {
        $CogentiaRoot = 'C:\tweesic\cogentia'
    }
}

$install = Join-Path $CogentiaRoot 'scripts\ops\install-agent-gateway-windows.ps1'
if (-not (Test-Path $install)) {
    throw "Cogentia install script not found: $install"
}

Write-Host "[operium] apply agent-gateway lifetime via $install"
$args = @{
    Bind                 = $Bind
    Port                 = $Port
    RegisterStartupTask  = $true
}
if (-not $SkipStart) {
    $args.StartTask = $true
}

& $install @args

Write-Host "[operium] verify task + listen..."
$task = Get-ScheduledTask -TaskName CogentiaAgentGateway -ErrorAction SilentlyContinue
if (-not $task) {
    throw 'CogentiaAgentGateway task not registered'
}
$info = Get-ScheduledTaskInfo -TaskName CogentiaAgentGateway
Write-Host "[operium] task State=$($task.State) LastResult=$($info.LastTaskResult) LastRun=$($info.LastRunTime)"

Start-Sleep -Seconds 3
$listen = netstat -ano | Select-String 'LISTENING' | Select-String ':8793'
if ($listen) {
    Write-Host $listen
} else {
    Write-Warning 'Port 8793 not LISTENING yet — check ~\.cogentia\var\agent-gateway.log and task history'
}

Write-Host "[operium] done. Reboot+logon proof still required to close OP-BUG-001."
