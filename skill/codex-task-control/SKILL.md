---
name: codex-task-control
description: Forbid internal Codex subagents and require delegated work to run only in user-visible Codex tasks/threads with explicit economical-model routing, quota justification, and a review-gated ledger lifecycle. Use when Codex work must preserve premium-model quota while creating, registering, reviewing, retrying, or integrating visible child tasks without replacing project-specific rules.
---

# Codex Task Control

Use the bundled `scripts/task-control.mjs` as the outer ledger layer. It records task identity and lifecycle evidence while leaving project workflow authority in the project's own `AGENTS.md`, SOPs, model-routing config, native adapter, commands, and tests.

## Workflow

1. Resolve the project root and read its `AGENTS.md` plus the applicable SOP/workflow sources before doing project work.
2. Use the project adapter only to locate those sources. Never copy policy text into the adapter or let the adapter override project rules.
3. Set `CODEX_HOME` (or pass `--codex-home`) so the ledger is stored at `$CODEX_HOME/task-control/`; use `--task-control-home` only when passing the exact task-control root. The index is `projects.json`; each project has an isolated `projects/<project-key>/task-registry.json` and `events/` directory.
4. Do the work in the controller by default. Never call internal subagent, multi-agent, or `spawn_agent` capabilities. Delegated work must exist as a user-visible Codex task/thread in the sidebar.
5. Authorize a worker only when the task is mechanical and the expected premium-quota saving exceeds the new context and coordination overhead. Keep planning, architecture, ambiguous judgment, review, and integration in the frontier controller.
6. Create a visible task shell through the product's task/thread surface, then register it before sending any work. Require `--execution-surface visible_task`, `--delegation explicit`, `--model-class economical`, `--thinking low`, and a concrete `--quota-reason`. If registration fails, do not send the task prompt.
7. Visible tasks may be siblings or nested visible tasks. Every visible task must be independently registered and remain directly inspectable by the user.
8. A worker task may only query itself, create a completion event, or create a notification-failure receipt. It must obtain `parentThreadId` from its registered record and notify only that direct parent.
9. The controller ingests events and is the only actor allowed to register tasks or mark `changes_requested`, `accepted`, and `integrated`.
10. Stop the worker at `awaiting_review`; never let it claim acceptance or integration. It must not create an internal subagent; any further delegated visible task must independently pass the same registration gate.

## Commands

```text
node scripts/task-control.mjs query-parent --self <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs complete --self <thread-id> --candidate-commit <candidate> --codex-home <CODEX_HOME>
node scripts/task-control.mjs notification-failed --self <thread-id> --reason "..." --codex-home <CODEX_HOME>

node scripts/task-control.mjs register --project-root <root> --controller <controller-id> --thread <thread-id> --parent <parent-id> --title "..." --model <economical-model> --thinking low --delegation explicit --execution-surface visible_task --model-class economical --quota-reason "Mechanical work is cheaper than using the frontier controller." --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-ingest-completion --project-root <root> --controller <controller-id> --event <event.json> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-mark-notification-sent --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs controller-ingest-notification-failed --project-root <root> --controller <controller-id> --receipt <receipt.json> --codex-home <CODEX_HOME>
node scripts/task-control.mjs mark-changes-requested --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs mark-accepted --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
node scripts/task-control.mjs mark-integrated --project-root <root> --controller <controller-id> --thread <thread-id> --codex-home <CODEX_HOME>
```

Use `references/lifecycle.md` for the schema, state invariants, event contract, and fail-closed rules. Use `assets/project-adapter.example.json` as the minimal adapter shape.

## Safety boundaries

- Do not write `$CODEX_HOME/AGENTS.md`, `$CODEX_HOME/skills/`, project files, or live project ledgers while building or reviewing a candidate.
- Keep project-specific rules in project sources; this skill is an outer control-plane ledger, not a replacement workflow.
- Treat duplicate self-thread IDs across projects, stale events, wrong parents/projects, cycles, invalid enums, and contradictory lifecycle records as errors.
- Reject unsafe thread identifiers before registry reads or event path construction; never interpolate `/`, `\\`, `.`, `..`, or whitespace into an events path.
- Keep provider calls at zero for ledger-only work; this skill records local control evidence and does not invoke a model provider.
- Forbid internal subagents. Reject any execution surface other than `visible_task`, missing explicit authorization, frontier/high-thinking workers, and missing quota justification.
- Use atomic registry replacement and exclusive event-file creation. Lock files contain `pid`, `createdAt`, and `nonce`; stale recovery requires a threshold check plus repeated owner verification, and release deletes only a matching nonce.
- Run tests with a temporary `--codex-home` or `--task-control-home`; omitted storage arguments must resolve through a test-only `CODEX_HOME` sandbox.
