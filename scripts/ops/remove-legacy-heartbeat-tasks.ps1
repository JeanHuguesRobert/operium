# Remove pre-ONA Windows scheduled heartbeat tasks (jobs now run in-process via OperiumNodeAgent NSSM service).
# Safe to run without elevation — only unregisters tasks owned by the current user.
param([switch]$WhatIf)

$ErrorActionPreference = 'Stop'

$LegacyTasks = @(
    'CogentiaOperiumNodeHeartbeat',
    'CogentiaAttractorHeartbeat',
    'CogentiaAgentGatewayHeartbeat',
    'OperiumNodeAgent'
)

foreach ($taskName in $LegacyTasks) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Host "[skip] $taskName (not registered)"
        continue
    }
    if ($WhatIf) {
        Write-Host "[whatif] would remove $taskName (state=$($task.State))"
        continue
    }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "[removed] $taskName (was $($task.State))"
}

Write-Host 'Heartbeat scheduling is owned by OperiumNodeAgent service (ONA in-process jobs).'