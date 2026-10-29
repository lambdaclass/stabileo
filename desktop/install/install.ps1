# Install the Stabileo desktop app on Windows (x64) from its newest prerelease:
#
#   irm https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.ps1 | iex
#
# Downloads the installer, checks it against the release's SHA256SUMS, and runs it for the current
# user (no administrator rights). The app updates itself afterwards.
# $env:STABILEO_VERSION = '0.1.0-alpha.1' installs that version instead of the newest.

& {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $repo = 'lambdaclass/stabileo'
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Stabileo needs 64-bit Windows.' }

    $version = $env:STABILEO_VERSION
    if (-not $version) {
        $feed = Invoke-RestMethod -UseBasicParsing "https://raw.githubusercontent.com/$repo/desktop-update-feed/latest.json"
        if ($feed -is [string]) { $feed = $feed | ConvertFrom-Json }
        $version = $feed.version
    }
    if ($version -notmatch '^[0-9A-Za-z.-]+$') { throw "Unexpected version '$version'." }

    $base = "https://github.com/$repo/releases/download/desktop-v$version"
    $file = "Stabileo_${version}_x64-setup.exe"
    $dir = Join-Path ([IO.Path]::GetTempPath()) ("stabileo-" + [Guid]::NewGuid())
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        Write-Host "Downloading Stabileo $version ($file)..."
        $exe = Join-Path $dir $file
        if ($env:STABILEO_ARTIFACT_DIR) {
            $sums = Get-Content -Raw (Join-Path $env:STABILEO_ARTIFACT_DIR 'SHA256SUMS')
            Copy-Item (Join-Path $env:STABILEO_ARTIFACT_DIR $file) $exe
        } else {
            $sums = (Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS").Content
            if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
            Invoke-WebRequest -UseBasicParsing "$base/$file" -OutFile $exe
        }

        $want = $null
        foreach ($line in ($sums -split "`n")) {
            $parts = $line.Trim() -split '\s+'
            if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $file) { $want = $parts[0].ToLower() }
        }
        if (-not $want) { throw "$file is not listed in SHA256SUMS." }
        $got = (Get-FileHash -Algorithm SHA256 $exe).Hash.ToLower()
        if ($got -ne $want) { throw "Checksum mismatch for $file (expected $want, got $got); nothing installed." }
        Write-Host 'Checksum OK. Installing...'

        $p = Start-Process -FilePath $exe -ArgumentList '/S' -Wait -PassThru
        if ($p.ExitCode -ne 0) { throw "The installer failed (exit code $($p.ExitCode))." }
        Write-Host "Stabileo $version is installed: find it in the Start menu. It updates itself."
    } finally {
        Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
    }
}
