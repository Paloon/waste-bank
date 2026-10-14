param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [Parameter(Mandatory=$true)][string]$EnvFile,
  [Parameter(Mandatory=$true)][string]$OperationsDir,
  [Parameter(Mandatory=$true)][string]$NodePath,
  [switch]$PrepareOnly,
  [switch]$StartupScheduler
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Full-Path([string]$Value) {
  if ($Value -notmatch '^[A-Za-z]:[\\/]') { throw 'Use a full local Windows path.' }
  return [IO.Path]::GetFullPath($Value).TrimEnd([char]'\')
}
function Protect-Path([string]$Path, [bool]$Directory) {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  # Modify the existing DACL only. A fresh security descriptor can mark the
  # audit section for writing, which requires SeSecurityPrivilege on Windows.
  $acl = Get-Acl -LiteralPath $Path
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($existingRule in @($acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]))) {
    $acl.RemoveAccessRuleSpecific($existingRule)
  }
  foreach ($identity in @($sid, $system)) {
    if ($Directory) {
      $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    } else {
      $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')
    }
    $acl.AddAccessRule($rule)
  }
  # Write only sections modified above via .NET; Set-Acl can request SACL
  # privileges even when this installer never edits the audit section.
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.PSObject.Methods.Name -contains 'SetAccessControl') {
    $item.SetAccessControl($acl)
  } else {
    [IO.FileSystemAclExtensions]::SetAccessControl($item, $acl)
  }
}

$source = (Resolve-Path -LiteralPath (Full-Path $ProjectRoot)).Path
$sourceEnv = (Resolve-Path -LiteralPath (Full-Path $EnvFile)).Path
$node = (Resolve-Path -LiteralPath (Full-Path $NodePath)).Path
$operations = Full-Path $OperationsDir
$allowedOperations = Full-Path (Join-Path $env:LOCALAPPDATA 'WasteBankOperations')
if ($operations -ne $allowedOperations -and -not $operations.StartsWith($allowedOperations + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'OperationsDir must be LocalAppData/WasteBankOperations or a directory within it.'
}
if ($operations.Length -le 3 -or $operations -eq $source -or $operations.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'OperationsDir must be outside the project and must not be a drive root.'
}
# Refuse junctions/symlinks in the destination ancestry before creating or copying.
$ancestor = $operations
while ($ancestor) {
  if (Test-Path -LiteralPath $ancestor) {
    $entry = Get-Item -LiteralPath $ancestor -Force
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'OperationsDir must not traverse a junction or symlink.' }
  }
  $ancestor = Split-Path -Parent $ancestor
}
$version = & $node -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [version]$version -lt [version]'22.13.0') { throw 'Node.js 22.13 or newer is required.' }
$npm = Join-Path (Split-Path -Parent $node) 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) { throw 'NodePath must point to a Node installation with npm.' }

$files = @(
  'package.json', 'package-lock.json',
  'scripts/backup-task.ps1', 'scripts/backup.mjs', 'scripts/runtime.mjs',
  'scripts/scheduled-backup.mjs',
  'scripts/backup-scheduler.mjs', 'server/backup-schedule.js',
  'scripts/verify-recovery.mjs', 'scripts/check-status.mjs',
  'server/backup.js', 'server/cloud-store.js', 'server/config.js', 'server/control.js',
  'server/credentials.js', 'server/drive.js', 'server/errors.js', 'server/maintenance.js',
  'server/monitor.js', 'server/operations-health.js', 'server/reconcile.js',
  'server/reports.js', 'server/state.js', 'server/store.js',
  'shared/policy.js', 'shared/recycling.js', 'shared/time.js'
)
foreach ($relative in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $source $relative) -PathType Leaf)) { throw "Missing required runtime asset: $relative" }
}
# Parse without echoing credentials. Preserve the live local data location when
# moving the working directory; never copy student databases into this runtime.
$inspectEnv = @'
const fs = require('node:fs'), path = require('node:path'), { parseEnv } = require('node:util');
const e = parseEnv(fs.readFileSync(process.argv[1], 'utf8'));
if (!e.BACKUP_KEY || !e.SESSION_SECRET) throw Error('Operations env requires BACKUP_KEY and SESSION_SECRET');
const directory = path.resolve(process.argv[2], e.DATA_DIR || 'data');
if (!e.SUPABASE_URL && !fs.existsSync(path.join(directory, 'eco.sqlite'))) throw Error('Local DATA_DIR must contain the existing eco.sqlite database');
console.log(JSON.stringify({ directory }));
'@
$inspection = & $node -e $inspectEnv $sourceEnv $source
if ($LASTEXITCODE -ne 0) { throw 'Operations env validation failed.' }
$configuration = $inspection | ConvertFrom-Json

New-Item -ItemType Directory -Path $operations -Force | Out-Null
Protect-Path $operations $true
$runtime = Join-Path $operations 'runtime'
$backups = Join-Path $operations 'backups'
foreach ($directory in @($runtime, $backups)) {
  if (Test-Path -LiteralPath $directory) {
    if (((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Runtime or backup directory must not be a junction or symlink.' }
  }
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  Protect-Path $directory $true
}
foreach ($relative in $files) {
  $target = Join-Path $runtime $relative
  $parent = Split-Path -Parent $target
  if (Test-Path -LiteralPath $parent) {
    if (((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Runtime asset directory must not be a junction or symlink.' }
  }
  if (Test-Path -LiteralPath $target) {
    if (((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Runtime asset must not be a symlink.' }
  }
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  Protect-Path $parent $true
  Copy-Item -LiteralPath (Join-Path $source $relative) -Destination $target -Force
  Protect-Path $target $false
}
$protectedEnv = Join-Path $operations 'operations.env'
if (Test-Path -LiteralPath $protectedEnv) {
  if (((Get-Item -LiteralPath $protectedEnv -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Operations env must not be a symlink.' }
  Protect-Path $protectedEnv $false
}
$envText = [IO.File]::ReadAllText($sourceEnv)
# Final definitions override relative paths in the original env.
$dataValue = $configuration.directory.Replace('\', '/')
$backupValue = $backups.Replace('\', '/')
$envText += "`nDATA_DIR=`"$dataValue`"`nBACKUP_DIR=`"$backupValue`"`n"
[IO.File]::WriteAllText($protectedEnv, $envText, (New-Object Text.UTF8Encoding($false)))
Protect-Path $protectedEnv $false
$hiddenLauncher = Join-Path $runtime 'scripts\backup-launcher.vbs'
if (Test-Path -LiteralPath $hiddenLauncher) {
  if (((Get-Item -LiteralPath $hiddenLauncher -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Hidden launcher must not be a symlink.' }
}
$launcherSource = @'
Option Explicit
Dim shell, command, result, errorNumber, fso, log, runtimeRoot
Set fso = CreateObject("Scripting.FileSystemObject")
runtimeRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set log = fso.CreateTextFile(fso.BuildPath(runtimeRoot, "scheduled.launcher.status.log"), True, True)
log.WriteLine "start args=" & WScript.Arguments.Count
If WScript.Arguments.Count <> 3 Then
  log.WriteLine "invalid_argument_count code=2"
  log.Close
  WScript.Quit 2
End If
Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
Set shell = CreateObject("WScript.Shell")
command = Quote(WScript.Arguments(0)) & " " & Quote("--env-file=" & WScript.Arguments(1)) & " " & Quote(WScript.Arguments(2))
log.WriteLine "spawn"
On Error Resume Next
result = shell.Run(command, 0, True)
errorNumber = Err.Number
Err.Clear
On Error GoTo 0
If errorNumber <> 0 Then
  log.WriteLine "spawn_error code=" & errorNumber
  log.Close
  WScript.Quit 1
End If
log.WriteLine "completed code=" & result
log.Close
WScript.Quit result
'@
[IO.File]::WriteAllText($hiddenLauncher, $launcherSource, (New-Object Text.UnicodeEncoding($false, $true)))
Protect-Path $hiddenLauncher $false
Push-Location -LiteralPath $runtime
try {
  $modules = Join-Path $runtime 'node_modules'
  if (Test-Path -LiteralPath $modules) {
    if (((Get-Item -LiteralPath $modules -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Runtime node_modules must not be a junction or symlink.' }
  }
  & $node $npm ci --omit=dev --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Operations runtime dependency installation failed.' }
  # Import modules only: no runtime(), backups, migrations or live data writes.
  $importCheck = @'
await Promise.all(['./server/backup.js','./server/store.js','./server/cloud-store.js','./server/drive.js','./server/operations-health.js'].map(p => import(p)));
'@
  & $node --input-type=module -e $importCheck
  if ($LASTEXITCODE -ne 0) { throw 'Operations runtime import verification failed.' }
} finally { Pop-Location }

$taskName = 'WasteBank-DailyBackup'
if ($PrepareOnly) {
  Write-Output "Prepared operations runtime: $runtime"
  Write-Output 'No scheduled task registered and no backup executed.'
  return
}
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$runner = Join-Path $runtime 'scripts\backup-task.ps1'
$legacyArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -EnvFile "{1}" -NodePath "{2}"' -f $runner, $protectedEnv, $node
$backupScript = Join-Path $runtime 'scripts\scheduled-backup.mjs'
$legacyBackupScript = Join-Path $runtime 'scripts\backup.mjs'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$arguments = '//B //NoLogo "{0}" "{1}" "{2}" "{3}"' -f $hiddenLauncher, $node, $protectedEnv, $backupScript
$legacyVbsArguments = '//B //NoLogo "{0}" "{1}" "{2}" "{3}"' -f $hiddenLauncher, $node, $protectedEnv, $legacyBackupScript
$directArguments = '"--env-file={0}" "{1}"' -f $protectedEnv, $backupScript
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  try {
    if ($existing.Principal.UserId -match '^S-1-\d+(-\d+)+$') {
      $existingIdentity = New-Object Security.Principal.SecurityIdentifier($existing.Principal.UserId)
      $existingSid = $existingIdentity.Value
    } else {
      $existingIdentity = New-Object Security.Principal.NTAccount($existing.Principal.UserId)
      $existingSid = $existingIdentity.Translate([Security.Principal.SecurityIdentifier]).Value
    }
  } catch {
    throw 'Cannot resolve the existing task owner; inspect it before replacing it.'
  }
  $existingAction = @($existing.Actions)
  $recognizedAction = $false
  if ($existingAction.Count -eq 1) {
    $recognizedAction = (
      ([string]::Equals($existingAction[0].Execute, $wscript, [StringComparison]::OrdinalIgnoreCase) -and $existingAction[0].Arguments -ceq $arguments) -or
      ([string]::Equals($existingAction[0].Execute, $wscript, [StringComparison]::OrdinalIgnoreCase) -and $existingAction[0].Arguments -ceq $legacyVbsArguments) -or
      ([string]::Equals($existingAction[0].Execute, $powershell, [StringComparison]::OrdinalIgnoreCase) -and $existingAction[0].Arguments -ceq $legacyArguments) -or
      ([string]::Equals($existingAction[0].Execute, $node, [StringComparison]::OrdinalIgnoreCase) -and $existingAction[0].Arguments -ceq $directArguments)
    )
  }
  if ($existingSid -ne $currentSid -or -not $recognizedAction) {
    throw 'A different WasteBank-DailyBackup task already exists; inspect it before replacing it.'
  }
}
if ($StartupScheduler) {
  $startupFolder = [Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
  if (-not $startupFolder -or -not (Test-Path -LiteralPath $startupFolder -PathType Container)) {
    throw 'The current user Startup folder is unavailable.'
  }
  $startupEntry = Join-Path $startupFolder 'WBS-WasteBankBackup.vbs'
  $startupMarker = "' WasteBank own-user startup scheduler v1"
  if (Test-Path -LiteralPath $startupEntry) {
    if (((Get-Item -LiteralPath $startupEntry -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'Startup entry must not be a symlink.'
    }
    $startupOwner = (Get-Acl -LiteralPath $startupEntry).GetOwner([Security.Principal.SecurityIdentifier]).Value
    if ($startupOwner -ne $currentSid) {
      throw 'The existing startup entry is owned by a different account; inspect it before replacing it.'
    }
    $existingStartup = [IO.File]::ReadAllText($startupEntry)
    if (-not $existingStartup.StartsWith($startupMarker + "`n") -and -not $existingStartup.StartsWith($startupMarker + "`r`n")) {
      throw 'An unrelated WBS-WasteBankBackup.vbs startup entry exists; inspect it before replacing it.'
    }
  }
  # The same-SID/action validation above must pass before disabling this name.
  if ($existing -and $existing.State.ToString() -ne 'Disabled') {
    Disable-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null
  }
  $daemon = Join-Path $runtime 'scripts\backup-scheduler.mjs'
  $startupCommand = '"{0}" "--env-file={1}" "{2}"' -f $node, $protectedEnv, $daemon
  $startupCommandVbs = $startupCommand.Replace('"', '""')
  $startupSource = @"
$startupMarker
Option Explicit
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "$startupCommandVbs", 0, False
"@
  [IO.File]::WriteAllText($startupEntry, $startupSource, (New-Object Text.UnicodeEncoding($false, $true)))
  Protect-Path $startupEntry $false
  Write-Output "Installed current-user startup scheduler: $startupEntry"
  Write-Output 'Starts hidden at the next login; requires this user logged in and the computer awake. No daemon or backup started during installation.'
  return
}
# Node receives absolute env/script/data/backup paths, so it needs no Start In.
# WScript runs Node hidden and returns its exit code without PS5 parsing.
$action = New-ScheduledTaskAction -Execute $wscript -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At '08:00'
$principal = New-ScheduledTaskPrincipal -UserId $currentSid -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Waste Bank protected daily backup runtime; current user must be logged in and the computer awake.' -Force | Out-Null
Write-Output 'Registered WasteBank-DailyBackup daily at 08:00 (local computer time).'
Write-Output 'Requires this user logged in and the computer awake; catches up when available. No backup executed during installation.'
