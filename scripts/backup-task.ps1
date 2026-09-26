param(
  [Parameter(Mandatory=$true)][string]$EnvFile,
  [string]$NodePath = 'node'
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskEnv = (Resolve-Path -LiteralPath $EnvFile).Path
$taskLog = Join-Path $taskRoot 'scheduled.backup.log'
Push-Location -LiteralPath $taskRoot
try {
  & $NodePath "--env-file=$taskEnv" (Join-Path $PSScriptRoot 'backup.mjs') *> $taskLog
  $taskExit = $LASTEXITCODE
  if ($taskExit -ne 0) { exit $taskExit }
} finally { Pop-Location }
