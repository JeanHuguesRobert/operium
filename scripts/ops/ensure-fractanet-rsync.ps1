# Install or verify rsync across the current Fractanet node set.
# Run from a trusted workstation with the Tailscale SSH aliases documented in
# docs/fractanet-mesh.md. Routine access must stay inside the mesh.
param(
    [string[]]$Nodes = @('fracta', 'i7-thinkpad-jhr', 'rpi3-view', 'poco-jhr'),
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

function Invoke-NodeCommand {
    param(
        [string]$Node,
        [string]$Command
    )
    Write-Host "==> $Node"
    ssh $Node $Command
    if ($LASTEXITCODE -ne 0) {
        throw "ssh command failed with exit code $LASTEXITCODE"
    }
}

$windowsInstaller = @'
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$rsync = Get-Command rsync -ErrorAction SilentlyContinue
if ($rsync) {
  & $rsync.Source --version | Select-Object -First 1
  exit 0
}
if ($env:CHECK_ONLY -eq "1") {
  Write-Error "rsync missing"
  exit 1
}
if (Get-Command choco -ErrorAction SilentlyContinue) {
  choco install rsync -y --no-progress
} elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
  scoop install rsync
} elseif (Get-Command pacman -ErrorAction SilentlyContinue) {
  pacman -S --needed --noconfirm rsync
} else {
  Write-Error "No supported Windows installer found for rsync. Install rsync with Chocolatey, Scoop, or MSYS2, then rerun this check."
  exit 1
}
$rsync = Get-Command rsync -ErrorAction Stop
& $rsync.Source --version | Select-Object -First 1
'@

$failed = @()
foreach ($node in $Nodes) {
    try {
        if ($node -eq 'i7-thinkpad-jhr' -or $node -eq 'thinkpad-ts') {
            $script = if ($CheckOnly) { '$env:CHECK_ONLY="1"; ' + $windowsInstaller } else { $windowsInstaller }
            $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
            Invoke-NodeCommand -Node $node -Command "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded"
        } else {
            if ($CheckOnly) {
                $posixCommand = "if command -v rsync >/dev/null 2>&1; then rsync --version | sed -n '1p' || true; exit 0; fi; echo 'rsync missing'; exit 1"
            } else {
                $posixCommand = "if command -v rsync >/dev/null 2>&1; then rsync --version | sed -n '1p' || true; exit 0; fi; if command -v pkg >/dev/null 2>&1; then pkg install -y rsync; elif command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y rsync; else echo 'No supported installer found for rsync' >&2; exit 1; fi; rsync --version | sed -n '1p' || true"
            }
            $quoted = $posixCommand.Replace("'", "'\''")
            Invoke-NodeCommand -Node $node -Command "bash -lc '$quoted'"
        }
    } catch {
        $failed += $node
        Write-Warning "$node failed: $($_.Exception.Message)"
    }
}

if ($failed.Count) {
    Write-Error "rsync setup/check failed on: $($failed -join ', ')"
    exit 1
}

Write-Host "rsync available on: $($Nodes -join ', ')"
