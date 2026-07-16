# Four behavior RED evidence

Command run before production implementation:

```powershell
node --test --test-name-pattern="mechanical contract amendment|explicit execution and observability|failure-domain value classification|untriggered confirmed one-shot" skill/codex-task-control/scripts/task-control.unit.test.mjs
```

Observed result: `tests 4`, `pass 0`, `fail 4`.

- `controllerAmendImplementationContract` was `undefined`.
- `evidenceClass` was rejected as an unknown evidence-command field.
- `failureValueClassForDomain` was `undefined`.
- completion replaced the confirmed heartbeat with a new generation despite the prior one-shot being untriggered.

The terminal output (including file/line evidence and the generated replacement action) was captured in the task turn immediately before the implementation patches. The post-implementation focused command passes all four checks.
