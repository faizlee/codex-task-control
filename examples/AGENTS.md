# Codex task-control policy

- Register every visible child task before starting it. Record the project root, direct parent, model, and reasoning level.
- A child task may query only its own record, emit a completion event, or emit a notification-failure receipt.
- A child must resolve its direct parent from the ledger and notify only that parent.
- Only the controller may register tasks, ingest events, or mark `changes_requested`, `accepted`, and `integrated`.
- Project-local `AGENTS.md`, workflows, tests, and acceptance rules remain authoritative.
- If a visible task is not registered, stop and report that it is waiting for controller registration.
