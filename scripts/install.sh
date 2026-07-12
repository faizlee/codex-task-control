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

if [[ -e "$target" && "${FORCE:-0}" != "1" ]]; then
  echo "Target already exists: $target. Re-run with FORCE=1 to replace it." >&2
  exit 1
fi

mkdir -p "$(dirname "$target")"
rm -rf "$target"
cp -R "$source_dir" "$target"
echo "Installed codex-task-control to $target"
