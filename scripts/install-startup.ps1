$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start-local.ps1'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'ME Report Writer.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$shortcut.Arguments = '-NoLogo -NoProfile -WindowStyle Hidden -File "' + $launcher + '" -NoBrowser'
$shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start the local ME Report Writer server at Windows login.'
$shortcut.Save()
Write-Output "Installed: $shortcutPath"
