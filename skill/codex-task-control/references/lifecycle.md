# Lifecycle and storage contract

## Storage

The runtime root is `$CODEX_HOME/task-control/`:

```text
task-control/
├── projects.json
└── projects/<stable-project-key>/
    ├── task-registry.json
    └── events/<threadId>/<event-file>.json
```

The project key is derived from a normalized, case-folded Windows path and a hash of that path. It is stable for equivalent slash/case/trailing-separator spellings and avoids collisions between different roots. `projects.json` is only an index; task records remain isolated in their project registry.

## Registry contract

Each registry has `schemaVersion: 1`, `projectKey`, `projectRoot`, `rootControllerThreadIds`, `controllerHeartbeats`, `parallelBatches`, `updatedAt`, and `tasks`. New task records include delegation evidence plus `displayKey`, `desiredThreadTitle`, `titleSyncStatus`, `lastSyncedTitle`, `titleSyncError`, `archiveStatus`, `archivedAt`, `archiveError`, append-only `threadActionHistory`, and schema-v1 lightweight `observabilityReceipts`. `lastDispatchedAttempt` and `lastDispatchedAt` prove that the current work prompt was really sent; title sync alone is not execution evidence. Progress ingestion records `progressEventCreatedAt` and `lastProgressSummary`; completion ingestion records `completionEventCreatedAt` as the notification-failure freshness anchor. Legacy records remain readable; missing observability fields become protocol 0 in memory without rewriting the registry, while partial field groups fail closed. A task's `directControllerThreadId` equals its `parentThreadId`.

Each `controllerHeartbeats` entry stores one direct controller's confirmed `generation`, `status`, `dueAt`, `intervalMs`, `reason`, optional triggering task, and `updatedAt`. Protocol v2 also stores the confirmed `automationId`, `lastSuccessfulGeneration`, `lastSuccessfulAt`, one `pendingAction`, stale/trigger/delete-failure counters, fuse/notification state, bounded action history, and retired automation IDs. It is a durable two-phase lease record, not the host automation itself. A rearm prepares generation `N+1` but leaves confirmed generation `N` unchanged until App success is confirmed.

New registrations also store routing evidence: `workClass`, `decisionStatus`, `scope`, `acceptance`, and `forbiddenDecisions`, plus an explicit `taskMode`. Execution truth is separate from review truth through `executionStatus`, `nextOwner`, `attemptCount`, `failureClass`, `changesRequestedReason`, and `reclaimedReason`. Legacy records without these complete field groups remain readable and gain deterministic execution defaults during the next controller mutation. Records created before v0.6.0 that lack the complete implementation-control field group are read in memory as `taskMode: legacy_unclassified`; a read-only scan does not rewrite the registry. New registrations missing `taskMode` fail with `TASK_MODE_REQUIRED`.

Allowed values:

- `status`: `executing`, `awaiting_review`, `changes_requested`, `accepted`, `integrated`, `blocked`, `reclaimed`.
- `reviewVerdict`: `pending`, `changes_requested`, `accepted`.
- `integrationStatus`: `not_integrated`, `integrated`.
- `notificationStatus`: `pending`, `sent`, `failed`.
- `thinking`: `low`, `medium`, `high`.
- `titleSyncStatus`: `pending`, `synced`, `failed`.
- `archiveStatus`: `not_ready`, `pending`, `archived`, `failed`.
- `workClass`: `repeatable`, `bounded_reasoning`.
- Model binding: `repeatable` requires exactly `gpt-5.6-luna`; `bounded_reasoning` requires exactly `gpt-5.6-terra`.
- Thinking binding: `repeatable` requires `medium`; `bounded_reasoning` permits `medium` or `high`. `low` remains readable only for legacy evidence and is rejected for new registrations.
- `decisionStatus`: `resolved` for every delegated task.
- `executionStatus`: `running`, `stopped`, `awaiting_review`, `terminal`.
- `nextOwner`: `worker`, `controller`, `undecided`, `none`.
- `failureClass`: `mechanical`, `comprehension`, `judgment`, `spec_missing`; `unclassified` is migration-only.
- `taskMode`: migration-only `legacy_unclassified`, or new-registration values `control_only`, `implementation`, `visual_implementation`.
- New delegated workers require `delegationMode: explicit`, `executionSurface: visible_task`, `modelClass: economical`, and work-class-compatible `medium` or `high` thinking.

## Delegation gate

Internal Codex subagents are forbidden. Delegated work must be a user-visible Codex task/thread. Registration rejects missing explicit authorization, any execution surface other than `visible_task`, any model class other than `economical`, low or work-class-incompatible thinking, a quota reason shorter than 12 characters, unresolved decisions, `controller_only` work, missing scope/acceptance/forbidden-decision evidence, and the placeholder title `等待主控登记`.

Use `repeatable` only when the worker can follow explicit rules and a fixed test oracle. Use `bounded_reasoning` only after the controller has resolved contracts and policy choices. Architecture, contract conflicts, persistence-trust selection, stop/continue policy, ambiguous fixtures, planning, review, and integration are controller-only even when a stronger worker might succeed.

## Parallel batch and fan-out gate

Parallel protocol v1 is opt-in at the storage boundary and mandatory for new work initiated through the v0.13 workflow. Old registrations without batch fields remain readable as `parallelProtocolVersion: 0`; `audit-parallel-routing` reports active legacy migration debt without mutating it. A new v1 task uses `--parallel-policy batch_v1` and binds one controller-owned batch/candidate. A registered visible parent may own a batch, so `rootControllerThreadIds` are entry points rather than permanent project singletons.

A schema-v1 batch manifest is project-relative and stores:

- `batchId`, `objective`, and `dispatchAuthority` (`user_explicit` or `controller_resolved`);
- positive `reviewCapacity` and per-lane/total `wipLimits`;
- project-supplied `dirtyConflictDomains` and an optional typed `degradationReceipt`;
- a candidate matrix with `candidateId`, stable title, lane (`implementation`, `qa`, `no_code`, `readonly`), task/work class, conflict domains, integrated-only dependencies, review cost, estimate, blocking reasons, and persistence hint;
- for implementation/visual candidates, a separate worktree identity chain: `baseCommit`, absolute `worktreePath`, `branch`, `lastMainSyncCommit`, and `cleanupOwner`.

The controller plans before creating task shells. Runtime eligibility is recomputed from current task lifecycle, dependency integration, dirty/conflicting domains, WIP, and review capacity. Two or more selected independent candidates set `fanoutRequired=true`; one selected candidate is not dispatchable without an allowed degradation reason, concrete summary, and non-empty evidence. A code candidate plus a non-conflicting QA/no-code/readonly candidate therefore cannot silently degrade to one code task. Unrelated dirty domains and historical archive failures do not consume global WIP.

After the selected tasks are registered and title-synced, `controller-prepare-parallel-dispatch` creates one `dispatchWaveId` and persists every required candidate in `pendingDispatchCandidateIds`. Only those candidates may be recorded as dispatched. Unrelated controlled work fails closed until the wave is empty. Codex App cannot send multiple prompts atomically, so the durable pending wave is the compensation boundary if a host send or controller turn stops halfway.

`controller-scan-events` returns `parallelBatches`, `idleConcurrencySlots`, `eligibleCandidates`, `fanoutRequired`, `fanoutBlockers`, `pendingParallelDispatches`, and `batchNeedsReplan`. Completion, failure, reclaim, review, integration, and closeout alter candidate runtime directly from existing task state; no second task ledger exists. A merely planned batch does not create a heartbeat. A prepared wave or post-dispatch fan-out uses the controller's single existing heartbeat. Missing degradation evidence stops dispatch without creating an empty wake-up loop.

## Implementation contract gate

`control_only` is limited to ledger, audit, inspection, or other work that does not change project code, resources, UI, tests, or screenshot runners. Any such implementation uses `implementation`; work with a visual acceptance surface uses `visual_implementation`. The controller cannot use `control_only` as an escape hatch for implementation work.

An implementation registration binds `implementationContractPath` to a JSON file inside the normalized project root. Schema version 1 allows only these fields:

- at least one of non-empty `contractRevision` or `contractCommit`;
- non-empty `reuseRequirements`;
- `forbiddenNewPaths` and `forbiddenReimplementations` arrays;
- ordered `stageGates`, each with unique `id`, `required`, `description`, and non-empty `requiredEvidence` references;
- unique named `evidenceCommands` with `id` and `command`;
- controller-fixed `errorPolicy` with non-empty `mode` and `rules`;
- for `visual_implementation`, a `visualOracle` whose `stageId` points to a required gate and which includes a reference plus non-empty criteria.

Registration stores the normalized manifest fields, absolute path, schema version, and SHA-256 digest. Dispatch, progress creation/ingestion, and completion creation/ingestion reread the file and compare the digest. Any change—including a worker changing `errorPolicy`, command text, stage gates, or oracle—fails with `IMPLEMENTATION_CONTRACT_DRIFT`; the direct controller must reclaim the task and explicitly bind a new revision rather than silently updating the ledger. The control plane validates structure and evidence references but never interprets project source code or decides whether command output is semantically correct.

Each accepted implementation progress event appends a `stageProgress` record containing stage ID, summary, named evidence references, `attemptCount`, timestamp, contract digest, and contract version. Required predecessor stages must already be ingested, every required evidence ID must be present, and a stage can be completed only once per attempt. Mechanical rework keeps the contract snapshot but increments `attemptCount`, so all required stages must be completed again for the new attempt. Completion fails with `REQUIRED_STAGE_INCOMPLETE` until the current attempt has every required stage.

`audit-model-routing` scans only non-terminal tasks across project registries. It reports legacy records without routing evidence and records whose actual model does not match their `workClass`. The audit is read-only; remediation belongs to the recorded direct controller, which must stop or reclaim the old task and register a replacement rather than mutating model identity in place.

`audit-thinking-routing` applies the same read-only ownership rule to active thinking assignments. It reports legacy routing evidence and `low` or otherwise work-class-incompatible thinking without rewriting the task. `repeatable` expects `medium`; `bounded_reasoning` accepts `medium` or `high`.

## Controller reasoning gate

The frontier controller uses exactly `gpt-5.6-sol`. Its default route is `frontier_control` with `high` thinking. `bounded_control` with `medium` is allowed only for short, bounded controller work whose decision boundary is already clear. `hard_arbitration` requires `xhigh`, an allowed escalation trigger (`cross_module_contract_conflict`, `trusted_source_conflict`, `evidence_conflict`, `high_failed`, or `high_risk_irreversible`), and a concrete reason. `final_arbitration` requires `max`, a concrete reason, and authority recorded as either `user_explicit` or `xhigh_unresolved`.

Run `audit-controller-routing` before xhigh or max. It is a zero-provider local preflight and does not mutate the worker registry. It rejects Sol low/none, model or work-class mismatches, mechanical work routed to frontier escalation, unsupported triggers, missing reasons, and max without authority. Search, formatting, commands, repeated tests, and mechanical implementation remain Luna/Terra work rather than Sol xhigh/max work.

The ledger cannot intercept a host application's raw subagent tool. Skill and `AGENTS.md` policy therefore prohibit those tools outright. A visible task shell may be created to obtain its thread ID, but registration must succeed before any work prompt is sent to it.

Lifecycle invariants are checked before every controller write:

```text
executing -> awaiting_review -> accepted -> integrated
                 └──-> changes_requested (stopped, nextOwner=undecided)
                             ├── mechanical + attempt 1 -> executing (explicit rework, attempt 2)
                             └── controller decision -> reclaimed
executing | awaiting_review | changes_requested -> blocked
```

`changes_requested` is never an execution state. It changes the title to `待决`, makes child completion fail closed, and waits for an explicit controller choice. `controller-dispatch-rework` accepts only `mechanical` failures and only when `attemptCount` is 1. `comprehension`, `judgment`, and `spec_missing` failures must be reclaimed. A second failed review must also be reclaimed. Model escalation creates a new registered task; it does not mutate the old task's model identity.

Only the task's `directControllerThreadId` may perform register/ingest for that task, notification-status updates, `changes_requested`, rework dispatch, reclaim, acceptance, and integration. Root controllers are kept in `rootControllerThreadIds`; multiple roots may coexist in one project and cannot cross-review each other's children. A child cannot write the central registry and cannot claim `accepted` or `integrated`.

## Child artifacts

Self lookup scans the project index. Exactly one matching task is required; zero matches and matches in multiple projects both fail closed. Parent identity always comes from that task's `parentThreadId`. Thread IDs are path-safe identifiers containing only letters, digits, colon, underscore, and hyphen.

Progress artifacts are independently created JSON files with `schemaVersion: 1`, `type: "task_progress"`, the task's identity, current `attemptCount`, a non-empty checkpoint `summary`, and an ISO `createdAt`. Implementation progress also carries `stageId`, named evidence references, task mode, contract version/digest, and the current completed/missing-stage summary. Completion artifacts use `type: "task_completed"`, the same identity, `status: "awaiting_review"`, non-empty `candidateCommit`, contract summary, and `createdAt`. Notification failure receipts have `type: "notification_failed"`, the same identity fields, a non-empty `reason`, and `createdAt`.

The controller verifies project, parent, attempt, timestamp freshness, lifecycle, and implementation-contract identity before ingesting. Progress and completion are accepted only after `controller-record-dispatched` has recorded the current attempt and while `status=executing`; a stopped `changes_requested` task cannot submit. Explicit rework must be title-synced, really sent, and separately recorded before the second attempt can emit artifacts. Old, repeated, contract-mismatched, or stage-incomplete artifacts are rejected. `controller-scan-events`, completion command output, notifications, and review queues expose contract version, digest, completed stages, and missing stages so the direct controller does not have to infer them from prose.

Only the direct controller may mark a non-terminal task `blocked`, and it must persist a non-empty `blockedReason`. Use this for genuinely superseded or impossible work; never delete history merely to stop a heartbeat.

## Sidebar title contract

New registrations allocate stable hierarchical keys in project order: root children use `01`, `02`, and nested children use `01.1`, `01.2`, and deeper equivalents. Legacy tasks receive deterministic keys on the next controller write. The semantic `title` remains stable; only the lifecycle prefix changes:

```text
执行｜01 审计 Provider 调用
待审｜01 审计 Provider 调用
待决｜01 审计 Provider 调用
返工｜01 审计 Provider 调用
收回｜01 审计 Provider 调用
接收｜01 审计 Provider 调用
完成｜01 审计 Provider 调用
阻塞｜01 审计 Provider 调用
```

Registration returns `dispatchAllowed: false` and a `set_thread_title` action. The controller calls `codex_app__set_thread_title` with the exact returned value and records success with `controller-record-title-synced`; only then may it send the work prompt. After the real send succeeds, `controller-record-dispatched` records the attempt and returns the first heartbeat action. A stale acknowledgement, duplicate dispatch record, or child artifact before dispatch fails closed. `controller-record-title-failed` changes the action to non-actionable `failed` debt and appends evidence to `threadActionHistory`; it is not emitted again until the registered direct controller uses `controller-retry-thread-action --action set_thread_title --reason ...`. Later lifecycle title failures do not roll back the lifecycle state.

## Terminal archive contract

Only `integrated`, `blocked`, and `reclaimed` tasks enter archive processing. `controller-scan-events` returns a `set_thread_archived` action only when `archiveStatus` is `pending`, the terminal title is synced, and every visible descendant is already archived. The controller calls `codex_app__set_thread_archived` with `archived: true`, then records success or failure. A recorded failure becomes non-actionable audit debt; only the registered direct controller may explicitly return it to `pending` with `controller-retry-thread-action --action set_thread_archived --reason ...`.

Archiving affects only the Codex sidebar thread. The registry record and event artifacts remain durable audit evidence. Root controllers are never represented as worker records and are never automatically archived.

`audit-archive-backlog` scans every project registry without writing it. It treats a complete legacy terminal record with no thread-control group as in-memory `archiveStatus: pending`, groups backlog by `projectKey + directControllerThreadId`, and returns only currently legal `set_thread_title` or `set_thread_archived` actions. Every debt item reports `actionable`, `title_failed`, `archive_failed`, or `waiting_descendants`; only `actionable` items contribute actions. Failed debt remains visible without creating a heartbeat loop. The registered direct controller applies each returned action and records the result; explicit retry is a separate owner-authorized decision.

## Result manifests and delivery history

New `implementation` and `visual_implementation` registrations use `resultProtocolVersion: 1`. Their controller-owned implementation contract must include `resultRequirements` with `manifestSchemaVersion: 1`, one or more `allowedArtifactRoots`, arrays of required artifact types and milestones, and an optional `presentationStageId`. A visual task must bind that stage to a required gate, require `screenshot` or `contact_sheet`, and require `after` or `current`. Records created before v0.8.0 migrate in memory with result protocol 0, null requirements, and empty history; read-only queries do not rewrite them.

The worker passes a project-owned result manifest to `complete --result-manifest`. Its identity must match `projectKey`, direct controller, task, display key, attempt, contract version/digest, and candidate commit. The worker may declare only `integrationStatus: candidate`. It also records:

- a short user-visible summary;
- non-empty actual changes and explicit incomplete items;
- a test status/summary plus at least one command or before/after metric;
- a screenshot-absence reason for non-visual work with no screenshot;
- typed artifacts: `screenshot`, `reference`, `contact_sheet`, `log`, `test_summary`, or `report`;
- milestone, label, description, timestamp, source stage/task, and workspace role for every artifact.

Local artifacts resolve against the result manifest, then must remain inside a controller-fixed allowed root after real-path resolution. Completion verifies existence, non-zero file size, SHA-256, and no duplicate content hash inside the package. Screenshot/contact-sheet artifacts require a local path, `candidate_worktree` workspace role, and decodable non-zero PNG, JPEG, or GIF dimensions; a worker candidate cannot label a result as `project_main` or `task_control`. A `project_main` item is allowed only as an explicit reference. Remote references may use only HTTP(S) and cannot claim a locally verified hash or dimensions. The completion event stores the normalized result snapshot; ingestion re-reads it and rejects drift before appending it to `deliverableHistory`.

History is append-only by attempt. Review updates only the matching package: `candidate -> accepted_not_integrated -> integrated`, or `candidate -> rejected`. `changes_requested`, `reclaimed`, and `blocked` retain rejected artifacts; the report renders those states in red. Visual acceptance requires a review reason and at least one selected screenshot/contact sheet. The project `visualOracle` and direct controller judge quality; the control plane validates structure and identity only.

`controller-query-deliverables` returns the registered controller subtree and all packages. `controller-build-delivery-report` deterministically writes `$CODEX_HOME/task-control/reports/<project-key>/<controller-thread-id>/index.html`. The page contains work-package state, every attempt, actual changes, tests/metrics, blockers, next gates, selected images, and a chronological artifact timeline. It links local paths with absolute file URIs and does not copy project files. Legacy stage references may appear as unverified references; missing history is shown as `historical_evidence_unavailable` and never blocks a current task.

The report embeds the registry `updatedAt` value. A current scan compares this marker and returns `reportNeedsRefresh`, but that flag is informational: it must not affect `needsControllerAttention`, `shouldKeepHeartbeat`, controller queues, or heartbeat rearm.

## Lightweight observability and on-demand diagnostics

New registrations use `observabilityProtocolVersion: 1` with an append-only `observabilityReceipts` array. Registration, confirmed dispatch, meaningful progress ingestion, failure/completion ingestion, controller review transitions, integration, and archive append receipts inside the lifecycle mutation that already occurs. No receipt may require an extra worker command, synthetic progress, notification, heartbeat, or provider call. Records created before v0.13.0 remain read-compatible as protocol 0 with no fabricated history.

Every receipt has schema version, event name, phase, outcome, UTC wall time, process-scoped monotonic time plus `clockId`, task/thread identity, attempt, correlation ID, source, and confidence. Monotonic values are comparable only inside the same `clockId`; cross-command lifecycle intervals use wall-clock event bounds and remain labelled as ledger timing. Prompt text, response text, command arguments/output, account identity, and secrets are never stored.

`controller-build-delivery-report` defaults to `--observability lean`. Lean mode reads only the registry, derives lifecycle bounds from existing receipts/fields, and writes deterministic `index.html`. It never discovers rollout files, imports `$codex-time-diagnostics`, or reads OTel/Desktop logs. Normal event/closeout refreshes always use lean mode.

`--observability diagnostic` is explicit and on demand. It writes `diagnostic.html`, searches the standard `$CODEX_HOME/sessions` and `archived_sessions` trees for each exact thread ID, chooses the largest matching candidate deterministically, and then requires the analyzer's returned `sessionId` to equal that task. It imports only the installed `$CODEX_HOME/skills/codex-time-diagnostics/scripts/analyze-session-timeline.mjs`. `--otel-jsonl` and `--desktop-log` are read only when explicitly passed. Missing, ambiguous, mismatched, or malformed timing evidence degrades that task to `unavailable` without changing lifecycle truth.

The report keeps evidence classes separate:

- dispatch-to-execution-end overlap is a ledger window and does not prove active model work;
- overlap of paired rollout `task_started`/`task_complete` envelopes proves simultaneous completed-turn envelopes, not CPU or model-internal time;
- same-conversation OTel `response.completed` input/output tokens are direct completed-response counts;
- rate-limit snapshots are account-level envelopes and cannot be attributed to one task during concurrency;
- response gaps and unknown intervals remain unassigned and are never renamed model reasoning, network, queueing, or service work.

Report generation never mutates the registry, creates a second ledger, changes `reportNeedsRefresh`, or creates/retains heartbeat work. Detailed diagnostics may be slower because they parse local history, but that cost occurs only on explicit report generation.

The HTML presentation is Chinese-first. Fixed statuses, task modes, work classes, reasoning levels, anomaly codes, timing labels, and evidence categories render as Chinese labels; model names and protocol/event identifiers remain visible only as technical identifiers with adjacent Chinese explanations. Values at or above 10,000 use `万`, values at or above 100,000,000 use `亿`, and the exact integer remains beneath the compact value. Diagnostic reports add task-relative bars for cumulative input/output tokens, completed-turn active time, and tool time. Free-form ledger text that contains no Chinese is marked as an untranslated original record; report generation never calls a model to translate it. Completed-response tokens are described as already-observed cumulative model input/output, not OTel overhead and not a Codex quota bill.

## Controller-to-worker message contract

The App's user-facing composer supports follow-up queue behavior, but the current programmatic message tool does not expose a queue/steer parameter or a queue acknowledgement. The ledger must therefore never infer native queue delivery from a generic successful send call.

`controller-prepare-message` is the only normal controller-to-direct-worker message entry point. It verifies direct ownership, an `executing/running` lifecycle, a bounded message, and a stable digest. Ordinary follow-up, clarification, evidence-request, and notification messages use `deliveryMode=queue`. A target turn observed as `running` or `unknown` is persisted as `deferred_local` with no host action. An idle target produces a unique `send_thread_message` action whose `deliveryMode` is `start_next_turn_only`. The host performs that real send, then `controller-record-message-delivery` requires the exact message/action pair and a non-empty receipt. Duplicate message IDs are idempotent only when identity, kind, mode, and digest all match; otherwise they fail closed.

`controller-release-message` rechecks the externally observed turn state. Running or unknown remains deferred. Idle becomes prepared only while the task is still `executing/running`; any later lifecycle state cancels the deferred message so it cannot restart completed, blocked, reclaimed, or review work. A prepared host action expires after 30 seconds and states its immediate precondition; an expired queue action needs a fresh idle observation and a new action ID. A forged/stale action receipt is rejected.

Interrupt delivery is exceptional. Only `kind=stop|cancel` with `interruptAuthority=user_explicit|controller_safety` can produce `steer_thread_message`; ordinary work can never request interrupt. Deferred messages appear in controller scans but do not independently keep or create a heartbeat. Prepared actions and lifecycle-stale deferred items set controller attention during an existing scan, while host delivery evidence remains separate from heartbeat evidence.

## Adaptive wake-up and lease contract

A file under `events/` does not wake a Codex task by itself. Progress and completion commands return a short notification for the registered direct parent. The direct controller also maintains exactly one confirmed one-shot heartbeat as a recovery watchdog; fixed repeating cron and in-place heartbeat replacement are forbidden.

The heartbeat starts only after the work prompt was successfully sent and `controller-record-dispatched` succeeds. Its execution cadence is derived from recorded routing evidence:

- `repeatable` / Luna medium: 3 minutes.
- `bounded_reasoning` / Terra medium: 5 minutes.
- `bounded_reasoning` / Terra high: 10 minutes.
- actionable controller review, routing, title, and archive queues: 5 minutes.

For several simultaneous obligations, the controller uses the shortest interval across active direct tasks and controller queues. A Terra-high active task plus pending review, routing, title, or archive cleanup therefore uses 5 minutes, not 10.

## Heartbeat two-phase commit

Every rearm computes a desired state and stores one `pendingAction` with a unique `actionId`, generation `confirmed+1`, a 30-second expiry, and `maxOccurrences=1`. It returns `create_controller_heartbeat`, `delete_controller_heartbeat`, or the terminal compound action `finalize_controller_cycle` without changing the confirmed generation.

For create, the host creates a new Codex App heartbeat rather than updating the confirmed ID in place. Its name and prompt include `actionId` and generation, its recurrence must have `COUNT=1`, and the prompt supplies the scan identity fields. After the tool returns a new automation ID, `controller-confirm-heartbeat-action` promotes the pending state, records `lastSuccessfulGeneration`, and returns `delete_retired_automation` for the previous ID. Only then is the new generation authoritative. For delete, the host deletes the exact confirmed ID and confirms that pending action. A tool error or timeout is recorded with `controller-record-heartbeat-action-failed`; pending state is cleared while the previous confirmed generation remains valid.

If create succeeded but the response was lost, the new automation finds the unique local automation snapshot containing its `actionId`, resolves its own ID, and scans with the pending generation. The scanner returns only `confirm_observed_heartbeat`; confirmation with `observed=true` safely adopts it. If the pending action expired, every later mutating controller command fails closed until the action is reconciled; the still-confirmed old automation may also receive `compensate_timed_out_heartbeat_action`. The controller records the host timeout before resuming normal lifecycle work. Compensation no longer waits for that old automation to trigger.

A meaningful child checkpoint creates `task_progress`. Only successful `controller-ingest-progress` prepares a renewed lease; merely receiving a message does not. Successful completion ingestion prepares the controller review cadence from that reconciliation time. Because preparation does not advance confirmed generation, an App create failure cannot strand the old watchdog as stale; it remains authoritative until the new automation is confirmed.

The scheduled call supplies generation, automation ID, action ID, RRULE snapshot, occurrence, and fired-at time. The scanner persists only bounded heartbeat observation evidence before deciding whether business work is legal. A stale generation, wrong automation ID, RRULE `COUNT` other than 1, occurrence above 1, or trigger beyond the expiry grace returns empty work queues and `delete_stale_automation`. The action is scoped to the triggering ID and carries `requiresSnapshotGeneration`; the host must re-read the local automation snapshot and delete only when it still names that generation. This avoids deleting a newer automation because of a delayed invocation. A valid current scan returns fresh event/review/routing/active/cleanup queues as before.

Each repeated stale trigger increments `consecutiveStaleCount`; each failed delete increments `deleteFailureCount`. At three, the fuse stores `disabledAt`/`disableReason`, changes notification status to `pending`, and emits one notification text. After the direct controller sends it successfully, `controller-mark-heartbeat-notification-sent` prevents repeated notices. Fusing a current terminal cleanup does not fabricate deletion: the confirmed automation ID and bounded delete/finalization action remain, and business stays blocked until the host confirms deletion or absence. A stale invocation never processes project queues and never rearms, so even a Codex App recurrence defect is reduced to a bounded cleanup path rather than repeated controller work.

After a successful current-generation reconciliation pass, including a scan with no event, the direct controller runs `controller-finalize-cycle` exactly once. This is the single exit from the controller cycle: ingest/review first, incident closeout and report second, returned title/archive actions third, fan-out recomputation fourth, heartbeat reconciliation last. `shouldKeepHeartbeat` remains true only while dispatched execution, review, routing, an incomplete prepared parallel wave, authorized post-dispatch fan-out, or an immediately actionable title/archive operation exists. Merely planned batches, unresolved single-candidate degradation, failed historical operations, and parents waiting for descendants remain auditable but do not keep the heartbeat.

When no actionable work remains, a confirmed heartbeat produces `delete_controller_heartbeat`. If an unconfirmed create is still pending at that terminal transition, the ledger supersedes it with `finalize_controller_cycle`. Its host action list is bounded and identity-scoped: compare-delete only an automation snapshot whose prompt still matches the superseded create `actionId` and generation, then delete the exact last confirmed automation ID. Only after both operations complete does `controller-confirm-heartbeat-action --pending-create-cleanup-outcome deleted|not_found` commit cancelled state. Registration, dispatch, explicit rework, and `controller-assert-business-ready` fail closed before that confirmation. The pending finalization expires after 30 seconds and must be failed/compensated before any later lifecycle mutation.

This ordering closes the control-plane gap but cannot make the Codex App remove or defer a scheduled message before it enters a model turn. Complete prevention of turn interruption requires a host-native pre-context compare-and-delete/defer hook keyed by automation ID, action ID, and generation. Skill-level code can only make the post-entry path bounded and prevent further controlled project work.

`notificationStatus: sent` is allowed only after a real successful thread message. Completion ingestion alone leaves notification pending. A later `notification_failed` receipt remains ingestible because freshness is compared with `completionEventCreatedAt`, not the controller's later ingestion timestamp.

## Lock contract

Registry and project-index read/modify/write operations use an exclusive `<target>.lock` file containing `{pid, createdAt, nonce}` plus an independent `<target>.lock.recovery` mutex. Main acquisition waits while recovery is held; only the recovery owner may verify and remove a stale main lock. Defaults are conservative; tests may inject `staleMs`, `maxAttempts`, and `retryDelayMs` into the exported lock helper. A lock is reclaimable only after exceeding `staleMs` and repeated owner checks still match. Recovery-mutex stale handling is also bounded and conservative. Release takes the same recovery mutex, re-reads the owner nonce before deletion, and leaves a replacement lock untouched.

Lock acquisition, owner-checked release, and atomic replacement retry only transient Windows `EACCES`, `EBUSY`, and `EPERM` filesystem races with a short bounded backoff. Ownership is re-read before every release retry, non-transient errors fail immediately, and temporary registry files are removed on failure.

## Project adapters

An adapter is a reference-only object:

```json
{
  "projectRoot": "E:\\work\\project\\example",
  "rulesSources": ["AGENTS.md"],
  "workflowSources": ["docs/sops/example.md"],
  "projectPolicySources": ["docs/testing/project-acceptance.md"],
  "nativeAdapter": "scripts/task-control/task-control.ts"
}
```

`rulesSources` must contain at least one project rule source. `workflowSources` may be empty, and `projectPolicySources` is optional. No copied rules, model values, commands, test lists, or acceptance policy belong in an adapter. Project adapters must not contain `modelRoutingSource` or any equivalent routing shadow because this skill is the sole source for work class, model, thinking, and lifecycle policy. If `nativeAdapter` is present, the loader must verify that the referenced file exists under `projectRoot`; omit it when the project has no native adapter.

## v0.9 failure, stall, and objective protocol

New implementation registrations require implementation-contract `schemaVersion: 2`. It adds non-empty controller-owned `allowedWritePaths`; schema-v1 tasks already present remain read-compatible and may finish their bound attempt. A worker cannot revise the contract, error policy, product-value classification, or acceptance oracle.

Before all required stages finish, a dispatched worker may write one fresh `task_failed` or `task_blocked` artifact. It binds the current task/attempt/contract and records `attemptedStage`, `failureClass`, `failureDomain`, a bounded command summary, at least one registered evidence reference, and `mechanicalRetryEligible`. The artifact does not grant terminal authority. The direct controller ingests it into append-only `failureHistory` and transitions the task to stopped `changes_requested` for routing.

Every current controller scan derives `stalledActiveTasks` from the lease, last real progress, attempt age, missing required stages, and absence of a candidate/completion. It also returns `objectiveFuses`, `incidentQueue`, and `contextHealth`. Ordinary task messages are not evidence and are not required for detection. A failure, stall, incomplete incident closeout, or `handoff_required` health state sets `needsControllerAttention` even when the completion queue is empty.

Every v0.9 registration gets a stable objective ID, budget, and replacement ordinal. Replacements must name the terminal task they replace and inherit objective identity. The previous reclaim/block must first have a sent user notification and synced delivery report. Two failed replacements or an exhausted objective budget open the fuse; further registration or dispatch fails closed. After the incident summary/report are complete, a fuse waiting for a user decision does not by itself create an endless heartbeat.

Diagnostics default to `technical_debt`. They may become `milestone_blocker` only when the direct controller records non-empty `playerImpact`, `normalLifecycleReproduction`, `growthTrend`, and `whyBlocking`. A diagnostic-sourced `mark-blocked` must reference such a record. This gate checks decision evidence, not whether the diagnosis is technically true.

`reclaimed` and `blocked` require a user-visible incident summary and create a closeout with independent notification/report acknowledgements. Until both are complete, replacement fails closed and the incident remains actionable. Delivery HTML shows objective runtime, failures, diagnostic value decisions, and closeout status; attempt command details stay here rather than being copied into project plans.

A context-health receipt has schema version 1, controller ID, `healthy|warning|handoff_required`, capture time, absolute report path, and metrics. The control plane hashes the referenced report but does not copy prompts or responses. `handoff_required` blocks registration and dispatch so the controller must produce a structured handoff and migrate before creating more workers.
