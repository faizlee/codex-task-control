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

$auditScript = Join-Path $target 'scripts\task-control.mjs'
try {
  $audit = (& node $auditScript audit-model-routing --codex-home $CodexHome | ConvertFrom-Json)
  if ($audit.violationCount -eq 0) {
    Write-Output "Model routing audit: compliant ($($audit.activeTaskCount) active tasks checked)"
  } else {
    Write-Warning "Model routing audit found $($audit.violationCount) active legacy or mismatched task(s). Do not mutate their model identity; the registered direct controller must stop/reclaim each old task and register a new GPT-5.6 Luna/Terra task."
    foreach ($violation in $audit.violations) {
      Write-Warning "[$($violation.projectRoot)] $($violation.threadId) model=$($violation.currentModel) workClass=$($violation.workClass) expected=$($violation.expectedModel) controller=$($violation.directControllerThreadId) reason=$($violation.reason)"
    }
  }
} catch {
  Write-Warning "Skill installed, but model routing audit could not run: $($_.Exception.Message)"
}

try {
  $archiveAudit = (& node $auditScript audit-archive-backlog --codex-home $CodexHome | ConvertFrom-Json)
  if ($archiveAudit.backlogCount -eq 0) {
    Write-Output "Archive backlog audit: compliant (no terminal sidebar cleanup pending)"
  } else {
    Write-Warning "Archive backlog audit found $($archiveAudit.backlogCount) terminal task(s) across $($archiveAudit.ownerCount) direct-controller plan(s); $($archiveAudit.readyActionCount) thread action(s) are ready now. Each recorded direct controller must apply descendant-first title/archive actions and record the result."
    foreach ($owner in $archiveAudit.owners) {
      Write-Warning "[$($owner.projectRoot)] controller=$($owner.controllerThreadId) backlog=$($owner.tasks.Count) readyActions=$($owner.threadActions.Count)"
    }
  }
} catch {
  Write-Warning "Skill installed, but archive backlog audit could not run: $($_.Exception.Message)"
}
