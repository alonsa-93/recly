# Builds both Windows packages into installer\out:
#   Recly-portable.zip      unzip and run install.bat / start.bat
#   Recly-Setup-<ver>.exe   regular installer (Inno Setup 6, per-user, no admin)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File installer\build.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $repo 'installer\out'
$stage = Join-Path $out 'stage\Recly'
if (Test-Path (Join-Path $out 'stage')) { Remove-Item (Join-Path $out 'stage') -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

# Only what the app needs at runtime (same list as installer\recly.iss, plus the .bat launchers).
$files = 'index.html', 'asr-worker.js', 'sw.js', 'manifest.webmanifest', 'recly.ico',
         'start.bat', 'install.bat', 'install.ps1', 'server.ps1', 'LICENSE', 'THIRD-PARTY-NOTICES.txt'
foreach ($f in $files) { Copy-Item (Join-Path $repo $f) $stage }
foreach ($d in 'fonts', 'icons', 'vendor') { Copy-Item (Join-Path $repo $d) $stage -Recurse }
Copy-Item (Join-Path $repo 'installer\*.txt') $stage

# ZIP with forward-slash entry names (Windows PowerShell 5.1's ZipFile writes backslashes).
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = Join-Path $out 'Recly-portable.zip'
if (Test-Path $zip) { Remove-Item $zip }
$fs = [IO.File]::Open($zip, 'Create')
$ar = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create, $false, [Text.Encoding]::UTF8)
$root = (Get-Item $stage).FullName
Get-ChildItem $root -Recurse -File | ForEach-Object {
  $rel = 'Recly/' + $_.FullName.Substring($root.Length + 1).Replace('\', '/')
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($ar, $_.FullName, $rel, [IO.Compression.CompressionLevel]::Optimal)
}
$ar.Dispose(); $fs.Dispose()
Remove-Item (Join-Path $out 'stage') -Recurse -Force
Write-Host "Built $zip"

$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { Write-Host 'Inno Setup 6 not found: skipped the installer.'; exit 0 }
& $iscc /Q (Join-Path $repo 'installer\recly.iss')
if ($LASTEXITCODE) { throw "ISCC failed ($LASTEXITCODE)" }
Write-Host "Built $(Join-Path $out 'Recly-Setup-*.exe')"
