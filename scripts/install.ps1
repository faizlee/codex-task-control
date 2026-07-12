param(
  [string]$CodexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }),
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'skill\codex-task-control'
$skillsRoot = Join-Path $CodexHome 'skills'
$target = Join-Path $skillsRoot 'codex-task-control'

if (-not (Test-Path -LiteralPath $source)) {
  throw "Skill source not found: $source"
}

if ((Test-Path -LiteralPath $target) -and -not $Force) {
  throw "Target already exists: $target. Re-run with -Force to replace it."
}

New-Item -ItemType Directory -Force -Path $skillsRoot | Out-Null
if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}
Copy-Item -LiteralPath $source -Destination $target -Recurse
Write-Output "Installed codex-task-control to $target"
