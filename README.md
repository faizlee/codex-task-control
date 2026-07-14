# Codex Task Control

An auditable, review-gated controller for user-visible Codex tasks that forbids internal subagents.

Frontier models are valuable for planning and review, but repetitive work can burn their quota unnecessarily. Codex Task Control keeps the frontier model in control, forbids invisible internal subagents, and routes justified mechanical work only to inspectable Codex tasks using economical models.

> Windows-first v0.11.0 preview. The ledger, contract/result checks, controller message queue, stall/fuse audits, delivery reports, heartbeat protocol, and routing preflights are local and make zero model-provider calls.

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

## What v0.11.0 does

- Lets a worker submit a first-class failed/blocked event before required stages finish, with attempted stage, classified cause, command summary, and evidence references.
- Audits stalled execution from lease/progress/attempt evidence even when no completion or ordinary message arrives.
- Defers ordinary controller-to-worker messages in the local ledger while the visible task is running or its turn state is unknown. Only an externally confirmed idle state releases a `send_thread_message` action, and delivery requires a matching action ID plus a real host receipt.
- Rejects ordinary interrupt/steer requests. Only an explicitly authorized `stop` or `cancel` can produce a `steer_thread_message` action, and a deferred message is cancelled instead of restarting a terminal task.
- Preserves stable objective identity across replacements and fails closed before r3 after two failed replacements or an exhausted time budget.
- Requires product-value evidence before a diagnostic may block a milestone; otherwise it remains non-blocking technical debt.
- Requires reclaim/block closeout with a user notification and refreshed delivery report before replacement.
- Ingests context-health receipts and blocks registration/dispatch when a controller requires a clean-thread handoff.
- Requires schema-v2 implementation contracts with explicit controller-owned `allowedWritePaths`; legacy schema-v1 tasks remain read-compatible.

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
- Uses two-phase heartbeat commit: prepare locally, create a new App automation, confirm/switch the ledger, then delete the retired automation. An App failure cannot advance the confirmed generation.
- Finalizes each controller cycle through one entry point. A terminal/quiescent controller with an unconfirmed replacement create receives a bounded `finalize_controller_cycle` action that compare-deletes that pending create and deletes the last confirmed automation.
- Reconciles an expired pending heartbeat action before later controller work. Registration, dispatch, rework, and the explicit business-readiness check fail closed while terminal heartbeat deletion remains unconfirmed.
- Uses adaptive `COUNT=1` cadence: Luna repeatable 3 minutes, Terra medium 5 minutes, Terra high 10 minutes, and controller queues 5 minutes; simultaneous obligations take the shortest interval.
- Turns stale, wrong-ID, expired, repeated, or misconfigured heartbeat invocations into an empty-queue `delete_stale_automation` path instead of a silent infinite loop.
- Persists last successful generation, automation ID, pending action, trigger/stale/delete-failure counts, fuse evidence, and one-time notification state.
- Requires schema-versioned result manifests for newly registered implementation tasks. They capture the candidate commit, user-visible outcome, actual changes, incomplete items, readable tests/metrics, and typed artifact references.
- Validates visual presentation artifacts before completion: required stage/type/milestone, ownership, allowlisted roots, file existence, non-zero size, SHA-256 uniqueness, and decodable PNG/JPEG/GIF dimensions.
- Appends every attempt to immutable deliverable history, keeps rejected/reclaimed/blocked evidence visibly failed, and distinguishes candidate, accepted-not-integrated, and integrated outcomes.
- Builds a deterministic, mobile-friendly disk report at `$CODEX_HOME/task-control/reports/<project-key>/<controller-thread-id>/index.html` without writing into the project repository.
- Separates actionable cleanup from historical debt: a failed title/archive tool action stays auditable but no longer re-emits itself or keeps a heartbeat alive.
- Lets only the registered direct controller explicitly requeue a failed sidebar action with a recorded reason.
- Archives `integrated`, `blocked`, and `reclaimed` visible tasks after their descendants while retaining the complete ledger history.
- Lets children query only themselves and emit progress, completion, or notification-failure artifacts.
- Reserves registration, review, acceptance, and integration transitions for controllers.
- Rejects unsafe identifiers, stale events, project mismatches, cycles, and contradictory state.
- Uses atomic registry replacement and conservative lock recovery.
- Keeps project-local `AGENTS.md`, workflows, tests, and acceptance rules authoritative.
- Runs ledger operations without calling a model provider.

## What v0.11.0 does not do

- It does not read or reset your Codex quota.
- It does not claim a fixed percentage of token savings.
- It does not automatically spawn, stop, send to, or steer Codex tasks; it returns identity-scoped host actions and records their real receipts.
- The current programmatic Codex App message tool does not expose an explicit queue/steer mode or a queue acknowledgement. Therefore v0.11.0 safely defers a running-task message locally instead of claiming it reached the App queue. A future host API can replace this fallback with native queue delivery plus an explicit receipt.
- It cannot intercept a raw internal-subagent tool call made outside the skill; `AGENTS.md` must prohibit those calls.
- It cannot make Codex App compare-and-delete an automation before a heartbeat message enters model context, atomically defer a scheduled message during an active turn, or cancel a host tool call that has already hung. The skill now blocks later controlled business actions and returns bounded cleanup selectors, but a host-native compare-and-delete/defer hook remains the complete fix.
- It does not decide whether a screenshot looks good. The project visual oracle and registered direct controller still own visual judgment and acceptance.
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

macOS/Linux can install the skill files, but the v0.11.0 ledger remains Windows-first:

```bash
./scripts/install.sh
```

The installer copies the skill to `${CODEX_HOME:-~/.codex}/skills/codex-task-control`, then runs read-only model-routing, thinking-routing, and terminal archive-backlog audits. It does not edit your global `AGENTS.md` or live task ledger. Any reported legacy task must be handled by its registered direct controller.

## Configure the controller policy

Copy the relevant rules from [`examples/AGENTS.md`](examples/AGENTS.md) into your user-level or project-level `AGENTS.md`. The essential policy is:

- Never use internal Codex subagents or `spawn_agent`.
- Delegate only through a user-visible Codex task/thread.
- Register the visible task with a semantic title, synchronize the returned title action, send its work prompt, and record the successful dispatch to start the heartbeat.
- Route later controller messages through `controller-prepare-message`. While a target turn is running or unknown, do not call the host send tool; release only after a real idle observation. Reserve interrupt for authorized stop/cancel.
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

# Run only after the real work prompt was sent successfully. This prepares a
# create_controller_heartbeat action but does not advance confirmed generation.
node $TaskControl controller-record-dispatched `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1"

node $TaskControl query-self --self "worker-1"
node $TaskControl query-parent --self "worker-1"
```

Do not record title success unless the Codex sidebar was actually renamed, and do not record dispatch unless the prompt was really sent. For every prepared heartbeat action, create a new `COUNT=1` automation whose prompt contains the action ID and generation, confirm the returned new ID with `controller-confirm-heartbeat-action`, then delete the returned retired ID. On App error or a 30-second timeout, call `controller-record-heartbeat-action-failed`; do not advance or fabricate success. Terminal descendants archive before their parent while audit records remain on disk.

Later messages use a separate prepare/release/receipt protocol. A running target returns `deferred_local` and no host action. After independently observing the task as idle, release it, execute the returned action, and record the real receipt:

```powershell
$Queued = node $TaskControl controller-prepare-message --project-root "C:\work\example" --controller "controller-1" --thread "worker-1" --kind follow_up --delivery-mode queue --target-turn-state running --message "Run the already-approved extra check." | ConvertFrom-Json
$Prepared = node $TaskControl controller-release-message --project-root "C:\work\example" --controller "controller-1" --message-id $Queued.messageId --target-turn-state idle | ConvertFrom-Json
# Call the host send tool only now, then use its real success receipt:
node $TaskControl controller-record-message-delivery --project-root "C:\work\example" --controller "controller-1" --message-id $Prepared.messageId --action-id $Prepared.actionId --outcome delivered --receipt "host-send-receipt"
```

At the end of every controller reconciliation, call the single cycle finalizer before returning to project work:

```powershell
node $TaskControl controller-finalize-cycle `
  --project-root "C:\work\example" `
  --controller "controller-1"

node $TaskControl controller-assert-business-ready `
  --project-root "C:\work\example" `
  --controller "controller-1"
```

Apply the finalizer's host action before continuing. For `finalize_controller_cycle`, compare-delete the superseded create by its exact action ID and generation, delete the exact previously confirmed automation ID, then confirm with `--pending-create-cleanup-outcome deleted|not_found`. If either host operation times out, record failure; do not register, dispatch, or resume project business under that controller.

New implementation contracts must also include `resultRequirements`. At completion the worker supplies a project-owned result manifest; the controller then reviews and builds the historical report:

```powershell
node $TaskControl complete --self "worker-1" --candidate-commit "candidate-v1" --result-manifest "docs/test-reports/task-result.json"
node $TaskControl mark-accepted --project-root "C:\work\example" --controller "controller-1" --thread "worker-1" --reason "Contract and visual oracle passed." --selected-artifact "after"
node $TaskControl controller-query-deliverables --project-root "C:\work\example" --controller "controller-1"
node $TaskControl controller-build-delivery-report --project-root "C:\work\example" --controller "controller-1"
```

Use [`assets/result-manifest.example.json`](skill/codex-task-control/assets/result-manifest.example.json) for non-visual work and [`assets/visual-result-manifest.example.json`](skill/codex-task-control/assets/visual-result-manifest.example.json) for visual work. Old tasks remain readable and show “historical evidence unavailable” when no trustworthy artifacts exist.

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
