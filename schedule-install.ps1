$ErrorActionPreference = 'Stop'
$taskName = 'FaciloadNpmInstall'
$arg = '/c cd /d C:\Faciload-master && "C:\Program Files\nodejs\npm.cmd" install --no-audit --no-fund > C:\Faciload-master\install3.log 2>&1'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $arg -WorkingDirectory 'C:\Faciload-master'
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Task started.'
