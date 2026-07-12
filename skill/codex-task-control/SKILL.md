---
name: codex-task-control
description: Control user-visible Codex tasks with economical-model routing, hierarchical live titles, direct-parent notification, heartbeat recovery, review gates, and terminal auto-archive while forbidding internal subagents. Use when visible Codex tasks must be registered, distinguished in the sidebar, reviewed, retried, integrated, blocked, or archived without losing ledger history.
---

# Codex Task Control

Use the bundled `scripts/task-control.mjs` as the outer ledger layer. It records task identity and lifecycle evidence while leaving project workflow authority in the project's own `AGENTS.md`, SOPs, model-routing config, native adapter, commands, and tests.

## Workflow

1. Resolve the project root and read its `AGENTS.md` plus the applicable SOP/workflow sources before doing project work.
2. Use the project adapter only to locate those sources. Never copy policy text into the adapter or let the adapter override project rules.
3. Set `CODEX_HOME` (or pass `--codex-home`) so the ledger is stored at `$CODEX_HOME/task-control/`; use `--task-control-home` only when passing the exact task-control root. The index is `projects.json`; each project has an isolated `projects/<project-key>/task-registry.json` and `events/` directory.
4. Do the work in the controller by default. Never call internal subagent, multi-agent, or `spawn_agent` capabilities. Delegated work must exist as a user-visible Codex task/thread in the sidebar.
5. Authorize a worker only when the task is mechanical and the expected premium-quota saving exceeds the new context and coordination overhead. Keep planning, architecture, ambiguous judgment, review, and integration in the frontier controller.
6. Create a visible task shell only to obtain its thread ID. Register it with a semantic `--title`, never the placeholder `等待主控登记`. Require `--execution-surface visible_task`, `--delegation explicit`, `--model-class economical`, `--thinking low`, and a concrete `--quota-reason`.
7. Read the registration result's `requiredThreadActions`. Call `codex_app__set_thread_title` with the exact returned title, then record success with `controller-record-title-synced`. Do not send the work prompt until `dispatchAllowed: true`. On tool failure, call `controller-record-title-failed` and stop dispatch.
8. Keep the semantic title stable. The ledger allocates `01`, `02`, and nested `01.1` display keys and changes only the lifecycle prefix: `执行`, `待审`, `返工`, `接收`, `完成`, or `阻塞`.
9. Visible tasks may be siblings or nested visible tasks. Every visible task must be independently registered and remain directly inspectable by the user.
10. A worker may only query itself, create a completion event, or create a notification-failure receipt. It must obtain `parentThreadId` and `notificationText` from the ledger and notify only that direct parent.
11. The controller alone ingests events and marks `changes_requested`, `blocked`, `accepted`, and `integrated`. After every lifecycle mutation, apply the returned title action and record its result. Stop the worker at `awaiting_review`; never let it claim acceptance or integration.
12. Maintain a five-minute heartbeat after visible-task registration or continuation. Run `controller-scan-events`; stay silent only when `needsControllerAttention: false`. Apply every returned `threadAction` through `codex_app__set_thread_title` or `codex_app__set_thread_archived`, then record success or failure with the matching controller command.
13. Archive only `integrated` or `blocked` tasks. Archive visible descendants first, then their parent. Keep registry and event history; archive only the Codex sidebar thread.
14. Delete the heartbeat only when `controller-scan-events` returns `shouldKeepHeartbeat: false`, which means no active work, pending review, title sync, or archive action remains.

## Commands

```text
node scripts/task-control.mjs query-parent --self <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs complete --self <thread-id> --candidate-commit <candidate> --codex-home <CODEX_HOME>
node scripts/task-control.mjs notification-failed --self <thread-id> --reason "..." --codex-home <CODEX_HOME>

node scripts/task-control.mjs register --project-root <root> --controller <controller-id> --thread <thread-id> --parent <parent-id> --title "..." --model <economical-model> --thinking low --delegation explicit --execution-surface visible_task --model-class economical --quota-reason "Mechanical work is cheaper than using the frontier controller." --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-ingest-completion --project-root <root> --controller <controller-id> --event <event.json> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-mark-notification-sent --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-ingest-notification-failed --project-root <root> --controller <controller-id> --receipt <receipt.json> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-scan-events --project-root <root> --controller <controller-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs mark-changes-requested --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs mark-blocked --project-root <root> --controller <controller-id> --thread <thread-id> --reason "..." --codex-home <CODEX_HOME>
node scripts/task-control.mjs mark-accepted --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs mark-integrated --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>

node scripts/task-control.mjs controller-record-title-synced --project-root <root> --controller <controller-id> --thread <thread-id> --title "<exact returned title>" --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-record-title-failed --project-root <root> --controller <controller-id> --thread <thread-id> --title "<exact returned title>" --reason "..." --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-record-archive-succeeded --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-record-archive-failed --project-root <root> --controller <controller-id> --thread <thread-id> --reason "..." --codex-home <CODEX_HOME>
```

Use `references/lifecycle.md` for the schema, state invariants, event contract, and fail-closed rules. Use `assets/project-adapter.example.json` as the minimal adapter shape.

## Safety boundaries

- Do not write `$CODEX_HOME/AGENTS.md`, `$CODEX_HOME/skills/`, project files, or live project ledgers while building or reviewing a candidate.
- Keep project-specific rules in project sources; this skill is an outer control-plane ledger, not a replacement workflow.
- Treat duplicate self-thread IDs across projects, stale events, wrong parents/projects, cycles, invalid enums, and contradictory lifecycle records as errors.
- Reject unsafe thread identifiers before registry reads or event path construction; never interpolate `/`, `\\`, `.`, `..`, or whitespace into an events path.
- Keep provider calls at zero for ledger-only work; this skill records local control evidence and does not invoke a model provider.
- Forbid internal subagents. Reject any execution surface other than `visible_task`, missing explicit authorization, non-economical/high-thinking workers, and missing quota justification.
- Fail closed on placeholder titles, stale title acknowledgements, partial title/archive metadata, archive-before-terminal, archive-before-title-sync, and parent archive while a visible descendant remains unarchived.
- Never send a work prompt while `dispatchAllowed` is false. Title sync failure is a dispatch blocker; later title/archive failures remain retryable heartbeat actions.
- Never delete terminal task history. `codex_app__set_thread_archived` cleans the sidebar; the ledger retains identity, lifecycle, notification, title-sync, and archive evidence.
- Never treat a completion file as proof of notification. `notificationStatus: sent` requires a real successful message to the registered direct parent.
- Use atomic registry replacement and exclusive event-file creation. Lock files contain `pid`, `createdAt`, and `nonce`; stale recovery requires a threshold check plus repeated owner verification, and release deletes only a matching nonce.
- Run tests with a temporary `--codex-home` or `--task-control-home`; omitted storage arguments must resolve through a test-only `CODEX_HOME` sandbox.
