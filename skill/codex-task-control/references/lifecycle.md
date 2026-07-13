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

Each registry has `schemaVersion: 1`, `projectKey`, `projectRoot`, `rootControllerThreadIds`, `controllerHeartbeats`, `updatedAt`, and `tasks`. New task records include delegation evidence plus `displayKey`, `desiredThreadTitle`, `titleSyncStatus`, `lastSyncedTitle`, `titleSyncError`, `archiveStatus`, `archivedAt`, `archiveError`, and append-only `threadActionHistory`. `lastDispatchedAttempt` and `lastDispatchedAt` prove that the current work prompt was really sent; title sync alone is not execution evidence. Progress ingestion records `progressEventCreatedAt` and `lastProgressSummary`; completion ingestion records `completionEventCreatedAt` as the notification-failure freshness anchor. Legacy records remain readable; controller writes migrate them deterministically, while partial field groups fail closed. A task's `directControllerThreadId` equals its `parentThreadId`.

Each `controllerHeartbeats` entry stores one direct controller's `generation`, `status`, `dueAt`, `intervalMs`, `reason`, optional triggering task, and `updatedAt`. It is a durable lease description, not the host automation itself. `armed` requires a positive interval and timestamp; `cancelled` requires both to be null. Every rearm increments the generation so a delayed replaced automation can prove it is stale.

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

## Adaptive wake-up and lease contract

A file under `events/` does not wake a Codex task by itself. Progress and completion commands return a short notification for the registered direct parent. The direct controller also maintains exactly one replaceable one-shot heartbeat as a recovery watchdog; fixed repeating cron is forbidden.

The heartbeat starts only after the work prompt was successfully sent and `controller-record-dispatched` succeeds. Its execution cadence is derived from recorded routing evidence:

- `repeatable` / Luna medium: 3 minutes.
- `bounded_reasoning` / Terra medium: 5 minutes.
- `bounded_reasoning` / Terra high: 10 minutes.
- actionable controller review, routing, title, and archive queues: 5 minutes.

For several simultaneous obligations, the controller uses the shortest interval across active direct tasks and controller queues. A Terra-high active task plus pending review, routing, title, or archive cleanup therefore uses 5 minutes, not 10. `heartbeatAction.type=replace_controller_heartbeat` means replace the existing automation with a one-shot wake-up at `dueAt` and preserve its `generation` in the scheduled scan command. `delete_controller_heartbeat` means remove the automation. The ledger never treats a recurring schedule as compliant.

A meaningful child checkpoint creates `task_progress`. Only successful `controller-ingest-progress` renews the lease; merely receiving a message does not. Successful completion ingestion moves the task to review and recalculates the controller cadence from that reconciliation time. Thus a completion arriving four minutes into a five-minute lease replaces the old deadline instead of allowing another scan one minute later. If ingest/reconciliation fails, no new generation is written and the current watchdog remains the fallback.

The scanner is read-only. A scheduled call supplies `--heartbeat-generation`. If it does not match the current armed generation, the scanner returns `staleHeartbeat: true`, empty action queues, and performs no work. A current scan returns fresh `pendingEvents`, `reviewQueue`, stopped `routingQueue`, genuinely running and dispatched direct `activeTasks`, `overdueTasks`, actionable terminal `pendingCleanupTasks`, non-actionable `deferredCleanupTasks`, and `threadActions`. A `changes_requested` task appears in `routingQueue`, never in `activeTasks`; heartbeat output must not describe it as running or reworking. `needsControllerAttention` covers actionable events, overdue workers, review items, routing decisions, and tool actions, not historical failure debt.

After a successful reconciliation pass, including a current scan with no event, the direct controller runs `controller-rearm-heartbeat --reason reconcile` exactly once and applies its returned final action. This debounces activity from the completed processing time. `shouldKeepHeartbeat` remains true only while dispatched execution, review, routing, or an immediately actionable title/archive operation exists. Failed operations and parents merely waiting for descendants remain auditable but do not keep the heartbeat. Once no actionable work remains, rearm returns `delete_controller_heartbeat`.

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
