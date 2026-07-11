# Manual foreground ONA runner (dev/debug). Production uses NSSM -> node.exe directly (install-ona-windows-service.ps1).
param(
    [string]$EnvFile = "",
    [string]$OperiumRoot = ""
)

$ErrorActionPreference = 'Stop'
$defaultSecrets = Join-Path $env:USERPROFILE '.cogentia\secrets'

if (-not $EnvFile) {
    $EnvFile = Join-Path $defaultSecrets 'ona.env'
}
if (-not $OperiumRoot) {
    $OperiumRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
}

if (-not (Test-Path $EnvFile)) {
    throw "ONA env not found: $EnvFile"
}

. (Join-Path $PSScriptRoot 'Import-OnaEnv.ps1')
Import-OnaEnv $EnvFile

$varDir = if ($env:COGENTIA_OPS_STATE_DIR) {
    $env:COGENTIA_OPS_STATE_DIR
} else {
    Join-Path $env:USERPROFILE '.cogentia\var'
}
New-Item -ItemType Directory -Force -Path $varDir | Out-Null

if ($env:ONA_ENABLED -eq '0') {
    Write-Host '[operium-node-agent] ONA_ENABLED=0 — exiting'
    exit 0
}

Set-Location $OperiumRoot
$entry = Join-Path $OperiumRoot 'bin\operium-node-agent.js'
if (-not (Test-Path $entry)) {
    throw "operium-node-agent.js not found: $entry"
}

& node $entry