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

# Download with a percentage bar. Invoke-WebRequest's own progress shows only bytes on
# Windows PowerShell 5.1 and slows the download down a lot, so update it once per percent.
function Get-FileWithProgress($Uri, $OutFile) {
    $Response = [Net.WebRequest]::Create($Uri).GetResponse()
    try {
        $Total = $Response.ContentLength
        $In = $Response.GetResponseStream()
        $Out = [IO.File]::Create($OutFile)
        try {
            $Buffer = New-Object byte[] 65536
            $Done = 0
            $LastPercent = -1
            while (($Read = $In.Read($Buffer, 0, $Buffer.Length)) -gt 0) {
                $Out.Write($Buffer, 0, $Read)
                $Done += $Read
                if ($Total -gt 0) {
                    $Percent = [int][Math]::Floor(100 * $Done / $Total)
                    if ($Percent -ne $LastPercent) {
                        $Status = '{0:N1} / {1:N1} MB' -f ($Done / 1MB), ($Total / 1MB)
                        Write-Progress -Activity "Downloading $Asset" -Status $Status -PercentComplete $Percent
                        $LastPercent = $Percent
                    }
                }
            }
        } finally {
            $Out.Dispose()
            $In.Dispose()
        }
    } finally {
        $Response.Dispose()
    }
    Write-Progress -Activity "Downloading $Asset" -Completed
}

try {
    Write-Host "Downloading $Asset ($Version)..."
    Get-FileWithProgress "$Base/$Asset" (Join-Path $Tmp $Asset)
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
