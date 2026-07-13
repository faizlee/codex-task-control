import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  TaskControlError,
  controllerIngestCompletion,
  controllerIngestNotificationFailed,
  controllerMarkChangesRequested,
  controllerMarkAccepted,
  controllerMarkBlocked,
  controllerMarkIntegrated,
  controllerRecordArchiveFailed,
  controllerRecordArchiveSucceeded,
  controllerRecordTitleFailed,
  controllerRecordTitleSynced,
  controllerRegisterTask,
  controllerScanPendingEvents,
  createCompletionEvent,
  createNotificationFailureReceipt,
  projectKeyForRoot,
  runCli,
} from './task-control.mjs';

const delay = () => new Promise((resolve) => setTimeout(resolve, 5));

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
  const task = await controllerRegisterTask(input);
  return { task, synced: await controllerRecordTitleSynced({ ...input, title: task.desiredThreadTitle }) };
}

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
    for (const key of ['workClass', 'decisionStatus', 'scope', 'acceptance', 'forbiddenDecisions', 'executionStatus', 'nextOwner', 'attemptCount', 'failureClass', 'changesRequestedReason', 'reclaimedReason']) delete task[key];
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
  });
});

test('CLI enforces readiness and drives an explicit controller reclaim flow', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-cli-'));
  const projectRoot = 'E:\\work\\project\\cli-routing';
  const common = ['--task-control-home', taskControlHome, '--project-root', projectRoot, '--controller', 'controller-cli', '--thread', 'worker-cli'];
  try {
    const registered = await invokeCli(['register', ...common, '--parent', 'controller-cli', '--title', 'Implement bounded validator', '--model', 'gpt-5.6-terra', '--thinking', 'high', '--delegation', 'explicit', '--execution-surface', 'visible_task', '--model-class', 'economical', '--quota-reason', 'A bounded validator implementation saves frontier quota.', '--work-class', 'bounded_reasoning', '--decision-status', 'resolved', '--scope', 'Only modify the named validator module.', '--acceptance', 'Run the validator unit test with a zero exit code.', '--forbidden-decisions', 'Do not change persistence trust or error policy.']);
    assert.equal(registered.dispatchAllowed, false);
    await invokeCli(['controller-record-title-synced', ...common, '--title', registered.desiredThreadTitle]);
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

test('archive waits for visible descendants and failed thread actions remain retryable', async () => {
  await withFixture(async (fixture) => {
    const nestedInput = { ...fixture, controllerThreadId: fixture.threadId, parentThreadId: fixture.threadId, threadId: 'nested-child', title: '补充超时测试', model: 'gpt-5.6-luna', thinking: 'medium', delegationMode: 'explicit', executionSurface: 'visible_task', modelClass: 'economical', quotaReason: 'mechanical nested verification saves controller quota' };
    await register(nestedInput);

    const blockedParent = await controllerMarkBlocked({ ...fixture, reason: 'superseded' });
    await controllerRecordTitleFailed({ ...fixture, title: blockedParent.desiredThreadTitle, reason: 'temporary title API failure' });
    let rootScan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(rootScan.threadActions, [{ type: 'set_thread_title', threadId: fixture.threadId, title: blockedParent.desiredThreadTitle }]);
    await controllerRecordTitleSynced({ ...fixture, title: blockedParent.desiredThreadTitle });
    rootScan = await controllerScanPendingEvents(fixture);
    assert.equal(rootScan.threadActions.length, 0);
    assert.equal(rootScan.shouldKeepHeartbeat, true);

    const blockedChild = await controllerMarkBlocked({ ...nestedInput, reason: 'superseded' });
    await controllerRecordTitleSynced({ ...nestedInput, title: blockedChild.desiredThreadTitle });
    await controllerRecordArchiveFailed({ ...nestedInput, reason: 'temporary archive API failure' });
    const childScan = await controllerScanPendingEvents({ ...nestedInput, controllerThreadId: fixture.threadId });
    assert.deepEqual(childScan.threadActions, [{ type: 'set_thread_archived', threadId: 'nested-child', archived: true }]);
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
