import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  TaskControlError,
  auditControllerRouting,
  controllerIngestCompletion,
  controllerIngestProgress,
  controllerIngestNotificationFailed,
  controllerMarkChangesRequested,
  controllerMarkAccepted,
  controllerMarkBlocked,
  controllerMarkIntegrated,
  controllerRecordArchiveFailed,
  controllerRecordArchiveSucceeded,
  controllerRecordDispatched,
  controllerRecordTitleFailed,
  controllerRecordTitleSynced,
  controllerRegisterTask,
  controllerRetryThreadAction,
  controllerScanPendingEvents,
  createCompletionEvent,
  createProgressEvent,
  createNotificationFailureReceipt,
  loadProjectAdapter,
  projectKeyForRoot,
  runCli,
} from './task-control.mjs';

const delay = () => new Promise((resolve) => setTimeout(resolve, 5));

function implementationManifest({ visual = false } = {}) {
  return {
    schemaVersion: 1,
    contractRevision: 'contract-r1',
    reuseRequirements: ['Reuse the existing parser and test fixture.'],
    forbiddenNewPaths: ['src/replacement/**'],
    forbiddenReimplementations: ['Do not reimplement the existing parser.'],
    stageGates: [
      { id: 'reuse-check', required: true, description: 'Confirm the existing path is reused.', requiredEvidence: ['inspection'] },
      { id: 'verification', required: true, description: 'Run the fixed verification command.', requiredEvidence: ['targeted-test'] },
    ],
    evidenceCommands: [
      { id: 'inspection', command: 'git diff --check' },
      { id: 'targeted-test', command: 'npm test -- contract' },
    ],
    errorPolicy: { mode: 'stop_on_error', rules: ['Stop on any ERROR output.', 'Do not weaken acceptance criteria.'] },
    ...(visual ? { visualOracle: { stageId: 'verification', reference: 'docs/oracle.png', criteria: ['No overlap.', 'No ERROR banner.'] } } : {}),
  };
}

function implementationInput(taskControlHome, projectRoot, overrides = {}) {
  return {
    taskControlHome,
    projectRoot,
    controllerThreadId: 'contract-controller',
    parentThreadId: 'contract-controller',
    threadId: overrides.threadId ?? 'contract-worker',
    title: 'Implement fixed contract',
    model: 'gpt-5.6-terra',
    thinking: 'medium',
    delegationMode: 'explicit',
    executionSurface: 'visible_task',
    modelClass: 'economical',
    quotaReason: 'Bounded implementation saves meaningful frontier quota.',
    workClass: 'bounded_reasoning',
    decisionStatus: 'resolved',
    scope: 'Only implement the paths named by the bound contract.',
    acceptance: 'Complete every required stage with the named evidence.',
    forbiddenDecisions: 'Do not change the contract, error policy, or acceptance oracle.',
    taskMode: overrides.taskMode ?? 'implementation',
    implementationContractPath: overrides.implementationContractPath,
  };
}

async function invokeCli(args) {
  let output = '';
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => { output += String(chunk); return true; };
  try {
    await runCli(args);
  } finally {
    process.stdout.write = originalWrite;
  }
  return JSON.parse(output);
}

async function register(input) {
  const registrationInput = { taskMode: 'control_only', ...input };
  const task = await controllerRegisterTask(registrationInput);
  const synced = await controllerRecordTitleSynced({ ...input, title: task.desiredThreadTitle });
  const dispatched = await controllerRecordDispatched(input);
  return { task, synced, dispatched };
}

test('Sol controller routing defaults to high and allows evidence-gated escalation', async () => {
  assert.deepEqual(auditControllerRouting({
    model: 'gpt-5.6-sol',
    thinking: 'medium',
    controllerWorkClass: 'bounded_control',
  }), {
    compliant: true,
    model: 'gpt-5.6-sol',
    thinking: 'medium',
    controllerWorkClass: 'bounded_control',
    escalationTrigger: null,
    escalationReason: null,
    maxAuthority: null,
    providerCalls: 0,
  });

  assert.equal(auditControllerRouting({
    model: 'gpt-5.6-sol',
    thinking: 'high',
    controllerWorkClass: 'frontier_control',
  }).thinking, 'high');

  const xhigh = auditControllerRouting({
    model: 'gpt-5.6-sol',
    thinking: 'xhigh',
    controllerWorkClass: 'hard_arbitration',
    escalationTrigger: 'cross_module_contract_conflict',
    escalationReason: 'Multiple modules encode incompatible contract boundaries.',
  });
  assert.equal(xhigh.escalationTrigger, 'cross_module_contract_conflict');

  const max = auditControllerRouting({
    model: 'gpt-5.6-sol',
    thinking: 'max',
    controllerWorkClass: 'final_arbitration',
    escalationReason: 'The user explicitly authorized maximum reasoning for final arbitration.',
    maxAuthority: 'user_explicit',
  });
  assert.equal(max.maxAuthority, 'user_explicit');
});

test('Sol controller routing fails closed on low thinking, mechanical work, and unsupported escalation', async () => {
  const expectCode = async (input, code) => assert.rejects(
    async () => auditControllerRouting(input),
    (error) => error instanceof TaskControlError && error.code === code,
  );

  await expectCode({ model: 'gpt-5.6-sol', thinking: 'low', controllerWorkClass: 'frontier_control' }, 'CONTROLLER_THINKING_TOO_LOW');
  await expectCode({ model: 'gpt-5.6-terra', thinking: 'high', controllerWorkClass: 'frontier_control' }, 'CONTROLLER_MODEL_REQUIRED');
  await expectCode({ model: 'gpt-5.6-sol', thinking: 'xhigh', controllerWorkClass: 'repeatable' }, 'CONTROLLER_MECHANICAL_WORK_FORBIDDEN');
  await expectCode({ model: 'gpt-5.6-sol', thinking: 'xhigh', controllerWorkClass: 'frontier_control' }, 'CONTROLLER_THINKING_WORK_CLASS_MISMATCH');
  await expectCode({ model: 'gpt-5.6-sol', thinking: 'xhigh', controllerWorkClass: 'hard_arbitration' }, 'CONTROLLER_ESCALATION_TRIGGER_REQUIRED');
  await expectCode({ model: 'gpt-5.6-sol', thinking: 'xhigh', controllerWorkClass: 'hard_arbitration', escalationTrigger: 'formatting', escalationReason: 'Formatting should not use frontier escalation.' }, 'CONTROLLER_ESCALATION_TRIGGER_INVALID');
  await expectCode({ model: 'gpt-5.6-sol', thinking: 'max', controllerWorkClass: 'final_arbitration', escalationReason: 'No authority was supplied for maximum reasoning.' }, 'CONTROLLER_MAX_AUTHORITY_REQUIRED');
});

test('audit-controller-routing CLI returns a zero-provider preflight decision', async () => {
  const result = await invokeCli([
    'audit-controller-routing',
    '--model', 'gpt-5.6-sol',
    '--thinking', 'xhigh',
    '--work-class', 'hard_arbitration',
    '--escalation-trigger', 'high_failed',
    '--reason', 'A prior high-reasoning controller pass failed to resolve the conflict.',
  ]);
  assert.equal(result.compliant, true);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.thinking, 'xhigh');
});

test('project adapter accepts project rules without a project model-routing source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-task-control-adapter-'));
  try {
    const adapterPath = join(root, 'adapter.json');
    const expected = {
      projectRoot: 'E:\\work\\project\\example',
      rulesSources: ['AGENTS.md'],
      workflowSources: [],
    };
    await writeFile(adapterPath, JSON.stringify(expected), 'utf8');

    assert.deepEqual(await loadProjectAdapter(adapterPath), expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('project adapter supports ordinary project policy references and rejects legacy routing shadows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-task-control-adapter-'));
  try {
    const adapterPath = join(root, 'adapter.json');
    const expected = {
      projectRoot: 'E:\\work\\project\\example',
      rulesSources: ['AGENTS.md'],
      workflowSources: ['docs/sops/sop-001-testing.md'],
      projectPolicySources: ['docs/testing/project-acceptance.md'],
    };
    await writeFile(adapterPath, JSON.stringify(expected), 'utf8');
    assert.deepEqual(await loadProjectAdapter(adapterPath), expected);

    await writeFile(adapterPath, JSON.stringify({
      projectRoot: expected.projectRoot,
      rulesSources: expected.rulesSources,
      workflowSources: [],
      modelRoutingSource: 'config/codex-model-routing.json',
    }), 'utf8');
    await assert.rejects(
      loadProjectAdapter(adapterPath),
      (error) => error instanceof TaskControlError && error.code === 'ADAPTER_INVALID',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('implementation registration fails closed without a complete bound contract', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-contract-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-contract-project-'));
  try {
    const input = implementationInput(taskControlHome, projectRoot);
    await assert.rejects(controllerRegisterTask(input), (error) => error instanceof TaskControlError && error.code === 'IMPLEMENTATION_CONTRACT_REQUIRED');
    await assert.rejects(controllerRegisterTask({ ...input, taskMode: undefined }), (error) => error instanceof TaskControlError && error.code === 'TASK_MODE_REQUIRED');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('visual implementation requires a visual oracle', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-visual-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-visual-project-'));
  const contractPath = join(projectRoot, 'visual-contract.json');
  try {
    await writeFile(contractPath, `${JSON.stringify(implementationManifest(), null, 2)}\n`, 'utf8');
    await assert.rejects(controllerRegisterTask(implementationInput(taskControlHome, projectRoot, { taskMode: 'visual_implementation', implementationContractPath: 'visual-contract.json' })), (error) => error instanceof TaskControlError && error.code === 'VISUAL_ORACLE_REQUIRED');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('implementation progress enforces staged evidence before completion', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-stages-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-stages-project-'));
  const contractPath = join(projectRoot, 'implementation-contract.json');
  const input = implementationInput(taskControlHome, projectRoot, { implementationContractPath: 'implementation-contract.json' });
  try {
    await writeFile(contractPath, `${JSON.stringify(implementationManifest(), null, 2)}\n`, 'utf8');
    const registered = await controllerRegisterTask(input);
    assert.equal(registered.taskMode, 'implementation');
    assert.equal(registered.dispatchAllowed, false);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    const dispatched = await controllerRecordDispatched(input);
    assert.equal(dispatched.dispatchAllowed, true);

    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'too-early' }), (error) => error instanceof TaskControlError && error.code === 'REQUIRED_STAGE_INCOMPLETE');
    await assert.rejects(createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'missing evidence', stageId: 'reuse-check', evidence: [] }), (error) => error instanceof TaskControlError && error.code === 'STAGE_EVIDENCE_MISSING');

    await delay();
    const reuseEvent = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Existing path inspected and retained.', stageId: 'reuse-check', evidence: [{ id: 'inspection', reference: 'git-diff-check.txt' }] });
    let progressed = await controllerIngestProgress({ ...input, eventPath: reuseEvent });
    assert.deepEqual(progressed.completedStages, ['reuse-check']);
    assert.deepEqual(progressed.missingStages, ['verification']);

    await delay();
    const verificationEvent = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Targeted verification passed.', stageId: 'verification', evidence: [{ id: 'targeted-test', reference: 'test-output.txt' }] });
    progressed = await controllerIngestProgress({ ...input, eventPath: verificationEvent });
    assert.deepEqual(progressed.completedStages, ['reuse-check', 'verification']);
    assert.deepEqual(progressed.missingStages, []);

    await delay();
    const completionEvent = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'candidate-contract-1' });
    const completed = await controllerIngestCompletion({ ...input, eventPath: completionEvent });
    assert.equal(completed.status, 'awaiting_review');
    assert.equal(completed.contractVersion, 'contract-r1');
    assert.deepEqual(completed.missingStages, []);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('a worker cannot change the controller-fixed contract or error policy', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-drift-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-drift-project-'));
  const contractPath = join(projectRoot, 'implementation-contract.json');
  const input = implementationInput(taskControlHome, projectRoot, { implementationContractPath: 'implementation-contract.json' });
  try {
    const manifest = implementationManifest();
    await writeFile(contractPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    manifest.errorPolicy.rules = ['Continue after ERROR and weaken acceptance.'];
    await writeFile(contractPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await assert.rejects(controllerRecordDispatched(input), (error) => error instanceof TaskControlError && error.code === 'IMPLEMENTATION_CONTRACT_DRIFT');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function withFixture(run) {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-'));
  const projectRoot = `E:\\work\\project\\scan-${Date.now()}`;
  const controllerThreadId = 'controller-thread';
  const threadId = 'child-thread';
  try {
    const base = {
      taskControlHome,
      projectRoot,
      controllerThreadId,
      parentThreadId: controllerThreadId,
      threadId,
      title: '审计 Provider 调用',
      model: 'gpt-5.6-luna',
      thinking: 'medium',
      delegationMode: 'explicit',
      executionSurface: 'visible_task',
      modelClass: 'economical',
      quotaReason: 'mechanical scan verification saves controller quota',
      workClass: 'repeatable',
      decisionStatus: 'resolved',
      scope: 'Only inspect and update the named provider call sites.',
      acceptance: 'Run the targeted unit test and require a zero exit code.',
      forbiddenDecisions: 'Do not change provider contracts or routing policy.',
    };
    await register(base);
    await run({ ...base });
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
}

test('registration allocates readable hierarchy and blocks dispatch until title sync', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-title-'));
  const projectRoot = 'E:\\work\\project\\title-hierarchy';
  const rootInput = {
    taskControlHome,
    projectRoot,
    controllerThreadId: 'root-controller',
    parentThreadId: 'root-controller',
    threadId: 'root-child',
    title: '审计 Provider 调用',
    model: 'gpt-5.6-luna',
    thinking: 'medium',
    delegationMode: 'explicit',
    executionSurface: 'visible_task',
    modelClass: 'economical',
    quotaReason: 'mechanical title verification saves controller quota',
    workClass: 'repeatable',
    decisionStatus: 'resolved',
    scope: 'Only inspect and update the named provider call sites.',
    acceptance: 'Run the targeted unit test and require a zero exit code.',
    forbiddenDecisions: 'Do not change provider contracts or routing policy.',
    taskMode: 'control_only',
  };
  try {
    const root = await controllerRegisterTask(rootInput);
    assert.equal(root.displayKey, '01');
    assert.equal(root.desiredThreadTitle, '执行｜01 审计 Provider 调用');
    assert.equal(root.dispatchAllowed, false);
    assert.deepEqual(root.requiredThreadActions, [{ type: 'set_thread_title', threadId: 'root-child', title: root.desiredThreadTitle }]);
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: 'root-child', candidateCommit: 'premature' }), (error) => error instanceof TaskControlError && error.code === 'TASK_DISPATCH_NOT_AUTHORIZED');
    const rootSynced = await controllerRecordTitleSynced({ ...rootInput, title: root.desiredThreadTitle });
    assert.equal(rootSynced.dispatchAllowed, true);

    const nested = await controllerRegisterTask({ ...rootInput, controllerThreadId: 'root-child', parentThreadId: 'root-child', threadId: 'nested-child', title: '补充超时测试' });
    assert.equal(nested.displayKey, '01.1');
    const sibling = await controllerRegisterTask({ ...rootInput, threadId: 'root-child-2', title: '检查图片合成链路' });
    assert.equal(sibling.displayKey, '02');
    await assert.rejects(controllerRegisterTask({ ...rootInput, threadId: 'placeholder', title: '等待主控登记' }), (error) => error instanceof TaskControlError && error.code === 'TASK_TITLE_PLACEHOLDER_FORBIDDEN');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('controller scan discovers a fresh completion and keeps the heartbeat', async () => {
  await withFixture(async (fixture) => {
    await delay();
    const eventPath = await createCompletionEvent({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, candidateCommit: 'candidate-1' });
    const scan = await controllerScanPendingEvents(fixture);
    assert.equal(scan.needsControllerAttention, true);
    assert.equal(scan.shouldKeepHeartbeat, true);
    assert.deepEqual(scan.pendingEvents.map((event) => ({ type: event.type, eventPath })), [{ type: 'task_completed', eventPath }]);
  });
});

test('adaptive heartbeat starts on real dispatch, renews on progress, and reorders after completion', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-'));
  const projectRoot = 'E:\\work\\project\\adaptive-heartbeat';
  const input = {
    taskControlHome,
    projectRoot,
    controllerThreadId: 'heartbeat-controller',
    parentThreadId: 'heartbeat-controller',
    threadId: 'heartbeat-worker',
    title: '执行机械验证',
    model: 'gpt-5.6-luna',
    thinking: 'medium',
    delegationMode: 'explicit',
    executionSurface: 'visible_task',
    modelClass: 'economical',
    quotaReason: 'repeatable verification saves premium controller quota',
    workClass: 'repeatable',
    decisionStatus: 'resolved',
    scope: 'Only run the named mechanical verification.',
    acceptance: 'The named verification exits with code zero.',
    forbiddenDecisions: 'Do not change contracts or test expectations.',
    taskMode: 'control_only',
  };
  try {
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    let scan = await controllerScanPendingEvents(input);
    assert.equal(scan.heartbeatState, null);
    assert.equal(scan.shouldKeepHeartbeat, false);
    await assert.rejects(createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'not actually dispatched' }), (error) => error instanceof TaskControlError && error.code === 'TASK_DISPATCH_NOT_AUTHORIZED');

    const dispatched = await controllerRecordDispatched(input);
    assert.equal(dispatched.heartbeatAction.type, 'replace_controller_heartbeat');
    assert.equal(dispatched.heartbeatAction.intervalMs, 3 * 60 * 1000);
    assert.equal(dispatched.heartbeatAction.mode, 'one_shot');
    const dispatchGeneration = dispatched.heartbeatState.generation;
    const dispatchDueAt = dispatched.heartbeatState.dueAt;

    await delay();
    const progressPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'targeted tests are running' });
    scan = await controllerScanPendingEvents(input);
    assert.deepEqual(scan.pendingEvents.map((event) => event.type), ['task_progress']);
    const progressed = await controllerIngestProgress({ ...input, eventPath: progressPath });
    assert.equal(progressed.heartbeatState.reason, 'progress');
    assert.ok(progressed.heartbeatState.generation > dispatchGeneration);
    assert.ok(Date.parse(progressed.heartbeatState.dueAt) > Date.parse(dispatchDueAt));

    const stale = await controllerScanPendingEvents({ ...input, heartbeatGeneration: dispatchGeneration });
    assert.equal(stale.staleHeartbeat, true);
    assert.equal(stale.needsControllerAttention, false);

    await delay();
    const completionPath = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'adaptive-candidate-1' });
    const completed = await controllerIngestCompletion({ ...input, eventPath: completionPath });
    assert.equal(completed.heartbeatState.reason, 'completion');
    assert.equal(completed.heartbeatAction.intervalMs, 5 * 60 * 1000);
    assert.ok(completed.heartbeatState.generation > progressed.heartbeatState.generation);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('adaptive heartbeat cadence follows the active work class and thinking level', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-routing-'));
  const projectRoot = 'E:\\work\\project\\adaptive-heartbeat-routing';
  const input = {
    taskControlHome,
    projectRoot,
    controllerThreadId: 'routing-controller',
    parentThreadId: 'routing-controller',
    threadId: 'terra-high-worker',
    title: '理解局部实现',
    model: 'gpt-5.6-terra',
    thinking: 'high',
    delegationMode: 'explicit',
    executionSurface: 'visible_task',
    modelClass: 'economical',
    quotaReason: 'bounded implementation saves premium controller quota',
    workClass: 'bounded_reasoning',
    decisionStatus: 'resolved',
    scope: 'Only implement the decided local contract.',
    acceptance: 'The targeted bounded test exits with code zero.',
    forbiddenDecisions: 'Do not reinterpret architecture or error policy.',
  };
  try {
    const { dispatched } = await register(input);
    assert.equal(dispatched.heartbeatAction.intervalMs, 10 * 60 * 1000);

    const cleanupInput = {
      ...input,
      threadId: 'terminal-cleanup-worker',
      title: '清理终态任务',
      model: 'gpt-5.6-luna',
      thinking: 'medium',
      workClass: 'repeatable',
      quotaReason: 'repeatable cleanup setup saves premium controller quota',
    };
    await register(cleanupInput);
    const blocked = await controllerMarkBlocked({ ...cleanupInput, reason: 'superseded test task' });
    assert.equal(blocked.heartbeatAction.intervalMs, 5 * 60 * 1000);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('changes requested enters a stopped routing queue instead of pretending to run', async () => {
  await withFixture(async (fixture) => {
    await delay();
    const eventPath = await createCompletionEvent({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, candidateCommit: 'candidate-routing' });
    await controllerIngestCompletion({ ...fixture, eventPath });
    const pending = await controllerMarkChangesRequested({ ...fixture, failureClass: 'comprehension', reason: 'The change crossed a decided module boundary.' });
    assert.equal(pending.desiredThreadTitle, '待决｜01 审计 Provider 调用');

    const scan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(scan.activeTasks, []);
    assert.deepEqual(scan.routingQueue, [{ threadId: fixture.threadId, displayKey: '01', status: 'changes_requested', executionStatus: 'stopped', nextOwner: 'undecided', failureClass: 'comprehension' }]);
    assert.equal(scan.needsControllerAttention, true);
    assert.equal(scan.shouldKeepHeartbeat, true);
  });
});

test('v0.3 changes-requested titles migrate safely to a stopped pending decision', async () => {
  await withFixture(async (fixture) => {
    const registryPath = join(fixture.taskControlHome, 'projects', projectKeyForRoot(fixture.projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    const task = registry.tasks[0];
    for (const key of ['workClass', 'decisionStatus', 'scope', 'acceptance', 'forbiddenDecisions', 'executionStatus', 'nextOwner', 'attemptCount', 'failureClass', 'changesRequestedReason', 'reclaimedReason', 'taskMode', 'contractSchemaVersion', 'implementationContractPath', 'contractDigest', 'contractRevision', 'contractCommit', 'reuseRequirements', 'forbiddenNewPaths', 'forbiddenReimplementations', 'stageGates', 'evidenceCommands', 'errorPolicy', 'visualOracle', 'stageProgress']) delete task[key];
    task.status = 'changes_requested';
    task.reviewVerdict = 'changes_requested';
    task.desiredThreadTitle = '返工｜01 审计 Provider 调用';
    task.lastSyncedTitle = task.desiredThreadTitle;
    task.titleSyncStatus = 'synced';
    task.updatedAt = new Date().toISOString();
    registry.updatedAt = task.updatedAt;
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

    const scan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(scan.routingQueue, [{ threadId: fixture.threadId, displayKey: '01', status: 'changes_requested', executionStatus: 'stopped', nextOwner: 'undecided', failureClass: 'unclassified' }]);
    assert.deepEqual(scan.threadActions, [{ type: 'set_thread_title', threadId: fixture.threadId, title: '待决｜01 审计 Provider 调用' }]);
    const unchanged = JSON.parse(await readFile(registryPath, 'utf8'));
    assert.equal('taskMode' in unchanged.tasks[0], false, 'read-only migration must not rewrite the old registry');
  });
});

test('CLI enforces readiness and drives an explicit controller reclaim flow', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-cli-'));
  const projectRoot = 'E:\\work\\project\\cli-routing';
  const common = ['--task-control-home', taskControlHome, '--project-root', projectRoot, '--controller', 'controller-cli', '--thread', 'worker-cli'];
  try {
    const registered = await invokeCli(['register', ...common, '--parent', 'controller-cli', '--title', 'Implement bounded validator', '--model', 'gpt-5.6-terra', '--thinking', 'high', '--delegation', 'explicit', '--execution-surface', 'visible_task', '--model-class', 'economical', '--quota-reason', 'A bounded validator implementation saves frontier quota.', '--work-class', 'bounded_reasoning', '--decision-status', 'resolved', '--scope', 'Only modify the named validator module.', '--acceptance', 'Run the validator unit test with a zero exit code.', '--forbidden-decisions', 'Do not change persistence trust or error policy.', '--task-mode', 'control_only']);
    assert.equal(registered.dispatchAllowed, false);
    await invokeCli(['controller-record-title-synced', ...common, '--title', registered.desiredThreadTitle]);
    await invokeCli(['controller-record-dispatched', ...common]);
    const self = await invokeCli(['query-self', '--task-control-home', taskControlHome, '--self', 'worker-cli']);
    assert.equal(self.dispatchAllowed, true);

    await delay();
    const completion = await invokeCli(['complete', '--task-control-home', taskControlHome, '--self', 'worker-cli', '--candidate-commit', 'candidate-cli-1']);
    await delay();
    await invokeCli(['controller-ingest-completion', '--task-control-home', taskControlHome, '--project-root', projectRoot, '--controller', 'controller-cli', '--event', completion.eventPath]);
    const pending = await invokeCli(['mark-changes-requested', ...common, '--failure-class', 'judgment', '--reason', 'The candidate attempted to choose between conflicting contracts.']);
    assert.equal(pending.desiredThreadTitle, '待决｜01 Implement bounded validator');
    const reclaimed = await invokeCli(['controller-reclaim', ...common, '--reason', 'The controller will resolve the contract boundary.']);
    assert.equal(reclaimed.desiredThreadTitle, '收回｜01 Implement bounded validator');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('lifecycle titles synchronize before terminal archive and heartbeat cleanup', async () => {
  await withFixture(async (fixture) => {
    await delay();
    const eventPath = await createCompletionEvent({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, candidateCommit: 'candidate-2' });
    await delay();
    const receiptPath = await createNotificationFailureReceipt({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, reason: 'send_message_to_thread unavailable' });
    const awaiting = await controllerIngestCompletion({ ...fixture, eventPath });
    assert.equal(awaiting.desiredThreadTitle, '待审｜01 审计 Provider 调用');
    await controllerRecordTitleSynced({ ...fixture, title: awaiting.desiredThreadTitle });
    const failedNotification = await controllerIngestNotificationFailed({ ...fixture, receiptPath });
    assert.equal(failedNotification.notificationStatus, 'failed');

    const accepted = await controllerMarkAccepted(fixture);
    assert.equal(accepted.desiredThreadTitle, '接收｜01 审计 Provider 调用');
    await controllerRecordTitleSynced({ ...fixture, title: accepted.desiredThreadTitle });
    const integrated = await controllerMarkIntegrated(fixture);
    assert.equal(integrated.desiredThreadTitle, '完成｜01 审计 Provider 调用');
    let scan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(scan.threadActions, [{ type: 'set_thread_title', threadId: fixture.threadId, title: integrated.desiredThreadTitle }]);
    assert.equal(scan.shouldKeepHeartbeat, true);

    await controllerRecordTitleSynced({ ...fixture, title: integrated.desiredThreadTitle });
    scan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(scan.threadActions, [{ type: 'set_thread_archived', threadId: fixture.threadId, archived: true }]);
    await controllerRecordArchiveSucceeded(fixture);
    scan = await controllerScanPendingEvents(fixture);
    assert.equal(scan.shouldKeepHeartbeat, false);
    assert.equal(scan.needsControllerAttention, false);
  });
});

test('failed thread actions become deferred debt until the direct controller explicitly retries them', async () => {
  await withFixture(async (fixture) => {
    const nestedInput = { ...fixture, controllerThreadId: fixture.threadId, parentThreadId: fixture.threadId, threadId: 'nested-child', title: '补充超时测试', model: 'gpt-5.6-luna', thinking: 'medium', delegationMode: 'explicit', executionSurface: 'visible_task', modelClass: 'economical', quotaReason: 'mechanical nested verification saves controller quota' };
    await register(nestedInput);

    const blockedParent = await controllerMarkBlocked({ ...fixture, reason: 'superseded' });
    await controllerRecordTitleFailed({ ...fixture, title: blockedParent.desiredThreadTitle, reason: 'temporary title API failure' });
    let rootScan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(rootScan.threadActions, []);
    assert.deepEqual(rootScan.pendingCleanupTasks, []);
    assert.equal(rootScan.deferredCleanupTasks[0].actionability, 'title_failed');
    assert.equal(rootScan.shouldKeepHeartbeat, false);
    await assert.rejects(controllerRecordTitleSynced({ ...fixture, title: blockedParent.desiredThreadTitle }), (error) => error instanceof TaskControlError && error.code === 'THREAD_ACTION_NOT_PENDING');
    const titleRetry = await invokeCli(['controller-retry-thread-action', '--task-control-home', fixture.taskControlHome, '--project-root', fixture.projectRoot, '--controller', fixture.controllerThreadId, '--thread', fixture.threadId, '--action', 'set_thread_title', '--reason', 'The title API is available again.']);
    assert.deepEqual(titleRetry.requiredThreadActions, [{ type: 'set_thread_title', threadId: fixture.threadId, title: blockedParent.desiredThreadTitle }]);
    assert.equal(titleRetry.heartbeatAction.type, 'replace_controller_heartbeat');
    await controllerRecordTitleSynced({ ...fixture, title: blockedParent.desiredThreadTitle });
    rootScan = await controllerScanPendingEvents(fixture);
    assert.equal(rootScan.threadActions.length, 0);
    assert.equal(rootScan.deferredCleanupTasks[0].actionability, 'waiting_descendants');
    assert.equal(rootScan.shouldKeepHeartbeat, false);

    const blockedChild = await controllerMarkBlocked({ ...nestedInput, reason: 'superseded' });
    await controllerRecordTitleSynced({ ...nestedInput, title: blockedChild.desiredThreadTitle });
    const failedArchive = await controllerRecordArchiveFailed({ ...nestedInput, reason: 'Inactive thread archive did not persist' });
    assert.equal(failedArchive.heartbeatAction.type, 'delete_controller_heartbeat');
    let childScan = await controllerScanPendingEvents({ ...nestedInput, controllerThreadId: fixture.threadId });
    assert.deepEqual(childScan.threadActions, []);
    assert.deepEqual(childScan.pendingCleanupTasks, []);
    assert.equal(childScan.deferredCleanupTasks[0].actionability, 'archive_failed');
    assert.equal(childScan.shouldKeepHeartbeat, false);
    await assert.rejects(controllerRecordArchiveSucceeded(nestedInput), (error) => error instanceof TaskControlError && error.code === 'THREAD_ACTION_NOT_PENDING');
    const archiveRetry = await controllerRetryThreadAction({ ...nestedInput, action: 'set_thread_archived', reason: 'User requested one explicit retry.' });
    assert.deepEqual(archiveRetry.requiredThreadActions, [{ type: 'set_thread_archived', threadId: 'nested-child', archived: true }]);
    assert.equal(archiveRetry.threadActionHistory.at(-2).outcome, 'failed');
    assert.equal(archiveRetry.threadActionHistory.at(-1).outcome, 'retry_requested');
    await controllerRecordArchiveSucceeded(nestedInput);

    rootScan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(rootScan.threadActions, [{ type: 'set_thread_archived', threadId: fixture.threadId, archived: true }]);
  });
});

test('controller scan rejects an unregistered controller', async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(controllerScanPendingEvents({ ...fixture, controllerThreadId: 'unknown-controller' }), (error) => error instanceof TaskControlError && error.code === 'CONTROLLER_UNAUTHORIZED');
  });
});
