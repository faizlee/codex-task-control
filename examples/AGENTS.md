# Codex task-control policy

- Never create Codex internal subagents or use `spawn_agent`. Keep frontier reasoning, planning, review, and integration in the controller.
- Authorize a visible worker only for mechanical work when premium-quota savings exceed context and coordination overhead.
- Create delegated work only as a user-visible Codex task/thread. Register it with `executionSurface: visible_task`, explicit delegation, an economical model class, low reasoning, and a concrete quota reason before sending its prompt.
- Register with a semantic title, apply the returned `set_thread_title` action, and record title sync before sending any work. Never leave a task named `等待主控登记`.
- Keep the semantic title stable and update only its lifecycle prefix. Use the ledger-assigned hierarchical display key to show sibling and parent/child relationships.
- Visible sibling and nested tasks are allowed only when each remains independently visible and registered.
- A child task may query only its own record, emit a completion event, or emit a notification-failure receipt.
- A child must resolve its direct parent from the ledger and notify only that parent.
- Only the controller may register tasks, ingest events, or mark `changes_requested`, `accepted`, and `integrated`.
- The controller heartbeat applies pending title and archive actions. Archive `integrated` or `blocked` descendants before their parent, but retain all ledger history.
- Project-local `AGENTS.md`, workflows, tests, and acceptance rules remain authoritative.
- If a visible task is not registered, stop and report that it is waiting for controller registration.
