<#
.SYNOPSIS
Applies Cogentia retrieval migrations to the JHN Supabase PostgreSQL project.

.DESCRIPTION
Reads `supabase_db_url` from the JHN instance_config vault through the JHN
service-role key held in inseme/.env. The connection string is kept only in
process memory and is never copied to pgpass.conf, command-line arguments,
or this repository.

The script only targets the JHN project, requires TLS, and never starts a
local PostgreSQL server.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$MigrationDirectory = (Join-Path $PSScriptRoot "..\..\..\cogentia\deploy\supabase"),
    [string]$InsemeEnv = (Join-Path $PSScriptRoot "..\..\..\inseme\.env")
)

$ErrorActionPreference = "Stop"
$projectHost = "db.ndiysuhzmztatpxbkezn.supabase.co"
$projectPort = "5432"
$projectRef = "ndiysuhzmztatpxbkezn"
$database = "postgres"
$role = "postgres"

function Get-DotEnvValue([string]$Path, [string]$Name) {
    if (-not (Test-Path $Path)) { throw "Missing Inseme environment file: $Path" }
    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -Last 1
    if (-not $line) { throw "Missing $Name in $Path" }
    $value = ($line -split "=", 2)[1].Trim()
    if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))) {
        return $value.Substring(1, $value.Length - 2)
    }
    return $value
}

function Get-JhnDatabaseConnection {
    $supabaseUrl = Get-DotEnvValue $InsemeEnv "SUPABASE_URL"
    $serviceRoleKey = Get-DotEnvValue $InsemeEnv "SUPABASE_SERVICE_ROLE_KEY"
    $headers = @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey" }
    $endpoint = "$($supabaseUrl.TrimEnd('/'))/rest/v1/instance_config?key=eq.supabase_db_url&select=key,value,is_secret,is_public"
    $rows = @(Invoke-RestMethod -Method Get -Uri $endpoint -Headers $headers)
    if ($rows.Count -ne 1) { throw "Expected exactly one supabase_db_url entry in the JHN vault." }
    $entry = $rows[0]
    if ($entry.is_secret -ne $true -or $entry.is_public -eq $true) {
        throw "supabase_db_url must be stored with is_secret=true and is_public=false."
    }
    if (-not $entry.value) { throw "JHN vault entry supabase_db_url is empty." }
    return [string]$entry.value
}

function Convert-DatabaseUrl([string]$Url) {
    try { $uri = [Uri]$Url } catch { throw "supabase_db_url is not a valid PostgreSQL connection URL." }
    if ($uri.Scheme -notin @("postgres", "postgresql") -or $uri.AbsolutePath.Trim('/') -ne $database) { throw "supabase_db_url does not target the expected JHN PostgreSQL database." }
    $separator = $uri.UserInfo.IndexOf(":")
    if ($separator -lt 1) { throw "supabase_db_url must include the database role and password." }
    $urlRole = [Uri]::UnescapeDataString($uri.UserInfo.Substring(0, $separator))
    $isDirect = $uri.Host -eq $projectHost -and $uri.Port -eq [int]$projectPort -and $urlRole -eq $role
    $isSessionPooler = $uri.Host -match "^[a-z0-9-]+\.pooler\.supabase\.com$" -and $uri.Port -eq [int]$projectPort -and $urlRole -eq "$role.$projectRef"
    if (-not ($isDirect -or $isSessionPooler)) {
        throw "supabase_db_url must be either the JHN direct URL or its Supavisor session-pooler URL."
    }
    return [PSCustomObject]@{
        Host = $uri.Host
        Port = $uri.Port
        Role = $urlRole
        Password = [Uri]::UnescapeDataString($uri.UserInfo.Substring($separator + 1))
    }
}

function Resolve-Psql {
    $command = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $scoopRoot = Join-Path $env:USERPROFILE "scoop\apps\postgresql"
    $candidate = Get-ChildItem -Path $scoopRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "pgsql\bin\psql.exe" } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1
    if ($candidate) { return $candidate }

    throw "psql.exe was not found. Install the Operium postgresql-client profile first."
}

$migrationRoot = (Resolve-Path $MigrationDirectory).Path
$migrations = Get-ChildItem -Path $migrationRoot -Filter "*.sql" -File | Sort-Object Name
if ($migrations.Count -eq 0) { throw "No SQL migrations found in $migrationRoot." }

$psql = Resolve-Psql
$savedSslMode = $env:PGSSLMODE
$savedPassword = $env:PGPASSWORD
try {
    $env:PGSSLMODE = "require"
    $databaseUrl = Get-JhnDatabaseConnection
    $connection = Convert-DatabaseUrl $databaseUrl
    $env:PGPASSWORD = $connection.Password
    $probe = @("--host=$($connection.Host)", "--port=$($connection.Port)", "--username=$($connection.Role)", "--dbname=$database", "--no-password", "--tuples-only", "--no-align", "--command=select current_database()")
    $probeOutput = & $psql @probe
    if ($LASTEXITCODE -ne 0) {
        throw "JHN PostgreSQL connection probe failed."
    }
    $actualDatabase = [string]$probeOutput
    if ($actualDatabase.Trim() -ne $database) { throw "JHN PostgreSQL connection probe returned an unexpected database." }

    foreach ($migration in $migrations) {
        if ($PSCmdlet.ShouldProcess("JHN Supabase", "Apply $($migration.Name)")) {
            & $psql "--host=$($connection.Host)" "--port=$($connection.Port)" "--username=$($connection.Role)" "--dbname=$database" "--no-password" "--set=ON_ERROR_STOP=1" "--file=$($migration.FullName)"
            if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($migration.Name)" }
        }
    }
} finally {
    $env:PGSSLMODE = $savedSslMode
    $env:PGPASSWORD = $savedPassword
    $databaseUrl = $null
    $connection = $null
}

if ($WhatIfPreference) {
    Write-Output "Cogentia JHN retrieval migration preflight completed successfully."
} else {
    Write-Output "Cogentia JHN retrieval migrations applied successfully."
}
