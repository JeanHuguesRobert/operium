[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$Source = "C:\tweesic\inseme\.env",
  [string]$SshHost = "fracta",
  [string]$RemoteWorkspace = "/srv/cogentia/repos",
  [switch]$SkipPropagation
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
  throw "Secret authority file missing: $Source"
}

$sourceItem = Get-Item -LiteralPath $Source
$sourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLowerInvariant()
$remoteTemp = "/home/ubuntu/.cache/operium/inseme.env.upload"
$remoteAuthority = "$RemoteWorkspace/inseme/.env"

if (-not $PSCmdlet.ShouldProcess(
  "${SshHost}:$remoteAuthority",
  "Copy inseme/.env authority and link its declared consumers"
)) {
  return
}

ssh $SshHost "install -d -m 700 /home/ubuntu/.cache/operium; test -d '$RemoteWorkspace/inseme'"
if ($LASTEXITCODE -ne 0) { throw "Remote directory preparation failed" }

scp -q -- $Source "${SshHost}:$remoteTemp"
if ($LASTEXITCODE -ne 0) { throw "SCP failed" }

$install = @"
set -eu
chmod 600 '$remoteTemp'
install -m 600 '$remoteTemp' '$remoteAuthority'
rm -f '$remoteTemp'
"@
ssh $SshHost $install
if ($LASTEXITCODE -ne 0) { throw "Remote secret installation failed" }

if (-not $SkipPropagation) {
  ssh $SshHost "$RemoteWorkspace/operium/scripts/ops/fracta-secret-propagate.sh"
  if ($LASTEXITCODE -ne 0) { throw "Remote secret propagation failed" }
}

$verify = @"
set -eu
authority='$remoteAuthority'
printf 'authority_mode=%s authority_owner=%s authority_sha256=' "`$(stat -c '%a' "`$authority")" "`$(stat -c '%U:%G' "`$authority")"
sha256sum "`$authority" | cut -d' ' -f1
"@
$verification = ssh $SshHost $verify
if ($LASTEXITCODE -ne 0) { throw "Remote verification failed" }

[pscustomobject]@{
  schema = "operium.secret-publish-result.v1"
  host = $SshHost
  source_length = $sourceItem.Length
  source_sha256 = $sourceHash
  remote_verification = @($verification)
  propagated = -not $SkipPropagation
} | ConvertTo-Json -Depth 4
