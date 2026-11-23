# Recly local server - serves this folder on http://localhost and opens the app window.
# No installs needed: uses the HttpListener built into Windows.
param([int]$Port = 8777)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path)).TrimEnd('\') + '\'
$Host.UI.RawUI.WindowTitle = 'Recly server - close this window to stop'

# find a free port
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l; $Port = $p; break
  } catch { }
}
if (-not $listener) { Write-Host 'Could not find a free port (8777-8796).'; Read-Host 'Press Enter to exit'; exit 1 }

$url = "http://localhost:$Port/"
Write-Host ''
Write-Host "  Recly is running at $url"
Write-Host '  Keep this window open while recording. Close it to stop.'
Write-Host ''

# open in app mode (own window, no address bar) - Chrome first, then Edge
$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($browser) { Start-Process -FilePath $browser -ArgumentList "--app=$url", '--window-size=1340,880' }
else { Start-Process $url }

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
  '.js'='application/javascript; charset=utf-8'; '.mjs'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.wasm'='application/wasm'
  '.json'='application/json'; '.webmanifest'='application/manifest+json'
  '.woff2'='font/woff2'
  '.png'='image/png'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.webp'='image/webp'
}

# Only web assets are served. Everything else in the folder (.git, scripts, docs, node_modules,
# package.json, tests) stays private even though it sits next to index.html.
$blockedDirs = @('node_modules', 'tests')
$blockedFiles = @('package.json', 'package-lock.json')

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    $res.Headers['X-Content-Type-Options'] = 'nosniff'
    $res.Headers['Referrer-Policy'] = 'no-referrer'
    $res.Headers['X-Frame-Options'] = 'DENY'
    # Cross-origin isolation: lets the captions model use several CPU threads (SharedArrayBuffer).
    $res.Headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    $res.Headers['Cross-Origin-Embedder-Policy'] = 'credentialless'
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/').Replace('/', '\')
    if ($rel -eq '') { $rel = 'index.html' }
    $parts = $rel.Split('\')
    $hidden = @($parts | Where-Object { $_.StartsWith('.') -or ($blockedDirs -contains $_.ToLower()) }).Count -gt 0
    $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $allowed = (-not $hidden) -and $mime.ContainsKey($ext) -and -not ($blockedFiles -contains [IO.Path]::GetFileName($full).ToLower())
    if ($allowed -and $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($full)
      $res.ContentType = $mime[$ext]
      $res.Headers['Cache-Control'] = 'no-cache'
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
    $res.OutputStream.Close()
  } catch {
    try { $ctx.Response.Abort() } catch { }
  }
}
