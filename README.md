# Codex Task Control

An auditable, review-gated controller for user-visible Codex tasks that forbids internal subagents.

Frontier models are valuable for planning and review, but repetitive work can burn their quota unnecessarily. Codex Task Control keeps the frontier model in control, forbids invisible internal subagents, and routes justified mechanical work only to inspectable Codex tasks using economical models.

> Windows-first v0.6.0 preview. The ledger, contract checks, and routing preflights are local and make zero model-provider calls.

[简体中文](README.zh-CN.md)

![Codex Task Control demo](media/codex-task-control-demo.gif)

[MP4 version](media/codex-task-control-demo.mp4) · Generated from a real CLI flow in an isolated temporary ledger by [`demo/render_demo.py`](demo/render_demo.py).

## Why it exists

Codex Task Control is for workflows where a controller delegates visible work and needs evidence for four questions:

1. Who owns this task?
2. Which model and reasoning level were assigned?
3. Is the result still executing, awaiting review, accepted, or integrated?
4. Can a stale, duplicated, or misrouted event change the answer?

It records those facts in a project-isolated ledger and fails closed when identity or lifecycle evidence is ambiguous.

## What v0.6.0 does

- Keeps task registries isolated by normalized project root.
- Records direct parent, controller, execution surface, model class, reasoning level, quota justification, and lifecycle state.
- Rejects internal subagent execution and requires a user-visible Codex task/thread.
- Requires explicit delegation to an economical model with at least medium reasoning; low reasoning fails closed.
- Rejects delegation until decisions, scope, acceptance evidence, and forbidden decision boundaries are explicit.
- Requires every new task to be classified as `control_only`, `implementation`, or `visual_implementation`; implementation work binds a versioned JSON contract inside the project root.
- Snapshots the contract and SHA-256 digest, then rejects dispatch, progress, or completion if the worker changes reuse rules, forbidden paths, stages, evidence commands, error policy, or visual oracle.
- Requires named, ordered stage checkpoints with evidence references and rejects completion until every required stage is ingested for the current attempt.
- Returns contract version/digest plus completed and missing stages in completion and review surfaces; old registries remain readable as `legacy_unclassified` without read-only scans rewriting them.
- Hard-binds `repeatable` to `gpt-5.6-luna` and `bounded_reasoning` to `gpt-5.6-terra`; old or mismatched model names fail closed at registration.
- Hard-binds `repeatable` to medium reasoning and allows `bounded_reasoning` to use medium or high reasoning.
- Keeps `gpt-5.6-sol` at high reasoning by default, permits bounded medium control work, and gates xhigh/max behind a zero-provider `audit-controller-routing` preflight with explicit escalation evidence.
- Adds a read-only active-task model audit. Installers report legacy tasks without mutating their model identity or ledger history.
- Adds a read-only active-task thinking audit so legacy low-thinking workers remain visible without rewriting their identity.
- Adds a read-only terminal archive-backlog audit grouped by registered direct controller, with descendant-first ready actions and legacy metadata detection.
- Treats failed review as a stopped routing decision, not as running rework; permits one explicit mechanical retry and supports controller reclaim.
- Assigns readable hierarchical keys such as `01` and `01.1`, then synchronizes lifecycle titles in the Codex sidebar.
- Starts one replaceable heartbeat only after a real prompt dispatch, renews it from ingested progress, and recalculates it after completion/review work.
- Uses adaptive one-shot cadence: Luna repeatable 3 minutes, Terra medium 5 minutes, Terra high 10 minutes, and controller queues 5 minutes; simultaneous obligations take the shortest interval and stale generations no-op.
- Separates actionable cleanup from historical debt: a failed title/archive tool action stays auditable but no longer re-emits itself or keeps a heartbeat alive.
- Lets only the registered direct controller explicitly requeue a failed sidebar action with a recorded reason.
- Archives `integrated`, `blocked`, and `reclaimed` visible tasks after their descendants while retaining the complete ledger history.
- Lets children query only themselves and emit progress, completion, or notification-failure artifacts.
- Reserves registration, review, acceptance, and integration transitions for controllers.
- Rejects unsafe identifiers, stale events, project mismatches, cycles, and contradictory state.
- Uses atomic registry replacement and conservative lock recovery.
- Keeps project-local `AGENTS.md`, workflows, tests, and acceptance rules authoritative.
- Runs ledger operations without calling a model provider.

## What v0.6.0 does not do

- It does not read or reset your Codex quota.
- It does not claim a fixed percentage of token savings.
- It does not automatically spawn, stop, or steer Codex tasks.
- It cannot intercept a raw internal-subagent tool call made outside the skill; `AGENTS.md` must prohibit those calls.
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

macOS/Linux can install the skill files, but the v0.6.0 ledger remains Windows-first:

```bash
./scripts/install.sh
```

The installer copies the skill to `${CODEX_HOME:-~/.codex}/skills/codex-task-control`, then runs read-only model-routing, thinking-routing, and terminal archive-backlog audits. It does not edit your global `AGENTS.md` or live task ledger. Any reported legacy task must be handled by its registered direct controller.

## Configure the controller policy

Copy the relevant rules from [`examples/AGENTS.md`](examples/AGENTS.md) into your user-level or project-level `AGENTS.md`. The essential policy is:

- Never use internal Codex subagents or `spawn_agent`.
- Delegate only through a user-visible Codex task/thread.
- Register the visible task with a semantic title, synchronize the returned title action, send its work prompt, and record the successful dispatch to start the heartbeat.
- Classify the task explicitly; code/resource/UI/test changes require a project-owned implementation contract, and visual work also requires a visual oracle.
- Apply lifecycle title and archive actions returned by the controller heartbeat.
- Let a child notify only the direct parent stored in its record.
- Let only the controller accept, request changes, or integrate.
- Stop unregistered visible work instead of inventing lifecycle state.
- Keep Sol at high by default; require local preflight evidence before xhigh/max and never use those levels for mechanical work.

## Quick start

Set a project root and the controller/child task IDs supplied by your Codex workflow:

For implementation work, first copy [`implementation-contract.example.json`](skill/codex-task-control/assets/implementation-contract.example.json) into the project, replace its project-specific paths, stages, commands, and error policy, and commit or revision it. Visual work can start from [`visual-implementation-contract.example.json`](skill/codex-task-control/assets/visual-implementation-contract.example.json). The control plane validates structure and digest identity; project sources remain responsible for the actual implementation rules.

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$TaskControl = "$CodexHome\skills\codex-task-control\scripts\task-control.mjs"

node $TaskControl audit-controller-routing `
  --model "gpt-5.6-sol" `
  --thinking "xhigh" `
  --work-class "hard_arbitration" `
  --escalation-trigger "cross_module_contract_conflict" `
  --reason "Multiple modules encode incompatible contract boundaries."

$Registration = node $TaskControl register `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --parent "controller-1" `
  --title "Audit authentication flow" `
  --model "gpt-5.6-luna" `
  --thinking "medium" `
  --delegation "explicit" `
  --execution-surface "visible_task" `
  --model-class "economical" `
  --quota-reason "Mechanical work is cheaper than using the frontier controller." `
  --work-class "repeatable" `
  --decision-status "resolved" `
  --scope "Only update the named authentication tests." `
  --acceptance "Run the targeted authentication test successfully." `
  --forbidden-decisions "Do not change authentication contracts or error policy." `
  --task-mode "implementation" `
  --implementation-contract "docs/codex-task-contract.json"

$Registration = $Registration | ConvertFrom-Json
```

Registration returns a title such as `执行｜01 Audit authentication flow` and `dispatchAllowed: false`. The Codex controller must call its thread-title tool with the exact returned title, then acknowledge the real successful rename:

```powershell
node $TaskControl controller-record-title-synced `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --title $Registration.desiredThreadTitle

# Run only after the real work prompt was sent successfully. Apply the returned
# replace_controller_heartbeat action as a one-shot controller automation.
node $TaskControl controller-record-dispatched `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1"

node $TaskControl query-self --self "worker-1"
node $TaskControl query-parent --self "worker-1"
```

Do not record title success unless the Codex sidebar was actually renamed, and do not record dispatch unless the prompt was really sent. The worker may start only after `query-self` reports `dispatchAllowed: true`. Every returned heartbeat action replaces the controller's one-shot automation; terminal descendants archive before their parent while audit records remain on disk.

If a sidebar title/archive tool call fails, record the failure once. It becomes non-actionable audit debt and the heartbeat stops when no other work remains. The registered direct controller can deliberately requeue it later:

```powershell
node $TaskControl controller-retry-thread-action `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --action "set_thread_archived" `
  --reason "The Codex archive API is available again."
```

For a meaningful checkpoint, the child can emit progress and notify its direct parent. Successful ingestion renews the lease and invalidates the old generation:

```powershell
node $TaskControl progress `
  --self "worker-1" `
  --summary "Existing authentication path was reused and checked." `
  --stage "reuse-check" `
  --evidence-ref "diff-check=artifacts/diff-check.txt"
node $TaskControl controller-ingest-progress `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --event "<returned-event-path>"
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
                 \----> changes_requested (stopped / 待决)
                              \----> explicit mechanical rework (once)
                              \----> reclaimed by controller
```

See [`skill/codex-task-control/references/lifecycle.md`](skill/codex-task-control/references/lifecycle.md) for the complete storage and event contract.

After a failed review, record why and then make an explicit routing decision:

```powershell
node $TaskControl mark-changes-requested `
  --project-root "C:\work\example" --controller "controller-1" --thread "worker-1" `
  --failure-class "mechanical" --reason "A named assertion is missing."

# Only for the first mechanical failure:
node $TaskControl controller-dispatch-rework `
  --project-root "C:\work\example" --controller "controller-1" --thread "worker-1"

# For comprehension/judgment/spec failures, or after the retry:
node $TaskControl controller-reclaim `
  --project-root "C:\work\example" --controller "controller-1" --thread "worker-1" `
  --reason "The controller must resolve the contract boundary."
```

## Project adapters

Adapters contain references, not copied policy. Start from [`examples/project-adapter.json`](examples/project-adapter.json):

```json
{
  "projectRoot": "C:\\work\\example",
  "rulesSources": ["AGENTS.md"],
  "workflowSources": ["docs/WORKFLOW.md"]
}
```

Model, thinking, work-class, and lifecycle routing come only from the user-level skill; project adapters must not shadow them.

## Verify

```powershell
npm run check
npm test
```

The test suite uses temporary `CODEX_HOME` directories and verifies that the real live ledger is unchanged before and after the run.

## Roadmap

- Cross-platform project-root normalization.
- Optional project-specific model-name validation on top of work-class routing.
- Broader Codex task-surface compatibility beyond the current title/archive tools.
- Visible-task fan-out, depth, and stop-point budgets.
- A local task/status dashboard.
- Optional usage-window telemetry when a reliable data source is available.

## License

MIT
