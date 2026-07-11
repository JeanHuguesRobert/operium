# Install Operium Node Agent as a Windows Service (NSSM) — runs node.exe directly (no PowerShell at runtime).
# Usage (elevated pwsh — install only, not each service start):
#   pwsh -NoProfile -File install-ona-windows-service.ps1
#   pwsh -NoProfile -File install-ona-windows-service.ps1 -Remove

param(
    [string]$EnvFile = "",
    [string]$OperiumRoot = "",
    [string]$ServiceName = "OperiumNodeAgent",
    [string]$NssmDir = "",
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

function Test-Admin {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Read-DotEnvFile([string]$Path) {
    $pairs = @()
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        if ($line -match '^\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$') {
            $pairs += [pscustomobject]@{ Key = $Matches[1]; Value = $Matches[2].Trim().Trim("'").Trim('"') }
            return
        }
        if ($line -match '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$') {
            $pairs += [pscustomobject]@{ Key = $Matches[1]; Value = $Matches[2].Trim().Trim("'").Trim('"') }
        }
    }
    return $pairs
}

function Resolve-NssmExe([string]$PreferredDir) {
    $candidates = @(
        (Join-Path $PreferredDir 'nssm.exe'),
        'C:\Program Files\nssm\nssm.exe',
        'C:\Program Files (x86)\nssm\nssm.exe'
    )
    foreach ($path in $candidates) {
        if ($path -and (Test-Path $path)) { return (Resolve-Path $path).Path }
    }
    $fromPath = (Get-Command nssm -ErrorAction SilentlyContinue)?.Source
    if ($fromPath) { return $fromPath }
    return $null
}

function Ensure-Nssm([string]$BinDir) {
    $existing = Resolve-NssmExe $BinDir
    if ($existing) { return $existing }

    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    $zipPath = Join-Path $env:TEMP 'nssm-2.24.zip'
    $extractRoot = Join-Path $env:TEMP 'nssm-extract'
    $url = 'https://nssm.cc/release/nssm-2.24.zip'

    Write-Host "[ona-service] downloading NSSM from $url"
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    if (Test-Path $extractRoot) { Remove-Item -Recurse -Force $extractRoot }
    Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force

    $win64 = Get-ChildItem -Path $extractRoot -Recurse -Filter 'nssm.exe' |
        Where-Object { $_.FullName -match 'win64' } |
        Select-Object -First 1
    if (-not $win64) {
        throw 'nssm.exe (win64) not found in downloaded archive'
    }

    $target = Join-Path $BinDir 'nssm.exe'
    Copy-Item $win64.FullName $target -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    return (Resolve-Path $target).Path
}

function Stop-StrayOnaProcesses() {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'operium-node-agent' } |
        ForEach-Object {
            Write-Host "[ona-service] stopping stray pid $($_.ProcessId)"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

$LegacyHeartbeatTasks = @(
    'OperiumNodeAgent',
    'CogentiaOperiumNodeHeartbeat',
    'CogentiaAttractorHeartbeat',
    'CogentiaAgentGatewayHeartbeat'
)

function Remove-LegacyOnaTasks() {
    foreach ($taskName in $LegacyHeartbeatTasks) {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
            Write-Host "[ona-service] removed legacy scheduled task: $taskName"
        }
    }
}

function Grant-ServiceAccess([string]$ServiceAccount, [string[]]$Paths) {
    foreach ($target in $Paths) {
        if (-not (Test-Path $target)) { continue }
        & icacls $target /grant "${ServiceAccount}:(OI)(CI)M" /T /C | Out-Null
    }
}

function Set-NssmEnvironment([string]$Nssm, [string]$ServiceName, [object[]]$EnvPairs) {
    # NSSM replaces AppEnvironmentExtra on each `nssm set` — pass all KEY=value pairs at once.
    $block = ($EnvPairs | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join [Environment]::NewLine
    & $Nssm set $ServiceName AppEnvironmentExtra $block | Out-Null
}

if (-not (Test-Admin)) {
    throw 'Run as Administrator (elevated pwsh -NoProfile) to install or remove the Windows service.'
}

$secretsDir = Join-Path $env:USERPROFILE '.cogentia\secrets'
$varDir = Join-Path $env:USERPROFILE '.cogentia\var'
$binDir = if ($NssmDir) { $NssmDir } else { Join-Path $env:USERPROFILE '.cogentia\bin' }

if (-not $EnvFile) {
    $EnvFile = Join-Path $secretsDir 'ona.env'
}
if (-not $OperiumRoot) {
    $OperiumRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
}
if (-not (Test-Path $EnvFile)) {
    throw "ONA env not found: $EnvFile — create secrets first (see operium-node-agent-install.md)"
}

$envPairs = Read-DotEnvFile $EnvFile
$onaEnabled = ($envPairs | Where-Object Key -eq 'ONA_ENABLED' | Select-Object -ExpandProperty Value -First 1)
if ($onaEnabled -eq '0') {
    Write-Warning 'ONA_ENABLED=0 in env file — service will start but daemon exits immediately.'
}

$nodeExe = (Get-Command node).Source
$agentEntry = Join-Path $OperiumRoot 'bin\operium-node-agent.js'
if (-not (Test-Path $agentEntry)) {
    throw "operium-node-agent.js not found: $agentEntry"
}

$nssm = Ensure-Nssm $BinDir
$logDir = $varDir
$stdoutLog = Join-Path $logDir 'operium-node-agent-service.log'
$stderrLog = Join-Path $logDir 'operium-node-agent-service.err.log'
$onaPort = ($envPairs | Where-Object Key -eq 'ONA_PORT' | Select-Object -ExpandProperty Value -First 1)
if (-not $onaPort) { $onaPort = '8794' }

if ($Remove) {
    Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
    & $nssm remove $ServiceName confirm
    Write-Host "[ona-service] removed service: $ServiceName"
    exit 0
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Stop-StrayOnaProcesses
Remove-LegacyOnaTasks

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[ona-service] removing existing service for reinstall"
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    & $nssm remove $ServiceName confirm
    Start-Sleep -Seconds 1
}

# Runtime: node.exe only — no PowerShell, no cmd wrapper (mirrors fracta ExecStart=node ...).
& $nssm install $ServiceName $nodeExe $agentEntry
& $nssm set $ServiceName AppDirectory $OperiumRoot
Set-NssmEnvironment $nssm $ServiceName $envPairs
& $nssm set $ServiceName DisplayName "Operium Node Agent"
& $nssm set $ServiceName Description "FractaNode control-plane daemon (operium.node.v1) on :8794"
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppStdout $stdoutLog
& $nssm set $ServiceName AppStderr $stderrLog
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateOnline 1
& $nssm set $ServiceName AppRotateBytes 1048576
& $nssm set $ServiceName AppExit Default Restart
& $nssm set $ServiceName AppRestartDelay 5000
& $nssm set $ServiceName ObjectName LocalSystem

$registryRoot = 'C:\tweesic\registre-mariani'
Grant-ServiceAccess -ServiceAccount 'SYSTEM' -Paths @(
    $secretsDir,
    $varDir,
    $OperiumRoot,
    $registryRoot,
    (Split-Path $EnvFile -Parent)
)

Write-Host @"

[ona-service] installed $ServiceName
  executable: $nodeExe $agentEntry
  env:        $EnvFile ($($envPairs.Count) vars via NSSM AppEnvironmentExtra)
  operium:    $OperiumRoot
  logs:       $stdoutLog

Runtime uses node.exe directly (no PowerShell). Install script is pwsh one-shot only.

"@

try {
    Start-Service -Name $ServiceName
} catch {
    Write-Warning "Start-Service failed: $($_.Exception.Message)"
    Write-Host "Check $stderrLog or: $nssm status $ServiceName"
    exit 1
}

Start-Sleep -Seconds 4
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$onaPort/health" -TimeoutSec 8
    Write-Host "[ona-service] health ok=$($health.ok) node_id=$($health.node_id) bind=$($health.bind)"
} catch {
    Write-Warning "Health probe failed: $($_.Exception.Message)"
    Write-Host "Check $stderrLog"
    exit 1
}

Write-Host '[ona-service] install complete'