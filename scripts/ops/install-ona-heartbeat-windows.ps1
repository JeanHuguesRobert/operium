# DEPRECATED — use OperiumNodeAgent NSSM service (in-process jobs, no console flash):
#   pwsh -NoProfile -File operium\scripts\ops\install-ona-windows-service.ps1
#
# Legacy scheduled-task heartbeat. Runs node.exe directly with -Hidden (no cmd.exe).
param(
    [string]$HeartbeatEnvFile = "",
    [int]$IntervalMinutes = 3
)

$ErrorActionPreference = 'Stop'
$nodeSlug = ([System.Net.Dns]::GetHostName()).ToLower()
$secretsDir = Join-Path $env:USERPROFILE '.cogentia\secrets'

if (-not $HeartbeatEnvFile) {
    $HeartbeatEnvFile = Join-Path $secretsDir 'ona-heartbeat.env'
}
if (-not (Test-Path $HeartbeatEnvFile)) {
    $fallback = Join-Path $secretsDir 'agent-gateway-blackboard.env'
    if (Test-Path $fallback) {
        $HeartbeatEnvFile = $fallback
    } else {
        $fallback = Join-Path $secretsDir 'ona-blackboard.env'
        if (Test-Path $fallback) {
            $HeartbeatEnvFile = $fallback
        } else {
            throw "ONA heartbeat env not found: $HeartbeatEnvFile"
        }
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$heartbeat = Join-Path $repoRoot 'scripts\ona-heartbeat.js'
$nodeExe = (Get-Command node).Source
$taskName = 'CogentiaOperiumNodeHeartbeat'

$envPrefix = "set ONA_HEARTBEAT_ENV_FILE=$HeartbeatEnvFile&& set ONA_ATTRACTOR_ENV_FILE=$HeartbeatEnvFile&&"
$action = New-ScheduledTaskAction `
    -Execute 'cmd.exe' `
    -Argument "/c $envPrefix `"$nodeExe`" `"$heartbeat`"" `
    -WorkingDirectory $repoRoot

# cmd.exe still needed to inject env vars; task is Hidden so console should not appear.
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
    -Hidden `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger @($logonTrigger, $repeatTrigger) `
    -Settings $settings `
    -Description "DEPRECATED — use OperiumNodeAgent service ($nodeSlug)" `
    -Force | Out-Null

$env:ONA_HEARTBEAT_ENV_FILE = $HeartbeatEnvFile
$env:ONA_ATTRACTOR_ENV_FILE = $HeartbeatEnvFile
& node $heartbeat
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Warning 'DEPRECATED: prefer install-ona-windows-service.ps1 (in-process jobs, no flicker)'
Write-Host "Registered scheduled task: $taskName"
Write-Host "  runtime:    node.exe via cmd (Hidden task)"
Write-Host "  heartbeat:  $HeartbeatEnvFile"
Write-Host "  every:      ${IntervalMinutes}m + at logon"
Write-Host 'Initial ONA heartbeat OK'