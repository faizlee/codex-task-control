param(
  [string]$CodexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }),
  [switch]$Force,
  [switch]$SyncUserAgents
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'skill\codex-task-control'
$skillsRoot = Join-Path $CodexHome 'skills'
$target = Join-Path $skillsRoot 'codex-task-control'
$sourceAuditScript = Join-Path $source 'scripts\task-control.mjs'

function Invoke-UserAgentsPolicyAudit {
  param([string]$AuditScript)
  $raw = & node $AuditScript audit-user-agents-policy --codex-home $CodexHome
  if ($LASTEXITCODE -ne 0) {
    throw "User AGENTS policy audit failed with exit code $LASTEXITCODE"
  }
  return ($raw | ConvertFrom-Json)
}

if (-not (Test-Path -LiteralPath $source)) {
  throw "Skill source not found: $source"
}

$policyAudit = Invoke-UserAgentsPolicyAudit -AuditScript $sourceAuditScript
if (-not $policyAudit.compliant) {
  if (-not $SyncUserAgents) {
    throw "User AGENTS policy is not compatible with this Skill ($($policyAudit.reason)). Installation stopped before replacing the Skill. Re-run with -SyncUserAgents only after the user explicitly authorizes this exact AGENTS.md update in the current conversation."
  }
  & node $sourceAuditScript sync-user-agents-policy --codex-home $CodexHome --authorization user_explicit_current_turn | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Authorized user AGENTS policy synchronization failed with exit code $LASTEXITCODE"
  }
  $policyAudit = Invoke-UserAgentsPolicyAudit -AuditScript $sourceAuditScript
  if (-not $policyAudit.compliant) {
    throw "User AGENTS policy remains incompatible after authorized synchronization: $($policyAudit.reason)"
  }
  Write-Output "Synchronized the managed parent-notification, adaptive-health, and controller-continuity rules in $($policyAudit.agentsPath)"
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
  $installedPolicyAudit = Invoke-UserAgentsPolicyAudit -AuditScript $auditScript
  if (-not $installedPolicyAudit.compliant) {
    throw "Installed Skill and user AGENTS policy disagree: $($installedPolicyAudit.reason)"
  }
  Write-Output "User AGENTS task-control policy: compliant (version $($installedPolicyAudit.policyVersion))"
} catch {
  throw "Skill copied, but the required user AGENTS policy verification failed: $($_.Exception.Message)"
}

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
  $thinkingAudit = (& node $auditScript audit-thinking-routing --codex-home $CodexHome | ConvertFrom-Json)
  if ($thinkingAudit.violationCount -eq 0) {
    Write-Output "Thinking routing audit: compliant ($($thinkingAudit.activeTaskCount) active tasks checked)"
  } else {
    Write-Warning "Thinking routing audit found $($thinkingAudit.violationCount) active legacy low or mismatched task(s). Do not mutate their thinking identity; the registered direct controller must stop/reclaim each old task and register a medium/high replacement."
    foreach ($violation in $thinkingAudit.violations) {
      Write-Warning "[$($violation.projectRoot)] $($violation.threadId) thinking=$($violation.currentThinking) workClass=$($violation.workClass) allowed=$($violation.allowedThinking -join ',') controller=$($violation.directControllerThreadId) reason=$($violation.reason)"
    }
  }
} catch {
  Write-Warning "Skill installed, but thinking routing audit could not run: $($_.Exception.Message)"
}

try {
  $archiveAudit = (& node $auditScript audit-archive-backlog --codex-home $CodexHome | ConvertFrom-Json)
  if ($archiveAudit.backlogCount -eq 0) {
    Write-Output "Archive backlog audit: compliant (no terminal sidebar cleanup pending)"
  } else {
    Write-Warning "Archive backlog audit found $($archiveAudit.backlogCount) terminal debt item(s) across $($archiveAudit.ownerCount) direct-controller plan(s); $($archiveAudit.readyActionCount) thread action(s) are ready now. Each recorded direct controller applies only returned actions. Failed or descendant-blocked debt stays auditable without keeping a heartbeat and requires an explicit owner retry when appropriate."
    foreach ($owner in $archiveAudit.owners) {
      Write-Warning "[$($owner.projectRoot)] controller=$($owner.controllerThreadId) backlog=$($owner.tasks.Count) readyActions=$($owner.threadActions.Count)"
    }
  }
} catch {
  Write-Warning "Skill installed, but archive backlog audit could not run: $($_.Exception.Message)"
}

try {
  $continuityAudit = (& node $auditScript audit-controller-continuity --codex-home $CodexHome | ConvertFrom-Json)
  if ($continuityAudit.unresolvedIncidentCount -eq 0) {
    Write-Output "Controller continuity audit: compliant ($($continuityAudit.incidentCount) resolved historical incident(s) retained)"
  } else {
    Write-Warning "Controller continuity audit found $($continuityAudit.unresolvedIncidentCount) unresolved controller lifecycle incident(s). Do not unarchive a terminal controller into ledger conflict; create a visible continuation, seal a predecessor checkpoint, and apply only the returned successor recovery."
    foreach ($incident in $continuityAudit.incidents) {
      Write-Warning "[$($incident.projectRoot)] predecessor=$($incident.predecessorThreadId) owner=$($incident.ownerControllerThreadId) violations=$($incident.violations -join ',') recoveryRequired=$($incident.recoveryRequired)"
    }
  }
} catch {
  Write-Warning "Skill installed, but controller continuity audit could not run: $($_.Exception.Message)"
}
