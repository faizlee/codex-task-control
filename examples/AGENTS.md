# Codex task-control policy

- Never create Codex internal subagents or use `spawn_agent`. Keep frontier reasoning, planning, review, and integration in the controller.
- Use exactly `gpt-5.6-sol` for the frontier controller. Default to high reasoning; use medium only for bounded short control work. Before xhigh, run `audit-controller-routing` with `hard_arbitration`, an allowed escalation trigger, and a concrete reason. Use max only for `final_arbitration` with explicit user authority or evidence that xhigh remained unresolved. Never spend Sol xhigh/max on mechanical work.
- Classify delegated work as `repeatable` only with exactly `gpt-5.6-luna` and medium reasoning, or `bounded_reasoning` only with exactly `gpt-5.6-terra` and medium or high reasoning. Never use low reasoning. Keep architecture, contract conflicts, trust decisions, error policy, ambiguous fixtures, review, and integration in the frontier controller.
- Create delegated work only as a user-visible Codex task/thread. Before sending its prompt, register it with `executionSurface: visible_task`, explicit delegation, an economical model class, work-class-compatible reasoning, a concrete quota reason, resolved decisions, exact scope, executable acceptance, and forbidden decision boundaries.
- Register with a semantic title, apply the returned `set_thread_title` action, and record title sync before sending any work. Never leave a task named `等待主控登记`.
- Keep the semantic title stable and update only its lifecycle prefix. Use the ledger-assigned hierarchical display key to show sibling and parent/child relationships.
- Visible sibling and nested tasks are allowed only when each remains independently visible and registered.
- A child task may query only its own record, emit a completion event, or emit a notification-failure receipt.
- A child must resolve its direct parent from the ledger and notify only that parent.
- Only the controller may register tasks, ingest events, request changes, explicitly dispatch one mechanical rework, reclaim work, accept, or integrate.
- Treat `changes_requested` as stopped and undecided, not as running. Reclaim comprehension, judgment, and missing-spec failures immediately; after a second failed review, reclaim instead of looping.
- Start the controller's replaceable one-shot heartbeat only after a work prompt is really sent and `controller-record-dispatched` succeeds. Renew from ingested progress, reorder after completion/reconciliation, and ignore stale generations.
- The controller heartbeat applies only pending, currently actionable title and archive actions. A recorded tool failure becomes audit debt and must not keep the heartbeat or retry automatically; only the registered direct controller may explicitly requeue it. Archive `integrated`, `blocked`, or `reclaimed` descendants before their parent, but retain all ledger history.
- After install or upgrade, run `audit-model-routing`, `audit-thinking-routing`, and `audit-archive-backlog`. Treat active legacy low-thinking tasks as direct-controller reclaim work and missing legacy archive metadata as pending cleanup in memory; only the recorded direct controller may apply actions and record their results.
- Project-local `AGENTS.md`, workflows, tests, and acceptance rules remain authoritative.
- If a visible task is not registered, stop and report that it is waiting for controller registration.
