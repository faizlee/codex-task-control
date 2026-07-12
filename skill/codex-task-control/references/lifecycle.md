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

Each registry has `schemaVersion: 1`, `projectKey`, `projectRoot`, `rootControllerThreadIds`, `updatedAt`, and `tasks`. Each task has `threadId`, `parentThreadId`, `directControllerThreadId`, `title`, `model`, `thinking`, `status`, `candidateCommit`, `reviewVerdict`, `integrationStatus`, `notificationStatus`, and `updatedAt`. A task's `directControllerThreadId` equals its `parentThreadId`: a root child is controlled by a root controller, while a nested child is controlled by its registered parent task.

Allowed values:

- `status`: `executing`, `awaiting_review`, `changes_requested`, `accepted`, `integrated`, `blocked`.
- `reviewVerdict`: `pending`, `changes_requested`, `accepted`.
- `integrationStatus`: `not_integrated`, `integrated`.
- `notificationStatus`: `pending`, `sent`, `failed`.
- `thinking`: `low`, `medium`, `high`.

Lifecycle invariants are checked before every controller write:

```text
executing -> awaiting_review -> accepted -> integrated
     └──-> changes_requested -> awaiting_review
awaiting_review -> changes_requested
```

Only the task's `directControllerThreadId` may perform register/ingest for that task, notification-status updates, `changes_requested`, `accepted`, and `integrated`. Root controllers are kept in `rootControllerThreadIds`; multiple roots may coexist in one project and cannot cross-review each other's children. A child cannot write the central registry and cannot claim `accepted` or `integrated`.

## Child artifacts

Self lookup scans the project index. Exactly one matching task is required; zero matches and matches in multiple projects both fail closed. Parent identity always comes from that task's `parentThreadId`. Thread IDs are path-safe identifiers containing only letters, digits, colon, underscore, and hyphen.

Completion artifacts are independently created JSON files with `schemaVersion: 1`, `type: "task_completed"`, the task's `projectKey`, `threadId`, direct `parentThreadId`, `controllerThreadId`, `status: "awaiting_review"`, non-empty `candidateCommit`, and an ISO `createdAt`. Notification failure receipts have `type: "notification_failed"`, the same identity fields, a non-empty `reason`, and `createdAt`.

The controller verifies project, parent, timestamp freshness, and lifecycle before ingesting. A new completion after `changes_requested` must have a new candidate identity; ingest resets review and notification state. Old or repeated artifacts are rejected.

## Lock contract

Registry and project-index read/modify/write operations use an exclusive `<target>.lock` file containing `{pid, createdAt, nonce}` plus an independent `<target>.lock.recovery` mutex. Main acquisition waits while recovery is held; only the recovery owner may verify and remove a stale main lock. Defaults are conservative; tests may inject `staleMs`, `maxAttempts`, and `retryDelayMs` into the exported lock helper. A lock is reclaimable only after exceeding `staleMs` and repeated owner checks still match. Recovery-mutex stale handling is also bounded and conservative. Release takes the same recovery mutex, re-reads the owner nonce before deletion, and leaves a replacement lock untouched.

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
