[CmdletBinding()]
param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot
if ($env:OS -ne 'Windows_NT') { throw 'This local deployment command requires Windows.' }
function Invoke-YarnStep([string[]]$StepArguments) {
    & corepack.cmd yarn @StepArguments
    if ($LASTEXITCODE -ne 0) { throw ('Build step failed: yarn ' + ($StepArguments -join ' ')) }
}
# Use the checked-in dependency snapshots; a local upgrade is not an upstream release.
Invoke-YarnStep @('check:desktop-variants')
Invoke-YarnStep @('workspace', 'dsh-community-market', 'build')
Invoke-YarnStep @('workspace', 'dsh-plugin-desktop', 'package:dir')
$staging = [IO.Path]::GetFullPath((Join-Path $repoRoot 'dsh-plugin-desktop\dist\win-unpacked'))
$destination = [IO.Path]::GetFullPath((Join-Path $repoRoot 'exe'))
$backups = [IO.Path]::GetFullPath((Join-Path $repoRoot '.local-data\build-backups'))
foreach ($candidate in @($staging, $destination, $backups)) {
    if (-not $candidate.StartsWith($repoRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Deployment path escaped the repository.'
    }
}
$stagedExe = Join-Path $staging 'DSH Desktop.exe'
if (-not (Test-Path -LiteralPath $stagedExe -PathType Leaf)) { throw 'Verified packaged executable is missing.' }
$markerPath = Join-Path $staging 'dsh-local-mode.json'
[IO.File]::WriteAllText($markerPath, "{`"version`":1}`n", (New-Object Text.UTF8Encoding($false)))
$exePath = Join-Path $destination 'DSH Desktop.exe'
$running = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $exePath })
if ($running.Count -gt 0) {
    Start-Process -FilePath $exePath -ArgumentList '--dsh-installer-quit' -WorkingDirectory $destination -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(45)
    do {
        Start-Sleep -Milliseconds 500
        $running = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $exePath })
    } while ($running.Count -gt 0 -and (Get-Date) -lt $deadline)
    if ($running.Count -gt 0) { throw 'Desktop did not finish shutting down; existing deployment was preserved.' }
}
New-Item -ItemType Directory -Path $backups -Force | Out-Null
$previous = Join-Path $backups ('exe-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$hadPrevious = Test-Path -LiteralPath $destination
if ($hadPrevious) { Move-Item -LiteralPath $destination -Destination $previous }
try {
    Move-Item -LiteralPath $staging -Destination $destination
} catch {
    if ($hadPrevious -and -not (Test-Path -LiteralPath $destination)) {
        Move-Item -LiteralPath $previous -Destination $destination
    }
    throw
}
Write-Output ('Local executable: ' + $exePath)
Write-Output ('Private data: ' + (Join-Path $repoRoot '.local-data'))
if ($hadPrevious) { Write-Output ('Previous executable: ' + $previous) }
if (-not $NoLaunch) { Start-Process -FilePath $exePath -WorkingDirectory $destination }
