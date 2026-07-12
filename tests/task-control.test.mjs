import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TaskControlError,
  buildCompletionNotification,
  controllerIngestCompletion,
  controllerIngestNotificationFailed,
  controllerMarkAccepted,
  controllerMarkChangesRequested,
  controllerMarkIntegrated,
  controllerMarkNotificationSent,
  controllerRecordTitleSynced,
  controllerRegisterTask,
  createCompletionEvent,
  createNotificationFailureReceipt,
  loadProjectAdapter,
  projectKeyForRoot,
  queryParent,
  querySelf,
  releaseLockIfOwner,
  resolveTaskControlHome,
  withExclusiveLock,
} from '../skill/codex-task-control/scripts/task-control.mjs';

const defaultController = 'controller-1';
const codexHomes = [];
const realCodexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
const realTaskControlRoot = join(realCodexHome, 'task-control');
let liveBefore;
let sandboxCodexHome;
let previousCodexHome;

async function snapshotTree(root) {
  if (!(await exists(root))) return 'absent';
  const hash = createHash('sha256');
  async function visit(directory, relativeDirectory) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? join(relativeDirectory, entry.name) : entry.name;
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        hash.update(`D:${relative}\n`);
        await visit(filePath, relative);
      } else {
        const info = await lstat(filePath);
        hash.update(`F:${relative}:${info.size}:${info.mtimeMs}\n`);
        if (entry.isFile()) hash.update(await readFile(filePath));
        else if (entry.isSymbolicLink()) hash.update(`L:${await readFile(filePath, 'utf8').catch(() => '')}\n`);
      }
    }
  }
  await visit(root, '');
  return hash.digest('hex');
}

before(async () => {
  liveBefore = await snapshotTree(realTaskControlRoot);
  previousCodexHome = process.env.CODEX_HOME;
  sandboxCodexHome = await mkdtemp(join(tmpdir(), 'codex-task-control-default-'));
  process.env.CODEX_HOME = sandboxCodexHome;
});

after(async () => {
  try {
    const liveAfter = await snapshotTree(realTaskControlRoot);
    assert.equal(liveAfter, liveBefore, 'The real CODEX_HOME/task-control tree must remain unchanged');
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    await rm(sandboxCodexHome, { recursive: true, force: true });
  }
});

async function freshCodexHome() {
  const codexHome = await mkdtemp(join(tmpdir(), 'codex-task-control-'));
  codexHomes.push(codexHome);
  return codexHome;
}

async function register(codexHome, projectRoot, threadId, overrides = {}) {
  const task = await controllerRegisterTask({
    codexHome,
    projectRoot,
    controllerThreadId: overrides.controllerThreadId ?? defaultController,
    threadId,
    parentThreadId: overrides.parentThreadId ?? (overrides.controllerThreadId ?? defaultController),
    title: overrides.title ?? 'same task',
    model: overrides.model ?? 'economical-worker',
    thinking: overrides.thinking ?? 'low',
    delegationMode: overrides.delegationMode ?? 'explicit',
    executionSurface: overrides.executionSurface ?? 'visible_task',
    modelClass: overrides.modelClass ?? 'economical',
    quotaReason: overrides.quotaReason ?? 'Use a cheaper worker for repetitive mechanical execution.',
  });
  if (overrides.syncTitle === false) return task;
  return controllerRecordTitleSynced({
    codexHome,
    projectRoot,
    controllerThreadId: overrides.controllerThreadId ?? defaultController,
    threadId,
    title: task.desiredThreadTitle,
  });
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => error instanceof TaskControlError && error.code === code);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(codexHomes.splice(0).map((codexHome) => rm(codexHome, { recursive: true, force: true })));
});

describe('project-isolated task control', () => {
  it('keeps same-name tasks isolated between projects', async () => {
    const codexHome = await freshCodexHome();
    await register(codexHome, 'C:/work/alpha/same-name', 'thread-a');
    await register(codexHome, 'D:/work/beta/same-name', 'thread-b');

    const a = await querySelf({ codexHome, selfThreadId: 'thread-a' });
    const b = await querySelf({ codexHome, selfThreadId: 'thread-b' });
    assert.equal(a.task.title, b.task.title);
    assert.notEqual(a.registry.projectKey, b.registry.projectKey);
    assert.notEqual(a.paths.registryPath, b.paths.registryPath);
  });

  it('finds a unique self thread across projects and fails closed on ambiguity', async () => {
    const codexHome = await freshCodexHome();
    await register(codexHome, 'C:/work/one', 'unique');
    assert.equal(await queryParent({ codexHome, selfThreadId: 'unique' }), defaultController);

    await register(codexHome, 'D:/work/two', 'duplicate');
    await register(codexHome, 'E:/work/three', 'duplicate');
    await expectCode(() => querySelf({ codexHome, selfThreadId: 'duplicate' }), 'AMBIGUOUS_TASK');
  });

  it('loads adapters as references and rejects copied policy fields', async () => {
    const adapterPath = fileURLToPath(new URL('../examples/project-adapter.json', import.meta.url));
    const adapter = await loadProjectAdapter(adapterPath);
    assert.deepEqual(Object.keys(adapter).sort(), ['modelRoutingSource', 'projectRoot', 'rulesSources', 'workflowSources'].sort());
    assert.deepEqual(adapter.rulesSources, ['AGENTS.md']);
    assert.equal(adapter.modelRoutingSource, 'config/codex-model-routing.json');

    const badPath = join(await freshCodexHome(), 'bad-adapter.json');
    await writeFile(badPath, JSON.stringify({ ...adapter, rules: 'copied policy' }), 'utf8');
    await expectCode(() => loadProjectAdapter(badPath), 'ADAPTER_INVALID');

    const badNativePath = join(await freshCodexHome(), 'bad-native-adapter.json');
    await writeFile(badNativePath, JSON.stringify({ ...adapter, nativeAdapter: 'definitely-missing-native-adapter.mjs' }), 'utf8');
    await expectCode(() => loadProjectAdapter(badNativePath), 'ADAPTER_INVALID');
  });

  if (process.env.CODEX_TASK_CONTROL_SKIP_SUBPROCESS !== '1') {
    it('runs the same absolute test file from an external project cwd without recursion', async () => {
      const testPath = fileURLToPath(import.meta.url);
      const childEnv = { ...process.env, CODEX_HOME: sandboxCodexHome, CODEX_TASK_CONTROL_SKIP_SUBPROCESS: '1' };
      delete childEnv.NODE_TEST_CONTEXT;
      const externalCwd = await freshCodexHome();
      const result = spawnSync(process.execPath, ['--test', testPath], {
        cwd: externalCwd,
        env: childEnv,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(`${result.stdout}\n${result.stderr}`, /fail 0/);
    });
  }

  it('does not let child completion status claim accepted or integrated', async () => {
    const codexHome = await freshCodexHome();
    await register(codexHome, 'C:/work/child-status', 'child');
    await expectCode(() => createCompletionEvent({ codexHome, selfThreadId: 'child', candidateCommit: 'candidate-1', status: 'accepted' }), 'CHILD_STATUS_FORBIDDEN');
    await expectCode(() => createCompletionEvent({ codexHome, selfThreadId: 'child', candidateCommit: 'candidate-1', status: 'integrated' }), 'CHILD_STATUS_FORBIDDEN');
    await expectCode(() => controllerMarkAccepted({ codexHome, projectRoot: 'C:/work/child-status', controllerThreadId: 'not-controller', threadId: 'child' }), 'CONTROLLER_UNAUTHORIZED');
  });

  it('supports completion, short notification, failure receipt, rework, and lifecycle', async () => {
    const codexHome = await freshCodexHome();
    const root = 'C:/work/lifecycle';
    await register(codexHome, root, 'child');
    const firstEvent = await createCompletionEvent({ codexHome, selfThreadId: 'child', candidateCommit: 'candidate-1' });
    assert.equal(buildCompletionNotification({ threadId: 'child' }), '任务已完成，等待主控审查。任务：child');
    await controllerIngestCompletion({ codexHome, projectRoot: root, controllerThreadId: defaultController, eventPath: firstEvent });
    const receipt = await createNotificationFailureReceipt({ codexHome, selfThreadId: 'child', reason: 'send_message_to_thread unavailable' });
    await controllerIngestNotificationFailed({ codexHome, projectRoot: root, controllerThreadId: defaultController, receiptPath: receipt });

    const rework = await controllerMarkChangesRequested({ codexHome, projectRoot: root, controllerThreadId: defaultController, threadId: 'child' });
    await controllerRecordTitleSynced({ codexHome, projectRoot: root, controllerThreadId: defaultController, threadId: 'child', title: rework.desiredThreadTitle });
    const secondEvent = await createCompletionEvent({ codexHome, selfThreadId: 'child', candidateCommit: 'candidate-2' });
    await controllerIngestCompletion({ codexHome, projectRoot: root, controllerThreadId: defaultController, eventPath: secondEvent });
    await controllerMarkNotificationSent({ codexHome, projectRoot: root, controllerThreadId: defaultController, threadId: 'child' });
    await controllerMarkAccepted({ codexHome, projectRoot: root, controllerThreadId: defaultController, threadId: 'child' });
    await controllerMarkIntegrated({ codexHome, projectRoot: root, controllerThreadId: defaultController, threadId: 'child' });

    const final = (await querySelf({ codexHome, selfThreadId: 'child' })).task;
    assert.equal(final.status, 'integrated');
    assert.equal(final.integrationStatus, 'integrated');
    assert.equal(final.candidateCommit, 'candidate-2');
  });

  it('allows multiple root controllers and nested visible tasks but prevents cross-review', async () => {
    const codexHome = await freshCodexHome();
    const root = 'C:/work/multi-controller';
    await register(codexHome, root, 'root-child-a', { controllerThreadId: 'root-a', parentThreadId: 'root-a' });
    await register(codexHome, root, 'root-child-b', { controllerThreadId: 'root-b', parentThreadId: 'root-b' });
    await register(codexHome, root, 'nested-a', { controllerThreadId: 'root-child-a', parentThreadId: 'root-child-a' });
    await register(codexHome, root, 'nested-b', { controllerThreadId: 'root-child-b', parentThreadId: 'root-child-b' });
    await controllerMarkChangesRequested({ codexHome, projectRoot: root, controllerThreadId: 'root-child-a', threadId: 'nested-a' });
    await expectCode(() => controllerMarkChangesRequested({ codexHome, projectRoot: root, controllerThreadId: 'root-child-a', threadId: 'nested-b' }), 'CONTROLLER_UNAUTHORIZED');
    await expectCode(() => controllerMarkChangesRequested({ codexHome, projectRoot: root, controllerThreadId: 'root-b', threadId: 'root-child-a' }), 'CONTROLLER_UNAUTHORIZED');
  });

  it('denies subagents by default and enforces economical low-thinking delegation', async () => {
    const codexHome = await freshCodexHome();
    const root = 'C:/work/delegation-policy';
    const base = { codexHome, projectRoot: root, controllerThreadId: defaultController, parentThreadId: defaultController, title: 'mechanical task', model: 'worker-model', thinking: 'low', executionSurface: 'visible_task', modelClass: 'economical', quotaReason: 'Move repetitive mechanical work off the frontier controller.' };
    await expectCode(() => controllerRegisterTask({ ...base, threadId: 'missing-auth' }), 'DELEGATION_NOT_AUTHORIZED');
    await expectCode(() => controllerRegisterTask({ ...base, threadId: 'internal-subagent', delegationMode: 'explicit', executionSurface: 'internal_subagent' }), 'INTERNAL_SUBAGENT_FORBIDDEN');
    await expectCode(() => controllerRegisterTask({ ...base, threadId: 'frontier-worker', delegationMode: 'explicit', modelClass: 'frontier' }), 'DELEGATION_MODEL_NOT_ECONOMICAL');
    await expectCode(() => controllerRegisterTask({ ...base, threadId: 'high-thinking', delegationMode: 'explicit', thinking: 'high' }), 'DELEGATION_THINKING_TOO_HIGH');
    await expectCode(() => controllerRegisterTask({ ...base, threadId: 'no-reason', delegationMode: 'explicit', quotaReason: 'too short' }), 'DELEGATION_REASON_REQUIRED');
    const allowed = await controllerRegisterTask({ ...base, threadId: 'allowed-worker', delegationMode: 'explicit' });
    assert.equal(allowed.modelClass, 'economical');
    assert.equal(allowed.thinking, 'low');
  });

  it('allows multiple registered visible workers for model-routed work', async () => {
    const codexHome = await freshCodexHome();
    const root = 'C:/work/active-worker-limit';
    await register(codexHome, root, 'worker-one');
    const second = await register(codexHome, root, 'worker-two');
    assert.equal(second.status, 'executing');
    assert.equal(second.executionSurface, 'visible_task');
  });

  it('rejects unsafe thread identifiers before any event path is created', async () => {
    const codexHome = await freshCodexHome();
    const root = 'C:/work/path-safe';
    await expectCode(() => register(codexHome, root, '..'), 'UNSAFE_THREAD_ID');
    await expectCode(() => register(codexHome, root, '..\\escape'), 'UNSAFE_THREAD_ID');
    await expectCode(() => register(codexHome, root, 'safe', { parentThreadId: '..\\escape' }), 'UNSAFE_THREAD_ID');
    await expectCode(() => querySelf({ codexHome, selfThreadId: '..' }), 'UNSAFE_THREAD_ID');
    assert.equal(await exists(join(codexHome, 'escape')), false);
    assert.equal(await exists(join(codexHome, 'task-control', 'escape')), false);
  });

  it('rejects old events, wrong parent, wrong project, loops, and invalid thinking', async () => {
    const codexHome = await freshCodexHome();
    const root = 'C:/work/fail-closed';
    await register(codexHome, root, 'child');
    await expectCode(() => register(codexHome, root, 'bad-thinking', { thinking: 'ultra' }), 'CLI_INVALID_ARGUMENTS');

    const eventPath = await createCompletionEvent({ codexHome, selfThreadId: 'child', candidateCommit: 'candidate-1' });
    const event = JSON.parse(await readFile(eventPath, 'utf8'));
    await writeFile(eventPath + '.wrong-parent.json', JSON.stringify({ ...event, parentThreadId: 'wrong-parent', controllerThreadId: defaultController }), 'utf8');
    await expectCode(() => controllerIngestCompletion({ codexHome, projectRoot: root, controllerThreadId: defaultController, eventPath: eventPath + '.wrong-parent.json' }), 'EVENT_INVALID');
    await expectCode(() => controllerIngestCompletion({ codexHome, projectRoot: 'D:/work/other-project', controllerThreadId: defaultController, eventPath }), 'PROJECT_MISMATCH');

    await controllerIngestCompletion({ codexHome, projectRoot: root, controllerThreadId: defaultController, eventPath });
    await expectCode(() => controllerIngestCompletion({ codexHome, projectRoot: root, controllerThreadId: defaultController, eventPath }), 'EVENT_STALE');

    const projectKey = projectKeyForRoot(root);
    const registryPath = join(codexHome, 'task-control', 'projects', projectKey, 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    registry.tasks.push({ threadId: 'cycle-a', parentThreadId: 'cycle-b', directControllerThreadId: 'cycle-b', title: 'a', model: 'gpt-5.6-luna', thinking: 'high', status: 'executing', candidateCommit: null, reviewVerdict: 'pending', integrationStatus: 'not_integrated', notificationStatus: 'pending', updatedAt: new Date().toISOString() });
    registry.tasks.push({ threadId: 'cycle-b', parentThreadId: 'cycle-a', directControllerThreadId: 'cycle-a', title: 'b', model: 'gpt-5.6-luna', thinking: 'high', status: 'executing', candidateCommit: null, reviewVerdict: 'pending', integrationStatus: 'not_integrated', notificationStatus: 'pending', updatedAt: new Date().toISOString() });
    await writeFile(registryPath, JSON.stringify(registry), 'utf8');
    await expectCode(() => querySelf({ codexHome, selfThreadId: 'cycle-a' }), 'REGISTRY_INVALID');
  });

  it('normalizes Windows path case and separators into stable non-colliding keys', () => {
    assert.equal(projectKeyForRoot('C:/Work/Foo/'), projectKeyForRoot('c:\\work\\foo'));
    assert.notEqual(projectKeyForRoot('C:/Work/Foo'), projectKeyForRoot('D:/Work/Foo'));
    assert.notEqual(projectKeyForRoot('C:/Work/Foo'), projectKeyForRoot('C:/Work/Foo-Bar'));
  });

  it('uses CODEX_HOME/task-control and never CODEX_HOME/projects', async () => {
    const codexHome = await freshCodexHome();
    assert.equal(resolveTaskControlHome({ codexHome }), join(codexHome, 'task-control'));
    await register(codexHome, 'C:/work/home-semantics', 'child');
    assert.equal(await exists(join(codexHome, 'task-control', 'projects.json')), true);
    assert.equal(await exists(join(codexHome, 'projects.json')), false);
  });

  it('keeps omitted codexHome calls inside the temporary CODEX_HOME sandbox', async () => {
    const root = 'C:/work/omitted-codex-home';
    const registered = await controllerRegisterTask({ projectRoot: root, controllerThreadId: defaultController, threadId: 'omitted', parentThreadId: defaultController, title: 'omitted home', model: 'economical-worker', thinking: 'low', delegationMode: 'explicit', executionSurface: 'visible_task', modelClass: 'economical', quotaReason: 'Use a cheaper worker for repetitive mechanical execution.' });
    await controllerRecordTitleSynced({ projectRoot: root, controllerThreadId: defaultController, threadId: 'omitted', title: registered.desiredThreadTitle });
    const eventPath = await createCompletionEvent({ selfThreadId: 'omitted', candidateCommit: 'candidate-omitted-home' });
    await controllerIngestCompletion({ projectRoot: root, controllerThreadId: defaultController, eventPath });
    assert.equal(eventPath.startsWith(join(sandboxCodexHome, 'task-control')), true);
    assert.equal(await exists(join(realCodexHome, 'task-control', 'projects', projectKeyForRoot(root))), false);
  });

  it('recovers stale locks, preserves fresh locks, and never deletes a replacement owner', async () => {
    const codexHome = await freshCodexHome();
    const target = join(codexHome, 'lock-target.json');
    const lockPath = `${target}.lock`;
    const oldOwner = { pid: 999999, createdAt: new Date(Date.now() - 60_000).toISOString(), nonce: 'old-owner' };
    await writeFile(lockPath, JSON.stringify(oldOwner), 'utf8');
    let ran = false;
    await withExclusiveLock(target, async () => { ran = true; }, { staleMs: 10, maxAttempts: 5, retryDelayMs: 1 });
    assert.equal(ran, true);
    assert.equal(await exists(lockPath), false);

    await writeFile(`${lockPath}.recovery`, JSON.stringify({ pid: 999999, createdAt: new Date(Date.now() - 60_000).toISOString(), nonce: 'old-recovery-owner' }), 'utf8');
    let recoveredMutexRan = false;
    await withExclusiveLock(target, async () => { recoveredMutexRan = true; }, { staleMs: 10, maxAttempts: 5, retryDelayMs: 1 });
    assert.equal(recoveredMutexRan, true);
    assert.equal(await exists(`${lockPath}.recovery`), false);

    const freshOwner = { pid: process.pid, createdAt: new Date().toISOString(), nonce: 'fresh-owner' };
    await writeFile(lockPath, JSON.stringify(freshOwner), 'utf8');
    await expectCode(() => withExclusiveLock(target, async () => {}, { staleMs: 60_000, maxAttempts: 2, retryDelayMs: 1 }), 'LOCK_TIMEOUT');
    assert.deepEqual(JSON.parse(await readFile(lockPath, 'utf8')), freshOwner);

    const replacement = { pid: process.pid, createdAt: new Date().toISOString(), nonce: 'replacement-owner' };
    await writeFile(lockPath, JSON.stringify(oldOwner), 'utf8');
    let replaced = false;
    await expectCode(() => withExclusiveLock(target, async () => {}, {
      staleMs: 1000,
      maxAttempts: 2,
      retryDelayMs: 1,
      beforeStaleRecheck: async () => {
        if (!replaced) {
          replaced = true;
          await writeFile(lockPath, JSON.stringify(replacement), 'utf8');
        }
      },
    }), 'LOCK_TIMEOUT');
    assert.deepEqual(JSON.parse(await readFile(lockPath, 'utf8')), replacement);
    assert.equal(await releaseLockIfOwner(lockPath, oldOwner.nonce), false);
    assert.deepEqual(JSON.parse(await readFile(lockPath, 'utf8')), replacement);
    await rm(lockPath, { force: true });
  });

  it('serializes two stale reclaimers and a new acquisition through the recovery mutex', async () => {
    const codexHome = await freshCodexHome();
    const target = join(codexHome, 'interleaved-lock-target.json');
    const lockPath = `${target}.lock`;
    await writeFile(lockPath, JSON.stringify({ pid: 999999, createdAt: new Date(Date.now() - 60_000).toISOString(), nonce: 'interleaved-old' }), 'utf8');

    let pauseRecovery;
    let releaseRecovery;
    const recoveryPaused = new Promise((resolve) => { pauseRecovery = resolve; });
    const recoveryRelease = new Promise((resolve) => { releaseRecovery = resolve; });
    let pausedOnce = false;
    let reclaimed = 0;
    let active = 0;
    let maxActive = 0;
    const operations = [];
    const options = {
      staleMs: 1000,
      maxAttempts: 200,
      retryDelayMs: 1,
      beforeStaleRecheck: async () => {
        if (!pausedOnce) {
          pausedOnce = true;
          pauseRecovery();
          await recoveryRelease;
        }
      },
      onStaleReclaimed: async () => { reclaimed += 1; },
    };
    const run = (label) => withExclusiveLock(target, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      operations.push(`start:${label}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      operations.push(`end:${label}`);
      active -= 1;
    }, options);

    const first = run('first');
    await recoveryPaused;
    const second = run('second');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(operations, []);
    releaseRecovery();
    await Promise.all([first, second]);

    assert.equal(reclaimed, 1);
    assert.equal(maxActive, 1);
    assert.deepEqual(operations.filter((entry) => entry.startsWith('start')).sort(), ['start:first', 'start:second'].sort());
    assert.equal(await exists(lockPath), false);
    assert.equal(await exists(`${lockPath}.recovery`), false);
  });

  it('preserves concurrent registrations across projects and root controllers', async () => {
    const codexHome = await freshCodexHome();
    await Promise.all([
      register(codexHome, 'C:/work/concurrent-a', 'a'),
      register(codexHome, 'D:/work/concurrent-b', 'b'),
    ]);
    const index = JSON.parse(await readFile(join(codexHome, 'task-control', 'projects.json'), 'utf8'));
    assert.equal(index.projects.length, 2);

    const root = 'E:/work/concurrent-same-project';
    await Promise.all([
      register(codexHome, root, 'root-a', { controllerThreadId: 'controller-a', parentThreadId: 'controller-a' }),
      register(codexHome, root, 'root-b', { controllerThreadId: 'controller-b', parentThreadId: 'controller-b' }),
    ]);
    await Promise.all([
      register(codexHome, root, 'nested-a', { controllerThreadId: 'root-a', parentThreadId: 'root-a' }),
      register(codexHome, root, 'nested-b', { controllerThreadId: 'root-b', parentThreadId: 'root-b' }),
    ]);
    assert.equal((await querySelf({ codexHome, selfThreadId: 'nested-a' })).task.executionSurface, 'visible_task');
    assert.equal((await querySelf({ codexHome, selfThreadId: 'nested-b' })).task.executionSurface, 'visible_task');
  });

  it('rejects an index that points outside the standard registry path', async () => {
    const codexHome = await freshCodexHome();
    await register(codexHome, 'C:/work/index-integrity', 'child');
    const indexPath = join(codexHome, 'task-control', 'projects.json');
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    index.projects[0].registryPath = join(codexHome, 'outside.json');
    await writeFile(indexPath, JSON.stringify(index), 'utf8');
    await expectCode(() => querySelf({ codexHome, selfThreadId: 'child' }), 'INDEX_INVALID');
  });
});
