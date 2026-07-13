import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';

export const TASK_STATUSES = Object.freeze(['executing', 'awaiting_review', 'changes_requested', 'accepted', 'integrated', 'blocked', 'reclaimed']);
export const REVIEW_VERDICTS = Object.freeze(['pending', 'changes_requested', 'accepted']);
export const INTEGRATION_STATUSES = Object.freeze(['not_integrated', 'integrated']);
export const NOTIFICATION_STATUSES = Object.freeze(['pending', 'sent', 'failed']);
export const THINKING_LEVELS = Object.freeze(['low', 'medium', 'high']);
export const DELEGATION_MODES = Object.freeze(['explicit']);
export const MODEL_CLASSES = Object.freeze(['economical']);
export const EXECUTION_SURFACES = Object.freeze(['visible_task']);
export const TITLE_SYNC_STATUSES = Object.freeze(['pending', 'synced', 'failed']);
export const ARCHIVE_STATUSES = Object.freeze(['not_ready', 'pending', 'archived', 'failed']);
export const WORK_CLASSES = Object.freeze(['repeatable', 'bounded_reasoning']);
export const WORK_CLASS_MODELS = Object.freeze({ repeatable: 'gpt-5.6-luna', bounded_reasoning: 'gpt-5.6-terra' });
export const WORK_CLASS_THINKING = Object.freeze({ repeatable: Object.freeze(['medium']), bounded_reasoning: Object.freeze(['medium', 'high']) });
export const CONTROLLER_MODEL = 'gpt-5.6-sol';
export const CONTROLLER_WORK_CLASSES = Object.freeze(['bounded_control', 'frontier_control', 'hard_arbitration', 'final_arbitration']);
export const CONTROLLER_WORK_CLASS_THINKING = Object.freeze({ bounded_control: 'medium', frontier_control: 'high', hard_arbitration: 'xhigh', final_arbitration: 'max' });
export const CONTROLLER_ESCALATION_TRIGGERS = Object.freeze(['cross_module_contract_conflict', 'trusted_source_conflict', 'evidence_conflict', 'high_failed', 'high_risk_irreversible']);
export const CONTROLLER_MAX_AUTHORITIES = Object.freeze(['user_explicit', 'xhigh_unresolved']);
export const DECISION_STATUSES = Object.freeze(['resolved']);
export const EXECUTION_STATUSES = Object.freeze(['running', 'stopped', 'awaiting_review', 'terminal']);
export const NEXT_OWNERS = Object.freeze(['worker', 'controller', 'undecided', 'none']);
export const FAILURE_CLASSES = Object.freeze(['mechanical', 'comprehension', 'judgment', 'spec_missing', 'unclassified']);

export class TaskControlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TaskControlError';
    this.code = code;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isTimestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const has = (value, values) => typeof value === 'string' && values.includes(value);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isTransientWindowsFsError = (error) => ['EACCES', 'EBUSY', 'EPERM'].includes(error?.code);

function fail(code, message) {
  throw new TaskControlError(code, message);
}

export function isSafeThreadId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(value);
}

function assertSafeThreadId(value, field = 'threadId') {
  if (!isSafeThreadId(value)) fail('UNSAFE_THREAD_ID', `${field} 只能包含字母、数字、冒号、下划线和短横线: ${String(value)}`);
}

export function normalizeWindowsPath(input) {
  if (!nonEmpty(input)) fail('CLI_INVALID_ARGUMENTS', 'projectRoot 不能为空');
  let normalized = win32.normalize(input.replaceAll('/', '\\'));
  if (normalized.length > 3) normalized = normalized.replace(/[\\]+$/, '');
  return normalized.toLowerCase();
}

export function projectKeyForRoot(projectRoot) {
  const normalized = normalizeWindowsPath(projectRoot);
  const slug = normalized.split('\\').filter(Boolean).at(-1)?.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'root';
  const digest = createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 20);
  return `project-${slug}-${digest}`;
}

export function resolveTaskControlHome(input = {}) {
  if (input.home !== undefined) fail('CLI_INVALID_ARGUMENTS', 'home 语义已移除，请使用 codexHome 或 taskControlHome');
  if (nonEmpty(input.codexHome) && nonEmpty(input.taskControlHome)) fail('CLI_INVALID_ARGUMENTS', 'codexHome 与 taskControlHome 不能同时提供');
  if (nonEmpty(input.taskControlHome)) return input.taskControlHome;
  const codexHome = nonEmpty(input.codexHome) ? input.codexHome : (process.env.CODEX_HOME || join(homedir(), '.codex'));
  return join(codexHome, 'task-control');
}

function pathsFor(home, projectRoot) {
  const root = normalizeWindowsPath(projectRoot);
  const projectKey = projectKeyForRoot(root);
  const projectDir = join(home, 'projects', projectKey);
  return { home, projectRoot: root, projectKey, projectDir, registryPath: join(projectDir, 'task-registry.json'), eventsDir: join(projectDir, 'events'), indexPath: join(home, 'projects.json') };
}

async function readJson(filePath, code) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    fail(code, `无法读取 ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(code, `JSON 无效 ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function replaceFileWithRetry(tempPath, filePath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(tempPath, filePath);
      return;
    } catch (error) {
      if (!isTransientWindowsFsError(error) || attempt === 7) throw error;
      await sleep(10 * (attempt + 1));
    }
  }
}

async function atomicWriteJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(tempPath, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await replaceFileWithRetry(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    fail('REGISTRY_WRITE_FAILED', `无法原子写入 ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readLockOwner(lockPath) {
  try {
    const value = JSON.parse(await readFile(lockPath, 'utf8'));
    if (!isObject(value) || !Number.isInteger(value.pid) || !isTimestamp(value.createdAt) || !isSafeThreadId(value.nonce)) return null;
    return { pid: value.pid, createdAt: value.createdAt, nonce: value.nonce };
  } catch {
    return null;
  }
}

function normalizedLockOptions(options = {}) {
  return {
    staleMs: options.staleMs ?? 10 * 60 * 1000,
    maxAttempts: options.maxAttempts ?? 80,
    retryDelayMs: options.retryDelayMs ?? 10,
  };
}

function newLockOwner() {
  return { pid: process.pid, createdAt: new Date().toISOString(), nonce: randomUUID().replaceAll('-', '') };
}

async function lockExists(lockPath) {
  return access(lockPath).then(() => true).catch(() => false);
}

async function releaseFileIfOwner(lockPath, nonce) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const first = await readLockOwner(lockPath);
    if (!first || first.nonce !== nonce) return false;
    const second = await readLockOwner(lockPath);
    if (!second || second.nonce !== nonce) return false;
    try {
      await rm(lockPath, { force: false });
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      if (!isTransientWindowsFsError(error) || attempt === 7) throw error;
      await sleep(10 * (attempt + 1));
    }
  }
  return false;
}

async function reclaimStaleRecoveryMutexIfSame(recoveryPath, options = {}) {
  const staleMs = options.staleMs ?? 10 * 60 * 1000;
  const first = await readLockOwner(recoveryPath);
  if (!first || Date.now() - Date.parse(first.createdAt) <= staleMs) return false;
  if (options.beforeRecoveryRecheck) await options.beforeRecoveryRecheck(first);
  const second = await readLockOwner(recoveryPath);
  if (!second || second.nonce !== first.nonce || second.createdAt !== first.createdAt || second.pid !== first.pid) return false;
  const third = await readLockOwner(recoveryPath);
  if (!third || third.nonce !== first.nonce) return false;
  return releaseFileIfOwner(recoveryPath, first.nonce);
}

async function acquireRecoveryMutex(lockPath, options = {}) {
  const settings = normalizedLockOptions(options);
  const recoveryPath = `${lockPath}.recovery`;
  for (let attempt = 0; attempt < settings.maxAttempts; attempt += 1) {
    let handle;
    try {
      handle = await open(recoveryPath, 'wx');
      const owner = newLockOwner();
      try {
        await handle.writeFile(`${JSON.stringify(owner)}\n`, 'utf8');
        await handle.sync();
        return { handle, owner, recoveryPath };
      } catch (error) {
        await handle.close();
        await rm(recoveryPath, { force: true });
        throw error;
      }
    } catch (error) {
      const retryable = error?.code === 'EEXIST' || isTransientWindowsFsError(error);
      if (!retryable) throw error;
      if (await lockExists(recoveryPath)) {
        await reclaimStaleRecoveryMutexIfSame(recoveryPath, { staleMs: settings.staleMs, beforeRecoveryRecheck: options.beforeRecoveryRecheck });
      }
      await sleep(settings.retryDelayMs);
    }
  }
  fail('LOCK_TIMEOUT', `无法获得 recovery mutex: ${recoveryPath}`);
}

async function releaseRecoveryMutex(mutex) {
  await mutex.handle.close();
  await releaseFileIfOwner(mutex.recoveryPath, mutex.owner.nonce);
}

export async function releaseLockIfOwner(lockPath, nonce, options = {}) {
  const settings = normalizedLockOptions(options);
  const mutex = await acquireRecoveryMutex(lockPath, settings);
  try {
    return await releaseFileIfOwner(lockPath, nonce);
  } finally {
    await releaseRecoveryMutex(mutex);
  }
}

export async function reclaimStaleLockIfSame(lockPath, options = {}) {
  const settings = normalizedLockOptions(options);
  const mutex = await acquireRecoveryMutex(lockPath, settings);
  try {
    const first = await readLockOwner(lockPath);
    if (!first || Date.now() - Date.parse(first.createdAt) <= settings.staleMs) return false;
    if (options.beforeRecheck) await options.beforeRecheck(first);
    const second = await readLockOwner(lockPath);
    if (!second || second.nonce !== first.nonce || second.createdAt !== first.createdAt || second.pid !== first.pid) return false;
    const third = await readLockOwner(lockPath);
    if (!third || third.nonce !== first.nonce) return false;
    const reclaimed = await releaseFileIfOwner(lockPath, first.nonce);
    if (reclaimed && options.onStaleReclaimed) await options.onStaleReclaimed(first);
    return reclaimed;
  } finally {
    await releaseRecoveryMutex(mutex);
  }
}

export async function withExclusiveLock(filePath, operation, options = {}) {
  await mkdir(dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const settings = normalizedLockOptions(options);
  for (let attempt = 0; attempt < settings.maxAttempts; attempt += 1) {
    const recoveryPath = `${lockPath}.recovery`;
    if (await lockExists(recoveryPath)) {
      await reclaimStaleRecoveryMutexIfSame(recoveryPath, { staleMs: settings.staleMs, beforeRecoveryRecheck: options.beforeRecoveryRecheck });
      await sleep(settings.retryDelayMs);
      continue;
    }
    let handle;
    try {
      handle = await open(lockPath, 'wx');
      const owner = newLockOwner();
      try {
        await handle.writeFile(`${JSON.stringify(owner)}\n`, 'utf8');
        await handle.sync();
        return await operation({ lockPath, owner });
      } finally {
        await handle.close();
        await releaseLockIfOwner(lockPath, owner.nonce, settings);
      }
    } catch (error) {
      const retryable = error?.code === 'EEXIST' || isTransientWindowsFsError(error);
      if (retryable) {
        if (!(await lockExists(`${lockPath}.recovery`))) {
          await reclaimStaleLockIfSame(lockPath, {
            ...settings,
            beforeRecheck: options.beforeStaleRecheck,
            beforeRecoveryRecheck: options.beforeRecoveryRecheck,
            onStaleReclaimed: options.onStaleReclaimed,
          });
        }
        await sleep(settings.retryDelayMs);
        continue;
      }
      throw error;
    }
  }
  fail('LOCK_TIMEOUT', `无法在有界重试内获得独占锁: ${lockPath}`);
}

function lifecycleConsistent(task) {
  if (task.status === 'executing' || task.status === 'awaiting_review') return task.reviewVerdict === 'pending' && task.integrationStatus === 'not_integrated';
  if (task.status === 'changes_requested') return task.reviewVerdict === 'changes_requested' && task.integrationStatus === 'not_integrated';
  if (task.status === 'accepted') return task.reviewVerdict === 'accepted' && task.integrationStatus === 'not_integrated';
  if (task.status === 'integrated') return task.reviewVerdict === 'accepted' && task.integrationStatus === 'integrated';
  return (task.reviewVerdict === 'pending' || task.reviewVerdict === 'changes_requested') && task.integrationStatus === 'not_integrated';
}

const TERMINAL_STATUSES = new Set(['integrated', 'blocked', 'reclaimed']);
const TITLE_STATUS_LABELS = Object.freeze({
  executing: '执行',
  awaiting_review: '待审',
  changes_requested: '待决',
  accepted: '接收',
  integrated: '完成',
  blocked: '阻塞',
  reclaimed: '收回',
});

const hasThreadControl = (task) => 'displayKey' in task;
const isTerminalTask = (task) => TERMINAL_STATUSES.has(task.status);
const dispatchAllowed = (task) => task.status === 'executing' && (!hasThreadControl(task) || task.titleSyncStatus === 'synced');

function compactBaseTitle(value) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= 48 ? normalized : `${normalized.slice(0, 47)}…`;
}

export function desiredThreadTitle(task) {
  if (!nonEmpty(task.displayKey)) fail('REGISTRY_INVALID', 'displayKey 缺失，无法生成 thread title');
  const label = task.status === 'executing' && Number.isInteger(task.attemptCount) && task.attemptCount > 1 ? '返工' : TITLE_STATUS_LABELS[task.status];
  return `${label}｜${task.displayKey} ${compactBaseTitle(task.title)}`;
}

function isLegacyChangesRequestedTitle(task) {
  return !('executionStatus' in task) && task.status === 'changes_requested' && task.desiredThreadTitle === `返工｜${task.displayKey} ${compactBaseTitle(task.title)}`;
}

function executionDefaults(task) {
  const attemptCount = Number.isInteger(task.attemptCount) && task.attemptCount > 0 ? task.attemptCount : 1;
  if (task.status === 'executing') return { executionStatus: 'running', nextOwner: 'worker', attemptCount, failureClass: task.failureClass ?? null, changesRequestedReason: task.changesRequestedReason ?? null, reclaimedReason: null };
  if (task.status === 'awaiting_review') return { executionStatus: 'awaiting_review', nextOwner: 'controller', attemptCount, failureClass: task.failureClass ?? null, changesRequestedReason: task.changesRequestedReason ?? null, reclaimedReason: null };
  if (task.status === 'changes_requested') return { executionStatus: 'stopped', nextOwner: 'undecided', attemptCount, failureClass: task.failureClass ?? 'unclassified', changesRequestedReason: task.changesRequestedReason ?? 'Legacy changes request requires a controller routing decision.', reclaimedReason: null };
  if (task.status === 'accepted') return { executionStatus: 'stopped', nextOwner: 'controller', attemptCount, failureClass: task.failureClass ?? null, changesRequestedReason: task.changesRequestedReason ?? null, reclaimedReason: null };
  if (task.status === 'reclaimed') return { executionStatus: 'terminal', nextOwner: 'controller', attemptCount, failureClass: task.failureClass ?? 'unclassified', changesRequestedReason: task.changesRequestedReason ?? null, reclaimedReason: task.reclaimedReason };
  return { executionStatus: 'terminal', nextOwner: 'none', attemptCount, failureClass: task.failureClass ?? null, changesRequestedReason: task.changesRequestedReason ?? null, reclaimedReason: null };
}

function ensureExecutionControl(tasks) {
  return tasks.map((task) => 'executionStatus' in task ? task : { ...task, ...executionDefaults(task) });
}

function nextNumericSegment(used, width = 0) {
  let value = 1;
  while (used.has(String(value).padStart(width, '0'))) value += 1;
  return String(value).padStart(width, '0');
}

function ensureDisplayKeys(tasks, rootControllers) {
  const rootSet = new Set(rootControllers);
  const next = tasks.map((task) => ({ ...task }));
  const byId = new Map(next.map((task) => [task.threadId, task]));
  const used = new Set(next.filter((task) => nonEmpty(task.displayKey)).map((task) => task.displayKey));
  let remaining = next.filter((task) => !nonEmpty(task.displayKey));
  while (remaining.length > 0) {
    let progressed = false;
    for (const task of remaining) {
      if (rootSet.has(task.parentThreadId)) {
        const rootSegments = new Set([...used].filter((key) => /^\d{2}$/.test(key)));
        task.displayKey = nextNumericSegment(rootSegments, 2);
      } else {
        const parent = byId.get(task.parentThreadId);
        if (!parent || !nonEmpty(parent.displayKey)) continue;
        const prefix = `${parent.displayKey}.`;
        const childSegments = new Set([...used].filter((key) => key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length))).map((key) => key.slice(prefix.length)));
        task.displayKey = `${prefix}${nextNumericSegment(childSegments)}`;
      }
      if (used.has(task.displayKey)) fail('REGISTRY_INVALID', `重复 displayKey: ${task.displayKey}`);
      used.add(task.displayKey);
      progressed = true;
    }
    if (!progressed) fail('REGISTRY_INVALID', '无法为任务分配层级 displayKey');
    remaining = next.filter((task) => !nonEmpty(task.displayKey));
  }
  return next;
}

function ensureThreadControl(tasks, rootControllers) {
  return ensureDisplayKeys(tasks, rootControllers).map((task) => {
    if (hasThreadControl(task) && 'titleSyncStatus' in task) {
      const controlled = { ...task };
      const desired = desiredThreadTitle(controlled);
      if (controlled.desiredThreadTitle !== desired) {
        controlled.desiredThreadTitle = desired;
        controlled.titleSyncStatus = 'pending';
        controlled.titleSyncError = null;
      }
      return controlled;
    }
    const controlled = { ...task };
    controlled.desiredThreadTitle = desiredThreadTitle(controlled);
    controlled.titleSyncStatus = 'pending';
    controlled.lastSyncedTitle = null;
    controlled.titleSyncError = null;
    controlled.archiveStatus = isTerminalTask(controlled) ? 'pending' : 'not_ready';
    controlled.archivedAt = null;
    controlled.archiveError = null;
    return controlled;
  });
}

function ensureTaskControls(tasks, rootControllers) {
  return ensureExecutionControl(ensureThreadControl(tasks, rootControllers));
}

function refreshThreadControl(task, previousTask) {
  const next = { ...task };
  const desired = desiredThreadTitle(next);
  if (desired !== previousTask.desiredThreadTitle) {
    next.desiredThreadTitle = desired;
    next.titleSyncStatus = 'pending';
    next.titleSyncError = null;
  }
  if (isTerminalTask(next)) {
    if (next.archiveStatus === 'not_ready') next.archiveStatus = 'pending';
  } else {
    next.archiveStatus = 'not_ready';
    next.archivedAt = null;
    next.archiveError = null;
  }
  return next;
}

function descendantsOf(tasks, threadId) {
  const descendants = [];
  const queue = [threadId];
  while (queue.length > 0) {
    const parent = queue.shift();
    for (const task of tasks.filter((candidate) => candidate.parentThreadId === parent)) {
      descendants.push(task);
      queue.push(task.threadId);
    }
  }
  return descendants;
}

function threadActionsForTask(task, tasks) {
  const actions = [];
  if (task.titleSyncStatus !== 'synced') actions.push({ type: 'set_thread_title', threadId: task.threadId, title: task.desiredThreadTitle });
  const descendantsArchived = descendantsOf(tasks, task.threadId).every((descendant) => descendant.archiveStatus === 'archived');
  if (isTerminalTask(task) && task.titleSyncStatus === 'synced' && task.archiveStatus !== 'archived' && descendantsArchived) {
    actions.push({ type: 'set_thread_archived', threadId: task.threadId, archived: true });
  }
  return actions;
}

function controllerMutationResult(task, tasks) {
  return { ...task, dispatchAllowed: dispatchAllowed(task), requiredThreadActions: threadActionsForTask(task, tasks) };
}

function validateTask(value) {
  if (!isObject(value)) fail('REGISTRY_INVALID', '任务记录必须是对象');
  const required = ['threadId', 'parentThreadId', 'directControllerThreadId', 'title', 'model', 'thinking', 'status', 'candidateCommit', 'reviewVerdict', 'integrationStatus', 'notificationStatus', 'updatedAt'];
  if (!required.every((key) => key in value)) fail('REGISTRY_INVALID', '任务记录缺少字段');
  assertSafeThreadId(value.threadId);
  assertSafeThreadId(value.parentThreadId, 'parentThreadId');
  assertSafeThreadId(value.directControllerThreadId, 'directControllerThreadId');
  if (value.directControllerThreadId !== value.parentThreadId) fail('REGISTRY_INVALID', 'directControllerThreadId 必须等于 parentThreadId');
  for (const key of ['title', 'model', 'updatedAt']) if (!nonEmpty(value[key])) fail('REGISTRY_INVALID', `${key} 无效`);
  if (!has(value.thinking, THINKING_LEVELS)) fail('REGISTRY_INVALID', `thinking 无效: ${value.thinking}`);
  if (!has(value.status, TASK_STATUSES)) fail('REGISTRY_INVALID', `status 无效: ${value.status}`);
  if (!has(value.reviewVerdict, REVIEW_VERDICTS)) fail('REGISTRY_INVALID', `reviewVerdict 无效: ${value.reviewVerdict}`);
  if (!has(value.integrationStatus, INTEGRATION_STATUSES)) fail('REGISTRY_INVALID', `integrationStatus 无效: ${value.integrationStatus}`);
  if (!has(value.notificationStatus, NOTIFICATION_STATUSES)) fail('REGISTRY_INVALID', `notificationStatus 无效: ${value.notificationStatus}`);
  if (value.candidateCommit !== null && !nonEmpty(value.candidateCommit)) fail('REGISTRY_INVALID', 'candidateCommit 无效');
  if (value.completionEventCreatedAt !== undefined && !isTimestamp(value.completionEventCreatedAt)) fail('REGISTRY_INVALID', 'completionEventCreatedAt 无效');
  const delegationFields = ['delegationMode', 'executionSurface', 'modelClass', 'quotaReason'];
  const presentDelegationFields = delegationFields.filter((key) => key in value);
  if (presentDelegationFields.length !== 0 && presentDelegationFields.length !== delegationFields.length) fail('REGISTRY_INVALID', '委派字段必须同时存在');
  if (presentDelegationFields.length === delegationFields.length) {
    if (!has(value.delegationMode, DELEGATION_MODES)) fail('REGISTRY_INVALID', `delegationMode 无效: ${value.delegationMode}`);
    if (!has(value.executionSurface, EXECUTION_SURFACES)) fail('REGISTRY_INVALID', `executionSurface 无效: ${value.executionSurface}`);
    if (!has(value.modelClass, MODEL_CLASSES)) fail('REGISTRY_INVALID', `modelClass 无效: ${value.modelClass}`);
    if (!nonEmpty(value.quotaReason)) fail('REGISTRY_INVALID', 'quotaReason 无效');
  }
  const routingFields = ['workClass', 'decisionStatus', 'scope', 'acceptance', 'forbiddenDecisions'];
  const presentRoutingFields = routingFields.filter((key) => key in value);
  if (presentRoutingFields.length !== 0 && presentRoutingFields.length !== routingFields.length) fail('REGISTRY_INVALID', '路由证据字段必须同时存在');
  if (presentRoutingFields.length === routingFields.length) {
    if (!has(value.workClass, WORK_CLASSES)) fail('REGISTRY_INVALID', `workClass 无效: ${value.workClass}`);
    if (!has(value.decisionStatus, DECISION_STATUSES)) fail('REGISTRY_INVALID', `decisionStatus 无效: ${value.decisionStatus}`);
    for (const key of ['scope', 'acceptance', 'forbiddenDecisions']) if (!nonEmpty(value[key])) fail('REGISTRY_INVALID', `${key} 无效`);
  }
  const executionFields = ['executionStatus', 'nextOwner', 'attemptCount', 'failureClass', 'changesRequestedReason', 'reclaimedReason'];
  const presentExecutionFields = executionFields.filter((key) => key in value);
  if (presentExecutionFields.length !== 0 && presentExecutionFields.length !== executionFields.length) fail('REGISTRY_INVALID', '执行状态字段必须同时存在');
  if (presentExecutionFields.length === executionFields.length) {
    if (!has(value.executionStatus, EXECUTION_STATUSES)) fail('REGISTRY_INVALID', `executionStatus 无效: ${value.executionStatus}`);
    if (!has(value.nextOwner, NEXT_OWNERS)) fail('REGISTRY_INVALID', `nextOwner 无效: ${value.nextOwner}`);
    if (!Number.isInteger(value.attemptCount) || value.attemptCount < 1) fail('REGISTRY_INVALID', 'attemptCount 无效');
    if (value.failureClass !== null && !has(value.failureClass, FAILURE_CLASSES)) fail('REGISTRY_INVALID', `failureClass 无效: ${value.failureClass}`);
    if (value.changesRequestedReason !== null && !nonEmpty(value.changesRequestedReason)) fail('REGISTRY_INVALID', 'changesRequestedReason 无效');
    if (value.reclaimedReason !== null && !nonEmpty(value.reclaimedReason)) fail('REGISTRY_INVALID', 'reclaimedReason 无效');
    const expected = executionDefaults(value);
    if (value.executionStatus !== expected.executionStatus || value.nextOwner !== expected.nextOwner) fail('REGISTRY_INVALID', 'executionStatus/nextOwner 与 lifecycle 不一致');
    if (value.status === 'changes_requested' && (value.failureClass === null || !nonEmpty(value.changesRequestedReason))) fail('REGISTRY_INVALID', 'changes_requested 必须记录失败分类和原因');
    if (value.status === 'reclaimed' && !nonEmpty(value.reclaimedReason)) fail('REGISTRY_INVALID', 'reclaimed 必须记录主控收回原因');
  }
  const threadControlFields = ['displayKey', 'desiredThreadTitle', 'titleSyncStatus', 'lastSyncedTitle', 'titleSyncError', 'archiveStatus', 'archivedAt', 'archiveError'];
  const presentThreadControlFields = threadControlFields.filter((key) => key in value);
  if (presentThreadControlFields.length !== 0 && presentThreadControlFields.length !== threadControlFields.length) fail('REGISTRY_INVALID', 'thread control 字段必须同时存在');
  if (presentThreadControlFields.length === threadControlFields.length) {
    if (!/^\d{2}(?:\.\d+)*$/.test(value.displayKey)) fail('REGISTRY_INVALID', `displayKey 无效: ${value.displayKey}`);
    if (!nonEmpty(value.desiredThreadTitle) || (value.desiredThreadTitle !== desiredThreadTitle(value) && !isLegacyChangesRequestedTitle(value))) fail('REGISTRY_INVALID', 'desiredThreadTitle 与 lifecycle 不一致');
    if (!has(value.titleSyncStatus, TITLE_SYNC_STATUSES)) fail('REGISTRY_INVALID', `titleSyncStatus 无效: ${value.titleSyncStatus}`);
    if (value.lastSyncedTitle !== null && !nonEmpty(value.lastSyncedTitle)) fail('REGISTRY_INVALID', 'lastSyncedTitle 无效');
    if (value.titleSyncError !== null && !nonEmpty(value.titleSyncError)) fail('REGISTRY_INVALID', 'titleSyncError 无效');
    if (value.titleSyncStatus === 'synced' && (value.lastSyncedTitle !== value.desiredThreadTitle || value.titleSyncError !== null)) fail('REGISTRY_INVALID', '已同步 title 必须匹配 desiredThreadTitle');
    if (value.titleSyncStatus === 'failed' && !nonEmpty(value.titleSyncError)) fail('REGISTRY_INVALID', 'title sync failed 必须记录原因');
    if (!has(value.archiveStatus, ARCHIVE_STATUSES)) fail('REGISTRY_INVALID', `archiveStatus 无效: ${value.archiveStatus}`);
    if (!isTerminalTask(value) && value.archiveStatus !== 'not_ready') fail('REGISTRY_INVALID', '非终态任务不能归档');
    if (isTerminalTask(value) && value.archiveStatus === 'not_ready') fail('REGISTRY_INVALID', '终态任务必须进入归档流程');
    if (value.archiveStatus === 'archived' && !isTimestamp(value.archivedAt)) fail('REGISTRY_INVALID', 'archivedAt 无效');
    if (value.archiveStatus !== 'archived' && value.archivedAt !== null) fail('REGISTRY_INVALID', '未归档任务不能有 archivedAt');
    if (value.archiveStatus === 'failed' && !nonEmpty(value.archiveError)) fail('REGISTRY_INVALID', 'archive failed 必须记录原因');
    if (value.archiveStatus !== 'failed' && value.archiveError !== null) fail('REGISTRY_INVALID', '非失败归档不能有 archiveError');
  }
  if (!isTimestamp(value.updatedAt) || !lifecycleConsistent(value)) fail('REGISTRY_INVALID', '任务生命周期或 updatedAt 无效');
  return { ...value };
}

export function validateRegistry(value, expectedProjectKey, expectedProjectRoot) {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.tasks) || !Array.isArray(value.rootControllerThreadIds)) fail('REGISTRY_INVALID', '注册表 schema 无效');
  if (!nonEmpty(value.projectKey) || !nonEmpty(value.projectRoot) || !isTimestamp(value.updatedAt)) fail('REGISTRY_INVALID', '注册表头字段无效');
  if (expectedProjectKey && value.projectKey !== expectedProjectKey) fail('PROJECT_MISMATCH', '注册表 projectKey 不匹配');
  if (expectedProjectRoot && normalizeWindowsPath(value.projectRoot) !== normalizeWindowsPath(expectedProjectRoot)) fail('PROJECT_MISMATCH', '注册表 projectRoot 不匹配');
  if (value.projectKey !== projectKeyForRoot(value.projectRoot)) fail('REGISTRY_INVALID', 'projectKey 与 projectRoot 不匹配');
  const roots = value.rootControllerThreadIds;
  const rootSet = new Set();
  for (const root of roots) {
    assertSafeThreadId(root, 'rootControllerThreadId');
    if (rootSet.has(root)) fail('REGISTRY_INVALID', `重复 root controller: ${root}`);
    rootSet.add(root);
  }
  const tasks = value.tasks.map(validateTask);
  const ids = new Set();
  for (const task of tasks) {
    if (rootSet.has(task.threadId)) fail('REGISTRY_INVALID', 'root controller 不能同时是同项目 task');
    if (ids.has(task.threadId)) fail('REGISTRY_INVALID', `重复 threadId: ${task.threadId}`);
    ids.add(task.threadId);
  }
  const controlledKeys = new Set();
  for (const task of tasks) {
    if (task.parentThreadId !== task.directControllerThreadId) fail('REGISTRY_INVALID', 'task 的 parent/controller 不一致');
    if (!rootSet.has(task.parentThreadId) && !ids.has(task.parentThreadId)) fail('REGISTRY_INVALID', `父任务未登记: ${task.parentThreadId}`);
    const seen = new Set();
    let cursor = task.parentThreadId;
    while (!rootSet.has(cursor)) {
      if (seen.has(cursor)) fail('REGISTRY_INVALID', `父任务存在循环: ${task.threadId}`);
      seen.add(cursor);
      const parent = tasks.find((candidate) => candidate.threadId === cursor);
      if (!parent) fail('REGISTRY_INVALID', `父任务未登记: ${cursor}`);
      cursor = parent.parentThreadId;
    }
    if (hasThreadControl(task)) {
      if (controlledKeys.has(task.displayKey)) fail('REGISTRY_INVALID', `重复 displayKey: ${task.displayKey}`);
      controlledKeys.add(task.displayKey);
      if (rootSet.has(task.parentThreadId) && !/^\d{2}$/.test(task.displayKey)) fail('REGISTRY_INVALID', `root child displayKey 无效: ${task.displayKey}`);
      const parent = tasks.find((candidate) => candidate.threadId === task.parentThreadId);
      if (parent && hasThreadControl(parent) && !task.displayKey.startsWith(`${parent.displayKey}.`)) fail('REGISTRY_INVALID', `nested displayKey 未继承 parent: ${task.displayKey}`);
    }
  }
  return { schemaVersion: 1, projectKey: value.projectKey, projectRoot: normalizeWindowsPath(value.projectRoot), rootControllerThreadIds: [...roots], updatedAt: value.updatedAt, tasks };
}

async function readIndex(home) {
  const indexPath = join(home, 'projects.json');
  try {
    const value = await readJson(indexPath, 'INDEX_READ_FAILED');
    if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.projects) || !isTimestamp(value.updatedAt)) fail('INDEX_INVALID', 'projects.json schema 无效');
    const seen = new Set();
    const projects = value.projects.map((project) => {
      if (!isObject(project) || !nonEmpty(project.projectKey) || !nonEmpty(project.projectRoot) || !nonEmpty(project.normalizedProjectRoot) || !nonEmpty(project.registryPath)) fail('INDEX_INVALID', '项目索引项无效');
      if (seen.has(project.projectKey)) fail('INDEX_INVALID', `重复 projectKey: ${project.projectKey}`);
      seen.add(project.projectKey);
      if (normalizeWindowsPath(project.projectRoot) !== normalizeWindowsPath(project.normalizedProjectRoot)) fail('INDEX_INVALID', 'projectRoot 与 normalizedProjectRoot 不一致');
      if (project.projectKey !== projectKeyForRoot(project.normalizedProjectRoot)) fail('INDEX_INVALID', 'projectKey 与项目根不匹配');
      const expectedRegistryPath = join(home, 'projects', project.projectKey, 'task-registry.json');
      if (project.registryPath !== expectedRegistryPath) fail('INDEX_INVALID', 'registryPath 不是标准项目路径');
      return { ...project, projectRoot: normalizeWindowsPath(project.projectRoot), normalizedProjectRoot: normalizeWindowsPath(project.normalizedProjectRoot), registryPath: expectedRegistryPath };
    });
    return { schemaVersion: 1, updatedAt: value.updatedAt, projects };
  } catch (error) {
    if (error instanceof TaskControlError && error.code === 'INDEX_READ_FAILED' && /ENOENT/.test(error.message)) return { schemaVersion: 1, updatedAt: new Date().toISOString(), projects: [] };
    throw error;
  }
}

async function ensureProject(home, projectRoot, controllerThreadId) {
  const paths = pathsFor(home, projectRoot);
  await withExclusiveLock(paths.indexPath, async () => {
    const index = await readIndex(home);
    const found = index.projects.find((candidate) => candidate.projectKey === paths.projectKey);
    if (found && found.normalizedProjectRoot !== paths.projectRoot) fail('PROJECT_MISMATCH', '同一 projectKey 指向多个项目根');
    if (!found) {
      const project = { projectKey: paths.projectKey, projectRoot: paths.projectRoot, normalizedProjectRoot: paths.projectRoot, registryPath: paths.registryPath };
      await atomicWriteJson(paths.indexPath, { ...index, updatedAt: new Date().toISOString(), projects: [...index.projects, project] });
    }
  });
  await mkdir(paths.projectDir, { recursive: true });
  try {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    return { paths, registry };
  } catch (error) {
    if (!(error instanceof TaskControlError) || !/ENOENT/.test(error.message)) throw error;
    if (!controllerThreadId) fail('TASK_NOT_REGISTERED', '项目注册表不存在');
    const registry = { schemaVersion: 1, projectKey: paths.projectKey, projectRoot: paths.projectRoot, rootControllerThreadIds: [], updatedAt: new Date().toISOString(), tasks: [] };
    return { paths, registry: await withExclusiveLock(paths.registryPath, async () => {
      try {
        return validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
      } catch (innerError) {
        if (!(innerError instanceof TaskControlError) || !/ENOENT/.test(innerError.message)) throw innerError;
        await atomicWriteJson(paths.registryPath, registry);
        return registry;
      }
    }) };
  }
}

async function readProjectRegistry(home, project) {
  const registry = validateRegistry(await readJson(project.registryPath, 'REGISTRY_READ_FAILED'), project.projectKey, project.normalizedProjectRoot);
  return { project, registry };
}

async function findSelf(home, selfThreadId) {
  assertSafeThreadId(selfThreadId, 'selfThreadId');
  const index = await readIndex(home);
  const matches = [];
  for (const project of index.projects) {
    const { registry } = await readProjectRegistry(home, project);
    const task = registry.tasks.find((candidate) => candidate.threadId === selfThreadId);
    if (task) matches.push({ project, registry, task });
  }
  if (matches.length === 0) fail('TASK_NOT_REGISTERED', `任务未登记: ${selfThreadId}`);
  if (matches.length > 1) fail('AMBIGUOUS_TASK', `threadId 出现在多个项目: ${selfThreadId}`);
  const result = matches[0];
  return { ...result, paths: pathsFor(home, result.project.projectRoot) };
}

function taskOrThrow(registry, threadId) {
  assertSafeThreadId(threadId);
  const task = registry.tasks.find((candidate) => candidate.threadId === threadId);
  if (!task) fail('TASK_NOT_REGISTERED', `任务未登记: ${threadId}`);
  return task;
}

function assertTaskController(task, controllerThreadId) {
  assertSafeThreadId(controllerThreadId, 'controllerThreadId');
  if (task.directControllerThreadId !== controllerThreadId) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 不是该 task 的 direct controller');
}

async function mutateController({ codexHome, taskControlHome, projectRoot, controllerThreadId, threadId, mutate }) {
  const resolvedHome = resolveTaskControlHome({ codexHome, taskControlHome });
  const { paths } = await ensureProject(resolvedHome, projectRoot);
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const controlledRegistry = { ...registry, tasks: ensureTaskControls(registry.tasks, registry.rootControllerThreadIds) };
    const current = taskOrThrow(controlledRegistry, threadId);
    assertTaskController(current, controllerThreadId);
    const mutatedTask = mutate(current, controlledRegistry);
    const nextTask = refreshThreadControl(mutatedTask, current);
    const next = validateRegistry({ ...controlledRegistry, updatedAt: new Date().toISOString(), tasks: controlledRegistry.tasks.map((task) => task.threadId === threadId ? nextTask : task) }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return controllerMutationResult(nextTask, next.tasks);
  });
}

export function auditControllerRouting(input = {}) {
  if (![input.model, input.thinking, input.controllerWorkClass].every(nonEmpty)) fail('CLI_INVALID_ARGUMENTS', '主控路由必须显式提供 model、thinking 和 work class');
  if (input.model !== CONTROLLER_MODEL) fail('CONTROLLER_MODEL_REQUIRED', `前沿主控必须使用 ${CONTROLLER_MODEL}`);
  if (['none', 'low'].includes(input.thinking)) fail('CONTROLLER_THINKING_TOO_LOW', 'Sol 主控不得使用 none 或 low thinking');
  if (WORK_CLASSES.includes(input.controllerWorkClass)) fail('CONTROLLER_MECHANICAL_WORK_FORBIDDEN', '机械或局部实现工作不得通过 Sol xhigh/max 主控路由，应交给合适的 Luna/Terra 可见任务');
  if (!CONTROLLER_WORK_CLASSES.includes(input.controllerWorkClass)) fail('CONTROLLER_WORK_CLASS_INVALID', `未知主控 work class: ${input.controllerWorkClass}`);
  const expectedThinking = CONTROLLER_WORK_CLASS_THINKING[input.controllerWorkClass];
  if (input.thinking !== expectedThinking) fail('CONTROLLER_THINKING_WORK_CLASS_MISMATCH', `${input.controllerWorkClass} 必须使用 ${expectedThinking} thinking，不能使用 ${input.thinking}`);

  const escalationTrigger = nonEmpty(input.escalationTrigger) ? input.escalationTrigger.trim() : null;
  const escalationReason = nonEmpty(input.escalationReason) ? input.escalationReason.trim() : null;
  const maxAuthority = nonEmpty(input.maxAuthority) ? input.maxAuthority.trim() : null;

  if (input.thinking === 'xhigh') {
    if (!escalationTrigger) fail('CONTROLLER_ESCALATION_TRIGGER_REQUIRED', 'xhigh 必须记录升级触发条件');
    if (!CONTROLLER_ESCALATION_TRIGGERS.includes(escalationTrigger)) fail('CONTROLLER_ESCALATION_TRIGGER_INVALID', `xhigh 触发条件无效: ${escalationTrigger}`);
    if (!escalationReason || escalationReason.length < 20) fail('CONTROLLER_ESCALATION_REASON_REQUIRED', 'xhigh 必须记录不少于 20 个字符的具体升级理由');
    if (maxAuthority) fail('CONTROLLER_ESCALATION_EVIDENCE_UNEXPECTED', 'xhigh 不得携带 max authority');
  } else if (input.thinking === 'max') {
    if (!maxAuthority || !CONTROLLER_MAX_AUTHORITIES.includes(maxAuthority)) fail('CONTROLLER_MAX_AUTHORITY_REQUIRED', 'max 必须由 user_explicit 或 xhigh_unresolved 授权');
    if (!escalationReason || escalationReason.length < 20) fail('CONTROLLER_ESCALATION_REASON_REQUIRED', 'max 必须记录不少于 20 个字符的最终仲裁理由');
    if (escalationTrigger) fail('CONTROLLER_ESCALATION_EVIDENCE_UNEXPECTED', 'max 使用 max authority，不得混用 xhigh escalation trigger');
  } else if (escalationTrigger || escalationReason || maxAuthority) {
    fail('CONTROLLER_ESCALATION_EVIDENCE_UNEXPECTED', 'medium/high 路由不得伪造 xhigh/max 升级证据');
  }

  return {
    compliant: true,
    model: input.model,
    thinking: input.thinking,
    controllerWorkClass: input.controllerWorkClass,
    escalationTrigger,
    escalationReason,
    maxAuthority,
    providerCalls: 0,
  };
}

export async function controllerRegisterTask(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot, input.controllerThreadId);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  assertSafeThreadId(input.threadId);
  assertSafeThreadId(input.parentThreadId, 'parentThreadId');
  if (![input.title, input.model, input.thinking].every(nonEmpty)) fail('CLI_INVALID_ARGUMENTS', 'register 字段不能为空');
  if (input.title.trim() === '等待主控登记') fail('TASK_TITLE_PLACEHOLDER_FORBIDDEN', '必须在登记时提供可区分的语义标题');
  if (!has(input.thinking, THINKING_LEVELS)) fail('CLI_INVALID_ARGUMENTS', `thinking 非法: ${input.thinking}`);
  if (input.delegationMode !== 'explicit') fail('DELEGATION_NOT_AUTHORIZED', '默认禁止子智能体；必须由主控显式授权 --delegation explicit');
  if (input.executionSurface !== 'visible_task') fail('INTERNAL_SUBAGENT_FORBIDDEN', '禁止 Codex 内部 subagent；子任务必须使用可见 task/thread');
  if (input.modelClass !== 'economical') fail('DELEGATION_MODEL_NOT_ECONOMICAL', '子任务只能使用 economical 模型分类');
  if (input.thinking === 'low') fail('DELEGATION_THINKING_TOO_LOW', '可见子任务至少必须使用 medium thinking');
  if (!nonEmpty(input.quotaReason) || input.quotaReason.trim().length < 12) fail('DELEGATION_REASON_REQUIRED', '必须提供不少于 12 个字符的 quota 节省理由');
  if (input.workClass === 'controller_only') fail('DELEGATION_CONTROLLER_ONLY', 'controller_only 工作必须由前沿主控完成');
  if (!has(input.workClass, WORK_CLASSES)) fail('DELEGATION_WORK_CLASS_REQUIRED', '必须将可委派工作分类为 repeatable 或 bounded_reasoning');
  const expectedModel = WORK_CLASS_MODELS[input.workClass];
  if (input.model !== expectedModel) fail('DELEGATION_MODEL_WORK_CLASS_MISMATCH', `${input.workClass} 必须使用 ${expectedModel}，不能使用 ${input.model}`);
  const allowedThinking = WORK_CLASS_THINKING[input.workClass];
  if (!allowedThinking.includes(input.thinking)) fail('DELEGATION_THINKING_WORK_CLASS_MISMATCH', `${input.workClass} 的 thinking 必须是 ${allowedThinking.join(' 或 ')}，不能使用 ${input.thinking}`);
  if (input.decisionStatus !== 'resolved') fail('DELEGATION_DECISIONS_UNRESOLVED', '架构、合同、信任源、错误策略和验收预期必须在委派前已确定');
  if (![input.scope, input.acceptance, input.forbiddenDecisions].every(nonEmpty)) fail('DELEGATION_EVIDENCE_REQUIRED', '必须提供明确 scope、acceptance 和 forbiddenDecisions');
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    if (registry.tasks.some((task) => task.threadId === input.threadId)) fail('DUPLICATE_THREAD', `重复 threadId: ${input.threadId}`);
    if (input.threadId === input.controllerThreadId) fail('DUPLICATE_THREAD', '任务不能等于 direct controller');
    let rootControllers = [...registry.rootControllerThreadIds];
    const controlledTasks = ensureTaskControls(registry.tasks, rootControllers);
    const parent = controlledTasks.find((task) => task.threadId === input.parentThreadId);
    if (parent) {
      if (parent.threadId !== input.controllerThreadId) fail('CONTROLLER_UNAUTHORIZED', 'nested visible task 的 controller 必须等于已登记 parent task.threadId');
    } else {
      if (input.parentThreadId !== input.controllerThreadId) fail('PARENT_NOT_REGISTERED', `父任务未登记: ${input.parentThreadId}`);
      if (!rootControllers.includes(input.controllerThreadId)) rootControllers.push(input.controllerThreadId);
    }
    const draft = { threadId: input.threadId, parentThreadId: input.parentThreadId, directControllerThreadId: input.controllerThreadId, title: input.title.trim().replace(/\s+/g, ' '), model: input.model, thinking: input.thinking, delegationMode: input.delegationMode, executionSurface: input.executionSurface, modelClass: input.modelClass, quotaReason: input.quotaReason.trim(), workClass: input.workClass, decisionStatus: input.decisionStatus, scope: input.scope.trim(), acceptance: input.acceptance.trim(), forbiddenDecisions: input.forbiddenDecisions.trim(), status: 'executing', executionStatus: 'running', nextOwner: 'worker', attemptCount: 1, failureClass: null, changesRequestedReason: null, reclaimedReason: null, candidateCommit: null, reviewVerdict: 'pending', integrationStatus: 'not_integrated', notificationStatus: 'pending', updatedAt: new Date().toISOString() };
    const tasks = ensureTaskControls([...controlledTasks, draft], rootControllers);
    const task = tasks.find((candidate) => candidate.threadId === input.threadId);
    const next = validateRegistry({ ...registry, rootControllerThreadIds: rootControllers, updatedAt: new Date().toISOString(), tasks }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return controllerMutationResult(task, next.tasks);
  });
}

export async function auditModelRouting(input = {}) {
  const home = resolveTaskControlHome(input);
  const index = await readIndex(home);
  const violations = [];
  let activeTaskCount = 0;
  for (const project of index.projects) {
    const { registry } = await readProjectRegistry(home, project);
    for (const task of registry.tasks) {
      if (isTerminalTask(task)) continue;
      activeTaskCount += 1;
      if (!has(task.workClass, WORK_CLASSES)) {
        violations.push({ projectKey: registry.projectKey, projectRoot: registry.projectRoot, threadId: task.threadId, directControllerThreadId: task.directControllerThreadId, title: task.title, status: task.status, workClass: task.workClass ?? null, currentModel: task.model, expectedModel: null, reason: 'legacy_missing_routing_evidence' });
        continue;
      }
      const expectedModel = WORK_CLASS_MODELS[task.workClass];
      if (task.model !== expectedModel) violations.push({ projectKey: registry.projectKey, projectRoot: registry.projectRoot, threadId: task.threadId, directControllerThreadId: task.directControllerThreadId, title: task.title, status: task.status, workClass: task.workClass, currentModel: task.model, expectedModel, reason: 'model_work_class_mismatch' });
    }
  }
  return { compliant: violations.length === 0, activeTaskCount, violationCount: violations.length, violations, auditedAt: new Date().toISOString() };
}

export async function auditThinkingRouting(input = {}) {
  const home = resolveTaskControlHome(input);
  const index = await readIndex(home);
  const violations = [];
  let activeTaskCount = 0;
  for (const project of index.projects) {
    const { registry } = await readProjectRegistry(home, project);
    for (const task of registry.tasks) {
      if (isTerminalTask(task)) continue;
      activeTaskCount += 1;
      if (!has(task.workClass, WORK_CLASSES)) {
        violations.push({ projectKey: registry.projectKey, projectRoot: registry.projectRoot, threadId: task.threadId, directControllerThreadId: task.directControllerThreadId, title: task.title, status: task.status, workClass: task.workClass ?? null, currentThinking: task.thinking, allowedThinking: null, reason: 'legacy_missing_routing_evidence' });
        continue;
      }
      const allowedThinking = WORK_CLASS_THINKING[task.workClass];
      if (!allowedThinking.includes(task.thinking)) violations.push({ projectKey: registry.projectKey, projectRoot: registry.projectRoot, threadId: task.threadId, directControllerThreadId: task.directControllerThreadId, title: task.title, status: task.status, workClass: task.workClass, currentThinking: task.thinking, allowedThinking, reason: 'thinking_work_class_mismatch' });
    }
  }
  return { compliant: violations.length === 0, activeTaskCount, violationCount: violations.length, violations, auditedAt: new Date().toISOString() };
}

export async function auditArchiveBacklog(input = {}) {
  const home = resolveTaskControlHome(input);
  const index = await readIndex(home);
  const ownerPlans = new Map();
  let backlogCount = 0;
  let readyActionCount = 0;
  for (const project of index.projects) {
    const { registry: rawRegistry } = await readProjectRegistry(home, project);
    const rawById = new Map(rawRegistry.tasks.map((task) => [task.threadId, task]));
    const registry = { ...rawRegistry, tasks: ensureTaskControls(rawRegistry.tasks, rawRegistry.rootControllerThreadIds) };
    for (const task of registry.tasks) {
      if (!isTerminalTask(task) || task.archiveStatus === 'archived') continue;
      backlogCount += 1;
      const descendants = descendantsOf(registry.tasks, task.threadId);
      const blockedByDescendants = descendants.some((descendant) => descendant.archiveStatus !== 'archived');
      const actions = threadActionsForTask(task, registry.tasks);
      readyActionCount += actions.length;
      const ownerKey = `${registry.projectKey}:${task.directControllerThreadId}`;
      if (!ownerPlans.has(ownerKey)) ownerPlans.set(ownerKey, { projectKey: registry.projectKey, projectRoot: registry.projectRoot, controllerThreadId: task.directControllerThreadId, tasks: [], threadActions: [] });
      const owner = ownerPlans.get(ownerKey);
      owner.tasks.push({ threadId: task.threadId, displayKey: task.displayKey, title: task.title, status: task.status, archiveStatus: task.archiveStatus, legacyArchiveMetadata: !('archiveStatus' in rawById.get(task.threadId)), blockedByDescendants, descendantCount: descendants.length, updatedAt: task.updatedAt });
      owner.threadActions.push(...actions);
    }
  }
  const owners = [...ownerPlans.values()].map((owner) => ({ ...owner, tasks: owner.tasks.sort((left, right) => right.displayKey.split('.').length - left.displayKey.split('.').length || left.displayKey.localeCompare(right.displayKey)) }));
  return { compliant: backlogCount === 0, backlogCount, ownerCount: owners.length, readyActionCount, owners, auditedAt: new Date().toISOString() };
}

async function readArtifact(filePath, expectedType) {
  const value = await readJson(filePath, expectedType === 'task_completed' ? 'EVENT_INVALID' : 'NOTIFICATION_RECEIPT_INVALID');
  if (!isObject(value) || value.schemaVersion !== 1 || value.type !== expectedType || !nonEmpty(value.projectKey) || !isSafeThreadId(value.threadId) || !isSafeThreadId(value.parentThreadId) || !isSafeThreadId(value.controllerThreadId) || !isTimestamp(value.createdAt)) fail(expectedType === 'task_completed' ? 'EVENT_INVALID' : 'NOTIFICATION_RECEIPT_INVALID', '事件身份或时间字段无效');
  return value;
}

export async function controllerIngestCompletion(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  const event = await readArtifact(input.eventPath, 'task_completed');
  if (event.projectKey !== paths.projectKey) fail('PROJECT_MISMATCH', 'completion event projectKey 不匹配');
  if (event.status !== 'awaiting_review' || !nonEmpty(event.candidateCommit)) fail('EVENT_INVALID', 'completion event 必须是 awaiting_review 且有 candidateCommit');
  return mutateController({ codexHome: input.codexHome, taskControlHome: input.taskControlHome, projectRoot: input.projectRoot, controllerThreadId: input.controllerThreadId, threadId: event.threadId, mutate: (task) => {
    if (event.parentThreadId !== task.parentThreadId || event.controllerThreadId !== task.directControllerThreadId) fail('EVENT_INVALID', 'completion event parent/controller 不匹配');
    if (Date.parse(event.createdAt) <= Date.parse(task.updatedAt)) fail('EVENT_STALE', 'completion event 过期或重复');
    if (task.status !== 'executing') fail('EVENT_STALE', `不能从 ${task.status} 入账 completion event`);
    if (task.candidateCommit === event.candidateCommit) fail('EVENT_STALE', '新一轮执行必须产生新 candidateCommit');
    return { ...task, status: 'awaiting_review', executionStatus: 'awaiting_review', nextOwner: 'controller', candidateCommit: event.candidateCommit, completionEventCreatedAt: event.createdAt, reviewVerdict: 'pending', integrationStatus: 'not_integrated', notificationStatus: 'pending', updatedAt: new Date().toISOString() };
  }});
}

export async function controllerMarkNotificationSent(input) {
  return mutateController({ ...input, mutate: (task) => {
    if (task.notificationStatus !== 'pending') fail('NOTIFICATION_ALREADY_RECORDED', `notificationStatus 已是 ${task.notificationStatus}`);
    return { ...task, notificationStatus: 'sent', updatedAt: new Date().toISOString() };
  }});
}

export async function controllerIngestNotificationFailed(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  const receipt = await readArtifact(input.receiptPath, 'notification_failed');
  if (receipt.projectKey !== paths.projectKey || !nonEmpty(receipt.reason)) fail('NOTIFICATION_RECEIPT_INVALID', 'notification_failed 项目或 reason 无效');
  return mutateController({ codexHome: input.codexHome, taskControlHome: input.taskControlHome, projectRoot: input.projectRoot, controllerThreadId: input.controllerThreadId, threadId: receipt.threadId, mutate: (task) => {
    if (receipt.parentThreadId !== task.parentThreadId || receipt.controllerThreadId !== task.directControllerThreadId) fail('NOTIFICATION_RECEIPT_INVALID', 'notification_failed parent/controller 不匹配');
    const freshnessAnchor = task.completionEventCreatedAt ?? task.updatedAt;
    if (Date.parse(receipt.createdAt) <= Date.parse(freshnessAnchor)) fail('NOTIFICATION_RECEIPT_STALE', 'notification_failed 回执早于当前 completion 或已过期');
    if (task.notificationStatus !== 'pending') fail('NOTIFICATION_ALREADY_RECORDED', `notificationStatus 已是 ${task.notificationStatus}`);
    return { ...task, notificationStatus: 'failed', updatedAt: new Date().toISOString() };
  }});
}

async function listTaskEventFiles(paths, task) {
  const taskEventDir = join(paths.eventsDir, task.threadId);
  let entries;
  try {
    entries = await readdir(taskEventDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
    fail('EVENT_SCAN_FAILED', `无法扫描 ${taskEventDir}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return entries
    .filter((entry) => entry.isFile() && (entry.name.startsWith('completion-') || entry.name.startsWith('notification-failed-')) && entry.name.endsWith('.json'))
    .map((entry) => join(taskEventDir, entry.name));
}

export async function controllerScanPendingEvents(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  const rawRegistry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
  const registry = { ...rawRegistry, tasks: ensureTaskControls(rawRegistry.tasks, rawRegistry.rootControllerThreadIds) };
  const controllerKnown = registry.rootControllerThreadIds.includes(input.controllerThreadId) || registry.tasks.some((task) => task.threadId === input.controllerThreadId);
  if (!controllerKnown) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 未登记为项目主控或父任务');

  const directTasks = registry.tasks.filter((task) => task.directControllerThreadId === input.controllerThreadId);
  const pendingEvents = [];
  for (const task of directTasks) {
    for (const eventPath of await listTaskEventFiles(paths, task)) {
      const isCompletion = eventPath.includes(`${win32.sep}completion-`);
      const type = isCompletion ? 'task_completed' : 'notification_failed';
      const artifact = await readArtifact(eventPath, type);
      if (artifact.projectKey !== paths.projectKey || artifact.threadId !== task.threadId || artifact.parentThreadId !== task.parentThreadId || artifact.controllerThreadId !== task.directControllerThreadId) {
        fail('EVENT_INVALID', `事件身份与台账不一致: ${eventPath}`);
      }
      const freshnessAnchor = type === 'notification_failed' ? (task.completionEventCreatedAt ?? task.updatedAt) : task.updatedAt;
      if (Date.parse(artifact.createdAt) <= Date.parse(freshnessAnchor)) continue;
      if (type === 'task_completed' && task.status !== 'executing') continue;
      if (type === 'notification_failed' && task.notificationStatus !== 'pending') continue;
      pendingEvents.push({ type, eventPath, threadId: task.threadId, parentThreadId: task.parentThreadId, createdAt: artifact.createdAt, ...(type === 'task_completed' ? { candidateCommit: artifact.candidateCommit } : { reason: artifact.reason }) });
    }
  }
  pendingEvents.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.eventPath.localeCompare(right.eventPath));
  const activeTasks = directTasks.filter((task) => task.status === 'executing').map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, status: task.status, executionStatus: task.executionStatus, attemptCount: task.attemptCount, notificationStatus: task.notificationStatus }));
  const reviewQueue = directTasks.filter((task) => task.status === 'awaiting_review' || task.status === 'accepted').map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, status: task.status, candidateCommit: task.candidateCommit, notificationStatus: task.notificationStatus }));
  const routingQueue = directTasks.filter((task) => task.status === 'changes_requested').map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, status: task.status, executionStatus: task.executionStatus, nextOwner: task.nextOwner, failureClass: task.failureClass }));
  const pendingCleanupTasks = directTasks.filter((task) => isTerminalTask(task) && task.archiveStatus !== 'archived').map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, status: task.status, archiveStatus: task.archiveStatus }));
  const threadActions = directTasks.flatMap((task) => threadActionsForTask(task, registry.tasks));
  return {
    projectKey: registry.projectKey,
    controllerThreadId: input.controllerThreadId,
    pendingEvents,
    reviewQueue,
    routingQueue,
    activeTasks,
    pendingCleanupTasks,
    threadActions,
    needsControllerAttention: pendingEvents.length > 0 || reviewQueue.length > 0 || routingQueue.length > 0 || threadActions.length > 0,
    shouldKeepHeartbeat: activeTasks.length > 0 || reviewQueue.length > 0 || routingQueue.length > 0 || pendingCleanupTasks.length > 0,
  };
}

export async function controllerMarkChangesRequested(input) {
  if (!has(input.failureClass, FAILURE_CLASSES.filter((value) => value !== 'unclassified')) || !nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'changes_requested 必须提供失败分类和原因');
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'executing' && task.status !== 'awaiting_review') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 转 changes_requested`);
    return { ...task, status: 'changes_requested', executionStatus: 'stopped', nextOwner: 'undecided', failureClass: input.failureClass, changesRequestedReason: input.reason.trim(), reviewVerdict: 'changes_requested', updatedAt: new Date().toISOString() };
  }});
}

export async function controllerDispatchRework(input) {
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'changes_requested') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 重新派发`);
    if (task.failureClass !== 'mechanical') fail('REWORK_REQUIRES_CONTROLLER', `${task.failureClass} 失败不得继续交给原 worker；必须由主控收回并重新分类`);
    if ((task.attemptCount ?? 1) >= 2) fail('REWORK_LIMIT_REACHED', '同一可见任务只允许一次机械返工；必须由主控收回');
    return { ...task, status: 'executing', executionStatus: 'running', nextOwner: 'worker', attemptCount: (task.attemptCount ?? 1) + 1, reviewVerdict: 'pending', notificationStatus: 'pending', updatedAt: new Date().toISOString() };
  }});
}

export async function controllerReclaimTask(input) {
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'reclaim reason 不能为空');
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'changes_requested' && task.status !== 'awaiting_review') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 由主控收回`);
    return { ...task, status: 'reclaimed', executionStatus: 'terminal', nextOwner: 'controller', reclaimedReason: input.reason.trim(), updatedAt: new Date().toISOString() };
  }});
}

export async function controllerMarkBlocked(input) {
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'blocked reason 不能为空');
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'executing' && task.status !== 'changes_requested' && task.status !== 'awaiting_review') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 转 blocked`);
    return { ...task, status: 'blocked', executionStatus: 'terminal', nextOwner: 'none', blockedReason: input.reason.trim(), updatedAt: new Date().toISOString() };
  }});
}

export async function controllerMarkAccepted(input) {
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'awaiting_review' || !nonEmpty(task.candidateCommit)) fail('TASK_TRANSITION_INVALID', '只有有 candidateCommit 的 awaiting_review 可以 accepted');
    return { ...task, status: 'accepted', executionStatus: 'stopped', nextOwner: 'controller', reviewVerdict: 'accepted', updatedAt: new Date().toISOString() };
  }});
}

export async function controllerMarkIntegrated(input) {
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'accepted') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 转 integrated`);
    return { ...task, status: 'integrated', executionStatus: 'terminal', nextOwner: 'none', reviewVerdict: 'accepted', integrationStatus: 'integrated', updatedAt: new Date().toISOString() };
  }});
}

export async function controllerRecordTitleSynced(input) {
  if (!nonEmpty(input.title)) fail('CLI_INVALID_ARGUMENTS', 'synced title 不能为空');
  return mutateController({ ...input, mutate: (task) => {
    if (input.title !== task.desiredThreadTitle) fail('THREAD_TITLE_STALE', '确认的 title 与当前 lifecycle title 不一致');
    return { ...task, titleSyncStatus: 'synced', lastSyncedTitle: input.title, titleSyncError: null, updatedAt: new Date().toISOString() };
  }});
}

export async function controllerRecordTitleFailed(input) {
  if (!nonEmpty(input.title) || !nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'title 与失败原因不能为空');
  return mutateController({ ...input, mutate: (task) => {
    if (input.title !== task.desiredThreadTitle) fail('THREAD_TITLE_STALE', '失败的 title 已不是当前 lifecycle title');
    return { ...task, titleSyncStatus: 'failed', titleSyncError: input.reason.trim(), updatedAt: new Date().toISOString() };
  }});
}

export async function controllerRecordArchiveSucceeded(input) {
  return mutateController({ ...input, mutate: (task, registry) => {
    if (!isTerminalTask(task)) fail('TASK_TRANSITION_INVALID', '只有 integrated、blocked 或 reclaimed 任务可以归档');
    if (task.titleSyncStatus !== 'synced') fail('THREAD_ARCHIVE_NOT_READY', '终态 title 尚未同步');
    if (!descendantsOf(registry.tasks, task.threadId).every((descendant) => descendant.archiveStatus === 'archived')) fail('THREAD_ARCHIVE_NOT_READY', '必须先归档所有可见后代任务');
    return { ...task, archiveStatus: 'archived', archivedAt: new Date().toISOString(), archiveError: null, updatedAt: new Date().toISOString() };
  }});
}

export async function controllerRecordArchiveFailed(input) {
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'archive 失败原因不能为空');
  return mutateController({ ...input, mutate: (task) => {
    if (!isTerminalTask(task)) fail('TASK_TRANSITION_INVALID', '只有 integrated、blocked 或 reclaimed 任务可以记录 archive 失败');
    return { ...task, archiveStatus: 'failed', archivedAt: null, archiveError: input.reason.trim(), updatedAt: new Date().toISOString() };
  }});
}

async function writeChildArtifact(paths, threadId, prefix, value) {
  assertSafeThreadId(threadId);
  const dir = join(paths.eventsDir, threadId);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${prefix}-${Date.now()}-${randomUUID()}.json`);
  const handle = await open(filePath, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
  return filePath;
}

export async function querySelf(input) {
  const home = resolveTaskControlHome(input);
  return findSelf(home, input.selfThreadId);
}

export async function queryParent(input) {
  const result = await querySelf(input);
  return result.task.parentThreadId;
}

export function buildCompletionNotification(task) {
  const identity = nonEmpty(task.displayKey) ? `${task.displayKey} ${task.title}` : task.threadId;
  return `任务已完成，等待主控审查。任务：${identity}`;
}

export async function createCompletionEvent(input) {
  const result = await querySelf(input);
  if (!dispatchAllowed(result.task)) fail('TASK_DISPATCH_NOT_AUTHORIZED', 'thread title 尚未同步，任务不得开始或提交 completion');
  if (input.status !== undefined && input.status !== 'awaiting_review') fail('CHILD_STATUS_FORBIDDEN', '子任务只能提交 awaiting_review');
  if (!nonEmpty(input.candidateCommit)) fail('CLI_INVALID_ARGUMENTS', 'candidateCommit 不能为空');
  return writeChildArtifact(result.paths, result.task.threadId, 'completion', { schemaVersion: 1, type: 'task_completed', projectKey: result.registry.projectKey, threadId: result.task.threadId, parentThreadId: result.task.parentThreadId, controllerThreadId: result.task.directControllerThreadId, displayKey: result.task.displayKey, title: result.task.title, desiredThreadTitle: result.task.desiredThreadTitle, status: 'awaiting_review', candidateCommit: input.candidateCommit, createdAt: new Date().toISOString() });
}

export async function createNotificationFailureReceipt(input) {
  const result = await querySelf(input);
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', '通知失败原因不能为空');
  return writeChildArtifact(result.paths, result.task.threadId, 'notification-failed', { schemaVersion: 1, type: 'notification_failed', projectKey: result.registry.projectKey, threadId: result.task.threadId, parentThreadId: result.task.parentThreadId, controllerThreadId: result.task.directControllerThreadId, reason: input.reason.trim(), createdAt: new Date().toISOString() });
}

function adapterReferencePath(projectRoot, reference) {
  return win32.isAbsolute(reference) ? reference : win32.join(projectRoot.replaceAll('/', '\\'), reference);
}

export async function loadProjectAdapter(adapterPath) {
  const value = await readJson(adapterPath, 'ADAPTER_INVALID');
  const allowed = new Set(['projectRoot', 'rulesSources', 'workflowSources', 'projectPolicySources', 'nativeAdapter']);
  const projectPolicySources = value?.projectPolicySources ?? [];
  if (!isObject(value) || Object.keys(value).some((key) => !allowed.has(key)) || !nonEmpty(value.projectRoot) || !Array.isArray(value.rulesSources) || value.rulesSources.length === 0 || !Array.isArray(value.workflowSources) || !Array.isArray(projectPolicySources) || (value.nativeAdapter !== undefined && !nonEmpty(value.nativeAdapter))) fail('ADAPTER_INVALID', '项目适配器必须是引用-only 结构');
  if (![...value.rulesSources, ...value.workflowSources, ...projectPolicySources].every(nonEmpty)) fail('ADAPTER_INVALID', '适配器引用必须是非空字符串');
  if (value.nativeAdapter !== undefined) {
    try {
      await access(adapterReferencePath(value.projectRoot, value.nativeAdapter));
    } catch (error) {
      fail('ADAPTER_INVALID', `nativeAdapter 不存在: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ...value };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function required(args, name) {
  const value = option(args, name);
  if (!nonEmpty(value) || value.startsWith('--')) fail('CLI_INVALID_ARGUMENTS', `缺少参数 ${name}`);
  return value;
}

function storageOptions(args) {
  const codexHome = option(args, '--codex-home');
  const taskControlHome = option(args, '--task-control-home');
  if (nonEmpty(codexHome) && nonEmpty(taskControlHome)) fail('CLI_INVALID_ARGUMENTS', '--codex-home 与 --task-control-home 不能同时使用');
  return { codexHome, taskControlHome };
}

function controllerInput(args) {
  return { ...storageOptions(args), projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), threadId: required(args, '--thread') };
}

export async function runCli(args = process.argv.slice(2)) {
  const command = args[0];
  const storage = storageOptions(args);
  let result;
  if (command === 'query-parent') result = await queryParent({ ...storage, selfThreadId: required(args, '--self') });
  else if (command === 'audit-controller-routing') result = auditControllerRouting({ model: required(args, '--model'), thinking: required(args, '--thinking'), controllerWorkClass: required(args, '--work-class'), escalationTrigger: option(args, '--escalation-trigger'), escalationReason: option(args, '--reason'), maxAuthority: option(args, '--max-authority') });
  else if (command === 'audit-model-routing') result = await auditModelRouting(storage);
  else if (command === 'audit-thinking-routing') result = await auditThinkingRouting(storage);
  else if (command === 'audit-archive-backlog') result = await auditArchiveBacklog(storage);
  else if (command === 'query-self') {
    const task = (await querySelf({ ...storage, selfThreadId: required(args, '--self') })).task;
    result = { ...task, dispatchAllowed: dispatchAllowed(task) };
  }
  else if (command === 'complete') {
    const selfThreadId = required(args, '--self');
    const eventPath = await createCompletionEvent({ ...storage, selfThreadId, candidateCommit: required(args, '--candidate-commit'), status: option(args, '--status') });
    const task = (await querySelf({ ...storage, selfThreadId })).task;
    result = { eventPath, parentThreadId: task.parentThreadId, notificationText: buildCompletionNotification(task), notificationRequired: true, notificationFailureRequiredOnSendError: true };
  }
  else if (command === 'notification-failed') result = await createNotificationFailureReceipt({ ...storage, selfThreadId: required(args, '--self'), reason: required(args, '--reason') });
  else if (command === 'register') result = await controllerRegisterTask({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), threadId: required(args, '--thread'), parentThreadId: required(args, '--parent'), title: required(args, '--title'), model: required(args, '--model'), thinking: required(args, '--thinking'), delegationMode: required(args, '--delegation'), executionSurface: required(args, '--execution-surface'), modelClass: required(args, '--model-class'), quotaReason: required(args, '--quota-reason'), workClass: required(args, '--work-class'), decisionStatus: required(args, '--decision-status'), scope: required(args, '--scope'), acceptance: required(args, '--acceptance'), forbiddenDecisions: required(args, '--forbidden-decisions') });
  else if (command === 'controller-ingest-completion') result = await controllerIngestCompletion({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), eventPath: required(args, '--event') });
  else if (command === 'controller-ingest-notification-failed') result = await controllerIngestNotificationFailed({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), receiptPath: required(args, '--receipt') });
  else if (command === 'controller-scan-events') result = await controllerScanPendingEvents({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller') });
  else if (command === 'controller-mark-notification-sent') result = await controllerMarkNotificationSent({ ...controllerInput(args) });
  else if (command === 'mark-changes-requested') result = await controllerMarkChangesRequested({ ...controllerInput(args), failureClass: required(args, '--failure-class'), reason: required(args, '--reason') });
  else if (command === 'controller-dispatch-rework') result = await controllerDispatchRework({ ...controllerInput(args) });
  else if (command === 'controller-reclaim') result = await controllerReclaimTask({ ...controllerInput(args), reason: required(args, '--reason') });
  else if (command === 'mark-blocked') result = await controllerMarkBlocked({ ...controllerInput(args), reason: required(args, '--reason') });
  else if (command === 'mark-accepted') result = await controllerMarkAccepted({ ...controllerInput(args) });
  else if (command === 'mark-integrated') result = await controllerMarkIntegrated({ ...controllerInput(args) });
  else if (command === 'controller-record-title-synced') result = await controllerRecordTitleSynced({ ...controllerInput(args), title: required(args, '--title') });
  else if (command === 'controller-record-title-failed') result = await controllerRecordTitleFailed({ ...controllerInput(args), title: required(args, '--title'), reason: required(args, '--reason') });
  else if (command === 'controller-record-archive-succeeded') result = await controllerRecordArchiveSucceeded({ ...controllerInput(args) });
  else if (command === 'controller-record-archive-failed') result = await controllerRecordArchiveFailed({ ...controllerInput(args), reason: required(args, '--reason') });
  else if (command === 'adapter') result = await loadProjectAdapter(required(args, '--file'));
  else fail('CLI_INVALID_ARGUMENTS', `未知命令: ${command || '(empty)'}`);
  process.stdout.write(`${typeof result === 'string' ? result : JSON.stringify(result)}\n`);
}

const invokedFile = process.argv[1] && basename(fileURLToPath(import.meta.url)).toLowerCase() === basename(process.argv[1]).toLowerCase();
if (invokedFile) runCli().catch((error) => {
  const prefix = error instanceof TaskControlError ? `[${error.code}] ` : '';
  process.stderr.write(`${prefix}${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
