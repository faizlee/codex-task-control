import { createHash, randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, join, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { access, mkdir, open, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';

export const TASK_STATUSES = Object.freeze(['executing', 'awaiting_review', 'changes_requested', 'accepted', 'integrated', 'blocked', 'reclaimed']);
export const REVIEW_VERDICTS = Object.freeze(['pending', 'changes_requested', 'accepted']);
export const INTEGRATION_STATUSES = Object.freeze(['not_integrated', 'integrated']);
export const NOTIFICATION_STATUSES = Object.freeze(['pending', 'observed', 'sent', 'failed']);
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
export const FAILURE_DOMAINS = Object.freeze(['tooling', 'environment', 'contract', 'test', 'implementation']);
export const FAILURE_EVENT_TYPES = Object.freeze(['task_failed', 'task_blocked']);
export const FAILURE_AUTHORITIES = Object.freeze(['contract_evidence', 'worker_evidence', 'non_authoritative_diagnostic']);
export const EVIDENCE_FAILURE_MODES = Object.freeze(['blocking', 'recoverable', 'advisory']);
export const EVIDENCE_CLASSES = Object.freeze(['business', 'execution', 'observability']);
export const OBJECTIVE_FUSE_REPLACEMENT_LIMIT = 2;
export const DEFAULT_OBJECTIVE_BUDGET_MINUTES = 120;
export const OBJECTIVE_PROTOCOL_VERSION = 1;
export const CONTEXT_HEALTH_STATUSES = Object.freeze(['healthy', 'warning', 'checkpoint_recommended', 'handoff_recommended', 'handoff_required']);
export const CONTEXT_HEALTH_RECEIPT_V2_STATUSES = Object.freeze(['healthy', 'checkpoint_recommended', 'handoff_recommended']);
export const CHECKPOINT_PROTOCOL_VERSION = 1;
export const CHECKPOINT_POINT_KINDS = Object.freeze(['objective', 'current_state', 'confirmed_decision', 'accepted_result', 'blocker', 'rejected_path', 'open_question', 'next_gate', 'source_index']);
export const CHECKPOINT_AUTHORITIES = Object.freeze(['user_confirmed', 'project_fact', 'controller_decision', 'accepted_result', 'candidate', 'failure_evidence', 'unverified', 'superseded']);
export const CHECKPOINT_PRELOAD_POLICIES = Object.freeze(['always', 'on_demand', 'dispute_only', 'never']);
export const CHECKPOINT_SOURCE_TYPES = Object.freeze(['file', 'thread', 'task', 'report', 'event', 'uri']);
export const CHECKPOINT_ALWAYS_AUTHORITIES = Object.freeze(['user_confirmed', 'project_fact', 'controller_decision', 'accepted_result']);
export const PARENT_CONTEXT_PROTOCOL_VERSION = 1;
export const PARENT_CONTEXT_MODES = Object.freeze(['preload']);
export const PARENT_CONTEXT_INITIAL_TURN_LIMIT = 3;
export const HANDOFF_PROTOCOL_VERSION = 1;
export const HANDOFF_STATUSES = Object.freeze(['prepared', 'accepted', 'cancelled']);
export const DIAGNOSTIC_CLASSIFICATIONS = Object.freeze(['technical_debt', 'milestone_blocker']);
export const BLOCKER_SOURCES = Object.freeze(['diagnostic', 'external', 'contract', 'superseded']);
export const HEARTBEAT_STATUSES = Object.freeze(['armed', 'cancelled']);
export const HEARTBEAT_REASONS = Object.freeze(['dispatch', 'progress', 'failure', 'completion', 'finalize', 'reconcile']);
export const HEARTBEAT_ACTION_TYPES = Object.freeze(['create_controller_heartbeat', 'delete_controller_heartbeat', 'finalize_controller_cycle']);
export const HEARTBEAT_NOTIFICATION_STATUSES = Object.freeze(['not_required', 'pending', 'sent', 'failed']);
export const HEARTBEAT_PROTOCOL_VERSION = 3;
export const HEARTBEAT_ACTION_TIMEOUT_MS = 30 * 1000;
export const HEARTBEAT_STALE_LIMIT = 2;
export const HEARTBEAT_DELETE_FAILURE_LIMIT = 2;
export const HEARTBEAT_NO_PROGRESS_LIMIT = 2;
export const HEARTBEAT_MAX_OCCURRENCES = 1;
export const CONTROLLER_TASK_HEALTH_PROTOCOL_VERSION = 1;
export const CONTROLLER_TASK_HEALTH_STATUSES = Object.freeze(['idle', 'healthy', 'at_risk', 'stalled', 'blocked_controller', 'blocked_user', 'runaway']);
export const CONTROLLER_MESSAGE_PROTOCOL_VERSION = 1;
export const CONTROLLER_MESSAGE_KINDS = Object.freeze(['follow_up', 'clarification', 'evidence_request', 'notification', 'stop', 'cancel']);
export const CONTROLLER_MESSAGE_DELIVERY_MODES = Object.freeze(['queue', 'interrupt']);
export const CONTROLLER_MESSAGE_TARGET_STATES = Object.freeze(['running', 'idle', 'unknown']);
export const CONTROLLER_MESSAGE_STATUSES = Object.freeze(['deferred_local', 'prepared', 'delivered', 'failed', 'cancelled']);
export const CONTROLLER_MESSAGE_INTERRUPT_AUTHORITIES = Object.freeze(['user_explicit', 'controller_safety']);
export const CONTROLLER_MESSAGE_MAX_LENGTH = 4000;
export const CONTROLLER_MESSAGE_ACTION_TIMEOUT_MS = 30 * 1000;
export const PARENT_NOTIFICATION_PROTOCOL_VERSION = 1;
export const PARENT_NOTIFICATION_TARGET_STATES = Object.freeze(['running', 'idle', 'unknown']);
export const PARENT_NOTIFICATION_DISPOSITIONS = Object.freeze(['deferred_parent', 'prepared']);
export const USER_AGENTS_POLICY_VERSION = 2;
export const USER_AGENTS_POLICY_START = '<!-- codex-task-control:parent-notification-policy:start -->';
export const USER_AGENTS_POLICY_END = '<!-- codex-task-control:parent-notification-policy:end -->';
export const USER_AGENTS_PARENT_NOTIFICATION_RULE = '- 子任务执行 `progress`、`complete` 或 `report-failure` 时必须先生成持久事件，再依据直接父任务的真实 turn 状态处理通知：父任务为 `running` 或 `unknown` 时必须保持 `deferred_parent`，不得调用 `send_message_to_thread`；只有确认父任务 `idle` 且命令返回 `send_thread_message` 动作时才可发送，并记录真实回执。延迟通知由父任务的 heartbeat / `controller-scan-events` 摄取并标记 `observed`，不得冒充 `sent`；只有真实发送成功才能标记 `sent`，发送失败才生成 `notification_failed`。普通完成、失败、阻塞和进度通知都不得中断父任务。';
export const USER_AGENTS_ADAPTIVE_HEALTH_RULE = '- 每个直接主控只维护一个 `COUNT=1` 临时 heartbeat，并在同一次 `controller-scan-events` 中完成事件扫描和到期的任务健康复查，禁止再建第二套健康定时器。默认单任务 15 分钟，并发批次 10 分钟，Terra high 长任务 25 分钟，风险、失败、待审或待主控裁决状态 5 分钟；真实 progress、failure 或 completion 从事件时间重新排下一次 one-shot。健康复查只把新阶段、证据、测试结果、候选提交、完成/失败事件或阻塞范围缩小视为有效进展；重复命令、改写同一错误或“仍在处理”不得续租。无活跃、待审、路由或可执行动作时立即删除 heartbeat；等待用户决定时只通知一次并暂停，不得维持空心跳。';
export const USER_AGENTS_PARENT_NOTIFICATION_BLOCK = `${USER_AGENTS_POLICY_START}\n${USER_AGENTS_PARENT_NOTIFICATION_RULE}\n${USER_AGENTS_ADAPTIVE_HEALTH_RULE}\n${USER_AGENTS_POLICY_END}`;
export const LEGACY_USER_AGENTS_PARENT_NOTIFICATION_RULE = '- 子任务执行 `complete` 后必须使用命令返回的 `parentThreadId` 和 `notificationText` 真实发送短通知；发送失败必须生成 notification_failed。只有真实消息发送成功后，主控才可标记 notificationStatus=sent。';
export const PARALLEL_BATCH_PROTOCOL_VERSION = 1;
export const PARALLEL_BATCH_STATUSES = Object.freeze(['planned', 'dispatching', 'running', 'reconciling', 'frozen', 'closed']);
export const PARALLEL_LANES = Object.freeze(['implementation', 'qa', 'no_code', 'readonly']);
export const PARALLEL_DISPATCH_AUTHORITIES = Object.freeze(['user_explicit', 'controller_resolved']);
export const PARALLEL_DEGRADATION_REASONS = Object.freeze(['insufficient_independent_candidates', 'unresolved_dependencies', 'conflict_domain_saturated', 'review_capacity_exhausted', 'user_serial_constraint', 'safety_gate', 'context_handoff', 'no_code_candidate_not_valuable']);
export const PARALLEL_CANDIDATE_STATES = Object.freeze(['proposed', 'deferred', 'eligible', 'registered', 'dispatching', 'running', 'awaiting_review', 'changes_requested', 'accepted', 'integrated', 'reclaimed', 'blocked']);
export const PARALLEL_POLICY_MODES = Object.freeze(['legacy_compat', 'batch_v1']);
export const THREAD_ACTION_TYPES = Object.freeze(['set_thread_title', 'set_thread_archived']);
export const THREAD_ACTION_OUTCOMES = Object.freeze(['succeeded', 'failed', 'retry_requested']);
export const TASK_MODES = Object.freeze(['legacy_unclassified', 'control_only', 'implementation', 'visual_implementation']);
export const TASK_CONTROL_VERSION = '0.22.0';
export const REGISTER_TASK_MODES = Object.freeze(['control_only', 'implementation', 'visual_implementation']);
export const IMPLEMENTATION_POLICIES = Object.freeze(['adaptive_brief', 'hard_contract']);
export const SCOPE_POLICIES = Object.freeze(['bounded_incidental', 'strict_scope']);
export const INCIDENTAL_REPAIR_PROTOCOL_VERSION = 1;
export const INCIDENTAL_REPAIR_RISK_FLAGS = Object.freeze(['productRuleDecision', 'architectureDecision', 'trustSourceDecision', 'safetyDecision', 'economyDecision', 'saveDataDecision', 'externalEffect', 'irreversibleMigration', 'dependencyDecision', 'forbiddenDecisionTouched']);
export const CONTROL_PLANE_RECOVERY_PROTOCOL_VERSION = 1;
export const CONTROL_PLANE_RECOVERY_STATUSES = Object.freeze(['completion_only', 'completed', 'cancelled']);
export const CONTROL_PLANE_RECOVERY_COMPONENTS = Object.freeze(['task_control_protocol']);
export const HARD_CONTRACT_TRIGGERS = Object.freeze(['high_risk_irreversible', 'shared_conflict', 'parallel_coordination', 'user_explicit']);
export const IMPLEMENTATION_BRIEF_SCHEMA_VERSION = 1;
export const IMPLEMENTATION_CONTRACT_SCHEMA_VERSION = 3;
export const IMPLEMENTATION_CONTRACT_SCHEMA_VERSIONS = Object.freeze([1, 2, 3]);
export const VALIDATION_ENVIRONMENTS = Object.freeze(['any', 'headless', 'gui', 'mcp', 'interactive']);
export const RESULT_MANIFEST_SCHEMA_VERSION = 2;
export const RESULT_MANIFEST_SCHEMA_VERSIONS = Object.freeze([1, 2]);
export const RESULT_PROTOCOL_VERSION = 2;
export const RESULT_PROTOCOL_VERSIONS = Object.freeze([0, 1, 2]);
export const RESULT_FILE_CHANGE_TYPES = Object.freeze(['added', 'modified', 'deleted', 'generated']);
export const RESULT_ARTIFACT_TYPES = Object.freeze(['screenshot', 'reference', 'contact_sheet', 'log', 'test_summary', 'report']);
export const RESULT_ARTIFACT_MILESTONES = Object.freeze(['reference', 'before', 'intermediate', 'after', 'current', 'failure', 'other']);
export const RESULT_WORKSPACE_ROLES = Object.freeze(['candidate_worktree', 'project_main', 'external_reference', 'task_control']);
export const RESULT_TEST_STATUSES = Object.freeze(['passed', 'failed', 'partial', 'not_run']);
export const RESULT_REVIEW_STATUSES = Object.freeze(['pending', 'accepted', 'rejected']);
export const DELIVERY_STATUSES = Object.freeze(['candidate', 'accepted_not_integrated', 'integrated', 'rejected']);
export const OBSERVABILITY_PROTOCOL_VERSION = 1;
export const OBSERVABILITY_MODES = Object.freeze(['lean', 'diagnostic']);
export const OBSERVABILITY_PHASES = Object.freeze(['registered', 'dispatch_confirmed', 'progress_ingested', 'incidental_repair_ingested', 'failure_ingested', 'failure_diagnostic_ingested', 'completion_ingested', 'changes_requested', 'control_plane_candidate_recovered', 'rework_prepared', 'rework_dispatched', 'rework_cancelled', 'contract_amended', 'reclaimed', 'blocked', 'review_accepted', 'integrated', 'archived']);
export const OBSERVABILITY_CONFIDENCE = Object.freeze(['direct', 'bounded', 'unavailable']);
export const INTEGRATION_PROOF_PROTOCOL_VERSION = 1;
const OBSERVABILITY_CLOCK_ID = `task-control-${process.pid}-${randomUUID().replaceAll('-', '')}`;
const execFile = promisify(execFileCallback);
export const HEARTBEAT_INTERVALS_MS = Object.freeze({
  normal_single: 15 * 60 * 1000,
  parallel_batch: 10 * 60 * 1000,
  bounded_reasoning_high: 25 * 60 * 1000,
  controller_risk: 5 * 60 * 1000,
});

export class TaskControlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TaskControlError';
    this.code = code;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isTimestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const latestTimestamp = (...values) => values.filter(isTimestamp).sort((left, right) => Date.parse(right) - Date.parse(left))[0];
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

function resolveCodexHomeForUserPolicy(input = {}) {
  if (nonEmpty(input.taskControlHome)) fail('CLI_INVALID_ARGUMENTS', '用户级 AGENTS 策略审计必须使用 codexHome，不能从 taskControlHome 推断');
  return nonEmpty(input.codexHome) ? input.codexHome : (process.env.CODEX_HOME || join(homedir(), '.codex'));
}

function normalizedPolicyText(value) {
  return value.replaceAll('\r\n', '\n');
}

function occurrenceCount(value, fragment) {
  return value.split(fragment).length - 1;
}

export async function auditUserAgentsPolicy(input = {}) {
  const codexHome = resolveCodexHomeForUserPolicy(input);
  const agentsPath = join(codexHome, 'AGENTS.md');
  let raw;
  try {
    raw = await readFile(agentsPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { compliant: false, policyVersion: USER_AGENTS_POLICY_VERSION, agentsPath, reason: 'agents_file_missing', legacyConflict: false, managedBlockPresent: false, canSyncSafely: false };
    }
    fail('AGENTS_POLICY_READ_FAILED', `无法读取用户级 AGENTS.md: ${error instanceof Error ? error.message : String(error)}`);
  }
  const normalized = normalizedPolicyText(raw);
  const startCount = occurrenceCount(normalized, USER_AGENTS_POLICY_START);
  const endCount = occurrenceCount(normalized, USER_AGENTS_POLICY_END);
  const compliant = normalized.includes(USER_AGENTS_PARENT_NOTIFICATION_BLOCK) && startCount === 1 && endCount === 1;
  const legacyConflict = normalized.includes(LEGACY_USER_AGENTS_PARENT_NOTIFICATION_RULE);
  const managedBlockPresent = startCount > 0 || endCount > 0;
  const unmarkedCurrentRule = normalized.includes(USER_AGENTS_PARENT_NOTIFICATION_RULE) && !managedBlockPresent;
  let reason = 'compliant';
  if (!compliant) {
    if (legacyConflict) reason = 'legacy_direct_send_conflict';
    else if (startCount !== endCount || startCount > 1) reason = 'managed_block_invalid';
    else if (managedBlockPresent) reason = 'managed_block_drift';
    else if (unmarkedCurrentRule) reason = 'current_rule_unmanaged';
    else reason = 'required_policy_missing';
  }
  return {
    compliant,
    policyVersion: USER_AGENTS_POLICY_VERSION,
    agentsPath,
    reason,
    legacyConflict,
    managedBlockPresent,
    canSyncSafely: compliant || legacyConflict || (startCount === 1 && endCount === 1) || unmarkedCurrentRule,
    requiredDigest: createHash('sha256').update(USER_AGENTS_PARENT_NOTIFICATION_BLOCK, 'utf8').digest('hex'),
  };
}

export async function syncUserAgentsPolicy(input = {}) {
  if (input.authorization !== 'user_explicit_current_turn') fail('AGENTS_POLICY_SYNC_UNAUTHORIZED', '同步用户级 AGENTS.md 必须具有当前对话的用户明确授权');
  const audit = await auditUserAgentsPolicy(input);
  if (audit.compliant) return { ...audit, changed: false };
  if (!audit.canSyncSafely) fail('AGENTS_POLICY_SYNC_UNSAFE', `无法安全定位受管理规则，拒绝改写 AGENTS.md: ${audit.reason}`);
  const raw = await readFile(audit.agentsPath, 'utf8');
  const lineEnding = raw.includes('\r\n') ? '\r\n' : '\n';
  let normalized = normalizedPolicyText(raw);
  const startIndex = normalized.indexOf(USER_AGENTS_POLICY_START);
  const endIndex = normalized.indexOf(USER_AGENTS_POLICY_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    normalized = `${normalized.slice(0, startIndex)}${USER_AGENTS_PARENT_NOTIFICATION_BLOCK}${normalized.slice(endIndex + USER_AGENTS_POLICY_END.length)}`;
  } else if (normalized.includes(LEGACY_USER_AGENTS_PARENT_NOTIFICATION_RULE)) {
    normalized = normalized.replace(LEGACY_USER_AGENTS_PARENT_NOTIFICATION_RULE, USER_AGENTS_PARENT_NOTIFICATION_BLOCK);
  } else if (normalized.includes(USER_AGENTS_PARENT_NOTIFICATION_RULE)) {
    normalized = normalized.replace(USER_AGENTS_PARENT_NOTIFICATION_RULE, USER_AGENTS_PARENT_NOTIFICATION_BLOCK);
  } else {
    fail('AGENTS_POLICY_SYNC_UNSAFE', '受管理规则在同步前发生变化，拒绝改写 AGENTS.md');
  }
  await atomicWriteText(audit.agentsPath, normalized.replaceAll('\n', lineEnding));
  const verified = await auditUserAgentsPolicy(input);
  if (!verified.compliant) fail('AGENTS_POLICY_SYNC_FAILED', `AGENTS.md 同步后仍不一致: ${verified.reason}`);
  return { ...verified, changed: true };
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

function stringArray(value, field, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(nonEmpty)) fail('IMPLEMENTATION_CONTRACT_INVALID', `${field} 必须是${allowEmpty ? '' : '非空'}字符串数组`);
  return value.map((entry) => entry.trim());
}

const BASE_IMPLEMENTATION_GUARDRAILS = Object.freeze([
  '不得伪造、猜测或把缺失证据表述为已经验证。',
  '不得越过仍未解决的产品、安全、架构或数据边界决策。',
  '不得执行未经授权的发布、推送、外部消息、生产变更或其他外部影响。',
]);

function validateImplementationBriefManifest(value) {
  const allowed = new Set(['schemaVersion', 'objective', 'explorationHints', 'validationHints', 'safetyGuardrails', 'executorExploresBeforeEditing', 'executorChoosesImplementationPath', 'executorChoosesValidationMethods']);
  if (!isObject(value) || value.schemaVersion !== IMPLEMENTATION_BRIEF_SCHEMA_VERSION || Object.keys(value).some((key) => !allowed.has(key)) || !nonEmpty(value.objective)) {
    fail('IMPLEMENTATION_BRIEF_INVALID', `implementation brief 必须使用 schemaVersion=${IMPLEMENTATION_BRIEF_SCHEMA_VERSION}，包含 objective，且不得包含路径白名单、固定实现或唯一验证器字段`);
  }
  const explorationHints = stringArray(value.explorationHints ?? [], 'explorationHints');
  const validationHints = stringArray(value.validationHints ?? [], 'validationHints');
  const suppliedGuardrails = stringArray(value.safetyGuardrails ?? [], 'safetyGuardrails');
  return {
    schemaVersion: IMPLEMENTATION_BRIEF_SCHEMA_VERSION,
    objective: value.objective.trim(),
    explorationHints,
    validationHints,
    safetyGuardrails: [...new Set([...BASE_IMPLEMENTATION_GUARDRAILS, ...suppliedGuardrails])],
    executorExploresBeforeEditing: true,
    executorChoosesImplementationPath: true,
    executorChoosesValidationMethods: true,
  };
}

async function loadImplementationBrief(projectRoot, reference, input) {
  let implementationBriefPath = null;
  let brief;
  if (nonEmpty(reference)) {
    const root = win32.resolve(projectRoot.replaceAll('/', '\\'));
    implementationBriefPath = win32.resolve(root, reference.replaceAll('/', '\\'));
    const normalizedRoot = root.toLowerCase();
    const normalizedBrief = implementationBriefPath.toLowerCase();
    if (normalizedBrief !== normalizedRoot && !normalizedBrief.startsWith(`${normalizedRoot}\\`)) fail('IMPLEMENTATION_BRIEF_OUTSIDE_PROJECT', 'implementation brief 必须位于项目根目录内');
    brief = validateImplementationBriefManifest(await readJson(implementationBriefPath, 'IMPLEMENTATION_BRIEF_INVALID'));
  } else {
    brief = validateImplementationBriefManifest({
      schemaVersion: IMPLEMENTATION_BRIEF_SCHEMA_VERSION,
      objective: input.scope,
      explorationHints: ['先检查真实调用链、既有实现、项目规则和运行环境，再决定修改位置。'],
      validationHints: [input.acceptance],
      safetyGuardrails: [input.forbiddenDecisions],
    });
  }
  const normalized = JSON.stringify(brief);
  return {
    implementationBriefPath,
    briefSchemaVersion: IMPLEMENTATION_BRIEF_SCHEMA_VERSION,
    implementationBrief: brief,
    briefDigest: createHash('sha256').update(normalized, 'utf8').digest('hex'),
  };
}

function adaptiveResultRequirements(taskMode) {
  const visual = taskMode === 'visual_implementation';
  return {
    manifestSchemaVersion: RESULT_MANIFEST_SCHEMA_VERSION,
    allowedArtifactRoots: ['.'],
    requiredArtifactTypes: visual ? ['screenshot'] : [],
    requiredMilestones: visual ? ['after'] : [],
    presentationStageId: visual ? 'presentation' : null,
  };
}

function resolveImplementationContractPath(projectRoot, reference) {
  if (!nonEmpty(reference)) fail('IMPLEMENTATION_CONTRACT_REQUIRED', 'hard_contract 任务必须提供 implementationContractPath');
  const root = win32.resolve(projectRoot.replaceAll('/', '\\'));
  const resolved = win32.resolve(root, reference.replaceAll('/', '\\'));
  const normalizedRoot = root.toLowerCase();
  const normalizedResolved = resolved.toLowerCase();
  if (normalizedResolved !== normalizedRoot && !normalizedResolved.startsWith(`${normalizedRoot}\\`)) fail('IMPLEMENTATION_CONTRACT_OUTSIDE_PROJECT', 'implementationContractPath 必须位于项目根目录内');
  return resolved;
}

function validateImplementationContractManifest(value, taskMode, { requireResultRequirements = false, requireCurrentSchema = false } = {}) {
  if (!isObject(value) || !IMPLEMENTATION_CONTRACT_SCHEMA_VERSIONS.includes(value.schemaVersion)) fail('IMPLEMENTATION_CONTRACT_INVALID', `实施合同 schemaVersion 必须为 ${IMPLEMENTATION_CONTRACT_SCHEMA_VERSIONS.join(' 或 ')}`);
  if (requireCurrentSchema && value.schemaVersion !== IMPLEMENTATION_CONTRACT_SCHEMA_VERSION) fail('IMPLEMENTATION_CONTRACT_UPGRADE_REQUIRED', `新登记实施任务必须使用 schemaVersion=${IMPLEMENTATION_CONTRACT_SCHEMA_VERSION}`);
  const allowed = new Set(['schemaVersion', 'contractRevision', 'contractCommit', 'allowedWritePaths', 'reuseRequirements', 'forbiddenNewPaths', 'forbiddenReimplementations', 'stageGates', 'evidenceCommands', 'errorPolicy', 'validationPolicy', 'visualOracle', 'resultRequirements']);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail('IMPLEMENTATION_CONTRACT_INVALID', '实施合同包含未知字段');
  const contractRevision = nonEmpty(value.contractRevision) ? value.contractRevision.trim() : null;
  const contractCommit = nonEmpty(value.contractCommit) ? value.contractCommit.trim() : null;
  if (contractRevision === null && contractCommit === null) fail('IMPLEMENTATION_CONTRACT_VERSION_REQUIRED', '实施合同必须提供 contractRevision 或 contractCommit');
  const reuseRequirements = stringArray(value.reuseRequirements, 'reuseRequirements', { allowEmpty: false });
  const allowedWritePaths = value.schemaVersion === 2
    ? stringArray(value.allowedWritePaths, 'allowedWritePaths', { allowEmpty: false })
    : value.schemaVersion >= 3
      ? stringArray(value.allowedWritePaths ?? [], 'allowedWritePaths')
      : [];
  if (allowedWritePaths.some((path) => path.replaceAll('/', '\\').split('\\').includes('..'))) fail('IMPLEMENTATION_CONTRACT_INVALID', 'allowedWritePaths 不得包含 .. 路径段');
  const forbiddenNewPaths = stringArray(value.forbiddenNewPaths, 'forbiddenNewPaths');
  const forbiddenReimplementations = stringArray(value.forbiddenReimplementations, 'forbiddenReimplementations');
  if (!Array.isArray(value.evidenceCommands) || value.evidenceCommands.length === 0) fail('IMPLEMENTATION_CONTRACT_INVALID', 'evidenceCommands 必须是非空数组');
  const evidenceIds = new Set();
  const evidenceCommands = value.evidenceCommands.map((entry) => {
    if (!isObject(entry) || Object.keys(entry).some((key) => !['id', 'command', 'failureMode', 'evidenceClass', 'environment', 'cwd', 'timeoutMs', 'retryLimit'].includes(key)) || !nonEmpty(entry.id) || !nonEmpty(entry.command)) fail('IMPLEMENTATION_CONTRACT_INVALID', 'evidenceCommands 项只能包含非空 id、command 和可选分类/运行元数据');
    const id = entry.id.trim();
    if (!isSafeThreadId(id) || evidenceIds.has(id)) fail('IMPLEMENTATION_CONTRACT_INVALID', `evidence command id 无效或重复: ${id}`);
    const evidenceClass = entry.evidenceClass ?? null;
    if (evidenceClass !== null && !has(evidenceClass, EVIDENCE_CLASSES)) fail('IMPLEMENTATION_CONTRACT_INVALID', `evidence command ${id} evidenceClass 无效`);
    const failureMode = entry.failureMode ?? (evidenceClass === 'execution' ? 'recoverable' : evidenceClass === 'observability' ? 'advisory' : 'blocking');
    if (!has(failureMode, EVIDENCE_FAILURE_MODES)) fail('IMPLEMENTATION_CONTRACT_INVALID', `evidence command ${id} failureMode 必须为 ${EVIDENCE_FAILURE_MODES.join('、')}`);
    if (evidenceClass === 'execution' && failureMode !== 'recoverable') fail('IMPLEMENTATION_CONTRACT_INVALID', `execution evidence ${id} 必须使用 recoverable`);
    if (evidenceClass === 'observability' && failureMode !== 'advisory') fail('IMPLEMENTATION_CONTRACT_INVALID', `observability evidence ${id} 必须使用 advisory`);
    if (value.schemaVersion >= 3 && failureMode === 'blocking') fail('HARD_CONTRACT_SINGLE_VALIDATOR_FORBIDDEN', `hard contract evidence ${id} 不得单独 blocking；应使用 recoverable 并在替代证据路线穷尽后由主控裁决`);
    const environment = entry.environment ?? 'any';
    if (!has(environment, VALIDATION_ENVIRONMENTS)) fail('IMPLEMENTATION_CONTRACT_INVALID', `evidence command ${id} environment 无效`);
    const cwd = entry.cwd === undefined || entry.cwd === null ? null : (nonEmpty(entry.cwd) ? entry.cwd.trim() : fail('IMPLEMENTATION_CONTRACT_INVALID', `evidence command ${id} cwd 无效`));
    const timeoutMs = entry.timeoutMs === undefined || entry.timeoutMs === null ? null : (Number.isInteger(entry.timeoutMs) && entry.timeoutMs > 0 ? entry.timeoutMs : fail('IMPLEMENTATION_CONTRACT_INVALID', `evidence command ${id} timeoutMs 无效`));
    const retryLimit = entry.retryLimit === undefined || entry.retryLimit === null ? null : (Number.isInteger(entry.retryLimit) && entry.retryLimit >= 0 ? entry.retryLimit : fail('IMPLEMENTATION_CONTRACT_INVALID', `evidence command ${id} retryLimit 无效`));
    evidenceIds.add(id);
    return { id, command: entry.command.trim(), failureMode, evidenceClass, environment, cwd, timeoutMs, retryLimit };
  });
  const evidenceModes = new Map(evidenceCommands.map((entry) => [entry.id, entry.failureMode]));
  if (!Array.isArray(value.stageGates) || value.stageGates.length === 0) fail('IMPLEMENTATION_CONTRACT_INVALID', 'stageGates 必须是非空数组');
  const stageIds = new Set();
  const stageGates = value.stageGates.map((entry) => {
    if (!isObject(entry) || Object.keys(entry).some((key) => !['id', 'required', 'description', 'requiredEvidence'].includes(key)) || !nonEmpty(entry.id) || typeof entry.required !== 'boolean' || !nonEmpty(entry.description)) fail('IMPLEMENTATION_CONTRACT_INVALID', 'stageGates 项只能包含 id、required、description 和 requiredEvidence');
    const id = entry.id.trim();
    if (!isSafeThreadId(id) || stageIds.has(id)) fail('IMPLEMENTATION_CONTRACT_INVALID', `stage gate id 无效或重复: ${id}`);
    stageIds.add(id);
    const requiredEvidence = stringArray(entry.requiredEvidence, `stageGates.${id}.requiredEvidence`, { allowEmpty: false });
    if (requiredEvidence.some((evidenceId) => !evidenceIds.has(evidenceId))) fail('IMPLEMENTATION_CONTRACT_INVALID', `stage ${id} 引用了未登记 evidence command`);
    if (entry.required && requiredEvidence.some((evidenceId) => evidenceModes.get(evidenceId) === 'advisory')) fail('IMPLEMENTATION_CONTRACT_INVALID', `required stage ${id} 不得把 advisory evidence 作为完成门禁`);
    return { id, required: entry.required, description: entry.description.trim(), requiredEvidence };
  });
  if (!stageGates.some((entry) => entry.required)) fail('IMPLEMENTATION_CONTRACT_INVALID', 'stageGates 至少需要一个 required 阶段');
  if (!isObject(value.errorPolicy) || Object.keys(value.errorPolicy).some((key) => !['mode', 'rules'].includes(key)) || !nonEmpty(value.errorPolicy.mode)) fail('IMPLEMENTATION_CONTRACT_INVALID', 'errorPolicy 只能包含非空 mode 和 rules');
  const errorPolicy = { mode: value.errorPolicy.mode.trim(), rules: stringArray(value.errorPolicy.rules, 'errorPolicy.rules', { allowEmpty: false }) };
  let validationPolicy = null;
  if (value.schemaVersion >= 3) {
    const expected = ['executorMayChooseAdditionalEvidence', 'alternativeEvidenceAllowed', 'singleValidatorConclusive', 'guiEvidenceRequiresInteractiveSurface'];
    if (!isObject(value.validationPolicy) || Object.keys(value.validationPolicy).some((key) => !expected.includes(key)) || expected.some((key) => typeof value.validationPolicy[key] !== 'boolean')) fail('HARD_CONTRACT_VALIDATION_POLICY_REQUIRED', 'schema-v3 hard contract 必须提供完整 validationPolicy');
    validationPolicy = { ...value.validationPolicy };
    if (!validationPolicy.executorMayChooseAdditionalEvidence || !validationPolicy.alternativeEvidenceAllowed || validationPolicy.singleValidatorConclusive || !validationPolicy.guiEvidenceRequiresInteractiveSurface) fail('HARD_CONTRACT_VALIDATION_POLICY_INVALID', 'hard contract 必须允许执行者补充证据和替代证据，禁止单一 validator 定论，并要求 GUI 证据来自交互表面');
  }
  let visualOracle = null;
  if (taskMode === 'visual_implementation') {
    if (!isObject(value.visualOracle) || Object.keys(value.visualOracle).some((key) => !['stageId', 'reference', 'criteria'].includes(key)) || !nonEmpty(value.visualOracle.stageId) || !nonEmpty(value.visualOracle.reference)) fail('VISUAL_ORACLE_REQUIRED', 'visual_implementation 任务必须只提供 visualOracle.stageId、reference 和 criteria');
    const stageId = value.visualOracle.stageId.trim();
    if (!stageIds.has(stageId) || !stageGates.find((entry) => entry.id === stageId)?.required) fail('VISUAL_ORACLE_INVALID', 'visualOracle.stageId 必须指向 required stage gate');
    visualOracle = { stageId, reference: value.visualOracle.reference.trim(), criteria: stringArray(value.visualOracle.criteria, 'visualOracle.criteria', { allowEmpty: false }) };
    if (value.schemaVersion >= 3) {
      const visualGate = stageGates.find((entry) => entry.id === stageId);
      const visualEvidence = visualGate.requiredEvidence.map((id) => evidenceCommands.find((entry) => entry.id === id));
      if (visualEvidence.some((entry) => entry?.environment === 'headless') || !visualEvidence.some((entry) => ['gui', 'mcp', 'interactive'].includes(entry?.environment))) fail('HEADLESS_GUI_EVIDENCE_FORBIDDEN', '视觉 hard contract 的 presentation/截图证据必须来自 GUI、MCP 或 interactive 表面，headless 只能验证逻辑');
    }
  } else if (value.visualOracle !== undefined && value.visualOracle !== null) {
    if (!isObject(value.visualOracle) || Object.keys(value.visualOracle).some((key) => !['stageId', 'reference', 'criteria'].includes(key)) || !nonEmpty(value.visualOracle.stageId) || !nonEmpty(value.visualOracle.reference)) fail('VISUAL_ORACLE_INVALID', 'visualOracle 结构无效');
    const stageId = value.visualOracle.stageId.trim();
    if (!stageIds.has(stageId)) fail('VISUAL_ORACLE_INVALID', 'visualOracle.stageId 未登记');
    visualOracle = { stageId, reference: value.visualOracle.reference.trim(), criteria: stringArray(value.visualOracle.criteria, 'visualOracle.criteria', { allowEmpty: false }) };
  }
  let resultRequirements = null;
  if (value.resultRequirements !== undefined && value.resultRequirements !== null) {
    const resultAllowed = new Set(['manifestSchemaVersion', 'allowedArtifactRoots', 'requiredArtifactTypes', 'requiredMilestones', 'presentationStageId']);
    const expectedManifestSchemaVersion = value.schemaVersion >= 3 ? RESULT_MANIFEST_SCHEMA_VERSION : 1;
    if (!isObject(value.resultRequirements) || Object.keys(value.resultRequirements).some((key) => !resultAllowed.has(key)) || value.resultRequirements.manifestSchemaVersion !== expectedManifestSchemaVersion) fail('RESULT_REQUIREMENTS_INVALID', `resultRequirements 必须使用 manifestSchemaVersion=${expectedManifestSchemaVersion}`);
    const allowedArtifactRoots = stringArray(value.resultRequirements.allowedArtifactRoots, 'resultRequirements.allowedArtifactRoots', { allowEmpty: false });
    if (allowedArtifactRoots.some((root) => root.replaceAll('/', '\\').split('\\').includes('..'))) fail('RESULT_REQUIREMENTS_INVALID', 'allowedArtifactRoots 不得包含 .. 路径段');
    const requiredArtifactTypes = stringArray(value.resultRequirements.requiredArtifactTypes, 'resultRequirements.requiredArtifactTypes');
    if (requiredArtifactTypes.some((type) => !RESULT_ARTIFACT_TYPES.includes(type)) || new Set(requiredArtifactTypes).size !== requiredArtifactTypes.length) fail('RESULT_REQUIREMENTS_INVALID', 'requiredArtifactTypes 包含未知或重复类型');
    const requiredMilestones = stringArray(value.resultRequirements.requiredMilestones, 'resultRequirements.requiredMilestones');
    if (requiredMilestones.some((milestone) => !RESULT_ARTIFACT_MILESTONES.includes(milestone)) || new Set(requiredMilestones).size !== requiredMilestones.length) fail('RESULT_REQUIREMENTS_INVALID', 'requiredMilestones 包含未知或重复值');
    const presentationStageId = nonEmpty(value.resultRequirements.presentationStageId) ? value.resultRequirements.presentationStageId.trim() : null;
    if (presentationStageId !== null && (!stageIds.has(presentationStageId) || !stageGates.find((entry) => entry.id === presentationStageId)?.required)) fail('RESULT_REQUIREMENTS_INVALID', 'presentationStageId 必须指向 required stage gate');
    if (taskMode === 'visual_implementation') {
      if (presentationStageId === null) fail('RESULT_PRESENTATION_STAGE_REQUIRED', 'visual_implementation 必须绑定 presentation/result stage');
      if (!requiredArtifactTypes.some((type) => ['screenshot', 'contact_sheet'].includes(type))) fail('RESULT_VISUAL_ARTIFACT_REQUIRED', 'visual_implementation 必须要求 screenshot 或 contact_sheet');
      if (!requiredMilestones.some((milestone) => ['after', 'current'].includes(milestone))) fail('RESULT_VISUAL_MILESTONE_REQUIRED', 'visual_implementation 必须要求 after 或 current 里程碑');
    }
    resultRequirements = { manifestSchemaVersion: expectedManifestSchemaVersion, allowedArtifactRoots, requiredArtifactTypes, requiredMilestones, presentationStageId };
  } else if (requireResultRequirements) {
    fail('RESULT_REQUIREMENTS_REQUIRED', '新登记 implementation/visual_implementation 必须在合同中提供 resultRequirements');
  }
  return { contractSchemaVersion: value.schemaVersion, contractRevision, contractCommit, allowedWritePaths, reuseRequirements, forbiddenNewPaths, forbiddenReimplementations, stageGates, evidenceCommands, errorPolicy, validationPolicy, visualOracle, resultRequirements };
}

export async function loadImplementationContract(projectRoot, reference, taskMode, options = {}) {
  if (!['implementation', 'visual_implementation'].includes(taskMode)) fail('IMPLEMENTATION_CONTRACT_NOT_APPLICABLE', '只有 implementation/visual_implementation 任务可以绑定实施合同');
  const implementationContractPath = resolveImplementationContractPath(projectRoot, reference);
  let raw;
  try {
    raw = await readFile(implementationContractPath, 'utf8');
  } catch (error) {
    fail('IMPLEMENTATION_CONTRACT_READ_FAILED', `无法读取 ${implementationContractPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    fail('IMPLEMENTATION_CONTRACT_INVALID', `实施合同 JSON 无效: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = validateImplementationContractManifest(value, taskMode, options);
  return { implementationContractPath, contractDigest: createHash('sha256').update(raw, 'utf8').digest('hex'), ...manifest };
}

async function projectIgnoresPythonCache(projectRoot) {
  const probes = ['__pycache__/task_control_probe.pyc', 'tools/__pycache__/task_control_probe.pyc', 'src/__pycache__/task_control_probe.pyc'];
  for (const probe of probes) {
    try {
      await execFile('git', ['-C', projectRoot, 'check-ignore', '-q', '--', probe], { windowsHide: true });
    } catch {
      return false;
    }
  }
  return true;
}

async function implementationContractAuditFindings(snapshot, projectRoot) {
  const errors = [];
  const warnings = [];
  const commands = snapshot.evidenceCommands.map((entry) => entry.command);
  const pythonProducer = commands.some((command) => /(?:^|[\s;&|])(?:python(?:3(?:\.\d+)?)?|py(?:\.exe)?|pytest)(?:\s|$)/i.test(command));
  const bytecodeSuppressed = commands.some((command) => /PYTHONDONTWRITEBYTECODE\s*=\s*1|(?:^|\s)(?:python(?:3(?:\.\d+)?)?|py(?:\.exe)?)\s+-[^\s]*B/i.test(command));
  const cacheIgnoredByGit = pythonProducer && !bytecodeSuppressed ? await projectIgnoresPythonCache(projectRoot) : false;
  for (const evidence of snapshot.evidenceCommands) {
    const strictUntracked = /git\s+(?:status\s+--porcelain|ls-files\s+--others)/i.test(evidence.command);
    const ignoresPythonCache = /__pycache__|\.pyc|PYTHONDONTWRITEBYTECODE|(?:^|\s)(?:python(?:3(?:\.\d+)?)?|py(?:\.exe)?)\s+-[^\s]*B/i.test(evidence.command);
    if (pythonProducer && strictUntracked && !bytecodeSuppressed && !cacheIgnoredByGit && !ignoresPythonCache && evidence.failureMode !== 'advisory') {
      errors.push({ code: 'CONTRACT_EPHEMERAL_SELF_CONFLICT', evidenceCommandId: evidence.id, message: '合同既运行 Python 又把全部未跟踪文件作为阻断条件，但未抑制或排除 __pycache__/*.pyc。' });
    }
    if (/search_knowledge\.py|check_knowledge_capture\.py/i.test(evidence.command) && evidence.failureMode === 'blocking') {
      warnings.push({ code: 'GOVERNANCE_COMMAND_BLOCKING_REVIEW', evidenceCommandId: evidence.id, message: '知识搜索/捕获命令被设为 blocking；请确认“无结果”确实应停止业务实施。' });
    }
    if (/(?:resolve-path|getfullpath|realpath).*(?:-eq|==)|(?:-eq|==).*(?:resolve-path|getfullpath|realpath)/i.test(evidence.command)) {
      warnings.push({ code: 'PATH_IDENTITY_NORMALIZATION_REVIEW', evidenceCommandId: evidence.id, message: '命令包含路径身份比较；请确认大小写、分隔符和 junction/realpath 已统一。' });
    }
  }
  return { errors, warnings };
}

export async function auditImplementationContract(input) {
  const snapshot = await loadImplementationContract(input.projectRoot, input.implementationContractPath, input.taskMode, { requireResultRequirements: true, requireCurrentSchema: true });
  const findings = await implementationContractAuditFindings(snapshot, input.projectRoot);
  return { valid: findings.errors.length === 0, taskMode: input.taskMode, implementationContractPath: snapshot.implementationContractPath, contractDigest: snapshot.contractDigest, contractVersion: snapshot.contractRevision ?? snapshot.contractCommit, ...findings };
}

function resolveResultManifestPath(resultRoot, reference, workspaceRole = 'project_main') {
  if (!nonEmpty(reference)) fail('RESULT_MANIFEST_REQUIRED', 'resultProtocolVersion=1 的实施任务必须提供 result manifest');
  const root = win32.resolve(resultRoot.replaceAll('/', '\\'));
  const resolved = win32.resolve(root, reference.replaceAll('/', '\\'));
  const normalizedRoot = root.toLowerCase();
  const normalizedResolved = resolved.toLowerCase();
  if (normalizedResolved !== normalizedRoot && !normalizedResolved.startsWith(`${normalizedRoot}\\`)) fail(workspaceRole === 'candidate_worktree' ? 'RESULT_MANIFEST_OUTSIDE_WORKTREE' : 'RESULT_MANIFEST_OUTSIDE_PROJECT', workspaceRole === 'candidate_worktree' ? 'result manifest 必须位于台账登记的候选 worktree 内' : 'result manifest 必须位于项目根目录内');
  return resolved;
}

function windowsPathInside(filePath, rootPath) {
  const normalizedFile = win32.resolve(filePath).toLowerCase();
  const normalizedRoot = win32.resolve(rootPath).toLowerCase();
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}\\`);
}

async function gitResultOutput(root, args, code, message) {
  try {
    const { stdout } = await execFile('git', ['-C', root, ...args], { windowsHide: true, encoding: 'utf8' });
    return stdout.trim();
  } catch (error) {
    fail(code, `${message}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function assertGitAncestor(root, ancestor, descendant, code, message) {
  try {
    await execFile('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant], { windowsHide: true });
  } catch {
    fail(code, message);
  }
}

async function resolveResultWorkspace(task, projectRoot, candidateCommit) {
  const identity = task.parallelWorktreeIdentity;
  if (identity === null || identity === undefined) {
    let rootPath;
    try { rootPath = await realpath(projectRoot); } catch (error) { fail('RESULT_PROJECT_ROOT_INVALID', `项目根目录无法解析: ${error instanceof Error ? error.message : String(error)}`); }
    return { schemaVersion: 1, workspaceRole: 'project_main', rootPath, registeredWorktreePath: null, branch: null, registeredBaseCommit: null, registeredLastMainSyncCommit: null, registeredCleanupOwner: null, baseCommit: null, lastMainSyncCommit: null, candidateCommit: null };
  }
  let rootPath;
  let mainRoot;
  try {
    [rootPath, mainRoot] = await Promise.all([realpath(identity.worktreePath), realpath(projectRoot)]);
  } catch (error) {
    fail('RESULT_WORKTREE_IDENTITY_INVALID', `登记的 main/worktree 路径无法解析: ${error instanceof Error ? error.message : String(error)}`);
  }
  const topLevel = await gitResultOutput(rootPath, ['rev-parse', '--show-toplevel'], 'RESULT_WORKTREE_IDENTITY_INVALID', '登记路径不是可验证的 Git worktree');
  let realTopLevel;
  try { realTopLevel = await realpath(topLevel); } catch (error) { fail('RESULT_WORKTREE_IDENTITY_INVALID', `Git worktree 根无法解析: ${error instanceof Error ? error.message : String(error)}`); }
  if (!windowsPathInside(realTopLevel, rootPath) || !windowsPathInside(rootPath, realTopLevel)) fail('RESULT_WORKTREE_IDENTITY_MISMATCH', 'Git worktree 根与台账登记 worktreePath 不精确匹配');
  const [worktreeCommonRaw, mainCommonRaw] = await Promise.all([
    gitResultOutput(rootPath, ['rev-parse', '--path-format=absolute', '--git-common-dir'], 'RESULT_WORKTREE_IDENTITY_INVALID', '无法读取候选 worktree 的 Git common dir'),
    gitResultOutput(mainRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir'], 'RESULT_WORKTREE_IDENTITY_INVALID', '无法读取主项目的 Git common dir'),
  ]);
  let worktreeCommon;
  let mainCommon;
  try { [worktreeCommon, mainCommon] = await Promise.all([realpath(worktreeCommonRaw), realpath(mainCommonRaw)]); } catch (error) { fail('RESULT_WORKTREE_IDENTITY_INVALID', `Git common dir 无法解析: ${error instanceof Error ? error.message : String(error)}`); }
  if (!windowsPathInside(worktreeCommon, mainCommon) || !windowsPathInside(mainCommon, worktreeCommon)) fail('RESULT_WORKTREE_REPOSITORY_MISMATCH', '候选 worktree 不属于台账登记的主项目仓库');
  const branch = await gitResultOutput(rootPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'RESULT_WORKTREE_BRANCH_MISMATCH', '候选 worktree 处于 detached HEAD 或无法读取分支');
  if (branch.toLowerCase() !== identity.branch.toLowerCase()) fail('RESULT_WORKTREE_BRANCH_MISMATCH', `候选 worktree 分支 ${branch} 与台账 ${identity.branch} 不匹配`);
  if (!/^[0-9a-f]{40,64}$/i.test(candidateCommit)) fail('RESULT_WORKTREE_CANDIDATE_INVALID', 'worktree candidateCommit 必须是完整 Git commit');
  const headCommit = await gitResultOutput(rootPath, ['rev-parse', 'HEAD^{commit}'], 'RESULT_WORKTREE_CANDIDATE_INVALID', '无法读取候选 worktree HEAD');
  const candidate = await gitResultOutput(rootPath, ['rev-parse', `${candidateCommit}^{commit}`], 'RESULT_WORKTREE_CANDIDATE_INVALID', 'candidateCommit 不存在于登记 worktree');
  if (candidate.toLowerCase() !== headCommit.toLowerCase()) fail('RESULT_WORKTREE_CANDIDATE_MISMATCH', 'candidateCommit 必须精确等于登记 worktree 的当前 HEAD');
  const baseCommit = await gitResultOutput(rootPath, ['rev-parse', `${identity.baseCommit}^{commit}`], 'RESULT_WORKTREE_BASE_MISMATCH', 'baseCommit 无法在登记仓库解析');
  const lastMainSyncCommit = await gitResultOutput(rootPath, ['rev-parse', `${identity.lastMainSyncCommit}^{commit}`], 'RESULT_WORKTREE_BASE_MISMATCH', 'lastMainSyncCommit 无法在登记仓库解析');
  await assertGitAncestor(rootPath, baseCommit, candidate, 'RESULT_WORKTREE_BASE_MISMATCH', 'candidateCommit 不是登记 baseCommit 的后代');
  await assertGitAncestor(rootPath, lastMainSyncCommit, candidate, 'RESULT_WORKTREE_BASE_MISMATCH', 'candidateCommit 不是登记 lastMainSyncCommit 的后代');
  return { schemaVersion: 1, workspaceRole: 'candidate_worktree', rootPath, registeredWorktreePath: identity.worktreePath, branch, registeredBaseCommit: identity.baseCommit, registeredLastMainSyncCommit: identity.lastMainSyncCommit, registeredCleanupOwner: identity.cleanupOwner, baseCommit, lastMainSyncCommit, candidateCommit: candidate };
}

function parallelStringArray(value, field, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(nonEmpty)) fail('PARALLEL_BATCH_INVALID', `${field} 必须是${allowEmpty ? '' : '非空'}字符串数组`);
  const normalized = value.map((entry) => entry.trim());
  if (new Set(normalized).size !== normalized.length) fail('PARALLEL_BATCH_INVALID', `${field} 不得包含重复值`);
  return normalized;
}

function validateParallelWorktreeIdentity(value, projectRoot) {
  if (!isObject(value)) fail('PARALLEL_BATCH_INVALID', 'implementation candidate 必须记录 worktreeIdentity');
  const allowed = new Set(['baseCommit', 'worktreePath', 'branch', 'lastMainSyncCommit', 'cleanupOwner']);
  if (Object.keys(value).some((key) => !allowed.has(key)) || ![value.baseCommit, value.worktreePath, value.branch, value.lastMainSyncCommit, value.cleanupOwner].every(nonEmpty)) fail('PARALLEL_BATCH_INVALID', 'worktreeIdentity 字段不完整');
  if (!win32.isAbsolute(value.worktreePath.replaceAll('/', '\\'))) fail('PARALLEL_BATCH_INVALID', 'worktreePath 必须是绝对路径');
  if (!isSafeThreadId(value.cleanupOwner)) fail('PARALLEL_BATCH_INVALID', 'cleanupOwner 必须是安全的 thread/controller id');
  const normalizedProject = win32.resolve(projectRoot.replaceAll('/', '\\')).toLowerCase();
  const normalizedWorktree = win32.resolve(value.worktreePath.replaceAll('/', '\\')).toLowerCase();
  if (normalizedWorktree === normalizedProject) fail('PARALLEL_BATCH_INVALID', 'implementation candidate 必须使用独立 worktree，不能把 project main 当候选工作树');
  return { baseCommit: value.baseCommit.trim(), worktreePath: win32.resolve(value.worktreePath.replaceAll('/', '\\')), branch: value.branch.trim(), lastMainSyncCommit: value.lastMainSyncCommit.trim(), cleanupOwner: value.cleanupOwner.trim() };
}

function validateParallelDegradation(value) {
  if (value === null || value === undefined) return null;
  if (!isObject(value) || !has(value.reason, PARALLEL_DEGRADATION_REASONS) || !nonEmpty(value.summary)) fail('PARALLEL_BATCH_INVALID', 'degradationReceipt 必须记录允许的 reason 和具体 summary');
  const evidence = parallelStringArray(value.evidence, 'degradationReceipt.evidence', { allowEmpty: false });
  return { reason: value.reason, summary: value.summary.trim(), evidence };
}

export function validateParallelBatchManifest(value, projectRoot, { allowLegacyMissingIncrementalValue = false } = {}) {
  const allowed = new Set(['schemaVersion', 'batchId', 'objective', 'dispatchAuthority', 'reviewCapacity', 'wipLimits', 'dirtyConflictDomains', 'degradationReceipt', 'candidates']);
  if (!isObject(value) || value.schemaVersion !== PARALLEL_BATCH_PROTOCOL_VERSION || Object.keys(value).some((key) => !allowed.has(key))) fail('PARALLEL_BATCH_INVALID', `parallel batch manifest 必须使用 schemaVersion=${PARALLEL_BATCH_PROTOCOL_VERSION} 且不得包含未知字段`);
  if (!isSafeThreadId(value.batchId) || !nonEmpty(value.objective) || !has(value.dispatchAuthority, PARALLEL_DISPATCH_AUTHORITIES)) fail('PARALLEL_BATCH_INVALID', 'batchId/objective/dispatchAuthority 无效');
  if (!Number.isInteger(value.reviewCapacity) || value.reviewCapacity < 1) fail('PARALLEL_BATCH_INVALID', 'reviewCapacity 必须是正整数');
  if (!isObject(value.wipLimits)) fail('PARALLEL_BATCH_INVALID', 'wipLimits 必须是对象');
  const wipKeys = ['total', ...PARALLEL_LANES];
  if (Object.keys(value.wipLimits).some((key) => !wipKeys.includes(key)) || !wipKeys.every((key) => Number.isInteger(value.wipLimits[key]) && value.wipLimits[key] >= 0) || value.wipLimits.total < 1) fail('PARALLEL_BATCH_INVALID', 'wipLimits 必须包含 total 和每个 lane 的非负整数上限');
  const dirtyConflictDomains = parallelStringArray(value.dirtyConflictDomains ?? [], 'dirtyConflictDomains');
  const degradationReceipt = validateParallelDegradation(value.degradationReceipt);
  if (!Array.isArray(value.candidates) || value.candidates.length === 0) fail('PARALLEL_BATCH_INVALID', 'candidates 必须是非空数组');
  const candidateIds = new Set();
  const candidates = value.candidates.map((candidate) => {
    const candidateAllowed = new Set(['candidateId', 'title', 'incrementalValue', 'lane', 'workClass', 'taskMode', 'conflictDomains', 'dependencies', 'reviewCost', 'estimatedMinutes', 'blockingReasons', 'persistentLane', 'worktreeIdentity']);
    if (!isObject(candidate) || Object.keys(candidate).some((key) => !candidateAllowed.has(key)) || !isSafeThreadId(candidate.candidateId) || candidateIds.has(candidate.candidateId) || !nonEmpty(candidate.title) || !has(candidate.lane, PARALLEL_LANES) || !has(candidate.workClass, WORK_CLASSES) || !REGISTER_TASK_MODES.includes(candidate.taskMode)) fail('PARALLEL_BATCH_INVALID', 'candidate identity/lane/workClass/taskMode 无效');
    candidateIds.add(candidate.candidateId);
    if (!nonEmpty(candidate.incrementalValue) && !allowLegacyMissingIncrementalValue) fail('PARALLEL_CANDIDATE_VALUE_REQUIRED', `candidate ${candidate.candidateId} 必须说明独立增量价值，不能只为凑并发数量`);
    const incrementalValue = nonEmpty(candidate.incrementalValue) ? candidate.incrementalValue.trim() : 'legacy_manifest_value_not_recorded';
    const conflictDomains = parallelStringArray(candidate.conflictDomains, `candidate ${candidate.candidateId}.conflictDomains`, { allowEmpty: candidate.lane !== 'implementation' });
    const blockingReasons = parallelStringArray(candidate.blockingReasons ?? [], `candidate ${candidate.candidateId}.blockingReasons`);
    if (!Array.isArray(candidate.dependencies)) fail('PARALLEL_BATCH_INVALID', `candidate ${candidate.candidateId}.dependencies 必须是数组`);
    const dependencyIds = new Set();
    const dependencies = candidate.dependencies.map((dependency) => {
      if (!isObject(dependency) || !isSafeThreadId(dependency.candidateId) || dependency.candidateId === candidate.candidateId || dependency.requiredState !== 'integrated' || dependencyIds.has(dependency.candidateId)) fail('PARALLEL_BATCH_INVALID', `candidate ${candidate.candidateId} dependency 无效`);
      dependencyIds.add(dependency.candidateId);
      return { candidateId: dependency.candidateId, requiredState: 'integrated' };
    });
    if (!Number.isInteger(candidate.reviewCost) || candidate.reviewCost < 1 || !Number.isInteger(candidate.estimatedMinutes) || candidate.estimatedMinutes < 1 || typeof candidate.persistentLane !== 'boolean') fail('PARALLEL_BATCH_INVALID', `candidate ${candidate.candidateId} reviewCost/estimatedMinutes/persistentLane 无效`);
    const implementationMode = ['implementation', 'visual_implementation'].includes(candidate.taskMode);
    if (candidate.lane === 'implementation' && !implementationMode) fail('PARALLEL_BATCH_INVALID', `implementation lane candidate ${candidate.candidateId} 必须使用 implementation 或 visual_implementation taskMode`);
    const worktreeIdentity = implementationMode ? validateParallelWorktreeIdentity(candidate.worktreeIdentity, projectRoot) : null;
    if (!implementationMode && candidate.worktreeIdentity !== null && candidate.worktreeIdentity !== undefined) fail('PARALLEL_BATCH_INVALID', `control_only candidate ${candidate.candidateId} 不得伪造 worktreeIdentity`);
    return { candidateId: candidate.candidateId, title: candidate.title.trim(), incrementalValue, lane: candidate.lane, workClass: candidate.workClass, taskMode: candidate.taskMode, conflictDomains, dependencies, reviewCost: candidate.reviewCost, estimatedMinutes: candidate.estimatedMinutes, blockingReasons, persistentLane: candidate.persistentLane, worktreeIdentity, threadId: null, registeredAt: null };
  });
  for (const candidate of candidates) for (const dependency of candidate.dependencies) if (!candidateIds.has(dependency.candidateId)) fail('PARALLEL_BATCH_INVALID', `candidate ${candidate.candidateId} 引用了未知 dependency ${dependency.candidateId}`);
  const visiting = new Set();
  const visited = new Set();
  const byCandidateId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const visit = (candidateId) => {
    if (visiting.has(candidateId)) fail('PARALLEL_BATCH_INVALID', `parallel candidate dependency 存在循环: ${candidateId}`);
    if (visited.has(candidateId)) return;
    visiting.add(candidateId);
    for (const dependency of byCandidateId.get(candidateId).dependencies) visit(dependency.candidateId);
    visiting.delete(candidateId);
    visited.add(candidateId);
  };
  for (const candidate of candidates) visit(candidate.candidateId);
  return { protocolVersion: PARALLEL_BATCH_PROTOCOL_VERSION, batchId: value.batchId, objective: value.objective.trim(), dispatchAuthority: value.dispatchAuthority, reviewCapacity: value.reviewCapacity, wipLimits: Object.fromEntries(wipKeys.map((key) => [key, value.wipLimits[key]])), dirtyConflictDomains, degradationReceipt, candidates };
}

export async function loadParallelBatchManifest(projectRoot, reference) {
  if (!nonEmpty(reference)) fail('PARALLEL_BATCH_MANIFEST_REQUIRED', '必须提供 project-relative parallel batch manifest');
  const root = win32.resolve(projectRoot.replaceAll('/', '\\'));
  const manifestPath = win32.resolve(root, reference.replaceAll('/', '\\'));
  if (!windowsPathInside(manifestPath, root)) fail('PARALLEL_BATCH_OUTSIDE_PROJECT', 'parallel batch manifest 必须位于项目根目录内');
  let raw;
  try { raw = await readFile(manifestPath, 'utf8'); } catch (error) { fail('PARALLEL_BATCH_READ_FAILED', `无法读取 ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`); }
  let value;
  try { value = JSON.parse(raw); } catch (error) { fail('PARALLEL_BATCH_INVALID', `parallel batch JSON 无效: ${error instanceof Error ? error.message : String(error)}`); }
  return { manifestPath, manifestDigest: createHash('sha256').update(raw, 'utf8').digest('hex'), ...validateParallelBatchManifest(value, projectRoot) };
}

function imageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    return { format: 'gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += 2; continue; }
      if (offset + 4 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) break;
      if (sofMarkers.has(marker)) return { format: 'jpeg', width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      offset += 2 + segmentLength;
    }
  }
  fail('RESULT_IMAGE_INVALID', '图片无法解码；仅接受有效 PNG、JPEG 或 GIF');
}

async function normalizeLocalResultArtifact(artifact, resultManifestPath, projectRoot, allowedArtifactRoots) {
  const candidate = win32.isAbsolute(artifact.path) ? win32.resolve(artifact.path) : win32.resolve(dirname(resultManifestPath), artifact.path.replaceAll('/', '\\'));
  let resolved;
  try {
    resolved = await realpath(candidate);
  } catch (error) {
    fail('RESULT_ARTIFACT_PATH_INVALID', `artifact 路径不存在: ${candidate}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!windowsPathInside(resolved, projectRoot)) fail('RESULT_ARTIFACT_OUTSIDE_ALLOWED_ROOT', `artifact 真实路径超出当前结果工作区: ${resolved}`);
  const allowedRoots = [];
  for (const rootRef of allowedArtifactRoots) {
    const rootCandidate = win32.isAbsolute(rootRef) ? win32.resolve(rootRef) : win32.resolve(projectRoot, rootRef.replaceAll('/', '\\'));
    try {
      allowedRoots.push(await realpath(rootCandidate));
    } catch {
      // A missing allowlisted root cannot authorize an artifact.
    }
  }
  if (!allowedRoots.some((root) => windowsPathInside(resolved, root))) fail('RESULT_ARTIFACT_OUTSIDE_ALLOWED_ROOT', `artifact 超出合同允许根目录: ${resolved}`);
  const info = await stat(resolved);
  if (!info.isFile() || info.size <= 0) fail('RESULT_ARTIFACT_EMPTY', `artifact 必须是非空文件: ${resolved}`);
  const buffer = await readFile(resolved);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  if (artifact.sha256 !== undefined && artifact.sha256 !== sha256) fail('RESULT_ARTIFACT_HASH_MISMATCH', `artifact hash 不匹配: ${artifact.id}`);
  let dimensions = null;
  if (['screenshot', 'contact_sheet'].includes(artifact.type)) {
    dimensions = imageDimensions(buffer);
    if (dimensions.width <= 0 || dimensions.height <= 0) fail('RESULT_IMAGE_INVALID', `图片尺寸无效: ${artifact.id}`);
    if (artifact.dimensions !== undefined && (!isObject(artifact.dimensions) || artifact.dimensions.width !== dimensions.width || artifact.dimensions.height !== dimensions.height)) fail('RESULT_IMAGE_DIMENSION_MISMATCH', `artifact dimensions 与文件不一致: ${artifact.id}`);
  } else if (artifact.dimensions !== undefined) {
    fail('RESULT_ARTIFACT_INVALID', `非图片 artifact 不得声明 dimensions: ${artifact.id}`);
  }
  return { path: resolved, uri: null, sha256, dimensions };
}

function normalizeResultTestSummary(value) {
  if (!isObject(value) || Object.keys(value).some((key) => !['status', 'summary', 'commands', 'metrics'].includes(key)) || !RESULT_TEST_STATUSES.includes(value.status) || !nonEmpty(value.summary)) fail('RESULT_TEST_SUMMARY_INVALID', 'testSummary 必须包含 status、summary、commands 和 metrics');
  const commands = stringArray(value.commands, 'testSummary.commands');
  if (!Array.isArray(value.metrics)) fail('RESULT_TEST_SUMMARY_INVALID', 'testSummary.metrics 必须是数组');
  const metrics = value.metrics.map((metric) => {
    if (!isObject(metric) || Object.keys(metric).some((key) => !['label', 'before', 'after', 'unit'].includes(key)) || !nonEmpty(metric.label) || !['string', 'number'].includes(typeof metric.before) || !['string', 'number'].includes(typeof metric.after) || (metric.unit !== undefined && metric.unit !== null && !nonEmpty(metric.unit))) fail('RESULT_TEST_SUMMARY_INVALID', 'metric 必须包含 label、before、after，可选 unit');
    return { label: metric.label.trim(), before: metric.before, after: metric.after, unit: nonEmpty(metric.unit) ? metric.unit.trim() : null };
  });
  if (commands.length === 0 && metrics.length === 0) fail('RESULT_TEST_SUMMARY_INVALID', 'testSummary 至少提供一个命令或一组前后数值');
  return { status: value.status, summary: value.summary.trim(), commands, metrics };
}

async function loadResultManifest(projectRoot, reference, task, candidateCommit) {
  if (!implementationTask(task) || task.resultProtocolVersion !== RESULT_PROTOCOL_VERSION || task.resultRequirements === null) fail('RESULT_MANIFEST_NOT_APPLICABLE', '当前任务未启用 result protocol');
  const sourceWorkspace = await resolveResultWorkspace(task, projectRoot, candidateCommit);
  const resultRoot = sourceWorkspace.rootPath;
  const lexicalResultManifestPath = resolveResultManifestPath(resultRoot, reference, sourceWorkspace.workspaceRole);
  let resultManifestPath;
  try {
    const realManifest = await realpath(lexicalResultManifestPath);
    if (!windowsPathInside(realManifest, resultRoot)) fail(sourceWorkspace.workspaceRole === 'candidate_worktree' ? 'RESULT_MANIFEST_OUTSIDE_WORKTREE' : 'RESULT_MANIFEST_OUTSIDE_PROJECT', sourceWorkspace.workspaceRole === 'candidate_worktree' ? 'result manifest 的真实路径逃逸台账登记 worktree' : 'result manifest 的真实路径超出项目根目录');
    resultManifestPath = realManifest;
  } catch (error) {
    if (error instanceof TaskControlError) throw error;
    fail('RESULT_MANIFEST_READ_FAILED', `无法解析 result manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  let raw;
  try {
    raw = await readFile(resultManifestPath, 'utf8');
  } catch (error) {
    fail('RESULT_MANIFEST_READ_FAILED', `无法读取 ${resultManifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    fail('RESULT_MANIFEST_INVALID', `result manifest JSON 无效: ${error instanceof Error ? error.message : String(error)}`);
  }
  const allowed = new Set(['schemaVersion', 'projectKey', 'controllerThreadId', 'threadId', 'displayKey', 'attempt', 'implementationPolicy', 'contractVersion', 'contractDigest', 'candidateCommit', 'integrationStatus', 'userVisibleSummary', 'actualChanges', 'affectedFiles', 'validationRationale', 'incompleteItems', 'testSummary', 'noScreenshotReason', 'artifacts', 'createdAt']);
  const expectedManifestSchemaVersion = task.resultProtocolVersion;
  if (!isObject(value) || value.schemaVersion !== expectedManifestSchemaVersion || value.schemaVersion !== task.resultRequirements.manifestSchemaVersion || Object.keys(value).some((key) => !allowed.has(key))) fail('RESULT_MANIFEST_INVALID', `result manifest 必须使用 schemaVersion=${expectedManifestSchemaVersion} 且不得包含未知字段`);
  if (value.projectKey !== projectKeyForRoot(projectRoot) || value.controllerThreadId !== task.directControllerThreadId || value.threadId !== task.threadId || value.displayKey !== task.displayKey || value.attempt !== task.attemptCount) fail('RESULT_MANIFEST_OWNERSHIP_MISMATCH', 'result manifest 的项目、主控、任务、displayKey 或 attempt 与台账不一致');
  if (value.contractVersion !== contractVersion(task) || value.contractDigest !== task.contractDigest || value.candidateCommit !== candidateCommit) fail('RESULT_MANIFEST_CONTRACT_MISMATCH', 'result manifest 的合同或 candidateCommit 与 completion 不一致');
  if (value.integrationStatus !== 'candidate') fail('RESULT_MANIFEST_STATUS_INVALID', 'worker 成果包只能声明 integrationStatus=candidate');
  if (value.createdAt !== undefined && !isTimestamp(value.createdAt)) fail('RESULT_MANIFEST_INVALID', 'createdAt 必须为 ISO 时间');
  if (!nonEmpty(value.userVisibleSummary)) fail('RESULT_MANIFEST_INVALID', 'userVisibleSummary 不能为空');
  const actualChanges = stringArray(value.actualChanges, 'actualChanges', { allowEmpty: false });
  let affectedFiles = [];
  let validationRationale = null;
  if (value.schemaVersion >= 2) {
    if (value.implementationPolicy !== task.implementationPolicy || !Array.isArray(value.affectedFiles) || value.affectedFiles.length === 0 || !nonEmpty(value.validationRationale)) fail('RESULT_EXECUTION_REPORT_REQUIRED', 'schema-v2 成果包必须记录 implementationPolicy、affectedFiles 和 validationRationale');
    const seenPaths = new Set();
    affectedFiles = value.affectedFiles.map((entry) => {
      if (!isObject(entry) || Object.keys(entry).some((key) => !['path', 'changeType', 'reason'].includes(key)) || !nonEmpty(entry.path) || !has(entry.changeType, RESULT_FILE_CHANGE_TYPES) || !nonEmpty(entry.reason) || win32.isAbsolute(entry.path) || entry.path.replaceAll('/', '\\').split('\\').includes('..')) fail('RESULT_AFFECTED_FILE_INVALID', 'affectedFiles 必须记录项目相对 path、changeType 和 reason');
      const path = entry.path.trim().replaceAll('\\', '/');
      if (seenPaths.has(path.toLowerCase())) fail('RESULT_AFFECTED_FILE_INVALID', `affectedFiles path 重复: ${path}`);
      seenPaths.add(path.toLowerCase());
      return { path, changeType: entry.changeType, reason: entry.reason.trim() };
    });
    validationRationale = value.validationRationale.trim();
    const reportedPaths = new Set(affectedFiles.map((entry) => entry.path.toLowerCase()));
    const missingRepairPaths = (task.incidentalRepairs ?? [])
      .filter((repair) => repair.attemptCount === task.attemptCount)
      .flatMap((repair) => repair.affectedFiles.map((entry) => entry.path))
      .filter((path) => !reportedPaths.has(path.toLowerCase()));
    if (missingRepairPaths.length > 0) fail('INCIDENTAL_REPAIR_RESULT_MISMATCH', `成果包必须披露附带修复影响文件: ${[...new Set(missingRepairPaths)].join(', ')}`);
  }
  const incompleteItems = stringArray(value.incompleteItems, 'incompleteItems');
  const testSummary = normalizeResultTestSummary(value.testSummary);
  if (!Array.isArray(value.artifacts)) fail('RESULT_MANIFEST_INVALID', 'artifacts 必须是数组');
  const artifactIds = new Set();
  const artifactHashes = new Set();
  const stageIds = new Set(task.stageGates.map((gate) => gate.id));
  const artifacts = [];
  for (const artifact of value.artifacts) {
    const artifactAllowed = new Set(['id', 'type', 'milestone', 'label', 'description', 'createdAt', 'sourceStageId', 'sourceTaskThreadId', 'workspaceRole', 'path', 'uri', 'sha256', 'dimensions']);
    const sourceStageValid = adaptiveBriefTask(task) ? isSafeThreadId(artifact.sourceStageId) : stageIds.has(artifact.sourceStageId);
    if (!isObject(artifact) || Object.keys(artifact).some((key) => !artifactAllowed.has(key)) || !isSafeThreadId(artifact.id) || artifactIds.has(artifact.id) || !RESULT_ARTIFACT_TYPES.includes(artifact.type) || !RESULT_ARTIFACT_MILESTONES.includes(artifact.milestone) || !nonEmpty(artifact.label) || !nonEmpty(artifact.description) || !isTimestamp(artifact.createdAt) || !nonEmpty(artifact.sourceStageId) || !sourceStageValid || artifact.sourceTaskThreadId !== task.threadId || !RESULT_WORKSPACE_ROLES.includes(artifact.workspaceRole)) fail('RESULT_ARTIFACT_INVALID', 'artifact 身份、类型、里程碑、来源阶段或任务无效');
    if (artifact.workspaceRole === 'task_control' || (artifact.workspaceRole === 'project_main' && artifact.type !== 'reference') || (['screenshot', 'contact_sheet'].includes(artifact.type) && artifact.workspaceRole !== 'candidate_worktree')) fail('RESULT_ARTIFACT_WORKSPACE_STATUS_MISMATCH', 'worker candidate artifact 不得冒充 project_main/task_control 成果');
    artifactIds.add(artifact.id);
    const hasPath = nonEmpty(artifact.path);
    const hasUri = nonEmpty(artifact.uri);
    if (hasPath === hasUri) fail('RESULT_ARTIFACT_INVALID', `artifact ${artifact.id} 必须且只能提供 path 或 uri`);
    if (['screenshot', 'contact_sheet'].includes(artifact.type) && !hasPath) fail('RESULT_IMAGE_PATH_REQUIRED', `视觉 artifact 必须提供可验证的本地 path: ${artifact.id}`);
    let location;
    if (hasPath) {
      location = await normalizeLocalResultArtifact(artifact, resultManifestPath, resultRoot, task.resultRequirements.allowedArtifactRoots);
      if (artifactHashes.has(location.sha256)) fail('RESULT_ARTIFACT_DUPLICATE_HASH', `成果包不得重复登记同一文件内容: ${artifact.id}`);
      artifactHashes.add(location.sha256);
    } else {
      let parsed;
      try { parsed = new URL(artifact.uri); } catch { fail('RESULT_ARTIFACT_URI_INVALID', `artifact URI 无效: ${artifact.id}`); }
      if (!['http:', 'https:'].includes(parsed.protocol) || artifact.sha256 !== undefined || artifact.dimensions !== undefined) fail('RESULT_ARTIFACT_URI_INVALID', `远程 artifact 仅允许 http/https 且不得伪造本地 hash/dimensions: ${artifact.id}`);
      location = { path: null, uri: parsed.toString(), sha256: null, dimensions: null };
    }
    artifacts.push({ id: artifact.id, type: artifact.type, milestone: artifact.milestone, label: artifact.label.trim(), description: artifact.description.trim(), createdAt: artifact.createdAt, sourceStageId: artifact.sourceStageId.trim(), sourceTaskThreadId: artifact.sourceTaskThreadId, workspaceRole: artifact.workspaceRole, ...location });
  }
  const artifactTypes = new Set(artifacts.map((artifact) => artifact.type));
  const milestones = new Set(artifacts.map((artifact) => artifact.milestone));
  const missingTypes = task.resultRequirements.requiredArtifactTypes.filter((type) => !artifactTypes.has(type));
  const missingMilestones = task.resultRequirements.requiredMilestones.filter((milestone) => !milestones.has(milestone));
  if (missingTypes.length > 0 || missingMilestones.length > 0) fail('RESULT_ARTIFACT_REQUIRED', `成果包缺少类型 [${missingTypes.join(', ')}] 或里程碑 [${missingMilestones.join(', ')}]`);
  const imageArtifacts = artifacts.filter((artifact) => ['screenshot', 'contact_sheet'].includes(artifact.type));
  if (task.taskMode === 'visual_implementation') {
    if (imageArtifacts.length === 0 || !imageArtifacts.some((artifact) => artifact.sourceStageId === task.resultRequirements.presentationStageId)) fail('RESULT_VISUAL_ARTIFACT_REQUIRED', '视觉成果包必须包含来自 presentation stage 的可解码截图');
  } else if (imageArtifacts.length === 0 && !nonEmpty(value.noScreenshotReason)) {
    fail('RESULT_NO_SCREENSHOT_REASON_REQUIRED', '非视觉 implementation 没有截图时必须说明原因');
  }
  return {
    resultManifestSchemaVersion: expectedManifestSchemaVersion,
    resultManifestPath,
    resultManifestDigest: createHash('sha256').update(raw, 'utf8').digest('hex'),
    sourceWorkspace,
    projectKey: value.projectKey,
    controllerThreadId: value.controllerThreadId,
    threadId: value.threadId,
    displayKey: value.displayKey,
    attempt: value.attempt,
    implementationPolicy: value.schemaVersion >= 2 ? value.implementationPolicy : (task.implementationPolicy ?? 'hard_contract'),
    contractVersion: value.contractVersion,
    contractDigest: value.contractDigest,
    candidateCommit: value.candidateCommit,
    manifestIntegrationStatus: value.integrationStatus,
    userVisibleSummary: value.userVisibleSummary.trim(),
    actualChanges,
    affectedFiles,
    validationRationale,
    incompleteItems,
    testSummary,
    noScreenshotReason: nonEmpty(value.noScreenshotReason) ? value.noScreenshotReason.trim() : null,
    artifacts,
  };
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

async function atomicWriteText(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(tempPath, 'wx');
    try {
      await handle.writeFile(value, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await replaceFileWithRetry(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    fail('REPORT_WRITE_FAILED', `无法原子写入 ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
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
const hardContractTask = (task) => implementationTask(task) && task.implementationPolicy === 'hard_contract';
const adaptiveBriefTask = (task) => implementationTask(task) && task.implementationPolicy === 'adaptive_brief';
const contractReady = (task) => !implementationTask(task)
  || (adaptiveBriefTask(task) && task.briefSchemaVersion === IMPLEMENTATION_BRIEF_SCHEMA_VERSION && isObject(task.implementationBrief) && /^[0-9a-f]{64}$/.test(task.briefDigest ?? ''))
  || (hardContractTask(task) && IMPLEMENTATION_CONTRACT_SCHEMA_VERSIONS.includes(task.contractSchemaVersion) && nonEmpty(task.implementationContractPath) && nonEmpty(task.contractDigest));
const dispatchAllowed = (task) => task.status === 'executing' && (!hasThreadControl(task) || task.titleSyncStatus === 'synced') && contractReady(task);
const currentAttemptDispatched = (task) => Number.isInteger(task.lastDispatchedAttempt) && task.lastDispatchedAttempt === (task.attemptCount ?? 1) && isTimestamp(task.lastDispatchedAt);
const childArtifactAllowed = (task) => task.status === 'executing' && contractReady(task) && currentAttemptDispatched(task);

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

function emptyContractControl(taskMode = 'legacy_unclassified') {
  return {
    taskMode,
    implementationPolicy: null,
    scopePolicy: null,
    implementationBriefPath: null,
    briefSchemaVersion: null,
    implementationBrief: null,
    briefDigest: null,
    hardContractTrigger: null,
    hardContractReason: null,
    contractSchemaVersion: null,
    implementationContractPath: null,
    contractDigest: null,
    contractRevision: null,
    contractCommit: null,
    allowedWritePaths: [],
    reuseRequirements: [],
    forbiddenNewPaths: [],
    forbiddenReimplementations: [],
    stageGates: [],
    evidenceCommands: [],
    errorPolicy: null,
    validationPolicy: null,
    visualOracle: null,
    resultProtocolVersion: 0,
    resultRequirements: null,
    deliverableHistory: [],
    stageProgress: [],
    incidentalRepairs: [],
  };
}

function ensureImplementationControl(tasks) {
  return tasks.map((task) => {
    if (!('taskMode' in task)) return { ...task, ...emptyContractControl('legacy_unclassified') };
    const isImplementation = task.taskMode === 'implementation' || task.taskMode === 'visual_implementation';
    const implementationPolicy = task.implementationPolicy ?? (isImplementation ? (nonEmpty(task.implementationContractPath) ? 'hard_contract' : 'adaptive_brief') : null);
    const scopePolicy = task.scopePolicy ?? (isImplementation ? (implementationPolicy === 'hard_contract' ? 'strict_scope' : 'bounded_incidental') : null);
    const legacyBrief = isImplementation ? validateImplementationBriefManifest({
      schemaVersion: IMPLEMENTATION_BRIEF_SCHEMA_VERSION,
      objective: task.scope ?? task.title,
      explorationHints: ['先探索真实调用链和既有实现，再决定修改位置。'],
      validationHints: [task.acceptance ?? '选择与实际修改相匹配的验证方法。'],
      safetyGuardrails: [task.forbiddenDecisions ?? '不得越过未解决决策。'],
    }) : null;
    const implementationBrief = task.implementationBrief ?? legacyBrief;
    const briefDigest = task.briefDigest ?? (implementationBrief === null ? null : createHash('sha256').update(JSON.stringify(implementationBrief), 'utf8').digest('hex'));
    return {
      ...task,
      implementationPolicy,
      scopePolicy,
      implementationBriefPath: task.implementationBriefPath ?? null,
      briefSchemaVersion: implementationBrief === null ? null : (task.briefSchemaVersion ?? IMPLEMENTATION_BRIEF_SCHEMA_VERSION),
      implementationBrief,
      briefDigest,
      contractDigest: implementationPolicy === 'adaptive_brief' ? briefDigest : task.contractDigest,
      hardContractTrigger: task.hardContractTrigger ?? (implementationPolicy === 'hard_contract' ? 'user_explicit' : null),
      hardContractReason: task.hardContractReason ?? (implementationPolicy === 'hard_contract' ? 'Legacy hard contract registered before risk-classified execution policies.' : null),
      validationPolicy: task.validationPolicy ?? null,
      resultProtocolVersion: Number.isInteger(task.resultProtocolVersion) ? task.resultProtocolVersion : 0,
      resultRequirements: task.resultRequirements ?? null,
      deliverableHistory: Array.isArray(task.deliverableHistory) ? task.deliverableHistory : [],
      stageProgress: Array.isArray(task.stageProgress) ? task.stageProgress : [],
      incidentalRepairs: Array.isArray(task.incidentalRepairs) ? task.incidentalRepairs : [],
      allowedWritePaths: Array.isArray(task.allowedWritePaths) ? task.allowedWritePaths : [],
    };
  });
}

function objectiveDefaults(task) {
  return {
    objectiveProtocolVersion: 0,
    objectiveId: null,
    replacementOfThreadId: null,
    replacementOrdinal: 0,
    objectiveBudgetMinutes: null,
    objectiveCreatedAt: null,
    failureHistory: [],
    diagnostics: [],
    closeout: null,
    executionEndedAt: null,
  };
}

function ensureObjectiveControl(tasks) {
  return tasks.map((task) => 'objectiveProtocolVersion' in task ? {
    ...task,
    failureHistory: Array.isArray(task.failureHistory) ? task.failureHistory : [],
    diagnostics: Array.isArray(task.diagnostics) ? task.diagnostics : [],
    closeout: task.closeout ?? null,
    executionEndedAt: task.executionEndedAt ?? null,
  } : { ...task, ...objectiveDefaults(task) });
}

function parallelTaskDefaults() {
  return { parallelProtocolVersion: 0, parallelBatchId: null, parallelCandidateId: null, parallelLane: null, parallelConflictDomains: [], parallelReviewCost: null, parallelWorktreeIdentity: null };
}

function ensureParallelTaskControl(tasks) {
  return tasks.map((task) => 'parallelProtocolVersion' in task ? {
    ...task,
    parallelConflictDomains: Array.isArray(task.parallelConflictDomains) ? task.parallelConflictDomains : [],
    parallelWorktreeIdentity: task.parallelWorktreeIdentity ?? null,
  } : { ...task, ...parallelTaskDefaults() });
}

function observabilityDefaults() {
  return { observabilityProtocolVersion: 0, observabilityReceipts: [] };
}

function ensureObservabilityControl(tasks) {
  return tasks.map((task) => 'observabilityProtocolVersion' in task ? {
    ...task,
    observabilityReceipts: Array.isArray(task.observabilityReceipts) ? task.observabilityReceipts : [],
  } : { ...task, ...observabilityDefaults() });
}

function appendObservabilityReceipt(task, phase, observedAt = new Date().toISOString(), outcome = 'succeeded') {
  if (task.observabilityProtocolVersion !== OBSERVABILITY_PROTOCOL_VERSION) return task;
  if (!OBSERVABILITY_PHASES.includes(phase) || !isTimestamp(observedAt)) fail('OBSERVABILITY_RECEIPT_INVALID', 'observability phase 或时间无效');
  const attempt = Number.isInteger(task.attemptCount) && task.attemptCount > 0 ? task.attemptCount : 1;
  const receipt = {
    schemaVersion: 1,
    eventName: 'task_lifecycle',
    phase,
    outcome,
    wallTimeUtc: observedAt,
    monotonicTimeNs: process.hrtime.bigint().toString(),
    clockId: OBSERVABILITY_CLOCK_ID,
    threadId: task.threadId,
    taskId: task.threadId,
    turnId: null,
    requestId: null,
    callId: null,
    correlationId: `${task.threadId}:attempt-${attempt}:${phase}:${observedAt}:${task.observabilityReceipts.length + 1}`,
    attempt,
    source: 'task_control',
    confidence: 'direct',
  };
  return { ...task, observabilityReceipts: [...task.observabilityReceipts, receipt] };
}

function controllerHealthFor(registry, controllerThreadId) {
  return (registry.controllerHealth ?? []).find((entry) => entry.controllerThreadId === controllerThreadId) ?? null;
}

function preparedHandoffFor(registry, controllerThreadId) {
  return (registry.controllerHandoffs ?? []).find((entry) => entry.sourceControllerThreadId === controllerThreadId && entry.status === 'prepared') ?? null;
}

function acceptedHandoffFor(registry, controllerThreadId) {
  return (registry.controllerHandoffs ?? []).findLast((entry) => entry.sourceControllerThreadId === controllerThreadId && entry.status === 'accepted') ?? null;
}

function assertControllerHealthyForDispatch(registry, controllerThreadId) {
  const health = controllerHealthFor(registry, controllerThreadId);
  if (health?.status === 'handoff_required') fail('CONTROLLER_HANDOFF_REQUIRED', `主控 ${controllerThreadId} 已达到 handoff_required；必须先生成结构化 handoff 并迁移干净主控`);
  const handoff = preparedHandoffFor(registry, controllerThreadId);
  if (handoff) fail('CONTROLLER_HANDOFF_PREPARED', `主控 ${controllerThreadId} 已准备交接 ${handoff.handoffId}；必须由 successor 接受或由 source 取消后才能登记或派发新工作`);
  const accepted = acceptedHandoffFor(registry, controllerThreadId);
  if (accepted) fail('CONTROLLER_RETIRED', `主控 ${controllerThreadId} 已交接给 ${accepted.successorThreadId}；旧主控不能再登记或派发新工作`);
  const heartbeat = registry.controllerHeartbeats.find((entry) => entry.controllerThreadId === controllerThreadId);
  const watchdog = heartbeat === undefined ? null : heartbeatEvidenceDefaults(heartbeat);
  if (watchdog?.disabledAt !== null && watchdog?.disabledAt !== undefined && watchdog.disableReason?.includes('without business progress')) {
    fail('CONTROLLER_HEALTH_REVIEW_REQUIRED', `主控 ${controllerThreadId} 的无进展 watchdog 已熔断；先审查停滞任务、完成 heartbeat 清理，再显式 resume，不能继续派发新工作`);
  }
}

function objectiveTasks(tasks, objectiveId) {
  return tasks.filter((task) => task.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION && task.objectiveId === objectiveId);
}

export function failureValueClassForDomain(failureDomain) {
  if (!has(failureDomain, FAILURE_DOMAINS)) fail('FAILURE_DOMAIN_INVALID', `failureDomain 无效: ${failureDomain}`);
  return ['test', 'implementation'].includes(failureDomain) ? 'product' : 'control_plane';
}

function objectiveRuntime(tasks, objectiveId, now = Date.now()) {
  const members = objectiveTasks(tasks, objectiveId);
  const cumulativeExecutionMs = members.reduce((sum, task) => {
    if (!isTimestamp(task.lastDispatchedAt)) return sum;
    const end = isTimestamp(task.executionEndedAt) ? Date.parse(task.executionEndedAt) : now;
    return sum + Math.max(0, end - Date.parse(task.lastDispatchedAt));
  }, 0);
  const failedReplacementCount = members.filter((task) => {
    if (task.replacementOrdinal <= 0 || !['changes_requested', 'reclaimed', 'blocked'].includes(task.status) || task.candidateCommit !== null) return false;
    const failure = [...(task.failureHistory ?? [])].reverse().find((entry) => ['contract_evidence', 'worker_evidence'].includes(entry.authority ?? 'contract_evidence') && entry.attemptCount === task.attemptCount);
    return failure !== undefined && failureValueClassForDomain(failure.failureDomain) === 'product';
  }).length;
  const budgetMinutes = members.find((task) => Number.isInteger(task.objectiveBudgetMinutes))?.objectiveBudgetMinutes ?? DEFAULT_OBJECTIVE_BUDGET_MINUTES;
  const reasons = [];
  if (failedReplacementCount >= OBJECTIVE_FUSE_REPLACEMENT_LIMIT) reasons.push('replacement_limit_reached');
  if (cumulativeExecutionMs >= budgetMinutes * 60 * 1000) reasons.push('objective_time_budget_exceeded');
  return { objectiveId, taskCount: members.length, replacementCount: members.filter((task) => task.replacementOrdinal > 0).length, failedReplacementCount, cumulativeExecutionMs, budgetMinutes, candidateCount: members.filter((task) => nonEmpty(task.candidateCommit)).length, completionCount: members.filter((task) => isTimestamp(task.completionEventCreatedAt)).length, fuseOpen: reasons.length > 0, reasons };
}

function closeoutComplete(task) {
  return task.closeout !== null && task.closeout.notificationStatus === 'sent' && task.closeout.reportStatus === 'synced';
}

function implementationTask(task) {
  return task.taskMode === 'implementation' || task.taskMode === 'visual_implementation';
}

function contractVersion(task) {
  if (!implementationTask(task)) return null;
  if (adaptiveBriefTask(task)) return `brief-v${task.briefSchemaVersion}`;
  return task.contractRevision ?? task.contractCommit;
}

function currentStageProgress(task) {
  return (task.stageProgress ?? []).filter((entry) => entry.attemptCount === (task.attemptCount ?? 1));
}

function carriedStageProgressForMechanicalRework(task, nextAttempt, carriedAt) {
  if (!implementationTask(task)) return [];
  const failure = [...(task.failureHistory ?? [])].reverse().find((entry) => (entry.authority ?? 'contract_evidence') === 'contract_evidence'
    && entry.failureClass === 'mechanical'
    && entry.mechanicalRetryEligible === true
    && entry.attemptCount === task.attemptCount
    && task.stageGates.some((gate) => gate.id === entry.attemptedStage));
  if (!failure) return [];
  const failedIndex = task.stageGates.findIndex((gate) => gate.id === failure.attemptedStage);
  const predecessorIds = new Set(task.stageGates.slice(0, failedIndex).map((gate) => gate.id));
  return currentStageProgress(task)
    .filter((entry) => predecessorIds.has(entry.stageId))
    .map((entry) => ({ ...entry, attemptCount: nextAttempt, carriedFromAttempt: task.attemptCount, carriedAt }));
}

function completedStageIds(task) {
  return [...new Set(currentStageProgress(task).map((entry) => entry.stageId))];
}

function missingRequiredStageIds(task) {
  if (!implementationTask(task)) return [];
  const completed = new Set(completedStageIds(task));
  return task.stageGates.filter((gate) => gate.required && !completed.has(gate.id)).map((gate) => gate.id);
}

function contractSummary(task) {
  return { taskMode: task.taskMode ?? 'legacy_unclassified', implementationPolicy: task.implementationPolicy ?? null, scopePolicy: task.scopePolicy ?? null, contractVersion: contractVersion(task), contractDigest: adaptiveBriefTask(task) ? task.briefDigest : (task.contractDigest ?? null), resultProtocolVersion: task.resultProtocolVersion ?? 0, completedStages: completedStageIds(task), missingStages: missingRequiredStageIds(task), incidentalRepairCount: task.incidentalRepairs?.length ?? 0, deliverableCount: task.deliverableHistory?.length ?? 0 };
}

async function assertImplementationContractCurrent(task, projectRoot) {
  if (!implementationTask(task) || adaptiveBriefTask(task)) return;
  const current = await loadImplementationContract(projectRoot ?? dirname(task.implementationContractPath), task.implementationContractPath, task.taskMode, { requireResultRequirements: task.resultProtocolVersion === RESULT_PROTOCOL_VERSION });
  if (current.contractDigest !== task.contractDigest || current.contractSchemaVersion !== task.contractSchemaVersion) fail('IMPLEMENTATION_CONTRACT_DRIFT', '实施合同内容或 schema 已变化；主控必须收回任务并绑定新 revision，worker 不得自行改变合同或 errorPolicy');
}

function normalizeEvidenceReferences(value = []) {
  if (!Array.isArray(value)) fail('STAGE_EVIDENCE_INVALID', '阶段证据必须是数组');
  const seen = new Set();
  return value.map((entry) => {
    if (!isObject(entry) || !nonEmpty(entry.id) || !nonEmpty(entry.reference)) fail('STAGE_EVIDENCE_INVALID', '每条阶段证据必须包含非空 id 和 reference');
    const id = entry.id.trim();
    if (seen.has(id)) fail('STAGE_EVIDENCE_INVALID', `阶段证据 id 重复: ${id}`);
    seen.add(id);
    return { id, reference: entry.reference.trim() };
  });
}

function normalizeRepairAffectedFiles(value = []) {
  if (!Array.isArray(value) || value.length === 0) fail('INCIDENTAL_REPAIR_FILES_REQUIRED', '附带修复必须记录至少一个实际影响文件');
  const seen = new Set();
  return value.map((entry) => {
    if (!isObject(entry) || !nonEmpty(entry.path) || !nonEmpty(entry.reason) || !has(entry.changeType, RESULT_FILE_CHANGE_TYPES)) fail('INCIDENTAL_REPAIR_FILE_INVALID', '影响文件必须包含项目相对 path、changeType 和 reason');
    if (win32.isAbsolute(entry.path) || entry.path.replaceAll('/', '\\').split('\\').includes('..')) fail('INCIDENTAL_REPAIR_FILE_INVALID', `影响文件必须留在项目内: ${entry.path}`);
    const path = entry.path.trim().replaceAll('\\', '/');
    const key = path.toLowerCase();
    if (seen.has(key)) fail('INCIDENTAL_REPAIR_FILE_INVALID', `影响文件重复: ${path}`);
    seen.add(key);
    return { path, changeType: entry.changeType, reason: entry.reason.trim() };
  });
}

function validateIncidentalRepairReceipt(value, task) {
  const allowed = new Set(['schemaVersion', 'type', 'projectKey', 'threadId', 'parentThreadId', 'controllerThreadId', 'displayKey', 'title', 'attemptCount', 'repairId', 'originalBlocker', 'sameObjectiveReason', 'functionalDomain', 'affectedFiles', 'conflictDomains', 'localOnly', 'reversible', ...INCIDENTAL_REPAIR_RISK_FLAGS, 'riskAssessment', 'redEvidence', 'greenEvidence', 'contractVersion', 'contractDigest', 'createdAt']);
  if (!isObject(value) || value.schemaVersion !== INCIDENTAL_REPAIR_PROTOCOL_VERSION || value.type !== 'incidental_repair' || Object.keys(value).some((key) => !allowed.has(key))) fail('INCIDENTAL_REPAIR_INVALID', '附带修复回执 schema 或字段无效');
  if (!adaptiveBriefTask(task) || task.scopePolicy !== 'bounded_incidental') fail('INCIDENTAL_REPAIR_NOT_ALLOWED', '只有 bounded_incidental 的 adaptive_brief 可以在同任务内附带修复');
  if (value.threadId !== task.threadId || value.parentThreadId !== task.parentThreadId || value.controllerThreadId !== task.directControllerThreadId || value.displayKey !== task.displayKey || !Number.isInteger(value.attemptCount) || value.attemptCount < 1 || value.attemptCount > task.attemptCount || !isTimestamp(value.createdAt)) fail('INCIDENTAL_REPAIR_OWNERSHIP_MISMATCH', '附带修复回执的任务身份、attempt 或时间不匹配');
  if (!isSafeThreadId(value.repairId) || !nonEmpty(value.originalBlocker) || !nonEmpty(value.sameObjectiveReason) || !nonEmpty(value.functionalDomain) || !nonEmpty(value.riskAssessment)) fail('INCIDENTAL_REPAIR_INVALID', '附带修复缺少 repairId、阻塞、同目标理由、功能域或风险判断');
  if (value.localOnly !== true || value.reversible !== true || INCIDENTAL_REPAIR_RISK_FLAGS.some((flag) => value[flag] !== false)) fail('INCIDENTAL_REPAIR_ESCALATION_REQUIRED', '该改动涉及禁止风险或无法证明本地可逆，必须停止并交回直接主控');
  const affectedFiles = normalizeRepairAffectedFiles(value.affectedFiles);
  if (!Array.isArray(value.conflictDomains) || !value.conflictDomains.every(isSafeThreadId) || new Set(value.conflictDomains).size !== value.conflictDomains.length) fail('INCIDENTAL_REPAIR_CONFLICT_DOMAIN_INVALID', 'conflictDomains 必须是无重复安全标识数组');
  const registeredDomains = new Set(task.parallelConflictDomains ?? []);
  if (value.conflictDomains.some((domain) => !registeredDomains.has(domain))) fail('INCIDENTAL_REPAIR_CROSS_CONFLICT_DOMAIN', '附带修复跨越未登记 conflict domain，必须交回直接主控');
  const redEvidence = normalizeEvidenceReferences(value.redEvidence);
  const greenEvidence = normalizeEvidenceReferences(value.greenEvidence);
  if (redEvidence.length === 0 || greenEvidence.length === 0) fail('INCIDENTAL_REPAIR_EVIDENCE_REQUIRED', '附带修复必须同时提供真实 RED 和 GREEN（或等价前后）证据');
  if (value.contractVersion !== contractVersion(task) || value.contractDigest !== task.contractDigest) fail('EVENT_CONTRACT_MISMATCH', '附带修复回执绑定的简报版本已变化');
  return { ...value, affectedFiles, conflictDomains: [...value.conflictDomains], redEvidence, greenEvidence };
}

function validateStageCheckpoint(task, stageId, evidence, { pendingStages = new Map() } = {}) {
  if (!implementationTask(task)) {
    if (stageId !== undefined || (Array.isArray(evidence) && evidence.length > 0)) fail('STAGE_NOT_APPLICABLE', 'control_only/legacy 任务不得提交实施阶段证据');
    return { stageId: null, evidence: [] };
  }
  if (adaptiveBriefTask(task)) {
    const normalizedStageId = nonEmpty(stageId) ? stageId.trim() : null;
    if (normalizedStageId === null) return { stageId: null, evidence: normalizeEvidenceReferences(evidence) };
    if (!isSafeThreadId(normalizedStageId)) fail('STAGE_UNKNOWN', `stage id 无效: ${normalizedStageId}`);
    return { stageId: normalizedStageId, evidence: normalizeEvidenceReferences(evidence) };
  }
  if (!nonEmpty(stageId)) fail('STAGE_REQUIRED', 'hard contract implementation progress 必须提供已登记的 stage');
  const normalizedStageId = stageId.trim();
  const gateIndex = task.stageGates.findIndex((gate) => gate.id === normalizedStageId);
  if (gateIndex < 0) fail('STAGE_UNKNOWN', `未登记的 stage: ${normalizedStageId}`);
  if (completedStageIds(task).includes(normalizedStageId) || pendingStages.has(normalizedStageId)) fail('STAGE_ALREADY_COMPLETED', `当前轮次 stage 已完成或已提交待入账: ${normalizedStageId}`);
  const completed = new Set(completedStageIds(task));
  let newestPendingPredecessorAt = null;
  const missingPredecessors = [];
  for (const gate of task.stageGates.slice(0, gateIndex)) {
    if (!gate.required || completed.has(gate.id)) continue;
    const pending = pendingStages.get(gate.id) ?? [];
    if (pending.length === 0) {
      missingPredecessors.push(gate.id);
      continue;
    }
    if (pending.length !== 1) fail('STAGE_PREDECESSOR_DUPLICATE', `待入账前置阶段存在重复事件: ${gate.id}`);
    const createdAt = pending[0].createdAt;
    if (newestPendingPredecessorAt !== null && Date.parse(createdAt) <= Date.parse(newestPendingPredecessorAt)) fail('STAGE_PREDECESSOR_ORDER_INVALID', `待入账前置阶段时间顺序无效: ${gate.id}`);
    newestPendingPredecessorAt = createdAt;
  }
  if (missingPredecessors.length > 0) fail('STAGE_ORDER_INVALID', `必须先完成阶段: ${missingPredecessors.join(', ')}`);
  const normalizedEvidence = normalizeEvidenceReferences(evidence);
  const knownEvidence = new Set(task.evidenceCommands.map((entry) => entry.id));
  const unknown = normalizedEvidence.filter((entry) => !knownEvidence.has(entry.id)).map((entry) => entry.id);
  if (unknown.length > 0) fail('STAGE_EVIDENCE_UNKNOWN', `未登记的 evidence id: ${unknown.join(', ')}`);
  const supplied = new Set(normalizedEvidence.map((entry) => entry.id));
  const gate = task.stageGates[gateIndex];
  const missingEvidence = gate.requiredEvidence.filter((id) => !supplied.has(id));
  if (missingEvidence.length > 0) fail('STAGE_EVIDENCE_MISSING', `stage ${normalizedStageId} 缺少证据: ${missingEvidence.join(', ')}`);
  return { stageId: normalizedStageId, evidence: normalizedEvidence };
}

function pendingStageFromEvent(paths, task, event) {
  if (!implementationTask(task)
    || event.projectKey !== paths.projectKey
    || event.threadId !== task.threadId
    || event.parentThreadId !== task.parentThreadId
    || event.controllerThreadId !== task.directControllerThreadId
    || event.attemptCount !== task.attemptCount
    || event.taskMode !== task.taskMode
    || event.contractDigest !== task.contractDigest
    || event.contractVersion !== contractVersion(task)
    || !isTimestamp(event.createdAt)
    || Date.parse(event.createdAt) > Date.now() + 60_000) return null;
  const freshnessAnchor = latestTimestamp(task.progressEventCreatedAt, task.lastDispatchedAt) ?? task.updatedAt;
  if (Date.parse(event.createdAt) <= Date.parse(freshnessAnchor) || !nonEmpty(event.stageId)) return null;
  const gate = task.stageGates.find((candidate) => candidate.id === event.stageId.trim());
  if (!gate) return null;
  try {
    const evidence = normalizeEvidenceReferences(event.evidence ?? []);
    const knownEvidence = new Set(task.evidenceCommands.map((entry) => entry.id));
    if (evidence.some((entry) => !knownEvidence.has(entry.id))) return null;
    const supplied = new Set(evidence.map((entry) => entry.id));
    if (gate.requiredEvidence.some((id) => !supplied.has(id))) return null;
  } catch {
    return null;
  }
  return { stageId: gate.id, createdAt: event.createdAt };
}

async function pendingStagesForCreation(paths, task) {
  const pendingStages = new Map();
  for (const eventPath of await listTaskEventFiles(paths, task)) {
    if (artifactTypeForPath(eventPath) !== 'task_progress') continue;
    let event;
    try {
      event = await readArtifact(eventPath, 'task_progress');
    } catch {
      continue;
    }
    const stage = pendingStageFromEvent(paths, task, event);
    if (stage === null) continue;
    const existing = pendingStages.get(stage.stageId) ?? [];
    existing.push(stage);
    pendingStages.set(stage.stageId, existing);
  }
  return pendingStages;
}

async function pendingIncidentalRepairs(paths, task, beforeAt = null) {
  const ingestedIds = new Set((task.incidentalRepairs ?? []).map((repair) => repair.repairId));
  const pending = [];
  for (const eventPath of await listTaskEventFiles(paths, task)) {
    if (artifactTypeForPath(eventPath) !== 'incidental_repair') continue;
    let event;
    try {
      event = await readArtifact(eventPath, 'incidental_repair');
      if (ingestedIds.has(event.repairId) || event.attemptCount !== task.attemptCount || (beforeAt !== null && Date.parse(event.createdAt) > Date.parse(beforeAt))) continue;
      pending.push(validateIncidentalRepairReceipt(event, task));
    } catch {
      continue;
    }
  }
  return pending.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function assertEventContractMatches(task, event) {
  if (!implementationTask(task)) return;
  const summary = contractSummary(task);
  if (event.taskMode !== task.taskMode || event.contractDigest !== summary.contractDigest || event.contractVersion !== summary.contractVersion) fail('EVENT_CONTRACT_MISMATCH', '事件绑定的实施合同与台账当前合同不一致');
}

function ensureDispatchControl(tasks) {
  return tasks.map((task) => {
    if ('lastDispatchedAttempt' in task || 'lastDispatchedAt' in task) return task;
    const attemptCount = task.attemptCount ?? 1;
    return {
      ...task,
      lastDispatchedAttempt: attemptCount,
      lastDispatchedAt: task.updatedAt,
    };
  });
}

function ensureRecoveryControl(tasks) {
  return tasks.map((task) => ({ ...task, pendingRework: task.pendingRework ?? null, contractAmendmentHistory: Array.isArray(task.contractAmendmentHistory) ? task.contractAmendmentHistory : [] }));
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
      if (!Array.isArray(controlled.threadActionHistory)) controlled.threadActionHistory = [];
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
    controlled.threadActionHistory = [];
    return controlled;
  });
}

function ensureTaskControls(tasks, rootControllers) {
  return ensureRecoveryControl(ensureObservabilityControl(ensureParallelTaskControl(ensureDispatchControl(ensureExecutionControl(ensureObjectiveControl(ensureImplementationControl(ensureThreadControl(tasks, rootControllers))))))));
}

function parallelTaskState(task) {
  if (!task) return 'proposed';
  if (task.status === 'executing') return currentAttemptDispatched(task) ? 'running' : 'registered';
  if (PARALLEL_CANDIDATE_STATES.includes(task.status)) return task.status;
  return 'deferred';
}

function activeParallelTask(task) {
  return task.parallelProtocolVersion === PARALLEL_BATCH_PROTOCOL_VERSION && ['executing', 'awaiting_review', 'changes_requested', 'accepted'].includes(task.status) && (task.status !== 'executing' || currentAttemptDispatched(task));
}

function validateParallelBatchRecord(value, tasks, knownControllers, projectRoot) {
  if (!isObject(value) || value.protocolVersion !== PARALLEL_BATCH_PROTOCOL_VERSION || !isSafeThreadId(value.controllerThreadId) || !knownControllers.has(value.controllerThreadId) || !has(value.status, PARALLEL_BATCH_STATUSES)) fail('REGISTRY_INVALID', 'parallel batch identity/status 无效');
  if (!Array.isArray(value.candidates)) fail('REGISTRY_INVALID', 'parallel batch candidates 无效');
  const manifest = validateParallelBatchManifest({ schemaVersion: value.protocolVersion, batchId: value.batchId, objective: value.objective, dispatchAuthority: value.dispatchAuthority, reviewCapacity: value.reviewCapacity, wipLimits: value.wipLimits, dirtyConflictDomains: value.dirtyConflictDomains, degradationReceipt: value.degradationReceipt, candidates: value.candidates.map((candidate) => ({ candidateId: candidate.candidateId, title: candidate.title, incrementalValue: candidate.incrementalValue, lane: candidate.lane, workClass: candidate.workClass, taskMode: candidate.taskMode, conflictDomains: candidate.conflictDomains, dependencies: candidate.dependencies, reviewCost: candidate.reviewCost, estimatedMinutes: candidate.estimatedMinutes, blockingReasons: candidate.blockingReasons, persistentLane: candidate.persistentLane, worktreeIdentity: candidate.worktreeIdentity })) }, projectRoot, { allowLegacyMissingIncrementalValue: true });
  if (!nonEmpty(value.manifestPath) || !win32.isAbsolute(value.manifestPath) || !windowsPathInside(value.manifestPath, projectRoot) || !/^[0-9a-f]{64}$/.test(value.manifestDigest ?? '')) fail('REGISTRY_INVALID', 'parallel batch manifest path/digest 无效');
  if (!Array.isArray(value.pendingDispatchCandidateIds) || new Set(value.pendingDispatchCandidateIds).size !== value.pendingDispatchCandidateIds.length || value.pendingDispatchCandidateIds.some((id) => !manifest.candidates.some((candidate) => candidate.candidateId === id))) fail('REGISTRY_INVALID', 'parallel batch pendingDispatchCandidateIds 无效');
  if ((value.dispatchWaveId !== null && !isSafeThreadId(value.dispatchWaveId)) || !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) || (value.closedAt !== null && !isTimestamp(value.closedAt))) fail('REGISTRY_INVALID', 'parallel batch wave/time 无效');
  if (value.status === 'dispatching' && (value.pendingDispatchCandidateIds.length === 0 || value.dispatchWaveId === null)) fail('REGISTRY_INVALID', 'dispatching batch 必须保留 pending wave');
  if (value.status !== 'dispatching' && value.pendingDispatchCandidateIds.length > 0) fail('REGISTRY_INVALID', '非 dispatching batch 不得保留 pending wave');
  if (value.status === 'closed' && value.closedAt === null) fail('REGISTRY_INVALID', 'closed batch 必须记录 closedAt');
  const threadIds = new Set();
  const candidates = manifest.candidates.map((candidate, index) => {
    const stored = value.candidates[index];
    if (stored.threadId !== null) {
      if (!isSafeThreadId(stored.threadId) || threadIds.has(stored.threadId)) fail('REGISTRY_INVALID', 'parallel candidate threadId 无效或重复');
      threadIds.add(stored.threadId);
      const task = tasks.find((entry) => entry.threadId === stored.threadId);
      if (!task || task.directControllerThreadId !== value.controllerThreadId || task.parallelProtocolVersion !== PARALLEL_BATCH_PROTOCOL_VERSION || task.parallelBatchId !== value.batchId || task.parallelCandidateId !== stored.candidateId) fail('REGISTRY_INVALID', 'parallel candidate 与 task 绑定不一致');
      if (!isTimestamp(stored.registeredAt)) fail('REGISTRY_INVALID', 'parallel candidate registeredAt 无效');
    } else if (stored.registeredAt !== null) fail('REGISTRY_INVALID', '未绑定 candidate 不得记录 registeredAt');
    return { ...candidate, threadId: stored.threadId, registeredAt: stored.registeredAt };
  });
  return { ...value, ...manifest, controllerThreadId: value.controllerThreadId, status: value.status, manifestPath: value.manifestPath, manifestDigest: value.manifestDigest, pendingDispatchCandidateIds: [...value.pendingDispatchCandidateIds], dispatchWaveId: value.dispatchWaveId, createdAt: value.createdAt, updatedAt: value.updatedAt, closedAt: value.closedAt, candidates };
}

function parallelBatchRuntime(registry, batch) {
  const controllerTasks = registry.tasks.filter((task) => task.directControllerThreadId === batch.controllerThreadId);
  const activeTasks = controllerTasks.filter(activeParallelTask);
  const activeConflictDomains = new Set(activeTasks.flatMap((task) => task.parallelConflictDomains));
  const usedReviewCapacity = activeTasks.reduce((sum, task) => sum + (task.parallelReviewCost ?? 0), 0);
  const activeLaneCounts = Object.fromEntries(PARALLEL_LANES.map((lane) => [lane, activeTasks.filter((task) => task.parallelLane === lane).length]));
  const stateByCandidate = new Map();
  for (const candidate of batch.candidates) {
    const task = candidate.threadId === null ? null : registry.tasks.find((entry) => entry.threadId === candidate.threadId);
    let state = parallelTaskState(task);
    const blockers = [...candidate.blockingReasons];
    const dependenciesIntegrated = candidate.dependencies.every((dependency) => {
      const dependencyCandidate = batch.candidates.find((entry) => entry.candidateId === dependency.candidateId);
      const dependencyTask = dependencyCandidate?.threadId === null ? null : registry.tasks.find((entry) => entry.threadId === dependencyCandidate.threadId);
      return dependencyTask?.status === 'integrated';
    });
    if (!dependenciesIntegrated) blockers.push('unresolved_dependencies');
    if (candidate.conflictDomains.some((domain) => batch.dirtyConflictDomains.includes(domain))) blockers.push('dirty_conflict_domain');
    if (['proposed', 'registered'].includes(state) && blockers.length > 0) state = 'deferred';
    else if (state === 'proposed') state = 'eligible';
    stateByCandidate.set(candidate.candidateId, { candidate, task, state, blockers: [...new Set(blockers)] });
  }
  const selectable = batch.candidates.filter((candidate) => ['eligible', 'registered'].includes(stateByCandidate.get(candidate.candidateId).state));
  const implementationCandidates = selectable.filter((candidate) => candidate.lane === 'implementation');
  const independentCandidates = selectable.filter((candidate) => candidate.lane !== 'implementation');
  const priorityCandidates = implementationCandidates.length > 0 && independentCandidates.length > 0
    ? [implementationCandidates[0], independentCandidates[0], ...selectable.filter((candidate) => ![implementationCandidates[0].candidateId, independentCandidates[0].candidateId].includes(candidate.candidateId))]
    : selectable;
  const selected = [];
  let remainingTotal = Math.max(0, batch.wipLimits.total - activeTasks.length);
  let remainingReview = Math.max(0, batch.reviewCapacity - usedReviewCapacity);
  const selectedDomains = new Set();
  for (const candidate of priorityCandidates) {
    const runtime = stateByCandidate.get(candidate.candidateId);
    if (!['eligible', 'registered'].includes(runtime.state) || remainingTotal < 1 || remainingReview < candidate.reviewCost) continue;
    if (activeLaneCounts[candidate.lane] + selected.filter((entry) => entry.lane === candidate.lane).length >= batch.wipLimits[candidate.lane]) continue;
    if (candidate.conflictDomains.some((domain) => activeConflictDomains.has(domain) || selectedDomains.has(domain))) continue;
    selected.push(candidate);
    remainingTotal -= 1;
    remainingReview -= candidate.reviewCost;
    for (const domain of candidate.conflictDomains) selectedDomains.add(domain);
  }
  const requiredFanoutCandidateIds = selected.length >= 2 ? selected.map((candidate) => candidate.candidateId) : [];
  const eligibleCandidates = [...stateByCandidate.values()].filter((entry) => ['eligible', 'registered'].includes(entry.state)).map((entry) => ({ candidateId: entry.candidate.candidateId, title: entry.candidate.title, lane: entry.candidate.lane, threadId: entry.candidate.threadId, state: entry.state, blockers: entry.blockers }));
  const candidateStates = [...stateByCandidate.values()].map((entry) => ({ candidateId: entry.candidate.candidateId, title: entry.candidate.title, lane: entry.candidate.lane, threadId: entry.candidate.threadId, state: entry.state, blockers: entry.blockers }));
  const waveAlreadyStarted = batch.candidates.some((candidate) => {
    const task = candidate.threadId === null ? null : registry.tasks.find((entry) => entry.threadId === candidate.threadId);
    return task !== null && ((task.lastDispatchedAttempt ?? 0) > 0 || isTerminalTask(task) || ['awaiting_review', 'accepted'].includes(task.status));
  });
  const singleCandidateNeedsDegradation = selected.length === 1 && batch.degradationReceipt === null && !waveAlreadyStarted;
  const fanoutBlockers = [];
  if (remainingTotal === 0 && selected.length === 0) fanoutBlockers.push('wip_capacity_exhausted');
  if (remainingReview === 0 && selected.length === 0) fanoutBlockers.push('review_capacity_exhausted');
  if (singleCandidateNeedsDegradation) fanoutBlockers.push('degradation_receipt_required');
  return {
    batchId: batch.batchId,
    status: batch.status,
    controllerThreadId: batch.controllerThreadId,
    candidateStates,
    eligibleCandidates,
    requiredFanoutCandidateIds,
    fanoutRequired: requiredFanoutCandidateIds.length >= 2,
    singleDispatchAllowed: selected.length === 1 && (batch.degradationReceipt !== null || waveAlreadyStarted),
    naturalBatchShrink: selected.length === 1 && batch.degradationReceipt === null && waveAlreadyStarted,
    selectedCandidateIds: selected.map((candidate) => candidate.candidateId),
    idleConcurrencySlots: Math.max(0, batch.wipLimits.total - activeTasks.length),
    usedReviewCapacity,
    reviewCapacity: batch.reviewCapacity,
    activeLaneCounts,
    fanoutBlockers,
    pendingDispatchCandidateIds: [...batch.pendingDispatchCandidateIds],
    dispatchWaveId: batch.dispatchWaveId,
  };
}

function controllerParallelRuntime(registry, controllerThreadId) {
  const batches = (registry.parallelBatches ?? []).filter((batch) => batch.controllerThreadId === controllerThreadId && !['closed', 'frozen'].includes(batch.status)).map((batch) => parallelBatchRuntime(registry, batch));
  const pendingDispatches = batches.flatMap((batch) => batch.pendingDispatchCandidateIds.map((candidateId) => ({ batchId: batch.batchId, candidateId, dispatchWaveId: batch.dispatchWaveId })));
  const fanoutRequired = batches.some((batch) => batch.fanoutRequired);
  const actionableCandidates = batches.flatMap((batch) => batch.eligibleCandidates).length;
  const singleDispatchReady = batches.some((batch) => batch.singleDispatchAllowed);
  const postDispatchFanout = batches.some((batch) => ['running', 'reconciling'].includes(batch.status) && (batch.fanoutRequired || batch.singleDispatchAllowed));
  return { batches, pendingDispatches, fanoutRequired, actionableCandidates, singleDispatchReady, shouldKeepHeartbeat: pendingDispatches.length > 0 || postDispatchFanout };
}

function controllerThreadDebt(registry, controllerThreadId) {
  const queues = controllerWorkQueues(registry.tasks, controllerThreadId);
  const directMessages = (registry.controllerMessages ?? []).filter((message) => message.controllerThreadId === controllerThreadId);
  const reasons = [];
  if (queues.queuedTasks.length > 0) reasons.push('review_routing_or_closeout_pending');
  if (queues.cleanupTasks.length > 0) reasons.push('actionable_thread_action_pending');
  if (directMessages.some((message) => message.status === 'prepared')) reasons.push('message_action_pending');
  if (controllerHealthFor(registry, controllerThreadId)?.status === 'handoff_required') reasons.push('context_handoff_required');
  return { blocked: reasons.length > 0, reasons: [...new Set(reasons)] };
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
  if (task.titleSyncStatus === 'pending') actions.push({ type: 'set_thread_title', threadId: task.threadId, title: task.desiredThreadTitle });
  const descendantsArchived = descendantsOf(tasks, task.threadId).every((descendant) => descendant.archiveStatus === 'archived');
  if (isTerminalTask(task) && task.titleSyncStatus === 'synced' && task.archiveStatus === 'pending' && descendantsArchived) {
    actions.push({ type: 'set_thread_archived', threadId: task.threadId, archived: true });
  }
  return actions;
}

function cleanupActionability(task, tasks) {
  if (!isTerminalTask(task) || task.archiveStatus === 'archived') return 'none';
  if (threadActionsForTask(task, tasks).length > 0) return 'actionable';
  if (task.titleSyncStatus === 'failed') return 'title_failed';
  if (task.archiveStatus === 'failed') return 'archive_failed';
  if (descendantsOf(tasks, task.threadId).some((descendant) => descendant.archiveStatus !== 'archived')) return 'waiting_descendants';
  return 'none';
}

function appendThreadActionHistory(task, action, outcome, detail, recordedAt = new Date().toISOString()) {
  return { ...task, threadActionHistory: [...(task.threadActionHistory ?? []), { action, outcome, detail, recordedAt }] };
}

function preserveLegacyFailure(task, action, detail) {
  const history = task.threadActionHistory ?? [];
  if (history.some((entry) => entry.action === action && entry.outcome === 'failed' && entry.detail === detail)) return task;
  return appendThreadActionHistory(task, action, 'failed', detail, task.updatedAt);
}

export function heartbeatIntervalForTask(task) {
  if (task.workClass === 'bounded_reasoning' && task.thinking === 'high') return HEARTBEAT_INTERVALS_MS.bounded_reasoning_high;
  return HEARTBEAT_INTERVALS_MS.normal_single;
}

function taskLastMeaningfulProgressAt(task) {
  return latestTimestamp(task.controlPlaneRecovery?.status === 'completion_only' ? task.controlPlaneRecovery.preparedAt : null, task.incidentalRepairEventCreatedAt, task.progressEventCreatedAt, task.lastDispatchedAt);
}

function controllerHeartbeatInterval(queues, now = Date.now()) {
  if (queues.queuedTasks.length > 0 || queues.cleanupTasks.length > 0) return HEARTBEAT_INTERVALS_MS.controller_risk;
  if (queues.activeTasks.some((task) => {
    const lastMeaningfulProgressAt = taskLastMeaningfulProgressAt(task);
    return !isTimestamp(lastMeaningfulProgressAt) || now - Date.parse(lastMeaningfulProgressAt) >= heartbeatIntervalForTask(task);
  })) return HEARTBEAT_INTERVALS_MS.controller_risk;
  if (queues.activeTasks.length > 1
    || queues.parallel.pendingDispatches.length > 0
    || queues.parallel.batches.some((batch) => ['dispatching', 'running', 'reconciling'].includes(batch.status))) {
    return HEARTBEAT_INTERVALS_MS.parallel_batch;
  }
  if (queues.activeTasks.length === 1) return heartbeatIntervalForTask(queues.activeTasks[0]);
  return HEARTBEAT_INTERVALS_MS.controller_risk;
}

function controllerWorkQueues(tasks, controllerThreadId) {
  const directTasks = tasks.filter((task) => task.directControllerThreadId === controllerThreadId);
  const activeTasks = directTasks.filter((task) => task.status === 'executing' && currentAttemptDispatched(task));
  const routingTasks = directTasks.filter((task) => task.status === 'executing' && !currentAttemptDispatched(task));
  const queuedTasks = directTasks.filter((task) => ['awaiting_review', 'accepted', 'changes_requested'].includes(task.status) || (task.closeout !== null && !closeoutComplete(task)));
  const cleanupTasks = directTasks.filter((task) => cleanupActionability(task, tasks) === 'actionable');
  return { directTasks, activeTasks, routingTasks, queuedTasks, cleanupTasks, shouldKeepHeartbeat: activeTasks.length > 0 || queuedTasks.length > 0 || cleanupTasks.length > 0 };
}

function controllerCycleGate(registry, controllerThreadId, now = Date.now()) {
  const taskQueues = controllerWorkQueues(registry.tasks, controllerThreadId);
  const parallel = controllerParallelRuntime(registry, controllerThreadId);
  const found = registry.controllerHeartbeats.find((heartbeat) => heartbeat.controllerThreadId === controllerThreadId) ?? null;
  const state = found === null ? null : heartbeatEvidenceDefaults(found);
  const watchdogDisabled = state?.disabledAt !== null && state?.disabledAt !== undefined;
  const desiredHeartbeat = taskQueues.shouldKeepHeartbeat || parallel.shouldKeepHeartbeat;
  const queues = { ...taskQueues, parallel, desiredHeartbeat, shouldKeepHeartbeat: desiredHeartbeat && !watchdogDisabled };
  if (state !== null && state.pendingAction !== null) {
    const expired = now > Date.parse(state.pendingAction.expiresAt);
    const heartbeatAction = expired
      ? { type: 'compensate_timed_out_heartbeat_action', actionId: state.pendingAction.actionId, automationId: state.pendingAction.previousAutomationId, generation: state.pendingAction.generation, timeoutMs: HEARTBEAT_ACTION_TIMEOUT_MS, command: 'controller-record-heartbeat-action-failed --reason host_timeout' }
      : heartbeatActionForPending(state, state.pendingAction);
    if (parallel.pendingDispatches.length > 0) return { businessAllowed: false, reason: 'parallel_dispatch_wave_incomplete', queues, heartbeatState: state, heartbeatAction };
    return { businessAllowed: true, reason: null, queues, heartbeatState: state, heartbeatAction, heartbeatWarning: state.pendingAction.manualOnly === true ? 'watchdog_manual_cleanup_required' : expired ? 'pending_heartbeat_action_timed_out' : 'pending_heartbeat_action_unconfirmed' };
  }
  if (parallel.pendingDispatches.length > 0) return { businessAllowed: false, reason: 'parallel_dispatch_wave_incomplete', queues, heartbeatState: state, heartbeatAction: null };
  const undispatchedBootstrapOnly = state === null && queues.activeTasks.length === 0 && queues.cleanupTasks.length === 0 && queues.queuedTasks.length === 0 && queues.routingTasks.length > 0;
  if (undispatchedBootstrapOnly) return { businessAllowed: true, reason: null, queues, heartbeatState: null, heartbeatAction: null };
  if (watchdogDisabled) return { businessAllowed: true, reason: null, queues, heartbeatState: state, heartbeatAction: state.status === 'armed' && isSafeThreadId(state.automationId) ? { type: 'controller_finalize_cycle', automationId: state.automationId, generation: state.generation, command: 'controller-finalize-cycle' } : null, heartbeatWarning: 'watchdog_fused' };
  if (queues.shouldKeepHeartbeat && (state === null || state.status !== 'armed' || !isSafeThreadId(state.automationId))) return { businessAllowed: true, reason: null, queues, heartbeatState: state, heartbeatAction: { type: 'controller_finalize_cycle', command: 'controller-finalize-cycle' }, heartbeatWarning: 'confirmed_heartbeat_missing' };
  if (!queues.shouldKeepHeartbeat && state?.status === 'armed' && isSafeThreadId(state.automationId)) return { businessAllowed: true, reason: null, queues, heartbeatState: state, heartbeatAction: { type: 'controller_finalize_cycle', automationId: state.automationId, generation: state.generation, command: 'controller-finalize-cycle' }, heartbeatWarning: 'terminal_heartbeat_delete_required' };
  return { businessAllowed: true, reason: null, queues, heartbeatState: state, heartbeatAction: null };
}

function assertControllerCycleBusinessReady(registry, controllerThreadId, options = {}) {
  const gate = controllerCycleGate(registry, controllerThreadId);
  if (!gate.businessAllowed && options.allowHeartbeatBootstrap === true && gate.reason === 'confirmed_heartbeat_missing' && gate.heartbeatState?.pendingAction == null) return gate;
  if (!gate.businessAllowed) fail('CONTROLLER_CYCLE_RECONCILE_REQUIRED', `${gate.reason}; 先执行 controller-finalize-cycle 并真实完成返回的 host heartbeat action`);
  return gate;
}

function assertNoExpiredPendingHeartbeat(registry, controllerThreadId, now = Date.now()) {
  const found = registry.controllerHeartbeats.find((heartbeat) => heartbeat.controllerThreadId === controllerThreadId) ?? null;
  const pendingAction = found === null ? null : heartbeatEvidenceDefaults(found).pendingAction;
  return pendingAction !== null && now > Date.parse(pendingAction.expiresAt);
}

function heartbeatEvidenceDefaults(state) {
  const defaults = {
    logicalLeaseDueAt: state.status === 'armed' ? state.dueAt : null,
    logicalLeaseUpdatedAt: state.updatedAt,
    consecutiveNoProgressCycles: 0,
    lastCycleFingerprint: null,
    lastCycleReceiptKey: null,
    lastMeaningfulProgressAt: null,
    noProgressFuseCount: 0,
    manualResumeCount: 0,
    lastManualResumeAt: null,
    lastManualResumeReason: null,
  };
  if (state.protocolVersion === HEARTBEAT_PROTOCOL_VERSION) return { ...defaults, ...state };
  if (state.protocolVersion === 2) return { ...defaults, ...state, protocolVersion: HEARTBEAT_PROTOCOL_VERSION };
  return {
    ...state,
    protocolVersion: HEARTBEAT_PROTOCOL_VERSION,
    automationId: null,
    lastSuccessfulGeneration: state.generation,
    lastSuccessfulAt: state.updatedAt,
    pendingAction: null,
    consecutiveStaleCount: 0,
    lastStaleGeneration: null,
    lastStaleAt: null,
    observedAutomationId: null,
    observedGeneration: null,
    observedTriggerCount: 0,
    lastTriggeredAt: null,
    actionFailureCount: 0,
    deleteFailureCount: 0,
    disabledAt: null,
    disableReason: null,
    notificationStatus: 'not_required',
    actionHistory: [],
    retiredAutomationIds: [],
    ...defaults,
  };
}

function heartbeatDesiredState(controllerThreadId, generation, queues, reason, triggerTaskThreadId, now) {
  const intervalMs = controllerHeartbeatInterval(queues, now.getTime());
  const updatedAt = now.toISOString();
  return queues.shouldKeepHeartbeat
    ? { controllerThreadId, generation, status: 'armed', dueAt: new Date(now.getTime() + intervalMs).toISOString(), intervalMs, reason, triggerTaskThreadId, updatedAt }
    : { controllerThreadId, generation, status: 'cancelled', dueAt: null, intervalMs: null, reason, triggerTaskThreadId, updatedAt };
}

function heartbeatActionForPending(state, pendingAction) {
  if (pendingAction.manualOnly === true) {
    return { type: 'manual_heartbeat_cleanup_required', controllerThreadId: state.controllerThreadId, actionId: pendingAction.actionId, automationId: pendingAction.previousAutomationId, generation: pendingAction.generation, automaticRetry: false, reason: state.disableReason ?? 'automatic heartbeat cleanup fused', onSuccess: pendingAction.type === 'finalize_controller_cycle' ? 'controller-confirm-heartbeat-action --pending-create-cleanup-outcome deleted|not_found' : 'controller-confirm-heartbeat-action' };
  }
  if (pendingAction.type === 'finalize_controller_cycle') {
    const hostActions = [
      { type: 'compare_and_delete_pending_create', actionId: pendingAction.supersededCreateActionId, generation: pendingAction.supersededCreateGeneration, requiresActionIdMatch: true },
      ...(pendingAction.previousAutomationId === null ? [] : [{ type: 'delete_confirmed_automation', automationId: pendingAction.previousAutomationId, generation: pendingAction.previousGeneration }]),
    ];
    return { type: pendingAction.type, controllerThreadId: state.controllerThreadId, actionId: pendingAction.actionId, generation: pendingAction.generation, hostActions, timeoutMs: HEARTBEAT_ACTION_TIMEOUT_MS, onSuccess: 'controller-confirm-heartbeat-action --pending-create-cleanup-outcome deleted|not_found', onTimeout: 'controller-record-heartbeat-action-failed' };
  }
  if (pendingAction.type === 'delete_controller_heartbeat') {
    return { type: pendingAction.type, controllerThreadId: state.controllerThreadId, actionId: pendingAction.actionId, automationId: pendingAction.previousAutomationId, generation: pendingAction.generation, timeoutMs: HEARTBEAT_ACTION_TIMEOUT_MS, onTimeout: 'controller-record-heartbeat-action-failed' };
  }
  return { type: pendingAction.type, controllerThreadId: state.controllerThreadId, actionId: pendingAction.actionId, generation: pendingAction.generation, dueAt: pendingAction.dueAt, intervalMs: pendingAction.intervalMs, mode: 'one_shot', maxOccurrences: HEARTBEAT_MAX_OCCURRENCES, timeoutMs: HEARTBEAT_ACTION_TIMEOUT_MS, previousAutomationId: pendingAction.previousAutomationId, onSuccess: 'controller-confirm-heartbeat-action', onTimeout: 'controller-record-heartbeat-action-failed' };
}

function pendingCycleFinalizationAction(state, supersededCreate, desired, now) {
  return {
    actionId: randomUUID().replaceAll('-', ''),
    type: 'finalize_controller_cycle',
    generation: desired.generation,
    previousGeneration: state.generation,
    previousAutomationId: state.automationId,
    supersededCreateActionId: supersededCreate.actionId,
    supersededCreateGeneration: supersededCreate.generation,
    dueAt: null,
    intervalMs: null,
    desiredStatus: 'cancelled',
    reason: desired.reason,
    triggerTaskThreadId: desired.triggerTaskThreadId,
    preparedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HEARTBEAT_ACTION_TIMEOUT_MS).toISOString(),
    maxOccurrences: HEARTBEAT_MAX_OCCURRENCES,
  };
}

function pendingHeartbeatAction(state, desired, now) {
  const type = desired.status === 'armed' ? 'create_controller_heartbeat' : 'delete_controller_heartbeat';
  return {
    actionId: randomUUID().replaceAll('-', ''),
    type,
    generation: desired.generation,
    previousGeneration: state.generation,
    previousAutomationId: state.automationId,
    dueAt: desired.dueAt,
    intervalMs: desired.intervalMs,
    desiredStatus: desired.status,
    reason: desired.reason,
    triggerTaskThreadId: desired.triggerTaskThreadId,
    preparedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HEARTBEAT_ACTION_TIMEOUT_MS).toISOString(),
    maxOccurrences: HEARTBEAT_MAX_OCCURRENCES,
  };
}

function rearmControllerHeartbeatInRegistry(registry, controllerThreadId, reason, triggerTaskThreadId = null, now = new Date()) {
  if (!has(reason, HEARTBEAT_REASONS)) fail('CLI_INVALID_ARGUMENTS', `heartbeat reason 无效: ${reason}`);
  const taskQueues = controllerWorkQueues(registry.tasks, controllerThreadId);
  const parallel = controllerParallelRuntime(registry, controllerThreadId);
  const queues = { ...taskQueues, parallel, shouldKeepHeartbeat: taskQueues.shouldKeepHeartbeat || parallel.shouldKeepHeartbeat };
  const found = registry.controllerHeartbeats.find((heartbeat) => heartbeat.controllerThreadId === controllerThreadId);
  let base = found ? heartbeatEvidenceDefaults(found) : heartbeatEvidenceDefaults({ controllerThreadId, generation: 0, status: 'cancelled', dueAt: null, intervalMs: null, reason, triggerTaskThreadId: null, updatedAt: now.toISOString() });
  const meaningfulLifecycleChange = ['dispatch', 'progress', 'completion'].includes(reason);
  if (meaningfulLifecycleChange) {
    base = {
      ...base,
      consecutiveNoProgressCycles: 0,
      lastCycleFingerprint: null,
      lastCycleReceiptKey: null,
      lastMeaningfulProgressAt: now.toISOString(),
    };
  }
  if (base.disabledAt !== null) {
    queues.shouldKeepHeartbeat = false;
  }
  const desired = heartbeatDesiredState(controllerThreadId, base.generation + 1, queues, reason, triggerTaskThreadId, now);
  if (base.pendingAction?.type === 'create_controller_heartbeat' && desired.status === 'cancelled') {
    const pendingAction = pendingCycleFinalizationAction(base, base.pendingAction, desired, now);
    const state = { ...base, pendingAction, updatedAt: now.toISOString(), actionHistory: appendHeartbeatActionHistory(base, base.pendingAction, 'failed', 'pending create superseded by quiescent terminal controller cycle', now.toISOString()) };
    const controllerHeartbeats = [...registry.controllerHeartbeats.filter((heartbeat) => heartbeat.controllerThreadId !== controllerThreadId), state];
    return { registry: { ...registry, controllerHeartbeats, updatedAt: now.toISOString() }, state, pendingState: desired, heartbeatAction: heartbeatActionForPending(state, pendingAction), reusedPendingAction: false };
  }
  if (base.pendingAction !== null) {
    return { registry, state: base, pendingState: { ...base.pendingAction }, heartbeatAction: heartbeatActionForPending(base, base.pendingAction), reusedPendingAction: true };
  }
  if (desired.status === 'cancelled' && base.status === 'cancelled' && base.automationId === null) {
    const state = { ...base, reason, triggerTaskThreadId, logicalLeaseDueAt: null, logicalLeaseUpdatedAt: now.toISOString(), updatedAt: now.toISOString() };
    const controllerHeartbeats = [...registry.controllerHeartbeats.filter((heartbeat) => heartbeat.controllerThreadId !== controllerThreadId), state];
    return { registry: { ...registry, controllerHeartbeats, updatedAt: now.toISOString() }, state, pendingState: desired, heartbeatAction: null, reusedPendingAction: false };
  }
  if (reason === 'finalize' && base.status === 'armed' && desired.status === 'armed' && base.observedTriggerCount === 0 && isSafeThreadId(base.automationId) && isTimestamp(base.dueAt) && now.getTime() < Date.parse(base.dueAt)) {
    const state = { ...base, reason, triggerTaskThreadId, logicalLeaseDueAt: desired.dueAt, logicalLeaseUpdatedAt: now.toISOString(), updatedAt: now.toISOString() };
    const controllerHeartbeats = [...registry.controllerHeartbeats.filter((heartbeat) => heartbeat.controllerThreadId !== controllerThreadId), state];
    return { registry: { ...registry, controllerHeartbeats, updatedAt: now.toISOString() }, state, pendingState: desired, heartbeatAction: null, reusedPendingAction: true, logicalLeaseRenewed: true };
  }
  const pendingAction = pendingHeartbeatAction(base, desired, now);
  const state = { ...base, pendingAction, updatedAt: now.toISOString() };
  const controllerHeartbeats = [...registry.controllerHeartbeats.filter((heartbeat) => heartbeat.controllerThreadId !== controllerThreadId), state];
  return { registry: { ...registry, controllerHeartbeats, updatedAt: now.toISOString() }, state, pendingState: desired, heartbeatAction: heartbeatActionForPending(state, pendingAction), reusedPendingAction: false };
}

function controllerMutationResult(task, tasks, heartbeat = null) {
  const closeoutPending = task.closeout !== null && !closeoutComplete(task);
  return { ...task, ...contractSummary(task), dispatchAllowed: dispatchAllowed(task), requiredThreadActions: threadActionsForTask(task, tasks), ...(closeoutPending ? { notificationRequired: task.closeout.notificationStatus === 'pending', notificationText: task.closeout.userVisibleSummary, reportRefreshRequired: task.closeout.reportStatus === 'pending' } : {}), ...(heartbeat ? { heartbeatState: heartbeat.state, pendingHeartbeatState: heartbeat.pendingState, heartbeatAction: heartbeat.heartbeatAction, reusedPendingHeartbeatAction: heartbeat.reusedPendingAction } : {}) };
}

function controllerMessageDigest(messageText) {
  return createHash('sha256').update(messageText, 'utf8').digest('hex');
}

function controllerMessageAction(message) {
  if (message.status !== 'prepared') return null;
  return {
    type: message.deliveryMode === 'interrupt' ? 'steer_thread_message' : 'send_thread_message',
    actionId: message.actionId,
    messageId: message.messageId,
    targetThreadId: message.targetThreadId,
    messageText: message.messageText,
    deliveryMode: message.deliveryMode === 'interrupt' ? 'interrupt_current_turn' : 'start_next_turn_only',
    receiptRequired: true,
    expiresAt: message.actionExpiresAt,
    precondition: message.deliveryMode === 'interrupt' ? 'target task is still executing/running and interruption authority is still valid immediately before host steer' : 'target task is still executing/running and the target turn is still idle immediately before host send',
    onSuccess: 'controller-record-message-delivery --outcome delivered --receipt <host-receipt>',
    onFailure: 'controller-record-message-delivery --outcome failed --reason <host-error>',
  };
}

function controllerMessageSummary(message) {
  return { ...message, hostAction: controllerMessageAction(message) };
}

function parentNotificationEnvelope(targetTurnState = 'unknown') {
  if (!has(targetTurnState, PARENT_NOTIFICATION_TARGET_STATES)) fail('CLI_INVALID_ARGUMENTS', 'parent turn state 必须是 running、idle 或 unknown');
  const prepared = targetTurnState === 'idle';
  return {
    protocolVersion: PARENT_NOTIFICATION_PROTOCOL_VERSION,
    deliveryMode: 'queue',
    targetTurnState,
    disposition: prepared ? 'prepared' : 'deferred_parent',
    actionId: prepared ? `parentmsg_${randomUUID().replaceAll('-', '')}` : null,
    actionExpiresAt: prepared ? new Date(Date.now() + CONTROLLER_MESSAGE_ACTION_TIMEOUT_MS).toISOString() : null,
  };
}

function validateParentNotificationEnvelope(value) {
  if (!isObject(value)
    || value.protocolVersion !== PARENT_NOTIFICATION_PROTOCOL_VERSION
    || value.deliveryMode !== 'queue'
    || !has(value.targetTurnState, PARENT_NOTIFICATION_TARGET_STATES)
    || !has(value.disposition, PARENT_NOTIFICATION_DISPOSITIONS)
    || value.disposition !== (value.targetTurnState === 'idle' ? 'prepared' : 'deferred_parent')
    || (value.disposition === 'prepared' && (!isSafeThreadId(value.actionId) || !isTimestamp(value.actionExpiresAt)))
    || (value.disposition === 'deferred_parent' && (value.actionId !== null || value.actionExpiresAt !== null))) {
    fail('EVENT_INVALID', 'parent notification envelope 无效');
  }
  return { ...value };
}

function notificationStatusAfterIngest(event) {
  return event.parentNotification?.disposition === 'deferred_parent' ? 'observed' : 'pending';
}

function workerParentNotificationSummary(task, eventPath, messageText, envelopeInput) {
  const envelope = validateParentNotificationEnvelope(envelopeInput);
  const prepared = envelope.disposition === 'prepared';
  const hostAction = prepared ? {
    type: 'send_thread_message',
    actionId: envelope.actionId,
    targetThreadId: task.parentThreadId,
    messageText,
    deliveryMode: 'start_next_turn_only',
    receiptRequired: true,
    expiresAt: envelope.actionExpiresAt,
    precondition: 'the registered direct parent turn is still idle immediately before host send',
    onSuccess: 'direct parent ingests the event, then records controller-mark-notification-sent --host-receipt <host-receipt>',
    onFailure: `worker creates notification-failed --action-id ${envelope.actionId} with the real host error`,
  } : null;
  return {
    parentThreadId: task.parentThreadId,
    notificationText: prepared ? messageText : null,
    notificationRequired: prepared,
    notificationDeferred: !prepared,
    notificationFailureRequiredOnSendError: prepared,
    parentNotification: { ...envelope, eventPath, hostAction },
  };
}

function validateControllerMessage(value, tasks, knownControllers) {
  if (!isObject(value) || value.protocolVersion !== CONTROLLER_MESSAGE_PROTOCOL_VERSION) fail('REGISTRY_INVALID', 'controller message schema 无效');
  const required = ['messageId', 'controllerThreadId', 'targetThreadId', 'kind', 'deliveryMode', 'interruptAuthority', 'messageText', 'messageDigest', 'targetTurnState', 'status', 'actionId', 'actionExpiresAt', 'createdAt', 'updatedAt', 'deliveredAt', 'receipt', 'failureReason'];
  if (!required.every((key) => key in value)) fail('REGISTRY_INVALID', 'controller message 缺少字段');
  assertSafeThreadId(value.messageId, 'controllerMessage.messageId');
  assertSafeThreadId(value.controllerThreadId, 'controllerMessage.controllerThreadId');
  assertSafeThreadId(value.targetThreadId, 'controllerMessage.targetThreadId');
  if (!knownControllers.has(value.controllerThreadId)) fail('REGISTRY_INVALID', 'controller message 主控未登记');
  const target = tasks.find((task) => task.threadId === value.targetThreadId);
  if (!target || target.directControllerThreadId !== value.controllerThreadId) fail('REGISTRY_INVALID', 'controller message 目标不属于直接主控');
  if (!has(value.kind, CONTROLLER_MESSAGE_KINDS) || !has(value.deliveryMode, CONTROLLER_MESSAGE_DELIVERY_MODES) || !has(value.targetTurnState, CONTROLLER_MESSAGE_TARGET_STATES) || !has(value.status, CONTROLLER_MESSAGE_STATUSES)) fail('REGISTRY_INVALID', 'controller message 枚举字段无效');
  if (!nonEmpty(value.messageText) || value.messageText.length > CONTROLLER_MESSAGE_MAX_LENGTH || value.messageDigest !== controllerMessageDigest(value.messageText)) fail('REGISTRY_INVALID', 'controller message 文本或 digest 无效');
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) fail('REGISTRY_INVALID', 'controller message 时间无效');
  if (value.deliveryMode === 'interrupt') {
    if (!['stop', 'cancel'].includes(value.kind) || !has(value.interruptAuthority, CONTROLLER_MESSAGE_INTERRUPT_AUTHORITIES)) fail('REGISTRY_INVALID', 'interrupt message 必须是已授权的 stop/cancel');
  } else if (value.interruptAuthority !== null || ['stop', 'cancel'].includes(value.kind)) {
    fail('REGISTRY_INVALID', 'queue message 不得携带中断权限或 stop/cancel kind');
  }
  if (value.status === 'deferred_local') {
    if (value.deliveryMode !== 'queue' || value.targetTurnState === 'idle' || value.actionId !== null || value.actionExpiresAt !== null || value.deliveredAt !== null || value.receipt !== null || value.failureReason !== null) fail('REGISTRY_INVALID', 'deferred controller message 状态无效');
  } else if (value.status === 'prepared') {
    if (!isSafeThreadId(value.actionId) || !isTimestamp(value.actionExpiresAt) || value.deliveredAt !== null || value.receipt !== null || value.failureReason !== null || (value.deliveryMode === 'queue' && value.targetTurnState !== 'idle')) fail('REGISTRY_INVALID', 'prepared controller message 状态无效');
  } else if (value.status === 'delivered') {
    if (!isSafeThreadId(value.actionId) || !isTimestamp(value.actionExpiresAt) || !isTimestamp(value.deliveredAt) || !nonEmpty(value.receipt) || value.failureReason !== null) fail('REGISTRY_INVALID', 'delivered controller message 状态无效');
  } else if (value.status === 'failed') {
    if (!isSafeThreadId(value.actionId) || !isTimestamp(value.actionExpiresAt) || value.deliveredAt !== null || value.receipt !== null || !nonEmpty(value.failureReason)) fail('REGISTRY_INVALID', 'failed controller message 状态无效');
  } else if (value.actionId !== null || value.actionExpiresAt !== null || value.deliveredAt !== null || value.receipt !== null || !nonEmpty(value.failureReason)) {
    fail('REGISTRY_INVALID', 'cancelled controller message 状态无效');
  }
  return { ...value };
}

function validatePendingHeartbeatAction(value, state) {
  if (!isObject(value)) fail('REGISTRY_INVALID', 'pending heartbeat action 必须是对象');
  const required = ['actionId', 'type', 'generation', 'previousGeneration', 'previousAutomationId', 'dueAt', 'intervalMs', 'desiredStatus', 'reason', 'triggerTaskThreadId', 'preparedAt', 'expiresAt', 'maxOccurrences'];
  if (!required.every((key) => key in value) || !isSafeThreadId(value.actionId) || !has(value.type, HEARTBEAT_ACTION_TYPES) || !Number.isInteger(value.generation) || value.generation !== state.generation + 1 || value.previousGeneration !== state.generation || (value.previousAutomationId !== null && !isSafeThreadId(value.previousAutomationId)) || !has(value.desiredStatus, HEARTBEAT_STATUSES) || !has(value.reason, HEARTBEAT_REASONS) || !isTimestamp(value.preparedAt) || !isTimestamp(value.expiresAt) || value.maxOccurrences !== HEARTBEAT_MAX_OCCURRENCES || (value.manualOnly !== undefined && typeof value.manualOnly !== 'boolean')) fail('REGISTRY_INVALID', 'pending heartbeat action 字段无效');
  if (value.triggerTaskThreadId !== null) assertSafeThreadId(value.triggerTaskThreadId, 'pendingHeartbeat.triggerTaskThreadId');
  if (value.type === 'finalize_controller_cycle') {
    if (value.desiredStatus !== 'cancelled' || value.dueAt !== null || value.intervalMs !== null || !isSafeThreadId(value.supersededCreateActionId) || !Number.isInteger(value.supersededCreateGeneration) || value.supersededCreateGeneration !== value.generation) fail('REGISTRY_INVALID', 'controller cycle finalization action 无效');
    return { ...value };
  }
  if (value.desiredStatus === 'armed') {
    if (value.type !== 'create_controller_heartbeat' || !isTimestamp(value.dueAt) || !Number.isInteger(value.intervalMs) || value.intervalMs <= 0) fail('REGISTRY_INVALID', 'armed pending heartbeat 必须创建单次 automation');
  } else if (value.type !== 'delete_controller_heartbeat' || value.dueAt !== null || value.intervalMs !== null) {
    fail('REGISTRY_INVALID', 'cancelled pending heartbeat 必须删除 automation');
  }
  return { ...value };
}

function validateHeartbeatHistoryEntry(value) {
  if (!isObject(value) || !isSafeThreadId(value.actionId) || !has(value.type, HEARTBEAT_ACTION_TYPES) || !['confirmed', 'failed', 'fused'].includes(value.outcome) || !Number.isInteger(value.generation) || value.generation < 1 || !nonEmpty(value.detail) || !isTimestamp(value.recordedAt)) fail('REGISTRY_INVALID', 'heartbeat actionHistory 记录无效');
  return { ...value };
}

function validateControllerHeartbeat(value, knownControllers) {
  if (!isObject(value)) fail('REGISTRY_INVALID', 'controller heartbeat 必须是对象');
  const required = ['controllerThreadId', 'generation', 'status', 'dueAt', 'intervalMs', 'reason', 'triggerTaskThreadId', 'updatedAt'];
  if (!required.every((key) => key in value)) fail('REGISTRY_INVALID', 'controller heartbeat 缺少字段');
  assertSafeThreadId(value.controllerThreadId, 'heartbeat.controllerThreadId');
  if (!knownControllers.has(value.controllerThreadId)) fail('REGISTRY_INVALID', `heartbeat controller 未登记: ${value.controllerThreadId}`);
  const isCurrentProtocol = value.protocolVersion === HEARTBEAT_PROTOCOL_VERSION;
  const supportsPreparedGenerationZero = value.protocolVersion === 2 || isCurrentProtocol;
  if (!Number.isInteger(value.generation) || value.generation < (supportsPreparedGenerationZero ? 0 : 1)) fail('REGISTRY_INVALID', 'heartbeat generation 无效');
  if (!has(value.status, HEARTBEAT_STATUSES)) fail('REGISTRY_INVALID', `heartbeat status 无效: ${value.status}`);
  if (!has(value.reason, HEARTBEAT_REASONS)) fail('REGISTRY_INVALID', `heartbeat reason 无效: ${value.reason}`);
  if (value.triggerTaskThreadId !== null) assertSafeThreadId(value.triggerTaskThreadId, 'heartbeat.triggerTaskThreadId');
  if (!isTimestamp(value.updatedAt)) fail('REGISTRY_INVALID', 'heartbeat updatedAt 无效');
  if (value.status === 'armed') {
    if (!isTimestamp(value.dueAt) || !Number.isInteger(value.intervalMs) || value.intervalMs <= 0) fail('REGISTRY_INVALID', 'armed heartbeat 必须有 dueAt 和正 intervalMs');
  } else if (value.dueAt !== null || value.intervalMs !== null) {
    fail('REGISTRY_INVALID', 'cancelled heartbeat 不能保留 dueAt 或 intervalMs');
  }
  if (!isCurrentProtocol) return { ...value };
  const evidenceFields = ['automationId', 'lastSuccessfulGeneration', 'lastSuccessfulAt', 'pendingAction', 'consecutiveStaleCount', 'lastStaleGeneration', 'lastStaleAt', 'observedAutomationId', 'observedGeneration', 'observedTriggerCount', 'lastTriggeredAt', 'actionFailureCount', 'deleteFailureCount', 'disabledAt', 'disableReason', 'notificationStatus', 'actionHistory', 'retiredAutomationIds', 'consecutiveNoProgressCycles', 'lastCycleFingerprint', 'lastCycleReceiptKey', 'lastMeaningfulProgressAt', 'noProgressFuseCount', 'manualResumeCount', 'lastManualResumeAt', 'lastManualResumeReason'];
  if (!evidenceFields.every((key) => key in value)) fail('REGISTRY_INVALID', 'heartbeat v3 证据字段不完整');
  for (const field of ['automationId', 'observedAutomationId']) if (value[field] !== null) assertSafeThreadId(value[field], `heartbeat.${field}`);
  if (!Number.isInteger(value.lastSuccessfulGeneration) || value.lastSuccessfulGeneration < 0 || value.lastSuccessfulGeneration > value.generation) fail('REGISTRY_INVALID', 'lastSuccessfulGeneration 无效');
  for (const field of ['lastSuccessfulAt', 'lastStaleAt', 'lastTriggeredAt', 'disabledAt', 'lastMeaningfulProgressAt', 'lastManualResumeAt']) if (value[field] !== null && !isTimestamp(value[field])) fail('REGISTRY_INVALID', `${field} 无效`);
  for (const field of ['consecutiveStaleCount', 'observedTriggerCount', 'actionFailureCount', 'deleteFailureCount', 'consecutiveNoProgressCycles', 'noProgressFuseCount', 'manualResumeCount']) if (!Number.isInteger(value[field]) || value[field] < 0) fail('REGISTRY_INVALID', `${field} 无效`);
  for (const field of ['lastStaleGeneration', 'observedGeneration']) if (value[field] !== null && (!Number.isInteger(value[field]) || value[field] < 1)) fail('REGISTRY_INVALID', `${field} 无效`);
  if (value.disableReason !== null && !nonEmpty(value.disableReason)) fail('REGISTRY_INVALID', 'disableReason 无效');
  for (const field of ['lastCycleFingerprint', 'lastCycleReceiptKey', 'lastManualResumeReason']) if (value[field] !== null && !nonEmpty(value[field])) fail('REGISTRY_INVALID', `${field} 无效`);
  if (!has(value.notificationStatus, HEARTBEAT_NOTIFICATION_STATUSES)) fail('REGISTRY_INVALID', 'heartbeat notificationStatus 无效');
  if (!Array.isArray(value.actionHistory) || !Array.isArray(value.retiredAutomationIds) || !value.retiredAutomationIds.every(isSafeThreadId)) fail('REGISTRY_INVALID', 'heartbeat 历史或 retiredAutomationIds 无效');
  const pendingAction = value.pendingAction === null ? null : validatePendingHeartbeatAction(value.pendingAction, value);
  const logicalLeaseDueAt = value.logicalLeaseDueAt ?? (value.status === 'armed' ? value.dueAt : null);
  const logicalLeaseUpdatedAt = value.logicalLeaseUpdatedAt ?? value.updatedAt;
  if (logicalLeaseDueAt !== null && !isTimestamp(logicalLeaseDueAt)) fail('REGISTRY_INVALID', 'logicalLeaseDueAt 无效');
  if (!isTimestamp(logicalLeaseUpdatedAt)) fail('REGISTRY_INVALID', 'logicalLeaseUpdatedAt 无效');
  return { ...value, logicalLeaseDueAt, logicalLeaseUpdatedAt, pendingAction, actionHistory: value.actionHistory.map(validateHeartbeatHistoryEntry), retiredAutomationIds: [...new Set(value.retiredAutomationIds)] };
}

function validateDeliverablePackage(value, task, projectRoot) {
  if (!isObject(value)) fail('REGISTRY_INVALID', 'deliverable 必须是对象');
  const hasSourceWorkspace = value.sourceWorkspace !== undefined;
  let resultRoot = projectRoot;
  if (hasSourceWorkspace) {
    const source = value.sourceWorkspace;
    const expectedIdentity = task.parallelWorktreeIdentity;
    const expectedRole = expectedIdentity === null || expectedIdentity === undefined ? 'project_main' : 'candidate_worktree';
    if (!isObject(source) || source.schemaVersion !== 1 || source.workspaceRole !== expectedRole || !nonEmpty(source.rootPath) || !win32.isAbsolute(source.rootPath)) fail('REGISTRY_INVALID', 'deliverable sourceWorkspace 身份无效');
    if (expectedRole === 'candidate_worktree') {
      if (![source.registeredWorktreePath, source.branch, source.registeredBaseCommit, source.registeredLastMainSyncCommit, source.registeredCleanupOwner, source.baseCommit, source.lastMainSyncCommit, source.candidateCommit].every(nonEmpty) || !windowsPathInside(source.rootPath, expectedIdentity.worktreePath) || !windowsPathInside(expectedIdentity.worktreePath, source.rootPath) || !windowsPathInside(source.registeredWorktreePath, expectedIdentity.worktreePath) || !windowsPathInside(expectedIdentity.worktreePath, source.registeredWorktreePath) || source.branch.toLowerCase() !== expectedIdentity.branch.toLowerCase() || source.registeredBaseCommit !== expectedIdentity.baseCommit || source.registeredLastMainSyncCommit !== expectedIdentity.lastMainSyncCommit || source.registeredCleanupOwner !== expectedIdentity.cleanupOwner || source.candidateCommit !== value.candidateCommit) fail('REGISTRY_INVALID', 'deliverable candidate-worktree source identity 与台账不一致');
    } else if (source.registeredWorktreePath !== null || source.branch !== null || source.registeredBaseCommit !== null || source.registeredLastMainSyncCommit !== null || source.registeredCleanupOwner !== null || source.baseCommit !== null || source.lastMainSyncCommit !== null || source.candidateCommit !== null || !windowsPathInside(source.rootPath, projectRoot) || !windowsPathInside(projectRoot, source.rootPath)) {
      fail('REGISTRY_INVALID', 'project_main deliverable 不得伪造候选 worktree identity');
    }
    resultRoot = source.rootPath;
  }
  if (!RESULT_MANIFEST_SCHEMA_VERSIONS.includes(value.resultManifestSchemaVersion) || value.resultManifestSchemaVersion !== task.resultProtocolVersion || !nonEmpty(value.resultManifestPath) || !win32.isAbsolute(value.resultManifestPath) || !windowsPathInside(value.resultManifestPath, resultRoot) || !/^[0-9a-f]{64}$/.test(value.resultManifestDigest ?? '')) fail('REGISTRY_INVALID', 'deliverable result manifest 元数据无效');
  if (value.projectKey !== projectKeyForRoot(projectRoot) || value.controllerThreadId !== task.directControllerThreadId || value.threadId !== task.threadId || value.displayKey !== task.displayKey || !Number.isInteger(value.attempt) || value.attempt < 1 || value.contractVersion !== contractVersion(task) || value.contractDigest !== task.contractDigest || !nonEmpty(value.candidateCommit) || value.manifestIntegrationStatus !== 'candidate' || !nonEmpty(value.userVisibleSummary)) fail('REGISTRY_INVALID', 'deliverable 身份、合同或候选状态无效');
  if (!Array.isArray(value.actualChanges) || value.actualChanges.length === 0 || !value.actualChanges.every(nonEmpty) || !Array.isArray(value.incompleteItems) || !value.incompleteItems.every(nonEmpty)) fail('REGISTRY_INVALID', 'deliverable changes/incompleteItems 无效');
  if (value.resultManifestSchemaVersion >= 2) {
    if (value.implementationPolicy !== task.implementationPolicy || !Array.isArray(value.affectedFiles) || value.affectedFiles.length === 0 || !nonEmpty(value.validationRationale)) fail('REGISTRY_INVALID', 'schema-v2 deliverable policy、affectedFiles 或 validationRationale 无效');
    const paths = new Set();
    for (const entry of value.affectedFiles) {
      if (!isObject(entry) || !nonEmpty(entry.path) || win32.isAbsolute(entry.path) || entry.path.replaceAll('/', '\\').split('\\').includes('..') || !has(entry.changeType, RESULT_FILE_CHANGE_TYPES) || !nonEmpty(entry.reason) || paths.has(entry.path.toLowerCase())) fail('REGISTRY_INVALID', 'deliverable affectedFiles 无效');
      paths.add(entry.path.toLowerCase());
    }
  }
  const testSummary = normalizeResultTestSummary(value.testSummary);
  if (value.noScreenshotReason !== null && !nonEmpty(value.noScreenshotReason)) fail('REGISTRY_INVALID', 'deliverable noScreenshotReason 无效');
  if (!Array.isArray(value.artifacts)) fail('REGISTRY_INVALID', 'deliverable artifacts 必须是数组');
  const artifactIds = new Set();
  const artifactHashes = new Set();
  const stageIds = new Set(task.stageGates.map((gate) => gate.id));
  const allowedRoots = (task.resultRequirements?.allowedArtifactRoots ?? []).map((root) => win32.isAbsolute(root) ? win32.resolve(root) : win32.resolve(resultRoot, root.replaceAll('/', '\\')));
  const artifacts = value.artifacts.map((artifact) => {
    const sourceStageValid = adaptiveBriefTask(task) ? isSafeThreadId(artifact.sourceStageId) : stageIds.has(artifact.sourceStageId);
    if (!isObject(artifact) || !isSafeThreadId(artifact.id) || artifactIds.has(artifact.id) || !RESULT_ARTIFACT_TYPES.includes(artifact.type) || !RESULT_ARTIFACT_MILESTONES.includes(artifact.milestone) || !nonEmpty(artifact.label) || !nonEmpty(artifact.description) || !isTimestamp(artifact.createdAt) || !nonEmpty(artifact.sourceStageId) || !sourceStageValid || artifact.sourceTaskThreadId !== task.threadId || !RESULT_WORKSPACE_ROLES.includes(artifact.workspaceRole)) fail('REGISTRY_INVALID', 'deliverable artifact 结构无效');
    if (artifact.workspaceRole === 'task_control' || (artifact.workspaceRole === 'project_main' && artifact.type !== 'reference') || (['screenshot', 'contact_sheet'].includes(artifact.type) && artifact.workspaceRole !== 'candidate_worktree')) fail('REGISTRY_INVALID', 'deliverable artifact workspaceRole 与 candidate 状态冲突');
    artifactIds.add(artifact.id);
    const local = nonEmpty(artifact.path);
    const remote = nonEmpty(artifact.uri);
    if (local === remote) fail('REGISTRY_INVALID', 'deliverable artifact 必须且只能保留 path 或 uri');
    if (local) {
      if (!win32.isAbsolute(artifact.path) || (hasSourceWorkspace && !windowsPathInside(artifact.path, resultRoot)) || !allowedRoots.some((root) => windowsPathInside(artifact.path, root)) || !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? '') || artifactHashes.has(artifact.sha256)) fail('REGISTRY_INVALID', '本地 deliverable artifact path/hash 无效、越界或重复');
      artifactHashes.add(artifact.sha256);
    } else {
      let parsed;
      try { parsed = new URL(artifact.uri); } catch { fail('REGISTRY_INVALID', '远程 deliverable artifact URI 无效'); }
      if (!['http:', 'https:'].includes(parsed.protocol) || artifact.sha256 !== null || artifact.dimensions !== null) fail('REGISTRY_INVALID', '远程 deliverable artifact URI/hash/dimensions 无效');
    }
    if (artifact.dimensions !== null && (!isObject(artifact.dimensions) || !['png', 'jpeg', 'gif'].includes(artifact.dimensions.format) || !Number.isInteger(artifact.dimensions.width) || artifact.dimensions.width <= 0 || !Number.isInteger(artifact.dimensions.height) || artifact.dimensions.height <= 0)) fail('REGISTRY_INVALID', 'deliverable image dimensions 无效');
    return { ...artifact };
  });
  if (!isTimestamp(value.recordedAt) || !RESULT_REVIEW_STATUSES.includes(value.reviewStatus) || !DELIVERY_STATUSES.includes(value.deliveryStatus) || !Array.isArray(value.selectedArtifactIds) || new Set(value.selectedArtifactIds).size !== value.selectedArtifactIds.length || value.selectedArtifactIds.some((id) => !artifactIds.has(id))) fail('REGISTRY_INVALID', 'deliverable review 元数据无效');
  if (value.reviewStatus === 'pending' && (value.reviewReason !== null || value.reviewedAt !== null || value.selectedArtifactIds.length > 0 || value.deliveryStatus !== 'candidate')) fail('REGISTRY_INVALID', 'pending deliverable 不得伪造审查结果');
  if (value.reviewStatus !== 'pending' && (!nonEmpty(value.reviewReason) || !isTimestamp(value.reviewedAt))) fail('REGISTRY_INVALID', '已审查 deliverable 必须记录原因和时间');
  if (value.reviewStatus === 'accepted' && !['accepted_not_integrated', 'integrated'].includes(value.deliveryStatus)) fail('REGISTRY_INVALID', 'accepted deliverable 状态无效');
  if (value.reviewStatus === 'rejected' && value.deliveryStatus !== 'rejected') fail('REGISTRY_INVALID', 'rejected deliverable 状态无效');
  return { ...value, testSummary, artifacts };
}

function validateTask(value, projectRoot) {
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
  if ('integrationProof' in value && value.integrationProof !== null) {
    const proof = value.integrationProof;
    if (!isObject(proof)
      || proof.schemaVersion !== INTEGRATION_PROOF_PROTOCOL_VERSION
      || proof.method !== 'git_ancestor'
      || !nonEmpty(proof.recordedCandidateCommit)
      || !/^[0-9a-f]{40,64}$/.test(proof.candidateCommit ?? '')
      || !nonEmpty(proof.targetRef)
      || !/^[0-9a-f]{40,64}$/.test(proof.targetCommit ?? '')
      || !isTimestamp(proof.verifiedAt)) fail('REGISTRY_INVALID', 'integrationProof 结构无效');
    if (proof.recordedCandidateCommit !== value.candidateCommit || value.status !== 'integrated' || value.integrationStatus !== 'integrated') fail('REGISTRY_INVALID', 'integrationProof 与候选提交或生命周期不一致');
  }
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
  value = ensureImplementationControl([value])[0];
  const contractFields = ['taskMode', 'implementationPolicy', 'scopePolicy', 'implementationBriefPath', 'briefSchemaVersion', 'implementationBrief', 'briefDigest', 'hardContractTrigger', 'hardContractReason', 'contractSchemaVersion', 'implementationContractPath', 'contractDigest', 'contractRevision', 'contractCommit', 'reuseRequirements', 'forbiddenNewPaths', 'forbiddenReimplementations', 'stageGates', 'evidenceCommands', 'errorPolicy', 'validationPolicy', 'visualOracle', 'stageProgress', 'incidentalRepairs'];
  const resultControlFields = ['resultProtocolVersion', 'resultRequirements', 'deliverableHistory'];
  const presentContractFields = contractFields.filter((key) => key in value);
  const presentResultControlFields = resultControlFields.filter((key) => key in value);
  if (presentContractFields.length !== 0 && presentContractFields.length !== contractFields.length) fail('REGISTRY_INVALID', '实施合同控制字段必须同时存在');
  if (presentContractFields.length === 0 && presentResultControlFields.length > 0) fail('REGISTRY_INVALID', '成果控制字段不能脱离实施合同存在');
  if (presentContractFields.length === contractFields.length) {
    if (presentResultControlFields.length !== 0 && presentResultControlFields.length !== resultControlFields.length) fail('REGISTRY_INVALID', '成果控制字段必须同时存在');
    if (presentResultControlFields.length === 0) {
      value.resultProtocolVersion = 0;
      value.resultRequirements = null;
      value.deliverableHistory = [];
    }
    if (!has(value.taskMode, TASK_MODES)) fail('REGISTRY_INVALID', `taskMode 无效: ${value.taskMode}`);
    if (!Array.isArray(value.stageProgress) || !Array.isArray(value.incidentalRepairs) || !Array.isArray(value.deliverableHistory) || !RESULT_PROTOCOL_VERSIONS.includes(value.resultProtocolVersion)) fail('REGISTRY_INVALID', 'stageProgress/incidentalRepairs/deliverableHistory/resultProtocolVersion 无效');
    if (value.taskMode === 'legacy_unclassified' || value.taskMode === 'control_only') {
      if (value.implementationPolicy !== null || value.scopePolicy !== null || value.implementationBriefPath !== null || value.briefSchemaVersion !== null || value.implementationBrief !== null || value.briefDigest !== null || value.hardContractTrigger !== null || value.hardContractReason !== null || value.contractSchemaVersion !== null || value.implementationContractPath !== null || value.contractDigest !== null || value.contractRevision !== null || value.contractCommit !== null || value.errorPolicy !== null || value.validationPolicy !== null || value.visualOracle !== null || value.resultProtocolVersion !== 0 || value.resultRequirements !== null) fail('REGISTRY_INVALID', '非实施任务不得绑定实施简报、scope policy、硬合同或成果协议');
      if (![value.allowedWritePaths ?? [], value.reuseRequirements, value.forbiddenNewPaths, value.forbiddenReimplementations, value.stageGates, value.evidenceCommands, value.stageProgress, value.incidentalRepairs, value.deliverableHistory].every((entry) => Array.isArray(entry) && entry.length === 0)) fail('REGISTRY_INVALID', '非实施任务不得保留合同、阶段、附带修复或成果数据');
    } else {
      if (!has(value.implementationPolicy, IMPLEMENTATION_POLICIES) || !has(value.scopePolicy, SCOPE_POLICIES) || value.briefSchemaVersion !== IMPLEMENTATION_BRIEF_SCHEMA_VERSION || !isObject(value.implementationBrief) || !/^[0-9a-f]{64}$/.test(value.briefDigest ?? '')) fail('REGISTRY_INVALID', '实施任务 policy/scope-policy/brief/digest 无效');
      const normalizedBrief = validateImplementationBriefManifest(value.implementationBrief);
      if (createHash('sha256').update(JSON.stringify(normalizedBrief), 'utf8').digest('hex') !== value.briefDigest) fail('REGISTRY_INVALID', 'implementation brief digest 不匹配');
      if (value.implementationBriefPath !== null && (!nonEmpty(value.implementationBriefPath) || !win32.isAbsolute(value.implementationBriefPath) || !windowsPathInside(value.implementationBriefPath, projectRoot))) fail('REGISTRY_INVALID', 'implementation brief path 无效或越界');
      if (value.implementationPolicy === 'adaptive_brief') {
        if (value.hardContractTrigger !== null || value.hardContractReason !== null || value.contractSchemaVersion !== null || value.implementationContractPath !== null || value.contractRevision !== null || value.contractCommit !== null || value.errorPolicy !== null || value.validationPolicy !== null || value.visualOracle !== null || value.contractDigest !== value.briefDigest) fail('REGISTRY_INVALID', 'adaptive brief 不得保留硬合同字段，binding digest 必须匹配 brief');
        if (![value.allowedWritePaths ?? [], value.reuseRequirements, value.forbiddenNewPaths, value.forbiddenReimplementations, value.stageGates, value.evidenceCommands].every((entry) => Array.isArray(entry) && entry.length === 0)) fail('REGISTRY_INVALID', 'adaptive brief 不得强制 write path、stage 或 validator');
      } else {
        if (value.scopePolicy !== 'strict_scope' || value.incidentalRepairs.length > 0) fail('REGISTRY_INVALID', 'hard contract 必须保持 strict_scope 且不得登记附带修复');
        if (!HARD_CONTRACT_TRIGGERS.includes(value.hardContractTrigger) || !nonEmpty(value.hardContractReason) || !IMPLEMENTATION_CONTRACT_SCHEMA_VERSIONS.includes(value.contractSchemaVersion) || !nonEmpty(value.implementationContractPath) || !win32.isAbsolute(value.implementationContractPath) || !/^[0-9a-f]{64}$/.test(value.contractDigest ?? '')) fail('REGISTRY_INVALID', 'hard contract trigger/reason/path/schema/digest 无效');
        const normalizedRoot = win32.resolve(projectRoot).toLowerCase();
        const normalizedContractPath = win32.resolve(value.implementationContractPath).toLowerCase();
        if (normalizedContractPath !== normalizedRoot && !normalizedContractPath.startsWith(`${normalizedRoot}\\`)) fail('REGISTRY_INVALID', '实施任务合同 path 不在项目根目录内');
        validateImplementationContractManifest({ schemaVersion: value.contractSchemaVersion, contractRevision: value.contractRevision, contractCommit: value.contractCommit, ...(value.contractSchemaVersion >= 2 ? { allowedWritePaths: value.allowedWritePaths } : {}), reuseRequirements: value.reuseRequirements, forbiddenNewPaths: value.forbiddenNewPaths, forbiddenReimplementations: value.forbiddenReimplementations, stageGates: value.stageGates, evidenceCommands: value.evidenceCommands, errorPolicy: value.errorPolicy, ...(value.validationPolicy === null ? {} : { validationPolicy: value.validationPolicy }), ...(value.visualOracle === null ? {} : { visualOracle: value.visualOracle }), ...(value.resultRequirements === null ? {} : { resultRequirements: value.resultRequirements }) }, value.taskMode, { requireResultRequirements: value.resultProtocolVersion === RESULT_PROTOCOL_VERSION });
      }
      if (value.resultProtocolVersion > 0) {
        if (!isObject(value.resultRequirements) || value.resultRequirements.manifestSchemaVersion !== value.resultProtocolVersion || !Array.isArray(value.resultRequirements.allowedArtifactRoots) || value.resultRequirements.allowedArtifactRoots.length === 0 || !Array.isArray(value.resultRequirements.requiredArtifactTypes) || !Array.isArray(value.resultRequirements.requiredMilestones)) fail('REGISTRY_INVALID', 'resultRequirements 与 result protocol 不一致');
        if (value.taskMode === 'visual_implementation' && (!nonEmpty(value.resultRequirements.presentationStageId) || !value.resultRequirements.requiredArtifactTypes.some((type) => ['screenshot', 'contact_sheet'].includes(type)) || !value.resultRequirements.requiredMilestones.some((milestone) => ['after', 'current'].includes(milestone)))) fail('REGISTRY_INVALID', '视觉任务 resultRequirements 缺少 presentation、截图或 after/current');
      }
      if (value.resultProtocolVersion === 0 && value.resultRequirements !== null) fail('REGISTRY_INVALID', 'legacy implementation 不得声明 resultRequirements');
      const gateIds = new Set(value.stageGates.map((gate) => gate.id));
      const evidenceIds = new Set(value.evidenceCommands.map((entry) => entry.id));
      for (const progress of value.stageProgress) {
        const currentAttempt = progress.attemptCount === value.attemptCount;
        const progressStageValid = value.implementationPolicy === 'adaptive_brief' ? (progress.stageId === null || isSafeThreadId(progress.stageId)) : gateIds.has(progress.stageId);
        const expectedVersion = value.implementationPolicy === 'adaptive_brief' ? `brief-v${value.briefSchemaVersion}` : (value.contractRevision ?? value.contractCommit);
        if (!isObject(progress) || !progressStageValid || !nonEmpty(progress.summary) || !Number.isInteger(progress.attemptCount) || progress.attemptCount < 1 || !isTimestamp(progress.createdAt) || !nonEmpty(progress.contractVersion) || !/^[0-9a-f]{64}$/.test(progress.contractDigest ?? '') || (currentAttempt && (progress.contractDigest !== value.contractDigest || progress.contractVersion !== expectedVersion)) || !Array.isArray(progress.evidence)) fail('REGISTRY_INVALID', 'stageProgress 记录无效');
        if (progress.carriedFromAttempt !== undefined && (!Number.isInteger(progress.carriedFromAttempt) || progress.carriedFromAttempt < 1 || progress.carriedFromAttempt >= progress.attemptCount || !isTimestamp(progress.carriedAt))) fail('REGISTRY_INVALID', 'stageProgress carry-forward provenance 无效');
        const seenEvidence = new Set();
        for (const evidence of progress.evidence) {
          if (!isObject(evidence) || (currentAttempt && value.implementationPolicy === 'hard_contract' && !evidenceIds.has(evidence.id)) || !nonEmpty(evidence.id) || !nonEmpty(evidence.reference) || seenEvidence.has(evidence.id)) fail('REGISTRY_INVALID', 'stageProgress evidence 无效');
          seenEvidence.add(evidence.id);
        }
      }
      const repairIds = new Set();
      for (const repair of value.incidentalRepairs) {
        if (repairIds.has(repair.repairId)) fail('REGISTRY_INVALID', `附带修复 repairId 重复: ${repair.repairId}`);
        repairIds.add(repair.repairId);
        const normalizedRepair = validateIncidentalRepairReceipt(repair, value);
        if (normalizedRepair.attemptCount !== repair.attemptCount || !Number.isInteger(repair.attemptCount) || repair.attemptCount < 1 || !isTimestamp(repair.createdAt)) fail('REGISTRY_INVALID', '附带修复 attempt 或时间无效');
      }
      value.deliverableHistory = value.deliverableHistory.map((entry) => validateDeliverablePackage(entry, value, projectRoot));
      if (value.status === 'integrated' && 'integrationProof' in value && value.integrationProof === null) fail('REGISTRY_INVALID', '新协议实施任务标记 integrated 前必须记录 Git 祖先证明');
    }
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
  if ('pendingRework' in value && value.pendingRework !== null) {
    const pending = value.pendingRework;
    if (!isObject(pending) || !isSafeThreadId(pending.actionId) || pending.nextAttempt !== value.attemptCount + 1 || pending.mode !== 'continue_same_attempt' || !isTimestamp(pending.preparedAt) || !isTimestamp(pending.expiresAt) || Date.parse(pending.expiresAt) <= Date.parse(pending.preparedAt) || value.status !== 'changes_requested') fail('REGISTRY_INVALID', 'pendingRework 结构或生命周期无效');
  }
  if ('controlPlaneRecovery' in value && value.controlPlaneRecovery !== null) {
    const recovery = value.controlPlaneRecovery;
    if (!isObject(recovery) || recovery.schemaVersion !== CONTROL_PLANE_RECOVERY_PROTOCOL_VERSION || !isSafeThreadId(recovery.recoveryId) || !has(recovery.status, CONTROL_PLANE_RECOVERY_STATUSES) || !has(recovery.component, CONTROL_PLANE_RECOVERY_COMPONENTS) || recovery.attemptCount !== value.attemptCount || !/^[0-9a-f]{40,64}$/i.test(recovery.candidateCommit ?? '') || !nonEmpty(recovery.resultManifestPath) || !win32.isAbsolute(recovery.resultManifestPath) || !/^[0-9a-f]{64}$/.test(recovery.resultManifestDigest ?? '') || !isObject(recovery.sourceWorkspace) || recovery.sourceWorkspace.workspaceRole !== 'candidate_worktree' || recovery.sourceWorkspace.candidateCommit !== recovery.candidateCommit || !nonEmpty(recovery.skillVersion) || !/^\d+\.\d+\.\d+$/.test(recovery.skillVersion) || !nonEmpty(recovery.reason) || !nonEmpty(recovery.hostReceipt) || !isTimestamp(recovery.preparedAt)) fail('REGISTRY_INVALID', 'controlPlaneRecovery 结构、候选或审计证据无效');
    if (recovery.status === 'completion_only' && (value.status !== 'executing' || recovery.completedAt !== null || recovery.cancelledAt !== null)) fail('REGISTRY_INVALID', 'completion_only 恢复必须处于 executing 且未收口');
    if (recovery.status === 'completed' && (!isTimestamp(recovery.completedAt) || recovery.cancelledAt !== null || !['awaiting_review', 'accepted', 'integrated', 'changes_requested', 'reclaimed', 'blocked'].includes(value.status))) fail('REGISTRY_INVALID', '已完成 control-plane recovery 状态无效');
    if (recovery.status === 'cancelled' && (!isTimestamp(recovery.cancelledAt) || recovery.completedAt !== null)) fail('REGISTRY_INVALID', '已取消 control-plane recovery 缺少时间');
  }
  if ('contractAmendmentHistory' in value) {
    if (!Array.isArray(value.contractAmendmentHistory)) fail('REGISTRY_INVALID', 'contractAmendmentHistory 无效');
    for (const amendment of value.contractAmendmentHistory) {
      if (!isObject(amendment) || !Number.isInteger(amendment.attemptCount) || amendment.attemptCount < 2 || !/^[0-9a-f]{64}$/.test(amendment.beforeContractDigest ?? '') || !/^[0-9a-f]{64}$/.test(amendment.afterContractDigest ?? '') || !nonEmpty(amendment.reason) || !nonEmpty(amendment.hostReceipt) || !isTimestamp(amendment.createdAt) || !Array.isArray(amendment.carriedStageIds) || !amendment.carriedStageIds.every(nonEmpty) || (amendment.failedStage !== null && !nonEmpty(amendment.failedStage))) fail('REGISTRY_INVALID', 'contract amendment 审计记录无效');
    }
  }
  const dispatchFields = ['lastDispatchedAttempt', 'lastDispatchedAt'];
  const presentDispatchFields = dispatchFields.filter((key) => key in value);
  if (presentDispatchFields.length !== 0 && presentDispatchFields.length !== dispatchFields.length) fail('REGISTRY_INVALID', '派发字段必须同时存在');
  if (presentDispatchFields.length === dispatchFields.length) {
    if (!Number.isInteger(value.lastDispatchedAttempt) || value.lastDispatchedAttempt < 0 || value.lastDispatchedAttempt > (value.attemptCount ?? 1)) fail('REGISTRY_INVALID', 'lastDispatchedAttempt 无效');
    if (value.lastDispatchedAttempt === 0 && value.lastDispatchedAt !== null) fail('REGISTRY_INVALID', '未派发任务不能有 lastDispatchedAt');
    if (value.lastDispatchedAttempt > 0 && !isTimestamp(value.lastDispatchedAt)) fail('REGISTRY_INVALID', '已派发任务必须有 lastDispatchedAt');
    if (value.status !== 'executing' && value.lastDispatchedAttempt !== (value.attemptCount ?? 1)) fail('REGISTRY_INVALID', '非 executing 任务必须已登记当前轮派发');
  }
  const parallelFields = ['parallelProtocolVersion', 'parallelBatchId', 'parallelCandidateId', 'parallelLane', 'parallelConflictDomains', 'parallelReviewCost', 'parallelWorktreeIdentity'];
  const presentParallelFields = parallelFields.filter((key) => key in value);
  if (presentParallelFields.length !== 0 && presentParallelFields.length !== parallelFields.length) fail('REGISTRY_INVALID', 'parallel task 控制字段必须同时存在');
  if (presentParallelFields.length === parallelFields.length) {
    if (![0, PARALLEL_BATCH_PROTOCOL_VERSION].includes(value.parallelProtocolVersion)) fail('REGISTRY_INVALID', 'parallelProtocolVersion 无效');
    if (value.parallelProtocolVersion === 0) {
      if (value.parallelBatchId !== null || value.parallelCandidateId !== null || value.parallelLane !== null || value.parallelConflictDomains.length > 0 || value.parallelReviewCost !== null || value.parallelWorktreeIdentity !== null) fail('REGISTRY_INVALID', 'legacy task 不得伪造 parallel batch 数据');
    } else {
      if (!isSafeThreadId(value.parallelBatchId) || !isSafeThreadId(value.parallelCandidateId) || !has(value.parallelLane, PARALLEL_LANES) || !Array.isArray(value.parallelConflictDomains) || !value.parallelConflictDomains.every(nonEmpty) || !Number.isInteger(value.parallelReviewCost) || value.parallelReviewCost < 1) fail('REGISTRY_INVALID', 'parallel task batch/candidate/lane/conflict/review 数据无效');
      if (implementationTask(value) && !isObject(value.parallelWorktreeIdentity)) fail('REGISTRY_INVALID', 'parallel implementation task 缺少 worktreeIdentity');
      if (!implementationTask(value) && value.parallelWorktreeIdentity !== null) fail('REGISTRY_INVALID', 'parallel control_only task 不得携带 worktreeIdentity');
    }
  }
  const observabilityFields = ['observabilityProtocolVersion', 'observabilityReceipts'];
  const presentObservabilityFields = observabilityFields.filter((key) => key in value);
  if (presentObservabilityFields.length !== 0 && presentObservabilityFields.length !== observabilityFields.length) fail('REGISTRY_INVALID', 'observability 控制字段必须同时存在');
  if (presentObservabilityFields.length === observabilityFields.length) {
    if (![0, OBSERVABILITY_PROTOCOL_VERSION].includes(value.observabilityProtocolVersion) || !Array.isArray(value.observabilityReceipts)) fail('REGISTRY_INVALID', 'observability protocol/receipts 无效');
    if (value.observabilityProtocolVersion === 0 && value.observabilityReceipts.length > 0) fail('REGISTRY_INVALID', 'legacy task 不得伪造 observability receipts');
    const receiptIds = new Set();
    for (const receipt of value.observabilityReceipts) {
      if (!isObject(receipt) || receipt.schemaVersion !== 1 || receipt.eventName !== 'task_lifecycle' || !has(receipt.phase, OBSERVABILITY_PHASES) || receipt.outcome !== 'succeeded' || !isTimestamp(receipt.wallTimeUtc) || !/^\d+$/.test(receipt.monotonicTimeNs ?? '') || !nonEmpty(receipt.clockId) || receipt.threadId !== value.threadId || receipt.taskId !== value.threadId || receipt.turnId !== null || receipt.requestId !== null || receipt.callId !== null || !nonEmpty(receipt.correlationId) || receiptIds.has(receipt.correlationId) || !Number.isInteger(receipt.attempt) || receipt.attempt < 1 || receipt.source !== 'task_control' || receipt.confidence !== 'direct') fail('REGISTRY_INVALID', 'observability receipt 结构、归属或相关标识无效');
      receiptIds.add(receipt.correlationId);
    }
  }
  const progressFields = ['progressEventCreatedAt', 'lastProgressSummary'];
  const presentProgressFields = progressFields.filter((key) => key in value);
  if (presentProgressFields.length !== 0 && presentProgressFields.length !== progressFields.length) fail('REGISTRY_INVALID', '进度字段必须同时存在');
  if (presentProgressFields.length === progressFields.length && (!isTimestamp(value.progressEventCreatedAt) || !nonEmpty(value.lastProgressSummary))) fail('REGISTRY_INVALID', 'progressEventCreatedAt 或 lastProgressSummary 无效');
  if ('incidentalRepairEventCreatedAt' in value && !isTimestamp(value.incidentalRepairEventCreatedAt)) fail('REGISTRY_INVALID', 'incidentalRepairEventCreatedAt 无效');
  if ('objectiveProtocolVersion' in value) {
    if (![0, OBJECTIVE_PROTOCOL_VERSION].includes(value.objectiveProtocolVersion) || !Array.isArray(value.failureHistory) || !Array.isArray(value.diagnostics)) fail('REGISTRY_INVALID', 'objective 控制字段无效');
    if (value.objectiveProtocolVersion === 0) {
      if (value.objectiveId !== null || value.replacementOfThreadId !== null || value.replacementOrdinal !== 0 || value.objectiveBudgetMinutes !== null || value.objectiveCreatedAt !== null || value.failureHistory.length > 0 || value.diagnostics.length > 0 || value.closeout !== null) fail('REGISTRY_INVALID', 'legacy objective 记录不得伪造 v0.9 控制数据');
    } else {
      if (!isSafeThreadId(value.objectiveId) || (value.replacementOfThreadId !== null && !isSafeThreadId(value.replacementOfThreadId)) || !Number.isInteger(value.replacementOrdinal) || value.replacementOrdinal < 0 || !Number.isInteger(value.objectiveBudgetMinutes) || value.objectiveBudgetMinutes <= 0 || !isTimestamp(value.objectiveCreatedAt)) fail('REGISTRY_INVALID', 'objective identity/budget 无效');
      for (const failure of value.failureHistory) {
        if (!isObject(failure) || !FAILURE_EVENT_TYPES.includes(failure.type) || !has(failure.failureClass, FAILURE_CLASSES.filter((entry) => entry !== 'unclassified')) || !has(failure.failureDomain, FAILURE_DOMAINS) || !nonEmpty(failure.attemptedStage) || !nonEmpty(failure.commandSummary) || typeof failure.mechanicalRetryEligible !== 'boolean' || !Number.isInteger(failure.attemptCount) || failure.attemptCount < 1 || !isTimestamp(failure.createdAt) || !Array.isArray(failure.evidence) || failure.evidence.length === 0 || !failure.evidence.every((entry) => isObject(entry) && nonEmpty(entry.id) && nonEmpty(entry.reference)) || (failure.authority !== undefined && !has(failure.authority, FAILURE_AUTHORITIES)) || (failure.evidenceCommandId !== undefined && failure.evidenceCommandId !== null && !nonEmpty(failure.evidenceCommandId)) || (failure.failureMode !== undefined && !has(failure.failureMode, EVIDENCE_FAILURE_MODES)) || (failure.evidenceClass !== undefined && failure.evidenceClass !== null && !has(failure.evidenceClass, EVIDENCE_CLASSES)) || (failure.recoveryExhausted !== undefined && typeof failure.recoveryExhausted !== 'boolean')) fail('REGISTRY_INVALID', 'failureHistory 记录无效');
      }
      for (const diagnostic of value.diagnostics) {
        if (!isObject(diagnostic) || !isSafeThreadId(diagnostic.diagnosticId) || !has(diagnostic.classification, DIAGNOSTIC_CLASSIFICATIONS) || !nonEmpty(diagnostic.summary) || !isTimestamp(diagnostic.recordedAt) || !Array.isArray(diagnostic.evidenceRefs)) fail('REGISTRY_INVALID', 'diagnostic 记录无效');
        if (diagnostic.classification === 'milestone_blocker' && ![diagnostic.playerImpact, diagnostic.normalLifecycleReproduction, diagnostic.growthTrend, diagnostic.whyBlocking].every(nonEmpty)) fail('REGISTRY_INVALID', 'milestone blocker 缺少产品价值证据');
      }
      if (value.closeout !== null && (!isObject(value.closeout) || !['pending', 'complete'].includes(value.closeout.status) || !nonEmpty(value.closeout.userVisibleSummary) || !['pending', 'sent'].includes(value.closeout.notificationStatus) || !['pending', 'synced'].includes(value.closeout.reportStatus) || !isTimestamp(value.closeout.createdAt))) fail('REGISTRY_INVALID', 'closeout 记录无效');
      if (value.closeout?.status === 'complete' && !closeoutComplete(value)) fail('REGISTRY_INVALID', 'complete closeout 必须已通知并同步报告');
    }
    if (value.executionEndedAt !== null && !isTimestamp(value.executionEndedAt)) fail('REGISTRY_INVALID', 'executionEndedAt 无效');
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
  if ('threadActionHistory' in value) {
    if (!Array.isArray(value.threadActionHistory)) fail('REGISTRY_INVALID', 'threadActionHistory 必须是数组');
    for (const entry of value.threadActionHistory) {
      if (!isObject(entry) || !has(entry.action, THREAD_ACTION_TYPES) || !has(entry.outcome, THREAD_ACTION_OUTCOMES) || !nonEmpty(entry.detail) || !isTimestamp(entry.recordedAt)) fail('REGISTRY_INVALID', 'threadActionHistory 记录无效');
    }
  }
  if (value.resultProtocolVersion === RESULT_PROTOCOL_VERSION) {
    const currentDeliverable = value.deliverableHistory.findLast((entry) => entry.attempt === value.attemptCount && entry.candidateCommit === value.candidateCommit);
    if (value.status === 'awaiting_review' && currentDeliverable?.deliveryStatus !== 'candidate') fail('REGISTRY_INVALID', 'awaiting_review 必须对应 candidate 成果包');
    if (value.status === 'accepted' && currentDeliverable?.deliveryStatus !== 'accepted_not_integrated') fail('REGISTRY_INVALID', 'accepted 必须对应 accepted_not_integrated 成果包');
    if (value.status === 'integrated' && currentDeliverable?.deliveryStatus !== 'integrated') fail('REGISTRY_INVALID', 'integrated 必须对应 integrated 成果包');
    if (['changes_requested', 'reclaimed'].includes(value.status) && value.candidateCommit !== null && currentDeliverable?.deliveryStatus !== 'rejected') fail('REGISTRY_INVALID', `${value.status} 的当前成果包必须显示为 rejected`);
    if (value.status === 'blocked' && currentDeliverable && currentDeliverable.deliveryStatus !== 'rejected') fail('REGISTRY_INVALID', 'blocked 的当前成果包必须显示为 rejected');
  }
  if (!isTimestamp(value.updatedAt) || !lifecycleConsistent(value)) fail('REGISTRY_INVALID', '任务生命周期或 updatedAt 无效');
  return { ...value };
}

function assertExactKeys(value, allowed, code, label) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) fail(code, `${label} 包含未允许字段: ${unexpected.join(', ')}`);
}

function validateCheckpointSourceRef(value) {
  if (!isObject(value)) fail('CHECKPOINT_MANIFEST_INVALID', 'sourceRef 必须是对象');
  assertExactKeys(value, ['type', 'ref', 'label'], 'CHECKPOINT_MANIFEST_INVALID', 'sourceRef');
  if (!has(value.type, CHECKPOINT_SOURCE_TYPES) || !nonEmpty(value.ref) || value.ref.length > 2048 || /[\u0000-\u001f]/.test(value.ref)) fail('CHECKPOINT_MANIFEST_INVALID', 'sourceRef type/ref 无效');
  if (value.type === 'file' && !win32.isAbsolute(value.ref)) fail('CHECKPOINT_MANIFEST_INVALID', 'file sourceRef 必须是 Windows 绝对路径');
  if (['thread', 'task'].includes(value.type) && !isSafeThreadId(value.ref)) fail('CHECKPOINT_MANIFEST_INVALID', `${value.type} sourceRef 必须是安全 ID`);
  if (value.label !== undefined && value.label !== null && (!nonEmpty(value.label) || value.label.length > 200)) fail('CHECKPOINT_MANIFEST_INVALID', 'sourceRef label 无效');
  return { type: value.type, ref: value.type === 'file' ? win32.resolve(value.ref) : value.ref.trim(), label: value.label?.trim() ?? null };
}

function validateCheckpointManifest(value, identity) {
  if (!isObject(value)) fail('CHECKPOINT_MANIFEST_INVALID', 'checkpoint manifest 必须是对象');
  assertExactKeys(value, ['schemaVersion', 'projectKey', 'controllerThreadId', 'scopeSummary', 'points'], 'CHECKPOINT_MANIFEST_INVALID', 'checkpoint manifest');
  if (value.schemaVersion !== CHECKPOINT_PROTOCOL_VERSION || value.projectKey !== identity.projectKey || value.controllerThreadId !== identity.controllerThreadId || !nonEmpty(value.scopeSummary) || value.scopeSummary.length > 2000 || !Array.isArray(value.points) || value.points.length < 1 || value.points.length > 12) fail('CHECKPOINT_MANIFEST_INVALID', 'checkpoint manifest 身份、摘要或 points 数量无效');
  const factIds = new Set();
  const points = value.points.map((point) => {
    if (!isObject(point)) fail('CHECKPOINT_MANIFEST_INVALID', 'checkpoint point 必须是对象');
    assertExactKeys(point, ['factId', 'kind', 'authority', 'summary', 'preloadPolicy', 'revision', 'sourceRefs', 'supersedes'], 'CHECKPOINT_MANIFEST_INVALID', 'checkpoint point');
    if (!isSafeThreadId(point.factId) || factIds.has(point.factId) || !has(point.kind, CHECKPOINT_POINT_KINDS) || !has(point.authority, CHECKPOINT_AUTHORITIES) || !nonEmpty(point.summary) || point.summary.length > 1000 || !has(point.preloadPolicy, CHECKPOINT_PRELOAD_POLICIES) || !Number.isInteger(point.revision) || point.revision < 1 || !Array.isArray(point.sourceRefs) || point.sourceRefs.length > 12 || !Array.isArray(point.supersedes) || point.supersedes.some((factId) => !isSafeThreadId(factId))) fail('CHECKPOINT_MANIFEST_INVALID', `checkpoint point 无效: ${point.factId ?? '(missing)'}`);
    if (point.preloadPolicy === 'always' && !CHECKPOINT_ALWAYS_AUTHORITIES.includes(point.authority)) fail('CHECKPOINT_MANIFEST_INVALID', `只有已确认 authority 可以 always preload: ${point.factId}`);
    if (point.authority === 'superseded' && point.preloadPolicy !== 'never') fail('CHECKPOINT_MANIFEST_INVALID', `superseded point 必须设为 never: ${point.factId}`);
    factIds.add(point.factId);
    return { factId: point.factId, kind: point.kind, authority: point.authority, summary: point.summary.trim(), preloadPolicy: point.preloadPolicy, revision: point.revision, sourceRefs: point.sourceRefs.map(validateCheckpointSourceRef), supersedes: [...new Set(point.supersedes)] };
  });
  return { schemaVersion: CHECKPOINT_PROTOCOL_VERSION, projectKey: identity.projectKey, controllerThreadId: identity.controllerThreadId, scopeSummary: value.scopeSummary.trim(), points };
}

function validateControllerCheckpoint(value, knownControllers) {
  if (!isObject(value) || value.schemaVersion !== CHECKPOINT_PROTOCOL_VERSION || !knownControllers.has(value.controllerThreadId) || !Number.isInteger(value.sequence) || value.sequence < 1 || !/^checkpoint-\d{4,}$/.test(value.latestCheckpointId ?? '') || !/^[0-9a-f]{64}$/.test(value.latestCheckpointDigest ?? '') || !nonEmpty(value.checkpointPath) || !win32.isAbsolute(value.checkpointPath) || !isTimestamp(value.sealedAt)) fail('REGISTRY_INVALID', 'controller checkpoint pointer 无效');
  return { ...value, checkpointPath: win32.resolve(value.checkpointPath) };
}

function validateControllerHandoff(value, knownControllers, checkpointByController) {
  if (!isObject(value) || value.schemaVersion !== HANDOFF_PROTOCOL_VERSION || !isSafeThreadId(value.handoffId) || !knownControllers.has(value.sourceControllerThreadId) || !isSafeThreadId(value.successorThreadId) || value.successorThreadId === value.sourceControllerThreadId || !has(value.status, HANDOFF_STATUSES) || !/^checkpoint-\d{4,}$/.test(value.checkpointId ?? '') || !/^[0-9a-f]{64}$/.test(value.checkpointDigest ?? '') || !isTimestamp(value.preparedAt)) fail('REGISTRY_INVALID', 'controller handoff 无效');
  const checkpoint = checkpointByController.get(value.sourceControllerThreadId);
  if (!checkpoint || checkpoint.latestCheckpointId !== value.checkpointId || checkpoint.latestCheckpointDigest !== value.checkpointDigest) fail('REGISTRY_INVALID', 'controller handoff 未绑定当前 sealed checkpoint');
  if (value.status === 'accepted' && (!isTimestamp(value.acceptedAt) || value.cancelledAt !== null || value.cancelReason !== null)) fail('REGISTRY_INVALID', 'accepted handoff 状态无效');
  if (value.status === 'cancelled' && (!isTimestamp(value.cancelledAt) || !nonEmpty(value.cancelReason) || value.acceptedAt !== null)) fail('REGISTRY_INVALID', 'cancelled handoff 状态无效');
  if (value.status === 'prepared' && (value.acceptedAt !== null || value.cancelledAt !== null || value.cancelReason !== null)) fail('REGISTRY_INVALID', 'prepared handoff 状态无效');
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
  const tasks = value.tasks.map((task) => validateTask(task, value.projectRoot));
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
  const knownControllers = new Set([...roots, ...tasks.map((task) => task.threadId)]);
  const heartbeatValues = value.controllerHeartbeats ?? [];
  if (!Array.isArray(heartbeatValues)) fail('REGISTRY_INVALID', 'controllerHeartbeats 必须是数组');
  const heartbeatControllers = new Set();
  const controllerHeartbeats = heartbeatValues.map((heartbeat) => {
    const validated = validateControllerHeartbeat(heartbeat, knownControllers);
    if (heartbeatControllers.has(validated.controllerThreadId)) fail('REGISTRY_INVALID', `重复 controller heartbeat: ${validated.controllerThreadId}`);
    heartbeatControllers.add(validated.controllerThreadId);
    return validated;
  });
  const controllerHealth = value.controllerHealth ?? [];
  if (!Array.isArray(controllerHealth)) fail('REGISTRY_INVALID', 'controllerHealth 必须是数组');
  const healthControllers = new Set();
  for (const health of controllerHealth) {
    if (!isObject(health) || !isSafeThreadId(health.controllerThreadId) || healthControllers.has(health.controllerThreadId) || !has(health.status, CONTEXT_HEALTH_STATUSES) || !nonEmpty(health.reportPath) || !/^[0-9a-f]{64}$/.test(health.reportSha256 ?? '') || !isTimestamp(health.capturedAt) || !isObject(health.metrics)) fail('REGISTRY_INVALID', 'controllerHealth receipt 无效');
    healthControllers.add(health.controllerThreadId);
  }
  const messageValues = value.controllerMessages ?? [];
  if (!Array.isArray(messageValues)) fail('REGISTRY_INVALID', 'controllerMessages 必须是数组');
  const messageIds = new Set();
  const controllerMessages = messageValues.map((message) => {
    const validated = validateControllerMessage(message, tasks, knownControllers);
    if (messageIds.has(validated.messageId)) fail('REGISTRY_INVALID', `重复 controller message: ${validated.messageId}`);
    messageIds.add(validated.messageId);
    return validated;
  });
  const parallelValues = value.parallelBatches ?? [];
  if (!Array.isArray(parallelValues)) fail('REGISTRY_INVALID', 'parallelBatches 必须是数组');
  const parallelIds = new Set();
  const parallelBatches = parallelValues.map((batch) => {
    const validated = validateParallelBatchRecord(batch, tasks, knownControllers, value.projectRoot);
    if (parallelIds.has(validated.batchId)) fail('REGISTRY_INVALID', `重复 parallel batch: ${validated.batchId}`);
    parallelIds.add(validated.batchId);
    return validated;
  });
  const checkpointValues = value.controllerCheckpoints ?? [];
  if (!Array.isArray(checkpointValues)) fail('REGISTRY_INVALID', 'controllerCheckpoints 必须是数组');
  const checkpointControllers = new Set();
  const controllerCheckpoints = checkpointValues.map((checkpoint) => {
    const validated = validateControllerCheckpoint(checkpoint, knownControllers);
    if (checkpointControllers.has(validated.controllerThreadId)) fail('REGISTRY_INVALID', `重复 controller checkpoint: ${validated.controllerThreadId}`);
    checkpointControllers.add(validated.controllerThreadId);
    return validated;
  });
  const checkpointByController = new Map(controllerCheckpoints.map((checkpoint) => [checkpoint.controllerThreadId, checkpoint]));
  const handoffValues = value.controllerHandoffs ?? [];
  if (!Array.isArray(handoffValues)) fail('REGISTRY_INVALID', 'controllerHandoffs 必须是数组');
  const handoffIds = new Set(); const preparedSources = new Set(); const preparedSuccessors = new Set();
  const controllerHandoffs = handoffValues.map((handoff) => {
    const validated = validateControllerHandoff(handoff, knownControllers, checkpointByController);
    if (handoffIds.has(validated.handoffId)) fail('REGISTRY_INVALID', `重复 controller handoff: ${validated.handoffId}`);
    handoffIds.add(validated.handoffId);
    if (validated.status === 'prepared') {
      if (preparedSources.has(validated.sourceControllerThreadId) || preparedSuccessors.has(validated.successorThreadId)) fail('REGISTRY_INVALID', '同一 source 或 successor 只能存在一个 prepared handoff');
      preparedSources.add(validated.sourceControllerThreadId); preparedSuccessors.add(validated.successorThreadId);
    }
    return validated;
  });
  return { schemaVersion: 1, projectKey: value.projectKey, projectRoot: normalizeWindowsPath(value.projectRoot), rootControllerThreadIds: [...roots], controllerHeartbeats, controllerHealth: controllerHealth.map((entry) => ({ ...entry })), controllerMessages, parallelBatches, controllerCheckpoints, controllerHandoffs, updatedAt: value.updatedAt, tasks };
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
    const registry = { schemaVersion: 1, projectKey: paths.projectKey, projectRoot: paths.projectRoot, rootControllerThreadIds: [], controllerHeartbeats: [], controllerHealth: [], controllerMessages: [], parallelBatches: [], controllerCheckpoints: [], controllerHandoffs: [], updatedAt: new Date().toISOString(), tasks: [] };
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

async function mutateController({ codexHome, taskControlHome, projectRoot, controllerThreadId, threadId, mutate, heartbeatReason = null }) {
  const resolvedHome = resolveTaskControlHome({ codexHome, taskControlHome });
  const { paths } = await ensureProject(resolvedHome, projectRoot);
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const controlledRegistry = { ...registry, tasks: ensureTaskControls(registry.tasks, registry.rootControllerThreadIds) };
    assertNoExpiredPendingHeartbeat(controlledRegistry, controllerThreadId);
    const current = taskOrThrow(controlledRegistry, threadId);
    assertTaskController(current, controllerThreadId);
    const mutatedTask = await mutate(current, controlledRegistry);
    const nextTask = refreshThreadControl(mutatedTask, current);
    let next = validateRegistry({ ...controlledRegistry, updatedAt: new Date().toISOString(), tasks: controlledRegistry.tasks.map((task) => task.threadId === threadId ? nextTask : task) }, paths.projectKey, paths.projectRoot);
    let heartbeat = null;
    if (heartbeatReason !== null) {
      heartbeat = rearmControllerHeartbeatInRegistry(next, controllerThreadId, heartbeatReason, threadId);
      next = validateRegistry(heartbeat.registry, paths.projectKey, paths.projectRoot);
    }
    await atomicWriteJson(paths.registryPath, next);
    return controllerMutationResult(nextTask, next.tasks, heartbeat);
  });
}

export async function controllerRearmHeartbeat(input) {
  const resolvedHome = resolveTaskControlHome(input);
  const { paths } = await ensureProject(resolvedHome, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  const reason = input.reason ?? 'reconcile';
  if (reason !== 'reconcile') fail('CLI_INVALID_ARGUMENTS', 'controller-rearm-heartbeat 只能用于成功 reconciliation');
  return withExclusiveLock(paths.registryPath, async () => {
    const rawRegistry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const registry = { ...rawRegistry, tasks: ensureTaskControls(rawRegistry.tasks, rawRegistry.rootControllerThreadIds) };
    const controllerKnown = registry.rootControllerThreadIds.includes(input.controllerThreadId) || registry.tasks.some((task) => task.threadId === input.controllerThreadId);
    if (!controllerKnown) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 未登记为项目主控或父任务');
    const heartbeat = rearmControllerHeartbeatInRegistry(registry, input.controllerThreadId, reason, null);
    const next = validateRegistry(heartbeat.registry, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { projectKey: next.projectKey, controllerThreadId: input.controllerThreadId, heartbeatState: heartbeat.state, pendingHeartbeatState: heartbeat.pendingState, heartbeatAction: heartbeat.heartbeatAction, reusedPendingHeartbeatAction: heartbeat.reusedPendingAction };
  });
}

export async function controllerResumeWatchdog(input) {
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', '恢复 watchdog 必须提供具体 reason');
  const resolvedHome = resolveTaskControlHome(input);
  const { paths } = await ensureProject(resolvedHome, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  return withExclusiveLock(paths.registryPath, async () => {
    const rawRegistry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const registry = { ...rawRegistry, tasks: ensureTaskControls(rawRegistry.tasks, rawRegistry.rootControllerThreadIds) };
    const found = registry.controllerHeartbeats.find((heartbeat) => heartbeat.controllerThreadId === input.controllerThreadId);
    if (!found) fail('HEARTBEAT_NOT_REGISTERED', 'controller heartbeat 尚未登记');
    const state = heartbeatEvidenceDefaults(found);
    if (state.disabledAt === null) fail('WATCHDOG_NOT_FUSED', 'watchdog 当前未熔断，无需恢复');
    if (state.pendingAction !== null || state.status !== 'cancelled' || state.automationId !== null) fail('WATCHDOG_CLEANUP_REQUIRED', '必须先完成或人工确认 heartbeat automation 清理，再恢复 watchdog');
    const now = new Date();
    const resumedState = {
      ...state,
      disabledAt: null,
      disableReason: null,
      notificationStatus: 'not_required',
      consecutiveStaleCount: 0,
      consecutiveNoProgressCycles: 0,
      lastCycleFingerprint: null,
      lastCycleReceiptKey: null,
      lastMeaningfulProgressAt: now.toISOString(),
      actionFailureCount: 0,
      deleteFailureCount: 0,
      manualResumeCount: state.manualResumeCount + 1,
      lastManualResumeAt: now.toISOString(),
      lastManualResumeReason: input.reason.trim(),
      updatedAt: now.toISOString(),
    };
    const resumedRegistry = { ...registry, controllerHeartbeats: [...registry.controllerHeartbeats.filter((heartbeat) => heartbeat.controllerThreadId !== input.controllerThreadId), resumedState], updatedAt: now.toISOString() };
    const heartbeat = rearmControllerHeartbeatInRegistry(resumedRegistry, input.controllerThreadId, 'reconcile', null, now);
    const next = validateRegistry(heartbeat.registry, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { projectKey: next.projectKey, controllerThreadId: input.controllerThreadId, resumed: true, heartbeatState: heartbeat.state, pendingHeartbeatState: heartbeat.pendingState, heartbeatAction: heartbeat.heartbeatAction };
  });
}

export async function controllerFinalizeCycle(input) {
  const resolvedHome = resolveTaskControlHome(input);
  const { paths } = await ensureProject(resolvedHome, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  return withExclusiveLock(paths.registryPath, async () => {
    const rawRegistry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const registry = { ...rawRegistry, tasks: ensureTaskControls(rawRegistry.tasks, rawRegistry.rootControllerThreadIds) };
    const controllerKnown = registry.rootControllerThreadIds.includes(input.controllerThreadId) || registry.tasks.some((task) => task.threadId === input.controllerThreadId);
    if (!controllerKnown) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 未登记为项目主控或父任务');
    const before = controllerCycleGate(registry, input.controllerThreadId);
    const unresolvedCloseouts = before.queues.directTasks.filter((task) => task.closeout !== null && !closeoutComplete(task)).map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, notificationStatus: task.closeout.notificationStatus, reportStatus: task.closeout.reportStatus }));
    const requiredThreadActions = before.queues.directTasks.flatMap((task) => threadActionsForTask(task, registry.tasks));
    if (before.heartbeatState?.pendingAction?.manualOnly === true) return { projectKey: registry.projectKey, controllerThreadId: input.controllerThreadId, finalized: false, businessAllowed: true, phase: 'watchdog_manual_cleanup_required', heartbeatState: before.heartbeatState, heartbeatAction: before.heartbeatAction, unresolvedCloseouts, requiredThreadActions };
    const routingOnly = before.queues.routingTasks.length > 0 && unresolvedCloseouts.length === 0 && requiredThreadActions.length === 0 && !before.queues.shouldKeepHeartbeat;
    if (routingOnly) {
      if (before.heartbeatState !== null && before.heartbeatState.pendingAction !== null) return { projectKey: registry.projectKey, controllerThreadId: input.controllerThreadId, finalized: false, businessAllowed: before.businessAllowed, phase: Date.now() > Date.parse(before.heartbeatState.pendingAction.expiresAt) ? 'compensate_timed_out_heartbeat' : 'resolve_heartbeat_action', heartbeatState: before.heartbeatState, heartbeatAction: before.heartbeatAction, unresolvedCloseouts: [], requiredThreadActions: [] };
      return { projectKey: registry.projectKey, controllerThreadId: input.controllerThreadId, finalized: false, businessAllowed: true, phase: 'awaiting_dispatch', heartbeatState: before.heartbeatState, heartbeatAction: null, unresolvedCloseouts: [], requiredThreadActions: [] };
    }
    if (unresolvedCloseouts.length > 0 || requiredThreadActions.length > 0 || before.queues.shouldKeepHeartbeat) {
      if (before.heartbeatState !== null && before.heartbeatState.pendingAction !== null) return { projectKey: registry.projectKey, controllerThreadId: input.controllerThreadId, finalized: false, businessAllowed: false, phase: Date.now() > Date.parse(before.heartbeatState.pendingAction.expiresAt) ? 'compensate_timed_out_heartbeat' : 'resolve_heartbeat_action', heartbeatState: before.heartbeatState, heartbeatAction: before.heartbeatAction, unresolvedCloseouts, requiredThreadActions };
      const heartbeat = rearmControllerHeartbeatInRegistry(registry, input.controllerThreadId, 'finalize', null);
      const next = validateRegistry(heartbeat.registry, paths.projectKey, paths.projectRoot);
      await atomicWriteJson(paths.registryPath, next);
      return { projectKey: next.projectKey, controllerThreadId: input.controllerThreadId, finalized: false, businessAllowed: false, phase: 'resolve_heartbeat_action', heartbeatState: heartbeat.state, heartbeatAction: heartbeat.heartbeatAction, unresolvedCloseouts, requiredThreadActions };
    }
    const settled = before.heartbeatState === null || (before.heartbeatState.pendingAction === null && before.heartbeatState.status === 'cancelled' && before.heartbeatState.automationId === null);
    if (settled) return { projectKey: registry.projectKey, controllerThreadId: input.controllerThreadId, finalized: true, businessAllowed: true, phase: 'finalized', heartbeatState: before.heartbeatState, heartbeatAction: null, unresolvedCloseouts: [], requiredThreadActions: [] };
    const heartbeat = rearmControllerHeartbeatInRegistry(registry, input.controllerThreadId, 'finalize', null);
    const next = validateRegistry(heartbeat.registry, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { projectKey: next.projectKey, controllerThreadId: input.controllerThreadId, finalized: false, businessAllowed: false, phase: 'delete_heartbeat', heartbeatState: heartbeat.state, heartbeatAction: heartbeat.heartbeatAction, unresolvedCloseouts: [], requiredThreadActions: [] };
  });
}

export async function controllerAssertBusinessReady(input) {
  const resolvedHome = resolveTaskControlHome(input);
  const { paths } = await ensureProject(resolvedHome, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  const rawRegistry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
  const registry = { ...rawRegistry, tasks: ensureTaskControls(rawRegistry.tasks, rawRegistry.rootControllerThreadIds) };
  const controllerKnown = registry.rootControllerThreadIds.includes(input.controllerThreadId) || registry.tasks.some((task) => task.threadId === input.controllerThreadId);
  if (!controllerKnown) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 未登记为项目主控或父任务');
  const gate = controllerCycleGate(registry, input.controllerThreadId);
  if (!gate.businessAllowed) fail('CONTROLLER_CYCLE_RECONCILE_REQUIRED', `${gate.reason}; 先执行 controller-finalize-cycle 并真实完成返回的 host heartbeat action`);
  return { projectKey: registry.projectKey, controllerThreadId: input.controllerThreadId, businessAllowed: true, heartbeatState: gate.heartbeatState, heartbeatWarning: gate.heartbeatWarning ?? null, heartbeatAction: gate.heartbeatAction ?? null };
}

function appendHeartbeatActionHistory(state, pending, outcome, detail, recordedAt = new Date().toISOString()) {
  const entry = { actionId: pending.actionId, type: pending.type, outcome, generation: pending.generation, detail, recordedAt };
  return [...state.actionHistory, entry].slice(-100);
}

async function mutateControllerHeartbeat(input, mutate) {
  const resolvedHome = resolveTaskControlHome(input);
  const { paths } = await ensureProject(resolvedHome, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const controllerKnown = registry.rootControllerThreadIds.includes(input.controllerThreadId) || registry.tasks.some((task) => task.threadId === input.controllerThreadId);
    if (!controllerKnown) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 未登记为项目主控或父任务');
    const found = registry.controllerHeartbeats.find((heartbeat) => heartbeat.controllerThreadId === input.controllerThreadId);
    if (!found) fail('HEARTBEAT_NOT_REGISTERED', 'controller heartbeat 尚未登记');
    const current = heartbeatEvidenceDefaults(found);
    const result = await mutate(current, registry);
    const nextState = result.state;
    const next = validateRegistry({ ...registry, controllerHeartbeats: [...registry.controllerHeartbeats.filter((heartbeat) => heartbeat.controllerThreadId !== input.controllerThreadId), nextState], updatedAt: new Date().toISOString() }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { projectKey: next.projectKey, controllerThreadId: input.controllerThreadId, heartbeatState: nextState, ...result.output };
  });
}

export async function controllerConfirmHeartbeatAction(input) {
  if (!isSafeThreadId(input.actionId)) fail('CLI_INVALID_ARGUMENTS', 'actionId 无效');
  return mutateControllerHeartbeat(input, async (state) => {
    const pending = state.pendingAction;
    if (pending === null || pending.actionId !== input.actionId) fail('HEARTBEAT_ACTION_STALE', '待确认 heartbeat action 不存在或已被替换');
    const now = new Date().toISOString();
    let automationId = null;
    if (pending.type === 'create_controller_heartbeat') {
      assertSafeThreadId(input.automationId, 'automationId');
      if (pending.previousAutomationId !== null && input.automationId === pending.previousAutomationId) fail('HEARTBEAT_IN_PLACE_REPLACE_FORBIDDEN', 'heartbeat 必须 create-new/confirm/switch，禁止原 id 原地替换');
      automationId = input.automationId;
    } else if (pending.type === 'finalize_controller_cycle') {
      if (!['deleted', 'not_found'].includes(input.pendingCreateCleanupOutcome)) fail('HEARTBEAT_FINALIZATION_EVIDENCE_REQUIRED', 'cycle finalization 必须记录 pending create cleanup outcome=deleted|not_found');
      if (pending.previousAutomationId !== null && input.automationId !== pending.previousAutomationId) fail('HEARTBEAT_AUTOMATION_MISMATCH', 'cycle finalization 的 confirmed automation 与待删除对象不一致');
    } else if (pending.previousAutomationId !== null && input.automationId !== pending.previousAutomationId) {
      fail('HEARTBEAT_AUTOMATION_MISMATCH', '删除确认的 automationId 与待删除对象不一致');
    }
    const retiredAutomationIds = pending.previousAutomationId === null ? state.retiredAutomationIds : [...new Set([...state.retiredAutomationIds, pending.previousAutomationId])];
    const preserveFuse = pending.desiredStatus === 'cancelled' && state.disabledAt !== null;
    const nextState = {
      ...state,
      generation: pending.generation,
      status: pending.desiredStatus,
      dueAt: pending.dueAt,
      intervalMs: pending.intervalMs,
      reason: pending.reason,
      triggerTaskThreadId: pending.triggerTaskThreadId,
      updatedAt: now,
      automationId,
      lastSuccessfulGeneration: pending.generation,
      lastSuccessfulAt: now,
      pendingAction: null,
      consecutiveStaleCount: 0,
      lastStaleGeneration: null,
      lastStaleAt: null,
      observedAutomationId: automationId,
      observedGeneration: pending.desiredStatus === 'armed' ? pending.generation : null,
      observedTriggerCount: 0,
      lastTriggeredAt: null,
      actionFailureCount: 0,
      deleteFailureCount: 0,
      disabledAt: preserveFuse ? state.disabledAt : null,
      disableReason: preserveFuse ? state.disableReason : null,
      notificationStatus: preserveFuse ? state.notificationStatus : 'not_required',
      actionHistory: appendHeartbeatActionHistory(state, pending, 'confirmed', pending.type === 'finalize_controller_cycle' ? `pending create cleanup=${input.pendingCreateCleanupOutcome}; confirmed automation deleted` : input.observed === true ? 'automation trigger proved create success' : 'host automation action confirmed'),
      retiredAutomationIds,
      logicalLeaseDueAt: pending.desiredStatus === 'armed' ? pending.dueAt : null,
      logicalLeaseUpdatedAt: now,
    };
    const cleanupHeartbeatAction = pending.type === 'create_controller_heartbeat' && pending.previousAutomationId !== null
      ? { type: 'delete_retired_automation', actionId: randomUUID().replaceAll('-', ''), automationId: pending.previousAutomationId, generation: pending.previousGeneration, timeoutMs: HEARTBEAT_ACTION_TIMEOUT_MS, onTimeout: 'controller-record-heartbeat-action-failed' }
      : null;
    return { state: nextState, output: { confirmedGeneration: pending.generation, cycleFinalized: pending.type === 'finalize_controller_cycle', cleanupHeartbeatAction } };
  });
}

export async function controllerRecordHeartbeatActionFailed(input) {
  if (!isSafeThreadId(input.actionId) || !nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'heartbeat action failure 必须提供 actionId 和 reason');
  return mutateControllerHeartbeat(input, async (state) => {
    const pending = state.pendingAction?.actionId === input.actionId ? state.pendingAction : null;
    if (pending?.manualOnly === true) fail('WATCHDOG_MANUAL_CLEANUP_REQUIRED', '自动清理已经熔断；请在宿主中手动删除对应 automation，再确认该 action');
    const retiredFailure = pending === null && state.pendingAction === null && isSafeThreadId(input.automationId) && (state.retiredAutomationIds.includes(input.automationId) || input.automationId !== state.automationId || state.actionHistory.some((entry) => entry.actionId === input.actionId && entry.type === 'delete_controller_heartbeat'));
    if (pending === null && !retiredFailure) fail('HEARTBEAT_ACTION_STALE', '失败 action 既不是当前 pending，也不是已登记 retired automation');
    const failed = pending ?? { actionId: input.actionId, type: 'delete_controller_heartbeat', generation: state.generation, previousGeneration: state.generation, previousAutomationId: input.automationId };
    const now = new Date().toISOString();
    const actionFailureCount = state.actionFailureCount + 1;
    const deleteFailureCount = state.deleteFailureCount + (['delete_controller_heartbeat', 'finalize_controller_cycle'].includes(failed.type) ? 1 : 0);
    const fuseOpen = deleteFailureCount >= HEARTBEAT_DELETE_FAILURE_LIMIT;
    const retryCurrentCleanup = pending !== null && ['delete_controller_heartbeat', 'finalize_controller_cycle'].includes(failed.type)
      ? { ...failed, actionId: randomUUID().replaceAll('-', ''), preparedAt: now, expiresAt: new Date(Date.parse(now) + HEARTBEAT_ACTION_TIMEOUT_MS).toISOString(), manualOnly: fuseOpen }
      : null;
    const nextState = {
      ...state,
      pendingAction: retryCurrentCleanup,
      updatedAt: now,
      actionFailureCount,
      deleteFailureCount,
      disabledAt: fuseOpen ? now : state.disabledAt,
      disableReason: fuseOpen ? `heartbeat automation delete failed ${deleteFailureCount} times` : state.disableReason,
      notificationStatus: fuseOpen && state.notificationStatus === 'not_required' ? 'pending' : state.notificationStatus,
      actionHistory: appendHeartbeatActionHistory(state, failed, fuseOpen ? 'fused' : 'failed', input.reason.trim(), now),
    };
    const targetAutomationId = ['delete_controller_heartbeat', 'finalize_controller_cycle'].includes(failed.type)
      ? (failed.previousAutomationId ?? input.automationId ?? null)
      : (isSafeThreadId(input.automationId) && input.automationId !== state.automationId ? input.automationId : null);
    const heartbeatAction = retryCurrentCleanup !== null
      ? heartbeatActionForPending(nextState, retryCurrentCleanup)
      : targetAutomationId === null ? null : fuseOpen
        ? { type: 'manual_heartbeat_cleanup_required', actionId: input.actionId, automationId: targetAutomationId, generation: failed.previousGeneration, currentGeneration: nextState.generation, automaticRetry: false, reason: 'delete_failure_limit' }
        : { type: 'delete_stale_automation', actionId: input.actionId, automationId: targetAutomationId, generation: failed.previousGeneration, currentGeneration: nextState.generation, timeoutMs: HEARTBEAT_ACTION_TIMEOUT_MS, reason: 'host_action_failed', onTimeout: 'controller-record-heartbeat-action-failed' };
    return { state: nextState, output: { fuseOpen, notificationRequired: nextState.notificationStatus === 'pending', heartbeatAction } };
  });
}

export async function controllerMarkHeartbeatNotificationSent(input) {
  return mutateControllerHeartbeat(input, async (state) => {
    if (state.notificationStatus !== 'pending') fail('HEARTBEAT_NOTIFICATION_NOT_PENDING', 'heartbeat 熔断通知当前不在 pending');
    return { state: { ...state, notificationStatus: 'sent', updatedAt: new Date().toISOString() }, output: { notificationStatus: 'sent' } };
  });
}

export async function controllerPlanParallelBatch(input) {
  const home = resolveTaskControlHome(input);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  const manifest = input.manifest ?? await loadParallelBatchManifest(input.projectRoot, input.manifestPath);
  const normalized = input.manifest ? { manifestPath: win32.resolve(input.projectRoot, input.manifestPath ?? `.task-control/${manifest.batchId}.json`), manifestDigest: createHash('sha256').update(JSON.stringify(input.manifest), 'utf8').digest('hex'), ...validateParallelBatchManifest(input.manifest, input.projectRoot) } : manifest;
  const { paths } = await ensureProject(home, input.projectRoot, input.controllerThreadId);
  return withExclusiveLock(paths.registryPath, async () => {
    const raw = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const rootControllerThreadIds = raw.rootControllerThreadIds.includes(input.controllerThreadId) || raw.tasks.some((task) => task.threadId === input.controllerThreadId) ? raw.rootControllerThreadIds : [...raw.rootControllerThreadIds, input.controllerThreadId];
    const registry = { ...raw, rootControllerThreadIds, tasks: ensureTaskControls(raw.tasks, rootControllerThreadIds) };
    assertControllerCycleBusinessReady(registry, input.controllerThreadId);
    assertControllerHealthyForDispatch(registry, input.controllerThreadId);
    const debt = controllerThreadDebt(registry, input.controllerThreadId);
    if (debt.blocked) fail('PARALLEL_THREAD_DEBT_BLOCKED', `必须先收口主控债务: ${debt.reasons.join(', ')}`);
    if (registry.parallelBatches.some((batch) => batch.batchId === normalized.batchId)) fail('PARALLEL_BATCH_DUPLICATE', `parallel batch 已存在: ${normalized.batchId}`);
    const now = new Date().toISOString();
    const batch = { ...normalized, controllerThreadId: input.controllerThreadId, status: 'planned', pendingDispatchCandidateIds: [], dispatchWaveId: null, createdAt: now, updatedAt: now, closedAt: null };
    const next = validateRegistry({ ...registry, parallelBatches: [...registry.parallelBatches, batch], updatedAt: now }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { projectKey: next.projectKey, controllerThreadId: input.controllerThreadId, batch: parallelBatchRuntime(next, next.parallelBatches.find((entry) => entry.batchId === batch.batchId)), threadDebt: debt };
  });
}

export async function controllerEvaluateParallelBatch(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  assertSafeThreadId(input.batchId, 'batchId');
  const raw = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
  const registry = { ...raw, tasks: ensureTaskControls(raw.tasks, raw.rootControllerThreadIds) };
  const batch = registry.parallelBatches.find((entry) => entry.batchId === input.batchId);
  if (!batch || batch.controllerThreadId !== input.controllerThreadId) fail('PARALLEL_BATCH_NOT_FOUND', 'parallel batch 不存在或不属于当前直接主控');
  return { projectKey: registry.projectKey, controllerThreadId: input.controllerThreadId, batch: parallelBatchRuntime(registry, batch), threadDebt: controllerThreadDebt(registry, input.controllerThreadId) };
}

export async function controllerPrepareParallelDispatch(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  assertSafeThreadId(input.batchId, 'batchId');
  return withExclusiveLock(paths.registryPath, async () => {
    const raw = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const registry = { ...raw, tasks: ensureTaskControls(raw.tasks, raw.rootControllerThreadIds) };
    assertNoExpiredPendingHeartbeat(registry, input.controllerThreadId);
    assertControllerHealthyForDispatch(registry, input.controllerThreadId);
    const batch = registry.parallelBatches.find((entry) => entry.batchId === input.batchId);
    if (!batch || batch.controllerThreadId !== input.controllerThreadId) fail('PARALLEL_BATCH_NOT_FOUND', 'parallel batch 不存在或不属于当前直接主控');
    if (!['planned', 'running', 'reconciling'].includes(batch.status)) fail('PARALLEL_BATCH_STATE_INVALID', `batch ${batch.batchId} 当前不能准备派发: ${batch.status}`);
    const debt = controllerThreadDebt(registry, input.controllerThreadId);
    if (debt.blocked) fail('PARALLEL_THREAD_DEBT_BLOCKED', `必须先收口主控债务: ${debt.reasons.join(', ')}`);
    const runtime = parallelBatchRuntime(registry, batch);
    let selectedIds = runtime.requiredFanoutCandidateIds;
    if (selectedIds.length === 0 && runtime.singleDispatchAllowed) selectedIds = runtime.selectedCandidateIds;
    if (selectedIds.length === 0) fail('PARALLEL_FANOUT_REQUIRED', `当前不能退化为单任务派发: ${runtime.fanoutBlockers.join(', ') || 'no dispatchable candidates'}`);
    const candidates = selectedIds.map((candidateId) => batch.candidates.find((candidate) => candidate.candidateId === candidateId));
    const tasks = candidates.map((candidate) => candidate?.threadId === null ? null : registry.tasks.find((task) => task.threadId === candidate.threadId));
    if (tasks.some((task) => task === null || !dispatchAllowed(task))) fail('PARALLEL_FANOUT_REGISTRATION_INCOMPLETE', '本波次所有候选必须先登记、完成语义改名并满足合同门禁');
    const now = new Date();
    const dispatchWaveId = `wave_${createHash('sha256').update(`${batch.batchId}:${now.toISOString()}:${selectedIds.join(',')}`).digest('hex').slice(0, 16)}`;
    const prepared = { ...batch, status: 'dispatching', pendingDispatchCandidateIds: selectedIds, dispatchWaveId, updatedAt: now.toISOString() };
    let next = validateRegistry({ ...registry, parallelBatches: registry.parallelBatches.map((entry) => entry.batchId === batch.batchId ? prepared : entry), updatedAt: now.toISOString() }, paths.projectKey, paths.projectRoot);
    const heartbeat = rearmControllerHeartbeatInRegistry(next, input.controllerThreadId, 'dispatch', null, now);
    next = validateRegistry(heartbeat.registry, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { projectKey: next.projectKey, controllerThreadId: input.controllerThreadId, batchId: batch.batchId, dispatchWaveId, requiredDispatches: candidates.map((candidate) => ({ candidateId: candidate.candidateId, threadId: candidate.threadId, lane: candidate.lane })), heartbeatState: heartbeat.state, pendingHeartbeatState: heartbeat.pendingState, heartbeatAction: heartbeat.heartbeatAction };
  });
}

export async function controllerCloseParallelBatch(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  assertSafeThreadId(input.batchId, 'batchId');
  return withExclusiveLock(paths.registryPath, async () => {
    const raw = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const registry = { ...raw, tasks: ensureTaskControls(raw.tasks, raw.rootControllerThreadIds) };
    const batch = registry.parallelBatches.find((entry) => entry.batchId === input.batchId);
    if (!batch || batch.controllerThreadId !== input.controllerThreadId) fail('PARALLEL_BATCH_NOT_FOUND', 'parallel batch 不存在或不属于当前直接主控');
    const runtime = parallelBatchRuntime(registry, batch);
    if (batch.pendingDispatchCandidateIds.length > 0 || runtime.candidateStates.some((candidate) => ['running', 'awaiting_review', 'changes_requested', 'accepted', 'registered'].includes(candidate.state)) || runtime.eligibleCandidates.length > 0) fail('PARALLEL_BATCH_CLOSE_BLOCKED', 'batch 仍有派发、执行、审查或可继续 fan-out 的候选');
    const now = new Date().toISOString();
    const closed = { ...batch, status: 'closed', closedAt: now, updatedAt: now, pendingDispatchCandidateIds: [], dispatchWaveId: null };
    const next = validateRegistry({ ...registry, parallelBatches: registry.parallelBatches.map((entry) => entry.batchId === batch.batchId ? closed : entry), updatedAt: now }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { projectKey: next.projectKey, controllerThreadId: input.controllerThreadId, batch: parallelBatchRuntime(next, closed), finalizeRequired: true, command: 'controller-finalize-cycle' };
  });
}

export async function auditParallelRouting(input = {}) {
  const home = resolveTaskControlHome(input);
  const index = await readIndex(home);
  const violations = [];
  let activeTaskCount = 0;
  let batchCount = 0;
  for (const project of index.projects) {
    const { registry: raw } = await readProjectRegistry(home, project);
    const registry = { ...raw, tasks: ensureTaskControls(raw.tasks, raw.rootControllerThreadIds) };
    batchCount += registry.parallelBatches.length;
    for (const task of registry.tasks.filter((entry) => !isTerminalTask(entry))) {
      activeTaskCount += 1;
      if (task.parallelProtocolVersion !== PARALLEL_BATCH_PROTOCOL_VERSION) violations.push({ projectKey: registry.projectKey, threadId: task.threadId, directControllerThreadId: task.directControllerThreadId, reason: 'legacy_parallel_contract_missing' });
    }
    for (const batch of registry.parallelBatches.filter((entry) => !['closed', 'frozen'].includes(entry.status))) {
      const runtime = parallelBatchRuntime(registry, batch);
      if (runtime.fanoutBlockers.includes('degradation_receipt_required')) violations.push({ projectKey: registry.projectKey, batchId: batch.batchId, directControllerThreadId: batch.controllerThreadId, reason: 'single_candidate_without_degradation_receipt' });
      if (runtime.pendingDispatchCandidateIds.length > 0) violations.push({ projectKey: registry.projectKey, batchId: batch.batchId, directControllerThreadId: batch.controllerThreadId, reason: 'incomplete_dispatch_wave' });
    }
  }
  return { compliant: violations.length === 0, activeTaskCount, batchCount, violationCount: violations.length, violations, auditedAt: new Date().toISOString() };
}

export async function controllerRecordDispatched(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  return withExclusiveLock(paths.registryPath, async () => {
    const raw = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const registry = { ...raw, tasks: ensureTaskControls(raw.tasks, raw.rootControllerThreadIds) };
    assertNoExpiredPendingHeartbeat(registry, input.controllerThreadId);
    const task = taskOrThrow(registry, input.threadId);
    assertTaskController(task, input.controllerThreadId);
    assertControllerHealthyForDispatch(registry, input.controllerThreadId);
    const gate = controllerCycleGate(registry, input.controllerThreadId);
    if (!gate.businessAllowed && gate.reason !== 'parallel_dispatch_wave_incomplete') fail('CONTROLLER_CYCLE_RECONCILE_REQUIRED', `${gate.reason}; 先完成 controller cycle reconciliation`);
    if (!dispatchAllowed(task)) fail('TASK_DISPATCH_NOT_AUTHORIZED', '只有 executing、标题已同步且实施合同完整的任务可以登记派发');
    if (task.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION) {
      const runtime = objectiveRuntime(registry.tasks, task.objectiveId);
      if (runtime.fuseOpen) fail('OBJECTIVE_RETRY_FUSE_OPEN', `objective ${task.objectiveId} 已熔断: ${runtime.reasons.join(', ')}`);
    }
    if (currentAttemptDispatched(task)) fail('TASK_DISPATCH_ALREADY_RECORDED', `第 ${task.attemptCount} 轮派发已登记`);
    await assertImplementationContractCurrent(task, input.projectRoot);
    let parallelBatches = registry.parallelBatches;
    if (task.parallelProtocolVersion === PARALLEL_BATCH_PROTOCOL_VERSION) {
      const batch = registry.parallelBatches.find((entry) => entry.batchId === task.parallelBatchId && entry.controllerThreadId === input.controllerThreadId);
      if (!batch || batch.status !== 'dispatching' || !batch.pendingDispatchCandidateIds.includes(task.parallelCandidateId)) fail('PARALLEL_DISPATCH_NOT_PREPARED', 'batch task 必须先通过 controller-prepare-parallel-dispatch 进入同一 dispatch wave');
      const remaining = batch.pendingDispatchCandidateIds.filter((candidateId) => candidateId !== task.parallelCandidateId);
      parallelBatches = registry.parallelBatches.map((entry) => entry.batchId === batch.batchId ? { ...batch, status: remaining.length === 0 ? 'running' : 'dispatching', pendingDispatchCandidateIds: remaining, dispatchWaveId: remaining.length === 0 ? null : batch.dispatchWaveId, updatedAt: new Date().toISOString() } : entry);
    }
    const now = new Date();
    const nextTask = appendObservabilityReceipt({ ...task, lastDispatchedAttempt: task.attemptCount, lastDispatchedAt: now.toISOString(), updatedAt: now.toISOString() }, 'dispatch_confirmed', now.toISOString());
    let next = validateRegistry({ ...registry, tasks: registry.tasks.map((entry) => entry.threadId === task.threadId ? nextTask : entry), parallelBatches, updatedAt: now.toISOString() }, paths.projectKey, paths.projectRoot);
    const heartbeat = rearmControllerHeartbeatInRegistry(next, input.controllerThreadId, 'dispatch', task.threadId, now);
    next = validateRegistry(heartbeat.registry, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return controllerMutationResult(nextTask, next.tasks, heartbeat);
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
  if (!nonEmpty(input.taskMode)) fail('TASK_MODE_REQUIRED', 'v0.6.0 新登记必须显式提供 taskMode=control_only|implementation|visual_implementation；旧 registry 会安全迁移为 legacy_unclassified');
  if (!REGISTER_TASK_MODES.includes(input.taskMode)) fail('TASK_MODE_INVALID', `新登记 taskMode 无效: ${input.taskMode}`);
  const parallelPolicy = input.parallelPolicy ?? 'legacy_compat';
  if (!has(parallelPolicy, PARALLEL_POLICY_MODES)) fail('PARALLEL_POLICY_INVALID', `parallel policy 无效: ${parallelPolicy}`);
  const hasBatchBinding = nonEmpty(input.parallelBatchId) || nonEmpty(input.parallelCandidateId);
  if (hasBatchBinding && (!nonEmpty(input.parallelBatchId) || !nonEmpty(input.parallelCandidateId))) fail('PARALLEL_BATCH_BINDING_INCOMPLETE', 'batch-id 与 candidate-id 必须同时提供');
  if (parallelPolicy === 'batch_v1' && !hasBatchBinding) fail('PARALLEL_BATCH_BINDING_REQUIRED', 'batch_v1 registration 必须绑定 batch-id 和 candidate-id');
  let contractControl;
  if (input.taskMode === 'control_only') {
    if ([input.implementationContractPath, input.implementationBriefPath, input.implementationPolicy, input.scopePolicy, input.hardContractTrigger, input.hardContractReason].some(nonEmpty)) fail('IMPLEMENTATION_CONTRACT_NOT_APPLICABLE', 'control_only 任务不得绑定 implementation brief/policy/scope-policy/contract');
    contractControl = emptyContractControl('control_only');
  } else {
    const implementationPolicy = input.implementationPolicy ?? 'adaptive_brief';
    if (!has(implementationPolicy, IMPLEMENTATION_POLICIES)) fail('IMPLEMENTATION_POLICY_INVALID', `implementation policy 必须是 ${IMPLEMENTATION_POLICIES.join(' 或 ')}`);
    const scopePolicy = input.scopePolicy ?? (implementationPolicy === 'adaptive_brief' ? 'bounded_incidental' : 'strict_scope');
    if (!has(scopePolicy, SCOPE_POLICIES)) fail('SCOPE_POLICY_INVALID', `scope policy 必须是 ${SCOPE_POLICIES.join(' 或 ')}`);
    const brief = await loadImplementationBrief(input.projectRoot, input.implementationBriefPath, input);
    if (implementationPolicy === 'adaptive_brief') {
      if (nonEmpty(input.implementationContractPath) || nonEmpty(input.hardContractTrigger) || nonEmpty(input.hardContractReason)) fail('ADAPTIVE_BRIEF_HARD_CONTRACT_FIELDS_FORBIDDEN', 'adaptive_brief 不得携带 implementation contract 或 hard-contract 升级字段');
      contractControl = {
        ...emptyContractControl(input.taskMode),
        taskMode: input.taskMode,
        implementationPolicy,
        scopePolicy,
        ...brief,
        contractDigest: brief.briefDigest,
        resultProtocolVersion: RESULT_PROTOCOL_VERSION,
        resultRequirements: adaptiveResultRequirements(input.taskMode),
      };
    } else {
      if (scopePolicy !== 'strict_scope') fail('HARD_CONTRACT_SCOPE_POLICY_INVALID', 'hard_contract 必须保持 strict_scope，不能被附带修复机制放宽');
      if (!has(input.hardContractTrigger, HARD_CONTRACT_TRIGGERS)) fail('HARD_CONTRACT_TRIGGER_REQUIRED', `hard_contract 必须记录触发条件: ${HARD_CONTRACT_TRIGGERS.join('、')}`);
      if (!nonEmpty(input.hardContractReason) || input.hardContractReason.trim().length < 20) fail('HARD_CONTRACT_REASON_REQUIRED', 'hard_contract 必须记录不少于 20 个字符的具体风险或协调理由');
      const snapshot = await loadImplementationContract(input.projectRoot, input.implementationContractPath, input.taskMode, { requireResultRequirements: true, requireCurrentSchema: true });
      const contractAudit = await implementationContractAuditFindings(snapshot, input.projectRoot);
      if (contractAudit.errors.length > 0) fail('IMPLEMENTATION_CONTRACT_AUDIT_FAILED', contractAudit.errors.map((finding) => `${finding.code}:${finding.evidenceCommandId}`).join(', '));
      if (['shared_conflict', 'parallel_coordination'].includes(input.hardContractTrigger) && snapshot.allowedWritePaths.length === 0) fail('HARD_CONTRACT_COORDINATION_PATHS_REQUIRED', '共享冲突或并行协调 hard contract 必须明确冲突路径；其他高风险合同不默认要求路径白名单');
      contractControl = { taskMode: input.taskMode, implementationPolicy, scopePolicy, ...brief, hardContractTrigger: input.hardContractTrigger, hardContractReason: input.hardContractReason.trim(), ...snapshot, resultProtocolVersion: RESULT_PROTOCOL_VERSION, deliverableHistory: [], stageProgress: [], incidentalRepairs: [] };
    }
  }
  const { paths } = await ensureProject(home, input.projectRoot, input.controllerThreadId);
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    assertControllerCycleBusinessReady({ ...registry, tasks: ensureTaskControls(registry.tasks, registry.rootControllerThreadIds) }, input.controllerThreadId);
    assertControllerHealthyForDispatch(registry, input.controllerThreadId);
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
    const now = new Date().toISOString();
    let parallelControl = parallelTaskDefaults();
    let parallelBatches = registry.parallelBatches;
    if (hasBatchBinding) {
      assertSafeThreadId(input.parallelBatchId, 'parallelBatchId');
      assertSafeThreadId(input.parallelCandidateId, 'parallelCandidateId');
      const batch = registry.parallelBatches.find((entry) => entry.batchId === input.parallelBatchId);
      if (!batch || batch.controllerThreadId !== input.controllerThreadId) fail('PARALLEL_BATCH_NOT_FOUND', 'parallel batch 不存在或不属于当前直接主控');
      if (!['planned', 'running', 'reconciling'].includes(batch.status)) fail('PARALLEL_BATCH_STATE_INVALID', `batch ${batch.batchId} 当前不能登记候选: ${batch.status}`);
      const candidate = batch.candidates.find((entry) => entry.candidateId === input.parallelCandidateId);
      if (!candidate || candidate.threadId !== null) fail('PARALLEL_CANDIDATE_NOT_AVAILABLE', 'parallel candidate 不存在或已经绑定 task');
      if (candidate.title !== input.title.trim().replace(/\s+/g, ' ') || candidate.workClass !== input.workClass || candidate.taskMode !== input.taskMode) fail('PARALLEL_CANDIDATE_CONTRACT_MISMATCH', 'register title/workClass/taskMode 必须匹配候选矩阵');
      const runtime = parallelBatchRuntime(registry, batch);
      const runtimeCandidate = runtime.candidateStates.find((entry) => entry.candidateId === candidate.candidateId);
      if (!runtimeCandidate || !['eligible', 'registered'].includes(runtimeCandidate.state)) fail('PARALLEL_CANDIDATE_NOT_ELIGIBLE', `candidate ${candidate.candidateId} 当前不可登记: ${(runtimeCandidate?.blockers ?? []).join(', ')}`);
      parallelControl = { parallelProtocolVersion: PARALLEL_BATCH_PROTOCOL_VERSION, parallelBatchId: batch.batchId, parallelCandidateId: candidate.candidateId, parallelLane: candidate.lane, parallelConflictDomains: [...candidate.conflictDomains], parallelReviewCost: candidate.reviewCost, parallelWorktreeIdentity: candidate.worktreeIdentity };
      const boundBatch = { ...batch, candidates: batch.candidates.map((entry) => entry.candidateId === candidate.candidateId ? { ...entry, threadId: input.threadId, registeredAt: now } : entry), updatedAt: now };
      parallelBatches = registry.parallelBatches.map((entry) => entry.batchId === batch.batchId ? boundBatch : entry);
    }
    const replacementOfThreadId = nonEmpty(input.replacementOfThreadId) ? input.replacementOfThreadId.trim() : null;
    if (replacementOfThreadId !== null) assertSafeThreadId(replacementOfThreadId, 'replacementOfThreadId');
    const replaced = replacementOfThreadId === null ? null : controlledTasks.find((task) => task.threadId === replacementOfThreadId);
    if (replacementOfThreadId !== null && (!replaced || replaced.directControllerThreadId !== input.controllerThreadId)) fail('REPLACEMENT_TARGET_INVALID', 'replacement-of 必须引用同一直接主控名下的已登记任务');
    if (replaced && !['reclaimed', 'blocked'].includes(replaced.status)) fail('REPLACEMENT_TARGET_NOT_TERMINAL', 'replacement 只能替代已 reclaimed 或 blocked 的任务');
    if (replaced?.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION && !closeoutComplete(replaced)) fail('OBJECTIVE_CLOSEOUT_REQUIRED', '前一任务必须先完成用户通知和 delivery report closeout');
    const objectiveId = replaced?.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION ? replaced.objectiveId : (nonEmpty(input.objectiveId) ? input.objectiveId.trim() : `objective-${input.threadId}`);
    assertSafeThreadId(objectiveId, 'objectiveId');
    const replacementOrdinal = replaced ? (replaced.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION ? replaced.replacementOrdinal + 1 : 1) : 0;
    const objectiveBudgetMinutes = replaced?.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION ? replaced.objectiveBudgetMinutes : Number(input.objectiveBudgetMinutes ?? DEFAULT_OBJECTIVE_BUDGET_MINUTES);
    if (!Number.isInteger(objectiveBudgetMinutes) || objectiveBudgetMinutes <= 0) fail('OBJECTIVE_BUDGET_INVALID', 'objective budget minutes 必须是正整数');
    const objectiveCreatedAt = replaced?.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION ? replaced.objectiveCreatedAt : now;
    const runtime = objectiveRuntime(controlledTasks, objectiveId);
    if (runtime.fuseOpen) fail('OBJECTIVE_RETRY_FUSE_OPEN', `objective ${objectiveId} 已熔断: ${runtime.reasons.join(', ')}`);
    const draftBase = { threadId: input.threadId, parentThreadId: input.parentThreadId, directControllerThreadId: input.controllerThreadId, title: input.title.trim().replace(/\s+/g, ' '), model: input.model, thinking: input.thinking, delegationMode: input.delegationMode, executionSurface: input.executionSurface, modelClass: input.modelClass, quotaReason: input.quotaReason.trim(), workClass: input.workClass, decisionStatus: input.decisionStatus, scope: input.scope.trim(), acceptance: input.acceptance.trim(), forbiddenDecisions: input.forbiddenDecisions.trim(), ...contractControl, ...parallelControl, objectiveProtocolVersion: OBJECTIVE_PROTOCOL_VERSION, objectiveId, replacementOfThreadId, replacementOrdinal, objectiveBudgetMinutes, objectiveCreatedAt, failureHistory: [], diagnostics: [], closeout: null, controlPlaneRecovery: null, executionEndedAt: null, status: 'executing', executionStatus: 'running', nextOwner: 'worker', attemptCount: 1, failureClass: null, changesRequestedReason: null, reclaimedReason: null, lastDispatchedAttempt: 0, lastDispatchedAt: null, candidateCommit: null, reviewVerdict: 'pending', integrationStatus: 'not_integrated', integrationProof: null, notificationStatus: 'pending', observabilityProtocolVersion: OBSERVABILITY_PROTOCOL_VERSION, observabilityReceipts: [], updatedAt: now };
    const draft = appendObservabilityReceipt(draftBase, 'registered', now);
    const tasks = ensureTaskControls([...controlledTasks, draft], rootControllers);
    const task = tasks.find((candidate) => candidate.threadId === input.threadId);
    const next = validateRegistry({ ...registry, rootControllerThreadIds: rootControllers, parallelBatches, updatedAt: new Date().toISOString(), tasks }, paths.projectKey, paths.projectRoot);
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
      const actionability = cleanupActionability(task, registry.tasks);
      readyActionCount += actions.length;
      const ownerKey = `${registry.projectKey}:${task.directControllerThreadId}`;
      if (!ownerPlans.has(ownerKey)) ownerPlans.set(ownerKey, { projectKey: registry.projectKey, projectRoot: registry.projectRoot, controllerThreadId: task.directControllerThreadId, tasks: [], threadActions: [] });
      const owner = ownerPlans.get(ownerKey);
      owner.tasks.push({ threadId: task.threadId, displayKey: task.displayKey, title: task.title, status: task.status, archiveStatus: task.archiveStatus, legacyArchiveMetadata: !('archiveStatus' in rawById.get(task.threadId)), blockedByDescendants, descendantCount: descendants.length, actionability, actionable: actionability === 'actionable', updatedAt: task.updatedAt });
      owner.threadActions.push(...actions);
    }
  }
  const owners = [...ownerPlans.values()].map((owner) => ({ ...owner, tasks: owner.tasks.sort((left, right) => right.displayKey.split('.').length - left.displayKey.split('.').length || left.displayKey.localeCompare(right.displayKey)) }));
  return { compliant: backlogCount === 0, backlogCount, ownerCount: owners.length, readyActionCount, owners, auditedAt: new Date().toISOString() };
}

function deliveryReportPath(home, projectKey, controllerThreadId, mode = 'lean') {
  assertSafeThreadId(controllerThreadId, 'controllerThreadId');
  return join(home, 'reports', projectKey, controllerThreadId, mode === 'diagnostic' ? 'diagnostic.html' : 'index.html');
}

function taskBelongsToController(task, controllerThreadId, byId) {
  let cursor = task.parentThreadId;
  const seen = new Set();
  while (!seen.has(cursor)) {
    if (cursor === controllerThreadId) return true;
    seen.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) return false;
    cursor = parent.parentThreadId;
  }
  return false;
}

async function inspectArtifactAvailability(artifact) {
  if (artifact.path === null) return { availability: 'remote', href: artifact.uri };
  try {
    const info = await stat(artifact.path);
    if (!info.isFile() || info.size <= 0) return { availability: 'missing', href: pathToFileURL(artifact.path).href };
    if (['screenshot', 'contact_sheet'].includes(artifact.type)) imageDimensions(await readFile(artifact.path));
    return { availability: 'available', href: pathToFileURL(artifact.path).href };
  } catch {
    return { availability: 'missing', href: pathToFileURL(artifact.path).href };
  }
}

function legacyEvidenceForTask(task) {
  return (task.stageProgress ?? []).flatMap((stage) => (stage.evidence ?? []).map((evidence, index) => ({
    id: `legacy-${stage.attemptCount}-${stage.stageId}-${evidence.id}-${index}`,
    type: 'reference',
    milestone: 'other',
    label: evidence.id,
    description: `Legacy stage ${stage.stageId}: ${stage.summary}`,
    createdAt: stage.createdAt,
    sourceStageId: stage.stageId,
    sourceTaskThreadId: task.threadId,
    reference: evidence.reference,
    availability: 'unverified_legacy',
  })));
}

function taskBlocker(task) {
  if (task.status === 'blocked') return task.blockedReason ?? '任务已阻塞，但旧记录没有原因。';
  if (task.status === 'reclaimed') return task.reclaimedReason ?? '任务已由主控收回。';
  if (task.status === 'changes_requested') return task.changesRequestedReason ?? '等待主控决定返工或收回。';
  const current = task.deliverableHistory?.at(-1);
  if (current?.incompleteItems?.length > 0) return current.incompleteItems.join('；');
  return null;
}

function taskNextGate(task) {
  if (task.controlPlaneRecovery?.status === 'completion_only') return '只重新提交已冻结的同一 candidate commit 与 result manifest；禁止重跑或修改业务';
  return ({
    executing: '完成当前合同阶段并提交成果包',
    awaiting_review: '直接主控审查成果包并记录 accepted/rejected 理由',
    changes_requested: '直接主控决定一次机械返工或收回',
    accepted: '集成 candidate commit，不能提前冒充 main',
    integrated: '已集成；只剩必要的侧边栏归档',
    blocked: '解决阻塞或由主控另建干净任务',
    reclaimed: '由主控裁决保留、重写或重新委派',
  })[task.status];
}

export async function controllerQueryDeliverables(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  const raw = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
  const registry = { ...raw, tasks: ensureTaskControls(raw.tasks, raw.rootControllerThreadIds) };
  const controllerKnown = registry.rootControllerThreadIds.includes(input.controllerThreadId) || registry.tasks.some((task) => task.threadId === input.controllerThreadId);
  if (!controllerKnown) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 未登记为项目主控或父任务');
  const byId = new Map(registry.tasks.map((task) => [task.threadId, task]));
  const topicTasks = registry.tasks.filter((task) => taskBelongsToController(task, input.controllerThreadId, byId)).sort((left, right) => left.displayKey.localeCompare(right.displayKey, undefined, { numeric: true }));
  const tasks = [];
  for (const task of topicTasks) {
    const deliverables = [];
    for (const deliverable of [...task.deliverableHistory].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.attempt - right.attempt)) {
      const artifacts = [];
      for (const artifact of [...deliverable.artifacts].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))) artifacts.push({ ...artifact, ...(await inspectArtifactAvailability(artifact)), selected: deliverable.selectedArtifactIds.includes(artifact.id) });
      deliverables.push({ ...deliverable, artifacts });
    }
    const manifestReferences = new Set(deliverables.flatMap((deliverable) => deliverable.artifacts.flatMap((artifact) => [artifact.path, artifact.uri].filter(nonEmpty))));
    const legacyArtifacts = legacyEvidenceForTask(task).filter((artifact) => !manifestReferences.has(artifact.reference));
    const objective = task.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION ? objectiveRuntime(registry.tasks, task.objectiveId, Date.parse(registry.updatedAt)) : null;
    tasks.push({ threadId: task.threadId, parentThreadId: task.parentThreadId, directControllerThreadId: task.directControllerThreadId, displayKey: task.displayKey, title: task.title, status: task.status, taskMode: task.taskMode, implementationPolicy: task.implementationPolicy, scopePolicy: task.scopePolicy, model: task.model, thinking: task.thinking, workClass: task.workClass ?? null, parallelProtocolVersion: task.parallelProtocolVersion, parallelBatchId: task.parallelBatchId, parallelCandidateId: task.parallelCandidateId, parallelLane: task.parallelLane, parallelWorktreeIdentity: task.parallelWorktreeIdentity, attemptCount: task.attemptCount, lastDispatchedAt: task.lastDispatchedAt, progressEventCreatedAt: task.progressEventCreatedAt ?? null, incidentalRepairEventCreatedAt: task.incidentalRepairEventCreatedAt ?? null, completionEventCreatedAt: task.completionEventCreatedAt ?? null, failureEventCreatedAt: task.failureEventCreatedAt ?? null, executionEndedAt: task.executionEndedAt, archivedAt: task.archivedAt, stageProgress: task.stageProgress, incidentalRepairs: task.incidentalRepairs, controlPlaneRecovery: task.controlPlaneRecovery ?? null, observabilityProtocolVersion: task.observabilityProtocolVersion, observabilityReceipts: task.observabilityReceipts, candidateCommit: task.candidateCommit, reviewVerdict: task.reviewVerdict, integrationStatus: task.integrationStatus, integrationProof: task.integrationProof ?? null, objective, failureHistory: task.failureHistory, diagnostics: task.diagnostics, closeout: task.closeout, blocker: taskBlocker(task), nextGate: taskNextGate(task), deliverables, legacyArtifacts, historicalEvidenceStatus: deliverables.length > 0 ? 'manifest_history_available' : legacyArtifacts.length > 0 ? 'stage_references_unverified' : 'historical_evidence_unavailable', updatedAt: task.updatedAt });
  }
  const deliverableCount = tasks.reduce((total, task) => total + task.deliverables.length, 0);
  const businessDeliverableCount = tasks.filter((task) => implementationTask(task) && task.integrationStatus === 'integrated' && task.integrationProof !== null && task.deliverables.some((entry) => entry.deliveryStatus === 'integrated')).length;
  const candidateCommitCount = tasks.filter((task) => implementationTask(task) && nonEmpty(task.candidateCommit)).length;
  const controlReviewPassedCount = tasks.filter((task) => task.taskMode === 'control_only' && task.status === 'integrated').length;
  const checkpointState = checkpointPointerFor(registry, input.controllerThreadId);
  const handoffState = preparedHandoffFor(registry, input.controllerThreadId) ?? acceptedHandoffFor(registry, input.controllerThreadId);
  return { reportSchemaVersion: 5, projectKey: registry.projectKey, projectRoot: registry.projectRoot, controllerThreadId: input.controllerThreadId, registryUpdatedAt: registry.updatedAt, reportPath: deliveryReportPath(home, registry.projectKey, input.controllerThreadId), taskCount: tasks.length, deliverableCount, businessDeliverableCount, candidateCommitCount, controlReviewPassedCount, checkpointState, handoffState, tasks };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function reportStatusClass(status) {
  if (status === 'integrated') return 'ok';
  if (['accepted', 'awaiting_review', 'executing'].includes(status)) return 'pending';
  return 'failed';
}

const REPORT_STATUS_LABELS = Object.freeze({ registered: '已登记', executing: '执行中', awaiting_review: '等待主控审查', changes_requested: '已停止，等待主控决定', accepted: '已接受，等待集成', integrated: '已集成', reclaimed: '已收回', blocked: '已阻塞' });
const REPORT_THINKING_LABELS = Object.freeze({ medium: '中等推理', high: '高强度推理', xhigh: '极高强度推理', max: '最高强度推理' });
const REPORT_WORK_CLASS_LABELS = Object.freeze({ repeatable: '规则明确的可重复任务', bounded_reasoning: '边界明确的代码理解任务', bounded_control: '边界明确的主控任务', frontier_control: '前沿主控任务', hard_arbitration: '高难度裁决', final_arbitration: '最终裁决', legacy: '旧版任务，分类不可用' });
const REPORT_TASK_MODE_LABELS = Object.freeze({ control_only: '控制、审计或只读任务', implementation: '代码或资源实现任务', visual_implementation: '视觉实现任务', legacy_unclassified: '旧版任务，类型未分类' });
const REPORT_MODEL_LABELS = Object.freeze({ 'gpt-5.6-luna': 'Luna（经济型机械执行模型）', 'gpt-5.6-terra': 'Terra（经济型代码理解模型）', 'gpt-5.6-sol': 'Sol（前沿主控模型）' });
const REPORT_FAILURE_CLASS_LABELS = Object.freeze({ mechanical: '机械执行问题', comprehension: '理解偏差', judgment: '判断问题', spec_missing: '规格缺失', unclassified: '未分类' });
const REPORT_FAILURE_DOMAIN_LABELS = Object.freeze({ tooling: '工具链', environment: '运行环境', contract: '实施合同', test: '测试验证', implementation: '代码实现' });
const REPORT_DIAGNOSTIC_LABELS = Object.freeze({ technical_debt: '非阻塞技术债', milestone_blocker: '里程碑阻塞项' });
const REPORT_ARTIFACT_TYPE_LABELS = Object.freeze({ screenshot: '截图', reference: '参考资料', contact_sheet: '对照图集', log: '日志', test_summary: '测试摘要', report: '报告' });
const REPORT_MILESTONE_LABELS = Object.freeze({ reference: '参考', before: '修改前', intermediate: '关键中间状态', after: '修改后', current: '当前状态', failure: '失败证据' });
const REPORT_WORKSPACE_ROLE_LABELS = Object.freeze({ candidate_worktree: '候选工作树', project_main: '项目主分支', external_reference: '外部参考', task_control: '任务控制目录' });

function reportEnumLabel(labels, value, fallback = '未识别的技术值') {
  return labels[value] ?? `${fallback}（${value ?? '空'}）`;
}

function reportStatusLabel(status) { return reportEnumLabel(REPORT_STATUS_LABELS, status, '未识别状态'); }

function renderRecordedText(value) {
  const text = String(value ?? '');
  const escaped = escapeHtml(text);
  if (!text || /[\u3400-\u9fff]/u.test(text)) return escaped;
  return `${escaped}<small class="translation-note">原始英文或技术记录；为避免额外模型消耗，报告未自动翻译。</small>`;
}

function compactChineseNumber(value) {
  if (!Number.isFinite(value)) return '不可用';
  const absolute = Math.abs(value);
  const format = (number) => number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (absolute >= 100000000) return `${format(value / 100000000)} 亿`;
  if (absolute >= 10000) return `${format(value / 10000)} 万`;
  return value.toLocaleString('zh-CN');
}

function renderHumanCount(value, unit = '') {
  if (!Number.isFinite(value)) return '不可用';
  const compact = compactChineseNumber(value);
  const exact = value.toLocaleString('zh-CN');
  const suffix = unit ? ` ${escapeHtml(unit)}` : '';
  return Math.abs(value) >= 10000
    ? `<strong class="human-number">${escapeHtml(compact)}${suffix}</strong><small>精确值：${escapeHtml(exact)}${suffix}</small>`
    : `<strong class="human-number">${escapeHtml(compact)}${suffix}</strong>`;
}

function compactChineseDuration(value) {
  if (!Number.isFinite(value)) return '不可用';
  if (value < 60) return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 秒`;
  const totalSeconds = Math.round(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} 小时 ${minutes} 分${seconds ? ` ${seconds} 秒` : ''}`;
  return `${minutes} 分${seconds ? ` ${seconds} 秒` : ''}`;
}

function renderHumanDuration(value) {
  if (!Number.isFinite(value)) return '不可用';
  const compact = compactChineseDuration(value);
  const exact = `${value.toLocaleString('zh-CN')} 秒`;
  return value >= 60 ? `${escapeHtml(compact)}<small>精确值：${escapeHtml(exact)}</small>` : escapeHtml(compact);
}

function anomalyChineseText(item) {
  const number = Number(item.evidence?.match(/\d+(?:\.\d+)?/)?.[0]);
  if (item.code === 'multiple_attempts') return `多次尝试（共 ${Number.isFinite(number) ? number : '若干'} 次）`;
  if (item.code === 'recorded_failure') return `已记录失败（${Number.isFinite(number) ? number : '若干'} 条失败事件）`;
  if (item.code === 'routing_mismatch') return `模型、推理强度与任务类型不匹配（技术证据：${item.evidence}）`;
  if (item.code === 'repeated_commands') return `发现重复命令（${Number.isFinite(number) ? number : '若干'} 类重复指纹）`;
  if (item.code === 'failed_rework') return `存在失败或返工链（${Number.isFinite(number) ? number : '若干'} 条）`;
  if (item.code === 'checkpoint_recommended') return '上下文工作集持续增长，建议在下一个真实里程碑封存检查点（不是阻塞门禁）';
  if (item.code === 'handoff_recommended') return '成对证据显示压缩无效或随后反弹，建议人工评估干净主控交接（不是自动阻塞）';
  if (item.code === 'large_unassigned_interval') return `活跃模型交互内有较多时间无法准确归因（${Number.isFinite(number) ? number : '?'}%，原因未知）`;
  return `未识别的异常规则（技术标识：${item.code}；证据：${item.evidence}）`;
}

function batchAnomalyChineseText(item) {
  if (item.code === 'parallel_batch_without_overlapping_dispatch_windows') return `登记为并发批次，但派发窗口没有重叠（技术证据：${item.evidence}）`;
  if (item.code === 'dispatched_parallel_but_completed_turns_serial') return `派发窗口有重叠，但已完成的模型交互轮次仍然串行（技术证据：${item.evidence}）`;
  return `未识别的并发异常（技术标识：${item.code}；证据：${item.evidence}）`;
}

function deliveryStatusLabel(deliverable, task) {
  if (deliverable.deliveryStatus === 'integrated' && implementationTask(task) && task.integrationProof === null) return '台账曾标记已集成·Git 未验证';
  if (deliverable.attempt === task.attemptCount && task.status === 'reclaimed') return '已收回';
  if (deliverable.attempt === task.attemptCount && task.status === 'blocked') return '已阻塞';
  if (deliverable.attempt === task.attemptCount && task.status === 'changes_requested' && deliverable.reviewStatus === 'rejected') return '审查未通过';
  return ({ candidate: '候选', accepted_not_integrated: '已接受·未集成', integrated: '已集成', rejected: '未通过' })[deliverable.deliveryStatus];
}

function taskStatusLabel(task) {
  if (task.status === 'integrated' && implementationTask(task)) return task.integrationProof ? '已集成·Git 已验证' : '台账曾标记已集成·Git 未验证';
  if (task.status === 'integrated' && task.taskMode === 'control_only') return '控制审查已通过';
  return reportStatusLabel(task.status);
}

function taskStatusClass(task) {
  if (task.status === 'integrated' && implementationTask(task) && task.integrationProof === null) return 'pending';
  return reportStatusClass(task.status);
}

function secondsBetween(start, end) {
  if (!isTimestamp(start) || !isTimestamp(end)) return null;
  return Number((Math.max(0, Date.parse(end) - Date.parse(start)) / 1000).toFixed(3));
}

function receiptTimes(task, phase) {
  return (task.observabilityReceipts ?? []).filter((receipt) => receipt.phase === phase).map((receipt) => receipt.wallTimeUtc).sort((left, right) => Date.parse(left) - Date.parse(right));
}

function firstTimestamp(...values) {
  return values.flat().filter(isTimestamp).sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
}

function lifecycleSummary(task, asOf) {
  const registeredAt = firstTimestamp(receiptTimes(task, 'registered'));
  const dispatchedAt = firstTimestamp(receiptTimes(task, 'dispatch_confirmed'), task.lastDispatchedAt);
  const progressTimes = [...receiptTimes(task, 'progress_ingested'), ...(task.stageProgress ?? []).map((stage) => stage.createdAt)].filter(isTimestamp).sort((left, right) => Date.parse(left) - Date.parse(right));
  const completionAt = firstTimestamp(receiptTimes(task, 'completion_ingested'), task.completionEventCreatedAt);
  const failureAt = firstTimestamp(receiptTimes(task, 'failure_ingested'), task.failureEventCreatedAt);
  const acceptedAt = firstTimestamp(receiptTimes(task, 'review_accepted'));
  const integratedAt = firstTimestamp(receiptTimes(task, 'integrated'));
  const executionEndAt = task.executionEndedAt ?? completionAt ?? failureAt;
  const terminalAt = firstTimestamp(receiptTimes(task, 'blocked'), receiptTimes(task, 'reclaimed'), integratedAt, ['integrated', 'blocked', 'reclaimed'].includes(task.status) ? task.executionEndedAt : null);
  const archivedAt = firstTimestamp(receiptTimes(task, 'archived'), task.archivedAt);
  const end = executionEndAt ?? (isTimestamp(asOf) ? asOf : null);
  const receiptEvents = (task.observabilityReceipts ?? []).map((receipt) => ({ phase: receipt.phase, at: receipt.wallTimeUtc, source: receipt.source, confidence: receipt.confidence, attempt: receipt.attempt }));
  return {
    status: task.observabilityProtocolVersion === OBSERVABILITY_PROTOCOL_VERSION ? 'recorded' : 'legacy_partial',
    registeredAt,
    dispatchedAt,
    firstProgressAt: progressTimes[0] ?? null,
    lastProgressAt: progressTimes.at(-1) ?? task.progressEventCreatedAt ?? null,
    completionAt,
    failureAt,
    acceptedAt,
    integratedAt,
    executionEndAt,
    terminalAt,
    archivedAt,
    dispatchToEndSeconds: secondsBetween(dispatchedAt, end),
    dispatchToFirstProgressSeconds: secondsBetween(dispatchedAt, progressTimes[0]),
    reviewWaitSeconds: secondsBetween(completionAt, firstTimestamp(acceptedAt, integratedAt, terminalAt)),
    events: receiptEvents.sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.phase.localeCompare(right.phase)),
  };
}

function concurrencySummary(intervals) {
  const events = intervals.flatMap((interval) => isTimestamp(interval.start) && isTimestamp(interval.end) && Date.parse(interval.end) >= Date.parse(interval.start) ? [{ at: Date.parse(interval.start), delta: 1 }, { at: Date.parse(interval.end), delta: -1 }] : []).sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0; let maximum = 0; let overlapMs = 0; let previous = null;
  for (let index = 0; index < events.length;) {
    const at = events[index].at;
    if (previous !== null && active >= 2) overlapMs += at - previous;
    while (index < events.length && events[index].at === at) { active += events[index].delta; index += 1; }
    maximum = Math.max(maximum, active);
    previous = at;
  }
  return { intervalCount: intervals.length, maxConcurrent: maximum, overlapSeconds: Number((overlapMs / 1000).toFixed(3)) };
}

function diagnosticCodexHome(input) {
  if (nonEmpty(input.codexHome)) return win32.resolve(input.codexHome);
  if (nonEmpty(input.taskControlHome)) return win32.dirname(win32.resolve(input.taskControlHome));
  return win32.resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
}

async function collectRolloutCandidates(root, threadIds, output) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await collectRolloutCandidates(path, threadIds, output);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      for (const threadId of threadIds) if (entry.name.includes(threadId)) output.get(threadId).push(path);
    }
  }
}

async function rolloutPathsForTasks(codexHome, threadIds) {
  const output = new Map(threadIds.map((threadId) => [threadId, []]));
  for (const root of [join(codexHome, 'sessions'), join(codexHome, 'archived_sessions')]) await collectRolloutCandidates(root, threadIds, output);
  const selected = new Map();
  for (const [threadId, candidates] of output) {
    const ranked = [];
    for (const path of candidates) {
      try { const info = await stat(path); ranked.push({ path, size: info.size }); } catch { /* unavailable candidate */ }
    }
    ranked.sort((left, right) => right.size - left.size || left.path.localeCompare(right.path));
    selected.set(threadId, ranked[0]?.path ?? null);
  }
  return selected;
}

async function loadTimeDiagnosticsAnalyzer(input, codexHome) {
  if (typeof input.timeDiagnosticsAnalyzer === 'function') return input.timeDiagnosticsAnalyzer;
  const scriptPath = join(codexHome, 'skills', 'codex-time-diagnostics', 'scripts', 'analyze-session-timeline.mjs');
  await access(scriptPath).catch(() => fail('TIME_DIAGNOSTICS_UNAVAILABLE', `未找到本地 codex-time-diagnostics analyzer: ${scriptPath}`));
  const module = await import(pathToFileURL(scriptPath).href);
  if (typeof module.analyzeFile !== 'function') fail('TIME_DIAGNOSTICS_UNAVAILABLE', '本地 codex-time-diagnostics 未导出 analyzeFile');
  return module.analyzeFile;
}

function turnSegmentTotal(report, field, fallback) {
  if (!Array.isArray(report.turnSegments) || report.turnSegments.length === 0) return fallback;
  return Number(report.turnSegments.reduce((sum, segment) => sum + (Number.isFinite(segment[field]) ? segment[field] : 0), 0).toFixed(3));
}

function outsideTaskScopeSeconds(fullReport, lifecycle, scopedReport) {
  if (!fullReport || !isTimestamp(fullReport.scope?.start) || !isTimestamp(fullReport.scope?.end) || !isTimestamp(lifecycle?.dispatchedAt)) return null;
  const sessionStart = Date.parse(fullReport.scope.start);
  const sessionEnd = Date.parse(fullReport.scope.end);
  const taskStart = Math.max(sessionStart, Date.parse(lifecycle.dispatchedAt));
  const taskEnd = Math.min(sessionEnd, isTimestamp(lifecycle.executionEndAt) ? Date.parse(lifecycle.executionEndAt) : Date.parse(scopedReport.scope.end));
  const overlap = Math.max(0, taskEnd - taskStart);
  return Number((Math.max(0, sessionEnd - sessionStart - overlap) / 1000).toFixed(3));
}

function diagnosticSummary(report, expectedThreadId, { fullReport = null, lifecycle = null } = {}) {
  if (report.sessionId !== expectedThreadId) fail('TIME_DIAGNOSTICS_THREAD_MISMATCH', `rollout session ${report.sessionId ?? 'unknown'} 不匹配 task ${expectedThreadId}`);
  const summary = report.summary;
  const otelObserved = summary.otel?.status === 'observed';
  const pairedTurns = report.turnEnvelopes.filter((turn) => turn.paired);
  const activeTurnUnionSeconds = summary.activeTurns.activeUnionSeconds;
  const activeTurnUnknownSeconds = Math.min(activeTurnUnionSeconds, turnSegmentTotal(report, 'unknownSeconds', summary.unknown.seconds));
  const activeTurnResponseGapSeconds = Math.min(activeTurnUnionSeconds, turnSegmentTotal(report, 'responseGapSeconds', summary.responseGap.seconds));
  return {
    status: 'observed',
    sourcePath: report.input,
    scopeStart: report.scope.start,
    scopeEnd: report.scope.end,
    activeTurnUnionSeconds,
    taskScopeSeconds: summary.wallClockSeconds,
    taskWindowOutsideCompletedTurnsSeconds: summary.activeTurns.idleOutsideCompletedTurnsSeconds ?? Math.max(0, summary.wallClockSeconds - activeTurnUnionSeconds),
    taskOutsideScopeSeconds: outsideTaskScopeSeconds(fullReport, lifecycle, report),
    sourceConversationWallSeconds: fullReport?.summary?.wallClockSeconds ?? summary.wallClockSeconds,
    completedTurnCount: summary.activeTurns.completedCount,
    incompleteTurnCount: summary.activeTurns.incompleteCount,
    clientObservedTtftSeconds: summary.activeTurns.clientObservedTtftSeconds,
    toolUnionSeconds: summary.tool.completedUnionSeconds,
    responseGapSeconds: activeTurnResponseGapSeconds,
    unknownSeconds: activeTurnUnknownSeconds,
    unknownRatio: Number((activeTurnUnknownSeconds / Math.max(0.001, activeTurnUnionSeconds)).toFixed(4)),
    scopeUnassignedSeconds: summary.unknown.seconds,
    contextPeakRatio: summary.context.peakRatio,
    compactions: summary.context.compactions,
    contextTrend: summary.context.trend ?? null,
    compactionEvidence: summary.context.compactionEvidence ?? [],
    repeatedCommandCount: summary.repeatedCommandCount,
    retryChainCount: summary.retryChainCount,
    failedToolCount: summary.tool.failedCount,
    threadHealth: summary.threadHealth,
    tokens: otelObserved ? { status: 'direct_completed_responses', ...summary.otel.completedResponseTokens } : { status: 'unavailable', sampleCount: 0, inputTokens: null, outputTokens: null },
    quotaSnapshot: { status: summary.rateLimits.sampleCount > 0 ? 'account_envelope_not_task_attribution' : 'unavailable', sampleCount: summary.rateLimits.sampleCount, primary: summary.rateLimits.primary, secondary: summary.rateLimits.secondary },
    modelNames: otelObserved ? summary.otel.modelNames : [],
    reasoningEfforts: otelObserved ? summary.otel.reasoningEfforts : [],
    inferenceTimingAvailable: otelObserved ? summary.otel.inferenceTimingAvailable : false,
    firstTurnAt: pairedTurns[0]?.startedAt ?? null,
    lastTurnAt: pairedTurns.at(-1)?.completedAt ?? null,
    turnEnvelopes: pairedTurns,
    remedies: report.remedies.map((remedy) => ({ rootCause: remedy.rootCause, confidence: remedy.confidence, evidence: remedy.evidence, systemicPrevention: remedy.systemicPrevention, verificationMetric: remedy.verificationMetric })),
  };
}

function taskAnomalies(task) {
  const anomalies = [];
  if (task.attemptCount > 1) anomalies.push({ code: 'multiple_attempts', severity: 'warning', evidence: `attempt=${task.attemptCount}` });
  if (task.failureHistory.length > 0) anomalies.push({ code: 'recorded_failure', severity: 'warning', evidence: `${task.failureHistory.length} failure event(s)` });
  if (task.workClass && (WORK_CLASS_MODELS[task.workClass] !== task.model || !WORK_CLASS_THINKING[task.workClass]?.includes(task.thinking))) anomalies.push({ code: 'routing_mismatch', severity: 'critical', evidence: `${task.workClass}/${task.model}/${task.thinking}` });
  const diagnostic = task.timeDiagnostic;
  if (diagnostic?.status === 'observed') {
    if (diagnostic.repeatedCommandCount > 0) anomalies.push({ code: 'repeated_commands', severity: 'warning', evidence: `${diagnostic.repeatedCommandCount} repeated fingerprint(s)` });
    if (diagnostic.retryChainCount > 0) anomalies.push({ code: 'failed_rework', severity: 'critical', evidence: `${diagnostic.retryChainCount} retry chain(s)` });
    if (diagnostic.threadHealth?.status === 'checkpoint_recommended') anomalies.push({ code: 'checkpoint_recommended', severity: 'info', evidence: JSON.stringify(diagnostic.threadHealth.reasons ?? []) });
    if (diagnostic.threadHealth?.status === 'handoff_recommended') anomalies.push({ code: 'handoff_recommended', severity: 'warning', evidence: JSON.stringify(diagnostic.threadHealth.reasons ?? []) });
    if (diagnostic.unknownRatio >= 0.5) anomalies.push({ code: 'large_unassigned_interval', severity: 'info', evidence: `${Math.round(diagnostic.unknownRatio * 100)}% active-turn unassigned; cause unknown` });
  }
  return anomalies;
}

async function addObservability(data, input) {
  const mode = input.observabilityMode ?? 'lean';
  if (!OBSERVABILITY_MODES.includes(mode)) fail('OBSERVABILITY_MODE_INVALID', `observability 必须是 ${OBSERVABILITY_MODES.join(' 或 ')}`);
  const tasks = data.tasks.map((task) => ({ ...task, lifecycle: lifecycleSummary(task, data.registryUpdatedAt), timeDiagnostic: { status: 'not_requested' } }));
  let analyzerStatus = 'not_requested';
  if (mode === 'diagnostic') {
    const codexHome = diagnosticCodexHome(input);
    const rolloutPaths = input.rolloutPathsByThreadId instanceof Map ? input.rolloutPathsByThreadId : await rolloutPathsForTasks(codexHome, tasks.map((task) => task.threadId));
    let analyzeFile;
    try { analyzeFile = await loadTimeDiagnosticsAnalyzer(input, codexHome); analyzerStatus = 'available'; } catch (error) { analyzerStatus = error.code ?? 'unavailable'; }
    for (const task of tasks) {
      const rolloutPath = rolloutPaths.get(task.threadId) ?? null;
      if (!rolloutPath) { task.timeDiagnostic = { status: 'unavailable', reason: 'rollout_not_found' }; continue; }
      if (!analyzeFile) { task.timeDiagnostic = { status: 'unavailable', reason: analyzerStatus }; continue; }
      try {
        const range = { otelJsonl: input.otelJsonl ?? '', desktopLog: input.desktopLog ?? '', segmentByTurn: true, ...(isTimestamp(task.lifecycle.dispatchedAt) ? { from: task.lifecycle.dispatchedAt } : {}), ...(isTimestamp(task.lifecycle.executionEndAt) ? { to: task.lifecycle.executionEndAt } : {}) };
        const fullReport = isTimestamp(task.lifecycle.dispatchedAt) ? await analyzeFile(rolloutPath, '', { segmentByTurn: false }) : null;
        const report = await analyzeFile(rolloutPath, '', range);
        task.timeDiagnostic = diagnosticSummary(report, task.threadId, { fullReport, lifecycle: task.lifecycle });
        task.lifecycle.dispatchToFirstTurnSeconds = secondsBetween(task.lifecycle.dispatchedAt, task.timeDiagnostic.firstTurnAt);
      } catch (error) {
        task.timeDiagnostic = { status: 'unavailable', reason: error.code ?? error.message };
      }
    }
  }
  for (const task of tasks) task.anomalies = taskAnomalies(task);
  const lifecycleConcurrency = concurrencySummary(tasks.map((task) => ({ start: task.lifecycle.dispatchedAt, end: task.lifecycle.executionEndAt ?? data.registryUpdatedAt })).filter((interval) => interval.start && interval.end));
  const turnIntervals = tasks.flatMap((task) => task.timeDiagnostic?.status === 'observed' ? task.timeDiagnostic.turnEnvelopes.map((turn) => ({ start: turn.startedAt, end: turn.completedAt })) : []);
  const activeTurnConcurrency = mode === 'diagnostic' ? concurrencySummary(turnIntervals) : { intervalCount: 0, maxConcurrent: null, overlapSeconds: null };
  const batchAnomalies = [];
  const parallelTaskCount = tasks.filter((task) => task.parallelProtocolVersion === PARALLEL_BATCH_PROTOCOL_VERSION).length;
  if (parallelTaskCount >= 2 && lifecycleConcurrency.maxConcurrent < 2) batchAnomalies.push({ code: 'parallel_batch_without_overlapping_dispatch_windows', evidence: `${parallelTaskCount} batch tasks; max dispatched overlap=${lifecycleConcurrency.maxConcurrent}` });
  if (mode === 'diagnostic' && lifecycleConcurrency.maxConcurrent >= 2 && activeTurnConcurrency.intervalCount > 0 && activeTurnConcurrency.maxConcurrent < 2) batchAnomalies.push({ code: 'dispatched_parallel_but_completed_turns_serial', evidence: `dispatch overlap=${lifecycleConcurrency.maxConcurrent}; completed-turn overlap=${activeTurnConcurrency.maxConcurrent}` });
  return { ...data, reportPath: deliveryReportPath(resolveTaskControlHome(input), data.projectKey, data.controllerThreadId, mode), tasks, observability: { schemaVersion: 1, mode, analyzerStatus, lifecycleConcurrency: { ...lifecycleConcurrency, interpretation: '派发到执行结束的台账窗口重叠；不是实际模型执行时间。' }, activeTurnConcurrency: { ...activeTurnConcurrency, interpretation: '已配对 task_started/task_complete 包络的重叠；直接证明活跃 turn 同时存在，但不是 CPU 或模型内部时间。' }, batchAnomalies, quotaInterpretation: 'token 仅在同 conversation OTel response.completed 存在时按任务直接计数；额度快照是账户包络，并发时不得归因给单个任务。' } };
}

function renderArtifactHtml(artifact) {
  const meta = `${reportEnumLabel(REPORT_MILESTONE_LABELS, artifact.milestone, '未识别里程碑')} · ${reportEnumLabel(REPORT_WORKSPACE_ROLE_LABELS, artifact.workspaceRole, '未识别来源位置')} · ${artifact.createdAt}`;
  const missing = artifact.availability === 'missing' ? '<div class="missing">文件当前不可用；历史引用仍保留。</div>' : '';
  const visual = ['screenshot', 'contact_sheet'].includes(artifact.type) && artifact.availability !== 'missing'
    ? `<a href="${escapeHtml(artifact.href)}"><img loading="lazy" src="${escapeHtml(artifact.href)}" alt="${escapeHtml(artifact.label)}"></a>`
    : `<a class="artifact-link" href="${escapeHtml(artifact.href)}">打开${escapeHtml(reportEnumLabel(REPORT_ARTIFACT_TYPE_LABELS, artifact.type, '未识别资料'))}</a>`;
  return `<figure class="artifact ${artifact.selected ? 'selected' : ''}">${visual}${missing}<figcaption><strong>${renderRecordedText(artifact.label)}</strong><span>${renderRecordedText(artifact.description)}</span><small>${escapeHtml(meta)}</small></figcaption></figure>`;
}

function renderLifecycleGantt(data) {
  const rows = data.tasks.filter((task) => task.lifecycle.dispatchedAt).map((task) => ({ task, start: Date.parse(task.lifecycle.dispatchedAt), end: Date.parse(task.lifecycle.executionEndAt ?? data.registryUpdatedAt) }));
  if (rows.length === 0) return '<div class="legacy">没有可绘制的派发时间窗口。</div>';
  const min = Math.min(...rows.map((row) => row.start)); const max = Math.max(...rows.map((row) => row.end)); const span = Math.max(1, max - min);
  return `<div class="gantt">${rows.map(({ task, start, end }) => { const left = ((start - min) / span) * 100; const width = Math.max(0.8, ((Math.max(start, end) - start) / span) * 100); return `<div class="gantt-row"><strong>${escapeHtml(task.displayKey)}</strong><div class="gantt-track"><span class="gantt-bar ${reportStatusClass(task.status)}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%"></span></div><small>${escapeHtml(task.lifecycle.dispatchedAt)} → ${escapeHtml(task.lifecycle.executionEndAt ?? `观测上界 ${data.registryUpdatedAt}`)}</small></div>`; }).join('')}</div>`;
}

function renderTaskRoute(task) {
  const model = reportEnumLabel(REPORT_MODEL_LABELS, task.model, '未识别模型');
  const thinking = reportEnumLabel(REPORT_THINKING_LABELS, task.thinking, '未识别推理强度');
  const workClass = reportEnumLabel(REPORT_WORK_CLASS_LABELS, task.workClass ?? 'legacy', '未识别任务类型');
  return `<strong>${escapeHtml(model)}</strong><span>${escapeHtml(thinking)}</span><span>${escapeHtml(workClass)}</span><small>模型技术标识：${escapeHtml(task.model)}</small>`;
}

function unavailableDiagnosticLabel(diagnostic) {
  const reason = diagnostic.reason ?? diagnostic.status;
  if (reason === 'rollout_not_found') return '未找到该任务的过程日志（rollout）';
  if (reason === 'not_requested') return '本次未请求深度诊断';
  if (reason === 'TIME_DIAGNOSTICS_UNAVAILABLE') return '本地耗时分析器不可用';
  return `诊断证据不可用（技术原因：${reason}）`;
}

function relativeBar(value, maximum, className) {
  const width = Number.isFinite(value) && maximum > 0 ? Math.max(1, (value / maximum) * 100) : 0;
  return `<span class="comparison-track"><span class="comparison-bar ${className}" style="width:${width.toFixed(2)}%"></span></span>`;
}

function renderConsumptionComparison(data) {
  const tasks = data.tasks.filter((task) => task.timeDiagnostic.status === 'observed');
  if (tasks.length === 0) return '<div class="legacy">没有可以比较的本地耗时与上下文处理数据。</div>';
  const maximum = (selector) => Math.max(0, ...tasks.map(selector).filter(Number.isFinite));
  const maxInput = maximum((task) => task.timeDiagnostic.tokens.inputTokens);
  const maxOutput = maximum((task) => task.timeDiagnostic.tokens.outputTokens);
  const maxActive = maximum((task) => task.timeDiagnostic.activeTurnUnionSeconds);
  const maxTool = maximum((task) => task.timeDiagnostic.toolUnionSeconds);
  const cards = tasks.map((task) => {
    const diagnostic = task.timeDiagnostic;
    const tokenObserved = diagnostic.tokens.status === 'direct_completed_responses';
    return `<article class="comparison-card"><h4>${escapeHtml(task.displayKey)} · ${renderRecordedText(task.title)}</h4><div class="comparison-row"><span>累计输入</span>${relativeBar(tokenObserved ? diagnostic.tokens.inputTokens : null, maxInput, 'input')}<strong>${escapeHtml(tokenObserved ? compactChineseNumber(diagnostic.tokens.inputTokens) : '不可用')}</strong></div><div class="comparison-row"><span>累计输出</span>${relativeBar(tokenObserved ? diagnostic.tokens.outputTokens : null, maxOutput, 'output')}<strong>${escapeHtml(tokenObserved ? compactChineseNumber(diagnostic.tokens.outputTokens) : '不可用')}</strong></div><div class="comparison-row"><span>活跃执行</span>${relativeBar(diagnostic.activeTurnUnionSeconds, maxActive, 'active')}<strong>${escapeHtml(compactChineseDuration(diagnostic.activeTurnUnionSeconds))}</strong></div><div class="comparison-row"><span>工具调用</span>${relativeBar(diagnostic.toolUnionSeconds, maxTool, 'tool')}<strong>${escapeHtml(compactChineseDuration(diagnostic.toolUnionSeconds))}</strong></div></article>`;
  }).join('');
  return `<h3>任务消耗直观对比</h3><p class="subtitle">条形长度只比较本报告内的任务。累计输入/输出是已经发生的模型响应所报告的 Token（模型处理文本单位）之和，不是 OTel（本地遥测日志）产生的额外消耗，也不是 Codex 额度账单。</p><div class="comparison-grid">${cards}</div>`;
}

function renderObservabilitySection(data) {
  const observed = data.tasks.filter((task) => task.timeDiagnostic.status === 'observed').length;
  const anomalyCount = data.tasks.reduce((total, task) => total + task.anomalies.length, 0) + data.observability.batchAnomalies.length;
  const rows = data.tasks.map((task) => {
    const diagnostic = task.timeDiagnostic;
    const tokens = diagnostic.status === 'observed' && diagnostic.tokens.status === 'direct_completed_responses'
      ? `<div class="token-pair"><span><b>累计输入</b>${renderHumanCount(diagnostic.tokens.inputTokens, 'Token')}</span><span><b>累计输出</b>${renderHumanCount(diagnostic.tokens.outputTokens, 'Token')}</span></div><small>这是已发生请求的累计上下文处理量；不是 OTel 额外消耗，也不是额度账单。</small>`
      : '不可用';
    const timing = diagnostic.status === 'observed'
      ? `<ul class="compact-list"><li>任务外空档：${renderHumanDuration(diagnostic.taskOutsideScopeSeconds)}（不计入该任务）</li><li>任务窗口内、已配对模型回合外空档：${renderHumanDuration(diagnostic.taskWindowOutsideCompletedTurnsSeconds)}（原因未归因）</li><li>活跃执行：${renderHumanDuration(diagnostic.activeTurnUnionSeconds)}</li><li>活跃执行内无法归因：${renderHumanDuration(diagnostic.unknownSeconds)}（${Math.round(diagnostic.unknownRatio * 100)}%）</li><li>工具调用：${renderHumanDuration(diagnostic.toolUnionSeconds)}</li><li>首字返回中位数：${renderHumanDuration(diagnostic.clientObservedTtftSeconds?.median)}</li></ul>`
      : escapeHtml(unavailableDiagnosticLabel(diagnostic));
    const anomalies = task.anomalies.length > 0 ? `<ul class="compact-list">${task.anomalies.map((item) => `<li>${escapeHtml(anomalyChineseText(item))}</li>`).join('')}</ul>` : '未命中确定性异常规则';
    return `<tr><td>${escapeHtml(task.displayKey)}</td><td class="route-cell">${renderTaskRoute(task)}</td><td>${escapeHtml(task.lifecycle.dispatchedAt ?? '未派发')}<br><small>派发窗口：${escapeHtml(compactChineseDuration(task.lifecycle.dispatchToEndSeconds))}</small></td><td>${timing}</td><td class="token-cell">${tokens}</td><td>${anomalies}</td></tr>`;
  }).join('');
  const actual = data.observability.activeTurnConcurrency;
  const batchAnomalies = data.observability.batchAnomalies.length > 0 ? `<div class="warning"><strong>并发异常：</strong><ul>${data.observability.batchAnomalies.map((item) => `<li>${escapeHtml(batchAnomalyChineseText(item))}</li>`).join('')}</ul></div>` : '';
  const mode = data.observability.mode === 'diagnostic' ? '深度诊断模式（diagnostic）' : '轻量报告模式（lean）';
  return `<section><h2>按需观测与消耗诊断</h2><p class="subtitle">当前模式：${escapeHtml(mode)}。轻量模式只读取任务台账；只有深度诊断模式才读取任务过程日志（rollout）、OTel（本地遥测日志）以及用户明确提供的桌面客户端日志。</p><div class="metrics"><div class="metric"><strong>${data.observability.lifecycleConcurrency.maxConcurrent}</strong><span>派发窗口最大重叠数</span></div><div class="metric"><strong>${actual.maxConcurrent ?? '—'}</strong><span>完成的模型交互轮次最大并发数</span></div><div class="metric"><strong>${observed}/${data.taskCount}</strong><span>具有本地时间诊断的任务</span></div><div class="metric"><strong>${anomalyCount}</strong><span>异常证据项</span></div></div>${batchAnomalies}<div class="legacy"><strong>解释边界：</strong>任务外空档是同一对话日志中位于本任务派发—结束窗口之外的时间，不计入任务耗时，也不代表模型思考或额度消耗。任务窗口内、模型回合外空档只说明没有已配对的模型回合，原因仍不可见。只有“活跃执行内无法归因”参与无法归因比例与异常判断。派发窗口重叠不等于模型内部同时计算；已配对的任务开始/任务完成事件（task_started/task_complete）只能证明模型交互轮次同时活跃。Token 是模型处理文本的计量单位；这里只有同一对话的模型响应完成事件（response.completed）累计值。额度快照属于整个账户，并发时不能归因给单个任务。</div>${renderConsumptionComparison(data)}<h3>派发窗口时间线</h3>${renderLifecycleGantt(data)}<div class="table-wrap"><table><thead><tr><th>任务</th><th>模型与任务类型</th><th>台账时间</th><th>本地耗时证据</th><th>累计上下文处理量（非账单）</th><th>异常</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderDeliveryReport(data) {
  const statusRows = data.tasks.map((task) => `<tr><td>${escapeHtml(task.displayKey)}</td><td>${renderRecordedText(task.title)}</td><td><span class="badge ${taskStatusClass(task)}">${escapeHtml(taskStatusLabel(task))}</span></td><td>${renderRecordedText(task.deliverables.at(-1)?.userVisibleSummary ?? '历史证据不可用')}</td><td>${renderRecordedText(task.nextGate)}</td></tr>`).join('');
  const timelines = data.tasks.map((task) => {
    const packages = task.deliverables.map((deliverable) => {
      const packageClass = ['reclaimed', 'blocked', 'changes_requested'].includes(task.status) || deliverable.deliveryStatus === 'rejected' ? 'failed' : reportStatusClass(task.status);
      const artifacts = deliverable.artifacts.length > 0 ? `<div class="artifact-grid">${deliverable.artifacts.map(renderArtifactHtml).join('')}</div>` : `<p class="empty">无截图：${renderRecordedText(deliverable.noScreenshotReason ?? '未说明')}</p>`;
      const metrics = deliverable.testSummary.metrics.map((metric) => `<li>${renderRecordedText(metric.label)}：${renderRecordedText(metric.before)} → ${renderRecordedText(metric.after)}${metric.unit ? ` ${renderRecordedText(metric.unit)}` : ''}</li>`).join('');
      const testStatus = ({ passed: '通过', failed: '失败', partial: '部分通过', blocked: '受阻' })[deliverable.testSummary.status] ?? `未识别状态（${deliverable.testSummary.status}）`;
      const affectedFiles = (deliverable.affectedFiles ?? []).map((file) => `<li><code>${escapeHtml(file.path)}</code> · ${escapeHtml(file.changeType)} · ${renderRecordedText(file.reason)}</li>`).join('');
      const evidenceChoice = deliverable.validationRationale ? `<div class="review"><strong>为什么选择这些验证：</strong>${renderRecordedText(deliverable.validationRationale)}</div>` : '';
      const sourceWorkspace = deliverable.sourceWorkspace ? `<div class="diagnostic"><strong>成果来源工作区：</strong>${escapeHtml(deliverable.sourceWorkspace.workspaceRole === 'candidate_worktree' ? '台账登记的候选 worktree' : '项目主工作区')} · <code>${escapeHtml(deliverable.sourceWorkspace.rootPath)}</code>${deliverable.sourceWorkspace.branch ? ` · 分支 ${escapeHtml(deliverable.sourceWorkspace.branch)}` : ''}</div>` : '<div class="legacy">旧成果没有工作区身份快照；按旧台账兼容读取。</div>';
      return `<article class="package ${packageClass}"><div class="package-head"><div><h3>第 ${deliverable.attempt} 次尝试 · ${renderRecordedText(deliverable.userVisibleSummary)}</h3><p>${escapeHtml(deliverable.recordedAt)} · 执行策略：${escapeHtml(deliverable.implementationPolicy === 'adaptive_brief' ? '自适应简报' : '风险硬合同')} · 候选提交：${escapeHtml(deliverable.candidateCommit)}</p></div><span class="badge ${packageClass}">${escapeHtml(deliveryStatusLabel(deliverable, task))}</span></div>${sourceWorkspace}<div class="columns"><div><h4>实际改变</h4><ul>${deliverable.actualChanges.map((item) => `<li>${renderRecordedText(item)}</li>`).join('')}</ul>${affectedFiles ? `<h4>实际影响文件与理由</h4><ul>${affectedFiles}</ul>` : ''}</div><div><h4>测试 / 数值</h4><p>${escapeHtml(testStatus)}：${renderRecordedText(deliverable.testSummary.summary)}</p><ul>${metrics}</ul></div></div>${evidenceChoice}${deliverable.incompleteItems.length > 0 ? `<div class="warning"><strong>未完成：</strong>${deliverable.incompleteItems.map(renderRecordedText).join('；')}</div>` : ''}${deliverable.reviewReason ? `<div class="review"><strong>主控审查：</strong>${renderRecordedText(deliverable.reviewReason)}</div>` : ''}${artifacts}</article>`;
    }).join('');
    const legacy = task.deliverables.length === 0 && task.legacyArtifacts.length === 0 ? '<div class="legacy">历史证据不可用；不据此伪造完成状态。</div>' : '';
    const stageRefs = task.legacyArtifacts.length > 0 ? `<details class="legacy"><summary>阶段证据参考（未验证）</summary><ul>${task.legacyArtifacts.map((artifact) => `<li>${escapeHtml(artifact.createdAt)} · ${renderRecordedText(artifact.label)} · 证据路径：${escapeHtml(artifact.reference)}</li>`).join('')}</ul></details>` : '';
    const failures = task.failureHistory.length > 0 ? `<details class="warning"><summary>失败 / 阻塞事件（${task.failureHistory.length}）</summary><ul>${task.failureHistory.map((failure) => `<li>${escapeHtml(failure.createdAt)} · 阶段：${renderRecordedText(failure.attemptedStage)} · 领域：${escapeHtml(reportEnumLabel(REPORT_FAILURE_DOMAIN_LABELS, failure.failureDomain, '未识别领域'))} · 分类：${escapeHtml(reportEnumLabel(REPORT_FAILURE_CLASS_LABELS, failure.failureClass, '未识别分类'))} · ${renderRecordedText(failure.commandSummary)}</li>`).join('')}</ul></details>` : '';
    const repairs = task.incidentalRepairs.length > 0 ? `<details class="review"><summary>同任务有界附带修复（${task.incidentalRepairs.length}）</summary>${task.incidentalRepairs.map((repair) => `<div><strong>${escapeHtml(repair.repairId)}</strong> · 第 ${repair.attemptCount} 次尝试 · 功能域：${renderRecordedText(repair.functionalDomain)}<br><strong>原始阻塞：</strong>${renderRecordedText(repair.originalBlocker)}<br><strong>为何仍属原目标：</strong>${renderRecordedText(repair.sameObjectiveReason)}<br><strong>风险判断：</strong>${renderRecordedText(repair.riskAssessment)}<ul>${repair.affectedFiles.map((file) => `<li><code>${escapeHtml(file.path)}</code> · ${escapeHtml(file.changeType)} · ${renderRecordedText(file.reason)}</li>`).join('')}</ul><small>RED 证据 ${repair.redEvidence.length} 条 · GREEN 证据 ${repair.greenEvidence.length} 条；此记录不计入失败、替换或熔断。</small></div>`).join('')}</details>` : '';
    const recovery = task.controlPlaneRecovery ? `<div class="diagnostic"><strong>控制面候选恢复：</strong>${escapeHtml(task.controlPlaneRecovery.status === 'completion_only' ? '仅允许重新提交 completion' : task.controlPlaneRecovery.status === 'completed' ? '同一候选已恢复并完成' : '已取消')} · Skill ${escapeHtml(task.controlPlaneRecovery.skillVersion)} · 候选 ${escapeHtml(task.controlPlaneRecovery.candidateCommit)}<br>${renderRecordedText(task.controlPlaneRecovery.reason)}<br><small>历史失败保留；不计 worker 机械返工、replacement 或 objective fuse。</small></div>` : '';
    const diagnostics = task.diagnostics.length > 0 ? `<details class="legacy"><summary>诊断价值裁决（${task.diagnostics.length}）</summary><ul>${task.diagnostics.map((diagnostic) => `<li>${escapeHtml(reportEnumLabel(REPORT_DIAGNOSTIC_LABELS, diagnostic.classification, '未识别诊断分类'))} · ${renderRecordedText(diagnostic.summary)}</li>`).join('')}</ul></details>` : '';
    const objective = task.objective ? `<div class="legacy"><strong>任务目标：</strong>技术标识 ${escapeHtml(task.objective.objectiveId)} · 已替换 ${task.objective.replacementCount}/${OBJECTIVE_FUSE_REPLACEMENT_LIMIT} 次 · 累计执行 ${escapeHtml(compactChineseDuration(task.objective.cumulativeExecutionMs / 1000))}${task.objective.fuseOpen ? ` · 已熔断：${task.objective.reasons.map(renderRecordedText).join('；')}` : ''}</div>` : '';
    const closeout = task.closeout ? `<div class="review"><strong>事故收口：</strong>${renderRecordedText(task.closeout.userVisibleSummary)} · 通知状态：${escapeHtml(({ sent: '已发送', pending: '待发送', failed: '发送失败' })[task.closeout.notificationStatus] ?? `未识别（${task.closeout.notificationStatus}）`)} · 报告状态：${escapeHtml(({ synced: '已同步', pending: '待同步', failed: '同步失败' })[task.closeout.reportStatus] ?? `未识别（${task.closeout.reportStatus}）`)}</div>` : '';
    const integrationEvidence = task.status === 'integrated' && implementationTask(task)
      ? task.integrationProof
        ? `<div class="review"><strong>集成真实性：</strong>Git 祖先关系已验证 · 候选 ${escapeHtml(task.integrationProof.candidateCommit)} · 目标 ${escapeHtml(task.integrationProof.targetRef)} = ${escapeHtml(task.integrationProof.targetCommit)} · ${escapeHtml(task.integrationProof.verifiedAt)}</div>`
        : '<div class="warning"><strong>集成真实性：</strong>这是旧台账中的 integrated 标记，没有 Git 祖先证明；报告不会把它冒充为已经验证进入主线。</div>'
      : '';
    const timeDiagnostic = task.timeDiagnostic.status === 'observed' ? `<div class="diagnostic"><strong>时间证据：</strong>任务外空档 ${escapeHtml(compactChineseDuration(task.timeDiagnostic.taskOutsideScopeSeconds))}（不计入任务） · 活跃执行 ${escapeHtml(compactChineseDuration(task.timeDiagnostic.activeTurnUnionSeconds))} · 活跃执行内无法归因 ${escapeHtml(compactChineseDuration(task.timeDiagnostic.unknownSeconds))}（${Math.round(task.timeDiagnostic.unknownRatio * 100)}%） · 工具调用 ${escapeHtml(compactChineseDuration(task.timeDiagnostic.toolUnionSeconds))} · 上下文峰值占比 ${task.timeDiagnostic.contextPeakRatio === null ? '不可用' : `${Math.round(task.timeDiagnostic.contextPeakRatio * 100)}%`} · 上下文压缩 ${task.timeDiagnostic.compactions} 次</div>` : '';
    const routeSummary = `${reportEnumLabel(REPORT_TASK_MODE_LABELS, task.taskMode, '未识别任务模式')} · ${reportEnumLabel(REPORT_MODEL_LABELS, task.model, '未识别模型')} · ${reportEnumLabel(REPORT_THINKING_LABELS, task.thinking, '未识别推理强度')} · 第 ${task.attemptCount} 次尝试`;
    return `<section><div class="task-head"><div><h2>${escapeHtml(task.displayKey)} · ${renderRecordedText(task.title)}</h2><p>${escapeHtml(routeSummary)}</p><small>模型技术标识：${escapeHtml(task.model)} · 范围策略：${escapeHtml(task.scopePolicy === 'bounded_incidental' ? '允许有界同域小修' : task.scopePolicy === 'strict_scope' ? '严格范围' : '不适用')}</small></div><span class="badge ${taskStatusClass(task)}">${escapeHtml(taskStatusLabel(task))}</span></div>${objective}${task.blocker ? `<div class="warning"><strong>当前阻塞：</strong>${renderRecordedText(task.blocker)}</div>` : ''}${closeout}${integrationEvidence}${timeDiagnostic}${recovery}${repairs}${failures}${diagnostics}${packages}${legacy}${stageRefs}<div class="next"><strong>下一门禁：</strong>${renderRecordedText(task.nextGate)}</div></section>`;
  }).join('');
  const integrated = data.tasks.filter((task) => task.status === 'integrated' && (!implementationTask(task) || task.integrationProof !== null)).length;
  const unverifiedIntegrated = data.tasks.filter((task) => task.status === 'integrated' && implementationTask(task) && task.integrationProof === null).length;
  const failed = data.tasks.filter((task) => ['blocked', 'reclaimed', 'changes_requested'].includes(task.status)).length;
  const executiveSummary = data.businessDeliverableCount === 0
    ? `<div class="warning"><strong>结论：本专题没有可验证的业务交付。</strong> 当前记录包含 ${data.candidateCommitCount} 个实现候选、${data.controlReviewPassedCount} 个控制/审查结果，但没有同时满足“成果包 + 主控接受 + Git 集成证明”的业务成果。控制任务通过不等于产品功能已经交付。</div>`
    : `<div class="review"><strong>结论：已验证 ${data.businessDeliverableCount} 项业务交付。</strong> 另有 ${data.candidateCommitCount} 个实现候选、${data.controlReviewPassedCount} 个控制/审查结果；候选与控制结论不会冒充主线成果。</div>`;
  const checkpointSummary = data.checkpointState
    ? `<div class="diagnostic"><strong>对话检查点：</strong>${escapeHtml(data.checkpointState.latestCheckpointId)} · 第 ${data.checkpointState.sequence} 版 · ${escapeHtml(data.checkpointState.sealedAt)}<br><small>默认预加载只读取已确认摘要；详细证据按 fact/source 引用展开。</small>${data.handoffState ? `<br><strong>主控交接：</strong>${escapeHtml(data.handoffState.status)} · successor ${escapeHtml(data.handoffState.successorThreadId)}` : ''}</div>`
    : '<div class="legacy">尚未生成对话检查点；这不会阻塞现有任务或报告。</div>';
  const css = ':root{color-scheme:light;--ink:#241e18;--muted:#74695e;--paper:#f4f0e9;--panel:#fffdfa;--line:#cfc5b8;--green:#2e6944;--amber:#9a651c;--red:#9a3e32;--blue:#315f86;--purple:#73509b}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 "Microsoft YaHei","Noto Sans SC",sans-serif}header,main{width:min(1320px,calc(100% - 28px));margin:auto}header{padding:28px 0 20px;border-bottom:1px solid var(--line)}h1,h2,h3,h4,p{margin-top:0}.subtitle,small{color:var(--muted)}.translation-note{display:block;margin-top:3px;color:var(--muted);font-size:12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;border:1px solid var(--line);background:var(--line);margin-top:20px}.metric{padding:14px;background:var(--panel)}.metric strong{display:block;font-size:24px}main{padding-bottom:48px}section{margin-top:24px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;background:var(--panel)}th,td{padding:11px;border:1px solid var(--line);text-align:left;vertical-align:top}.badge{display:inline-block;padding:3px 8px;border-radius:3px;color:#fff;font-size:12px}.badge.ok{background:var(--green)}.badge.pending{background:var(--amber)}.badge.failed{background:var(--red)}.task-head,.package-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.package{margin:14px 0;padding:16px;background:var(--panel);border-left:4px solid var(--amber)}.package.ok{border-color:var(--green)}.package.failed{border-color:var(--red)}.columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}.artifact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.artifact{margin:0;border:1px solid var(--line);background:#fff}.artifact.selected{outline:3px solid var(--green)}.artifact img{display:block;width:100%;max-height:520px;object-fit:contain;background:#1c1916}.artifact figcaption{display:grid;padding:10px;gap:3px}.artifact figcaption span{color:var(--muted)}.artifact-link{display:block;padding:24px}.warning,.review,.legacy,.next,.missing,.empty,.diagnostic{margin:10px 0;padding:12px;background:#fff7e8;border-left:4px solid var(--amber)}.missing,.package.failed .warning{background:#fff0ed;border-color:var(--red)}.review{background:#edf7ef;border-color:var(--green)}.diagnostic{background:#edf4fa;border-color:var(--blue)}.gantt{display:grid;gap:8px;margin:12px 0 18px}.gantt-row{display:grid;grid-template-columns:70px minmax(220px,1fr) minmax(280px,auto);gap:10px;align-items:center}.gantt-track{height:16px;position:relative;background:#e5ddd2;border-radius:8px;overflow:hidden}.gantt-bar{position:absolute;top:0;height:100%;background:var(--amber)}.gantt-bar.ok{background:var(--green)}.gantt-bar.failed{background:var(--red)}.comparison-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0 20px}.comparison-card{padding:14px;background:var(--panel);border:1px solid var(--line)}.comparison-row{display:grid;grid-template-columns:72px minmax(120px,1fr) 92px;gap:10px;align-items:center;margin:9px 0}.comparison-row>strong{text-align:right}.comparison-track{display:block;height:12px;background:#e5ddd2;border-radius:8px;overflow:hidden}.comparison-bar{display:block;height:100%;border-radius:8px}.comparison-bar.input{background:var(--purple)}.comparison-bar.output{background:var(--green)}.comparison-bar.active{background:var(--blue)}.comparison-bar.tool{background:var(--amber)}.route-cell{min-width:210px}.route-cell>*{display:block;margin-bottom:3px}.token-cell{min-width:210px}.token-pair{display:grid;gap:9px;margin-bottom:8px}.token-pair span,.human-number{display:block}.token-pair b{display:block;color:var(--muted);font-size:12px}.compact-list{margin:0;padding-left:18px}@media(max-width:760px){.metrics{grid-template-columns:repeat(2,1fr)}.columns,.artifact-grid,.comparison-grid{grid-template-columns:1fr}.task-head,.package-head{display:block}.gantt-row{grid-template-columns:48px 1fr}.gantt-row small{grid-column:1/-1}.comparison-row{grid-template-columns:64px minmax(90px,1fr) 84px}th:nth-child(4),td:nth-child(4){min-width:260px}}';
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="task-control-registry-updated-at" content="${escapeHtml(data.registryUpdatedAt)}"><meta name="task-control-observability-mode" content="${escapeHtml(data.observability.mode)}"><title>Codex 任务成果与诊断</title><style>${css}</style></head><body><header><h1>任务成果与控制诊断</h1><p class="subtitle">项目：${escapeHtml(data.projectRoot)} · 主控：${escapeHtml(data.controllerThreadId)}</p><div class="metrics"><div class="metric"><strong>${data.taskCount}</strong><span>专题任务</span></div><div class="metric"><strong>${data.businessDeliverableCount}</strong><span>已验证业务交付</span></div><div class="metric"><strong>${data.candidateCommitCount}</strong><span>实现候选提交</span></div><div class="metric"><strong>${data.controlReviewPassedCount}</strong><span>控制审查通过</span></div></div></header><main><section><h2>一眼结论</h2>${executiveSummary}</section><section><h2>对话知识与交接</h2>${checkpointSummary}</section><section><h2>工作包状态</h2><div class="table-wrap"><table><thead><tr><th>编号</th><th>任务</th><th>状态</th><th>用户得到了什么</th><th>下一门禁</th></tr></thead><tbody>${statusRows}</tbody></table></div></section>${renderObservabilitySection(data)}${timelines}</main></body></html>\n`;
}

export async function controllerBuildDeliveryReport(input) {
  const data = await addObservability(await controllerQueryDeliverables(input), input);
  const html = renderDeliveryReport(data);
  await atomicWriteText(data.reportPath, html);
  return { reportPath: data.reportPath, reportFileUri: pathToFileURL(data.reportPath).href, projectKey: data.projectKey, controllerThreadId: data.controllerThreadId, registryUpdatedAt: data.registryUpdatedAt, taskCount: data.taskCount, deliverableCount: data.deliverableCount, businessDeliverableCount: data.businessDeliverableCount, candidateCommitCount: data.candidateCommitCount, controlReviewPassedCount: data.controlReviewPassedCount, observability: data.observability };
}

function checkpointDirectory(home, projectKey, controllerThreadId) {
  return join(home, 'checkpoints', projectKey, controllerThreadId);
}

function checkpointPointerFor(registry, controllerThreadId) {
  return (registry.controllerCheckpoints ?? []).find((entry) => entry.controllerThreadId === controllerThreadId) ?? null;
}

async function readVerifiedCheckpoint(pointer, identity) {
  const raw = await readFile(pointer.checkpointPath, 'utf8').catch((error) => fail('CHECKPOINT_READ_FAILED', `无法读取 checkpoint: ${error.message}`));
  let record;
  try { record = JSON.parse(raw); } catch { fail('CHECKPOINT_READ_FAILED', 'checkpoint JSON 无效'); }
  if (!isObject(record) || record.schemaVersion !== CHECKPOINT_PROTOCOL_VERSION || record.projectKey !== identity.projectKey || record.controllerThreadId !== identity.controllerThreadId || record.checkpointId !== pointer.latestCheckpointId || record.digest !== pointer.latestCheckpointDigest || !isTimestamp(record.createdAt) || record.sequence !== pointer.sequence) fail('CHECKPOINT_INTEGRITY_FAILED', 'checkpoint 身份或 pointer 不一致');
  const manifest = validateCheckpointManifest({ schemaVersion: record.schemaVersion, projectKey: record.projectKey, controllerThreadId: record.controllerThreadId, scopeSummary: record.scopeSummary, points: record.points }, identity);
  const digestInput = { schemaVersion: record.schemaVersion, projectKey: record.projectKey, controllerThreadId: record.controllerThreadId, checkpointId: record.checkpointId, sequence: record.sequence, createdAt: record.createdAt, scopeSummary: manifest.scopeSummary, points: manifest.points };
  const digest = createHash('sha256').update(JSON.stringify(digestInput), 'utf8').digest('hex');
  if (digest !== record.digest) fail('CHECKPOINT_INTEGRITY_FAILED', 'checkpoint digest 不匹配');
  return { ...digestInput, digest };
}

function checkpointPreload(record, mode = 'preload', factId = null) {
  if (!['preload', 'full'].includes(mode)) fail('CLI_INVALID_ARGUMENTS', 'checkpoint mode 只能是 preload 或 full');
  let points;
  if (nonEmpty(factId)) {
    assertSafeThreadId(factId, 'factId');
    const found = record.points.find((point) => point.factId === factId);
    if (!found) fail('CHECKPOINT_POINT_NOT_FOUND', `checkpoint point 不存在: ${factId}`);
    points = [found];
  } else if (mode === 'full') points = record.points;
  else points = record.points.filter((point) => point.preloadPolicy === 'always' && CHECKPOINT_ALWAYS_AUTHORITIES.includes(point.authority));
  return { schemaVersion: record.schemaVersion, projectKey: record.projectKey, sourceControllerThreadId: record.controllerThreadId, checkpointId: record.checkpointId, checkpointDigest: record.digest, createdAt: record.createdAt, scopeSummary: record.scopeSummary, mode: nonEmpty(factId) ? 'point' : mode, points, omittedPointCount: record.points.length - points.length, interpretation: '默认预加载仅包含已确认且标记 always 的摘要；sourceRefs 只是按需展开索引，不包含原始 prompt/response。' };
}

export async function controllerSealCheckpoint(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  if (!nonEmpty(input.manifestPath) || !win32.isAbsolute(input.manifestPath)) fail('CLI_INVALID_ARGUMENTS', 'checkpoint manifest 必须是 Windows 绝对路径');
  const raw = await readFile(input.manifestPath, 'utf8').catch((error) => fail('CHECKPOINT_MANIFEST_INVALID', `无法读取 checkpoint manifest: ${error.message}`));
  let parsed;
  try { parsed = JSON.parse(raw); } catch { fail('CHECKPOINT_MANIFEST_INVALID', 'checkpoint manifest JSON 无效'); }
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    assertControllerKnown(registry, input.controllerThreadId);
    if (preparedHandoffFor(registry, input.controllerThreadId) || acceptedHandoffFor(registry, input.controllerThreadId)) fail('CHECKPOINT_FROZEN_BY_HANDOFF', 'handoff prepared 或 accepted 后不能替换其绑定的 checkpoint');
    const manifest = validateCheckpointManifest(parsed, { projectKey: paths.projectKey, controllerThreadId: input.controllerThreadId });
    const previous = checkpointPointerFor(registry, input.controllerThreadId);
    const sequence = (previous?.sequence ?? 0) + 1;
    const checkpointId = `checkpoint-${String(sequence).padStart(4, '0')}`;
    const createdAt = new Date().toISOString();
    const digestInput = { schemaVersion: CHECKPOINT_PROTOCOL_VERSION, projectKey: paths.projectKey, controllerThreadId: input.controllerThreadId, checkpointId, sequence, createdAt, scopeSummary: manifest.scopeSummary, points: manifest.points };
    const digest = createHash('sha256').update(JSON.stringify(digestInput), 'utf8').digest('hex');
    const checkpointPath = join(checkpointDirectory(home, paths.projectKey, input.controllerThreadId), `${checkpointId}.json`);
    if (await access(checkpointPath).then(() => true).catch(() => false)) fail('CHECKPOINT_ALREADY_EXISTS', `checkpoint 已存在: ${checkpointPath}`);
    await atomicWriteJson(checkpointPath, { ...digestInput, digest });
    const pointer = { schemaVersion: CHECKPOINT_PROTOCOL_VERSION, controllerThreadId: input.controllerThreadId, sequence, latestCheckpointId: checkpointId, latestCheckpointDigest: digest, checkpointPath, sealedAt: createdAt };
    const controllerCheckpoints = [...registry.controllerCheckpoints.filter((entry) => entry.controllerThreadId !== input.controllerThreadId), pointer];
    try {
      const next = validateRegistry({ ...registry, controllerCheckpoints, updatedAt: createdAt }, paths.projectKey, paths.projectRoot);
      await atomicWriteJson(paths.registryPath, next);
    } catch (error) {
      await rm(checkpointPath, { force: true });
      throw error;
    }
    return { projectKey: paths.projectKey, controllerThreadId: input.controllerThreadId, checkpointId, checkpointDigest: digest, checkpointPath, checkpointFileUri: pathToFileURL(checkpointPath).href, sequence, pointCount: manifest.points.length, preloadPointCount: manifest.points.filter((point) => point.preloadPolicy === 'always').length };
  });
}

export async function controllerQueryCheckpoint(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
  assertControllerKnown(registry, input.controllerThreadId);
  const pointer = checkpointPointerFor(registry, input.controllerThreadId);
  if (!pointer) fail('CHECKPOINT_NOT_FOUND', `主控 ${input.controllerThreadId} 还没有 sealed checkpoint`);
  if (nonEmpty(input.checkpointId) && input.checkpointId !== 'latest' && input.checkpointId !== pointer.latestCheckpointId) fail('CHECKPOINT_NOT_LATEST', 'v1 查询只允许 latest/current checkpoint；历史文件仍保留在磁盘');
  const record = await readVerifiedCheckpoint(pointer, { projectKey: paths.projectKey, controllerThreadId: input.controllerThreadId });
  return checkpointPreload(record, input.mode ?? 'preload', input.factId ?? null);
}

function controllerHandoffBlockers(registry, controllerThreadId) {
  const queues = controllerWorkQueues(registry.tasks, controllerThreadId);
  const parallel = controllerParallelRuntime(registry, controllerThreadId);
  const heartbeat = registry.controllerHeartbeats.find((entry) => entry.controllerThreadId === controllerThreadId) ?? null;
  const messages = registry.controllerMessages.filter((entry) => entry.controllerThreadId === controllerThreadId && ['deferred_local', 'prepared'].includes(entry.status));
  const blockers = [];
  if (queues.activeTasks.length) blockers.push({ code: 'active_tasks', count: queues.activeTasks.length });
  if (queues.routingTasks.length) blockers.push({ code: 'undispatched_tasks', count: queues.routingTasks.length });
  if (queues.queuedTasks.length) blockers.push({ code: 'review_routing_or_closeout', count: queues.queuedTasks.length });
  if (queues.cleanupTasks.length) blockers.push({ code: 'thread_actions', count: queues.cleanupTasks.length });
  if (parallel.batches.length) blockers.push({ code: 'parallel_batches_open', count: parallel.batches.length });
  if (messages.length) blockers.push({ code: 'controller_messages_pending', count: messages.length });
  if (heartbeat?.pendingAction) blockers.push({ code: 'heartbeat_action_pending', count: 1 });
  if (heartbeat?.status === 'armed' || isSafeThreadId(heartbeat?.automationId)) blockers.push({ code: 'heartbeat_not_closed', count: 1 });
  return blockers;
}

export async function controllerPrepareHandoff(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId'); assertSafeThreadId(input.successorThreadId, 'successorThreadId');
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    assertControllerKnown(registry, input.controllerThreadId);
    if (input.successorThreadId === input.controllerThreadId || registry.rootControllerThreadIds.includes(input.successorThreadId) || registry.tasks.some((task) => task.threadId === input.successorThreadId)) fail('HANDOFF_SUCCESSOR_INVALID', 'successor 必须是新的、尚未登记到当前项目的可见 task ID');
    if (preparedHandoffFor(registry, input.controllerThreadId)) fail('HANDOFF_ALREADY_PREPARED', '当前主控已有 prepared handoff');
    const blockers = controllerHandoffBlockers(registry, input.controllerThreadId);
    if (blockers.length) fail('HANDOFF_NOT_QUIESCENT', `主控尚未收口，不能交接: ${blockers.map((entry) => `${entry.code}=${entry.count}`).join(', ')}`);
    const pointer = checkpointPointerFor(registry, input.controllerThreadId);
    if (!pointer) fail('CHECKPOINT_NOT_FOUND', '安全交接前必须先 seal checkpoint');
    if (nonEmpty(input.checkpointId) && input.checkpointId !== pointer.latestCheckpointId) fail('CHECKPOINT_NOT_LATEST', 'handoff 必须绑定 latest checkpoint');
    await readVerifiedCheckpoint(pointer, { projectKey: paths.projectKey, controllerThreadId: input.controllerThreadId });
    const preparedAt = new Date().toISOString();
    const handoff = { schemaVersion: HANDOFF_PROTOCOL_VERSION, handoffId: `handoff_${randomUUID().replaceAll('-', '')}`, sourceControllerThreadId: input.controllerThreadId, successorThreadId: input.successorThreadId, checkpointId: pointer.latestCheckpointId, checkpointDigest: pointer.latestCheckpointDigest, status: 'prepared', preparedAt, acceptedAt: null, cancelledAt: null, cancelReason: null };
    const next = validateRegistry({ ...registry, controllerHandoffs: [...registry.controllerHandoffs, handoff], updatedAt: preparedAt }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { ...handoff, businessAllowedForSource: false, heartbeatRequired: false, acceptanceCommand: `controller-accept-handoff --project-root <root> --controller ${input.controllerThreadId} --successor ${input.successorThreadId} --handoff-id ${handoff.handoffId} --checkpoint-digest ${handoff.checkpointDigest}` };
  });
}

export async function controllerAcceptHandoff(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId'); assertSafeThreadId(input.successorThreadId, 'successorThreadId'); assertSafeThreadId(input.handoffId, 'handoffId');
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const handoff = registry.controllerHandoffs.find((entry) => entry.handoffId === input.handoffId);
    if (!handoff || handoff.status !== 'prepared' || handoff.sourceControllerThreadId !== input.controllerThreadId || handoff.successorThreadId !== input.successorThreadId || handoff.checkpointDigest !== input.checkpointDigest) fail('HANDOFF_ACCEPT_INVALID', 'handoff 身份、状态或 checkpoint digest 不匹配');
    const blockers = controllerHandoffBlockers(registry, input.controllerThreadId);
    if (blockers.length) fail('HANDOFF_NOT_QUIESCENT', `接受前主控又出现未收口工作: ${blockers.map((entry) => `${entry.code}=${entry.count}`).join(', ')}`);
    const pointer = checkpointPointerFor(registry, input.controllerThreadId);
    const record = await readVerifiedCheckpoint(pointer, { projectKey: paths.projectKey, controllerThreadId: input.controllerThreadId });
    const acceptedAt = new Date().toISOString();
    const accepted = { ...handoff, status: 'accepted', acceptedAt };
    const rootControllerThreadIds = registry.rootControllerThreadIds.includes(input.successorThreadId) ? registry.rootControllerThreadIds : [...registry.rootControllerThreadIds, input.successorThreadId];
    const controllerHandoffs = registry.controllerHandoffs.map((entry) => entry.handoffId === handoff.handoffId ? accepted : entry);
    const next = validateRegistry({ ...registry, rootControllerThreadIds, controllerHandoffs, updatedAt: acceptedAt }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { ...accepted, sourceRetired: true, successorRegisteredAsRoot: true, heartbeatRequired: false, preload: checkpointPreload(record, 'preload') };
  });
}

export async function controllerCancelHandoff(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId'); assertSafeThreadId(input.handoffId, 'handoffId');
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', '取消 handoff 必须记录 reason');
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const handoff = registry.controllerHandoffs.find((entry) => entry.handoffId === input.handoffId);
    if (!handoff || handoff.status !== 'prepared' || handoff.sourceControllerThreadId !== input.controllerThreadId) fail('HANDOFF_CANCEL_INVALID', '只能由 source 取消 prepared handoff');
    const cancelledAt = new Date().toISOString();
    const cancelled = { ...handoff, status: 'cancelled', cancelledAt, cancelReason: input.reason.trim() };
    const next = validateRegistry({ ...registry, controllerHandoffs: registry.controllerHandoffs.map((entry) => entry.handoffId === handoff.handoffId ? cancelled : entry), updatedAt: cancelledAt }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return { ...cancelled, businessAllowedForSource: true, heartbeatRequired: false };
  });
}

export async function controllerIngestContextHealth(input) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  if (!nonEmpty(input.receiptPath)) fail('CLI_INVALID_ARGUMENTS', 'context health receipt path 不能为空');
  const raw = await readFile(input.receiptPath, 'utf8').catch((error) => fail('CONTEXT_HEALTH_RECEIPT_INVALID', `无法读取 context health receipt: ${error.message}`));
  let receipt;
  try { receipt = JSON.parse(raw); } catch { fail('CONTEXT_HEALTH_RECEIPT_INVALID', 'context health receipt JSON 无效'); }
  const legacyReceipt = receipt?.schemaVersion === 1 && has(receipt?.status, CONTEXT_HEALTH_STATUSES);
  const advisoryReceipt = receipt?.schemaVersion === 2 && has(receipt?.status, CONTEXT_HEALTH_RECEIPT_V2_STATUSES);
  if (!isObject(receipt) || (!legacyReceipt && !advisoryReceipt) || receipt.controllerThreadId !== input.controllerThreadId || !isTimestamp(receipt.capturedAt) || !isObject(receipt.metrics) || !nonEmpty(receipt.reportPath) || !win32.isAbsolute(receipt.reportPath)) fail('CONTEXT_HEALTH_RECEIPT_INVALID', 'context health receipt 字段无效');
  const reportRaw = await readFile(receipt.reportPath).catch((error) => fail('CONTEXT_HEALTH_RECEIPT_INVALID', `无法读取 context health report: ${error.message}`));
  const health = { receiptSchemaVersion: receipt.schemaVersion, controllerThreadId: input.controllerThreadId, status: receipt.status, reportPath: win32.resolve(receipt.reportPath), reportSha256: createHash('sha256').update(reportRaw).digest('hex'), capturedAt: receipt.capturedAt, metrics: receipt.metrics };
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    const controllerKnown = registry.rootControllerThreadIds.includes(input.controllerThreadId) || registry.tasks.some((task) => task.threadId === input.controllerThreadId);
    if (!controllerKnown) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 未登记');
    const controllerHealth = [...registry.controllerHealth.filter((entry) => entry.controllerThreadId !== input.controllerThreadId), health];
    const next = validateRegistry({ ...registry, controllerHealth, updatedAt: new Date().toISOString() }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return health;
  });
}

async function deliveryReportNeedsRefresh(paths, controllerThreadId, registryUpdatedAt) {
  const reportPath = deliveryReportPath(paths.home, paths.projectKey, controllerThreadId);
  try {
    const html = await readFile(reportPath, 'utf8');
    const match = /<meta name="task-control-registry-updated-at" content="([^"]+)">/.exec(html);
    return match?.[1] !== registryUpdatedAt;
  } catch {
    return true;
  }
}

function assertControllerKnown(registry, controllerThreadId) {
  assertSafeThreadId(controllerThreadId, 'controllerThreadId');
  if (!registry.rootControllerThreadIds.includes(controllerThreadId) && !registry.tasks.some((task) => task.threadId === controllerThreadId)) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 未登记为项目主控或父任务');
}

async function mutateControllerMessages(input, mutate) {
  const home = resolveTaskControlHome(input);
  const { paths } = await ensureProject(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  return withExclusiveLock(paths.registryPath, async () => {
    const registry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
    assertControllerKnown(registry, input.controllerThreadId);
    const result = await mutate(registry);
    if (result.registry === registry) return result.output;
    const next = validateRegistry({ ...result.registry, updatedAt: new Date().toISOString() }, paths.projectKey, paths.projectRoot);
    await atomicWriteJson(paths.registryPath, next);
    return result.output;
  });
}

export async function controllerPrepareMessage(input) {
  const kind = input.kind ?? 'follow_up';
  const deliveryMode = input.deliveryMode ?? 'queue';
  const targetTurnState = input.targetTurnState ?? 'unknown';
  if (!has(kind, CONTROLLER_MESSAGE_KINDS) || !has(deliveryMode, CONTROLLER_MESSAGE_DELIVERY_MODES) || !has(targetTurnState, CONTROLLER_MESSAGE_TARGET_STATES)) fail('CLI_INVALID_ARGUMENTS', 'controller message kind、delivery mode 或 target turn state 无效');
  if (!nonEmpty(input.messageText) || input.messageText.length > CONTROLLER_MESSAGE_MAX_LENGTH) fail('CLI_INVALID_ARGUMENTS', `message 必须为 1-${CONTROLLER_MESSAGE_MAX_LENGTH} 个字符`);
  const messageId = input.messageId ?? `msg_${randomUUID().replaceAll('-', '')}`;
  assertSafeThreadId(messageId, 'messageId');
  return mutateControllerMessages(input, async (registry) => {
    assertControllerCycleBusinessReady(registry, input.controllerThreadId);
    assertControllerHealthyForDispatch(registry, input.controllerThreadId);
    const target = taskOrThrow(registry, input.threadId);
    assertTaskController(target, input.controllerThreadId);
    if (target.status !== 'executing' || target.executionStatus !== 'running') fail('MESSAGE_TARGET_NOT_EXECUTING', '普通工作消息只能发给当前 executing/running 的直接子任务');
    const digest = controllerMessageDigest(input.messageText);
    const existing = registry.controllerMessages.find((message) => message.messageId === messageId);
    if (existing) {
      if (existing.controllerThreadId !== input.controllerThreadId || existing.targetThreadId !== input.threadId || existing.kind !== kind || existing.deliveryMode !== deliveryMode || existing.messageDigest !== digest) fail('MESSAGE_ID_CONFLICT', 'messageId 已用于不同消息');
      return { registry, output: controllerMessageSummary(existing) };
    }
    let interruptAuthority = null;
    let status;
    let actionId = null;
    if (deliveryMode === 'interrupt') {
      interruptAuthority = input.interruptAuthority ?? null;
      if (!['stop', 'cancel'].includes(kind) || !has(interruptAuthority, CONTROLLER_MESSAGE_INTERRUPT_AUTHORITIES)) fail('MESSAGE_INTERRUPT_NOT_AUTHORIZED', '只有 stop/cancel 且具有 user_explicit 或 controller_safety 权限时才能中断');
      if (targetTurnState === 'idle') fail('MESSAGE_INTERRUPT_NOT_AUTHORIZED', '目标已 idle，不应使用 interrupt');
      status = 'prepared';
      actionId = `msgact_${randomUUID().replaceAll('-', '')}`;
    } else {
      if (['stop', 'cancel'].includes(kind) || input.interruptAuthority !== undefined && input.interruptAuthority !== null) fail('MESSAGE_INTERRUPT_NOT_AUTHORIZED', 'stop/cancel 不得伪装成普通 queue message');
      status = targetTurnState === 'idle' ? 'prepared' : 'deferred_local';
      if (status === 'prepared') actionId = `msgact_${randomUUID().replaceAll('-', '')}`;
    }
    const now = new Date().toISOString();
    const message = { protocolVersion: CONTROLLER_MESSAGE_PROTOCOL_VERSION, messageId, controllerThreadId: input.controllerThreadId, targetThreadId: input.threadId, kind, deliveryMode, interruptAuthority, messageText: input.messageText, messageDigest: digest, targetTurnState, status, actionId, actionExpiresAt: actionId === null ? null : new Date(Date.parse(now) + CONTROLLER_MESSAGE_ACTION_TIMEOUT_MS).toISOString(), createdAt: now, updatedAt: now, deliveredAt: null, receipt: null, failureReason: null };
    const next = { ...registry, controllerMessages: [...registry.controllerMessages, message] };
    return { registry: next, output: controllerMessageSummary(message) };
  });
}

export async function controllerReleaseMessage(input) {
  if (!isSafeThreadId(input.messageId)) fail('CLI_INVALID_ARGUMENTS', 'messageId 无效');
  if (!has(input.targetTurnState, CONTROLLER_MESSAGE_TARGET_STATES)) fail('CLI_INVALID_ARGUMENTS', 'target turn state 无效');
  return mutateControllerMessages(input, async (registry) => {
    const message = registry.controllerMessages.find((candidate) => candidate.messageId === input.messageId);
    if (!message || message.controllerThreadId !== input.controllerThreadId) fail('MESSAGE_NOT_FOUND', 'controller message 不存在或不属于当前主控');
    if (message.status === 'prepared' && message.deliveryMode === 'queue' && Date.now() > Date.parse(message.actionExpiresAt)) {
      const target = taskOrThrow(registry, message.targetThreadId);
      if (target.status !== 'executing' || target.executionStatus !== 'running') {
        const cancelled = { ...message, targetTurnState: input.targetTurnState, status: 'cancelled', actionId: null, actionExpiresAt: null, failureReason: `target lifecycle is ${target.status}/${target.executionStatus}`, updatedAt: new Date().toISOString() };
        return { registry: { ...registry, controllerMessages: registry.controllerMessages.map((candidate) => candidate.messageId === message.messageId ? cancelled : candidate) }, output: controllerMessageSummary(cancelled) };
      }
      if (input.targetTurnState !== 'idle') fail('MESSAGE_ACTION_EXPIRED', '旧 message action 已过期；重新确认 idle 后才能生成新动作');
      const now = new Date().toISOString();
      const renewed = { ...message, actionId: `msgact_${randomUUID().replaceAll('-', '')}`, actionExpiresAt: new Date(Date.parse(now) + CONTROLLER_MESSAGE_ACTION_TIMEOUT_MS).toISOString(), updatedAt: now };
      return { registry: { ...registry, controllerMessages: registry.controllerMessages.map((candidate) => candidate.messageId === message.messageId ? renewed : candidate) }, output: controllerMessageSummary(renewed) };
    }
    if (message.status !== 'deferred_local') return { registry, output: controllerMessageSummary(message) };
    const target = taskOrThrow(registry, message.targetThreadId);
    if (target.status !== 'executing' || target.executionStatus !== 'running') {
      const cancelled = { ...message, targetTurnState: input.targetTurnState, status: 'cancelled', actionId: null, actionExpiresAt: null, failureReason: `target lifecycle is ${target.status}/${target.executionStatus}`, updatedAt: new Date().toISOString() };
      return { registry: { ...registry, controllerMessages: registry.controllerMessages.map((candidate) => candidate.messageId === message.messageId ? cancelled : candidate) }, output: controllerMessageSummary(cancelled) };
    }
    if (input.targetTurnState !== 'idle') {
      if (message.targetTurnState === input.targetTurnState) return { registry, output: controllerMessageSummary(message) };
      const deferred = { ...message, targetTurnState: input.targetTurnState, updatedAt: new Date().toISOString() };
      return { registry: { ...registry, controllerMessages: registry.controllerMessages.map((candidate) => candidate.messageId === message.messageId ? deferred : candidate) }, output: controllerMessageSummary(deferred) };
    }
    const now = new Date().toISOString();
    const prepared = { ...message, targetTurnState: 'idle', status: 'prepared', actionId: `msgact_${randomUUID().replaceAll('-', '')}`, actionExpiresAt: new Date(Date.parse(now) + CONTROLLER_MESSAGE_ACTION_TIMEOUT_MS).toISOString(), updatedAt: now };
    return { registry: { ...registry, controllerMessages: registry.controllerMessages.map((candidate) => candidate.messageId === message.messageId ? prepared : candidate) }, output: controllerMessageSummary(prepared) };
  });
}

export async function controllerRecordMessageDelivery(input) {
  if (!isSafeThreadId(input.messageId) || !isSafeThreadId(input.actionId)) fail('CLI_INVALID_ARGUMENTS', 'messageId 或 actionId 无效');
  if (!['delivered', 'failed'].includes(input.outcome)) fail('CLI_INVALID_ARGUMENTS', 'outcome 必须是 delivered 或 failed');
  return mutateControllerMessages(input, async (registry) => {
    const message = registry.controllerMessages.find((candidate) => candidate.messageId === input.messageId);
    if (!message || message.controllerThreadId !== input.controllerThreadId) fail('MESSAGE_NOT_FOUND', 'controller message 不存在或不属于当前主控');
    if (message.status !== 'prepared' || message.actionId !== input.actionId) fail('MESSAGE_ACTION_STALE', 'message action 不存在、已处理或 actionId 不匹配');
    const now = new Date().toISOString();
    let settled;
    if (input.outcome === 'delivered') {
      if (!nonEmpty(input.receipt)) fail('CLI_INVALID_ARGUMENTS', 'delivered 必须记录非空 host receipt');
      settled = { ...message, status: 'delivered', deliveredAt: now, receipt: input.receipt, updatedAt: now };
    } else {
      if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'failed 必须记录非空 reason');
      settled = { ...message, status: 'failed', failureReason: input.reason, updatedAt: now };
    }
    return { registry: { ...registry, controllerMessages: registry.controllerMessages.map((candidate) => candidate.messageId === message.messageId ? settled : candidate) }, output: controllerMessageSummary(settled) };
  });
}

async function readArtifact(filePath, expectedType) {
  const code = expectedType === 'notification_failed' ? 'NOTIFICATION_RECEIPT_INVALID' : 'EVENT_INVALID';
  const value = await readJson(filePath, code);
  if (!isObject(value) || value.schemaVersion !== 1 || value.type !== expectedType || !nonEmpty(value.projectKey) || !isSafeThreadId(value.threadId) || !isSafeThreadId(value.parentThreadId) || !isSafeThreadId(value.controllerThreadId) || !isTimestamp(value.createdAt)) fail(code, '事件身份或时间字段无效');
  if (['task_progress', 'task_completed', ...FAILURE_EVENT_TYPES].includes(expectedType) && value.parentNotification !== undefined) validateParentNotificationEnvelope(value.parentNotification);
  if (expectedType === 'task_progress' && (!nonEmpty(value.summary) || !Number.isInteger(value.attemptCount) || value.attemptCount < 1)) fail(code, 'progress event summary 或 attemptCount 无效');
  if (expectedType === 'task_completed' && value.attemptCount !== undefined && (!Number.isInteger(value.attemptCount) || value.attemptCount < 1)) fail(code, 'completion event attemptCount 无效');
  if (expectedType === 'task_completed' && value.resultManifest !== undefined && !isObject(value.resultManifest)) fail(code, 'completion event resultManifest 无效');
  if (expectedType === 'task_progress' && value.stageId !== undefined && value.stageId !== null && !nonEmpty(value.stageId)) fail(code, 'progress event stageId 无效');
  if (expectedType === 'task_progress' && value.evidence !== undefined && !Array.isArray(value.evidence)) fail(code, 'progress event evidence 无效');
  if (expectedType === 'incidental_repair' && (!Number.isInteger(value.attemptCount) || value.attemptCount < 1 || !isSafeThreadId(value.repairId))) fail(code, '附带修复 event attemptCount 或 repairId 无效');
  if (expectedType === 'notification_failed' && (!isSafeThreadId(value.actionId) || !nonEmpty(value.sourceEventPath) || !nonEmpty(value.reason))) fail(code, 'notification_failed 缺少 idle-send action、来源事件或原因');
  if (FAILURE_EVENT_TYPES.includes(expectedType)) {
    if (!Number.isInteger(value.attemptCount) || value.attemptCount < 1 || !nonEmpty(value.attemptedStage) || !has(value.failureClass, FAILURE_CLASSES.filter((entry) => entry !== 'unclassified')) || !has(value.failureDomain, FAILURE_DOMAINS) || !nonEmpty(value.commandSummary) || !Array.isArray(value.evidence) || value.evidence.length === 0 || typeof value.mechanicalRetryEligible !== 'boolean' || !has(value.authority ?? 'contract_evidence', FAILURE_AUTHORITIES) || (value.failureMode !== undefined && !has(value.failureMode, EVIDENCE_FAILURE_MODES)) || (value.recoveryExhausted !== undefined && typeof value.recoveryExhausted !== 'boolean')) fail(code, 'failure event 字段无效');
  }
  return value;
}

export async function controllerIngestFailure(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  const expectedType = input.eventType;
  if (!FAILURE_EVENT_TYPES.includes(expectedType)) fail('CLI_INVALID_ARGUMENTS', 'eventType 必须是 task_failed 或 task_blocked');
  const event = await readArtifact(input.eventPath, expectedType);
  if (event.projectKey !== paths.projectKey) fail('PROJECT_MISMATCH', 'failure event projectKey 不匹配');
  return mutateController({ codexHome: input.codexHome, taskControlHome: input.taskControlHome, projectRoot: input.projectRoot, controllerThreadId: input.controllerThreadId, threadId: event.threadId, heartbeatReason: 'failure', mutate: async (task) => {
    if (event.parentThreadId !== task.parentThreadId || event.controllerThreadId !== task.directControllerThreadId) fail('EVENT_INVALID', 'failure event parent/controller 不匹配');
    if (task.status !== 'executing' || !currentAttemptDispatched(task) || event.attemptCount !== task.attemptCount) fail('EVENT_STALE', 'failure event 不属于当前执行轮次');
    const freshnessAnchor = latestTimestamp(task.failureEventCreatedAt, task.progressEventCreatedAt, task.lastDispatchedAt) ?? task.updatedAt;
    if (Date.parse(event.createdAt) <= Date.parse(freshnessAnchor)) fail('EVENT_STALE', 'failure event 过期或重复');
    await assertImplementationContractCurrent(task, input.projectRoot);
    assertEventContractMatches(task, event);
    const authority = event.authority ?? 'contract_evidence';
    let evidenceCommandId = nonEmpty(event.evidenceCommandId) ? event.evidenceCommandId.trim() : null;
    let failureMode = event.failureMode ?? 'blocking';
    let evidenceClass = event.evidenceClass ?? null;
    const recoveryExhausted = event.recoveryExhausted === true;
    if (implementationTask(task) && authority === 'contract_evidence') {
      if (!task.stageGates.some((gate) => gate.id === event.attemptedStage)) fail('STAGE_UNKNOWN', `未登记的 attemptedStage: ${event.attemptedStage}`);
      const knownEvidence = new Map(task.evidenceCommands.map((entry) => [entry.id, entry]));
      if (evidenceCommandId === null && event.authority === undefined && event.evidence.length === 1 && knownEvidence.has(event.evidence[0].id)) evidenceCommandId = event.evidence[0].id;
      if (evidenceCommandId === null || !knownEvidence.has(evidenceCommandId)) fail('FAILURE_COMMAND_NOT_CONTRACT_BOUND', '权威失败事件必须绑定合同 evidenceCommandId');
      failureMode = knownEvidence.get(evidenceCommandId).failureMode ?? 'blocking';
      evidenceClass = knownEvidence.get(evidenceCommandId).evidenceClass ?? null;
      if (failureMode === 'advisory' || (failureMode === 'recoverable' && !recoveryExhausted)) fail('FAILURE_AUTHORITY_INVALID', 'advisory 或尚未穷尽恢复的 recoverable evidence 不得停止任务');
    }
    const failureRecord = { type: expectedType, authority, evidenceCommandId, failureMode, evidenceClass, recoveryExhausted, attemptedStage: event.attemptedStage, failureClass: event.failureClass, failureDomain: event.failureDomain, commandSummary: event.commandSummary.trim(), evidence: normalizeEvidenceReferences(event.evidence), mechanicalRetryEligible: event.mechanicalRetryEligible, attemptCount: task.attemptCount, createdAt: event.createdAt };
    if (authority === 'non_authoritative_diagnostic') {
      return appendObservabilityReceipt({ ...task, failureHistory: [...task.failureHistory, failureRecord], updatedAt: new Date().toISOString() }, 'failure_diagnostic_ingested', event.createdAt);
    }
    const reason = `${event.failureDomain}/${event.failureClass}: ${event.commandSummary.trim()}`;
    return appendObservabilityReceipt({ ...task, failureHistory: [...task.failureHistory, failureRecord], status: 'changes_requested', executionStatus: 'stopped', nextOwner: 'undecided', failureClass: event.failureClass, changesRequestedReason: reason, reviewVerdict: 'changes_requested', notificationStatus: notificationStatusAfterIngest(event), failureEventCreatedAt: event.createdAt, executionEndedAt: event.createdAt, updatedAt: new Date().toISOString() }, 'failure_ingested', event.createdAt);
  }});
}

export async function controllerIngestProgress(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  const event = await readArtifact(input.eventPath, 'task_progress');
  if (event.projectKey !== paths.projectKey || !nonEmpty(event.summary) || !Number.isInteger(event.attemptCount) || event.attemptCount < 1) fail('EVENT_INVALID', 'progress event 项目、summary 或 attemptCount 无效');
  return mutateController({ codexHome: input.codexHome, taskControlHome: input.taskControlHome, projectRoot: input.projectRoot, controllerThreadId: input.controllerThreadId, threadId: event.threadId, heartbeatReason: 'progress', mutate: async (task) => {
    if (event.parentThreadId !== task.parentThreadId || event.controllerThreadId !== task.directControllerThreadId) fail('EVENT_INVALID', 'progress event parent/controller 不匹配');
    if (task.status !== 'executing' || !currentAttemptDispatched(task) || event.attemptCount !== task.attemptCount) fail('EVENT_STALE', 'progress event 不属于当前执行轮次');
    const freshnessAnchor = latestTimestamp(task.progressEventCreatedAt, task.lastDispatchedAt) ?? task.updatedAt;
    if (Date.parse(event.createdAt) <= Date.parse(freshnessAnchor)) fail('EVENT_STALE', 'progress event 过期或重复');
    await assertImplementationContractCurrent(task, input.projectRoot);
    assertEventContractMatches(task, event);
    const checkpoint = validateStageCheckpoint(task, event.stageId, event.evidence ?? []);
    const stageProgress = implementationTask(task) ? [...task.stageProgress, { ...checkpoint, summary: event.summary.trim(), attemptCount: task.attemptCount, createdAt: event.createdAt, contractDigest: task.contractDigest, contractVersion: contractVersion(task) }] : task.stageProgress;
    return appendObservabilityReceipt({ ...task, stageProgress, progressEventCreatedAt: event.createdAt, lastProgressSummary: event.summary.trim(), updatedAt: new Date().toISOString() }, 'progress_ingested', event.createdAt);
  }});
}

export async function controllerIngestIncidentalRepair(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  const event = await readArtifact(input.eventPath, 'incidental_repair');
  if (event.projectKey !== paths.projectKey) fail('PROJECT_MISMATCH', '附带修复 event projectKey 不匹配');
  return mutateController({ codexHome: input.codexHome, taskControlHome: input.taskControlHome, projectRoot: input.projectRoot, controllerThreadId: input.controllerThreadId, threadId: event.threadId, heartbeatReason: 'progress', mutate: async (task) => {
    if (task.status !== 'executing' || !currentAttemptDispatched(task) || event.attemptCount !== task.attemptCount) fail('EVENT_STALE', '附带修复 event 不属于当前执行轮次');
    if ((task.incidentalRepairs ?? []).some((repair) => repair.repairId === event.repairId)) fail('EVENT_STALE', `附带修复 ${event.repairId} 已入账`);
    const latestRepairAt = (task.incidentalRepairs ?? []).filter((repair) => repair.attemptCount === task.attemptCount).map((repair) => repair.createdAt).sort().at(-1);
    if (latestRepairAt && Date.parse(event.createdAt) <= Date.parse(latestRepairAt)) fail('EVENT_STALE', '附带修复 event 过期或顺序无效');
    await assertImplementationContractCurrent(task, input.projectRoot);
    const repair = validateIncidentalRepairReceipt(event, task);
    return appendObservabilityReceipt({ ...task, incidentalRepairs: [...task.incidentalRepairs, repair], incidentalRepairEventCreatedAt: event.createdAt, updatedAt: new Date().toISOString() }, 'incidental_repair_ingested', event.createdAt);
  }});
}

export async function controllerIngestCompletion(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  const event = await readArtifact(input.eventPath, 'task_completed');
  if (event.projectKey !== paths.projectKey) fail('PROJECT_MISMATCH', 'completion event projectKey 不匹配');
  if (event.status !== 'awaiting_review' || !nonEmpty(event.candidateCommit)) fail('EVENT_INVALID', 'completion event 必须是 awaiting_review 且有 candidateCommit');
  return mutateController({ codexHome: input.codexHome, taskControlHome: input.taskControlHome, projectRoot: input.projectRoot, controllerThreadId: input.controllerThreadId, threadId: event.threadId, heartbeatReason: 'completion', mutate: async (task) => {
    if (event.parentThreadId !== task.parentThreadId || event.controllerThreadId !== task.directControllerThreadId) fail('EVENT_INVALID', 'completion event parent/controller 不匹配');
    if (!currentAttemptDispatched(task)) fail('EVENT_STALE', '当前轮任务尚未登记真实派发');
    if (event.attemptCount !== undefined && event.attemptCount !== task.attemptCount) fail('EVENT_STALE', 'completion event 不属于当前执行轮次');
    const freshnessAnchor = latestTimestamp(task.completionEventCreatedAt, task.progressEventCreatedAt, task.lastDispatchedAt) ?? task.updatedAt;
    if (Date.parse(event.createdAt) <= Date.parse(freshnessAnchor)) fail('EVENT_STALE', 'completion event 过期或重复');
    if (task.status !== 'executing') fail('EVENT_STALE', `不能从 ${task.status} 入账 completion event`);
    if (task.candidateCommit === event.candidateCommit) fail('EVENT_STALE', '新一轮执行必须产生新 candidateCommit');
    await assertImplementationContractCurrent(task, input.projectRoot);
    assertEventContractMatches(task, event);
    const missingStages = missingRequiredStageIds(task);
    if (missingStages.length > 0) fail('REQUIRED_STAGE_INCOMPLETE', `完成前仍缺少 required stage: ${missingStages.join(', ')}`);
    if (implementationTask(task)) {
      const completedStages = completedStageIds(task);
      if (!Array.isArray(event.completedStages) || !Array.isArray(event.missingStages) || event.missingStages.length > 0 || JSON.stringify(event.completedStages) !== JSON.stringify(completedStages)) fail('EVENT_CONTRACT_MISMATCH', 'completion event 阶段摘要与台账不一致');
    }
    const pendingRepairs = await pendingIncidentalRepairs(paths, task, event.createdAt);
    if (pendingRepairs.length > 0) fail('INCIDENTAL_REPAIR_INGEST_REQUIRED', `完成入账前必须先按时间顺序入账附带修复: ${pendingRepairs.map((repair) => repair.repairId).join(', ')}`);
    let deliverableHistory = task.deliverableHistory;
    let controlPlaneRecovery = task.controlPlaneRecovery ?? null;
    if (task.resultProtocolVersion === RESULT_PROTOCOL_VERSION) {
      if (!isObject(event.resultManifest) || !nonEmpty(event.resultManifest.resultManifestPath)) fail('RESULT_MANIFEST_REQUIRED', 'result protocol completion event 缺少成果包快照');
      const currentResult = await loadResultManifest(input.projectRoot, event.resultManifest.resultManifestPath, task, event.candidateCommit);
      if (currentResult.resultManifestDigest !== event.resultManifest.resultManifestDigest || JSON.stringify(currentResult) !== JSON.stringify(event.resultManifest)) fail('RESULT_MANIFEST_DRIFT', 'completion event 的成果包快照与当前文件不一致');
      if (controlPlaneRecovery?.status === 'completion_only') {
        if (event.candidateCommit !== controlPlaneRecovery.candidateCommit || currentResult.resultManifestPath.toLowerCase() !== controlPlaneRecovery.resultManifestPath.toLowerCase() || currentResult.resultManifestDigest !== controlPlaneRecovery.resultManifestDigest) fail('CONTROL_PLANE_RECOVERY_CANDIDATE_DRIFT', 'completion event 不再匹配冻结的控制面恢复候选');
        controlPlaneRecovery = { ...controlPlaneRecovery, status: 'completed', completedAt: event.createdAt };
      }
      if (deliverableHistory.some((entry) => entry.attempt === task.attemptCount || entry.resultManifestDigest === currentResult.resultManifestDigest)) fail('RESULT_MANIFEST_REPLAY', '当前 attempt 或 result manifest 已入账');
      deliverableHistory = [...deliverableHistory, { ...currentResult, recordedAt: event.createdAt, reviewStatus: 'pending', reviewReason: null, selectedArtifactIds: [], reviewedAt: null, deliveryStatus: 'candidate' }];
    } else if (event.resultManifest !== undefined) {
      fail('RESULT_MANIFEST_NOT_APPLICABLE', 'legacy completion event 不得伪造 result manifest');
    }
    return appendObservabilityReceipt({ ...task, controlPlaneRecovery, deliverableHistory, status: 'awaiting_review', executionStatus: 'awaiting_review', nextOwner: 'controller', candidateCommit: event.candidateCommit, completionEventCreatedAt: event.createdAt, executionEndedAt: event.createdAt, reviewVerdict: 'pending', integrationStatus: 'not_integrated', notificationStatus: notificationStatusAfterIngest(event), updatedAt: new Date().toISOString() }, 'completion_ingested', event.createdAt);
  }});
}

export async function controllerMarkNotificationSent(input) {
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task) => {
    if (task.notificationStatus !== 'pending') fail('NOTIFICATION_ALREADY_RECORDED', `notificationStatus 已是 ${task.notificationStatus}`);
    if (!nonEmpty(input.hostReceipt)) fail('NOTIFICATION_RECEIPT_REQUIRED', '标记 sent 必须记录真实 host receipt');
    const now = new Date().toISOString();
    return { ...task, notificationStatus: 'sent', notificationReceipt: input.hostReceipt.trim(), notificationSentAt: now, updatedAt: now };
  }});
}

export async function controllerIngestNotificationFailed(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  const receipt = await readArtifact(input.receiptPath, 'notification_failed');
  if (receipt.projectKey !== paths.projectKey || !nonEmpty(receipt.reason)) fail('NOTIFICATION_RECEIPT_INVALID', 'notification_failed 项目或 reason 无效');
  const sourceType = artifactTypeForPath(receipt.sourceEventPath);
  if (!['task_progress', 'task_completed', ...FAILURE_EVENT_TYPES].includes(sourceType)) fail('NOTIFICATION_RECEIPT_INVALID', 'notification_failed 来源不是可通知的 worker 事件');
  const sourceEvent = await readArtifact(receipt.sourceEventPath, sourceType);
  if (sourceEvent.projectKey !== receipt.projectKey || sourceEvent.threadId !== receipt.threadId || sourceEvent.parentThreadId !== receipt.parentThreadId || sourceEvent.controllerThreadId !== receipt.controllerThreadId || sourceEvent.parentNotification?.disposition !== 'prepared' || sourceEvent.parentNotification.actionId !== receipt.actionId) fail('NOTIFICATION_RECEIPT_INVALID', 'notification_failed 未绑定同一任务的已持久化 idle-send action');
  return mutateController({ codexHome: input.codexHome, taskControlHome: input.taskControlHome, projectRoot: input.projectRoot, controllerThreadId: input.controllerThreadId, threadId: receipt.threadId, heartbeatReason: 'reconcile', mutate: (task) => {
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
    .filter((entry) => entry.isFile() && (entry.name.startsWith('completion-') || entry.name.startsWith('progress-') || entry.name.startsWith('incidental-repair-') || entry.name.startsWith('task-failed-') || entry.name.startsWith('task-blocked-') || entry.name.startsWith('notification-failed-')) && entry.name.endsWith('.json'))
    .map((entry) => join(taskEventDir, entry.name));
}

function artifactTypeForPath(eventPath) {
  const name = basename(eventPath);
  if (name.startsWith('completion-')) return 'task_completed';
  if (name.startsWith('progress-')) return 'task_progress';
  if (name.startsWith('incidental-repair-')) return 'incidental_repair';
  if (name.startsWith('task-failed-')) return 'task_failed';
  if (name.startsWith('task-blocked-')) return 'task_blocked';
  if (name.startsWith('notification-failed-')) return 'notification_failed';
  fail('EVENT_INVALID', `未知事件文件: ${eventPath}`);
}

function eventFreshnessAnchor(task, type) {
  if (type === 'notification_failed') return task.completionEventCreatedAt ?? task.updatedAt;
  if (type === 'task_progress') return latestTimestamp(task.progressEventCreatedAt, task.lastDispatchedAt) ?? task.updatedAt;
  if (type === 'incidental_repair') return latestTimestamp(task.incidentalRepairEventCreatedAt, task.lastDispatchedAt) ?? task.updatedAt;
  if (FAILURE_EVENT_TYPES.includes(type)) return latestTimestamp(task.failureEventCreatedAt, task.progressEventCreatedAt, task.lastDispatchedAt) ?? task.updatedAt;
  return latestTimestamp(task.completionEventCreatedAt, task.progressEventCreatedAt, task.lastDispatchedAt) ?? task.updatedAt;
}

function heartbeatRruleCount(value) {
  if (!nonEmpty(value)) return null;
  const match = /(?:^|;)COUNT=(\d+)(?:;|$)/i.exec(value.trim());
  return match ? Number(match[1]) : null;
}

function controllerBusinessFingerprint(registry, controllerThreadId, pendingEvents, parallel) {
  const tasks = registry.tasks
    .filter((task) => task.directControllerThreadId === controllerThreadId)
    .map((task) => ({ threadId: task.threadId, status: task.status, executionStatus: task.executionStatus, attemptCount: task.attemptCount, lastDispatchedAt: task.lastDispatchedAt ?? null, progressEventCreatedAt: task.progressEventCreatedAt ?? null, incidentalRepairEventCreatedAt: task.incidentalRepairEventCreatedAt ?? null, failureEventCreatedAt: task.failureEventCreatedAt ?? null, controlPlaneRecoveryStatus: task.controlPlaneRecovery?.status ?? null, completionEventCreatedAt: task.completionEventCreatedAt ?? null, candidateCommit: task.candidateCommit ?? null, reviewVerdict: task.reviewVerdict, integrationStatus: task.integrationStatus, notificationStatus: task.notificationStatus }))
    .sort((left, right) => left.threadId.localeCompare(right.threadId));
  const events = pendingEvents.map((event) => ({ type: event.type, threadId: event.threadId, createdAt: event.createdAt, eventPath: event.eventPath })).sort((left, right) => left.eventPath.localeCompare(right.eventPath));
  const messages = registry.controllerMessages
    .filter((message) => message.controllerThreadId === controllerThreadId)
    .map((message) => ({ messageId: message.messageId, status: message.status, updatedAt: message.updatedAt }))
    .sort((left, right) => left.messageId.localeCompare(right.messageId));
  const batches = parallel.batches.map((batch) => ({ batchId: batch.batchId, status: batch.status, dispatchWaveId: batch.dispatchWaveId, pendingDispatchCandidateIds: batch.pendingDispatchCandidateIds, candidateStates: batch.candidateStates.map((candidate) => ({ candidateId: candidate.candidateId, state: candidate.state, threadId: candidate.threadId })) })).sort((left, right) => left.batchId.localeCompare(right.batchId));
  return createHash('sha256').update(JSON.stringify({ tasks, events, messages, batches })).digest('hex');
}

function heartbeatCycleReceiptKey(input) {
  return [input.heartbeatGeneration, input.heartbeatAutomationId, input.heartbeatOccurrence ?? 'unknown', input.heartbeatFiredAt ?? 'unknown'].join(':');
}

async function recordHeartbeatCycleEvidence(input, fingerprint) {
  return mutateControllerHeartbeat(input, async (state) => {
    const requestedGeneration = Number(input.heartbeatGeneration);
    if (state.status !== 'armed' || state.generation !== requestedGeneration || state.automationId !== input.heartbeatAutomationId) fail('HEARTBEAT_ACTION_STALE', 'watchdog cycle 身份已变化');
    const receiptKey = heartbeatCycleReceiptKey(input);
    if (state.lastCycleReceiptKey === receiptKey) return { state, output: { recorded: false, duplicate: true, fuseOpened: false } };
    const now = isTimestamp(input.heartbeatFiredAt) ? input.heartbeatFiredAt : new Date().toISOString();
    const baseline = state.lastCycleFingerprint === null;
    const businessChanged = !baseline && state.lastCycleFingerprint !== fingerprint;
    const consecutiveNoProgressCycles = baseline || businessChanged ? 0 : state.consecutiveNoProgressCycles + 1;
    const fuseOpened = state.disabledAt === null && consecutiveNoProgressCycles >= HEARTBEAT_NO_PROGRESS_LIMIT;
    const nextState = {
      ...state,
      lastCycleFingerprint: fingerprint,
      lastCycleReceiptKey: receiptKey,
      lastMeaningfulProgressAt: baseline || businessChanged ? now : state.lastMeaningfulProgressAt,
      consecutiveNoProgressCycles,
      noProgressFuseCount: state.noProgressFuseCount + (fuseOpened ? 1 : 0),
      disabledAt: fuseOpened ? now : state.disabledAt,
      disableReason: fuseOpened ? `watchdog observed ${consecutiveNoProgressCycles} consecutive cycles without business progress` : state.disableReason,
      notificationStatus: fuseOpened && state.notificationStatus === 'not_required' ? 'pending' : state.notificationStatus,
      updatedAt: now,
    };
    return { state: nextState, output: { recorded: true, duplicate: false, baseline, businessChanged, consecutiveNoProgressCycles, fuseOpened } };
  });
}

async function recordHeartbeatObservation(input) {
  if (!isSafeThreadId(input.heartbeatAutomationId)) fail('CLI_INVALID_ARGUMENTS', 'heartbeat automation id 无效');
  const requestedGeneration = Number(input.heartbeatGeneration);
  if (!Number.isInteger(requestedGeneration) || requestedGeneration < 1) fail('CLI_INVALID_ARGUMENTS', 'heartbeat generation 必须是正整数');
  return mutateControllerHeartbeat(input, async (state) => {
    const now = isTimestamp(input.heartbeatFiredAt) ? input.heartbeatFiredAt : new Date().toISOString();
    const sameObservation = state.observedAutomationId === input.heartbeatAutomationId && state.observedGeneration === requestedGeneration;
    const observedTriggerCount = sameObservation ? state.observedTriggerCount + 1 : 1;
    const pendingObserved = state.pendingAction?.type === 'create_controller_heartbeat' && state.pendingAction.generation === requestedGeneration && (input.heartbeatActionId === undefined || input.heartbeatActionId === state.pendingAction.actionId);
    const validConfirmed = state.status === 'armed' && state.generation === requestedGeneration && state.automationId === input.heartbeatAutomationId;
    const stale = !pendingObserved && !validConfirmed;
    const consecutiveStaleCount = stale ? state.consecutiveStaleCount + 1 : 0;
    const fuseOpen = stale && consecutiveStaleCount >= HEARTBEAT_STALE_LIMIT;
    return {
      state: {
        ...state,
        observedAutomationId: input.heartbeatAutomationId,
        observedGeneration: requestedGeneration,
        observedTriggerCount,
        lastTriggeredAt: now,
        consecutiveStaleCount,
        lastStaleGeneration: stale ? requestedGeneration : null,
        lastStaleAt: stale ? now : null,
        disabledAt: fuseOpen ? now : state.disabledAt,
        disableReason: fuseOpen ? `stale generation ${requestedGeneration} triggered ${consecutiveStaleCount} consecutive times` : state.disableReason,
        notificationStatus: fuseOpen && state.notificationStatus === 'not_required' ? 'pending' : state.notificationStatus,
        updatedAt: now,
      },
      output: { pendingObserved, validConfirmed, stale, observedTriggerCount, consecutiveStaleCount, fuseOpen },
    };
  });
}

function staleHeartbeatResult(registry, state, input, reason, extra = {}) {
  const automationId = isSafeThreadId(input.heartbeatAutomationId) ? input.heartbeatAutomationId : null;
  const requestedGeneration = Number(input.heartbeatGeneration);
  return {
    projectKey: registry.projectKey,
    controllerThreadId: input.controllerThreadId,
    staleHeartbeat: true,
    staleReason: reason,
    heartbeatState: state,
    currentGeneration: state?.generation ?? null,
    requestedGeneration: Number.isInteger(requestedGeneration) ? requestedGeneration : null,
    pendingEvents: [],
    reviewQueue: [],
    routingQueue: [],
    activeTasks: [],
    overdueTasks: [],
    pendingCleanupTasks: [],
    deferredCleanupTasks: [],
    deferredMessages: [],
    pendingMessageActions: [],
    staleDeferredMessages: [],
    threadActions: [],
    reportNeedsRefresh: false,
    needsControllerAttention: false,
    shouldKeepHeartbeat: false,
    heartbeatAction: automationId === null ? { type: 'stale_heartbeat_identity_required', generation: requestedGeneration } : { type: 'delete_stale_automation', actionId: `stale_${requestedGeneration}_${createHash('sha256').update(automationId).digest('hex').slice(0, 12)}`, automationId, generation: requestedGeneration, currentGeneration: state?.generation ?? null, timeoutMs: HEARTBEAT_ACTION_TIMEOUT_MS, reason, requiresSnapshotGeneration: requestedGeneration, onTimeout: 'controller-record-heartbeat-action-failed' },
    notificationRequired: state?.notificationStatus === 'pending',
    notificationText: state?.notificationStatus === 'pending' ? `Heartbeat 已熔断：automation=${automationId ?? 'unknown'} generation=${requestedGeneration} 连续 stale=${state.consecutiveStaleCount}。仅通知一次。` : null,
    ...extra,
  };
}

function stalledActiveTask(task, now = Date.now()) {
  const lastObservedAt = taskLastMeaningfulProgressAt(task);
  if (!isTimestamp(lastObservedAt)) return null;
  const intervalMs = heartbeatIntervalForTask(task);
  const stallAfterMs = Math.max(intervalMs * 2, 10 * 60 * 1000);
  const ageMs = now - Date.parse(lastObservedAt);
  if (ageMs < stallAfterMs) return null;
  const missingStages = missingRequiredStageIds(task);
  const reasons = ['lease_expired'];
  if (missingStages.length > 0) reasons.push('required_stage_not_advancing');
  const candidateCommit = task.candidateCommit ?? task.controlPlaneRecovery?.candidateCommit ?? null;
  if (!nonEmpty(candidateCommit) && !isTimestamp(task.completionEventCreatedAt)) reasons.push('no_candidate_or_completion');
  if (task.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION && ageMs >= task.objectiveBudgetMinutes * 60 * 1000) reasons.push('attempt_budget_exceeded');
  return { threadId: task.threadId, displayKey: task.displayKey, objectiveId: task.objectiveId, attemptCount: task.attemptCount, lastObservedAt, ageMs, stallAfterMs, missingStages, candidateCommit, completionEventCreatedAt: task.completionEventCreatedAt ?? null, reasons };
}

function activeTaskHealth(task, now = Date.now()) {
  const lastMeaningfulProgressAt = taskLastMeaningfulProgressAt(task);
  const intervalMs = heartbeatIntervalForTask(task);
  const ageMs = isTimestamp(lastMeaningfulProgressAt) ? Math.max(0, now - Date.parse(lastMeaningfulProgressAt)) : null;
  const stallAfterMs = Math.max(intervalMs * 2, 30 * 60 * 1000);
  const status = ageMs === null ? 'at_risk' : ageMs >= stallAfterMs ? 'stalled' : ageMs >= intervalMs ? 'at_risk' : 'healthy';
  return {
    threadId: task.threadId,
    displayKey: task.displayKey,
    workClass: task.workClass,
    thinking: task.thinking,
    status,
    lastMeaningfulProgressAt,
    ageMs,
    reviewIntervalMs: intervalMs,
    stallAfterMs,
    evidenceDefinition: 'new_stage_or_evidence_or_test_result_or_candidate_or_completion_or_failure_or_narrowed_blocker',
  };
}

function controllerTaskHealthReview({ directTasks, pendingEvents, reviewQueue, routingQueue, objectiveFuses, incidentQueue, taskQueues, parallel, now = Date.now() }) {
  const active = directTasks.filter((task) => task.status === 'executing' && currentAttemptDispatched(task)).map((task) => activeTaskHealth(task, now));
  const stalled = active.filter((task) => task.status === 'stalled');
  const atRisk = active.filter((task) => task.status === 'at_risk');
  const blockedUserTasks = directTasks.filter((task) => task.status === 'blocked' && task.blockerSource === 'external' && task.closeout !== null && !closeoutComplete(task));
  const controllerEvents = pendingEvents.filter((event) => event.type === 'task_completed' || FAILURE_EVENT_TYPES.includes(event.type));
  let status = 'healthy';
  const reasons = [];
  let recommendedAction = 'continue_silently';
  if (objectiveFuses.length > 0) {
    status = 'runaway';
    reasons.push('objective_retry_or_time_fuse_open');
    recommendedAction = 'freeze_new_dispatch_and_show_incident';
  } else if (blockedUserTasks.length > 0) {
    status = 'blocked_user';
    reasons.push('external_or_user_authority_required');
    recommendedAction = 'stop_confirm_notify_once_then_delete_heartbeat';
  } else if (stalled.length > 0) {
    status = 'stalled';
    reasons.push('meaningful_progress_deadline_exceeded');
    recommendedAction = 'freeze_new_dispatch_and_controller_review';
  } else if (routingQueue.length > 0 || reviewQueue.length > 0 || controllerEvents.length > 0 || incidentQueue.length > 0) {
    status = 'blocked_controller';
    reasons.push('controller_decision_or_review_required');
    recommendedAction = 'controller_resolve_before_more_dispatch';
  } else if (atRisk.length > 0) {
    status = 'at_risk';
    reasons.push('meaningful_progress_not_seen_by_normal_interval');
    recommendedAction = 'continue_and_recheck_sooner';
  } else if (active.length === 0) {
    status = 'idle';
    reasons.push('no_dispatched_active_task');
    recommendedAction = 'delete_heartbeat_when_queues_are_empty';
  }
  const riskState = ['at_risk', 'stalled', 'blocked_controller', 'blocked_user', 'runaway'].includes(status);
  const intervalMs = riskState ? HEARTBEAT_INTERVALS_MS.controller_risk : controllerHeartbeatInterval({ ...taskQueues, parallel }, now);
  return {
    protocolVersion: CONTROLLER_TASK_HEALTH_PROTOCOL_VERSION,
    evaluatedAt: new Date(now).toISOString(),
    status,
    reasons,
    recommendedAction,
    newDispatchAllowed: !['stalled', 'blocked_controller', 'blocked_user', 'runaway'].includes(status),
    intervalMs,
    nextHealthCheckAt: new Date(now + intervalMs).toISOString(),
    activeTasks: active,
    stalledTaskIds: stalled.map((task) => task.threadId),
    atRiskTaskIds: atRisk.map((task) => task.threadId),
    meaningfulProgressDefinition: ['new_stage', 'new_evidence', 'new_test_result', 'candidate_commit', 'completion_or_failure_event', 'narrowed_blocker'],
    ignoredAsProgress: ['repeated_command', 'rephrased_same_error', 'still_working_text', 'heartbeat_bookkeeping', 'title_or_archive_bookkeeping'],
  };
}

function incidentSummary(task) {
  return { threadId: task.threadId, displayKey: task.displayKey, objectiveId: task.objectiveId, status: task.status, closeout: task.closeout, latestFailure: task.failureHistory.at(-1) ?? null };
}

export async function controllerScanPendingEvents(input) {
  const home = resolveTaskControlHome(input);
  const paths = pathsFor(home, input.projectRoot);
  assertSafeThreadId(input.controllerThreadId, 'controllerThreadId');
  if (input.heartbeatAutomationId !== undefined) await recordHeartbeatObservation(input);
  const rawRegistry = validateRegistry(await readJson(paths.registryPath, 'REGISTRY_READ_FAILED'), paths.projectKey, paths.projectRoot);
  const registry = { ...rawRegistry, tasks: ensureTaskControls(rawRegistry.tasks, rawRegistry.rootControllerThreadIds) };
  const controllerKnown = registry.rootControllerThreadIds.includes(input.controllerThreadId) || registry.tasks.some((task) => task.threadId === input.controllerThreadId);
  if (!controllerKnown) fail('CONTROLLER_UNAUTHORIZED', 'controllerThreadId 未登记为项目主控或父任务');

  const heartbeatValue = registry.controllerHeartbeats.find((heartbeat) => heartbeat.controllerThreadId === input.controllerThreadId) ?? null;
  let heartbeatState = heartbeatValue === null ? null : heartbeatEvidenceDefaults(heartbeatValue);
  if (input.heartbeatGeneration !== undefined) {
    const requestedGeneration = Number(input.heartbeatGeneration);
    if (!Number.isInteger(requestedGeneration) || requestedGeneration < 1) fail('CLI_INVALID_ARGUMENTS', 'heartbeat generation 必须是正整数');
    if (heartbeatState?.pendingAction?.type === 'create_controller_heartbeat' && heartbeatState.pendingAction.generation === requestedGeneration && (input.heartbeatActionId === undefined || input.heartbeatActionId === heartbeatState.pendingAction.actionId)) {
      return staleHeartbeatResult(registry, heartbeatState, input, 'pending_create_observed', { staleHeartbeat: false, pendingHeartbeat: true, heartbeatAction: { type: 'confirm_observed_heartbeat', actionId: heartbeatState.pendingAction.actionId, automationId: input.heartbeatAutomationId ?? null, generation: requestedGeneration, command: 'controller-confirm-heartbeat-action --observed true' } });
    }
    if (heartbeatState?.pendingAction?.manualOnly === true) {
      return staleHeartbeatResult(registry, heartbeatState, input, 'watchdog_manual_cleanup_required', { staleHeartbeat: false, pendingHeartbeat: true, heartbeatAction: heartbeatActionForPending(heartbeatState, heartbeatState.pendingAction), notificationRequired: heartbeatState.notificationStatus === 'pending' });
    }
    if (heartbeatState !== null && heartbeatState.pendingAction !== null && Date.now() > Date.parse(heartbeatState.pendingAction.expiresAt)) {
      return staleHeartbeatResult(registry, heartbeatState, input, 'pending_action_timeout', { staleHeartbeat: false, pendingHeartbeat: true, heartbeatAction: { type: 'compensate_timed_out_heartbeat_action', actionId: heartbeatState.pendingAction.actionId, automationId: heartbeatState.pendingAction.previousAutomationId, generation: heartbeatState.pendingAction.generation, timeoutMs: HEARTBEAT_ACTION_TIMEOUT_MS, command: 'controller-record-heartbeat-action-failed --reason host_timeout' } });
    }
    if (heartbeatState?.disabledAt !== null && heartbeatState?.disabledAt !== undefined) {
      return staleHeartbeatResult(registry, heartbeatState, input, 'watchdog_disabled', { heartbeatAction: { type: 'manual_heartbeat_cleanup_required', automationId: input.heartbeatAutomationId ?? heartbeatState.automationId, generation: requestedGeneration, automaticRetry: false, reason: heartbeatState.disableReason }, notificationRequired: heartbeatState.notificationStatus === 'pending' });
    }
    if (heartbeatState === null || heartbeatState.status !== 'armed' || heartbeatState.generation !== requestedGeneration) {
      return staleHeartbeatResult(registry, heartbeatState, input, 'generation_mismatch');
    }
    if (isSafeThreadId(input.heartbeatAutomationId) && heartbeatState.automationId !== null && input.heartbeatAutomationId !== heartbeatState.automationId) {
      return staleHeartbeatResult(registry, heartbeatState, input, 'automation_id_mismatch');
    }
    const rruleCount = heartbeatRruleCount(input.heartbeatRrule);
    const occurrence = input.heartbeatOccurrence === undefined ? null : Number(input.heartbeatOccurrence);
    if (occurrence !== null && (!Number.isInteger(occurrence) || occurrence < 1)) fail('CLI_INVALID_ARGUMENTS', 'heartbeat occurrence 必须是正整数');
    if (rruleCount !== null && rruleCount !== HEARTBEAT_MAX_OCCURRENCES) {
      return staleHeartbeatResult(registry, heartbeatState, input, 'rrule_count_misconfigured', { configuredCount: rruleCount, expectedCount: HEARTBEAT_MAX_OCCURRENCES });
    }
    if ((occurrence !== null && occurrence > HEARTBEAT_MAX_OCCURRENCES) || heartbeatState.observedTriggerCount > HEARTBEAT_MAX_OCCURRENCES) {
      return staleHeartbeatResult(registry, heartbeatState, input, 'one_shot_exhausted', { observedTriggerCount: heartbeatState.observedTriggerCount, expectedCount: HEARTBEAT_MAX_OCCURRENCES });
    }
    const firedAt = isTimestamp(input.heartbeatFiredAt) ? Date.parse(input.heartbeatFiredAt) : Date.now();
    const expiryGraceMs = Math.max(2 * 60 * 1000, heartbeatState.intervalMs ?? 0);
    if (isTimestamp(heartbeatState.dueAt) && firedAt > Date.parse(heartbeatState.dueAt) + expiryGraceMs) {
      return staleHeartbeatResult(registry, heartbeatState, input, 'one_shot_expired', { expiresAt: new Date(Date.parse(heartbeatState.dueAt) + expiryGraceMs).toISOString() });
    }
  }

  const directTasks = registry.tasks.filter((task) => task.directControllerThreadId === input.controllerThreadId);
  const pendingEvents = [];
  for (const task of directTasks) {
    for (const eventPath of await listTaskEventFiles(paths, task)) {
      const type = artifactTypeForPath(eventPath);
      const artifact = await readArtifact(eventPath, type);
      if (artifact.projectKey !== paths.projectKey || artifact.threadId !== task.threadId || artifact.parentThreadId !== task.parentThreadId || artifact.controllerThreadId !== task.directControllerThreadId) {
        fail('EVENT_INVALID', `事件身份与台账不一致: ${eventPath}`);
      }
      const freshnessAnchor = eventFreshnessAnchor(task, type);
      if (Date.parse(artifact.createdAt) <= Date.parse(freshnessAnchor)) continue;
      if (type === 'task_completed' && task.status !== 'executing') continue;
      if (type === 'task_completed' && artifact.attemptCount !== undefined && artifact.attemptCount !== task.attemptCount) continue;
      if (type === 'task_progress' && (task.status !== 'executing' || artifact.attemptCount !== task.attemptCount)) continue;
      if (type === 'incidental_repair' && (task.status !== 'executing' || artifact.attemptCount !== task.attemptCount)) continue;
      if (FAILURE_EVENT_TYPES.includes(type) && (task.status !== 'executing' || artifact.attemptCount !== task.attemptCount)) continue;
      if (type === 'notification_failed' && task.notificationStatus !== 'pending') continue;
      pendingEvents.push({ type, eventPath, threadId: task.threadId, parentThreadId: task.parentThreadId, createdAt: artifact.createdAt, ...(artifact.parentNotification === undefined ? {} : { parentNotification: artifact.parentNotification }), ...contractSummary(task), ...(type === 'task_completed' ? { candidateCommit: artifact.candidateCommit } : type === 'task_progress' ? { attemptCount: artifact.attemptCount, summary: artifact.summary, stageId: artifact.stageId ?? null, evidence: artifact.evidence ?? [] } : type === 'incidental_repair' ? { attemptCount: artifact.attemptCount, repairId: artifact.repairId, originalBlocker: artifact.originalBlocker, sameObjectiveReason: artifact.sameObjectiveReason, functionalDomain: artifact.functionalDomain, affectedFiles: artifact.affectedFiles, conflictDomains: artifact.conflictDomains, riskAssessment: artifact.riskAssessment, redEvidence: artifact.redEvidence, greenEvidence: artifact.greenEvidence } : FAILURE_EVENT_TYPES.includes(type) ? { attemptCount: artifact.attemptCount, attemptedStage: artifact.attemptedStage, failureClass: artifact.failureClass, failureDomain: artifact.failureDomain, commandSummary: artifact.commandSummary, evidenceCommandId: artifact.evidenceCommandId ?? null, authority: artifact.authority ?? 'contract_evidence', evidence: artifact.evidence, mechanicalRetryEligible: artifact.mechanicalRetryEligible } : { reason: artifact.reason }) });
    }
  }
  pendingEvents.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.eventPath.localeCompare(right.eventPath));
  const now = Date.now();
  const activeTaskRecords = directTasks.filter((task) => task.status === 'executing' && currentAttemptDispatched(task));
  const activeTasks = activeTaskRecords.map((task) => {
    const intervalMs = heartbeatIntervalForTask(task);
    const lastObservedAt = taskLastMeaningfulProgressAt(task);
    return { threadId: task.threadId, displayKey: task.displayKey, status: task.status, executionStatus: task.executionStatus, attemptCount: task.attemptCount, notificationStatus: task.notificationStatus, lastObservedAt, heartbeatIntervalMs: intervalMs, heartbeatDueAt: new Date(Date.parse(lastObservedAt) + intervalMs).toISOString() };
  });
  const overdueTasks = activeTasks.filter((task) => Date.parse(task.heartbeatDueAt) <= now);
  const stalledActiveTasks = activeTaskRecords.map((task) => stalledActiveTask(task, now)).filter(Boolean);
  const zombieAttempts = directTasks.filter((task) => task.status === 'executing' && Number.isInteger(task.lastDispatchedAttempt) && task.attemptCount > task.lastDispatchedAttempt).map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, attemptCount: task.attemptCount, lastDispatchedAttempt: task.lastDispatchedAttempt, recoveryCommand: 'controller-recover-undispatched-attempt' }));
  const preparedReworks = directTasks.filter((task) => task.pendingRework !== null).map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, ...task.pendingRework }));
  const reviewQueue = directTasks.filter((task) => task.status === 'awaiting_review' || task.status === 'accepted').map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, status: task.status, candidateCommit: task.candidateCommit, notificationStatus: task.notificationStatus, ...contractSummary(task) }));
  const routingQueue = directTasks.filter((task) => task.status === 'changes_requested').map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, status: task.status, executionStatus: task.executionStatus, nextOwner: task.nextOwner, failureClass: task.failureClass }));
  const objectiveIds = [...new Set(directTasks.filter((task) => task.objectiveProtocolVersion === OBJECTIVE_PROTOCOL_VERSION).map((task) => task.objectiveId))];
  const objectiveFuses = objectiveIds.map((objectiveId) => objectiveRuntime(registry.tasks, objectiveId, now)).filter((runtime) => runtime.fuseOpen);
  const incidentQueue = directTasks.filter((task) => task.closeout !== null && !closeoutComplete(task)).map(incidentSummary);
  const contextHealth = controllerHealthFor(registry, input.controllerThreadId);
  const checkpointState = checkpointPointerFor(registry, input.controllerThreadId);
  const handoffState = preparedHandoffFor(registry, input.controllerThreadId) ?? acceptedHandoffFor(registry, input.controllerThreadId);
  const cleanupDebtTasks = directTasks.filter((task) => isTerminalTask(task) && task.archiveStatus !== 'archived').map((task) => ({ threadId: task.threadId, displayKey: task.displayKey, status: task.status, archiveStatus: task.archiveStatus, actionability: cleanupActionability(task, registry.tasks) }));
  const pendingCleanupTasks = cleanupDebtTasks.filter((task) => task.actionability === 'actionable');
  const deferredCleanupTasks = cleanupDebtTasks.filter((task) => task.actionability !== 'actionable');
  const threadActions = directTasks.flatMap((task) => threadActionsForTask(task, registry.tasks));
  const directMessages = registry.controllerMessages.filter((message) => message.controllerThreadId === input.controllerThreadId);
  const deferredMessages = directMessages.filter((message) => message.status === 'deferred_local').map(controllerMessageSummary);
  const pendingMessageActions = directMessages.filter((message) => message.status === 'prepared').map(controllerMessageSummary);
  const staleDeferredMessages = deferredMessages.filter((message) => {
    const target = registry.tasks.find((task) => task.threadId === message.targetThreadId);
    return target === undefined || target.status !== 'executing' || target.executionStatus !== 'running';
  });
  const taskQueues = controllerWorkQueues(registry.tasks, input.controllerThreadId);
  const parallel = controllerParallelRuntime(registry, input.controllerThreadId);
  const taskHealthReview = controllerTaskHealthReview({ directTasks, pendingEvents, reviewQueue, routingQueue, objectiveFuses, incidentQueue, taskQueues, parallel, now });
  const taskHealthNeedsAttention = ['stalled', 'blocked_controller', 'blocked_user', 'runaway'].includes(taskHealthReview.status);
  let cycleEvidence = null;
  if (input.heartbeatGeneration !== undefined && isSafeThreadId(input.heartbeatAutomationId)) {
    const fingerprint = controllerBusinessFingerprint(registry, input.controllerThreadId, pendingEvents, parallel);
    cycleEvidence = await recordHeartbeatCycleEvidence(input, fingerprint);
    heartbeatState = cycleEvidence.heartbeatState;
  }
  const watchdogFused = heartbeatState?.disabledAt !== null && heartbeatState?.disabledAt !== undefined;
  const queues = { ...taskQueues, shouldKeepHeartbeat: (taskQueues.shouldKeepHeartbeat || parallel.shouldKeepHeartbeat) && !watchdogFused };
  const reportNeedsRefresh = await deliveryReportNeedsRefresh(paths, input.controllerThreadId, registry.updatedAt);
  const heartbeatAction = cycleEvidence?.fuseOpened === true ? { type: 'controller_finalize_cycle', automationId: heartbeatState.automationId, generation: heartbeatState.generation, command: 'controller-finalize-cycle', reason: 'watchdog_no_progress_fuse' } : null;
  return {
    projectKey: registry.projectKey,
    controllerThreadId: input.controllerThreadId,
    staleHeartbeat: false,
    heartbeatState,
    pendingEvents,
    reviewQueue,
    routingQueue,
    activeTasks,
    overdueTasks,
    stalledActiveTasks,
    taskHealthReview,
    zombieAttempts,
    preparedReworks,
    objectiveFuses,
    incidentQueue,
    contextHealth,
    checkpointState,
    handoffState,
    pendingCleanupTasks,
    deferredCleanupTasks,
    deferredMessages,
    pendingMessageActions,
    staleDeferredMessages,
    parallelBatches: parallel.batches,
    idleConcurrencySlots: parallel.batches.reduce((sum, batch) => sum + batch.idleConcurrencySlots, 0),
    eligibleCandidates: parallel.batches.flatMap((batch) => batch.eligibleCandidates.map((candidate) => ({ batchId: batch.batchId, ...candidate }))),
    fanoutRequired: parallel.fanoutRequired,
    fanoutBlockers: parallel.batches.flatMap((batch) => batch.fanoutBlockers.map((reason) => ({ batchId: batch.batchId, reason }))),
    pendingParallelDispatches: parallel.pendingDispatches,
    batchNeedsReplan: parallel.batches.some((batch) => ['running', 'reconciling'].includes(batch.status) && (batch.fanoutRequired || batch.singleDispatchAllowed)),
    threadActions,
    reportNeedsRefresh,
    deliveryReportPath: deliveryReportPath(paths.home, paths.projectKey, input.controllerThreadId),
    cycleEvidence: cycleEvidence === null ? null : { recorded: cycleEvidence.recorded, duplicate: cycleEvidence.duplicate, baseline: cycleEvidence.baseline ?? false, businessChanged: cycleEvidence.businessChanged ?? false, consecutiveNoProgressCycles: cycleEvidence.consecutiveNoProgressCycles ?? heartbeatState.consecutiveNoProgressCycles, fuseOpened: cycleEvidence.fuseOpened },
    watchdogFused,
    heartbeatAction,
    notificationRequired: heartbeatState?.notificationStatus === 'pending',
    notificationText: heartbeatState?.notificationStatus === 'pending' ? `主控 watchdog 已停止自动续期：${heartbeatState.disableReason}。业务台账仍可继续；完成清理后使用 controller-resume-watchdog 显式恢复。` : null,
    needsControllerAttention: pendingEvents.length > 0 || reviewQueue.length > 0 || routingQueue.length > 0 || taskHealthNeedsAttention || zombieAttempts.length > 0 || preparedReworks.length > 0 || objectiveFuses.length > 0 || incidentQueue.length > 0 || contextHealth?.status === 'handoff_required' || threadActions.length > 0 || pendingMessageActions.length > 0 || staleDeferredMessages.length > 0 || parallel.fanoutRequired || parallel.singleDispatchReady || parallel.pendingDispatches.length > 0 || heartbeatState?.notificationStatus === 'pending',
    shouldKeepHeartbeat: queues.shouldKeepHeartbeat,
  };
}

function reviewCurrentDeliverable(task, reviewStatus, reason, selectedArtifactIds = []) {
  if (task.resultProtocolVersion !== RESULT_PROTOCOL_VERSION) return task.deliverableHistory;
  const index = task.deliverableHistory.findLastIndex((entry) => entry.attempt === task.attemptCount && entry.candidateCommit === task.candidateCommit);
  if (index < 0) fail('RESULT_REVIEW_MISSING', '当前 candidate 没有已入账成果包');
  if (!nonEmpty(reason)) fail('RESULT_REVIEW_REASON_REQUIRED', '成果审查必须记录具体原因');
  const current = task.deliverableHistory[index];
  if (current.reviewStatus !== 'pending') fail('RESULT_REVIEW_ALREADY_RECORDED', '当前成果包已经审查');
  const selected = [...new Set(selectedArtifactIds.map((id) => id.trim()).filter(nonEmpty))];
  const artifactById = new Map(current.artifacts.map((artifact) => [artifact.id, artifact]));
  if (selected.some((id) => !artifactById.has(id))) fail('RESULT_REVIEW_ARTIFACT_UNKNOWN', '选定展示 artifact 不属于当前成果包');
  if (reviewStatus === 'accepted' && task.taskMode === 'visual_implementation' && !selected.some((id) => ['screenshot', 'contact_sheet'].includes(artifactById.get(id)?.type))) fail('RESULT_REVIEW_VISUAL_SELECTION_REQUIRED', '视觉成果接受时必须选择至少一张展示截图');
  const reviewed = { ...current, reviewStatus, reviewReason: reason.trim(), selectedArtifactIds: selected, reviewedAt: new Date().toISOString(), deliveryStatus: reviewStatus === 'accepted' ? 'accepted_not_integrated' : 'rejected' };
  return task.deliverableHistory.map((entry, position) => position === index ? reviewed : entry);
}

function integrateCurrentDeliverable(task) {
  if (task.resultProtocolVersion !== RESULT_PROTOCOL_VERSION) return task.deliverableHistory;
  const index = task.deliverableHistory.findLastIndex((entry) => entry.attempt === task.attemptCount && entry.candidateCommit === task.candidateCommit);
  if (index < 0 || task.deliverableHistory[index].reviewStatus !== 'accepted') fail('RESULT_INTEGRATION_NOT_ACCEPTED', '只有已接受的当前成果包可以 integrated');
  return task.deliverableHistory.map((entry, position) => position === index ? { ...entry, deliveryStatus: 'integrated' } : entry);
}

export async function controllerMarkChangesRequested(input) {
  if (!has(input.failureClass, FAILURE_CLASSES.filter((value) => value !== 'unclassified')) || !nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'changes_requested 必须提供失败分类和原因');
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task) => {
    if (task.status !== 'executing' && task.status !== 'awaiting_review') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 转 changes_requested`);
    const deliverableHistory = task.status === 'awaiting_review' ? reviewCurrentDeliverable(task, 'rejected', input.reason) : task.deliverableHistory;
    const now = new Date().toISOString();
    return appendObservabilityReceipt({ ...task, deliverableHistory, status: 'changes_requested', executionStatus: 'stopped', nextOwner: 'undecided', failureClass: input.failureClass, changesRequestedReason: input.reason.trim(), reviewVerdict: 'changes_requested', executionEndedAt: now, updatedAt: now }, 'changes_requested', now);
  }});
}

function assertContractAmendmentSafety(task, snapshot) {
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  if (!hardContractTask(task) || snapshot.contractSchemaVersion !== IMPLEMENTATION_CONTRACT_SCHEMA_VERSION) fail('CONTRACT_AMENDMENT_INVALID', '只能为当前 schema-v3 hard_contract 实施任务绑定 schema-v3 合同');
  if (!same(task.allowedWritePaths, snapshot.allowedWritePaths)
    || !same(task.forbiddenNewPaths, snapshot.forbiddenNewPaths)
    || !same(task.forbiddenReimplementations, snapshot.forbiddenReimplementations)
    || !same(task.validationPolicy, snapshot.validationPolicy)
    || !same(task.resultRequirements, snapshot.resultRequirements)
    || !same(task.stageGates.map((gate) => ({ id: gate.id, required: gate.required })), snapshot.stageGates.map((gate) => ({ id: gate.id, required: gate.required })))) {
    fail('CONTRACT_AMENDMENT_SAFETY_INVARIANT_CHANGED', '合同修正不得改变 write/forbidden/result 或 required stage 身份、顺序');
  }
}

export async function controllerAmendImplementationContract(input) {
  if (!nonEmpty(input.reason) || !nonEmpty(input.hostReceipt)) fail('CLI_INVALID_ARGUMENTS', '合同修正必须提供审计 reason 与真实 host receipt');
  return mutateController({ ...input, heartbeatReason: 'dispatch', mutate: async (task) => {
    if (task.status !== 'changes_requested' || task.executionStatus !== 'stopped' || !['mechanical', 'spec_missing'].includes(task.failureClass) || task.candidateCommit !== null) fail('CONTRACT_AMENDMENT_NOT_ELIGIBLE', '合同修正只允许直接主控处理 stopped changes_requested 的 mechanical/spec_missing 无候选任务');
    if (task.pendingRework !== null) fail('CONTRACT_AMENDMENT_REWORK_PENDING', '存在待确认返工消息时不得并行绑定新合同');
    const snapshot = await loadImplementationContract(input.projectRoot, input.implementationContractPath, task.taskMode, { requireResultRequirements: task.resultProtocolVersion === RESULT_PROTOCOL_VERSION, requireCurrentSchema: true });
    const findings = await implementationContractAuditFindings(snapshot, input.projectRoot);
    if (findings.errors.length > 0) fail('IMPLEMENTATION_CONTRACT_AUDIT_FAILED', findings.errors.map((entry) => entry.code).join(', '));
    assertContractAmendmentSafety(task, snapshot);
    const now = new Date().toISOString();
    const nextAttempt = task.attemptCount + 1;
    const failure = [...task.failureHistory].reverse().find((entry) => (entry.authority ?? 'contract_evidence') === 'contract_evidence' && entry.attemptCount === task.attemptCount && task.stageGates.some((gate) => gate.id === entry.attemptedStage));
    const failedIndex = failure ? task.stageGates.findIndex((gate) => gate.id === failure.attemptedStage) : 0;
    const predecessorIds = new Set(failure ? task.stageGates.slice(0, failedIndex).map((gate) => gate.id) : []);
    const newEvidenceIds = new Set(snapshot.evidenceCommands.map((entry) => entry.id));
    const carriedProgress = currentStageProgress(task)
      .filter((entry) => predecessorIds.has(entry.stageId) && entry.evidence.every((evidence) => newEvidenceIds.has(evidence.id)))
      .map((entry) => ({ ...entry, attemptCount: nextAttempt, contractDigest: snapshot.contractDigest, contractVersion: snapshot.contractRevision ?? snapshot.contractCommit, carriedFromAttempt: task.attemptCount, carriedAt: now }));
    const amendment = { attemptCount: nextAttempt, beforeContractDigest: task.contractDigest, afterContractDigest: snapshot.contractDigest, reason: input.reason.trim(), hostReceipt: input.hostReceipt.trim(), failedStage: failure?.attemptedStage ?? null, carriedStageIds: carriedProgress.map((entry) => entry.stageId), createdAt: now };
    return appendObservabilityReceipt({ ...task, implementationContractPath: snapshot.implementationContractPath, contractDigest: snapshot.contractDigest, contractSchemaVersion: snapshot.contractSchemaVersion, contractRevision: snapshot.contractRevision, contractCommit: snapshot.contractCommit, allowedWritePaths: snapshot.allowedWritePaths, reuseRequirements: snapshot.reuseRequirements, forbiddenNewPaths: snapshot.forbiddenNewPaths, forbiddenReimplementations: snapshot.forbiddenReimplementations, stageGates: snapshot.stageGates, evidenceCommands: snapshot.evidenceCommands, errorPolicy: snapshot.errorPolicy, validationPolicy: snapshot.validationPolicy, visualOracle: snapshot.visualOracle, resultRequirements: snapshot.resultRequirements, stageProgress: [...task.stageProgress, ...carriedProgress], contractAmendmentHistory: [...task.contractAmendmentHistory, amendment], status: 'executing', executionStatus: 'running', nextOwner: 'worker', attemptCount: nextAttempt, lastDispatchedAttempt: nextAttempt, lastDispatchedAt: now, reviewVerdict: 'pending', notificationStatus: 'pending', executionEndedAt: null, updatedAt: now }, 'contract_amended', now);
  }});
}

export async function controllerDispatchRework(input) {
  const result = await mutateController({ ...input, mutate: (task, registry) => {
    assertControllerCycleBusinessReady(registry, input.controllerThreadId);
    assertControllerHealthyForDispatch(registry, input.controllerThreadId);
    if (task.status !== 'changes_requested') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 重新派发`);
    if (task.failureClass !== 'mechanical') fail('REWORK_REQUIRES_CONTROLLER', `${task.failureClass} 失败不得继续交给原 worker；必须由主控收回并重新分类`);
    if ((task.attemptCount ?? 1) >= 2) fail('REWORK_LIMIT_REACHED', '同一可见任务只允许一次机械返工；必须由主控收回');
    if (task.pendingRework !== null) fail('REWORK_ALREADY_PREPARED', '返工消息已准备；必须确认真实送达或取消，不能重复增加 attempt');
    const now = new Date().toISOString();
    const pendingRework = { actionId: `rework_${randomUUID().replaceAll('-', '')}`, nextAttempt: task.attemptCount + 1, mode: 'continue_same_attempt', preparedAt: now, expiresAt: new Date(Date.parse(now) + CONTROLLER_MESSAGE_ACTION_TIMEOUT_MS).toISOString() };
    return appendObservabilityReceipt({ ...task, pendingRework, updatedAt: now }, 'rework_prepared', now);
  }});
  return { ...result, hostAction: { type: 'send_thread_message', actionId: result.pendingRework.actionId, targetThreadId: result.threadId, deliveryMode: 'start_next_turn_only', receiptRequired: true, messageText: `主控已批准一次机械返工。保持原合同与验收标准不变，只修复已记录的机械问题：${result.changesRequestedReason}`, onSuccess: 'controller-confirm-rework-dispatched --action-id <id> --host-receipt <receipt>', onFailure: 'controller-cancel-prepared-rework --reason <host-error>' } };
}

export async function controllerConfirmReworkDispatched(input) {
  if (!isSafeThreadId(input.actionId) || !nonEmpty(input.hostReceipt)) fail('CLI_INVALID_ARGUMENTS', '确认返工必须提供 actionId 和真实宿主回执');
  return mutateController({ ...input, heartbeatReason: 'dispatch', mutate: (task) => {
    const pending = task.pendingRework;
    if (pending === null || pending.actionId !== input.actionId) fail('REWORK_ACTION_STALE', '返工准备动作不存在或已被替换');
    if (task.status !== 'changes_requested' || task.failureClass !== 'mechanical') fail('TASK_TRANSITION_INVALID', '返工确认时任务已不再处于可返工状态');
    const now = new Date().toISOString();
    const carriedProgress = carriedStageProgressForMechanicalRework(task, pending.nextAttempt, now);
    return appendObservabilityReceipt({ ...task, pendingRework: null, status: 'executing', executionStatus: 'running', nextOwner: 'worker', attemptCount: pending.nextAttempt, lastDispatchedAttempt: pending.nextAttempt, lastDispatchedAt: now, stageProgress: [...task.stageProgress, ...carriedProgress], reviewVerdict: 'pending', notificationStatus: 'pending', executionEndedAt: null, updatedAt: now }, 'rework_dispatched', now);
  }});
}

export async function controllerCancelPreparedRework(input) {
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', '取消返工准备必须记录原因');
  return mutateController({ ...input, mutate: (task) => {
    if (task.pendingRework === null) fail('REWORK_NOT_PREPARED', '当前没有待确认的返工准备动作');
    const now = new Date().toISOString();
    return appendObservabilityReceipt({ ...task, pendingRework: null, updatedAt: now }, 'rework_cancelled', now);
  }});
}

export async function controllerRecoverUndispatchedAttempt(input) {
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', '恢复未派发轮次必须记录原因');
  return mutateController({ ...input, mutate: (task) => {
    if (task.status !== 'executing' || !Number.isInteger(task.lastDispatchedAttempt) || task.attemptCount <= task.lastDispatchedAttempt) fail('ZOMBIE_ATTEMPT_NOT_FOUND', '当前任务不存在 attemptCount 超前于真实派发回执的 zombie 轮次');
    const now = new Date().toISOString();
    return appendObservabilityReceipt({ ...task, pendingRework: null, status: 'changes_requested', executionStatus: 'stopped', nextOwner: 'undecided', attemptCount: task.lastDispatchedAttempt, failureClass: task.failureClass ?? 'mechanical', changesRequestedReason: task.changesRequestedReason ?? input.reason.trim(), reviewVerdict: 'changes_requested', executionEndedAt: now, updatedAt: now }, 'rework_cancelled', now);
  }});
}

export async function controllerRecoverControlPlaneCandidate(input) {
  if (!has(input.controlPlaneComponent, CONTROL_PLANE_RECOVERY_COMPONENTS) || input.skillVersion !== TASK_CONTROL_VERSION || !nonEmpty(input.reason) || input.reason.trim().length < 20 || !nonEmpty(input.hostReceipt) || !nonEmpty(input.candidateCommit) || !nonEmpty(input.resultManifestPath)) fail('CLI_INVALID_ARGUMENTS', `控制面候选恢复必须记录 component、当前版本 ${TASK_CONTROL_VERSION}、候选、manifest、不少于 20 字符的原因和真实 host receipt`);
  return mutateController({ ...input, heartbeatReason: 'dispatch', mutate: async (task) => {
    if (task.status !== 'changes_requested' || task.executionStatus !== 'stopped' || !currentAttemptDispatched(task) || !implementationTask(task) || !isObject(task.parallelWorktreeIdentity)) fail('CONTROL_PLANE_RECOVERY_NOT_ELIGIBLE', '只允许恢复已有真实派发、登记候选 worktree 且已因控制面停止的 implementation 任务');
    if (task.pendingRework !== null || (task.controlPlaneRecovery !== null && task.controlPlaneRecovery !== undefined)) fail('CONTROL_PLANE_RECOVERY_ALREADY_EXISTS', '任务已有返工或控制面候选恢复记录');
    const failure = [...task.failureHistory].reverse().find((entry) => entry.attemptCount === task.attemptCount && entry.createdAt === task.failureEventCreatedAt);
    if (!failure || !['tooling', 'contract'].includes(failure.failureDomain) || failureValueClassForDomain(failure.failureDomain) !== 'control_plane') fail('CONTROL_PLANE_RECOVERY_FAILURE_INELIGIBLE', '只有 tooling/contract 的 task-control 控制面失败可以恢复同一候选');
    const resultManifest = await loadResultManifest(input.projectRoot, input.resultManifestPath, task, input.candidateCommit);
    if (resultManifest.sourceWorkspace.workspaceRole !== 'candidate_worktree') fail('CONTROL_PLANE_RECOVERY_WORKTREE_REQUIRED', '控制面恢复必须绑定已验证的 candidate worktree 成果');
    const now = new Date().toISOString();
    const controlPlaneRecovery = { schemaVersion: CONTROL_PLANE_RECOVERY_PROTOCOL_VERSION, recoveryId: `control-recovery-${randomUUID()}`, status: 'completion_only', component: input.controlPlaneComponent, attemptCount: task.attemptCount, candidateCommit: resultManifest.candidateCommit, resultManifestPath: resultManifest.resultManifestPath, resultManifestDigest: resultManifest.resultManifestDigest, sourceWorkspace: resultManifest.sourceWorkspace, skillVersion: input.skillVersion, reason: input.reason.trim(), hostReceipt: input.hostReceipt.trim(), preparedAt: now, completedAt: null, cancelledAt: null };
    return appendObservabilityReceipt({ ...task, controlPlaneRecovery, status: 'executing', executionStatus: 'running', nextOwner: 'worker', failureClass: null, changesRequestedReason: null, reviewVerdict: 'pending', notificationStatus: 'pending', executionEndedAt: null, updatedAt: now }, 'control_plane_candidate_recovered', now);
  }});
}

function newCloseout(input, now) {
  if (!nonEmpty(input.userSummary)) fail('CLOSEOUT_SUMMARY_REQUIRED', 'reclaim/blocked 必须提供用户可见 incident summary');
  return { status: 'pending', userVisibleSummary: input.userSummary.trim(), notificationStatus: 'pending', notificationSentAt: null, reportStatus: 'pending', reportSyncedAt: null, createdAt: now };
}

export async function controllerReclaimTask(input) {
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'reclaim reason 不能为空');
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task) => {
    if (task.status !== 'changes_requested' && task.status !== 'awaiting_review' && !(task.status === 'executing' && task.controlPlaneRecovery?.status === 'completion_only')) fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 由主控收回`);
    const deliverableHistory = task.status === 'awaiting_review' ? reviewCurrentDeliverable(task, 'rejected', input.reason) : task.deliverableHistory;
    const now = new Date().toISOString();
    const controlPlaneRecovery = task.controlPlaneRecovery?.status === 'completion_only' ? { ...task.controlPlaneRecovery, status: 'cancelled', cancelledAt: now } : (task.controlPlaneRecovery ?? null);
    return appendObservabilityReceipt({ ...task, controlPlaneRecovery, deliverableHistory, status: 'reclaimed', executionStatus: 'terminal', nextOwner: 'controller', reclaimedReason: input.reason.trim(), closeout: newCloseout(input, now), executionEndedAt: task.executionEndedAt ?? now, updatedAt: now }, 'reclaimed', now);
  }});
}

export async function controllerMarkBlocked(input) {
  if (!nonEmpty(input.reason) || !has(input.blockerSource, BLOCKER_SOURCES)) fail('CLI_INVALID_ARGUMENTS', 'blocked 必须提供 reason 和 blockerSource');
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task) => {
    if (task.status !== 'executing' && task.status !== 'changes_requested' && task.status !== 'awaiting_review') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 转 blocked`);
    if (input.blockerSource === 'diagnostic') {
      if (!isSafeThreadId(input.diagnosticId)) fail('DIAGNOSTIC_BLOCKER_REQUIRED', 'diagnostic blocker 必须提供 diagnosticId');
      const diagnostic = task.diagnostics.find((entry) => entry.diagnosticId === input.diagnosticId);
      if (diagnostic?.classification !== 'milestone_blocker') fail('PRODUCT_VALUE_GATE_REQUIRED', '只有具备完整产品价值证据的 milestone_blocker diagnostic 可以阻塞里程碑');
    }
    const deliverableHistory = task.status === 'awaiting_review' ? reviewCurrentDeliverable(task, 'rejected', input.reason) : task.deliverableHistory;
    const now = new Date().toISOString();
    const controlPlaneRecovery = task.controlPlaneRecovery?.status === 'completion_only' ? { ...task.controlPlaneRecovery, status: 'cancelled', cancelledAt: now } : (task.controlPlaneRecovery ?? null);
    return appendObservabilityReceipt({ ...task, controlPlaneRecovery, deliverableHistory, status: 'blocked', executionStatus: 'terminal', nextOwner: 'none', blockedReason: input.reason.trim(), blockerSource: input.blockerSource, blockedDiagnosticId: input.diagnosticId ?? null, closeout: newCloseout(input, now), executionEndedAt: task.executionEndedAt ?? now, updatedAt: now }, 'blocked', now);
  }});
}

export async function controllerRecordDiagnostic(input) {
  if (!isSafeThreadId(input.diagnosticId) || !has(input.classification, DIAGNOSTIC_CLASSIFICATIONS) || !nonEmpty(input.summary)) fail('CLI_INVALID_ARGUMENTS', 'diagnostic identity/classification/summary 无效');
  if (input.classification === 'milestone_blocker' && ![input.playerImpact, input.normalLifecycleReproduction, input.growthTrend, input.whyBlocking].every(nonEmpty)) fail('PRODUCT_VALUE_GATE_REQUIRED', 'milestone_blocker 必须记录 playerImpact、normalLifecycleReproduction、growthTrend、whyBlocking');
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task) => {
    if (task.diagnostics.some((entry) => entry.diagnosticId === input.diagnosticId)) fail('DIAGNOSTIC_DUPLICATE', `diagnosticId 已存在: ${input.diagnosticId}`);
    const recordedAt = new Date().toISOString();
    const diagnostic = { diagnosticId: input.diagnosticId, classification: input.classification, summary: input.summary.trim(), playerImpact: nonEmpty(input.playerImpact) ? input.playerImpact.trim() : null, normalLifecycleReproduction: nonEmpty(input.normalLifecycleReproduction) ? input.normalLifecycleReproduction.trim() : null, growthTrend: nonEmpty(input.growthTrend) ? input.growthTrend.trim() : null, whyBlocking: nonEmpty(input.whyBlocking) ? input.whyBlocking.trim() : null, evidenceRefs: normalizeEvidenceReferences(input.evidenceRefs ?? []), recordedAt };
    return { ...task, diagnostics: [...task.diagnostics, diagnostic], updatedAt: recordedAt };
  }});
}

export async function controllerMarkCloseoutNotificationSent(input) {
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task) => {
    if (task.closeout?.notificationStatus !== 'pending') fail('CLOSEOUT_NOTIFICATION_NOT_PENDING', 'closeout notification 不在 pending');
    const now = new Date().toISOString();
    const closeout = { ...task.closeout, notificationStatus: 'sent', notificationSentAt: now };
    closeout.status = closeout.reportStatus === 'synced' ? 'complete' : 'pending';
    return { ...task, closeout, updatedAt: now };
  }});
}

export async function controllerRefreshCloseoutReport(input) {
  await controllerBuildDeliveryReport(input);
  const result = await mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task) => {
    if (task.closeout?.reportStatus !== 'pending') fail('CLOSEOUT_REPORT_NOT_PENDING', 'closeout report 不在 pending');
    const now = new Date().toISOString();
    const closeout = { ...task.closeout, reportStatus: 'synced', reportSyncedAt: now };
    closeout.status = closeout.notificationStatus === 'sent' ? 'complete' : 'pending';
    return { ...task, closeout, updatedAt: now };
  }});
  await controllerBuildDeliveryReport(input);
  return result;
}

export async function controllerMarkAccepted(input) {
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task) => {
    if (task.status !== 'awaiting_review' || !nonEmpty(task.candidateCommit)) fail('TASK_TRANSITION_INVALID', '只有有 candidateCommit 的 awaiting_review 可以 accepted');
    const deliverableHistory = reviewCurrentDeliverable(task, 'accepted', input.reason, input.selectedArtifactIds ?? []);
    const now = new Date().toISOString();
    return appendObservabilityReceipt({ ...task, deliverableHistory, status: 'accepted', executionStatus: 'stopped', nextOwner: 'controller', reviewVerdict: 'accepted', updatedAt: now }, 'review_accepted', now);
  }});
}

async function resolveGitCommit(projectRoot, revision, errorCode, label) {
  try {
    const { stdout } = await execFile('git', ['-C', projectRoot, 'rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`], { windowsHide: true, maxBuffer: 1024 * 1024 });
    const commit = stdout.trim().toLowerCase();
    if (!/^[0-9a-f]{40,64}$/.test(commit)) fail(errorCode, `${label} 未解析为完整 Git commit: ${revision}`);
    return commit;
  } catch (error) {
    if (error instanceof TaskControlError) throw error;
    fail(errorCode, `${label} 无法在项目 Git 仓库中解析: ${revision}`);
  }
}

async function verifyGitIntegration(projectRoot, recordedCandidateCommit, targetRef = 'HEAD') {
  if (!nonEmpty(recordedCandidateCommit)) fail('INTEGRATION_CANDIDATE_REQUIRED', '实施任务集成前必须有 candidateCommit');
  if (!nonEmpty(targetRef) || targetRef.length > 512 || targetRef.includes('\0')) fail('INTEGRATION_TARGET_INVALID', 'integration target ref 无效');
  const normalizedTargetRef = targetRef.trim();
  const candidateCommit = await resolveGitCommit(projectRoot, recordedCandidateCommit, 'INTEGRATION_CANDIDATE_NOT_FOUND', '候选提交');
  const targetCommit = await resolveGitCommit(projectRoot, normalizedTargetRef, 'INTEGRATION_TARGET_NOT_FOUND', '集成目标');
  try {
    await execFile('git', ['-C', projectRoot, 'merge-base', '--is-ancestor', candidateCommit, targetCommit], { windowsHide: true, maxBuffer: 1024 * 1024 });
  } catch (error) {
    if (error?.code === 1) fail('INTEGRATION_NOT_REACHABLE', `候选提交 ${recordedCandidateCommit} 不在集成目标 ${normalizedTargetRef} (${targetCommit}) 的历史中`);
    fail('INTEGRATION_PROOF_FAILED', `无法验证候选提交是否进入集成目标 ${normalizedTargetRef}`);
  }
  return { schemaVersion: INTEGRATION_PROOF_PROTOCOL_VERSION, method: 'git_ancestor', recordedCandidateCommit, candidateCommit, targetRef: normalizedTargetRef, targetCommit, verifiedAt: new Date().toISOString() };
}

export async function controllerMarkIntegrated(input) {
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: async (task) => {
    if (task.status !== 'accepted') fail('TASK_TRANSITION_INVALID', `不能从 ${task.status} 转 integrated`);
    const integrationProof = implementationTask(task) ? await verifyGitIntegration(input.projectRoot, task.candidateCommit, input.integrationTargetRef ?? 'HEAD') : (task.integrationProof ?? null);
    const deliverableHistory = integrateCurrentDeliverable(task);
    const now = new Date().toISOString();
    return appendObservabilityReceipt({ ...task, deliverableHistory, status: 'integrated', executionStatus: 'terminal', nextOwner: 'none', reviewVerdict: 'accepted', integrationStatus: 'integrated', integrationProof, updatedAt: now }, 'integrated', now);
  }});
}

export async function controllerRecordTitleSynced(input) {
  if (!nonEmpty(input.title)) fail('CLI_INVALID_ARGUMENTS', 'synced title 不能为空');
  return mutateController({ ...input, mutate: (task) => {
    if (input.title !== task.desiredThreadTitle) fail('THREAD_TITLE_STALE', '确认的 title 与当前 lifecycle title 不一致');
    if (task.titleSyncStatus !== 'pending') fail('THREAD_ACTION_NOT_PENDING', 'title action 不是 pending；failed 必须先由直接主控显式重新排队');
    const now = new Date().toISOString();
    return { ...appendThreadActionHistory(task, 'set_thread_title', 'succeeded', input.title, now), titleSyncStatus: 'synced', lastSyncedTitle: input.title, titleSyncError: null, updatedAt: now };
  }});
}

export async function controllerRecordTitleFailed(input) {
  if (!nonEmpty(input.title) || !nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'title 与失败原因不能为空');
  return mutateController({ ...input, mutate: (task) => {
    if (input.title !== task.desiredThreadTitle) fail('THREAD_TITLE_STALE', '失败的 title 已不是当前 lifecycle title');
    if (task.titleSyncStatus !== 'pending') fail('THREAD_ACTION_NOT_PENDING', '只能记录 pending title action 的失败');
    const now = new Date().toISOString();
    return { ...appendThreadActionHistory(task, 'set_thread_title', 'failed', input.reason.trim(), now), titleSyncStatus: 'failed', titleSyncError: input.reason.trim(), updatedAt: now };
  }});
}

export async function controllerRecordArchiveSucceeded(input) {
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task, registry) => {
    if (!isTerminalTask(task)) fail('TASK_TRANSITION_INVALID', '只有 integrated、blocked 或 reclaimed 任务可以归档');
    if (task.titleSyncStatus !== 'synced') fail('THREAD_ARCHIVE_NOT_READY', '终态 title 尚未同步');
    if (!descendantsOf(registry.tasks, task.threadId).every((descendant) => descendant.archiveStatus === 'archived')) fail('THREAD_ARCHIVE_NOT_READY', '必须先归档所有可见后代任务');
    if (task.archiveStatus !== 'pending') fail('THREAD_ACTION_NOT_PENDING', 'archive action 不是 pending；failed 必须先由直接主控显式重新排队');
    const now = new Date().toISOString();
    return appendObservabilityReceipt({ ...appendThreadActionHistory(task, 'set_thread_archived', 'succeeded', 'archived', now), archiveStatus: 'archived', archivedAt: now, archiveError: null, updatedAt: now }, 'archived', now);
  }});
}

export async function controllerRecordArchiveFailed(input) {
  if (!nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', 'archive 失败原因不能为空');
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task) => {
    if (!isTerminalTask(task)) fail('TASK_TRANSITION_INVALID', '只有 integrated、blocked 或 reclaimed 任务可以记录 archive 失败');
    if (task.archiveStatus !== 'pending') fail('THREAD_ACTION_NOT_PENDING', '只能记录 pending archive action 的失败');
    const now = new Date().toISOString();
    return { ...appendThreadActionHistory(task, 'set_thread_archived', 'failed', input.reason.trim(), now), archiveStatus: 'failed', archivedAt: null, archiveError: input.reason.trim(), updatedAt: now };
  }});
}

export async function controllerRetryThreadAction(input) {
  if (!has(input.action, THREAD_ACTION_TYPES) || !nonEmpty(input.reason)) fail('CLI_INVALID_ARGUMENTS', '显式重试必须提供合法 action 和非空原因');
  return mutateController({ ...input, heartbeatReason: 'reconcile', mutate: (task, registry) => {
    const now = new Date().toISOString();
    if (input.action === 'set_thread_title') {
      if (task.titleSyncStatus !== 'failed' || !nonEmpty(task.titleSyncError)) fail('THREAD_ACTION_NOT_FAILED', '只有 failed title action 可以显式重新排队');
      let next = preserveLegacyFailure(task, input.action, task.titleSyncError);
      next = appendThreadActionHistory(next, input.action, 'retry_requested', input.reason.trim(), now);
      return { ...next, titleSyncStatus: 'pending', titleSyncError: null, updatedAt: now };
    }
    if (!isTerminalTask(task) || task.archiveStatus !== 'failed' || !nonEmpty(task.archiveError)) fail('THREAD_ACTION_NOT_FAILED', '只有终态 failed archive action 可以显式重新排队');
    if (task.titleSyncStatus !== 'synced') fail('THREAD_ARCHIVE_NOT_READY', '终态 title 尚未同步');
    if (!descendantsOf(registry.tasks, task.threadId).every((descendant) => descendant.archiveStatus === 'archived')) fail('THREAD_ARCHIVE_NOT_READY', '必须先归档所有可见后代任务');
    let next = preserveLegacyFailure(task, input.action, task.archiveError);
    next = appendThreadActionHistory(next, input.action, 'retry_requested', input.reason.trim(), now);
    return { ...next, archiveStatus: 'pending', archiveError: null, updatedAt: now };
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

function parentContextPolicy(task) {
  return {
    schemaVersion: PARENT_CONTEXT_PROTOCOL_VERSION,
    mode: 'progressive_direct_parent',
    directParentOnly: true,
    completedTurnsOnly: true,
    includeOutputs: false,
    fullInheritanceAllowed: false,
    authority: 'advisory',
    parentThreadId: task.parentThreadId,
    interpretation: '父任务回合只提供历史线索；项目 AGENTS/SOP、正式台账、当前任务边界和已确认 checkpoint 仍是权威。不得用父任务草稿扩大 scope、改变 forbidden decisions 或冒充主控。',
  };
}

async function parentCheckpointPreload(result) {
  const pointer = checkpointPointerFor(result.registry, result.task.parentThreadId);
  if (!pointer) return null;
  const record = await readVerifiedCheckpoint(pointer, {
    projectKey: result.registry.projectKey,
    controllerThreadId: result.task.parentThreadId,
  });
  return checkpointPreload(record, 'preload');
}

export async function queryParent(input) {
  const result = await querySelf(input);
  if (!nonEmpty(input.contextMode)) return result.task.parentThreadId;
  if (!has(input.contextMode, PARENT_CONTEXT_MODES)) fail('CLI_INVALID_ARGUMENTS', `parent context mode 无效: ${input.contextMode}`);
  const preload = await parentCheckpointPreload(result);
  return {
    schemaVersion: PARENT_CONTEXT_PROTOCOL_VERSION,
    projectKey: result.registry.projectKey,
    taskThreadId: result.task.threadId,
    parentThreadId: result.task.parentThreadId,
    contextMode: input.contextMode,
    checkpointStatus: preload === null ? 'unavailable' : 'available',
    preload,
    parentContextPolicy: parentContextPolicy(result.task),
    onDemandCommand: `query-parent-context --self ${result.task.threadId} --reason "<why parent history is needed>"`,
  };
}

export async function queryParentContext(input) {
  const result = await querySelf(input);
  if (!nonEmpty(input.reason) || input.reason.trim().length > 500) fail('CLI_INVALID_ARGUMENTS', '按需读取父任务必须提供 1-500 字符的具体 reason');
  const policy = parentContextPolicy(result.task);
  if (nonEmpty(input.factId)) {
    assertSafeThreadId(input.factId, 'factId');
    const pointer = checkpointPointerFor(result.registry, result.task.parentThreadId);
    if (!pointer) fail('CHECKPOINT_NOT_FOUND', `直接父任务 ${result.task.parentThreadId} 还没有 sealed checkpoint`);
    const record = await readVerifiedCheckpoint(pointer, {
      projectKey: result.registry.projectKey,
      controllerThreadId: result.task.parentThreadId,
    });
    return {
      schemaVersion: PARENT_CONTEXT_PROTOCOL_VERSION,
      projectKey: result.registry.projectKey,
      taskThreadId: result.task.threadId,
      parentThreadId: result.task.parentThreadId,
      reason: input.reason.trim(),
      source: 'checkpoint_point',
      checkpoint: checkpointPreload(record, 'preload', input.factId),
      parentContextPolicy: policy,
    };
  }
  return {
    schemaVersion: PARENT_CONTEXT_PROTOCOL_VERSION,
    projectKey: result.registry.projectKey,
    taskThreadId: result.task.threadId,
    parentThreadId: result.task.parentThreadId,
    reason: input.reason.trim(),
    source: 'direct_parent_completed_turns',
    hostAction: {
      type: 'read_thread',
      threadId: result.task.parentThreadId,
      turnLimit: PARENT_CONTEXT_INITIAL_TURN_LIMIT,
      includeOutputs: false,
    },
    paginationPolicy: '从最近完成回合开始；仅在新页面仍可能提供当前问题的历史路线时使用 nextCursor。出现重复、无关内容或已得到足够证据即停止。',
    unavailableFallback: '若宿主不提供 read_thread，继续依据项目规则和已确认 checkpoint；仍缺关键裁决时通过直接父任务请求澄清。',
    parentContextPolicy: policy,
  };
}

export function buildCompletionNotification(task) {
  const identity = nonEmpty(task.displayKey) ? `${task.displayKey} ${task.title}` : task.threadId;
  const summary = contractSummary(task);
  const contractText = implementationTask(task) ? `。合同：${summary.contractVersion}；已完成阶段：${summary.completedStages.join(', ') || '无'}；缺失阶段：${summary.missingStages.join(', ') || '无'}` : '';
  return `任务已完成，等待主控审查。任务：${identity}${contractText}`;
}

export function buildProgressNotification(task, summary) {
  const identity = nonEmpty(task.displayKey) ? `${task.displayKey} ${task.title}` : task.threadId;
  return `任务有进展。任务：${identity}。进度：${summary.trim()}`;
}

export function buildFailureNotification(task, eventType, attemptedStage) {
  const identity = nonEmpty(task.displayKey) ? `${task.displayKey} ${task.title}` : task.threadId;
  return `任务已停止并提交 ${eventType}。任务：${identity}。失败阶段：${attemptedStage}。请主控立即读取台账事件并裁决。`;
}

function assertWorkerActionAllowedDuringRecovery(task, action) {
  if (task.controlPlaneRecovery?.status === 'completion_only' && action !== 'complete') fail('CONTROL_PLANE_RECOVERY_COMPLETION_ONLY', '该任务仅恢复原候选 completion；禁止重跑、改业务、提交 progress/repair/failure');
}

export async function createIncidentalRepairEvent(input) {
  const result = await querySelf(input);
  assertWorkerActionAllowedDuringRecovery(result.task, 'incidental_repair');
  if (!childArtifactAllowed(result.task)) fail('TASK_DISPATCH_NOT_AUTHORIZED', '当前轮任务尚未登记真实派发，不能登记附带修复');
  if (!adaptiveBriefTask(result.task) || result.task.scopePolicy !== 'bounded_incidental') fail('INCIDENTAL_REPAIR_NOT_ALLOWED', '当前任务使用 strict scope 或 hard contract；发现缺陷后必须交回直接主控');
  await assertImplementationContractCurrent(result.task, result.registry.projectRoot);
  const repairId = nonEmpty(input.repairId) ? input.repairId.trim() : `repair-${randomUUID()}`;
  if (!Array.isArray(input.riskFlags) || input.riskFlags.some((flag) => !INCIDENTAL_REPAIR_RISK_FLAGS.includes(flag))) fail('INCIDENTAL_REPAIR_RISK_INVALID', 'riskFlags 必须是已知受保护风险标志数组');
  const riskFlags = Object.fromEntries(INCIDENTAL_REPAIR_RISK_FLAGS.map((flag) => [flag, input.riskFlags?.includes(flag) ? true : false]));
  const receipt = {
    schemaVersion: INCIDENTAL_REPAIR_PROTOCOL_VERSION,
    type: 'incidental_repair',
    projectKey: result.registry.projectKey,
    threadId: result.task.threadId,
    parentThreadId: result.task.parentThreadId,
    controllerThreadId: result.task.directControllerThreadId,
    displayKey: result.task.displayKey,
    title: result.task.title,
    attemptCount: result.task.attemptCount,
    repairId,
    originalBlocker: input.originalBlocker,
    sameObjectiveReason: input.sameObjectiveReason,
    functionalDomain: input.functionalDomain,
    affectedFiles: input.affectedFiles,
    conflictDomains: input.conflictDomains ?? [],
    localOnly: input.localOnly,
    reversible: input.reversible,
    ...riskFlags,
    riskAssessment: input.riskAssessment,
    redEvidence: input.redEvidence ?? [],
    greenEvidence: input.greenEvidence ?? [],
    contractVersion: contractVersion(result.task),
    contractDigest: result.task.contractDigest,
    createdAt: new Date().toISOString(),
  };
  const normalized = validateIncidentalRepairReceipt(receipt, result.task);
  return writeChildArtifact(result.paths, result.task.threadId, 'incidental-repair', normalized);
}

export async function createFailureEvent(input) {
  const result = await querySelf(input);
  assertWorkerActionAllowedDuringRecovery(result.task, 'failure');
  if (!childArtifactAllowed(result.task)) fail('TASK_DISPATCH_NOT_AUTHORIZED', '当前轮任务尚未登记真实派发，不能提交失败事件');
  if (!FAILURE_EVENT_TYPES.includes(input.eventType) || !nonEmpty(input.attemptedStage) || !has(input.failureClass, FAILURE_CLASSES.filter((entry) => entry !== 'unclassified')) || !has(input.failureDomain, FAILURE_DOMAINS) || !nonEmpty(input.commandSummary) || typeof input.mechanicalRetryEligible !== 'boolean') fail('CLI_INVALID_ARGUMENTS', 'report-failure 参数不完整');
  await assertImplementationContractCurrent(result.task, result.registry.projectRoot);
  const evidence = normalizeEvidenceReferences(input.evidence ?? []);
  if (evidence.length === 0) fail('FAILURE_EVIDENCE_REQUIRED', 'failure event 必须提供至少一条证据引用');
  let authority = 'contract_evidence';
  let failureMode = 'blocking';
  let evidenceClass = null;
  const recoveryExhausted = input.recoveryExhausted === true;
  if (implementationTask(result.task)) {
    if (adaptiveBriefTask(result.task)) {
      if (!isSafeThreadId(input.attemptedStage.trim())) fail('STAGE_UNKNOWN', `attemptedStage 无效: ${input.attemptedStage}`);
      if (nonEmpty(input.evidenceCommandId)) fail('ADAPTIVE_BRIEF_FIXED_VALIDATOR_FORBIDDEN', 'adaptive_brief 不绑定预设 evidenceCommandId；请直接登记实际使用的证据引用');
      authority = 'worker_evidence';
      failureMode = 'blocking';
      evidenceClass = 'business';
    } else {
      if (!result.task.stageGates.some((gate) => gate.id === input.attemptedStage.trim())) fail('STAGE_UNKNOWN', `未登记的 attemptedStage: ${input.attemptedStage}`);
      const evidenceCommand = nonEmpty(input.evidenceCommandId) ? result.task.evidenceCommands.find((entry) => entry.id === input.evidenceCommandId.trim()) : null;
      failureMode = evidenceCommand?.failureMode ?? (evidenceCommand ? 'blocking' : 'advisory');
      evidenceClass = evidenceCommand?.evidenceClass ?? null;
      authority = evidenceCommand && failureMode !== 'advisory' && (failureMode !== 'recoverable' || recoveryExhausted) ? 'contract_evidence' : 'non_authoritative_diagnostic';
    }
  }
  const prefix = input.eventType === 'task_failed' ? 'task-failed' : 'task-blocked';
  return writeChildArtifact(result.paths, result.task.threadId, prefix, { schemaVersion: 1, type: input.eventType, projectKey: result.registry.projectKey, threadId: result.task.threadId, parentThreadId: result.task.parentThreadId, controllerThreadId: result.task.directControllerThreadId, displayKey: result.task.displayKey, title: result.task.title, attemptCount: result.task.attemptCount, attemptedStage: input.attemptedStage.trim(), failureClass: input.failureClass, failureDomain: input.failureDomain, commandSummary: input.commandSummary.trim(), evidenceCommandId: nonEmpty(input.evidenceCommandId) ? input.evidenceCommandId.trim() : null, failureMode, evidenceClass, recoveryExhausted, authority, evidence, mechanicalRetryEligible: input.mechanicalRetryEligible, parentNotification: parentNotificationEnvelope(input.parentTurnState ?? 'unknown'), ...contractSummary(result.task), createdAt: new Date().toISOString() });
}

export async function createProgressEvent(input) {
  const result = await querySelf(input);
  assertWorkerActionAllowedDuringRecovery(result.task, 'progress');
  if (!childArtifactAllowed(result.task)) fail('TASK_DISPATCH_NOT_AUTHORIZED', '当前轮任务尚未登记真实派发，不能提交进度');
  if (!nonEmpty(input.summary)) fail('CLI_INVALID_ARGUMENTS', 'progress summary 不能为空');
  await assertImplementationContractCurrent(result.task, result.registry.projectRoot);
  const pendingStages = implementationTask(result.task) ? await pendingStagesForCreation(result.paths, result.task) : new Map();
  const checkpoint = validateStageCheckpoint(result.task, input.stageId, input.evidence ?? [], { pendingStages });
  return writeChildArtifact(result.paths, result.task.threadId, 'progress', { schemaVersion: 1, type: 'task_progress', projectKey: result.registry.projectKey, threadId: result.task.threadId, parentThreadId: result.task.parentThreadId, controllerThreadId: result.task.directControllerThreadId, displayKey: result.task.displayKey, title: result.task.title, attemptCount: result.task.attemptCount, summary: input.summary.trim(), parentNotification: parentNotificationEnvelope(input.parentTurnState ?? 'unknown'), ...(implementationTask(result.task) ? { ...checkpoint, ...contractSummary(result.task) } : {}), createdAt: new Date().toISOString() });
}

export async function createCompletionEvent(input) {
  const result = await querySelf(input);
  assertWorkerActionAllowedDuringRecovery(result.task, 'complete');
  if (!childArtifactAllowed(result.task)) fail('TASK_DISPATCH_NOT_AUTHORIZED', '当前轮任务尚未登记真实派发，任务不得提交 completion');
  if (input.status !== undefined && input.status !== 'awaiting_review') fail('CHILD_STATUS_FORBIDDEN', '子任务只能提交 awaiting_review');
  if (!nonEmpty(input.candidateCommit)) fail('CLI_INVALID_ARGUMENTS', 'candidateCommit 不能为空');
  await assertImplementationContractCurrent(result.task, result.registry.projectRoot);
  const summary = contractSummary(result.task);
  if (summary.missingStages.length > 0) fail('REQUIRED_STAGE_INCOMPLETE', `完成前仍缺少 required stage: ${summary.missingStages.join(', ')}`);
  const pendingRepairs = await pendingIncidentalRepairs(result.paths, result.task);
  const manifestTask = pendingRepairs.length === 0 ? result.task : { ...result.task, incidentalRepairs: [...result.task.incidentalRepairs, ...pendingRepairs] };
  const resultManifest = result.task.resultProtocolVersion === RESULT_PROTOCOL_VERSION
    ? await loadResultManifest(result.registry.projectRoot, input.resultManifestPath, manifestTask, input.candidateCommit)
    : null;
  const recovery = result.task.controlPlaneRecovery;
  if (recovery?.status === 'completion_only' && (input.candidateCommit !== recovery.candidateCommit || resultManifest === null || resultManifest.resultManifestPath.toLowerCase() !== recovery.resultManifestPath.toLowerCase() || resultManifest.resultManifestDigest !== recovery.resultManifestDigest)) fail('CONTROL_PLANE_RECOVERY_CANDIDATE_DRIFT', '控制面恢复只允许重新提交已冻结的同一 candidate commit 和 result manifest');
  return writeChildArtifact(result.paths, result.task.threadId, 'completion', { schemaVersion: 1, type: 'task_completed', projectKey: result.registry.projectKey, threadId: result.task.threadId, parentThreadId: result.task.parentThreadId, controllerThreadId: result.task.directControllerThreadId, displayKey: result.task.displayKey, title: result.task.title, desiredThreadTitle: result.task.desiredThreadTitle, attemptCount: result.task.attemptCount, status: 'awaiting_review', candidateCommit: input.candidateCommit, parentNotification: parentNotificationEnvelope(input.parentTurnState ?? 'unknown'), ...summary, ...(resultManifest === null ? {} : { resultManifest }), createdAt: new Date().toISOString() });
}

export async function createNotificationFailureReceipt(input) {
  const result = await querySelf(input);
  if (!nonEmpty(input.reason) || !isSafeThreadId(input.actionId)) fail('CLI_INVALID_ARGUMENTS', '通知失败必须提供真实 actionId 和非空原因');
  let sourceEventPath = null;
  for (const eventPath of await listTaskEventFiles(result.paths, result.task)) {
    const type = artifactTypeForPath(eventPath);
    if (!['task_progress', 'task_completed', ...FAILURE_EVENT_TYPES].includes(type)) continue;
    const event = await readArtifact(eventPath, type);
    if (event.parentNotification?.disposition === 'prepared' && event.parentNotification.actionId === input.actionId) {
      sourceEventPath = eventPath;
      break;
    }
  }
  if (sourceEventPath === null) fail('NOTIFICATION_ACTION_NOT_FOUND', 'notification_failed 必须引用当前任务已持久化的 idle-send action');
  return writeChildArtifact(result.paths, result.task.threadId, 'notification-failed', { schemaVersion: 1, type: 'notification_failed', projectKey: result.registry.projectKey, threadId: result.task.threadId, parentThreadId: result.task.parentThreadId, controllerThreadId: result.task.directControllerThreadId, actionId: input.actionId, sourceEventPath, reason: input.reason.trim(), createdAt: new Date().toISOString() });
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

function options(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!nonEmpty(value) || value.startsWith('--')) fail('CLI_INVALID_ARGUMENTS', `缺少参数 ${name}`);
    values.push(value);
  }
  return values;
}

function parseEvidenceReferences(values) {
  return values.map((value) => {
    const separator = value.indexOf('=');
    if (separator < 1 || separator === value.length - 1) fail('CLI_INVALID_ARGUMENTS', '--evidence-ref 必须使用 id=reference');
    return { id: value.slice(0, separator), reference: value.slice(separator + 1) };
  });
}

function parseAffectedFiles(values) {
  return values.map((value) => {
    const parts = value.split('|');
    if (parts.length !== 3 || !parts.every(nonEmpty)) fail('CLI_INVALID_ARGUMENTS', '--affected-file 必须使用 path|added|modified|deleted|generated|reason');
    return { path: parts[0], changeType: parts[1], reason: parts[2] };
  });
}

function parseRiskFlags(values) {
  const unknown = values.filter((value) => !INCIDENTAL_REPAIR_RISK_FLAGS.includes(value));
  if (unknown.length > 0) fail('CLI_INVALID_ARGUMENTS', `未知 --risk-flag: ${unknown.join(', ')}`);
  return [...new Set(values)];
}

function requiredBoolean(args, name) {
  const value = required(args, name);
  if (!['true', 'false'].includes(value)) fail('CLI_INVALID_ARGUMENTS', `${name} 必须是 true 或 false`);
  return value === 'true';
}

function optionalBoolean(args, name, defaultValue = false) {
  const value = option(args, name);
  if (value === undefined) return defaultValue;
  if (!['true', 'false'].includes(value)) fail('CLI_INVALID_ARGUMENTS', `${name} 必须是 true 或 false`);
  return value === 'true';
}

function helpText() {
  return [
    `codex-task-control v${TASK_CONTROL_VERSION}`,
    '',
    '实施简报与风险合同命令：',
    '  audit-implementation-contract --project-root <root> --contract <project-relative-json> --task-mode implementation|visual_implementation',
    '  register ... --task-mode control_only|implementation|visual_implementation [--execution-policy adaptive_brief|hard_contract] [--scope-policy bounded_incidental|strict_scope] [--implementation-brief <project-relative-json>] [--implementation-contract <project-relative-json> --hard-contract-trigger <high_risk_irreversible|shared_conflict|parallel_coordination|user_explicit> --hard-contract-reason <reason>] [--parallel-policy legacy_compat|batch_v1 --batch-id <id> --candidate-id <id>]',
    '  controller-plan-parallel-batch --project-root <root> --controller <id> --manifest <project-relative-json>',
    '  controller-evaluate-fanout --project-root <root> --controller <id> --batch-id <id>',
    '  controller-prepare-parallel-dispatch --project-root <root> --controller <id> --batch-id <id>',
    '  controller-close-parallel-batch --project-root <root> --controller <id> --batch-id <id>',
    '  audit-parallel-routing [--codex-home <CODEX_HOME>]',
    '  query-parent --self <thread> [--context-mode preload]  # 无 context-mode 时保持旧版，仅返回 parent ID',
    '  query-parent-context --self <thread> --reason <why-history-is-needed> [--point <fact-id>]',
    '  progress --self <thread> --summary <text> [--parent-turn-state running|idle|unknown] [--stage <stage-id>] [--evidence-ref <id=reference> ...]',
    '  incidental-repair --self <thread> --repair-id <id> --original-blocker <text> --same-objective-reason <text> --functional-domain <id> --affected-file <path|changeType|reason> --local-only true --reversible true --risk-assessment <text> --red-evidence-ref <id=reference> --green-evidence-ref <id=reference> [--conflict-domain <id> ...] [--risk-flag <flag> ...]',
    '  controller-ingest-incidental-repair --project-root <root> --controller <id> --event <event.json>',
    `  controller-recover-control-plane-candidate --project-root <root> --controller <id> --thread <id> --control-plane-component task_control_protocol --candidate-commit <sha> --result-manifest <path> --skill-version ${TASK_CONTROL_VERSION} --reason <reason> --host-receipt <receipt>`,
    '  report-failure --self <thread> --event-type task_failed|task_blocked --attempted-stage <stage> --failure-class <class> --failure-domain <domain> --command-summary <text> --mechanical-retry-eligible true|false [--parent-turn-state running|idle|unknown] [--evidence-command-id <contract-id>] [--evidence-ref <id=reference> ...]',
    '  complete --self <thread> --candidate-commit <sha> --result-manifest <project-relative-json> [--parent-turn-state running|idle|unknown]',
    '  notification-failed --self <thread> --action-id <returned-idle-send-action-id> --reason <host-error>',
    '  controller-mark-notification-sent --project-root <root> --controller <id> --thread <id> --host-receipt <real-host-receipt>',
    '  audit-user-agents-policy --codex-home <CODEX_HOME>',
    '  sync-user-agents-policy --codex-home <CODEX_HOME> --authorization user_explicit_current_turn',
    '  controller-query-deliverables --project-root <root> --controller <id>',
    '  controller-build-delivery-report --project-root <root> --controller <id> [--observability lean|diagnostic] [--otel-jsonl <file-or-dir>] [--desktop-log <file>]',
    '  controller-ingest-context-health --project-root <root> --controller <id> --receipt <json>',
    '  controller-seal-checkpoint --project-root <root> --controller <id> --manifest <absolute-json>',
    '  controller-query-checkpoint --project-root <root> --controller <id> [--checkpoint latest] [--mode preload|full] [--point <fact-id>]',
    '  controller-prepare-handoff --project-root <root> --controller <source-id> --successor <new-visible-task-id> --checkpoint <latest-checkpoint-id>',
    '  controller-accept-handoff --project-root <root> --controller <source-id> --successor <new-visible-task-id> --handoff-id <id> --checkpoint-digest <sha256>',
    '  controller-cancel-handoff --project-root <root> --controller <source-id> --handoff-id <id> --reason <text>',
    '  controller-record-diagnostic ... --diagnostic-id <id> --classification technical_debt|milestone_blocker --summary <text> ...',
    '  mark-accepted ... --reason <review-reason> [--selected-artifact <artifact-id> ...]',
    '  mark-integrated ... [--integration-target-ref <git-ref>]  # implementation 默认验证 candidate 是 HEAD 的祖先',
    '  controller-confirm-heartbeat-action --project-root <root> --controller <id> --action-id <id> [--automation-id <new-or-deleted-id>] [--pending-create-cleanup-outcome deleted|not_found]',
    '  controller-finalize-cycle --project-root <root> --controller <id>',
    '  controller-resume-watchdog --project-root <root> --controller <id> --reason <manual-review-reason>',
    '  controller-assert-business-ready --project-root <root> --controller <id>',
    '  controller-prepare-message --project-root <root> --controller <id> --thread <id> --kind follow_up|clarification|evidence_request|notification|stop|cancel --delivery-mode queue|interrupt --target-turn-state running|idle|unknown --message <text> [--message-id <id>] [--interrupt-authority user_explicit|controller_safety]',
    '  controller-release-message --project-root <root> --controller <id> --message-id <id> --target-turn-state running|idle|unknown',
    '  controller-record-message-delivery --project-root <root> --controller <id> --message-id <id> --action-id <id> --outcome delivered|failed [--receipt <host-receipt>] [--reason <host-error>]',
    '  controller-dispatch-rework ...  # 只准备返工消息，不增加 attempt',
    '  controller-amend-implementation-contract --project-root <root> --controller <id> --thread <id> --contract <project-relative-json> --reason <audited-reason> --host-receipt <receipt>',
    '  controller-confirm-rework-dispatched ... --action-id <id> --host-receipt <receipt>',
    '  controller-cancel-prepared-rework ... --reason <text>',
    '  controller-recover-undispatched-attempt ... --reason <text>',
    '  controller-record-heartbeat-action-failed --project-root <root> --controller <id> --action-id <id> --reason <text> [--automation-id <id>]',
    '',
    'implementation 默认使用 adaptive_brief + bounded_incidental：同目标、同功能域、本地可逆的小缺陷可登记附带修复并继续；strict_scope/hard_contract 仍 fail closed。成果包必须报告实际影响文件、理由和验证依据。',
    'parallel batch 先规划候选矩阵，再登记/改名所有 wave 成员；单候选缺退化证据或部分 wave 未派发时 fail closed。',
    'heartbeat 只有一个 COUNT=1 one-shot：普通单任务 15 分钟、并发 10 分钟、Terra high 25 分钟、风险/主控队列 5 分钟；scan 同时返回 taskHealthReview。',
    '真实 progress/failure/completion 从事件时间重排 one-shot；连续两轮无有效业务进展自动熔断，阻止新派发但保留失败入账、收回、恢复和收口。',
    '运行中任务的普通消息先保存为 deferred_local；只有确认 idle 才返回 send_thread_message。stop/cancel 只有显式 authority 才返回 steer_thread_message。',
    'worker 到直接父主控同样采用事件先入账：父主控 running/unknown 时只保留 deferred_parent，不返回发送动作；确认 idle 才返回 send_thread_message。父主控扫描入账 deferred 事件后标记 observed，只有真实发送成功才标记 sent。',
    'worker 启动时可让 query-parent 预加载直接父任务 checkpoint 中已确认的 always 摘要；需要历史路线时才用 query-parent-context 读取直接父任务的已完成回合，不继承全量上下文。',
    'checkpoint 独立保存在 task-control/checkpoints；handoff 必须无活跃/待审/消息/heartbeat 债务，可在接受前取消；接受后旧主控退休。',
  ].join('\n');
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
  if (command === 'help' || command === '--help' || command === '-h') result = helpText();
  else if (command === 'query-parent') result = await queryParent({ ...storage, selfThreadId: required(args, '--self'), contextMode: option(args, '--context-mode') });
  else if (command === 'query-parent-context') result = await queryParentContext({ ...storage, selfThreadId: required(args, '--self'), reason: required(args, '--reason'), factId: option(args, '--point') });
  else if (command === 'audit-implementation-contract') result = await auditImplementationContract({ projectRoot: required(args, '--project-root'), implementationContractPath: required(args, '--contract'), taskMode: required(args, '--task-mode') });
  else if (command === 'audit-controller-routing') result = auditControllerRouting({ model: required(args, '--model'), thinking: required(args, '--thinking'), controllerWorkClass: required(args, '--work-class'), escalationTrigger: option(args, '--escalation-trigger'), escalationReason: option(args, '--reason'), maxAuthority: option(args, '--max-authority') });
  else if (command === 'audit-model-routing') result = await auditModelRouting(storage);
  else if (command === 'audit-thinking-routing') result = await auditThinkingRouting(storage);
  else if (command === 'audit-archive-backlog') result = await auditArchiveBacklog(storage);
  else if (command === 'audit-parallel-routing') result = await auditParallelRouting(storage);
  else if (command === 'audit-user-agents-policy') result = await auditUserAgentsPolicy({ codexHome: required(args, '--codex-home') });
  else if (command === 'sync-user-agents-policy') result = await syncUserAgentsPolicy({ codexHome: required(args, '--codex-home'), authorization: required(args, '--authorization') });
  else if (command === 'query-self') {
    const task = (await querySelf({ ...storage, selfThreadId: required(args, '--self') })).task;
    result = { ...task, dispatchAllowed: dispatchAllowed(task) };
  }
  else if (command === 'complete') {
    const selfThreadId = required(args, '--self');
    const parentTurnState = option(args, '--parent-turn-state') ?? 'unknown';
    const eventPath = await createCompletionEvent({ ...storage, selfThreadId, candidateCommit: required(args, '--candidate-commit'), resultManifestPath: option(args, '--result-manifest'), status: option(args, '--status'), parentTurnState });
    const task = (await querySelf({ ...storage, selfThreadId })).task;
    const event = await readArtifact(eventPath, 'task_completed');
    result = { eventPath, ...workerParentNotificationSummary(task, eventPath, buildCompletionNotification(task), event.parentNotification), ...contractSummary(task) };
  }
  else if (command === 'progress') {
    const selfThreadId = required(args, '--self');
    const summary = required(args, '--summary');
    const parentTurnState = option(args, '--parent-turn-state') ?? 'unknown';
    const eventPath = await createProgressEvent({ ...storage, selfThreadId, summary, stageId: option(args, '--stage'), evidence: parseEvidenceReferences(options(args, '--evidence-ref')), parentTurnState });
    const task = (await querySelf({ ...storage, selfThreadId })).task;
    const event = await readArtifact(eventPath, 'task_progress');
    result = { eventPath, ...workerParentNotificationSummary(task, eventPath, buildProgressNotification(task, summary), event.parentNotification), ...contractSummary(task) };
  }
  else if (command === 'incidental-repair') {
    const selfThreadId = required(args, '--self');
    const eventPath = await createIncidentalRepairEvent({ ...storage, selfThreadId, repairId: required(args, '--repair-id'), originalBlocker: required(args, '--original-blocker'), sameObjectiveReason: required(args, '--same-objective-reason'), functionalDomain: required(args, '--functional-domain'), affectedFiles: parseAffectedFiles(options(args, '--affected-file')), conflictDomains: options(args, '--conflict-domain'), localOnly: requiredBoolean(args, '--local-only'), reversible: requiredBoolean(args, '--reversible'), riskFlags: parseRiskFlags(options(args, '--risk-flag')), riskAssessment: required(args, '--risk-assessment'), redEvidence: parseEvidenceReferences(options(args, '--red-evidence-ref')), greenEvidence: parseEvidenceReferences(options(args, '--green-evidence-ref')) });
    const task = (await querySelf({ ...storage, selfThreadId })).task;
    result = { eventPath, parentThreadId: task.parentThreadId, notificationRequired: false, workerMayContinue: true, ...contractSummary(task) };
  }
  else if (command === 'report-failure') {
    const selfThreadId = required(args, '--self');
    const eventType = required(args, '--event-type');
    const attemptedStage = required(args, '--attempted-stage');
    const parentTurnState = option(args, '--parent-turn-state') ?? 'unknown';
    const eventPath = await createFailureEvent({ ...storage, selfThreadId, eventType, attemptedStage, failureClass: required(args, '--failure-class'), failureDomain: required(args, '--failure-domain'), commandSummary: required(args, '--command-summary'), evidenceCommandId: option(args, '--evidence-command-id'), recoveryExhausted: optionalBoolean(args, '--recovery-exhausted'), mechanicalRetryEligible: requiredBoolean(args, '--mechanical-retry-eligible'), evidence: parseEvidenceReferences(options(args, '--evidence-ref')), parentTurnState });
    const task = (await querySelf({ ...storage, selfThreadId })).task;
    const event = await readArtifact(eventPath, eventType);
    result = { eventPath, ...workerParentNotificationSummary(task, eventPath, buildFailureNotification(task, eventType, attemptedStage), event.parentNotification), ...contractSummary(task) };
  }
  else if (command === 'notification-failed') result = await createNotificationFailureReceipt({ ...storage, selfThreadId: required(args, '--self'), actionId: required(args, '--action-id'), reason: required(args, '--reason') });
  else if (command === 'register') result = await controllerRegisterTask({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), threadId: required(args, '--thread'), parentThreadId: required(args, '--parent'), title: required(args, '--title'), model: required(args, '--model'), thinking: required(args, '--thinking'), delegationMode: required(args, '--delegation'), executionSurface: required(args, '--execution-surface'), modelClass: required(args, '--model-class'), quotaReason: required(args, '--quota-reason'), workClass: required(args, '--work-class'), decisionStatus: required(args, '--decision-status'), scope: required(args, '--scope'), acceptance: required(args, '--acceptance'), forbiddenDecisions: required(args, '--forbidden-decisions'), taskMode: option(args, '--task-mode'), implementationPolicy: option(args, '--execution-policy'), scopePolicy: option(args, '--scope-policy'), implementationBriefPath: option(args, '--implementation-brief'), implementationContractPath: option(args, '--implementation-contract'), hardContractTrigger: option(args, '--hard-contract-trigger'), hardContractReason: option(args, '--hard-contract-reason'), replacementOfThreadId: option(args, '--replacement-of'), objectiveId: option(args, '--objective-id'), objectiveBudgetMinutes: option(args, '--objective-budget-minutes'), parallelPolicy: option(args, '--parallel-policy'), parallelBatchId: option(args, '--batch-id'), parallelCandidateId: option(args, '--candidate-id') });
  else if (command === 'controller-plan-parallel-batch') result = await controllerPlanParallelBatch({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), manifestPath: required(args, '--manifest') });
  else if (command === 'controller-evaluate-fanout') result = await controllerEvaluateParallelBatch({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), batchId: required(args, '--batch-id') });
  else if (command === 'controller-prepare-parallel-dispatch') result = await controllerPrepareParallelDispatch({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), batchId: required(args, '--batch-id') });
  else if (command === 'controller-close-parallel-batch') result = await controllerCloseParallelBatch({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), batchId: required(args, '--batch-id') });
  else if (command === 'controller-ingest-progress') result = await controllerIngestProgress({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), eventPath: required(args, '--event') });
  else if (command === 'controller-ingest-incidental-repair') result = await controllerIngestIncidentalRepair({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), eventPath: required(args, '--event') });
  else if (command === 'controller-ingest-completion') result = await controllerIngestCompletion({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), eventPath: required(args, '--event') });
  else if (command === 'controller-ingest-failure') result = await controllerIngestFailure({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), eventPath: required(args, '--event'), eventType: required(args, '--event-type') });
  else if (command === 'controller-amend-implementation-contract') result = await controllerAmendImplementationContract({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), threadId: required(args, '--thread'), implementationContractPath: required(args, '--contract'), reason: required(args, '--reason'), hostReceipt: required(args, '--host-receipt') });
  else if (command === 'controller-ingest-notification-failed') result = await controllerIngestNotificationFailed({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), receiptPath: required(args, '--receipt') });
  else if (command === 'controller-query-deliverables') result = await controllerQueryDeliverables({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller') });
  else if (command === 'controller-build-delivery-report') result = await controllerBuildDeliveryReport({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), observabilityMode: option(args, '--observability') ?? 'lean', otelJsonl: option(args, '--otel-jsonl'), desktopLog: option(args, '--desktop-log') });
  else if (command === 'controller-ingest-context-health') result = await controllerIngestContextHealth({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), receiptPath: required(args, '--receipt') });
  else if (command === 'controller-seal-checkpoint') result = await controllerSealCheckpoint({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), manifestPath: required(args, '--manifest') });
  else if (command === 'controller-query-checkpoint') result = await controllerQueryCheckpoint({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), checkpointId: option(args, '--checkpoint') ?? 'latest', mode: option(args, '--mode') ?? 'preload', factId: option(args, '--point') });
  else if (command === 'controller-prepare-handoff') result = await controllerPrepareHandoff({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), successorThreadId: required(args, '--successor'), checkpointId: required(args, '--checkpoint') });
  else if (command === 'controller-accept-handoff') result = await controllerAcceptHandoff({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), successorThreadId: required(args, '--successor'), handoffId: required(args, '--handoff-id'), checkpointDigest: required(args, '--checkpoint-digest') });
  else if (command === 'controller-cancel-handoff') result = await controllerCancelHandoff({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), handoffId: required(args, '--handoff-id'), reason: required(args, '--reason') });
  else if (command === 'controller-scan-events') result = await controllerScanPendingEvents({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), heartbeatGeneration: option(args, '--heartbeat-generation'), heartbeatAutomationId: option(args, '--automation-id'), heartbeatActionId: option(args, '--heartbeat-action-id'), heartbeatOccurrence: option(args, '--heartbeat-occurrence'), heartbeatRrule: option(args, '--heartbeat-rrule'), heartbeatFiredAt: option(args, '--heartbeat-fired-at') });
  else if (command === 'controller-rearm-heartbeat') result = await controllerRearmHeartbeat({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), reason: option(args, '--reason') ?? 'reconcile' });
  else if (command === 'controller-confirm-heartbeat-action') result = await controllerConfirmHeartbeatAction({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), actionId: required(args, '--action-id'), automationId: option(args, '--automation-id'), observed: option(args, '--observed') === 'true', pendingCreateCleanupOutcome: option(args, '--pending-create-cleanup-outcome') });
  else if (command === 'controller-finalize-cycle') result = await controllerFinalizeCycle({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller') });
  else if (command === 'controller-resume-watchdog') result = await controllerResumeWatchdog({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), reason: required(args, '--reason') });
  else if (command === 'controller-assert-business-ready') result = await controllerAssertBusinessReady({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller') });
  else if (command === 'controller-prepare-message') result = await controllerPrepareMessage({ ...controllerInput(args), messageId: option(args, '--message-id'), kind: required(args, '--kind'), deliveryMode: required(args, '--delivery-mode'), targetTurnState: required(args, '--target-turn-state'), messageText: required(args, '--message'), interruptAuthority: option(args, '--interrupt-authority') });
  else if (command === 'controller-release-message') result = await controllerReleaseMessage({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), messageId: required(args, '--message-id'), targetTurnState: required(args, '--target-turn-state') });
  else if (command === 'controller-record-message-delivery') result = await controllerRecordMessageDelivery({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), messageId: required(args, '--message-id'), actionId: required(args, '--action-id'), outcome: required(args, '--outcome'), receipt: option(args, '--receipt'), reason: option(args, '--reason') });
  else if (command === 'controller-record-heartbeat-action-failed') result = await controllerRecordHeartbeatActionFailed({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller'), actionId: required(args, '--action-id'), automationId: option(args, '--automation-id'), reason: required(args, '--reason') });
  else if (command === 'controller-mark-heartbeat-notification-sent') result = await controllerMarkHeartbeatNotificationSent({ ...storage, projectRoot: required(args, '--project-root'), controllerThreadId: required(args, '--controller') });
  else if (command === 'controller-record-dispatched') result = await controllerRecordDispatched({ ...controllerInput(args) });
  else if (command === 'controller-mark-notification-sent') result = await controllerMarkNotificationSent({ ...controllerInput(args), hostReceipt: required(args, '--host-receipt') });
  else if (command === 'mark-changes-requested') result = await controllerMarkChangesRequested({ ...controllerInput(args), failureClass: required(args, '--failure-class'), reason: required(args, '--reason') });
  else if (command === 'controller-dispatch-rework') result = await controllerDispatchRework({ ...controllerInput(args) });
  else if (command === 'controller-confirm-rework-dispatched') result = await controllerConfirmReworkDispatched({ ...controllerInput(args), actionId: required(args, '--action-id'), hostReceipt: required(args, '--host-receipt') });
  else if (command === 'controller-cancel-prepared-rework') result = await controllerCancelPreparedRework({ ...controllerInput(args), reason: required(args, '--reason') });
  else if (command === 'controller-recover-undispatched-attempt') result = await controllerRecoverUndispatchedAttempt({ ...controllerInput(args), reason: required(args, '--reason') });
  else if (command === 'controller-recover-control-plane-candidate') result = await controllerRecoverControlPlaneCandidate({ ...controllerInput(args), controlPlaneComponent: required(args, '--control-plane-component'), candidateCommit: required(args, '--candidate-commit'), resultManifestPath: required(args, '--result-manifest'), skillVersion: required(args, '--skill-version'), reason: required(args, '--reason'), hostReceipt: required(args, '--host-receipt') });
  else if (command === 'controller-reclaim') result = await controllerReclaimTask({ ...controllerInput(args), reason: required(args, '--reason'), userSummary: required(args, '--user-summary') });
  else if (command === 'mark-blocked') result = await controllerMarkBlocked({ ...controllerInput(args), reason: required(args, '--reason'), userSummary: required(args, '--user-summary'), blockerSource: required(args, '--blocker-source'), diagnosticId: option(args, '--diagnostic-id') });
  else if (command === 'controller-record-diagnostic') result = await controllerRecordDiagnostic({ ...controllerInput(args), diagnosticId: required(args, '--diagnostic-id'), classification: required(args, '--classification'), summary: required(args, '--summary'), playerImpact: option(args, '--player-impact'), normalLifecycleReproduction: option(args, '--normal-lifecycle-reproduction'), growthTrend: option(args, '--growth-trend'), whyBlocking: option(args, '--why-blocking'), evidenceRefs: parseEvidenceReferences(options(args, '--evidence-ref')) });
  else if (command === 'controller-mark-closeout-notification-sent') result = await controllerMarkCloseoutNotificationSent({ ...controllerInput(args) });
  else if (command === 'controller-refresh-closeout-report') result = await controllerRefreshCloseoutReport({ ...controllerInput(args) });
  else if (command === 'mark-accepted') result = await controllerMarkAccepted({ ...controllerInput(args), reason: option(args, '--reason'), selectedArtifactIds: options(args, '--selected-artifact') });
  else if (command === 'mark-integrated') result = await controllerMarkIntegrated({ ...controllerInput(args), integrationTargetRef: option(args, '--integration-target-ref') ?? 'HEAD' });
  else if (command === 'controller-record-title-synced') result = await controllerRecordTitleSynced({ ...controllerInput(args), title: required(args, '--title') });
  else if (command === 'controller-record-title-failed') result = await controllerRecordTitleFailed({ ...controllerInput(args), title: required(args, '--title'), reason: required(args, '--reason') });
  else if (command === 'controller-record-archive-succeeded') result = await controllerRecordArchiveSucceeded({ ...controllerInput(args) });
  else if (command === 'controller-record-archive-failed') result = await controllerRecordArchiveFailed({ ...controllerInput(args), reason: required(args, '--reason') });
  else if (command === 'controller-retry-thread-action') result = await controllerRetryThreadAction({ ...controllerInput(args), action: required(args, '--action'), reason: required(args, '--reason') });
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
