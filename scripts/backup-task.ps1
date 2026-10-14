param(
  [Parameter(Mandatory=$true)][string]$EnvFile,
  [string]$NodePath = 'node'
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskEnv = (Resolve-Path -LiteralPath $EnvFile).Path
$taskLog = Join-Path $taskRoot 'scheduled.backup.log'
$taskErrorLog = Join-Path $taskRoot 'scheduled.backup.errors.log'
Push-Location -LiteralPath $taskRoot
try {
  # Windows PowerShell 5 treats native stderr warnings as terminating errors
  # under ErrorAction Stop. Record both streams and use the actual exit code.
  $taskNode = (Resolve-Path -LiteralPath $NodePath).Path
  $taskScript = Join-Path $PSScriptRoot 'backup.mjs'
  $taskArguments = @("--env-file=`"$taskEnv`"", "`"$taskScript`"")
  $taskProcess = Start-Process -FilePath $taskNode -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $taskLog -RedirectStandardError $taskErrorLog
  if ($null -eq $taskProcess.ExitCode) { throw 'Backup process did not report an exit code.' }
  exit $taskProcess.ExitCode
} finally { Pop-Location }
