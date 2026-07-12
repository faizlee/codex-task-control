import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  TaskControlError,
  controllerIngestCompletion,
  controllerIngestNotificationFailed,
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
} from './task-control.mjs';

const delay = () => new Promise((resolve) => setTimeout(resolve, 5));

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
      thinking: 'low',
      delegationMode: 'explicit',
      executionSurface: 'visible_task',
      modelClass: 'economical',
      quotaReason: 'mechanical scan verification saves controller quota',
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
    thinking: 'low',
    delegationMode: 'explicit',
    executionSurface: 'visible_task',
    modelClass: 'economical',
    quotaReason: 'mechanical title verification saves controller quota',
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
    const nestedInput = { ...fixture, controllerThreadId: fixture.threadId, parentThreadId: fixture.threadId, threadId: 'nested-child', title: '补充超时测试', model: 'gpt-5.6-luna', thinking: 'low', delegationMode: 'explicit', executionSurface: 'visible_task', modelClass: 'economical', quotaReason: 'mechanical nested verification saves controller quota' };
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
