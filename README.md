# Codex Task Control

An auditable, review-gated controller for user-visible Codex tasks that forbids internal subagents.

Frontier models are valuable for planning and review, but repetitive work can burn their quota unnecessarily. Codex Task Control keeps the frontier model in control, forbids invisible internal subagents, and routes justified mechanical work only to inspectable Codex tasks using economical models.

> Windows-first v0.23.0 preview. Long-lived project/topic controllers now have explicit identities, protected lifecycle gates, continuity audits, and an immutable successor-recovery path for accidental terminal closure. Adaptive one-shot health review and event-first queued notifications remain unchanged. The tool makes zero model-provider calls.

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

## What v0.23.0 does

- Keeps one `COUNT=1` heartbeat per direct controller; event ingestion and due health review share it instead of creating a second timer.
- Returns schema-v1 `taskHealthReview` with `healthy`, `at_risk`, `stalled`, `blocked_controller`, `blocked_user`, `runaway`, and `idle` states plus reasons and a bounded next action.
- Counts only durable stage/evidence/test/candidate/completion/failure or narrowed-blocker changes as meaningful progress. Repeated commands, rephrased errors, generic “still working” text, and title/archive bookkeeping do not reset the watchdog.
- Registers long-lived `project_controller` and `topic_controller` identities before they own work. A protected controller thread cannot be registered, completed, accepted, integrated, or archived through the ordinary worker lifecycle.
- Extends an accepted handoff into an identity chain with stable topic, title, generation, predecessor, and successor. Without an accepted successor, termination requires a sealed checkpoint and current-turn user authority.
- Audits terminal or archived controller-shaped tasks, one-off title repurposing, and controller closure through the worker lifecycle. Recovery continues the old conversation into a new visible task and records a successor generation without rewriting old task evidence.
- Keeps recovery and closeout open after a no-progress fuse, but blocks new registration/dispatch until cleanup and an explicit watchdog resume.

- Writes worker progress, completion, and failure events before considering a parent notification. `running` or `unknown` parents receive `deferred_parent` with no host action; only confirmed `idle` returns `send_thread_message`.
- Distinguishes `observed` from `sent`: direct-parent heartbeat/scan ingestion is enough to observe a deferred result, while `sent` still requires a real host delivery receipt.
- Adds a read-only user `AGENTS.md` policy audit. Authorized installation can synchronize only the marked parent-notification and adaptive-health rules; drift otherwise stops installation before the existing Skill is replaced.

- Extends the backward-compatible `query-parent` command with `--context-mode preload`: startup receives only the direct parent's verified `always` checkpoint facts, or a non-blocking `unavailable` result when no checkpoint exists.
- Adds read-only `query-parent-context`. It returns a bounded host `read_thread` action for the registered direct parent, starting with three completed turns and no tool outputs; older pages are followed only while they add relevant evidence.
- Keeps raw parent history advisory. It cannot override project rules, the ledger, current scope, forbidden decisions, worktree identity, or confirmed checkpoint authority. Nested workers never inherit a root controller checkpoint through their direct parent.
- Does not require a reading report, progress event, notification, or extra model turn. Ordinary parallel workers are never created by full-history fork.
- Seals 1-12 concise, authority-tagged facts into immutable files under `$CODEX_HOME/task-control/checkpoints/` without copying prompts, responses, tool output, or project content.
- Preloads only confirmed `always` facts by default. Candidate, failure, dispute, and superseded evidence remains available through explicit point/full queries.
- Requires a quiescent controller before handoff: no active or undispatched child, review/closeout/thread-action debt, open batch, deferred message, or heartbeat debt. Prepared handoff is cancellable and keeps no heartbeat; accepted handoff registers the successor root and retires the source.
- Treats schema-v2 checkpoint/handoff health states as advice. Context ratio, compaction count, average input, and TTFT do not become automatic blocking thresholds; legacy schema-v1 `handoff_required` remains readable.

- Fingerprints business lifecycle state on each valid watchdog cycle. Two consecutive cycles without a task, event, review, message, or parallel-batch change fuse automatic rearm and notify once.
- Treats a fired `COUNT=1` automation as consumed. Real progress resets the no-progress counter and prepares a fresh one-shot instead of incorrectly extending an already-fired physical watchdog.
- Allows one automatic heartbeat-delete compensation. A second failure becomes `manual_heartbeat_cleanup_required`; it never creates another automatic retry, and business commands remain available.
- Adds `controller-resume-watchdog --reason ...`. Resume requires the old automation to be confirmed cleaned and records the manual recovery reason before a new one-shot can be created.

- Prepares rework without incrementing the attempt. `controller-confirm-rework-dispatched` advances lifecycle only after a real host delivery receipt; cancellation and zombie-attempt recovery remain available independently of heartbeat health.
- Requires implementation failures to bind a controller-fixed evidence command before they become lifecycle-authoritative. Ad-hoc command failures remain non-authoritative diagnostics.
- Keeps heartbeat cleanup auditable but outside recovery paths. Real progress, failure, and completion reschedule the one-shot from the event time through create/confirm/retire; no in-place replacement is allowed.
- Requires parallel candidates to have incremental value, while allowing a started batch to shrink naturally after a peer reaches a terminal state.
- Separates verified business deliveries, candidate commits, and passed control reviews in the HTML executive summary; zero verified delivery is stated explicitly.

- Crops each diagnostic to the ledger's dispatch-to-execution-end window. Conversation time before dispatch or after execution is shown separately as task-external idle and never contributes to task anomalies.
- Computes the unassigned ratio only inside paired active turns. Time between turns remains a separate task-window observation and is never renamed model reasoning, network, queueing, or service work.
- Allows a worker to create the next ordered stage event while one unique, valid predecessor event is still awaiting direct-controller ingestion. Central stage completion and final completion remain blocked until the controller ingests every stage in order.
- Requires implementation integration to prove with Git that the recorded candidate commit is an ancestor of the declared target ref (default `HEAD`). Legacy integrated records remain readable but render as Git-unverified rather than trusted integration.

- Piggybacks schema-v1 observability receipts on registration, dispatch, real progress ingestion, failure/completion, review, integration, and archive. It creates no extra worker command or progress event.
- Keeps `lean` reporting as the default: it reads only the existing ledger and never loads rollout, Desktop, or OTel data.
- Adds an on-demand `diagnostic` report that reuses the installed `codex-time-diagnostics` analyzer, discovers the exact visible-task rollout, and optionally reads an explicitly supplied local OTel/Desktop source.
- Separates ledger dispatch-window overlap from paired completed-turn overlap, so planned or merely dispatched concurrency is never mislabeled as actual simultaneous active turns.
- Shows per-task model/thinking, attempts, lifecycle timing, completed-turn active union, tool/TTFT/context/compaction/retry evidence, directly observed completed-response tokens, and account-level quota snapshots with explicit attribution limits.
- Writes on-demand diagnostics to `diagnostic.html`; the normal deterministic `index.html` remains available for closeout refreshes and never keeps a heartbeat alive.
- Renders fixed report terminology in Chinese, keeps necessary model/protocol identifiers beside a Chinese explanation, marks untranslated free-form English records, formats large values as `万`/`亿` with exact counts, and adds task-relative consumption bars without calling a model.
- Describes completed-response tokens as already-observed cumulative processing, never as OTel overhead or an exact Codex quota bill.

- Plans schema-v1 `parallel_batch` objects before task creation, with candidate lanes, dependencies, conflict domains, WIP limits, review capacity, and implementation worktree identity.
- Requires at least two independent candidates when capacity allows. A single-task fallback needs a typed degradation receipt with evidence; an implementation plus independent QA/no-code/readonly candidate cannot silently collapse to one code task.
- Prepares a durable multi-task dispatch wave before prompts are sent. A partial host send remains visible and blocks unrelated controlled work until every required task is recorded.
- Recomputes fan-out after lifecycle boundaries and exposes idle slots, eligible candidates, blockers, pending dispatches, and batch replan state in controller scans.
- Keeps exactly one heartbeat per direct controller for the entire batch. Merely planned or unresolved single-candidate work does not create an empty wake-up loop.

- Lets a worker submit a first-class failed/blocked event before required stages finish, with attempted stage, classified cause, command summary, and evidence references.
- Audits stalled execution from lease/progress/attempt evidence even when no completion or ordinary message arrives.
- Defers ordinary controller-to-worker messages in the local ledger while the visible task is running or its turn state is unknown. Only an externally confirmed idle state releases a `send_thread_message` action, and delivery requires a matching action ID plus a real host receipt.
- Applies the same non-interruption rule in the reverse direction. Worker lifecycle commands default the parent state to `unknown`, so omitting state is safe and cannot inject a new turn into an active controller.
- Rejects ordinary interrupt/steer requests. Only an explicitly authorized `stop` or `cancel` can produce a `steer_thread_message` action, and a deferred message is cancelled instead of restarting a terminal task.
- Preserves stable objective identity across replacements and fails closed before r3 after two failed replacements or an exhausted time budget.
- Requires product-value evidence before a diagnostic may block a milestone; otherwise it remains non-blocking technical debt.
- Requires reclaim/block closeout with a user notification and refreshed delivery report before replacement.
- Ingests schema-v2 advisory context receipts without blocking; only legacy schema-v1 `handoff_required` keeps its fail-closed behavior.
- Defaults implementation work to a schema-v1 adaptive brief: inspect the real path first, let the worker choose implementation and validation, and report actual affected files plus evidence.
- Allows schema-v3 hard contracts only for irreversible risk, shared conflicts, explicit parallel coordination, or explicit user authority. Hard contracts cannot make one validator conclusive or use headless execution as GUI/screenshot proof.

- Keeps task registries isolated by normalized project root.
- Records direct parent, controller, execution surface, model class, reasoning level, quota justification, and lifecycle state.
- Rejects internal subagent execution and requires a user-visible Codex task/thread.
- Requires explicit delegation to an economical model with at least medium reasoning; low reasoning fails closed.
- Rejects delegation until decisions, scope, acceptance evidence, and forbidden decision boundaries are explicit.
- Requires every new task to be classified as `control_only`, `implementation`, or `visual_implementation`; implementation work defaults to an adaptive brief and schema-v2 outcome evidence.
- Defaults adaptive work to `bounded_incidental`: a local, reversible, same-objective and same-functional-domain defect discovered during acceptance can be fixed in the same task after a structured RED/GREEN repair receipt. It does not count as failure, retry, replacement, or fuse input. Unlisted owner files are allowed only when reported with reasons in the receipt and final result manifest.
- Rejects incidental repair for strict scope, hard contracts, cross-conflict-domain work, forbidden decisions, product rules, architecture/trust, safety, economy, save data, external effects, irreversible migration, dependency decisions, or an unprovable boundary.
- Uses the registered candidate worktree as result authority for parallel implementation/visual tasks. Manifest and artifact paths are checked against its real path, repository, branch, base/last-sync ancestry, and candidate HEAD; neighboring directories and identity drift are rejected. Main-workspace tasks still use `projectRoot`.
- Provides a completion-only recovery for an already-finished candidate stopped solely by an older task-control tooling/contract bug. The original failure stays in history; the exact candidate and manifest are frozen, no business rerun is allowed, and the recovery does not consume mechanical retry, replacement, or objective fuse.
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
- Returns bounded compensation for expired heartbeat actions without letting host cleanup block failure ingestion, reclaim, recovery, or unrelated registration. Partial parallel send waves remain fail-closed.
- Uses adaptive `COUNT=1` cadence: one ordinary Luna/Terra-medium task 15 minutes, concurrent work 10 minutes, one Terra-high task 25 minutes, and risk/failure/review/routing/closeout queues 5 minutes.
- Turns the first stale, wrong-ID, expired, repeated, or misconfigured heartbeat invocation into an empty-queue `delete_stale_automation` path; a repeated failure becomes manual-only instead of another automatic loop.
- Persists last successful generation, automation ID, pending action, trigger/stale/delete-failure/no-progress counts, business fingerprint, fuse evidence, manual-resume reason, and one-time notification state.
- Requires schema-v2 result manifests for new implementation tasks. They capture the candidate commit, actual affected files and reasons, worker-selected validation rationale, incomplete items, tests/metrics, and typed artifact references.
- Validates visual presentation artifacts before completion: required stage/type/milestone, ownership, allowlisted roots, file existence, non-zero size, SHA-256 uniqueness, and decodable PNG/JPEG/GIF dimensions.
- Appends every attempt to immutable deliverable history, keeps rejected/reclaimed/blocked evidence visibly failed, and distinguishes candidate, accepted-not-integrated, and integrated outcomes.
- Builds a deterministic, mobile-friendly disk report at `$CODEX_HOME/task-control/reports/<project-key>/<controller-thread-id>/index.html` without writing into the project repository.
- Separates actionable cleanup from historical debt: a failed title/archive tool action stays auditable but no longer re-emits itself or keeps a heartbeat alive.
- Lets only the registered direct controller explicitly requeue a failed sidebar action with a recorded reason.
- Archives `integrated`, `blocked`, and `reclaimed` visible tasks after their descendants while retaining the complete ledger history.
- Lets children query themselves, preload confirmed direct-parent checkpoint facts, and request bounded completed-turn history only from that direct parent; lifecycle writes remain limited to their own artifacts.
- Reserves registration, review, acceptance, and integration transitions for controllers.
- Rejects unsafe identifiers, stale events, project mismatches, cycles, and contradictory state.
- Uses atomic registry replacement and conservative lock recovery.
- Keeps project-local `AGENTS.md`, workflows, tests, and acceptance rules authoritative.
- Runs ledger operations without calling a model provider.

## What v0.23.0 does not do

- It does not read or reset your Codex quota.
- It does not claim a fixed percentage of token savings.
- It does not automatically spawn, stop, send to, or steer Codex tasks; it returns identity-scoped host actions and records their real receipts.
- The current programmatic Codex App message tool does not expose an explicit queue/steer mode, an atomic multi-task send, or a queue acknowledgement. v0.23.0 therefore persists dispatch waves and both message directions locally; a future host API can replace this compensation layer with native batch/queue delivery plus explicit receipts.
- It cannot intercept a raw internal-subagent tool call made outside the skill; `AGENTS.md` must prohibit those calls.
- It cannot make Codex App compare-and-delete an automation before a heartbeat message enters model context, atomically defer a scheduled message during an active turn, or cancel a host tool call that has already hung. v0.23.0 accepts a possible extra wake, keeps business recovery open, and stops automatic rearm after bounded evidence. A host-native hook would remove that remaining wake but is not required for loop safety.
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

If this release reports that the managed parent-notification or adaptive-health rule in the user-level `AGENTS.md` is missing or stale, obtain explicit user authorization in the current conversation, then run:

```powershell
pwsh -File .\scripts\install.ps1 -Force -SyncUserAgents
```

Without that flag, the audit is read-only and installation fails before replacing the existing Skill. With the authorized flag, only the marked parent-notification block is changed; project files and the live task ledger are untouched.

macOS/Linux can install the skill files, but the v0.23.0 ledger remains Windows-first:

```bash
./scripts/install.sh
```

The installer first audits the managed user-level task-control policy block, copies the skill to `${CODEX_HOME:-~/.codex}/skills/codex-task-control`, verifies the block again, then runs read-only model-routing, thinking-routing, terminal archive-backlog, and controller-continuity audits. It never edits the live task ledger. Any reported legacy task must be handled by its registered direct controller.

## Configure the controller policy

Copy the relevant rules from [`examples/AGENTS.md`](examples/AGENTS.md) into your user-level or project-level `AGENTS.md`. The essential policy is:

- Never use internal Codex subagents or `spawn_agent`.
- Delegate only through a user-visible Codex task/thread.
- Plan a parallel batch before task shells. Require two safe candidates by default, or record a typed and evidenced degradation reason.
- Register every selected candidate, sync all titles, then prepare and complete one dispatch wave. Do not silently send only the first candidate.
- Register the visible task with a semantic title, synchronize the returned title action, send its work prompt, and record the successful dispatch to start the heartbeat.
- Route later controller messages through `controller-prepare-message`. While a target turn is running or unknown, do not call the host send tool; release only after a real idle observation. Reserve interrupt for authorized stop/cancel.
- Classify the task explicitly; code/resource/UI/test changes default to an adaptive brief. Add a hard contract only with an allowed risk trigger and reason.
- Apply lifecycle title and archive actions returned by the controller heartbeat.
- Let a child notify only the direct parent stored in its record.
- Let only the controller accept, request changes, or integrate.
- Stop unregistered visible work instead of inventing lifecycle state.
- Keep Sol at high by default; require local preflight evidence before xhigh/max and never use those levels for mechanical work.

## Quick start

Set a project root and the controller/child task IDs supplied by your Codex workflow:

Prepare the parallel batch first. Ordinary implementation work uses the adaptive brief built from registration; use [`implementation-brief.example.json`](skill/codex-task-control/assets/implementation-brief.example.json) only when extra non-binding exploration or validation hints help. Use hard-contract examples only after recording an allowed risk trigger.

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$TaskControl = "$CodexHome\skills\codex-task-control\scripts\task-control.mjs"

node $TaskControl audit-controller-routing `
  --model "gpt-5.6-sol" `
  --thinking "xhigh" `
  --work-class "hard_arbitration" `
  --escalation-trigger "cross_module_contract_conflict" `
  --reason "Multiple modules encode incompatible contract boundaries."

node $TaskControl controller-plan-parallel-batch `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --manifest "docs/codex-parallel-batch.json"

$Registration = node $TaskControl register `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --parent "controller-1" `
  --title "Implement bounded authentication change" `
  --model "gpt-5.6-terra" `
  --thinking "medium" `
  --delegation "explicit" `
  --execution-surface "visible_task" `
  --model-class "economical" `
  --quota-reason "Bounded implementation is cheaper than using the frontier controller." `
  --work-class "bounded_reasoning" `
  --decision-status "resolved" `
  --scope "Only update the named authentication tests." `
  --acceptance "Run the targeted authentication test successfully." `
  --forbidden-decisions "Do not change authentication contracts or error policy." `
  --task-mode "implementation" `
  --execution-policy "adaptive_brief" `
  --scope-policy "bounded_incidental" `
  --parallel-policy "batch_v1" `
  --batch-id "auth-batch" `
  --candidate-id "auth-code"

$Registration = $Registration | ConvertFrom-Json
```

Registration returns a title such as `执行｜01 Audit authentication flow` and `dispatchAllowed: false`. The Codex controller must call its thread-title tool with the exact returned title, then acknowledge the real successful rename:

```powershell
node $TaskControl controller-record-title-synced `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1" `
  --title $Registration.desiredThreadTitle

# Repeat registration and title sync for every candidate selected by the fan-out
# gate, then prepare one durable dispatch wave before sending any prompt.
node $TaskControl controller-prepare-parallel-dispatch `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --batch-id "auth-batch"

# Send every returned task prompt. Record each only after its real send succeeds.
node $TaskControl controller-record-dispatched `
  --project-root "C:\work\example" `
  --controller "controller-1" `
  --thread "worker-1"

node $TaskControl query-self --self "worker-1"
node $TaskControl query-parent --self "worker-1" --context-mode preload

# Only when prior controller history is materially useful:
node $TaskControl query-parent-context --self "worker-1" --reason "The unexpected framebuffer result may already have an approved recovery route."

# Expand one indexed checkpoint fact without reading the conversation:
node $TaskControl query-parent-context --self "worker-1" --reason "Inspect the indexed rejected route." --point "old-failure"
```

If acceptance exposes a small same-domain defect, the worker records it and continues without a new task. Any protected risk flag makes the command fail closed:

```powershell
node $TaskControl incidental-repair --self "worker-1" --repair-id "result-button-route" --original-blocker "The result overlay consumes the button click." --same-objective-reason "Restores the same result-flow acceptance." --functional-domain "result-ui" --affected-file "ui/ResultOverlay.gd|modified|Real input-routing owner found during exploration." --local-only true --reversible true --risk-assessment "Local input fix; no product, save, economy, dependency, or external decision." --red-evidence-ref "red=artifacts/click-blocked.png" --green-evidence-ref "green=artifacts/click-advances.png"
node $TaskControl controller-ingest-incidental-repair --project-root "C:\work\example" --controller "controller-1" --event "<returned event path>"
```

If an older task-control protocol already stopped a valid registered-worktree candidate, the direct controller may reopen only its frozen completion after installing the fixed version:

```powershell
node $TaskControl controller-recover-control-plane-candidate --project-root "C:\work\example" --controller "controller-1" --thread "worker-1" --control-plane-component "task_control_protocol" --candidate-commit "<sha>" --result-manifest "docs/test-reports/result-manifest-v2.json" --skill-version "0.23.0" --reason "v0.23.0 preserves registered worktree result authority; business scope and evidence are unchanged." --host-receipt "<real controller approval receipt>"
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

At completion the worker supplies a project-owned schema-v2 result manifest; the controller then reviews actual files, reasons, validation choices, and historical evidence:

```powershell
node $TaskControl complete --self "worker-1" --candidate-commit "candidate-v1" --result-manifest "docs/test-reports/task-result.json" --parent-turn-state "unknown"
node $TaskControl mark-accepted --project-root "C:\work\example" --controller "controller-1" --thread "worker-1" --reason "Contract and visual oracle passed." --selected-artifact "after"
node $TaskControl mark-integrated --project-root "C:\work\example" --controller "controller-1" --thread "worker-1" --integration-target-ref "HEAD"
node $TaskControl controller-query-deliverables --project-root "C:\work\example" --controller "controller-1"
node $TaskControl controller-build-delivery-report --project-root "C:\work\example" --controller "controller-1"

# Only when the user asks for timing / consumption diagnostics:
node $TaskControl controller-build-delivery-report --project-root "C:\work\example" --controller "controller-1" --observability diagnostic --otel-jsonl "$HOME\.codex\otel-local\data"
```

Seal and progressively query a long-conversation checkpoint:

```powershell
node $TaskControl controller-seal-checkpoint --project-root "C:\work\example" --controller "controller-1" --manifest "C:\scratch\checkpoint.json"
node $TaskControl controller-query-checkpoint --project-root "C:\work\example" --controller "controller-1" --mode preload
node $TaskControl controller-query-checkpoint --project-root "C:\work\example" --controller "controller-1" --point "open-question-1"
```

After all task, review, message, batch, and heartbeat debt is closed, prepare and either accept or cancel a handoff:

```powershell
node $TaskControl controller-prepare-handoff --project-root "C:\work\example" --controller "controller-1" --successor "controller-2" --checkpoint "checkpoint-0001"
node $TaskControl controller-accept-handoff --project-root "C:\work\example" --controller "controller-1" --successor "controller-2" --handoff-id "<id>" --checkpoint-digest "<sha256>"
node $TaskControl controller-cancel-handoff --project-root "C:\work\example" --controller "controller-1" --handoff-id "<id>" --reason "successor was not created"
```

Register long-lived controllers before they receive work, and audit continuity separately from ordinary task archive debt:

```powershell
node $TaskControl controller-register-identity --project-root "C:\work\example" --controller "controller-1" --thread "topic-controller-1" --controller-role "topic_controller" --topic "Farm operations" --stable-title "FarmGodot Topic Controller: Farm Operations"
node $TaskControl audit-controller-continuity --codex-home "$env:USERPROFILE\.codex"
```

For an already archived controller-shaped task, first use Codex “continue in new task”, seal a checkpoint from the predecessor conversation, then record the accepted successor without changing the old task:

```powershell
node $TaskControl controller-recover-terminal-successor --project-root "C:\work\example" --controller "controller-1" --predecessor "old-topic-controller" --successor "new-topic-controller" --controller-role "topic_controller" --topic "Farm operations" --stable-title "FarmGodot Topic Controller: Farm Operations" --checkpoint "checkpoint-0001" --checkpoint-digest "<sha256>" --reason "The controller was misclassified as one control-only task." --host-receipt "<continue-in-new-task receipt>" --authority "user_explicit_current_turn"
```

The default `lean` report writes `index.html` and performs no rollout/OTel scan. `diagnostic` writes `diagnostic.html` beside it and runs only on explicit request. It separates task-external idle, task-window time outside paired turns, active-turn time, and active-turn unassigned time; only the last ratio can trigger an unassigned-time diagnostic. Reports use Chinese explanations, `万`/`亿` compact values with exact counts, and task-relative comparison bars. Completed-response tokens are task-correlated only when same-conversation OTel receipts exist and describe already-observed cumulative processing, not OTel overhead or a quota bill. Rate-limit snapshots remain an account envelope. Unknown intervals remain unassigned.

Use [`assets/result-manifest.example.json`](skill/codex-task-control/assets/result-manifest.example.json) for non-visual work, [`assets/visual-result-manifest.example.json`](skill/codex-task-control/assets/visual-result-manifest.example.json) for visual work, [`assets/incidental-repair.example.json`](skill/codex-task-control/assets/incidental-repair.example.json) for bounded same-task repair receipts, and [`assets/observability-receipt.example.json`](skill/codex-task-control/assets/observability-receipt.example.json) for the timing receipt shape. Old tasks remain readable and show “historical evidence unavailable” when no trustworthy artifacts exist.

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
  --parent-turn-state "unknown" `
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
  --candidate-commit "candidate-auth-audit-v1" `
  --parent-turn-state "unknown"
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
- Host-native request/queue/model phase receipts with request-level correlation; user-level diagnostics cannot manufacture these boundaries.
- Exact per-task quota billing evidence if the product exposes a trustworthy correlated source.

## License

MIT
