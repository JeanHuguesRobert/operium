[CmdletBinding()]
param(
    [ValidatePattern('^https://')]
    [string]$BaseUrl = 'https://suicidecorse.baronsmariani.org',
    [ValidateRange(1, 120)]
    [int]$TimeoutSeconds = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$base = $BaseUrl.TrimEnd('/')
$edition = "$base/editions/2026-09-17"
$pdfName = 'suicide-corse-edition-2026-09-17-anniversaire.pdf'
$checks = @(
    @{ Name = 'landing'; Uri = "$base/"; ContentType = 'text/html' },
    @{ Name = 'edition_html'; Uri = "$edition/index.html"; ContentType = 'text/html' },
    @{ Name = 'pdf'; Uri = "$edition/$pdfName"; ContentType = 'application/pdf' },
    @{ Name = 'manifest'; Uri = "$edition/manifest.json"; ContentType = 'application/json' }
)

function Assert-Head {
    param([hashtable]$Check)

    $response = Invoke-WebRequest -Uri $Check.Uri -Method Head -TimeoutSec $TimeoutSeconds -MaximumRedirection 5 -UseBasicParsing
    if ($response.StatusCode -ne 200) {
        throw "$($Check.Name): expected HTTP 200, got $($response.StatusCode)"
    }
    $contentType = [string]$response.Headers['Content-Type']
    if (-not $contentType.StartsWith($Check.ContentType, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "$($Check.Name): expected Content-Type $($Check.ContentType), got $contentType"
    }
    [pscustomobject]@{
        name = $Check.Name
        uri = $Check.Uri
        status = $response.StatusCode
        content_type = $contentType
        content_length = $response.Headers['Content-Length']
    }
}

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("suicide-corse-preview-check-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null

try {
    $endpointResults = @($checks | ForEach-Object { Assert-Head $_ })
    $manifestPath = Join-Path $temporaryDirectory 'manifest.json'
    $pdfPath = Join-Path $temporaryDirectory $pdfName
    Invoke-WebRequest -Uri "$edition/manifest.json" -OutFile $manifestPath -TimeoutSec $TimeoutSeconds -UseBasicParsing
    Invoke-WebRequest -Uri "$edition/$pdfName" -OutFile $pdfPath -TimeoutSec $TimeoutSeconds -UseBasicParsing

    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    $expectedHash = @($manifest.outputs | Where-Object { $_.format -eq 'pdf' } | Select-Object -First 1).sha256
    if ([string]::IsNullOrWhiteSpace($expectedHash)) {
        throw 'manifest: missing outputs[].sha256 for PDF'
    }
    $actualHash = (Get-FileHash -LiteralPath $pdfPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash.ToLowerInvariant()) {
        throw "pdf: SHA-256 mismatch (expected $expectedHash, got $actualHash)"
    }

    [pscustomobject]@{
        schema = 'operium.suicide-corse-preview-smoke.v1'
        checked_at = [DateTime]::UtcNow.ToString('o')
        ok = $true
        base_url = $base
        endpoints = $endpointResults
        source_git_commit = $manifest.source_git_commit
        publication_status = $manifest.publication_status
        pdf_sha256 = $actualHash
    } | ConvertTo-Json -Depth 5
}
finally {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
