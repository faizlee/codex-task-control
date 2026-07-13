#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/skill/codex-task-control"
codex_home="${CODEX_HOME:-$HOME/.codex}"
target="$codex_home/skills/codex-task-control"

if [[ ! -d "$source_dir" ]]; then
  echo "Skill source not found: $source_dir" >&2
  exit 1
fi

if archive_json="$(node "$target/scripts/task-control.mjs" audit-archive-backlog --codex-home "$codex_home")"; then
  printf '%s' "$archive_json" | node -e '
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      const audit = JSON.parse(raw);
      if (audit.backlogCount === 0) {
        console.log("Archive backlog audit: compliant (no terminal sidebar cleanup pending)");
        return;
      }
      console.error(`WARNING: Archive backlog audit found ${audit.backlogCount} terminal debt item(s) across ${audit.ownerCount} direct-controller plan(s); ${audit.readyActionCount} thread action(s) are ready now. Each recorded direct controller applies only returned actions. Failed or descendant-blocked debt stays auditable without keeping a heartbeat and requires an explicit owner retry when appropriate.`);
      for (const owner of audit.owners) console.error(`WARNING: [${owner.projectRoot}] controller=${owner.controllerThreadId} backlog=${owner.tasks.length} readyActions=${owner.threadActions.length}`);
    });
  '
else
  echo "WARNING: Skill installed, but archive backlog audit could not run." >&2
fi

if [[ -e "$target" && "${FORCE:-0}" != "1" ]]; then
  echo "Target already exists: $target. Re-run with FORCE=1 to replace it." >&2
  exit 1
fi

mkdir -p "$(dirname "$target")"
rm -rf "$target"
cp -R "$source_dir" "$target"
echo "Installed codex-task-control to $target"

if audit_json="$(node "$target/scripts/task-control.mjs" audit-model-routing --codex-home "$codex_home")"; then
  printf '%s' "$audit_json" | node -e '
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      const audit = JSON.parse(raw);
      if (audit.violationCount === 0) {
        console.log(`Model routing audit: compliant (${audit.activeTaskCount} active tasks checked)`);
        return;
      }
      console.error(`WARNING: Model routing audit found ${audit.violationCount} active legacy or mismatched task(s). Do not mutate their model identity; the registered direct controller must stop/reclaim each old task and register a new GPT-5.6 Luna/Terra task.`);
      for (const item of audit.violations) console.error(`WARNING: [${item.projectRoot}] ${item.threadId} model=${item.currentModel} workClass=${item.workClass} expected=${item.expectedModel} controller=${item.directControllerThreadId} reason=${item.reason}`);
    });
  '
else
  echo "WARNING: Skill installed, but model routing audit could not run." >&2
fi

if thinking_json="$(node "$target/scripts/task-control.mjs" audit-thinking-routing --codex-home "$codex_home")"; then
  printf '%s' "$thinking_json" | node -e '
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      const audit = JSON.parse(raw);
      if (audit.violationCount === 0) {
        console.log(`Thinking routing audit: compliant (${audit.activeTaskCount} active tasks checked)`);
        return;
      }
      console.error(`WARNING: Thinking routing audit found ${audit.violationCount} active legacy low or mismatched task(s). Do not mutate their thinking identity; the registered direct controller must stop/reclaim each old task and register a medium/high replacement.`);
      for (const item of audit.violations) console.error(`WARNING: [${item.projectRoot}] ${item.threadId} thinking=${item.currentThinking} workClass=${item.workClass} allowed=${item.allowedThinking?.join(",") ?? "unknown"} controller=${item.directControllerThreadId} reason=${item.reason}`);
    });
  '
else
  echo "WARNING: Skill installed, but thinking routing audit could not run." >&2
fi
