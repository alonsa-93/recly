# Creates "Recly" shortcuts on the Desktop and in the Start menu, then launches the app.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $dir 'start.bat'
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
  $lnk.TargetPath = $target
  $lnk.WorkingDirectory = $dir
  $lnk.WindowStyle = 7
  $lnk.Description = 'Recly - record locally. Stay yours.'
  if (Test-Path $icon) { $lnk.IconLocation = "$icon,0" }
  $lnk.Save()
  Write-Host "Shortcut created: $place\Recly.lnk"
}
Start-Process -FilePath $target -WorkingDirectory $dir
