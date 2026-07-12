# Codex Task Control

An auditable, review-gated lifecycle ledger for Codex tasks and subagents.

GPT-5.6 can delegate aggressively. That is useful, but a large fan-out can also make model usage, ownership, and completion state hard to reason about. Codex Task Control adds a local control layer around visible tasks without replacing the rules already defined by each project.

> Windows-first v0.1 preview. The ledger is local and makes zero model-provider calls.

[简体中文](README.zh-CN.md)

## Why it exists

Codex Task Control is for workflows where a controller delegates visible work and needs evidence for four questions:

1. Who owns this task?
2. Which model and reasoning level were assigned?
3. Is the result still executing, awaiting review, accepted, or integrated?
4. Can a stale, duplicated, or misrouted event change the answer?

It records those facts in a project-isolated ledger and fails closed when identity or lifecycle evidence is ambiguous.

## What v0.1 does

- Keeps task registries isolated by normalized project root.
- Records direct parent, controller, model, reasoning level, and lifecycle state.
- Lets children query only themselves and emit completion or notification-failure artifacts.
- Reserves registration, review, acceptance, and integration transitions for controllers.
- Rejects unsafe identifiers, stale events, project mismatches, cycles, and contradictory state.
- Uses atomic registry replacement and conservative lock recovery.
- Keeps project-local `AGENTS.md`, workflows, tests, and acceptance rules authoritative.
- Runs ledger operations without calling a model provider.

## What v0.1 does not do

- It does not read or reset your Codex quota.
- It does not claim a fixed percentage of token savings.
- It does not automatically spawn, stop, or steer Codex tasks.
- It records model policy decisions but does not yet enforce model routing at spawn time.
- It is currently tested on Windows paths; cross-platform project-root handling is planned.

## Install

Requirements: Node.js 20 or newer and Codex.

PowerShell:

```powershell
git clone https://github.com/faizlee/codex-task-control.git
cd codex-task-control
pwsh -File .\scripts\install.ps1
```

To replace an existing installation:

```powershell
pwsh -File .\scripts\install.ps1 -Force
```

macOS/Linux can install the skill files, but the v0.1 ledger remains Windows-first:

```bash
./scripts/install.sh
```

The installer copies the skill to `${CODEX_HOME:-~/.codex}/skills/codex-task-control`. It does not edit your global `AGENTS.md` or live task ledger.

## Configure the controller policy

Copy the relevant rules from [`examples/AGENTS.md`](examples/AGENTS.md) into your user-level or project-level `AGENTS.md`. The essential policy is:

- Register visible child tasks before they start.
- Let a child notify only the direct parent stored in its record.
- Let only the controller accept, request changes, or integrate.
- Stop unregistered visible work instead of inventing lifecycle state.

## Quick start

Set a project root and the controller/child task IDs supplied by your Codex workflow:

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$TaskControl = "$CodexHome\skills\codex-task-control\scripts\task-control.mjs"

node $TaskControl register `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --parent "controller-1" `
  --title "Audit authentication flow" `
  --model "gpt-5.6-terra" `
  --thinking "low"

node $TaskControl query-self --self "worker-1"
node $TaskControl query-parent --self "worker-1"
```

When the child has a candidate:

```powershell
node $TaskControl complete `
  --self "worker-1" `
  --candidate-commit "candidate-auth-audit-v1"
```

The child stops at `awaiting_review`. The controller ingests the emitted event and owns the remaining transitions:

```text
executing -> awaiting_review -> accepted -> integrated
     \----> changes_requested -> awaiting_review
```

See [`skill/codex-task-control/references/lifecycle.md`](skill/codex-task-control/references/lifecycle.md) for the complete storage and event contract.

## Project adapters

Adapters contain references, not copied policy. Start from [`examples/project-adapter.json`](examples/project-adapter.json):

```json
{
  "projectRoot": "C:\\work\\example",
  "rulesSources": ["AGENTS.md"],
  "workflowSources": ["docs/WORKFLOW.md"],
  "modelRoutingSource": "config/codex-model-routing.json"
}
```

## Verify

```powershell
npm run check
npm test
```

The test suite uses temporary `CODEX_HOME` directories and verifies that the real live ledger is unchanged before and after the run.

## Roadmap

- Cross-platform project-root normalization.
- Complexity-based model and reasoning policy.
- Spawn-time routing enforcement.
- Fan-out, depth, and stop-point budgets.
- A local task/status dashboard.
- Optional usage-window telemetry when a reliable data source is available.

## License

MIT
