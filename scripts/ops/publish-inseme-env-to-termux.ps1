[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$Source = "C:\tweesic\inseme\.env",
  [string]$SshHost = "poco-jhr",
  [string]$RemoteRoot = "/data/data/com.termux/files/home/srv/cogentia/repos"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
  throw "Secret authority file missing: $Source"
}

$sourceItem = Get-Item -LiteralPath $Source
$sourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLowerInvariant()
$remoteTemp = "/data/data/com.termux/files/home/.cache/operium/inseme.env.upload"
$remoteAuthority = "$RemoteRoot/inseme/.env"

if (-not $PSCmdlet.ShouldProcess(
  "${SshHost}:$remoteAuthority",
  "Copy inseme/.env authority and link Termux consumers"
)) {
  return
}

ssh $SshHost "install -d -m 700 /data/data/com.termux/files/home/.cache/operium; test -d '$RemoteRoot/inseme'"
if ($LASTEXITCODE -ne 0) { throw "Remote preparation failed" }
scp -q -- $Source "${SshHost}:$remoteTemp"
if ($LASTEXITCODE -ne 0) { throw "SCP failed" }

$apply = @"
set -eu
install -m 600 '$remoteTemp' '$remoteAuthority'
rm -f '$remoteTemp'
for repo in cogentia operium survey ubikia; do
  ln -sfn ../inseme/.env '$RemoteRoot/'"`$repo"'/.env'
done
printf 'authority_mode=%s authority_owner=%s authority_sha256=' "`$(stat -c '%a' '$remoteAuthority')" "`$(stat -c '%U:%G' '$remoteAuthority')"
sha256sum '$remoteAuthority' | cut -d' ' -f1
"@
$verification = ssh $SshHost $apply
if ($LASTEXITCODE -ne 0) { throw "Remote installation failed" }

[pscustomobject]@{
  schema = "operium.secret-publish-result.v1"
  host = $SshHost
  source_length = $sourceItem.Length
  source_sha256 = $sourceHash
  remote_verification = @($verification)
} | ConvertTo-Json -Depth 3
