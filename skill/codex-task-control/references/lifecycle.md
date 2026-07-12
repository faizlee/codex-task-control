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

Each registry has `schemaVersion: 1`, `projectKey`, `projectRoot`, `rootControllerThreadIds`, `updatedAt`, and `tasks`. New task records include delegation evidence plus `displayKey`, `desiredThreadTitle`, `titleSyncStatus`, `lastSyncedTitle`, `titleSyncError`, `archiveStatus`, `archivedAt`, and `archiveError`. Completion ingestion records `completionEventCreatedAt` as the notification-failure freshness anchor. Legacy records remain readable; controller writes migrate them deterministically, while partial field groups fail closed. A task's `directControllerThreadId` equals its `parentThreadId`.

New registrations also store routing evidence: `workClass`, `decisionStatus`, `scope`, `acceptance`, and `forbiddenDecisions`. Execution truth is separate from review truth through `executionStatus`, `nextOwner`, `attemptCount`, `failureClass`, `changesRequestedReason`, and `reclaimedReason`. Legacy records without these complete field groups remain readable and gain deterministic execution defaults during the next controller mutation.

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
- `decisionStatus`: `resolved` for every delegated task.
- `executionStatus`: `running`, `stopped`, `awaiting_review`, `terminal`.
- `nextOwner`: `worker`, `controller`, `undecided`, `none`.
- `failureClass`: `mechanical`, `comprehension`, `judgment`, `spec_missing`; `unclassified` is migration-only.
- New delegated workers require `delegationMode: explicit`, `executionSurface: visible_task`, `modelClass: economical`, and `thinking: low`.

## Delegation gate

Internal Codex subagents are forbidden. Delegated work must be a user-visible Codex task/thread. Registration rejects missing explicit authorization, any execution surface other than `visible_task`, any model class other than `economical`, any thinking value other than `low`, a quota reason shorter than 12 characters, unresolved decisions, `controller_only` work, missing scope/acceptance/forbidden-decision evidence, and the placeholder title `等待主控登记`.

Use `repeatable` only when the worker can follow explicit rules and a fixed test oracle. Use `bounded_reasoning` only after the controller has resolved contracts and policy choices. Architecture, contract conflicts, persistence-trust selection, stop/continue policy, ambiguous fixtures, planning, review, and integration are controller-only even when a stronger worker might succeed.

`audit-model-routing` scans only non-terminal tasks across project registries. It reports legacy records without routing evidence and records whose actual model does not match their `workClass`. The audit is read-only; remediation belongs to the recorded direct controller, which must stop or reclaim the old task and register a replacement rather than mutating model identity in place.

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

Completion artifacts are independently created JSON files with `schemaVersion: 1`, `type: "task_completed"`, the task's `projectKey`, `threadId`, direct `parentThreadId`, `controllerThreadId`, `status: "awaiting_review"`, non-empty `candidateCommit`, and an ISO `createdAt`. Notification failure receipts have `type: "notification_failed"`, the same identity fields, a non-empty `reason`, and `createdAt`.

The controller verifies project, parent, timestamp freshness, and lifecycle before ingesting. Completion is accepted only while `status=executing`; a stopped `changes_requested` task cannot submit. Explicit rework must produce a new candidate identity. Old or repeated artifacts are rejected.

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

Registration returns `dispatchAllowed: false` and a `set_thread_title` action. The controller calls `codex_app__set_thread_title` with the exact returned value and records success with `controller-record-title-synced`; only then may it send the work prompt. A stale acknowledgement fails closed. Title-tool failure is recorded with `controller-record-title-failed` and remains retryable. Later lifecycle title failures do not roll back the lifecycle state.

## Terminal archive contract

Only `integrated`, `blocked`, and `reclaimed` tasks enter archive processing. `controller-scan-events` returns a `set_thread_archived` action only after the terminal title is synced and every visible descendant is already archived. The controller calls `codex_app__set_thread_archived` with `archived: true`, then records success or failure. Archive failures remain retryable.

Archiving affects only the Codex sidebar thread. The registry record and event artifacts remain durable audit evidence. Root controllers are never represented as worker records and are never automatically archived.

## Wake-up and scan contract

A file under `events/` does not wake a Codex thread. The child sends the short completion notification to its registered direct parent, while the direct controller maintains a five-minute heartbeat and runs `controller-scan-events` as fallback.

The scanner is read-only. It returns fresh `pendingEvents`, `reviewQueue`, stopped `routingQueue`, genuinely running direct `activeTasks`, terminal `pendingCleanupTasks`, and `threadActions`. A `changes_requested` task appears in `routingQueue`, never in `activeTasks`; heartbeat output must not describe it as running or reworking. `needsControllerAttention` covers actionable events, review items, routing decisions, and tool actions. `shouldKeepHeartbeat` remains true while work, review, routing, or terminal cleanup remains, including a parent waiting for descendant archives; it becomes false only after complete lifecycle and sidebar cleanup.

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
  "modelRoutingSource": "config/codex-model-routing.json",
  "nativeAdapter": "scripts/task-control/task-control.ts"
}
```

No copied rules, model values, commands, test lists, or acceptance policy belong in an adapter. If `nativeAdapter` is present, the loader must verify that the referenced file exists under `projectRoot`; omit it when the project has no native adapter.
