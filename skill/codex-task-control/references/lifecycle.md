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

Each registry has `schemaVersion: 1`, `projectKey`, `projectRoot`, `rootControllerThreadIds`, `controllerHeartbeats`, `parallelBatches`, `updatedAt`, and `tasks`. New task records include delegation evidence plus `displayKey`, `desiredThreadTitle`, `titleSyncStatus`, `lastSyncedTitle`, `titleSyncError`, `archiveStatus`, `archivedAt`, `archiveError`, append-only `threadActionHistory`, optional schema-v1 `integrationProof`, and schema-v1 lightweight `observabilityReceipts`. `lastDispatchedAttempt` and `lastDispatchedAt` prove that the current work prompt was really sent; title sync alone is not execution evidence. Progress ingestion records `progressEventCreatedAt` and `lastProgressSummary`; completion ingestion records `completionEventCreatedAt` as the notification-failure freshness anchor. Legacy records remain readable; missing observability or integration-proof fields are not fabricated during read-only access, while partial field groups fail closed. A task's `directControllerThreadId` equals its `parentThreadId`.

Each `controllerHeartbeats` entry stores confirmed physical automation identity plus `logicalLeaseDueAt`/`logicalLeaseUpdatedAt`. Protocol v3 also stores pending host action, stale/trigger/delete-failure/no-progress counters, business-cycle fingerprints, fuse evidence, bounded history, retired IDs, and manual-resume evidence. Progress can extend the logical lease without replacing an untriggered physical one-shot. Heartbeat state is observability/control-plane evidence, never business lifecycle authority.

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

Parallel protocol v1 is opt-in at the storage boundary and mandatory for new work initiated through the v0.14 workflow. Old registrations without batch fields remain readable as `parallelProtocolVersion: 0`; `audit-parallel-routing` reports active legacy migration debt without mutating it. A new v1 task uses `--parallel-policy batch_v1` and binds one controller-owned batch/candidate. A registered visible parent may own a batch, so `rootControllerThreadIds` are entry points rather than permanent project singletons.

A schema-v1 batch manifest is project-relative and stores:

- `batchId`, `objective`, and `dispatchAuthority` (`user_explicit` or `controller_resolved`);
- positive `reviewCapacity` and per-lane/total `wipLimits`;
- project-supplied `dirtyConflictDomains` and an optional typed `degradationReceipt`;
- a candidate matrix with `candidateId`, stable title, explicit `incrementalValue`, lane (`implementation`, `qa`, `no_code`, `readonly`), task/work class, conflict domains, integrated-only dependencies, review cost, estimate, blocking reasons, and persistence hint;
- for implementation/visual candidates, a separate worktree identity chain: `baseCommit`, absolute `worktreePath`, `branch`, `lastMainSyncCommit`, and `cleanupOwner`.

The controller plans before creating task shells. Runtime eligibility is recomputed from lifecycle, dependencies, conflicts, WIP, and review capacity. Initial fan-out needs two candidates with distinct incremental value; a ceremonial candidate is invalid design. Initial single-candidate dispatch needs a typed degradation receipt. After a real wave starts, completed/blocked/reclaimed peers may naturally shrink the batch without a new degradation receipt.

After the selected tasks are registered and title-synced, `controller-prepare-parallel-dispatch` creates one `dispatchWaveId` and persists every required candidate in `pendingDispatchCandidateIds`. Only those candidates may be recorded as dispatched. Unrelated controlled work fails closed until the wave is empty. Codex App cannot send multiple prompts atomically, so the durable pending wave is the compensation boundary if a host send or controller turn stops halfway.

`controller-scan-events` returns `parallelBatches`, `idleConcurrencySlots`, `eligibleCandidates`, `fanoutRequired`, `fanoutBlockers`, `pendingParallelDispatches`, and `batchNeedsReplan`. Completion, failure, reclaim, review, integration, and closeout alter candidate runtime directly from existing task state; no second task ledger exists. A merely planned batch does not create a heartbeat. A prepared wave or post-dispatch fan-out uses the controller's single existing heartbeat. Missing degradation evidence stops dispatch without creating an empty wake-up loop.

## Implementation contract gate

`control_only` is limited to ledger, audit, inspection, or other work that does not change project code, resources, UI, tests, or screenshot runners. Any such implementation uses `implementation`; work with a visual acceptance surface uses `visual_implementation`. The controller cannot use `control_only` as an escape hatch for implementation work.

An implementation registration binds `implementationContractPath` to a JSON file inside the normalized project root. Schema version 1 allows only these fields:

- at least one of non-empty `contractRevision` or `contractCommit`;
- non-empty `reuseRequirements`;
- `forbiddenNewPaths` and `forbiddenReimplementations` arrays;
- ordered `stageGates`, each with unique `id`, `required`, `description`, and non-empty `requiredEvidence` references;
- unique named `evidenceCommands` with `id`, `command`, and optional `failureMode: blocking|recoverable|advisory` (default `blocking`);
- controller-fixed `errorPolicy` with non-empty `mode` and `rules`;
- for `visual_implementation`, a `visualOracle` whose `stageId` points to a required gate and which includes a reference plus non-empty criteria.

Evidence commands may classify work as `business`, `execution`, or `observability`. Business evidence may block, execution evidence is recoverable until its failure declares recovery exhaustion, and observability evidence is always advisory. Commands without a class keep legacy `failureMode` behavior. Registration stores the normalized manifest fields, absolute path, schema version, and SHA-256 digest. Dispatch, progress creation/ingestion, and completion creation/ingestion reread the file and compare the digest. Worker drift—including changes to `errorPolicy`, command text, stage gates, failure mode, or oracle—fails closed. Before registration, `audit-implementation-contract` checks structural validity and deterministic cross-command contradictions; warnings flag controller-review concerns without turning heuristic policy into a hard gate. A direct controller may use `controller-amend-implementation-contract` only for a stopped `changes_requested` mechanical/spec-missing implementation task with no candidate, an audited schema-v2 replacement contract, a reason, and a real host receipt. It records before/after digests and the host receipt, starts the next attempt, and carries only valid formally ingested predecessors before the failure. It rejects changed task mode, allowed/forbidden boundaries, result requirements, required stage IDs/order/flags, or ownership. The control plane does not execute project commands or decide whether their business output is semantically correct.

Each accepted implementation progress event appends a `stageProgress` record containing stage ID, summary, named evidence references, `attemptCount`, timestamp, contract digest, and contract version. A worker may create the next progress artifact when each missing required predecessor has exactly one valid pending artifact from the same project/task/parent/controller/attempt/task mode/contract, with valid evidence and strictly increasing timestamps. Pending artifacts do not mutate `stageProgress`; duplicate/replayed, stale, wrong-owner, wrong-contract, unknown-evidence, future, or out-of-order artifacts cannot satisfy the creation gate. The direct controller must still ingest predecessors in strict stage order. A confirmed first mechanical rework copies only formally ingested stages strictly before the authoritative failed stage into attempt 2 and records `carriedFromAttempt` plus `carriedAt`; the failed stage and all later stages remain missing. Without an authoritative failed-stage record, nothing is carried. Completion fails with `REQUIRED_STAGE_INCOMPLETE` until the current attempt has every required stage formally ingested or validly carried.

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

`changes_requested` is never an execution state. `controller-dispatch-rework` accepts only the first mechanical failure, but only prepares `pendingRework` and a receipt-required host message. It does not increment `attemptCount`. `controller-confirm-rework-dispatched` atomically enters attempt 2 after real delivery and performs the bounded predecessor carry-forward described above; cancellation leaves attempt 1 stopped. `controller-recover-undispatched-attempt` repairs legacy zombie state where `attemptCount > lastDispatchedAttempt`.

Only the task's `directControllerThreadId` may perform register/ingest for that task, notification-status updates, `changes_requested`, rework dispatch, reclaim, acceptance, and integration. Root controllers are kept in `rootControllerThreadIds`; multiple roots may coexist in one project and cannot cross-review each other's children. A child cannot write the central registry and cannot claim `accepted` or `integrated`.

## Child artifacts

Self lookup scans the project index. Exactly one matching task is required; zero matches and matches in multiple projects both fail closed. Parent identity always comes from that task's `parentThreadId`. Thread IDs are path-safe identifiers containing only letters, digits, colon, underscore, and hyphen.

Progress artifacts are independently created JSON files with `schemaVersion: 1`, `type: "task_progress"`, the task's identity, current `attemptCount`, a non-empty checkpoint `summary`, and an ISO `createdAt`. Implementation progress also carries `stageId`, named evidence references, task mode, contract version/digest, and the current completed/missing-stage summary. Completion artifacts use `type: "task_completed"`, the same identity, `status: "awaiting_review"`, non-empty `candidateCommit`, contract summary, and `createdAt`. Notification failure receipts have `type: "notification_failed"`, the same identity fields, a non-empty `reason`, and `createdAt`.

The controller verifies project, parent, attempt, freshness, lifecycle, and contract identity before ingesting. Progress/completion require a recorded real dispatch. Rework confirmation itself records that host receipt and current attempt; a second `controller-record-dispatched` call is neither required nor allowed. Scans expose `preparedReworks` and `zombieAttempts` alongside the normal queues.

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

Registration returns `dispatchAllowed: false` and a `set_thread_title` action. The controller calls `codex_app__set_thread_title` with the exact returned value and records success with `controller-record-title-synced`; only then may it send the initial work prompt. After the real send succeeds, `controller-record-dispatched` records the attempt and returns the first heartbeat action. A stale acknowledgement, duplicate dispatch record, or child artifact before dispatch fails closed. Once the current attempt has a real dispatch receipt, later lifecycle-title changes are display synchronization, not a second worker-artifact gate: progress, failure, and completion remain allowed while the new title is pending. `controller-record-title-failed` changes the action to non-actionable `failed` debt and appends evidence to `threadActionHistory`; it is not emitted again until the registered direct controller uses `controller-retry-thread-action --action set_thread_title --reason ...`. Later lifecycle title failures do not roll back the lifecycle state.

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

History is append-only by attempt. Review updates only the matching package. HTML separately counts verified implementation integration, candidate commits, and passed `control_only` reviews. Control-only terminal work is labeled review-complete rather than business-integrated; zero verified deliverables is an explicit executive conclusion.

For a new implementation task, `mark-integrated` resolves the recorded candidate and `--integration-target-ref` (default `HEAD`) to full Git commits and requires `git merge-base --is-ancestor` to succeed. It persists schema-v1 `integrationProof` with the recorded candidate text, full candidate commit, target ref, full target commit, and verification time. A missing commit, non-repository project, or unreachable candidate fails closed without changing `accepted`. Records integrated before this protocol remain readable when the field is absent, but reports label them `Git 未验证`; they are not counted as verified integration.

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
- rollout time before dispatch or after execution end is `任务外空档`, is excluded from task time/anomalies, and is not evidence of model work or quota consumption;
- time inside the ledger task window but outside completed-turn envelopes is shown separately with unknown cause;
- the diagnostic unassigned ratio is the sum of per-turn unknown intervals divided by completed-turn active union, never the whole conversation wall clock;
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

If create succeeded but its response was lost, the matching action ID can self-confirm. An expired pending action returns `compensate_timed_out_heartbeat_action`, but does not close business recovery paths. Failure ingestion, reclaim, zombie recovery, and unrelated registration remain available while host cleanup is separately recorded.

A meaningful child checkpoint creates `task_progress`. Successful ingestion updates `logicalLeaseDueAt`; progress, authoritative failure, and finalization reuse an untriggered confirmed physical one-shot instead of replacing its generation. Once a valid scan records that the one-shot fired, or it is deleted/consumed, the next actionable lifecycle update may prepare a fresh one-shot.

Heartbeat protocol v3 stores `lastCycleFingerprint`, an idempotent cycle receipt key, `consecutiveNoProgressCycles`, the last meaningful progress time, fuse count, and manual-resume evidence. The fingerprint covers direct-task lifecycle timestamps and states, pending events, controller-message states, and parallel-batch candidate states; it excludes heartbeat bookkeeping itself. The first valid scan establishes a baseline. Two later consecutive scans with the same fingerprint disable automatic rearm, set one notification, and make `shouldKeepHeartbeat=false` even while a worker remains active. This is a stability fuse, not a business blocker: event ingestion, review, reclaim, recovery, registration, and manual scans remain available.

Real dispatch, progress, completion, or authoritative failure resets the no-progress counter. After the fused automation is confirmed deleted, `controller-resume-watchdog --reason ...` records the manual review reason, clears the fuse, and creates a new one-shot only if actionable work still exists. Resume fails closed while an automation or manual-cleanup action remains unresolved.

The scheduled call supplies generation, automation ID, action ID, RRULE snapshot, occurrence, and fired-at time. The scanner persists only bounded heartbeat observation evidence before deciding whether business work is legal. A stale generation, wrong automation ID, RRULE `COUNT` other than 1, occurrence above 1, or trigger beyond the expiry grace returns empty work queues and `delete_stale_automation`. The action is scoped to the triggering ID and carries `requiresSnapshotGeneration`; the host must re-read the local automation snapshot and delete only when it still names that generation. This avoids deleting a newer automation because of a delayed invocation. A valid current scan returns fresh event/review/routing/active/cleanup queues as before.

Each repeated stale trigger or failed delete increments bounded evidence. The first delete failure may prepare one replacement cleanup action. The second stale trigger or second delete failure opens the fuse and emits one notification; a current pending cleanup becomes `manualOnly`, and the CLI returns `manual_heartbeat_cleanup_required` instead of another automatic retry. Manual deletion is confirmed with the existing action ID, preserving receipt integrity. Fusing never fabricates deletion. A stale invocation never processes project queues or rearms, and the incident never owns or blocks business lifecycle truth.

After a successful current-generation reconciliation pass, including a scan with no event, the direct controller runs `controller-finalize-cycle` exactly once. This is the single exit from the controller cycle: ingest/review first, incident closeout and report second, returned title/archive actions third, fan-out recomputation fourth, heartbeat reconciliation last. `shouldKeepHeartbeat` remains true only while dispatched execution, review, routing, an incomplete prepared parallel wave, authorized post-dispatch fan-out, or an immediately actionable title/archive operation exists. Merely planned batches, unresolved single-candidate degradation, failed historical operations, and parents waiting for descendants remain auditable but do not keep the heartbeat.

When no actionable work remains, a confirmed heartbeat produces `delete_controller_heartbeat`. A terminal transition may supersede a pending create with bounded compare/delete actions. Confirmation commits cancelled heartbeat state, but missing confirmation does not roll back terminal task truth or disable recovery commands. Partial parallel dispatch remains separately fail-closed because it represents an incomplete business send wave.

This ordering cannot stop the Codex App from spending one model wake before the Skill sees an obsolete scheduled message. The stability-first protocol deliberately accepts that bounded cost: unchanged cycles and failed cleanup stop automatic rearm, business commands stay recoverable, and resumption is explicit. A host-native pre-context hook would remove the extra wake but is no longer required for deadlock/livelock safety.

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

Before all required stages finish, a worker may write `task_failed` or `task_blocked`. For implementation work, `evidenceCommandId` must name a controller-fixed contract command for `authority=contract_evidence`. Business blocking evidence may stop immediately; execution evidence is diagnostic until the event records `recoveryExhausted: true`; observability evidence is always diagnostic. Missing or unknown command binding also becomes `non_authoritative_diagnostic`: it is appended for investigation but cannot change lifecycle, acceptance, or rework eligibility. Ingestion recomputes authority from the bound contract instead of trusting the child artifact. Failure history records every domain, but objective replacement fuses count only real authoritative product failures in `test` or `implementation`; `tooling`, `environment`, and `contract` remain control-plane diagnostics.

Every current controller scan derives `stalledActiveTasks` from the lease, last real progress, attempt age, missing required stages, and absence of a candidate/completion. It also returns `objectiveFuses`, `incidentQueue`, `contextHealth`, `checkpointState`, and `handoffState`. Ordinary task messages are not evidence and are not required for detection. A failure, stall, incomplete incident closeout, or legacy `handoff_required` health state sets `needsControllerAttention` even when the completion queue is empty. Schema-v2 checkpoint/handoff advice remains visible but does not create an attention or heartbeat loop.

Every v0.9 registration gets a stable objective ID, budget, and replacement ordinal. Replacements must name the terminal task they replace and inherit objective identity. The previous reclaim/block must first have a sent user notification and synced delivery report. Two failed replacements or an exhausted objective budget open the fuse; further registration or dispatch fails closed. After the incident summary/report are complete, a fuse waiting for a user decision does not by itself create an endless heartbeat.

Diagnostics default to `technical_debt`. They may become `milestone_blocker` only when the direct controller records non-empty `playerImpact`, `normalLifecycleReproduction`, `growthTrend`, and `whyBlocking`. A diagnostic-sourced `mark-blocked` must reference such a record. This gate checks decision evidence, not whether the diagnosis is technically true.

`reclaimed` and `blocked` require a user-visible incident summary and create a closeout with independent notification/report acknowledgements. Until both are complete, replacement fails closed and the incident remains actionable. Delivery HTML shows objective runtime, failures, diagnostic value decisions, and closeout status; attempt command details stay here rather than being copied into project plans.

A context-health receipt has controller ID, capture time, absolute report path, and metrics. Legacy schema version 1 accepts `healthy|warning|handoff_required`; its `handoff_required` remains blocking for read compatibility. Schema version 2 accepts only `healthy|checkpoint_recommended|handoff_recommended`. These v2 states are advisory, do not block registration, and cannot become `handoff_required` through ingestion. The control plane hashes the referenced report but does not copy prompts or responses.

## v0.17 conversation checkpoint and safe handoff protocol

A checkpoint manifest has `schemaVersion: 1`, the exact `projectKey` and controller ID, a bounded `scopeSummary`, and 1-12 points. Each point has a safe stable `factId`, `kind`, `authority`, concise `summary`, `preloadPolicy`, positive `revision`, typed `sourceRefs`, and optional `supersedes`. Unknown fields fail closed so raw `content`, prompt, response, or tool-output payloads cannot silently enter the checkpoint.

Authorities are `user_confirmed`, `project_fact`, `controller_decision`, `accepted_result`, `candidate`, `failure_evidence`, `unverified`, and `superseded`. Only the first four may use `preloadPolicy=always`. Candidates and failures are on-demand or dispute-only; superseded points must be `never`. Source references are indexes only (`file`, `thread`, `task`, `report`, `event`, or `uri`). A file reference must be an absolute Windows path; the checkpoint never copies the referenced project file.

`controller-seal-checkpoint` normalizes the manifest, assigns a monotonic `checkpoint-0001` sequence, hashes the sealed record, writes an immutable file under `$CODEX_HOME/task-control/checkpoints/<project-key>/<controller-id>/`, and atomically updates only the latest pointer in the project registry. Older files remain untouched. `controller-query-checkpoint` verifies file identity and digest on every read. Default `preload` returns only confirmed `always` points; `--point` expands one indexed fact and `--mode full` is an explicit diagnostic read.

Handoff state is `prepared`, `accepted`, or `cancelled`. Preparation requires the latest verified checkpoint and a new visible successor ID. It fails closed when the source has active or undispatched children, review/routing/closeout or thread-action debt, an open parallel batch, deferred/prepared controller messages, or a pending/armed heartbeat. Prepared state blocks new source registration, dispatch, rework, and ordinary task messages, but never creates or retains a heartbeat. The source can cancel prepared state with a reason, preventing a missing successor from deadlocking the project.

Acceptance rechecks source quiescence, exact source/successor/handoff identity, checkpoint digest, and checkpoint file integrity. It then records the successor as a new root controller and returns the confirmed preload set. The source becomes retired and may not dispatch new work. v1 deliberately does not reparent active children or transfer live review ownership; callers must close the old controller first. Accepted state cannot be cancelled, while checkpoint and handoff history remain in the ledger.
