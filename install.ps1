# Installs the FileReadWrite agent as `frw-agent.exe`.
#   irm https://raw.githubusercontent.com/theeurbanlegend/filereadwritemcp/main/install.ps1 | iex
# Options (env vars): FRW_VERSION=v1.2.3, FRW_INSTALL_DIR, FRW_REPO=owner/repo,
#   FRW_DOWNLOAD_URL (a mirror serving the release assets)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = if ($env:FRW_REPO) { $env:FRW_REPO } else { 'theeurbanlegend/filereadwritemcp' }
$Version = if ($env:FRW_VERSION) { $env:FRW_VERSION } else { 'latest' }
$InstallDir = if ($env:FRW_INSTALL_DIR) { $env:FRW_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'FileReadWrite\bin' }

if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'The FileReadWrite agent needs 64-bit Windows.'
}

$Base = if ($env:FRW_DOWNLOAD_URL) {
    $env:FRW_DOWNLOAD_URL
} elseif ($Version -eq 'latest') {
    "https://github.com/$Repo/releases/latest/download"
} else {
    "https://github.com/$Repo/releases/download/$Version"
}
$Asset = 'agent-x86_64-pc-windows-msvc'
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("frw-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $Tmp | Out-Null

try {
    Write-Host "Downloading $Asset ($Version)..."
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile (Join-Path $Tmp $Asset)
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHA256SUMS" -OutFile (Join-Path $Tmp 'SHA256SUMS')

    $Expected = Get-Content (Join-Path $Tmp 'SHA256SUMS') |
        ForEach-Object { $parts = $_ -split '\s+\*?'; if ($parts[1] -eq $Asset) { $parts[0] } } |
        Select-Object -First 1
    if (-not $Expected) { throw "$Asset is not listed in SHA256SUMS" }
    $Actual = (Get-FileHash -Algorithm SHA256 (Join-Path $Tmp $Asset)).Hash
    if ($Actual -ne $Expected.ToUpper()) {
        throw "Checksum mismatch for $Asset (expected $Expected, got $Actual)"
    }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $Exe = Join-Path $InstallDir 'frw-agent.exe'
    Move-Item -Force (Join-Path $Tmp $Asset) $Exe
} finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}

$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($UserPath -split ';') -contains $InstallDir)) {
    [Environment]::SetEnvironmentVariable('Path', ($UserPath.TrimEnd(';') + ";$InstallDir").TrimStart(';'), 'User')
    Write-Host "Added $InstallDir to your PATH. Open a new terminal to use it."
}

Write-Host "Installed $(& $Exe --version) to $Exe"
Write-Host ''
Write-Host "Next: run 'frw-agent' and enter the enrollment code from your dashboard."
