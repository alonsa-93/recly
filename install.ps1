# Creates "Recly" shortcuts on the Desktop and in the Start menu, then launches the app.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $dir 'server.ps1'
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$icon = Join-Path $dir 'recly.ico'
$shell = New-Object -ComObject WScript.Shell
$places = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) '')
)
foreach ($place in $places) {
  if (-not (Test-Path $place)) { continue }
  # The app used to be called Recordo: remove the old shortcut.
  $old = Join-Path $place 'Recordo.lnk'
  if (Test-Path $old) { Remove-Item $old -Force }
  $lnk = $shell.CreateShortcut((Join-Path $place 'Recly.lnk'))
  # Point at powershell.exe itself, not at start.bat: Windows Smart App Control blocks
  # shortcuts that open a .bat file, but allows the signed powershell.exe.
  $lnk.TargetPath = $ps
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$server`""
  $lnk.WorkingDirectory = $dir
  $lnk.WindowStyle = 7
  $lnk.Description = 'Recly - record locally. Stay yours.'
  if (Test-Path $icon) { $lnk.IconLocation = "$icon,0" }
  $lnk.Save()
  Write-Host "Shortcut created: $place\Recly.lnk"
}
Start-Process -FilePath $ps -WorkingDirectory $dir -WindowStyle Minimized -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$server`""
