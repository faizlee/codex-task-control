import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, mkdir, open, readFile, rename, rm } from 'node:fs/promises';

export const TASK_STATUSES = Object.freeze(['executing', 'awaiting_review', 'changes_requested', 'accepted', 'integrated', 'blocked']);
export const REVIEW_VERDICTS = Object.freeze(['pending', 'changes_requested', 'accepted']);
export const INTEGRATION_STATUSES = Object.freeze(['not_integrated', 'integrated']);
export const NOTIFICATION_STATUSES = Object.freeze(['pending', 'sent', 'failed']);
export const THINKING_LEVELS = Object.freeze(['low', 'medium', 'high']);

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
    const current = taskOrThrow(registry, threadId);
    assertTaskController(current, controllerThreadId);
    const nextTask = mutate(current);
    const next = validateRegistry({ ...registry, updatedAt: new Date().toISOString(), tasks: registry.tasks.map((task) => task.threadId === threadId ? nextTask : task) }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return nextTask;
  });
}

export async function controllerRegisterTask(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot, input.controllerThreadId);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  assertSafeThreadId(input.threadId);
  assertSafeThreadId(input.parentThreadId, 'parentThreadId');
  if (![input.title, input.model, input.thinking].every(nonEmpty)) fail('CLI_INVALID_ARGUMENTS', 'register 字段不能为空');
  if (!has(input.thinking, THINKING_LEVELS)) fail('CLI_INVALID_ARGUMENTS', `thinking 非法: ${input.thinking}`);
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    if (registry.tasks.some((task) => task.threadId === input.threadId)) fail('DUPLICATE_THREAD', `重复 threadId: ${input.threadId}`);
    if (input.threadId === input.controllerThreadId) fail('DUPLICATE_THREAD', '任务不能等于 direct controller');
    let rootControllers = [...registry.rootControllerThreadIds];
    const parent = registry.tasks.find((task) => task.threadId === input.parentThreadId);
    if (parent) {
      if (parent.threadId !== input.controllerThreadId) fail('CONTROLLER_UNAUTHORIZED', 'nested child 的 controller 必须等于已登记 parent task.threadId');
    } else {
      if (input.parentThreadId !== input.controllerThreadId) fail('PARENT_NOT_REGISTERED', `父任务未登记: ${input.parentThreadId}`);
      if (!rootControllers.includes(input.controllerThreadId)) rootControllers.push(input.controllerThreadId);
    }
    const task = { threadId: input.threadId, parentThreadId: input.parentThreadId, directControllerThreadId: input.controllerThreadId, title: input.title, model: input.model, thinking: input.thinking, status: 'executing', candidateCommit: null, reviewVerdict: 'pending', integrationStatus: 'not_integrated', notificationStatus: 'pending', updatedAt: new Date().toISOString() };
    const next = validateRegistry({ ...registry, rootControllerThreadIds: rootControllers, updatedAt: new Date().toISOString(), tasks: [...registry.tasks, task] }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return task;
  });
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
    if (task.status !== 'executing' && task.status !== 'changes_requested') fail('EVENT_STALE', `不能从 ${task.status} 入账 completion event`);
    if (task.status === 'changes_requested' && task.candidateCommit === event.candidateCommit) fail('EVENT_STALE', '返工必须产生新 candidateCommit');
    return { ...task, status: 'awaiting_review', candidateCommit: event.candidateCommit, reviewVerdict: 'pending', integrationStatus: 'not_integrated', notificationStatus: 'pending', updatedAt: new Date().toISOString() };
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
    if (Date.parse(receipt.createdAt) <= Date.parse(task.updatedAt)) fail('NOTIFICATION_RECEIPT_STALE', 'notification_failed 回执过期或重复');
    if (task.notificationStatus !== 'pending') fail('NOTIFICATION_ALREADY_RECORDED', `notificationStatus 已是 ${task.notificationStatus}`);
    return { ...task, notificationStatus: 'failed', updatedAt: new Date().toISOString() };
  }});
}

export async function controllerMarkChangesRequested(input) {
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'executing' && task.status !== 'awaiting_review') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 转 changes_requested`);
    return { ...task, status: 'changes_requested', reviewVerdict: 'changes_requested', updatedAt: new Date().toISOString() };
  }});
}

export async function controllerMarkAccepted(input) {
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'awaiting_review' || !nonEmpty(task.candidateCommit)) fail('TASK_TRANSITION_INVALID', '只有有 candidateCommit 的 awaiting_review 可以 accepted');
    return { ...task, status: 'accepted', reviewVerdict: 'accepted', updatedAt: new Date().toISOString() };
  }});
}

export async function controllerMarkIntegrated(input) {
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'accepted') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 转 integrated`);
    return { ...task, status: 'integrated', reviewVerdict: 'accepted', integrationStatus: 'integrated', updatedAt: new Date().toISOString() };
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
  return `Task completed and awaiting controller review. Task ID: ${task.threadId}`;
}

export async function createCompletionEvent(input) {
  const result = await querySelf(input);
  if (input.status !== undefined && input.status !== 'awaiting_review') fail('CHILD_STATUS_FORBIDDEN', '子任务只能提交 awaiting_review');
  if (!nonEmpty(input.candidateCommit)) fail('CLI_INVALID_ARGUMENTS', 'candidateCommit 不能为空');
  return writeChildArtifact(result.paths, result.task.threadId, 'completion', { schemaVersion: 1, type: 'task_completed', projectKey: result.registry.projectKey, threadId: result.task.threadId, parentThreadId: result.task.parentThreadId, controllerThreadId: result.task.directControllerThreadId, title: result.task.title, status: 'awaiting_review', candidateCommit: input.candidateCommit, createdAt: new Date().toISOString() });
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
  const allowed = new Set(['projectRoot', 'rulesSources', 'workflowSources', 'modelRoutingSource', 'nativeAdapter']);
  if (!isObject(value) || Object.keys(value).some((key) => !allowed.has(key)) || !nonEmpty(value.projectRoot) || !Array.isArray(value.rulesSources) || !Array.isArray(value.workflowSources) || !nonEmpty(value.modelRoutingSource) || (value.nativeAdapter !== undefined && !nonEmpty(value.nativeAdapter))) fail('ADAPTER_INVALID', '项目适配器必须是引用-only 结构');
  if (![...value.rulesSources, ...value.workflowSources].every(nonEmpty)) fail('ADAPTER_INVALID', '适配器引用必须是非空字符串');
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
  else if (command === 'query-self') result = (await querySelf({ ...storage, selfThreadId: required(args, '--self') })).task;
  else if (command === 'complete') result = await createCompletionEvent({ ...storage, selfThreadId: required(args, '--self'), candidateCommit: required(args, '--candidate-commit'), status: option(args, '--status') });
  else if (command === 'notification-failed') result = await createNotificationFailureReceipt({ ...storage, selfThreadId: required(args, '--self'), reason: required(args, '--reason') });
  else if (command === 'register') result = await controllerRegisterTask({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), threadId: required(args, '--thread'), parentThreadId: required(args, '--parent'), title: required(args, '--title'), model: required(args, '--model'), thinking: required(args, '--thinking') });
  else if (command === 'controller-ingest-completion') result = await controllerIngestCompletion({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), eventPath: required(args, '--event') });
  else if (command === 'controller-ingest-notification-failed') result = await controllerIngestNotificationFailed({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), receiptPath: required(args, '--receipt') });
  else if (command === 'controller-mark-notification-sent') result = await controllerMarkNotificationSent({ ...controllerInput(args) });
  else if (command === 'mark-changes-requested') result = await controllerMarkChangesRequested({ ...controllerInput(args) });
  else if (command === 'mark-accepted') result = await controllerMarkAccepted({ ...controllerInput(args) });
  else if (command === 'mark-integrated') result = await controllerMarkIntegrated({ ...controllerInput(args) });
  else if (command === 'adapter') result = await loadProjectAdapter(required(args, '--file'));
  else fail('CLI_INVALID_ARGUMENTS', `未知命令: ${command || '(empty)'}`);
  process.stdout.write(`${typeof result === 'string' ? result : JSON.stringify(result)}\n`);
}

const invokedFile = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedFile) runCli().catch((error) => {
  const prefix = error instanceof TaskControlError ? `[${error.code}] ` : '';
  process.stderr.write(`${prefix}${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
