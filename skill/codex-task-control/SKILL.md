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
5. Classify work before creating a task shell. Use `repeatable` only when rules, inputs, expected results, and the test oracle are explicit; it must use exactly `gpt-5.6-luna` with medium thinking. Use `bounded_reasoning` only after contracts and policy decisions are resolved but local code understanding is still needed; it must use exactly `gpt-5.6-terra` with medium thinking by default or high thinking when the decided work spans enough code to justify it. Never use low thinking. Keep work in the frontier controller whenever architecture, contract conflict, trusted-source selection, error policy, fixture validity, or another judgment remains unresolved.
6. Authorize a worker only when the expected premium-quota saving exceeds the new context and coordination overhead. A model upgrade never repairs an ambiguous task; resolve decisions and narrow the contract first.
7. Create a visible task shell only to obtain its thread ID. Register it with a semantic `--title`, never the placeholder `等待主控登记`. Require `--execution-surface visible_task`, `--delegation explicit`, `--model-class economical`, work-class-compatible medium or high thinking, a concrete `--quota-reason`, `--work-class`, `--decision-status resolved`, exact `--scope`, executable `--acceptance`, and explicit `--forbidden-decisions`.
8. Read the registration result's `requiredThreadActions`. Call `codex_app__set_thread_title` with the exact returned title, then record success with `controller-record-title-synced`. Do not send the work prompt until `dispatchAllowed: true`. On tool failure, call `controller-record-title-failed` and stop dispatch.
9. Keep the semantic title stable. The ledger allocates `01`, `02`, and nested `01.1` display keys and changes only the lifecycle prefix: `执行`, `待审`, `待决`, `返工`, `收回`, `接收`, `完成`, or `阻塞`. `changes_requested` means stopped and awaiting a controller routing decision; it never means the worker is running.
10. Visible tasks may be siblings or nested visible tasks. Every visible task must be independently registered and remain directly inspectable by the user.
11. A worker may only query itself, create a completion event, or create a notification-failure receipt. It must obtain `parentThreadId` and `notificationText` from the ledger and notify only that direct parent.
12. The controller alone ingests events and marks `changes_requested`, dispatches rework, reclaims work, blocks, accepts, and integrates. Classify each review failure as `mechanical`, `comprehension`, `judgment`, or `spec_missing`. Allow the same worker one explicit rework only for `mechanical`; reclaim all other failures immediately, and reclaim after a second failed review. A Luna-to-Terra escalation must close the old task as `reclaimed` and register a new bounded visible task.
13. Maintain a five-minute heartbeat after visible-task registration or continuation. Run `controller-scan-events`; stay silent only when `needsControllerAttention: false`. Apply every returned `threadAction` through `codex_app__set_thread_title` or `codex_app__set_thread_archived`, then record success or failure with the matching controller command.
14. Archive only `integrated`, `blocked`, or `reclaimed` tasks. Archive visible descendants first, then their parent. Keep registry and event history; archive only the Codex sidebar thread.
15. After installation or upgrade, run `audit-model-routing`, `audit-thinking-routing`, and `audit-archive-backlog`. The routing audits are read-only; active legacy low-thinking tasks must be reclaimed by their registered direct controller rather than mutated in place. The archive audit groups terminal cleanup by registered direct controller. Each owner must run its controller scan, apply returned title/archive actions descendant-first, and record success or failure; never impersonate another controller or mutate legacy evidence directly.
16. Delete the heartbeat only when `controller-scan-events` returns `shouldKeepHeartbeat: false`, which means no active work, pending review, routing decision, title sync, or archive action remains.

## Commands

```text
node scripts/task-control.mjs query-parent --self <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs complete --self <thread-id> --candidate-commit <candidate> --codex-home <CODEX_HOME>
node scripts/task-control.mjs notification-failed --self <thread-id> --reason "..." --codex-home <CODEX_HOME>
node scripts/task-control.mjs audit-model-routing --codex-home <CODEX_HOME>
node scripts/task-control.mjs audit-thinking-routing --codex-home <CODEX_HOME>
node scripts/task-control.mjs audit-archive-backlog --codex-home <CODEX_HOME>

node scripts/task-control.mjs register --project-root <root> --controller <controller-id> --thread <thread-id> --parent <parent-id> --title "..." --model <gpt-5.6-luna|gpt-5.6-terra> --thinking <medium|high> --delegation explicit --execution-surface visible_task --model-class economical --quota-reason "Mechanical work is cheaper than using the frontier controller." --work-class repeatable --decision-status resolved --scope "Only update named files." --acceptance "Run the targeted test successfully." --forbidden-decisions "Do not change contracts or error policy." --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-ingest-completion --project-root <root> --controller <controller-id> --event <event.json> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-mark-notification-sent --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-ingest-notification-failed --project-root <root> --controller <controller-id> --receipt <receipt.json> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-scan-events --project-root <root> --controller <controller-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs mark-changes-requested --project-root <root> --controller <controller-id> --thread <thread-id> --failure-class mechanical --reason "A named assertion is missing." --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-dispatch-rework --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-reclaim --project-root <root> --controller <controller-id> --thread <thread-id> --reason "Controller must resolve the contract boundary." --codex-home <CODEX_HOME>
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
- Forbid internal subagents. Reject any execution surface other than `visible_task`, missing explicit authorization, non-economical workers, low thinking, and missing quota justification.
- Fail closed on a `workClass`/model/thinking mismatch, unresolved decisions, missing scope/acceptance/decision boundaries, controller-only work, non-mechanical redispatch, a second rework, placeholder titles, stale title acknowledgements, partial title/archive metadata, archive-before-terminal, archive-before-title-sync, and parent archive while a visible descendant remains unarchived.
- Never send a work prompt while `dispatchAllowed` is false. Title sync failure is a dispatch blocker; later title/archive failures remain retryable heartbeat actions.
- Never delete terminal task history. `codex_app__set_thread_archived` cleans the sidebar; the ledger retains identity, lifecycle, notification, title-sync, and archive evidence.
- Never treat a completion file as proof of notification. `notificationStatus: sent` requires a real successful message to the registered direct parent.
- Use atomic registry replacement and exclusive event-file creation. Lock files contain `pid`, `createdAt`, and `nonce`; stale recovery requires a threshold check plus repeated owner verification, and release deletes only a matching nonce.
- Run tests with a temporary `--codex-home` or `--task-control-home`; omitted storage arguments must resolve through a test-only `CODEX_HOME` sandbox.
