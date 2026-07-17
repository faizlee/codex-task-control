import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  TaskControlError,
  auditImplementationContract,
  auditControllerRouting,
  auditParallelRouting,
  controllerAssertBusinessReady,
  controllerConfirmHeartbeatAction,
  controllerBuildDeliveryReport,
  controllerDispatchRework,
  controllerConfirmReworkDispatched,
  controllerCancelPreparedRework,
  controllerRecoverUndispatchedAttempt,
  controllerRecoverControlPlaneCandidate,
  controllerIngestCompletion,
  controllerIngestContextHealth,
  controllerSealCheckpoint,
  controllerQueryCheckpoint,
  controllerPrepareHandoff,
  controllerAcceptHandoff,
  controllerCancelHandoff,
  controllerIngestFailure,
  controllerIngestIncidentalRepair,
  controllerIngestProgress,
  controllerIngestNotificationFailed,
  controllerMarkChangesRequested,
  controllerMarkAccepted,
  controllerMarkBlocked,
  controllerMarkIntegrated,
  controllerMarkNotificationSent,
  controllerMarkCloseoutNotificationSent,
  controllerQueryDeliverables,
  controllerPrepareMessage,
  controllerPlanParallelBatch,
  controllerEvaluateParallelBatch,
  controllerPrepareParallelDispatch,
  controllerReleaseMessage,
  controllerRecordMessageDelivery,
  controllerRecordDiagnostic,
  controllerReclaimTask,
  controllerRefreshCloseoutReport,
  controllerMarkHeartbeatNotificationSent,
  controllerRecordArchiveFailed,
  controllerRecordArchiveSucceeded,
  controllerRecordDispatched,
  controllerRecordHeartbeatActionFailed,
  controllerRecordTitleFailed,
  controllerRecordTitleSynced,
  controllerRegisterTask,
  controllerRearmHeartbeat,
  controllerResumeWatchdog,
  controllerFinalizeCycle,
  controllerRetryThreadAction,
  controllerScanPendingEvents,
  createCompletionEvent,
  createFailureEvent,
  createIncidentalRepairEvent,
  createProgressEvent,
  createNotificationFailureReceipt,
  loadProjectAdapter,
  projectKeyForRoot,
  queryParent,
  queryParentContext,
  querySelf,
  runCli,
} from './task-control.mjs';
import * as taskControlModule from './task-control.mjs';

const delay = () => new Promise((resolve) => setTimeout(resolve, 5));
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function implementationManifest({ visual = false } = {}) {
  return {
    schemaVersion: 3,
    contractRevision: 'contract-r1',
    allowedWritePaths: ['src/existing-parser.js', 'test/existing-parser.test.js'],
    reuseRequirements: ['Reuse the existing parser and test fixture.'],
    forbiddenNewPaths: ['src/replacement/**'],
    forbiddenReimplementations: ['Do not reimplement the existing parser.'],
    stageGates: [
      { id: 'reuse-check', required: true, description: 'Confirm the existing path is reused.', requiredEvidence: ['inspection'] },
      { id: 'verification', required: true, description: 'Run the fixed verification command.', requiredEvidence: ['targeted-test'] },
    ],
    evidenceCommands: [
      { id: 'inspection', command: 'git diff --check', failureMode: 'recoverable', evidenceClass: 'business', environment: 'any' },
      { id: 'targeted-test', command: 'npm test -- contract', failureMode: 'recoverable', evidenceClass: 'business', environment: visual ? 'interactive' : 'any' },
    ],
    errorPolicy: { mode: 'stop_on_error', rules: ['Stop on any ERROR output.', 'Do not weaken acceptance criteria.'] },
    validationPolicy: { executorMayChooseAdditionalEvidence: true, alternativeEvidenceAllowed: true, singleValidatorConclusive: false, guiEvidenceRequiresInteractiveSurface: true },
    resultRequirements: {
      manifestSchemaVersion: 2,
      allowedArtifactRoots: ['artifacts'],
      requiredArtifactTypes: visual ? ['screenshot'] : [],
      requiredMilestones: visual ? ['after'] : [],
      presentationStageId: visual ? 'verification' : null,
    },
    ...(visual ? { visualOracle: { stageId: 'verification', reference: 'docs/oracle.png', criteria: ['No overlap.', 'No ERROR banner.'] } } : {}),
  };
}

function implementationInput(taskControlHome, projectRoot, overrides = {}) {
  const implementationContractPath = overrides.implementationContractPath;
  const hardContract = typeof implementationContractPath === 'string' && implementationContractPath.length > 0;
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
    implementationPolicy: overrides.implementationPolicy ?? (hardContract ? 'hard_contract' : 'adaptive_brief'),
    implementationBriefPath: overrides.implementationBriefPath,
    implementationContractPath,
    hardContractTrigger: overrides.hardContractTrigger ?? (hardContract ? 'high_risk_irreversible' : undefined),
    hardContractReason: overrides.hardContractReason ?? (hardContract ? 'The test fixture explicitly exercises risk-classified hard contract behavior.' : undefined),
  };
}

async function createQuiescentController(taskControlHome, projectRoot, controllerThreadId = 'checkpoint-controller') {
  const input = {
    taskControlHome,
    projectRoot,
    controllerThreadId,
    parentThreadId: controllerThreadId,
    threadId: `${controllerThreadId}-bootstrap`,
    title: 'Bootstrap controller identity',
    model: 'gpt-5.6-luna',
    thinking: 'medium',
    delegationMode: 'explicit',
    executionSurface: 'visible_task',
    modelClass: 'economical',
    quotaReason: 'A bounded ledger bootstrap avoids premium controller work.',
    workClass: 'repeatable',
    decisionStatus: 'resolved',
    scope: 'Create only the temporary controller identity fixture.',
    acceptance: 'The controller identity is present in the temporary registry.',
    forbiddenDecisions: 'Do not change routing or project policy.',
    taskMode: 'control_only',
  };
  await controllerRegisterTask(input);
  const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  registry.tasks = [];
  registry.updatedAt = new Date().toISOString();
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  return { input, registryPath, projectKey: projectKeyForRoot(projectRoot) };
}

async function createGitCandidate(projectRoot, label = 'candidate') {
  execFileSync('git', ['-C', projectRoot, 'init'], { stdio: 'ignore' });
  execFileSync('git', ['-C', projectRoot, 'config', 'user.email', 'task-control@example.invalid'], { stdio: 'ignore' });
  execFileSync('git', ['-C', projectRoot, 'config', 'user.name', 'Task Control Test'], { stdio: 'ignore' });
  await writeFile(join(projectRoot, `${label}.txt`), `${label}\n`, 'utf8');
  execFileSync('git', ['-C', projectRoot, 'add', '.'], { stdio: 'ignore' });
  execFileSync('git', ['-C', projectRoot, 'commit', '-m', label], { stdio: 'ignore' });
  return execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function createGitWorktreeFixture(projectRoot, worktreeRoot, branch = 'task/result-worktree') {
  const baseCommit = await createGitCandidate(projectRoot, 'base');
  execFileSync('git', ['-C', projectRoot, 'worktree', 'add', '-b', branch, worktreeRoot, baseCommit], { stdio: 'ignore' });
  await writeFile(join(worktreeRoot, 'business-result.txt'), 'candidate business result\n', 'utf8');
  execFileSync('git', ['-C', worktreeRoot, 'add', 'business-result.txt'], { stdio: 'ignore' });
  execFileSync('git', ['-C', worktreeRoot, 'commit', '-m', 'candidate business result'], { stdio: 'ignore' });
  const candidateCommit = execFileSync('git', ['-C', worktreeRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { baseCommit, candidateCommit, branch };
}

async function assertForgedPredecessorCannotCreateVerification({ name, forge, expectedCode }) {
  const taskControlHome = await mkdtemp(join(tmpdir(), `codex-task-control-forged-${name}-home-`));
  const projectRoot = await mkdtemp(join(tmpdir(), `codex-task-control-forged-${name}-project-`));
  const input = implementationInput(taskControlHome, projectRoot, { threadId: `forged-${name}-worker`, implementationContractPath: 'implementation-contract.json' });
  try {
    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(implementationManifest(), null, 2)}\n`, 'utf8');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerRecordDispatched(input);
    const validPredecessorPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'valid predecessor shape', stageId: 'reuse-check', evidence: [{ id: 'inspection', reference: 'inspection.txt' }] });
    const validPredecessor = JSON.parse(await readFile(validPredecessorPath, 'utf8'));
    await rm(validPredecessorPath);
    const eventDir = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'events', input.threadId);
    await mkdir(eventDir, { recursive: true });
    for (const [index, event] of forge(validPredecessor).entries()) await writeFile(join(eventDir, `progress-${name}-${index}.json`), `${JSON.stringify(event, null, 2)}\n`, 'utf8');
    await assert.rejects(createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'verification must not trust forged predecessor', stageId: 'verification', evidence: [{ id: 'targeted-test', reference: 'targeted.txt' }] }), (error) => error instanceof TaskControlError && error.code === expectedCode, name);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
}

function parallelCandidate({ candidateId, title, lane, workClass, taskMode, projectRoot, conflictDomains = [], dependencies = [], reviewCost = 1, blockingReasons = [] }) {
  return {
    candidateId,
    title,
    incrementalValue: `Produces an independently reviewable ${lane} result for ${candidateId}.`,
    lane,
    workClass,
    taskMode,
    conflictDomains,
    dependencies,
    reviewCost,
    estimatedMinutes: 30,
    blockingReasons,
    persistentLane: false,
    worktreeIdentity: ['implementation', 'visual_implementation'].includes(taskMode) ? { baseCommit: 'base-commit', worktreePath: join(projectRoot, `worktree-${candidateId}`), branch: `task/${candidateId}`, lastMainSyncCommit: 'base-commit', cleanupOwner: 'parallel-controller' } : null,
  };
}

function parallelManifest(projectRoot, candidates, overrides = {}) {
  return {
    schemaVersion: 1,
    batchId: overrides.batchId ?? 'batch-1',
    objective: overrides.objective ?? 'Execute independent implementation and verification lanes concurrently.',
    dispatchAuthority: 'controller_resolved',
    reviewCapacity: overrides.reviewCapacity ?? 3,
    wipLimits: overrides.wipLimits ?? { total: 3, implementation: 1, qa: 1, no_code: 1, readonly: 1 },
    dirtyConflictDomains: overrides.dirtyConflictDomains ?? [],
    degradationReceipt: overrides.degradationReceipt ?? null,
    candidates,
  };
}

function parallelRegistration(taskControlHome, projectRoot, candidate, threadId, overrides = {}) {
  const bounded = candidate.workClass === 'bounded_reasoning';
  return {
    taskControlHome,
    projectRoot,
    controllerThreadId: 'parallel-controller',
    parentThreadId: 'parallel-controller',
    threadId,
    title: candidate.title,
    model: bounded ? 'gpt-5.6-terra' : 'gpt-5.6-luna',
    thinking: 'medium',
    delegationMode: 'explicit',
    executionSurface: 'visible_task',
    modelClass: 'economical',
    quotaReason: 'Parallel bounded work saves frontier quota and wall-clock time.',
    workClass: candidate.workClass,
    decisionStatus: 'resolved',
    scope: 'Only execute the candidate scope recorded in the parallel batch.',
    acceptance: 'Return the candidate evidence required by the batch contract.',
    forbiddenDecisions: 'Do not change contracts, conflict domains, dependencies, or review capacity.',
    taskMode: candidate.taskMode,
    implementationPolicy: overrides.implementationContractPath ? 'hard_contract' : (['implementation', 'visual_implementation'].includes(candidate.taskMode) ? 'adaptive_brief' : undefined),
    implementationContractPath: overrides.implementationContractPath,
    hardContractTrigger: overrides.implementationContractPath ? 'parallel_coordination' : undefined,
    hardContractReason: overrides.implementationContractPath ? 'The parallel fixture coordinates shared candidate paths across an explicit batch.' : undefined,
    parallelPolicy: 'batch_v1',
    parallelBatchId: overrides.batchId ?? 'batch-1',
    parallelCandidateId: candidate.candidateId,
  };
}

async function writeResultManifest(taskControlHome, projectRoot, threadId, candidateCommit, { visual = false, mutate = null, workspaceRoot = projectRoot, manifestRelativePath = null } = {}) {
  const task = (await querySelf({ taskControlHome, selfThreadId: threadId })).task;
  const artifactDir = join(workspaceRoot, 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  const artifacts = [];
  if (visual) {
    const screenshotPath = join(artifactDir, `after-${task.attemptCount}.png`);
    await writeFile(screenshotPath, onePixelPng);
    artifacts.push({ id: `after-${task.attemptCount}`, type: 'screenshot', milestone: 'after', label: 'Current result', description: 'Decoded visual result for controller review.', createdAt: new Date().toISOString(), sourceStageId: task.implementationPolicy === 'adaptive_brief' ? 'presentation' : 'verification', sourceTaskThreadId: task.threadId, workspaceRole: 'candidate_worktree', path: screenshotPath });
  }
  let manifest = {
    schemaVersion: task.resultProtocolVersion,
    projectKey: projectKeyForRoot(projectRoot),
    controllerThreadId: task.directControllerThreadId,
    threadId: task.threadId,
    displayKey: task.displayKey,
    attempt: task.attemptCount,
    implementationPolicy: task.implementationPolicy,
    contractVersion: task.implementationPolicy === 'adaptive_brief' ? `brief-v${task.briefSchemaVersion}` : (task.contractRevision ?? task.contractCommit),
    contractDigest: task.contractDigest,
    candidateCommit,
    integrationStatus: 'candidate',
    userVisibleSummary: visual ? 'A visible result is ready for review.' : 'The bounded implementation and targeted verification are complete.',
    actualChanges: ['Updated only the contract-bound implementation path.'],
    affectedFiles: [{ path: 'src/existing-parser.js', changeType: 'modified', reason: 'This is the existing implementation selected after tracing the real call path.' }],
    validationRationale: 'The selected targeted test exercises the changed logic; visual fixtures also use an interactive screenshot surface.',
    incompleteItems: [],
    testSummary: { status: 'passed', summary: 'Targeted verification passed.', commands: ['npm test -- contract'], metrics: [{ label: 'failed tests', before: 1, after: 0, unit: 'tests' }] },
    noScreenshotReason: visual ? null : 'This implementation changes contract behavior without a player-visible surface.',
    artifacts,
  };
  if (mutate) manifest = mutate(manifest) ?? manifest;
  const manifestPath = manifestRelativePath === null ? join(workspaceRoot, `result-${threadId}-${task.attemptCount}.json`) : join(workspaceRoot, manifestRelativePath);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

async function createResultProtocolFixture({ visual = false } = {}) {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-result-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-result-project-'));
  const contractPath = join(projectRoot, 'implementation-contract.json');
  await writeFile(contractPath, `${JSON.stringify(implementationManifest({ visual }), null, 2)}\n`, 'utf8');
  const input = implementationInput(taskControlHome, projectRoot, { taskMode: visual ? 'visual_implementation' : 'implementation', implementationContractPath: 'implementation-contract.json' });
  const registered = await controllerRegisterTask(input);
  await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
  await controllerRecordDispatched(input);
  await delay();
  const reuse = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Existing path inspected and retained.', stageId: 'reuse-check', evidence: [{ id: 'inspection', reference: 'git-diff-check.txt' }] });
  await controllerIngestProgress({ ...input, eventPath: reuse });
  await delay();
  const verification = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Targeted verification passed.', stageId: 'verification', evidence: [{ id: 'targeted-test', reference: 'test-output.txt' }] });
  await controllerIngestProgress({ ...input, eventPath: verification });
  return { taskControlHome, projectRoot, input };
}

async function createHeartbeatFixture(taskControlHome, projectRoot, overrides = {}) {
  const input = {
    taskControlHome,
    projectRoot,
    controllerThreadId: overrides.controllerThreadId ?? 'heartbeat-v2-controller',
    parentThreadId: overrides.controllerThreadId ?? 'heartbeat-v2-controller',
    threadId: overrides.threadId ?? 'heartbeat-v2-worker',
    title: 'Run bounded heartbeat work',
    model: 'gpt-5.6-luna',
    thinking: 'medium',
    delegationMode: 'explicit',
    executionSurface: 'visible_task',
    modelClass: 'economical',
    quotaReason: 'Repeatable checks save meaningful frontier quota.',
    workClass: 'repeatable',
    decisionStatus: 'resolved',
    scope: 'Only run the named bounded check.',
    acceptance: 'The named check exits with code zero.',
    forbiddenDecisions: 'Do not change contracts or error policy.',
    taskMode: 'control_only',
  };
  const registered = await controllerRegisterTask(input);
  await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
  const dispatched = await controllerRecordDispatched(input);
  return { input, dispatched };
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

test('parallel batch requires and dispatches an implementation plus independent QA candidate as one wave', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-project-'));
  try {
    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(implementationManifest(), null, 2)}\n`, 'utf8');
    const code = parallelCandidate({ candidateId: 'code', title: 'Implement bounded module', lane: 'implementation', workClass: 'bounded_reasoning', taskMode: 'implementation', projectRoot, conflictDomains: ['module-a'] });
    const qa = parallelCandidate({ candidateId: 'qa', title: 'Verify independent acceptance', lane: 'qa', workClass: 'repeatable', taskMode: 'control_only', projectRoot });
    const manifest = parallelManifest(projectRoot, [code, qa]);
    await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const planned = await controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' });
    assert.equal(planned.batch.fanoutRequired, true);
    assert.deepEqual(planned.batch.requiredFanoutCandidateIds, ['code', 'qa']);

    const codeInput = parallelRegistration(taskControlHome, projectRoot, code, 'parallel-code', { implementationContractPath: 'implementation-contract.json' });
    const codeTask = await controllerRegisterTask(codeInput);
    await controllerRecordTitleSynced({ ...codeInput, title: codeTask.desiredThreadTitle });
    const qaInput = parallelRegistration(taskControlHome, projectRoot, qa, 'parallel-qa');
    const qaTask = await controllerRegisterTask(qaInput);
    await controllerRecordTitleSynced({ ...qaInput, title: qaTask.desiredThreadTitle });

    const evaluated = await controllerEvaluateParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', batchId: 'batch-1' });
    assert.equal(evaluated.batch.fanoutRequired, true);
    const prepared = await controllerPrepareParallelDispatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', batchId: 'batch-1' });
    assert.equal(prepared.requiredDispatches.length, 2);
    assert.deepEqual(prepared.requiredDispatches.map((entry) => entry.candidateId), ['code', 'qa']);
    const duringWave = await controllerScanPendingEvents({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller' });
    assert.equal(duringWave.pendingParallelDispatches.length, 2);
    assert.equal(duringWave.shouldKeepHeartbeat, true);

    await controllerRecordDispatched(codeInput);
    const halfWave = await controllerScanPendingEvents({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller' });
    assert.equal(halfWave.pendingParallelDispatches.length, 1);
    await controllerRecordDispatched(qaInput);
    const running = await controllerScanPendingEvents({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller' });
    assert.equal(running.pendingParallelDispatches.length, 0);
    assert.equal(running.activeTasks.length, 2);
    assert.equal((await auditParallelRouting({ taskControlHome })).compliant, true);

    await delay();
    const qaCompletion = await createCompletionEvent({ taskControlHome, selfThreadId: qaInput.threadId, candidateCommit: 'qa-result-1' });
    await controllerIngestCompletion({ ...qaInput, eventPath: qaCompletion });
    await controllerMarkAccepted({ ...qaInput, reason: 'Independent QA passed.' });
    await controllerMarkIntegrated(qaInput);
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    const codeRecord = registry.tasks.find((entry) => entry.threadId === codeInput.threadId);
    codeRecord.lastDispatchedAttempt = 0;
    codeRecord.lastDispatchedAt = null;
    codeRecord.updatedAt = new Date().toISOString();
    registry.updatedAt = codeRecord.updatedAt;
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    const shrunk = await controllerEvaluateParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', batchId: 'batch-1' });
    assert.equal(shrunk.batch.naturalBatchShrink, true);
    assert.equal(shrunk.batch.singleDispatchAllowed, true);
    assert.equal((await auditParallelRouting({ taskControlHome })).compliant, true);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('single candidate dispatch fails closed without a schema-v1 degradation receipt', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-single-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-single-project-'));
  try {
    const qa = parallelCandidate({ candidateId: 'qa-only', title: 'Run the only safe QA task', lane: 'qa', workClass: 'repeatable', taskMode: 'control_only', projectRoot });
    await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(parallelManifest(projectRoot, [qa]), null, 2)}\n`, 'utf8');
    await controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' });
    const input = parallelRegistration(taskControlHome, projectRoot, qa, 'qa-only-thread');
    const task = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: task.desiredThreadTitle });
    await assert.rejects(controllerPrepareParallelDispatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', batchId: 'batch-1' }), (error) => error instanceof TaskControlError && error.code === 'PARALLEL_FANOUT_REQUIRED');
    const audit = await auditParallelRouting({ taskControlHome });
    assert.equal(audit.compliant, false);
    assert.equal(audit.violations.some((entry) => entry.reason === 'single_candidate_without_degradation_receipt'), true);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('recorded degradation permits one bounded dispatch while preserving evidence', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-degraded-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-degraded-project-'));
  try {
    const qa = parallelCandidate({ candidateId: 'qa-only', title: 'Run bounded serial QA', lane: 'qa', workClass: 'repeatable', taskMode: 'control_only', projectRoot });
    const degradationReceipt = { reason: 'insufficient_independent_candidates', summary: 'Every other candidate still depends on an unresolved controller decision.', evidence: ['candidate-matrix:only-qa-eligible'] };
    await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(parallelManifest(projectRoot, [qa], { degradationReceipt }), null, 2)}\n`, 'utf8');
    await controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' });
    const input = parallelRegistration(taskControlHome, projectRoot, qa, 'qa-degraded-thread');
    const task = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: task.desiredThreadTitle });
    const prepared = await controllerPrepareParallelDispatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', batchId: 'batch-1' });
    assert.deepEqual(prepared.requiredDispatches.map((entry) => entry.candidateId), ['qa-only']);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('conflict domains and review capacity prevent unsafe fan-out', async () => {
  for (const mode of ['conflict', 'review']) {
    const taskControlHome = await mkdtemp(join(tmpdir(), `codex-task-control-parallel-${mode}-home-`));
    const projectRoot = await mkdtemp(join(tmpdir(), `codex-task-control-parallel-${mode}-project-`));
    try {
      const first = parallelCandidate({ candidateId: 'qa-a', title: 'Run QA A', lane: 'qa', workClass: 'repeatable', taskMode: 'control_only', projectRoot, conflictDomains: mode === 'conflict' ? ['shared-runner'] : [] });
      const second = parallelCandidate({ candidateId: 'qa-b', title: 'Run QA B', lane: 'readonly', workClass: 'repeatable', taskMode: 'control_only', projectRoot, conflictDomains: mode === 'conflict' ? ['shared-runner'] : [] });
      const manifest = parallelManifest(projectRoot, [first, second], mode === 'review' ? { reviewCapacity: 1 } : {});
      await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      const planned = await controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' });
      assert.equal(planned.batch.fanoutRequired, false);
      assert.equal(planned.batch.selectedCandidateIds.length, 1);
      assert.equal(planned.batch.fanoutBlockers.includes('degradation_receipt_required'), true);
    } finally {
      await rm(taskControlHome, { recursive: true, force: true });
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
});

test('dependencies and dirty worktree domains defer only affected candidates without starting an empty heartbeat', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-dependency-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-dependency-project-'));
  try {
    const first = parallelCandidate({ candidateId: 'source', title: 'Produce source candidate', lane: 'qa', workClass: 'repeatable', taskMode: 'control_only', projectRoot });
    const dependent = parallelCandidate({ candidateId: 'dependent', title: 'Consume integrated source', lane: 'readonly', workClass: 'repeatable', taskMode: 'control_only', projectRoot, dependencies: [{ candidateId: 'source', requiredState: 'integrated' }] });
    const dirty = parallelCandidate({ candidateId: 'dirty', title: 'Inspect dirty domain', lane: 'no_code', workClass: 'repeatable', taskMode: 'control_only', projectRoot, conflictDomains: ['dirty-domain'] });
    const manifest = parallelManifest(projectRoot, [first, dependent, dirty], { dirtyConflictDomains: ['dirty-domain'] });
    await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const planned = await controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' });
    assert.equal(planned.batch.candidateStates.find((entry) => entry.candidateId === 'dependent').state, 'deferred');
    assert.equal(planned.batch.candidateStates.find((entry) => entry.candidateId === 'dependent').blockers.includes('unresolved_dependencies'), true);
    assert.equal(planned.batch.candidateStates.find((entry) => entry.candidateId === 'dirty').blockers.includes('dirty_conflict_domain'), true);
    const scan = await controllerScanPendingEvents({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller' });
    assert.equal(scan.shouldKeepHeartbeat, false);
    assert.equal(scan.heartbeatState, null);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('implementation candidates require a separate worktree identity chain', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-worktree-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-worktree-project-'));
  try {
    const candidate = parallelCandidate({ candidateId: 'code', title: 'Implement code', lane: 'implementation', workClass: 'bounded_reasoning', taskMode: 'implementation', projectRoot, conflictDomains: ['module-a'] });
    candidate.worktreeIdentity = null;
    await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(parallelManifest(projectRoot, [candidate]), null, 2)}\n`, 'utf8');
    await assert.rejects(controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' }), (error) => error instanceof TaskControlError && error.code === 'PARALLEL_BATCH_INVALID');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('parallel candidates must state independent incremental value instead of padding the count', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-value-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-value-project-'));
  try {
    const qa = parallelCandidate({ candidateId: 'padding-qa', title: 'Ceremonial QA', lane: 'qa', workClass: 'repeatable', taskMode: 'control_only', projectRoot });
    delete qa.incrementalValue;
    await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(parallelManifest(projectRoot, [qa], { degradationReceipt: { reason: 'insufficient_independent_candidates', summary: 'Only one candidate is currently safe.', evidence: ['candidate-matrix'] } }), null, 2)}\n`, 'utf8');
    await assert.rejects(controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' }), (error) => error instanceof TaskControlError && error.code === 'PARALLEL_CANDIDATE_VALUE_REQUIRED');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('thread debt gate blocks a new batch while direct review work is pending', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-debt-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-debt-project-'));
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot, { controllerThreadId: 'parallel-controller', threadId: 'debt-worker' });
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'parallel-debt-heartbeat-1' });
    await delay();
    const completion = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'debt-candidate' });
    const ingested = await controllerIngestCompletion({ ...input, eventPath: completion });
    await controllerConfirmHeartbeatAction({ ...input, actionId: ingested.heartbeatAction.actionId, automationId: 'parallel-debt-heartbeat-2' });
    const qa = parallelCandidate({ candidateId: 'qa', title: 'Run later QA', lane: 'qa', workClass: 'repeatable', taskMode: 'control_only', projectRoot });
    await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(parallelManifest(projectRoot, [qa], { degradationReceipt: { reason: 'insufficient_independent_candidates', summary: 'Only the QA lane is currently safe.', evidence: ['candidate-matrix:qa-only'] } }), null, 2)}\n`, 'utf8');
    await assert.rejects(controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' }), (error) => error instanceof TaskControlError && error.code === 'PARALLEL_THREAD_DEBT_BLOCKED');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('legacy registrations remain readable but the parallel audit labels their migration debt', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-legacy-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-parallel-legacy-project-'));
  try {
    const input = {
      taskControlHome, projectRoot, controllerThreadId: 'legacy-controller', parentThreadId: 'legacy-controller', threadId: 'legacy-worker', title: 'Legacy compatible worker', model: 'gpt-5.6-luna', thinking: 'medium', delegationMode: 'explicit', executionSurface: 'visible_task', modelClass: 'economical', quotaReason: 'Legacy compatibility remains explicit during schema migration.', workClass: 'repeatable', decisionStatus: 'resolved', scope: 'Only run the named legacy check.', acceptance: 'The legacy check exits with code zero.', forbiddenDecisions: 'Do not change contracts or routing.', taskMode: 'control_only',
    };
    const task = await controllerRegisterTask(input);
    assert.equal(task.parallelProtocolVersion, 0);
    assert.equal((await querySelf({ taskControlHome, selfThreadId: input.threadId })).task.parallelProtocolVersion, 0);
    const audit = await auditParallelRouting({ taskControlHome });
    assert.equal(audit.compliant, false);
    assert.equal(audit.violations[0].reason, 'legacy_parallel_contract_missing');
    await assert.rejects(controllerRegisterTask({ ...input, threadId: 'batch-required', parallelPolicy: 'batch_v1' }), (error) => error instanceof TaskControlError && error.code === 'PARALLEL_BATCH_BINDING_REQUIRED');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('implementation defaults to an adaptive brief and hard contract requires explicit risk evidence', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-contract-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-contract-project-'));
  try {
    const input = implementationInput(taskControlHome, projectRoot);
    const adaptive = await controllerRegisterTask(input);
    assert.equal(adaptive.implementationPolicy, 'adaptive_brief');
    assert.equal(adaptive.scopePolicy, 'bounded_incidental');
    assert.deepEqual(adaptive.incidentalRepairs, []);
    assert.deepEqual(adaptive.allowedWritePaths, []);
    assert.deepEqual(adaptive.stageGates, []);
    assert.deepEqual(adaptive.evidenceCommands, []);
    assert.equal(adaptive.implementationBrief.executorExploresBeforeEditing, true);
    await writeFile(join(projectRoot, 'rigid-brief.json'), `${JSON.stringify({ schemaVersion: 1, objective: 'Do the work.', allowedWritePaths: ['src/fixed.ts'] }, null, 2)}\n`, 'utf8');
    await assert.rejects(controllerRegisterTask({ ...implementationInput(taskControlHome, projectRoot, { threadId: 'rigid-brief-worker', implementationBriefPath: 'rigid-brief.json' }) }), (error) => error instanceof TaskControlError && error.code === 'IMPLEMENTATION_BRIEF_INVALID');
    await assert.rejects(controllerRegisterTask({ ...input, threadId: 'missing-task-mode', taskMode: undefined }), (error) => error instanceof TaskControlError && error.code === 'TASK_MODE_REQUIRED');
    await assert.rejects(controllerRegisterTask({ ...input, threadId: 'missing-hard-contract', implementationPolicy: 'hard_contract', hardContractTrigger: 'high_risk_irreversible', hardContractReason: 'This irreversible operation requires a bounded controller-owned safety contract.' }), (error) => error instanceof TaskControlError && error.code === 'IMPLEMENTATION_CONTRACT_REQUIRED');
    const legacyContract = implementationManifest();
    delete legacyContract.resultRequirements;
    await writeFile(join(projectRoot, 'legacy-contract.json'), `${JSON.stringify(legacyContract, null, 2)}\n`, 'utf8');
    await assert.rejects(controllerRegisterTask(implementationInput(taskControlHome, projectRoot, { threadId: 'missing-result-requirements', implementationContractPath: 'legacy-contract.json' })), (error) => error instanceof TaskControlError && error.code === 'RESULT_REQUIREMENTS_REQUIRED');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('adaptive implementation explores freely and completes with actual files plus worker-chosen evidence', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-adaptive-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-adaptive-project-'));
  const input = implementationInput(taskControlHome, projectRoot, { threadId: 'adaptive-worker' });
  try {
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerRecordDispatched(input);
    const progressPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Traced the real owner and selected focused logic evidence.', evidence: [{ id: 'headless-logic', reference: 'logs/focused-test.txt' }] });
    const progressed = await controllerIngestProgress({ ...input, eventPath: progressPath });
    assert.equal(progressed.implementationPolicy, 'adaptive_brief');
    assert.deepEqual(progressed.missingStages, []);
    const resultManifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'adaptive-candidate');
    const eventPath = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'adaptive-candidate', resultManifestPath });
    const completed = await controllerIngestCompletion({ ...input, eventPath });
    assert.equal(completed.status, 'awaiting_review');
    assert.equal(completed.deliverableHistory.at(-1).affectedFiles[0].path, 'src/existing-parser.js');
    assert.match(completed.deliverableHistory.at(-1).validationRationale, /selected targeted test/i);
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, observabilityMode: 'lean' });
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /实际影响文件与理由/);
    assert.match(html, /src\/existing-parser\.js/);
    assert.match(html, /为什么选择这些验证/);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('adaptive visual acceptance keeps a same-domain reversible GUI repair in the same task', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-incidental-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-incidental-project-'));
  const input = implementationInput(taskControlHome, projectRoot, { threadId: 'gui-acceptance-worker', taskMode: 'visual_implementation' });
  try {
    const registered = await controllerRegisterTask(input);
    assert.equal(registered.scopePolicy, 'bounded_incidental');
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerRecordDispatched(input);
    const eventPath = await createIncidentalRepairEvent({
      taskControlHome,
      selfThreadId: input.threadId,
      repairId: 'battle-result-input-route',
      originalBlocker: 'The full-screen result layer consumes the next-button click.',
      sameObjectiveReason: 'The repair restores the same battle-result acceptance flow already under test.',
      functionalDomain: 'battle-result-ui',
      affectedFiles: [{ path: 'ui/BattleResultOverlay.gd', changeType: 'modified', reason: 'This is the real owner of the input routing defect discovered during acceptance.' }],
      conflictDomains: [],
      localOnly: true,
      reversible: true,
      riskFlags: [],
      riskAssessment: 'One local input-routing property changes; no product rule, save data, dependency, or external effect is involved.',
      redEvidence: [{ id: 'gui-red', reference: 'artifacts/button-click-blocked.png' }],
      greenEvidence: [{ id: 'gui-green', reference: 'artifacts/button-click-advances.png' }],
    });
    const hiddenManifest = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'gui-candidate-hidden', { visual: true });
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'gui-candidate-hidden', resultManifestPath: hiddenManifest }), (error) => error instanceof TaskControlError && error.code === 'INCIDENTAL_REPAIR_RESULT_MISMATCH');
    const resultManifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'gui-candidate', { visual: true, mutate: (manifest) => ({ ...manifest, affectedFiles: [...manifest.affectedFiles, { path: 'ui/BattleResultOverlay.gd', changeType: 'modified', reason: 'Same-domain incidental repair restored the acceptance flow.' }] }) });
    const completionPath = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'gui-candidate', resultManifestPath });
    await assert.rejects(controllerIngestCompletion({ ...input, eventPath: completionPath }), (error) => error instanceof TaskControlError && error.code === 'INCIDENTAL_REPAIR_INGEST_REQUIRED');
    const ingested = await controllerIngestIncidentalRepair({ ...input, eventPath });
    assert.equal(ingested.status, 'executing');
    assert.equal(ingested.attemptCount, 1);
    assert.equal(ingested.failureHistory.length, 0);
    assert.equal(ingested.incidentalRepairs.length, 1);
    assert.equal(ingested.objectiveId, `objective-${input.threadId}`);
    const completed = await controllerIngestCompletion({ ...input, eventPath: completionPath });
    assert.equal(completed.status, 'awaiting_review');
    assert.equal(completed.failureHistory.length, 0);
    assert.equal(completed.replacementOrdinal, 0);
    const deliverables = await controllerQueryDeliverables({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(deliverables.tasks[0].objective.failedReplacementCount, 0);
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, observabilityMode: 'lean' });
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /同任务有界附带修复/);
    assert.match(html, /BattleResultOverlay\.gd/);
    assert.match(html, /不计入失败、替换或熔断/);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('incidental repair escalates risk and cross-domain work while strict and hard contracts stay closed', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-incidental-gates-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-incidental-gates-project-'));
  const baseRepair = { taskControlHome, repairId: 'gate-check', originalBlocker: 'A local acceptance defect was observed.', sameObjectiveReason: 'The proposed change claims to serve the original acceptance.', functionalDomain: 'local-ui', affectedFiles: [{ path: 'ui/Owner.gd', changeType: 'modified', reason: 'Observed owner.' }], conflictDomains: [], localOnly: true, reversible: true, riskFlags: [], riskAssessment: 'Bounded risk assessment.', redEvidence: [{ id: 'red', reference: 'red.txt' }], greenEvidence: [{ id: 'green', reference: 'green.txt' }] };
  try {
    const adaptiveInput = implementationInput(taskControlHome, projectRoot, { threadId: 'adaptive-gate-worker' });
    const adaptive = await controllerRegisterTask(adaptiveInput);
    await controllerRecordTitleSynced({ ...adaptiveInput, title: adaptive.desiredThreadTitle });
    await controllerRecordDispatched(adaptiveInput);
    await assert.rejects(createIncidentalRepairEvent({ ...baseRepair, selfThreadId: adaptiveInput.threadId, riskFlags: ['economyDecision'] }), (error) => error instanceof TaskControlError && error.code === 'INCIDENTAL_REPAIR_ESCALATION_REQUIRED');
    await assert.rejects(createIncidentalRepairEvent({ ...baseRepair, selfThreadId: adaptiveInput.threadId, conflictDomains: ['other-domain'] }), (error) => error instanceof TaskControlError && error.code === 'INCIDENTAL_REPAIR_CROSS_CONFLICT_DOMAIN');

    const strictInput = implementationInput(taskControlHome, projectRoot, { threadId: 'strict-gate-worker' });
    const strict = await controllerRegisterTask({ ...strictInput, scopePolicy: 'strict_scope' });
    await controllerRecordTitleSynced({ ...strictInput, title: strict.desiredThreadTitle });
    await controllerRecordDispatched(strictInput);
    await assert.rejects(createIncidentalRepairEvent({ ...baseRepair, selfThreadId: strictInput.threadId }), (error) => error instanceof TaskControlError && error.code === 'INCIDENTAL_REPAIR_NOT_ALLOWED');

    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(implementationManifest(), null, 2)}\n`, 'utf8');
    const hardInput = implementationInput(taskControlHome, projectRoot, { threadId: 'hard-gate-worker', implementationContractPath: 'implementation-contract.json' });
    await assert.rejects(controllerRegisterTask({ ...hardInput, scopePolicy: 'bounded_incidental' }), (error) => error instanceof TaskControlError && error.code === 'HARD_CONTRACT_SCOPE_POLICY_INVALID');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('parallel candidate completion resolves manifests and artifacts from the registered Windows worktree', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-worktree-result-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-worktree-result-main-'));
  const worktreeRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-worktree-result-candidate-'));
  const adjacentRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-worktree-result-adjacent-'));
  try {
    await rm(worktreeRoot, { recursive: true, force: true });
    const git = await createGitWorktreeFixture(projectRoot, worktreeRoot);
    const candidate = parallelCandidate({ candidateId: 'visual-result', title: 'Validate candidate worktree result', lane: 'implementation', workClass: 'bounded_reasoning', taskMode: 'visual_implementation', projectRoot, conflictDomains: ['battle-result-ui'] });
    candidate.worktreeIdentity = { baseCommit: git.baseCommit, worktreePath: worktreeRoot.replaceAll('\\', '/').toUpperCase(), branch: git.branch, lastMainSyncCommit: git.baseCommit, cleanupOwner: 'parallel-controller' };
    const batch = parallelManifest(projectRoot, [candidate], { degradationReceipt: { reason: 'insufficient_independent_candidates', summary: 'Only the completed candidate result needs protocol verification.', evidence: ['candidate-worktree-result'] } });
    await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    await controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' });
    const input = parallelRegistration(taskControlHome, projectRoot, candidate, 'worktree-result-worker');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerPrepareParallelDispatch({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, batchId: 'batch-1' });
    await controllerRecordDispatched(input);
    const manifestRelativePath = 'docs/test-reports/result-manifest-v2.json';
    const manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, git.candidateCommit, { visual: true, workspaceRoot: worktreeRoot, manifestRelativePath });
    await writeFile(join(adjacentRoot, 'result-manifest-v2.json'), await readFile(manifestPath), 'utf8');
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: git.candidateCommit, resultManifestPath: join(adjacentRoot, 'result-manifest-v2.json') }), (error) => error instanceof TaskControlError && error.code === 'RESULT_MANIFEST_OUTSIDE_WORKTREE');
    execFileSync('git', ['-C', worktreeRoot, 'checkout', '-b', 'unexpected-result-branch'], { stdio: 'ignore' });
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: git.candidateCommit, resultManifestPath: manifestRelativePath }), (error) => error instanceof TaskControlError && error.code === 'RESULT_WORKTREE_BRANCH_MISMATCH');
    execFileSync('git', ['-C', worktreeRoot, 'checkout', git.branch], { stdio: 'ignore' });
    await writeFile(join(projectRoot, 'main-later.txt'), 'not an ancestor of the candidate\n', 'utf8');
    execFileSync('git', ['-C', projectRoot, 'add', 'main-later.txt'], { stdio: 'ignore' });
    execFileSync('git', ['-C', projectRoot, 'commit', '-m', 'main later'], { stdio: 'ignore' });
    const unrelatedBase = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    registry.tasks.find((task) => task.threadId === input.threadId).parallelWorktreeIdentity.baseCommit = unrelatedBase;
    registry.parallelBatches[0].candidates.find((entry) => entry.candidateId === candidate.candidateId).worktreeIdentity.baseCommit = unrelatedBase;
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: git.candidateCommit, resultManifestPath: manifestRelativePath }), (error) => error instanceof TaskControlError && error.code === 'RESULT_WORKTREE_BASE_MISMATCH');
    registry.tasks.find((task) => task.threadId === input.threadId).parallelWorktreeIdentity.baseCommit = git.baseCommit;
    registry.parallelBatches[0].candidates.find((entry) => entry.candidateId === candidate.candidateId).worktreeIdentity.baseCommit = git.baseCommit;
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    const eventPath = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: git.candidateCommit, resultManifestPath: manifestRelativePath.replaceAll('/', '\\') });
    const event = JSON.parse(await readFile(eventPath, 'utf8'));
    assert.equal(event.resultManifest.sourceWorkspace.workspaceRole, 'candidate_worktree');
    assert.equal(event.resultManifest.sourceWorkspace.branch, git.branch);
    assert.equal(event.resultManifest.sourceWorkspace.candidateCommit, git.candidateCommit);
    assert.ok(event.resultManifest.artifacts.every((artifact) => artifact.workspaceRole === 'candidate_worktree' && artifact.path.toLowerCase().startsWith(worktreeRoot.toLowerCase())));
    const completed = await controllerIngestCompletion({ ...input, eventPath });
    assert.equal(completed.status, 'awaiting_review');
    assert.equal(completed.deliverableHistory.at(-1).sourceWorkspace.workspaceRole, 'candidate_worktree');
  } finally {
    try { execFileSync('git', ['-C', projectRoot, 'worktree', 'remove', '--force', worktreeRoot], { stdio: 'ignore' }); } catch {}
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
    await rm(worktreeRoot, { recursive: true, force: true });
    await rm(adjacentRoot, { recursive: true, force: true });
  }
});

test('task-control protocol failure recovers the same candidate for completion only without a new task or fuse cost', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-candidate-recovery-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-candidate-recovery-main-'));
  const worktreeRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-candidate-recovery-worktree-'));
  try {
    await rm(worktreeRoot, { recursive: true, force: true });
    const git = await createGitWorktreeFixture(projectRoot, worktreeRoot, 'task/recover-result');
    const candidate = parallelCandidate({ candidateId: 'recover-result', title: 'Recover completed candidate result', lane: 'implementation', workClass: 'bounded_reasoning', taskMode: 'visual_implementation', projectRoot, conflictDomains: ['battle-result-ui'] });
    candidate.worktreeIdentity = { baseCommit: git.baseCommit, worktreePath: worktreeRoot, branch: git.branch, lastMainSyncCommit: git.baseCommit, cleanupOwner: 'parallel-controller' };
    const batch = parallelManifest(projectRoot, [candidate], { degradationReceipt: { reason: 'insufficient_independent_candidates', summary: 'Only the already-completed candidate needs result closeout recovery.', evidence: ['task-control-protocol-recovery'] } });
    await writeFile(join(projectRoot, 'parallel-batch.json'), `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    await controllerPlanParallelBatch({ taskControlHome, projectRoot, controllerThreadId: 'parallel-controller', manifestPath: 'parallel-batch.json' });
    const input = parallelRegistration(taskControlHome, projectRoot, candidate, 'candidate-recovery-worker');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerPrepareParallelDispatch({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, batchId: 'batch-1' });
    await controllerRecordDispatched(input);
    const manifestRelativePath = 'docs/test-reports/result-manifest-v2.json';
    await writeResultManifest(taskControlHome, projectRoot, input.threadId, git.candidateCommit, { visual: true, workspaceRoot: worktreeRoot, manifestRelativePath });
    const failurePath = await createFailureEvent({ taskControlHome, selfThreadId: input.threadId, eventType: 'task_blocked', attemptedStage: 'completion', failureClass: 'spec_missing', failureDomain: 'contract', commandSummary: 'task-control rejected the registered candidate worktree manifest with RESULT_MANIFEST_OUTSIDE_PROJECT.', mechanicalRetryEligible: false, evidence: [{ id: 'protocol-error', reference: 'RESULT_MANIFEST_OUTSIDE_PROJECT.txt' }] });
    const failed = await controllerIngestFailure({ ...input, eventPath: failurePath, eventType: 'task_blocked' });
    assert.equal(failed.status, 'changes_requested');
    assert.equal(failed.failureHistory.length, 1);
    const originalFailure = structuredClone(failed.failureHistory[0]);
    const recovered = await controllerRecoverControlPlaneCandidate({ ...input, controlPlaneComponent: 'task_control_protocol', candidateCommit: git.candidateCommit, resultManifestPath: manifestRelativePath, skillVersion: '0.21.0', reason: 'v0.21.0 preserves registered candidate-worktree result authority without changing business scope or evidence.', hostReceipt: 'controller-approved-completion-only-recovery' });
    assert.equal(recovered.status, 'executing');
    assert.equal(recovered.attemptCount, 1);
    assert.equal(recovered.controlPlaneRecovery.status, 'completion_only');
    assert.deepEqual(recovered.failureHistory, [originalFailure]);
    await assert.rejects(createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'must not rerun business' }), (error) => error instanceof TaskControlError && error.code === 'CONTROL_PLANE_RECOVERY_COMPLETION_ONLY');
    const completionPath = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: git.candidateCommit, resultManifestPath: manifestRelativePath });
    const completed = await controllerIngestCompletion({ ...input, eventPath: completionPath });
    assert.equal(completed.status, 'awaiting_review');
    assert.equal(completed.controlPlaneRecovery.status, 'completed');
    assert.deepEqual(completed.failureHistory, [originalFailure]);
    const reportData = await controllerQueryDeliverables({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(reportData.taskCount, 1);
    assert.equal(reportData.tasks[0].objective.replacementCount, 0);
    assert.equal(reportData.tasks[0].objective.failedReplacementCount, 0);
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, observabilityMode: 'lean' });
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /控制面候选恢复/);
    assert.match(html, /历史失败保留/);
  } finally {
    try { execFileSync('git', ['-C', projectRoot, 'worktree', 'remove', '--force', worktreeRoot], { stdio: 'ignore' }); } catch {}
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
    await rm(worktreeRoot, { recursive: true, force: true });
  }
});

test('hard contract rejects a sole blocking validator and headless GUI proof', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-hard-contract-safety-'));
  try {
    const blocking = implementationManifest();
    blocking.evidenceCommands[0].failureMode = 'blocking';
    await writeFile(join(projectRoot, 'blocking.json'), `${JSON.stringify(blocking, null, 2)}\n`, 'utf8');
    await assert.rejects(auditImplementationContract({ projectRoot, implementationContractPath: 'blocking.json', taskMode: 'implementation' }), (error) => error instanceof TaskControlError && error.code === 'HARD_CONTRACT_SINGLE_VALIDATOR_FORBIDDEN');

    const headlessVisual = implementationManifest({ visual: true });
    headlessVisual.evidenceCommands.find((entry) => entry.id === 'targeted-test').environment = 'headless';
    await writeFile(join(projectRoot, 'headless-visual.json'), `${JSON.stringify(headlessVisual, null, 2)}\n`, 'utf8');
    await assert.rejects(auditImplementationContract({ projectRoot, implementationContractPath: 'headless-visual.json', taskMode: 'visual_implementation' }), (error) => error instanceof TaskControlError && error.code === 'HEADLESS_GUI_EVIDENCE_FORBIDDEN');
  } finally {
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
    const missingPresentation = implementationManifest({ visual: true });
    missingPresentation.resultRequirements.presentationStageId = null;
    await writeFile(contractPath, `${JSON.stringify(missingPresentation, null, 2)}\n`, 'utf8');
    await assert.rejects(controllerRegisterTask(implementationInput(taskControlHome, projectRoot, { taskMode: 'visual_implementation', implementationContractPath: 'visual-contract.json' })), (error) => error instanceof TaskControlError && error.code === 'RESULT_PRESENTATION_STAGE_REQUIRED');
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
    const resultManifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'candidate-contract-1');
    const completionEvent = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'candidate-contract-1', resultManifestPath });
    const completed = await controllerIngestCompletion({ ...input, eventPath: completionEvent });
    assert.equal(completed.status, 'awaiting_review');
    assert.equal(completed.contractVersion, 'contract-r1');
    assert.deepEqual(completed.missingStages, []);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('pending predecessor chain permits asynchronous stage creation while controller ingestion remains ordered', async () => {
  for (const { name, forge, expectedCode } of [
    { name: 'malformed', forge: () => [{}], expectedCode: 'STAGE_ORDER_INVALID' },
    { name: 'wrong-project', forge: (event) => [{ ...event, projectKey: 'wrong-project' }], expectedCode: 'STAGE_ORDER_INVALID' },
    { name: 'wrong-parent', forge: (event) => [{ ...event, parentThreadId: 'wrong-parent' }], expectedCode: 'STAGE_ORDER_INVALID' },
    { name: 'wrong-task', forge: (event) => [{ ...event, threadId: 'wrong-worker' }], expectedCode: 'STAGE_ORDER_INVALID' },
    { name: 'stale-attempt', forge: (event) => [{ ...event, attemptCount: 2 }], expectedCode: 'STAGE_ORDER_INVALID' },
    { name: 'wrong-digest', forge: (event) => [{ ...event, contractDigest: '0'.repeat(64) }], expectedCode: 'STAGE_ORDER_INVALID' },
    { name: 'wrong-revision', forge: (event) => [{ ...event, contractVersion: 'contract-r2' }], expectedCode: 'STAGE_ORDER_INVALID' },
    { name: 'duplicate-replay', forge: (event) => [event, event], expectedCode: 'STAGE_PREDECESSOR_DUPLICATE' },
    { name: 'out-of-order', forge: (event) => [{ ...event, stageId: 'verification', evidence: [{ id: 'targeted-test', reference: 'targeted.txt' }] }], expectedCode: 'STAGE_ALREADY_COMPLETED' },
  ]) await assertForgedPredecessorCannotCreateVerification({ name, forge, expectedCode });

  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-async-stages-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-async-stages-project-'));
  const input = implementationInput(taskControlHome, projectRoot, { implementationContractPath: 'implementation-contract.json' });
  try {
    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(implementationManifest(), null, 2)}\n`, 'utf8');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerRecordDispatched(input);

    await assert.rejects(createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'out of order', stageId: 'verification', evidence: [{ id: 'targeted-test', reference: 'targeted.txt' }] }), (error) => error instanceof TaskControlError && error.code === 'STAGE_ORDER_INVALID');
    const reuseEvent = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Existing path inspected and retained.', stageId: 'reuse-check', evidence: [{ id: 'inspection', reference: 'inspection.txt' }] });
    assert.deepEqual((await querySelf({ taskControlHome, selfThreadId: input.threadId })).task.stageProgress, [], 'pending event must not mutate central stageProgress');
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'pending-only' }), (error) => error instanceof TaskControlError && error.code === 'REQUIRED_STAGE_INCOMPLETE');

    await delay();
    const verificationEvent = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Targeted verification passed.', stageId: 'verification', evidence: [{ id: 'targeted-test', reference: 'targeted.txt' }] });
    await assert.rejects(createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'duplicate verification', stageId: 'verification', evidence: [{ id: 'targeted-test', reference: 'duplicate.txt' }] }), (error) => error instanceof TaskControlError && error.code === 'STAGE_ALREADY_COMPLETED');
    await assert.rejects(controllerIngestProgress({ ...input, eventPath: verificationEvent }), (error) => error instanceof TaskControlError && error.code === 'STAGE_ORDER_INVALID');
    await controllerIngestProgress({ ...input, eventPath: reuseEvent });
    const ingested = await controllerIngestProgress({ ...input, eventPath: verificationEvent });
    assert.deepEqual(ingested.completedStages, ['reuse-check', 'verification']);
    await assert.rejects(controllerIngestProgress({ ...input, eventPath: verificationEvent }), (error) => error instanceof TaskControlError && error.code === 'EVENT_STALE');
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

test('worker failure is first-class before required stages complete and wakes the controller', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-failure-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-failure-project-'));
  const input = implementationInput(taskControlHome, projectRoot, { implementationContractPath: 'implementation-contract.json' });
  try {
    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(implementationManifest(), null, 2)}\n`, 'utf8');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerRecordDispatched(input);
    const eventPath = await createFailureEvent({ taskControlHome, selfThreadId: input.threadId, eventType: 'task_failed', attemptedStage: 'reuse-check', failureClass: 'mechanical', failureDomain: 'tooling', commandSummary: 'The fixed test runner exited before collecting results.', evidenceCommandId: 'inspection', recoveryExhausted: true, mechanicalRetryEligible: true, evidence: [{ id: 'inspection', reference: 'logs/runner-failure.txt' }] });
    const scan = await controllerScanPendingEvents({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(scan.pendingEvents[0].type, 'task_failed');
    assert.equal(scan.needsControllerAttention, true);
    const ingested = await controllerIngestFailure({ ...input, eventPath, eventType: 'task_failed' });
    assert.equal(ingested.status, 'changes_requested');
    assert.equal(ingested.failureHistory.length, 1);
    assert.deepEqual(ingested.missingStages, ['reuse-check', 'verification']);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('contract-external failure stays diagnostic and cannot stop or rework an implementation task', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-failure-authority-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-failure-authority-project-'));
  const input = implementationInput(taskControlHome, projectRoot, { implementationContractPath: 'implementation-contract.json' });
  try {
    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(implementationManifest(), null, 2)}\n`, 'utf8');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerRecordDispatched(input);
    const diagnosticPath = await createFailureEvent({ taskControlHome, selfThreadId: input.threadId, eventType: 'task_failed', attemptedStage: 'reuse-check', failureClass: 'mechanical', failureDomain: 'tooling', commandSummary: 'An ad-hoc check-only command failed outside the contract.', mechanicalRetryEligible: true, evidence: [{ id: 'adhoc-check', reference: 'logs/adhoc.txt' }] });
    const diagnostic = await controllerIngestFailure({ ...input, eventPath: diagnosticPath, eventType: 'task_failed' });
    assert.equal(diagnostic.status, 'executing');
    assert.equal(diagnostic.failureHistory.at(-1).authority, 'non_authoritative_diagnostic');
    await assert.rejects(controllerDispatchRework(input), (error) => error instanceof TaskControlError && error.code === 'TASK_TRANSITION_INVALID');
    await delay();
    const authoritativePath = await createFailureEvent({ taskControlHome, selfThreadId: input.threadId, eventType: 'task_failed', attemptedStage: 'reuse-check', failureClass: 'mechanical', failureDomain: 'tooling', commandSummary: 'The contract-bound inspection command failed.', evidenceCommandId: 'inspection', recoveryExhausted: true, mechanicalRetryEligible: true, evidence: [{ id: 'inspection', reference: 'logs/inspection.txt' }] });
    const authoritative = await controllerIngestFailure({ ...input, eventPath: authoritativePath, eventType: 'task_failed' });
    assert.equal(authoritative.status, 'changes_requested');
    assert.equal(authoritative.failureHistory.at(-1).authority, 'contract_evidence');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('contract audit rejects Python cache self-conflicts before registration and accepts explicit suppression', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-contract-audit-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-contract-audit-project-'));
  const input = implementationInput(taskControlHome, projectRoot, { implementationContractPath: 'implementation-contract.json' });
  try {
    const unsafe = implementationManifest();
    unsafe.evidenceCommands = [
      { id: 'inspection', command: 'git status --porcelain', failureMode: 'recoverable', evidenceClass: 'business', environment: 'any' },
      { id: 'targeted-test', command: 'python tests/tool_test.py', failureMode: 'recoverable', evidenceClass: 'business', environment: 'any' },
    ];
    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(unsafe, null, 2)}\n`, 'utf8');
    const audit = await auditImplementationContract({ projectRoot, implementationContractPath: 'implementation-contract.json', taskMode: 'implementation' });
    assert.equal(audit.valid, false);
    assert.equal(audit.errors[0].code, 'CONTRACT_EPHEMERAL_SELF_CONFLICT');
    await assert.rejects(controllerRegisterTask(input), (error) => error instanceof TaskControlError && error.code === 'IMPLEMENTATION_CONTRACT_AUDIT_FAILED');

    const safe = structuredClone(unsafe);
    safe.contractRevision = 'contract-r2';
    safe.evidenceCommands[1].command = 'python -B tests/tool_test.py';
    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(safe, null, 2)}\n`, 'utf8');
    const safeAudit = await auditImplementationContract({ projectRoot, implementationContractPath: 'implementation-contract.json', taskMode: 'implementation' });
    assert.equal(safeAudit.valid, true);
    assert.deepEqual(safeAudit.errors, []);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('evidence failure modes keep advisory and recoverable first failures diagnostic', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-evidence-mode-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-evidence-mode-project-'));
  const input = implementationInput(taskControlHome, projectRoot, { implementationContractPath: 'implementation-contract.json' });
  try {
    const manifest = implementationManifest();
    manifest.evidenceCommands.find((entry) => entry.id === 'targeted-test').failureMode = 'recoverable';
    manifest.evidenceCommands.push({ id: 'knowledge-note', command: 'python tools/search_knowledge.py runner', failureMode: 'advisory' });
    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerRecordDispatched(input);

    const advisoryPath = await createFailureEvent({ taskControlHome, selfThreadId: input.threadId, eventType: 'task_failed', attemptedStage: 'verification', failureClass: 'mechanical', failureDomain: 'tooling', commandSummary: 'Knowledge search returned no matches.', evidenceCommandId: 'knowledge-note', recoveryExhausted: true, mechanicalRetryEligible: true, evidence: [{ id: 'knowledge-note', reference: 'logs/knowledge.txt' }] });
    const advisory = await controllerIngestFailure({ ...input, eventPath: advisoryPath, eventType: 'task_failed' });
    assert.equal(advisory.status, 'executing');
    assert.equal(advisory.failureHistory.at(-1).authority, 'non_authoritative_diagnostic');
    assert.equal(advisory.failureHistory.at(-1).failureMode, 'advisory');

    await delay();
    const recoverablePath = await createFailureEvent({ taskControlHome, selfThreadId: input.threadId, eventType: 'task_failed', attemptedStage: 'verification', failureClass: 'mechanical', failureDomain: 'test', commandSummary: 'First bounded verification attempt failed.', evidenceCommandId: 'targeted-test', recoveryExhausted: false, mechanicalRetryEligible: true, evidence: [{ id: 'targeted-test', reference: 'logs/first.txt' }] });
    const recoverable = await controllerIngestFailure({ ...input, eventPath: recoverablePath, eventType: 'task_failed' });
    assert.equal(recoverable.status, 'executing');
    assert.equal(recoverable.failureHistory.at(-1).authority, 'non_authoritative_diagnostic');
    assert.equal(recoverable.failureHistory.at(-1).failureMode, 'recoverable');

    await delay();
    const exhaustedPath = await createFailureEvent({ taskControlHome, selfThreadId: input.threadId, eventType: 'task_failed', attemptedStage: 'verification', failureClass: 'mechanical', failureDomain: 'test', commandSummary: 'Bounded recovery was exhausted.', evidenceCommandId: 'targeted-test', recoveryExhausted: true, mechanicalRetryEligible: true, evidence: [{ id: 'targeted-test', reference: 'logs/exhausted.txt' }] });
    const exhausted = await controllerIngestFailure({ ...input, eventPath: exhaustedPath, eventType: 'task_failed' });
    assert.equal(exhausted.status, 'changes_requested');
    assert.equal(exhausted.failureHistory.at(-1).authority, 'contract_evidence');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('mechanical contract amendment binds only an audited direct-controller contract and carries predecessors', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-amendment-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-amendment-project-'));
  const input = implementationInput(taskControlHome, projectRoot, { implementationContractPath: 'implementation-contract.json' });
  const contractPath = join(projectRoot, 'implementation-contract.json');
  try {
    const original = implementationManifest();
    await writeFile(contractPath, `${JSON.stringify(original, null, 2)}\n`, 'utf8');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerRecordDispatched(input);
    const reuse = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Reuse completed.', stageId: 'reuse-check', evidence: [{ id: 'inspection', reference: 'reuse.txt' }] });
    await controllerIngestProgress({ ...input, eventPath: reuse });
    await delay();
    const failure = await createFailureEvent({ taskControlHome, selfThreadId: input.threadId, eventType: 'task_failed', attemptedStage: 'verification', failureClass: 'mechanical', failureDomain: 'test', commandSummary: 'The bounded command was malformed.', evidenceCommandId: 'targeted-test', recoveryExhausted: true, mechanicalRetryEligible: true, evidence: [{ id: 'targeted-test', reference: 'failure.txt' }] });
    await controllerIngestFailure({ ...input, eventPath: failure, eventType: 'task_failed' });
    const unsafeBoundary = structuredClone(original);
    unsafeBoundary.contractRevision = 'contract-unsafe';
    unsafeBoundary.allowedWritePaths.push('src/replacement/**');
    await writeFile(contractPath, `${JSON.stringify(unsafeBoundary, null, 2)}\n`, 'utf8');
    await assert.rejects(taskControlModule.controllerAmendImplementationContract({ ...input, implementationContractPath: 'implementation-contract.json', reason: 'Unsafe scope expansion.', hostReceipt: 'host-delivered-unsafe-contract' }), (error) => error instanceof TaskControlError && error.code === 'CONTRACT_AMENDMENT_SAFETY_INVARIANT_CHANGED');
    await writeFile(contractPath, `${JSON.stringify(original, null, 2)}\n`, 'utf8');
    await assert.rejects(taskControlModule.controllerAmendImplementationContract({ ...input, controllerThreadId: 'wrong-controller', implementationContractPath: 'implementation-contract.json', reason: 'Wrong controller must fail.', hostReceipt: 'forged-host-receipt' }), (error) => error instanceof TaskControlError && error.code === 'CONTROLLER_UNAUTHORIZED');
    const amended = structuredClone(original);
    amended.contractRevision = 'contract-r2';
    amended.evidenceCommands[1].command = 'npm test -- contract --fixed';
    amended.evidenceCommands[1].failureMode = 'recoverable';
    await writeFile(contractPath, `${JSON.stringify(amended, null, 2)}\n`, 'utf8');
    const resumed = await taskControlModule.controllerAmendImplementationContract({ ...input, implementationContractPath: 'implementation-contract.json', reason: 'Correct the fixed verification command without widening scope.', hostReceipt: 'host-delivered-amended-contract' });
    assert.equal(resumed.status, 'executing');
    assert.equal(resumed.attemptCount, 2);
    assert.deepEqual(resumed.completedStages, ['reuse-check']);
    assert.equal(resumed.contractAmendmentHistory.at(-1).beforeContractDigest, registered.contractDigest);
    assert.equal(resumed.contractAmendmentHistory.at(-1).reason, 'Correct the fixed verification command without widening scope.');
    assert.equal(resumed.contractAmendmentHistory.at(-1).hostReceipt, 'host-delivered-amended-contract');
    const unsafe = structuredClone(amended);
    unsafe.allowedWritePaths.push('src/new/**');
    await writeFile(contractPath, `${JSON.stringify(unsafe, null, 2)}\n`, 'utf8');
    await assert.rejects(taskControlModule.controllerAmendImplementationContract({ ...input, implementationContractPath: 'implementation-contract.json', reason: 'Must not widen scope.', hostReceipt: 'forged-second-amendment' }), (error) => error instanceof TaskControlError && error.code === 'CONTRACT_AMENDMENT_NOT_ELIGIBLE');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('explicit execution and observability evidence classes are accepted before lifecycle policy is applied', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-evidence-class-red-'));
  try {
    const manifest = implementationManifest();
    manifest.evidenceCommands[0].evidenceClass = 'execution';
    manifest.evidenceCommands.push({ id: 'telemetry-note', command: 'node scripts/collect-telemetry.mjs', evidenceClass: 'observability' });
    const contractPath = join(projectRoot, 'implementation-contract.json');
    await writeFile(contractPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const audit = await auditImplementationContract({ projectRoot, implementationContractPath: 'implementation-contract.json', taskMode: 'implementation' });
    assert.equal(audit.valid, true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('failure-domain value classification distinguishes product and control-plane fuses', () => {
  assert.equal(typeof taskControlModule.failureValueClassForDomain, 'function');
  assert.equal(taskControlModule.failureValueClassForDomain('contract'), 'control_plane');
  assert.equal(taskControlModule.failureValueClassForDomain('test'), 'product');
});

test('mechanical rework carries valid predecessors and accepts worker artifacts before lifecycle title sync', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-resumable-rework-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-resumable-rework-project-'));
  const input = implementationInput(taskControlHome, projectRoot, { implementationContractPath: 'implementation-contract.json' });
  try {
    await writeFile(join(projectRoot, 'implementation-contract.json'), `${JSON.stringify(implementationManifest(), null, 2)}\n`, 'utf8');
    const registered = await controllerRegisterTask(input);
    await controllerRecordTitleSynced({ ...input, title: registered.desiredThreadTitle });
    await controllerRecordDispatched(input);
    const reusePath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Existing implementation was reused.', stageId: 'reuse-check', evidence: [{ id: 'inspection', reference: 'logs/reuse.txt' }] });
    await controllerIngestProgress({ ...input, eventPath: reusePath });
    await delay();
    const failurePath = await createFailureEvent({ taskControlHome, selfThreadId: input.threadId, eventType: 'task_failed', attemptedStage: 'verification', failureClass: 'mechanical', failureDomain: 'test', commandSummary: 'The verification command had a mechanical defect.', evidenceCommandId: 'targeted-test', recoveryExhausted: true, mechanicalRetryEligible: true, evidence: [{ id: 'targeted-test', reference: 'logs/failure.txt' }] });
    await controllerIngestFailure({ ...input, eventPath: failurePath, eventType: 'task_failed' });
    const prepared = await controllerDispatchRework(input);
    const retried = await controllerConfirmReworkDispatched({ ...input, actionId: prepared.hostAction.actionId, hostReceipt: 'host-delivered-attempt-2' });
    assert.equal(retried.attemptCount, 2);
    assert.equal(retried.titleSyncStatus, 'pending');
    assert.deepEqual(retried.completedStages, ['reuse-check']);
    assert.deepEqual(retried.missingStages, ['verification']);
    const carried = retried.stageProgress.find((entry) => entry.attemptCount === 2 && entry.stageId === 'reuse-check');
    assert.equal(carried.carriedFromAttempt, 1);

    await delay();
    const verificationPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Verification passed after the bounded mechanical repair.', stageId: 'verification', evidence: [{ id: 'targeted-test', reference: 'logs/green.txt' }] });
    const verification = await controllerIngestProgress({ ...input, eventPath: verificationPath });
    assert.deepEqual(verification.missingStages, []);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('prepared rework changes no attempt until host receipt and zombie attempts have a gate-independent recovery', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-rework-recovery-'));
  const projectRoot = 'E:\\work\\project\\rework-recovery';
  try {
    const { input } = await createHeartbeatFixture(taskControlHome, projectRoot, { threadId: 'rework-recovery-worker' });
    await controllerMarkChangesRequested({ ...input, failureClass: 'mechanical', reason: 'A mechanical check needs one bounded retry.' });
    const prepared = await controllerDispatchRework(input);
    assert.equal(prepared.attemptCount, 1);
    assert.equal(prepared.status, 'changes_requested');
    assert.equal(prepared.hostAction.receiptRequired, true);
    const cancelled = await controllerCancelPreparedRework({ ...input, reason: 'host send failed' });
    assert.equal(cancelled.attemptCount, 1);
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    const task = registry.tasks.find((entry) => entry.threadId === input.threadId);
    task.status = 'executing';
    task.executionStatus = 'running';
    task.nextOwner = 'worker';
    task.attemptCount = 2;
    task.reviewVerdict = 'pending';
    task.notificationStatus = 'pending';
    task.executionEndedAt = null;
    task.desiredThreadTitle = `返工｜${task.displayKey} ${task.title}`;
    task.titleSyncStatus = 'pending';
    task.titleSyncError = null;
    task.pendingRework = null;
    task.updatedAt = new Date().toISOString();
    registry.updatedAt = task.updatedAt;
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    const scan = await controllerScanPendingEvents(input);
    assert.equal(scan.zombieAttempts.length, 1);
    const recovered = await controllerRecoverUndispatchedAttempt({ ...input, reason: 'Attempt two had no host delivery receipt.' });
    assert.equal(recovered.status, 'changes_requested');
    assert.equal(recovered.attemptCount, 1);
    assert.equal(recovered.lastDispatchedAttempt, 1);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('stalled execution is audited even without completion or ordinary worker messages', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-stall-home-'));
  const projectRoot = 'E:\\work\\project\\stall-audit';
  try {
    const { input } = await createHeartbeatFixture(taskControlHome, projectRoot, { threadId: 'stalled-worker' });
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    const task = registry.tasks.find((entry) => entry.threadId === input.threadId);
    task.lastDispatchedAt = '2026-01-01T00:00:00.000Z';
    task.updatedAt = '2026-01-01T00:00:00.000Z';
    registry.updatedAt = new Date().toISOString();
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    const scan = await controllerScanPendingEvents(input);
    assert.equal(scan.stalledActiveTasks.length, 1);
    assert.ok(scan.stalledActiveTasks[0].reasons.includes('no_candidate_or_completion'));
    assert.equal(scan.needsControllerAttention, true);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('objective retry fuse counts only authoritative product failures across the full replacement chain', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-fuse-home-'));
  const projectRoot = 'E:\\work\\project\\objective-fuse';
  try {
    const { input } = await createHeartbeatFixture(taskControlHome, projectRoot, { threadId: 'objective-original' });
    let previous = input.threadId;
    for (let ordinal = 0; ordinal < 3; ordinal += 1) {
      const currentInput = ordinal === 0 ? input : { ...input, threadId: `objective-r${ordinal}`, title: `Replacement ${ordinal}`, replacementOfThreadId: previous };
      if (ordinal > 0) {
        const registered = await controllerRegisterTask(currentInput);
        await controllerRecordTitleSynced({ ...currentInput, title: registered.desiredThreadTitle });
        await controllerRecordDispatched(currentInput);
      }
      const failure = await createFailureEvent({ taskControlHome, selfThreadId: currentInput.threadId, eventType: 'task_failed', attemptedStage: 'runner', failureClass: 'mechanical', failureDomain: 'test', commandSummary: `replacement ${ordinal} failed the product test without a candidate`, mechanicalRetryEligible: false, evidence: [{ id: 'runner-log', reference: `logs/replacement-${ordinal}.txt` }] });
      await controllerIngestFailure({ ...currentInput, eventPath: failure, eventType: 'task_failed' });
      const blocked = await controllerReclaimTask({ ...currentInput, reason: `replacement ${ordinal} produced no candidate`, userSummary: `Attempt ${ordinal} stopped without a candidate commit.` });
      await controllerMarkCloseoutNotificationSent(currentInput);
      await controllerRefreshCloseoutReport(currentInput);
      previous = currentInput.threadId;
      if (ordinal === 2) assert.equal(blocked.replacementOrdinal, 2);
    }
    const r3 = { ...input, threadId: 'objective-r3', title: 'Replacement 3', replacementOfThreadId: previous };
    await assert.rejects(controllerRegisterTask(r3), (error) => error instanceof TaskControlError && error.code === 'OBJECTIVE_RETRY_FUSE_OPEN');
    const scan = await controllerScanPendingEvents(input);
    assert.equal(scan.objectiveFuses.length, 1);
    assert.equal(scan.objectiveFuses[0].failedReplacementCount, 2);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('control-plane failures across a full replacement chain do not consume the product replacement fuse', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-control-plane-fuse-home-'));
  const projectRoot = 'E:\\work\\project\\objective-control-plane-fuse';
  try {
    const { input } = await createHeartbeatFixture(taskControlHome, projectRoot, { threadId: 'objective-control-original' });
    let previous = input.threadId;
    for (let ordinal = 0; ordinal < 3; ordinal += 1) {
      const currentInput = ordinal === 0 ? input : { ...input, threadId: `objective-control-r${ordinal}`, title: `Control replacement ${ordinal}`, replacementOfThreadId: previous };
      if (ordinal > 0) {
        const registered = await controllerRegisterTask(currentInput);
        await controllerRecordTitleSynced({ ...currentInput, title: registered.desiredThreadTitle });
        await controllerRecordDispatched(currentInput);
      }
      const failure = await createFailureEvent({ taskControlHome, selfThreadId: currentInput.threadId, eventType: 'task_failed', attemptedStage: 'runner', failureClass: 'mechanical', failureDomain: 'contract', commandSummary: `replacement ${ordinal} hit a controller contract issue`, mechanicalRetryEligible: false, evidence: [{ id: 'runner-log', reference: `logs/control-${ordinal}.txt` }] });
      await controllerIngestFailure({ ...currentInput, eventPath: failure, eventType: 'task_failed' });
      await controllerReclaimTask({ ...currentInput, reason: `control-plane replacement ${ordinal} produced no candidate`, userSummary: `Control-plane attempt ${ordinal} stopped without a candidate.` });
      await controllerMarkCloseoutNotificationSent(currentInput);
      await controllerRefreshCloseoutReport(currentInput);
      previous = currentInput.threadId;
    }
    const r3 = { ...input, threadId: 'objective-control-r3', title: 'Control replacement 3', replacementOfThreadId: previous };
    const beforeRegistration = await controllerScanPendingEvents(input);
    assert.deepEqual(beforeRegistration.objectiveFuses, []);
    const registered = await controllerRegisterTask(r3);
    assert.equal(registered.replacementOrdinal, 3);
    const scan = await controllerScanPendingEvents(input);
    assert.equal(scan.objectiveFuses.length, 0);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('diagnostic cannot block a milestone without product-value evidence', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-value-home-'));
  const projectRoot = 'E:\\work\\project\\product-value-gate';
  try {
    const { input } = await createHeartbeatFixture(taskControlHome, projectRoot, { threadId: 'diagnostic-worker' });
    await assert.rejects(controllerRecordDiagnostic({ ...input, diagnosticId: 'retained-resources', classification: 'milestone_blocker', summary: 'A diagnostic counter is nonzero.' }), (error) => error instanceof TaskControlError && error.code === 'PRODUCT_VALUE_GATE_REQUIRED');
    await controllerRecordDiagnostic({ ...input, diagnosticId: 'retained-resources', classification: 'technical_debt', summary: 'No player-impact evidence exists yet.', evidenceRefs: [] });
    await assert.rejects(controllerMarkBlocked({ ...input, reason: 'diagnostic counter', userSummary: 'The diagnostic needs more evidence.', blockerSource: 'diagnostic', diagnosticId: 'retained-resources' }), (error) => error instanceof TaskControlError && error.code === 'PRODUCT_VALUE_GATE_REQUIRED');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('handoff-required context health blocks new registration and dispatch', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-health-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-health-project-'));
  try {
    const { input } = await createHeartbeatFixture(taskControlHome, projectRoot, { threadId: 'health-worker' });
    const reportPath = join(projectRoot, 'context-health.md');
    const receiptPath = join(projectRoot, 'context-health.json');
    await writeFile(reportPath, '# Context health\nHandoff required.\n', 'utf8');
    await writeFile(receiptPath, `${JSON.stringify({ schemaVersion: 1, controllerThreadId: input.controllerThreadId, status: 'handoff_required', capturedAt: new Date().toISOString(), reportPath, metrics: { peakContextRatio: 0.91, compactionCount: 2 } }, null, 2)}\n`, 'utf8');
    await controllerIngestContextHealth({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, receiptPath });
    const next = { ...input, threadId: 'health-worker-2', title: 'Must wait for clean controller' };
    await assert.rejects(controllerRegisterTask(next), (error) => error instanceof TaskControlError && error.code === 'CONTROLLER_HANDOFF_REQUIRED');
    const scan = await controllerScanPendingEvents(input);
    assert.equal(scan.contextHealth.status, 'handoff_required');
    assert.equal(scan.needsControllerAttention, true);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('schema-v2 context advice is observable but never blocks registration', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-health-v2-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-health-v2-project-'));
  try {
    const { input } = await createQuiescentController(taskControlHome, projectRoot, 'health-v2-controller');
    const reportPath = join(projectRoot, 'context-health-v5.json');
    const receiptPath = join(projectRoot, 'context-health-receipt-v2.json');
    await writeFile(reportPath, `${JSON.stringify({ schemaVersion: 5, summary: { threadHealth: { status: 'handoff_recommended' } } })}\n`, 'utf8');
    await writeFile(receiptPath, `${JSON.stringify({ schemaVersion: 2, controllerThreadId: input.controllerThreadId, status: 'handoff_recommended', capturedAt: new Date().toISOString(), reportPath, metrics: { compactionOutcome: 'ineffective', workingSetTrend: 'growing' } }, null, 2)}\n`, 'utf8');
    const health = await controllerIngestContextHealth({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, receiptPath });
    assert.equal(health.receiptSchemaVersion, 2);
    const registered = await controllerRegisterTask({ ...input, threadId: 'health-v2-worker', title: 'Continue after advisory evidence' });
    assert.equal(registered.status, 'executing');
    const invalidPath = join(projectRoot, 'invalid-required-v2.json');
    await writeFile(invalidPath, `${JSON.stringify({ schemaVersion: 2, controllerThreadId: input.controllerThreadId, status: 'handoff_required', capturedAt: new Date().toISOString(), reportPath, metrics: {} })}\n`, 'utf8');
    await assert.rejects(controllerIngestContextHealth({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, receiptPath: invalidPath }), (error) => error instanceof TaskControlError && error.code === 'CONTEXT_HEALTH_RECEIPT_INVALID');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('conversation checkpoints preload only confirmed summaries and retain immutable history', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-checkpoint-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-checkpoint-project-'));
  try {
    const { input, projectKey } = await createQuiescentController(taskControlHome, projectRoot);
    const manifestPath = join(projectRoot, 'checkpoint.json');
    const manifest = {
      schemaVersion: 1,
      projectKey,
      controllerThreadId: input.controllerThreadId,
      scopeSummary: 'Keep only durable decisions and source indexes in the warm preload.',
      points: [
        { factId: 'confirmed-objective', kind: 'objective', authority: 'user_confirmed', summary: 'Complete the approved controller migration without changing project files.', preloadPolicy: 'always', revision: 1, sourceRefs: [{ type: 'thread', ref: input.controllerThreadId, label: 'User-confirmed objective' }], supersedes: [] },
        { factId: 'candidate-option', kind: 'open_question', authority: 'candidate', summary: 'A candidate optimization remains unreviewed.', preloadPolicy: 'on_demand', revision: 1, sourceRefs: [{ type: 'report', ref: 'candidate-report-1' }], supersedes: [] },
        { factId: 'rejected-attempt', kind: 'rejected_path', authority: 'failure_evidence', summary: 'The old attempt is loaded only when a dispute needs its evidence.', preloadPolicy: 'dispute_only', revision: 1, sourceRefs: [{ type: 'event', ref: 'failure-event-1' }], supersedes: [] },
      ],
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const first = await controllerSealCheckpoint({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, manifestPath });
    const preload = await controllerQueryCheckpoint({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, mode: 'preload' });
    assert.deepEqual(preload.points.map((point) => point.factId), ['confirmed-objective']);
    assert.equal(preload.omittedPointCount, 2);
    const candidate = await controllerQueryCheckpoint({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, factId: 'candidate-option' });
    assert.equal(candidate.points[0].authority, 'candidate');
    manifest.points[0].revision = 2;
    manifest.points[0].summary = 'Continue with the same approved boundary and a newer checkpoint revision.';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const second = await controllerSealCheckpoint({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, manifestPath });
    assert.equal(second.sequence, 2);
    assert.notEqual(second.checkpointDigest, first.checkpointDigest);
    assert.equal(await readFile(first.checkpointPath, 'utf8').then(() => true), true, 'old checkpoint file must remain immutable');
    const unsafe = { ...manifest, points: [{ ...manifest.points[1], preloadPolicy: 'always' }] };
    await writeFile(manifestPath, `${JSON.stringify(unsafe, null, 2)}\n`, 'utf8');
    await assert.rejects(controllerSealCheckpoint({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, manifestPath }), (error) => error instanceof TaskControlError && error.code === 'CHECKPOINT_MANIFEST_INVALID');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('worker parent context uses confirmed preload and bounded direct-parent reads without changing legacy query-parent', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-parent-context-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-parent-context-project-'));
  try {
    const { input, projectKey } = await createQuiescentController(taskControlHome, projectRoot, 'parent-context-controller');
    const manifestPath = join(projectRoot, 'parent-context-checkpoint.json');
    await writeFile(manifestPath, `${JSON.stringify({
      schemaVersion: 1,
      projectKey,
      controllerThreadId: input.controllerThreadId,
      scopeSummary: 'Expose only confirmed facts automatically and keep historical routes on demand.',
      points: [
        { factId: 'confirmed-route', kind: 'confirmed_decision', authority: 'controller_decision', summary: 'Use the already-verified non-headless route for GUI screenshots.', preloadPolicy: 'always', revision: 1, sourceRefs: [{ type: 'thread', ref: input.controllerThreadId, label: 'Confirmed controller route' }], supersedes: [] },
        { factId: 'old-failure', kind: 'rejected_path', authority: 'failure_evidence', summary: 'A headless framebuffer attempt returned no visual evidence.', preloadPolicy: 'on_demand', revision: 1, sourceRefs: [{ type: 'event', ref: 'failure-headless-framebuffer' }], supersedes: [] },
      ],
    }, null, 2)}\n`, 'utf8');
    await controllerSealCheckpoint({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, manifestPath });
    const worker = { ...input, threadId: 'parent-context-worker', title: 'Use progressive parent context' };
    await controllerRegisterTask(worker);

    assert.equal(await queryParent({ taskControlHome, selfThreadId: worker.threadId }), input.controllerThreadId, 'legacy query-parent must keep returning only the parent ID');
    const startup = await queryParent({ taskControlHome, selfThreadId: worker.threadId, contextMode: 'preload' });
    assert.equal(startup.parentThreadId, input.controllerThreadId);
    assert.equal(startup.checkpointStatus, 'available');
    assert.deepEqual(startup.preload.points.map((point) => point.factId), ['confirmed-route']);
    assert.equal(startup.parentContextPolicy.fullInheritanceAllowed, false);
    assert.equal(startup.parentContextPolicy.directParentOnly, true);

    const expanded = await queryParentContext({ taskControlHome, selfThreadId: worker.threadId, reason: 'The screenshot route may have a prior rejected attempt.', factId: 'old-failure' });
    assert.equal(expanded.source, 'checkpoint_point');
    assert.deepEqual(expanded.checkpoint.points.map((point) => point.factId), ['old-failure']);

    const history = await queryParentContext({ taskControlHome, selfThreadId: worker.threadId, reason: 'An unexpected framebuffer result may already have a controller-approved recovery route.' });
    assert.equal(history.source, 'direct_parent_completed_turns');
    assert.deepEqual(history.hostAction, { type: 'read_thread', threadId: input.controllerThreadId, turnLimit: 3, includeOutputs: false });
    assert.equal(history.parentContextPolicy.completedTurnsOnly, true);
    assert.equal(history.parentContextPolicy.authority, 'advisory');

    const nested = { ...input, controllerThreadId: worker.threadId, parentThreadId: worker.threadId, threadId: 'nested-parent-context-worker', title: 'Read only the direct parent' };
    await controllerRegisterTask(nested);
    const nestedStartup = await queryParent({ taskControlHome, selfThreadId: nested.threadId, contextMode: 'preload' });
    assert.equal(nestedStartup.parentThreadId, worker.threadId);
    assert.equal(nestedStartup.checkpointStatus, 'unavailable', 'a nested worker must not silently inherit the root controller checkpoint');
    assert.equal(nestedStartup.preload, null);
    const nestedHistory = await queryParentContext({ taskControlHome, selfThreadId: nested.threadId, reason: 'The nested task needs its direct controller history, not the root controller history.' });
    assert.equal(nestedHistory.hostAction.threadId, worker.threadId);

    await assert.rejects(queryParentContext({ taskControlHome, selfThreadId: worker.threadId, reason: '' }), (error) => error instanceof TaskControlError && error.code === 'CLI_INVALID_ARGUMENTS');
    await assert.rejects(queryParent({ taskControlHome, selfThreadId: worker.threadId, contextMode: 'full' }), (error) => error instanceof TaskControlError && error.code === 'CLI_INVALID_ARGUMENTS');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('safe controller handoff is cancellable before acceptance and retires the source after acceptance', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-handoff-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-handoff-project-'));
  try {
    const { input, projectKey } = await createQuiescentController(taskControlHome, projectRoot, 'handoff-source');
    const manifestPath = join(projectRoot, 'handoff-checkpoint.json');
    await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, projectKey, controllerThreadId: input.controllerThreadId, scopeSummary: 'Handoff only the durable controller state.', points: [{ factId: 'next-gate', kind: 'next_gate', authority: 'controller_decision', summary: 'The successor must review the next fan-out gate before dispatch.', preloadPolicy: 'always', revision: 1, sourceRefs: [], supersedes: [] }] }, null, 2)}\n`, 'utf8');
    const checkpoint = await controllerSealCheckpoint({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, manifestPath });
    const first = await controllerPrepareHandoff({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, successorThreadId: 'handoff-successor-a', checkpointId: checkpoint.checkpointId });
    await assert.rejects(controllerRegisterTask({ ...input, threadId: 'blocked-during-handoff', title: 'Must not dispatch during prepared handoff' }), (error) => error instanceof TaskControlError && error.code === 'CONTROLLER_HANDOFF_PREPARED');
    const cancelled = await controllerCancelHandoff({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, handoffId: first.handoffId, reason: 'The successor shell was not available.' });
    assert.equal(cancelled.businessAllowedForSource, true);
    const prepared = await controllerPrepareHandoff({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, successorThreadId: 'handoff-successor-b', checkpointId: checkpoint.checkpointId });
    const accepted = await controllerAcceptHandoff({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, successorThreadId: 'handoff-successor-b', handoffId: prepared.handoffId, checkpointDigest: checkpoint.checkpointDigest });
    assert.equal(accepted.sourceRetired, true);
    assert.deepEqual(accepted.preload.points.map((point) => point.factId), ['next-gate']);
    await assert.rejects(controllerRegisterTask({ ...input, threadId: 'source-cannot-return', title: 'Old source must stay retired' }), (error) => error instanceof TaskControlError && error.code === 'CONTROLLER_RETIRED');
    const successorTask = await controllerRegisterTask({ ...input, controllerThreadId: 'handoff-successor-b', parentThreadId: 'handoff-successor-b', threadId: 'successor-worker', title: 'Review next fan-out gate' });
    assert.equal(successorTask.displayKey, '01');
    const scan = await controllerScanPendingEvents({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(scan.handoffState.status, 'accepted');
    assert.equal(scan.shouldKeepHeartbeat, false);
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, observabilityMode: 'lean' });
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /对话知识与交接/);
    assert.match(html, /checkpoint-0001/);
    assert.match(html, /handoff-successor-b/);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('safe controller handoff fails closed while a child task or heartbeat debt remains', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-handoff-block-home-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-handoff-block-project-'));
  try {
    const input = { ...implementationInput(taskControlHome, projectRoot), controllerThreadId: 'busy-controller', parentThreadId: 'busy-controller', threadId: 'busy-worker', title: 'Busy control task', taskMode: 'control_only', implementationPolicy: undefined, implementationBriefPath: undefined, implementationContractPath: undefined, hardContractTrigger: undefined, hardContractReason: undefined, model: 'gpt-5.6-luna', workClass: 'repeatable', quotaReason: 'A visible bounded check saves controller quota.' };
    await controllerRegisterTask(input);
    const projectKey = projectKeyForRoot(projectRoot);
    const manifestPath = join(projectRoot, 'busy-checkpoint.json');
    await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, projectKey, controllerThreadId: input.controllerThreadId, scopeSummary: 'Busy controller checkpoint.', points: [{ factId: 'busy-state', kind: 'current_state', authority: 'controller_decision', summary: 'A child task is still undispatched.', preloadPolicy: 'always', revision: 1, sourceRefs: [{ type: 'task', ref: input.threadId }], supersedes: [] }] }, null, 2)}\n`, 'utf8');
    const checkpoint = await controllerSealCheckpoint({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, manifestPath });
    await assert.rejects(controllerPrepareHandoff({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, successorThreadId: 'busy-successor', checkpointId: checkpoint.checkpointId }), (error) => error instanceof TaskControlError && error.code === 'HANDOFF_NOT_QUIESCENT' && /undispatched_tasks/.test(error.message));
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('visual completion rejects missing, escaped, or broken artifacts and requires a selected review image', async () => {
  const fixture = await createResultProtocolFixture({ visual: true });
  const { taskControlHome, projectRoot, input } = fixture;
  try {
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'visual-candidate-1' }), (error) => error instanceof TaskControlError && error.code === 'RESULT_MANIFEST_REQUIRED');

    const outsidePath = join(taskControlHome, 'outside.png');
    await writeFile(outsidePath, onePixelPng);
    let manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'visual-candidate-1', { visual: true, mutate: (manifest) => { manifest.artifacts[0].path = outsidePath; return manifest; } });
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'visual-candidate-1', resultManifestPath: manifestPath }), (error) => error instanceof TaskControlError && error.code === 'RESULT_ARTIFACT_OUTSIDE_ALLOWED_ROOT');

    manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'visual-candidate-1', { visual: true, mutate: (manifest) => { manifest.artifacts[0].workspaceRole = 'project_main'; return manifest; } });
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'visual-candidate-1', resultManifestPath: manifestPath }), (error) => error instanceof TaskControlError && error.code === 'RESULT_ARTIFACT_WORKSPACE_STATUS_MISMATCH');

    manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'visual-candidate-1', { visual: true });
    await writeFile(join(projectRoot, 'artifacts', 'after-1.png'), 'not an image', 'utf8');
    await assert.rejects(createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'visual-candidate-1', resultManifestPath: manifestPath }), (error) => error instanceof TaskControlError && error.code === 'RESULT_IMAGE_INVALID');

    manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'visual-candidate-1', { visual: true });
    const completion = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'visual-candidate-1', resultManifestPath: manifestPath });
    await controllerIngestCompletion({ ...input, eventPath: completion });
    await assert.rejects(controllerMarkAccepted({ ...input, reason: 'The fixed visual oracle is satisfied.', selectedArtifactIds: [] }), (error) => error instanceof TaskControlError && error.code === 'RESULT_REVIEW_VISUAL_SELECTION_REQUIRED');
    const accepted = await controllerMarkAccepted({ ...input, reason: 'The fixed visual oracle is satisfied.', selectedArtifactIds: ['after-1'] });
    assert.equal(accepted.deliverableHistory[0].deliveryStatus, 'accepted_not_integrated');
    assert.deepEqual(accepted.deliverableHistory[0].selectedArtifactIds, ['after-1']);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('nonvisual result packages allow a reasoned no-screenshot outcome and keep candidate, accepted, and integrated distinct', async () => {
  const fixture = await createResultProtocolFixture();
  const { taskControlHome, projectRoot, input } = fixture;
  try {
    const candidateCommit = await createGitCandidate(projectRoot, 'nonvisual-candidate-1');
    const manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, candidateCommit);
    const completion = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit, resultManifestPath: manifestPath });
    const candidate = await controllerIngestCompletion({ ...input, eventPath: completion });
    assert.equal(candidate.deliverableHistory[0].deliveryStatus, 'candidate');
    assert.match(candidate.deliverableHistory[0].noScreenshotReason, /without a player-visible surface/);

    const accepted = await controllerMarkAccepted({ ...input, reason: 'Targeted behavior and metrics satisfy the contract.', selectedArtifactIds: [] });
    assert.equal(accepted.deliverableHistory[0].deliveryStatus, 'accepted_not_integrated');
    const integrated = await controllerMarkIntegrated(input);
    assert.equal(integrated.deliverableHistory[0].deliveryStatus, 'integrated');
    assert.equal(integrated.integrationProof.method, 'git_ancestor');
    assert.equal(integrated.integrationProof.candidateCommit, candidateCommit);

    await controllerRecordTitleSynced({ ...input, title: integrated.desiredThreadTitle });
    await controllerRecordArchiveSucceeded(input);
    const first = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    const firstHtml = await readFile(first.reportPath, 'utf8');
    const second = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(await readFile(second.reportPath, 'utf8'), firstHtml, 'same ledger and artifacts must render byte-identical HTML');
    assert.match(firstHtml, /已集成·Git 已验证/);
    assert.match(firstHtml, /Git 祖先关系已验证/);
    await rm(first.reportPath, { force: true });
    const scan = await controllerScanPendingEvents({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(scan.reportNeedsRefresh, true);
    assert.equal(scan.shouldKeepHeartbeat, false, 'a missing report must not create heartbeat work');
    assert.equal(scan.needsControllerAttention, false);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('implementation integration fails closed unless the candidate is reachable from the declared Git target', async () => {
  const fixture = await createResultProtocolFixture();
  const { taskControlHome, projectRoot, input } = fixture;
  try {
    const headCommit = await createGitCandidate(projectRoot, 'integration-target');
    const unreachableCommit = execFileSync('git', ['-C', projectRoot, 'commit-tree', `${headCommit}^{tree}`, '-m', 'unreachable candidate'], { encoding: 'utf8' }).trim();
    const manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, unreachableCommit);
    const completion = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: unreachableCommit, resultManifestPath: manifestPath });
    await controllerIngestCompletion({ ...input, eventPath: completion });
    await controllerMarkAccepted({ ...input, reason: 'The bounded result is accepted for integration.', selectedArtifactIds: [] });
    await assert.rejects(controllerMarkIntegrated(input), (error) => error instanceof TaskControlError && error.code === 'INTEGRATION_NOT_REACHABLE');
    const current = (await querySelf({ taskControlHome, selfThreadId: input.threadId })).task;
    assert.equal(current.status, 'accepted');
    assert.equal(current.integrationStatus, 'not_integrated');
    assert.equal(current.integrationProof, null);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('legacy integrated implementation remains readable but is reported as Git-unverified', async () => {
  const fixture = await createResultProtocolFixture();
  const { taskControlHome, projectRoot, input } = fixture;
  try {
    const candidateCommit = await createGitCandidate(projectRoot, 'legacy-integrated');
    const manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, candidateCommit);
    const completion = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit, resultManifestPath: manifestPath });
    await controllerIngestCompletion({ ...input, eventPath: completion });
    await controllerMarkAccepted({ ...input, reason: 'Accepted before the proof migration.', selectedArtifactIds: [] });
    await controllerMarkIntegrated(input);
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    delete registry.tasks.find((entry) => entry.threadId === input.threadId).integrationProof;
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /台账曾标记已集成·Git 未验证/);
    assert.match(html, /不会把它冒充为已经验证进入主线/);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('lean observability piggybacks existing lifecycle events and never invokes time diagnostics', async () => {
  const fixture = await createResultProtocolFixture();
  const { taskControlHome, projectRoot, input } = fixture;
  try {
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const before = await readFile(registryPath, 'utf8');
    const query = await controllerQueryDeliverables({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(query.tasks[0].observabilityProtocolVersion, 1);
    assert.deepEqual(query.tasks[0].observabilityReceipts.map((receipt) => receipt.phase), ['registered', 'dispatch_confirmed', 'progress_ingested', 'progress_ingested']);
    let analyzerCalls = 0;
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, observabilityMode: 'lean', timeDiagnosticsAnalyzer: async () => { analyzerCalls += 1; throw new Error('must not run'); } });
    assert.equal(analyzerCalls, 0);
    assert.match(report.reportPath, /index\.html$/);
    assert.equal(report.observability.mode, 'lean');
    assert.equal(await readFile(registryPath, 'utf8'), before, 'lean reporting must not mutate the task ledger');
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /按需观测与消耗诊断/);
    assert.match(html, /轻量报告模式（lean）/);
    assert.match(html, /轻量模式只读取任务台账/);
    assert.match(html, />执行中</);
    assert.doesNotMatch(html, />executing</);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('diagnostic observability renders Chinese explanations and human-readable consumption only on demand', async () => {
  const fixture = await createResultProtocolFixture();
  const { taskControlHome, projectRoot, input } = fixture;
  try {
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const before = await readFile(registryPath, 'utf8');
    const rolloutPath = join(projectRoot, `rollout-${input.threadId}.jsonl`);
    await writeFile(rolloutPath, '{}\n', 'utf8');
    const lifecycleTask = (await controllerQueryDeliverables({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId })).tasks[0];
    const dispatchedMs = Date.parse(lifecycleTask.lastDispatchedAt);
    const fullStart = new Date(dispatchedMs - 60_000).toISOString();
    const scopedStart = new Date(dispatchedMs).toISOString();
    const scopedEnd = new Date(dispatchedMs + 120_000).toISOString();
    const fullEnd = new Date(dispatchedMs + 600_000).toISOString();
    let analyzerCalls = 0;
    const analyzeFile = async (path, baseline, range) => {
      analyzerCalls += 1;
      assert.equal(path, rolloutPath);
      assert.equal(baseline, '');
      if (!range.segmentByTurn) {
        assert.equal(range.otelJsonl, undefined);
        return { sessionId: input.threadId, input: rolloutPath, scope: { start: fullStart, end: fullEnd }, summary: { wallClockSeconds: 660 } };
      }
      assert.equal(range.otelJsonl, join(projectRoot, 'otel'));
      assert.equal(range.from, scopedStart);
      assert.equal(range.to, undefined);
      return {
        sessionId: input.threadId,
        input: rolloutPath,
        scope: { start: scopedStart, end: scopedEnd },
        summary: {
          wallClockSeconds: 120,
          activeTurns: { activeUnionSeconds: 100, idleOutsideCompletedTurnsSeconds: 20, completedCount: 2, incompleteCount: 0, clientObservedTtftSeconds: { median: 8, p90: 12 } },
          tool: { completedUnionSeconds: 40, failedCount: 1 },
          responseGap: { seconds: 15 },
          unknown: { seconds: 45, ratio: 0.375 },
          context: { peakRatio: 0.82, compactions: 1 },
          repeatedCommandCount: 2,
          retryChainCount: 1,
          threadHealth: { status: 'handoff_recommended', reasons: [{ code: 'ineffective_compaction', evidence: { beforeInputTokens: 900, afterInputTokens: 950 } }] },
          otel: { status: 'observed', completedResponseTokens: { sampleCount: 2, inputTokens: 2824623, outputTokens: 120000000 }, modelNames: ['gpt-5.6-terra'], reasoningEfforts: ['medium'], inferenceTimingAvailable: false },
          rateLimits: { sampleCount: 2, primary: { usedPercent: { first: 10, last: 11 } }, secondary: null },
        },
        turnEnvelopes: [
          { paired: true, startedAt: scopedStart, completedAt: new Date(dispatchedMs + 50_000).toISOString() },
          { paired: true, startedAt: new Date(dispatchedMs + 60_000).toISOString(), completedAt: new Date(dispatchedMs + 110_000).toISOString() },
        ],
        turnSegments: [
          { unknownSeconds: 20, responseGapSeconds: 7 },
          { unknownSeconds: 25, responseGapSeconds: 8 },
        ],
        remedies: [{ rootCause: 'repeated_command', confidence: 'high', evidence: ['two repeated commands'], systemicPrevention: 'reuse valid evidence', verificationMetric: 'repeat count' }],
      };
    };
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, observabilityMode: 'diagnostic', otelJsonl: join(projectRoot, 'otel'), rolloutPathsByThreadId: new Map([[input.threadId, rolloutPath]]), timeDiagnosticsAnalyzer: analyzeFile });
    assert.equal(analyzerCalls, 2);
    assert.match(report.reportPath, /diagnostic\.html$/);
    assert.equal(report.observability.mode, 'diagnostic');
    assert.equal(report.observability.activeTurnConcurrency.maxConcurrent, 1);
    assert.equal(await readFile(registryPath, 'utf8'), before, 'diagnostic reporting must not mutate the task ledger or heartbeat');
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /282\.46 万 Token/);
    assert.match(html, /精确值：2,824,623 Token/);
    assert.match(html, /累计输出<\/b><strong class="human-number">1\.20 亿 Token/);
    assert.match(html, /精确值：120,000,000 Token/);
    assert.match(html, /不是 OTel 额外消耗，也不是额度账单/);
    assert.match(html, /任务消耗直观对比/);
    assert.match(html, /发现重复命令（2 类重复指纹）/);
    assert.match(html, /成对证据显示压缩无效或随后反弹/);
    assert.doesNotMatch(html, /上下文压力偏高/);
    assert.match(html, /任务外空档：9 分/);
    assert.match(html, /模型回合外空档：20 秒/);
    assert.match(html, /活跃执行内无法归因：45 秒（45%）/);
    assert.match(html, /活跃执行：1 分 40 秒/);
    assert.match(html, /Terra（经济型代码理解模型）/);
    assert.match(html, /原始英文或技术记录/);
    assert.doesNotMatch(html, /2,824,623 in \/ 120,000,000 out|TTFT median|repeated_commands|unknown 45 秒|>executing</);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('post-completion conversation idle is shown outside the task and never inflates active-turn attribution', async () => {
  const fixture = await createResultProtocolFixture();
  const { taskControlHome, projectRoot, input } = fixture;
  try {
    const manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'diagnostic-candidate');
    const completion = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'diagnostic-candidate', resultManifestPath: manifestPath });
    await controllerIngestCompletion({ ...input, eventPath: completion });

    const baseMs = Date.now() - 20_000_000;
    const executionEndMs = baseMs + 322_806;
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    const task = registry.tasks.find((entry) => entry.threadId === input.threadId);
    task.lastDispatchedAt = new Date(baseMs).toISOString();
    task.executionEndedAt = new Date(executionEndMs).toISOString();
    task.completionEventCreatedAt = task.executionEndedAt;
    registry.updatedAt = new Date().toISOString();
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

    const rolloutPath = join(projectRoot, `rollout-${input.threadId}.jsonl`);
    await writeFile(rolloutPath, '{}\n', 'utf8');
    const fullEnd = new Date(baseMs + 9_346_397).toISOString();
    let analyzerCalls = 0;
    const analyzeFile = async (_path, _baseline, range) => {
      analyzerCalls += 1;
      if (!range.segmentByTurn) return { sessionId: input.threadId, input: rolloutPath, scope: { start: new Date(baseMs).toISOString(), end: fullEnd }, summary: { wallClockSeconds: 9346.397 } };
      assert.equal(range.from, new Date(baseMs).toISOString());
      assert.equal(range.to, new Date(executionEndMs).toISOString());
      return {
        sessionId: input.threadId,
        input: rolloutPath,
        scope: { start: range.from, end: range.to },
        summary: {
          wallClockSeconds: 322.806,
          activeTurns: { activeUnionSeconds: 322.806, idleOutsideCompletedTurnsSeconds: 0, completedCount: 3, incompleteCount: 0, clientObservedTtftSeconds: { median: 6.04, p90: 8 } },
          tool: { completedUnionSeconds: 38.193, failedCount: 1 },
          responseGap: { seconds: 102.029 },
          unknown: { seconds: 182.584, ratio: 0.5656 },
          context: { peakRatio: 0.51, compactions: 0 },
          repeatedCommandCount: 1,
          retryChainCount: 0,
          threadHealth: { status: 'healthy', reasons: [] },
          otel: { status: 'unavailable' },
          rateLimits: { sampleCount: 0, primary: null, secondary: null },
        },
        turnEnvelopes: [{ paired: true, startedAt: range.from, completedAt: range.to }],
        turnSegments: [{ unknownSeconds: 182.584, responseGapSeconds: 102.029 }],
        remedies: [],
      };
    };
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId, observabilityMode: 'diagnostic', rolloutPathsByThreadId: new Map([[input.threadId, rolloutPath]]), timeDiagnosticsAnalyzer: analyzeFile });
    assert.equal(analyzerCalls, 2);
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /任务外空档：2 小时 30 分 24 秒/);
    assert.match(html, /活跃执行：5 分 23 秒/);
    assert.match(html, /活跃执行内无法归因：3 分 3 秒[\s\S]*?（57%）/);
    assert.doesNotMatch(html, /99%/);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('deliverable history appends attempts and reclaimed visual work stays red instead of overwriting prior artifacts', async () => {
  const fixture = await createResultProtocolFixture({ visual: true });
  const { taskControlHome, projectRoot, input } = fixture;
  try {
    let manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'visual-attempt-1', { visual: true });
    let completion = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'visual-attempt-1', resultManifestPath: manifestPath });
    await controllerIngestCompletion({ ...input, eventPath: completion });
    await controllerMarkChangesRequested({ ...input, failureClass: 'mechanical', reason: 'One required label is missing.' });
    const preparedRework = await controllerDispatchRework(input);
    const executing = await controllerConfirmReworkDispatched({ ...input, actionId: preparedRework.pendingRework.actionId, hostReceipt: 'host-send-ok-2' });
    await controllerRecordTitleSynced({ ...input, title: executing.desiredThreadTitle });
    await delay();
    const reuse = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Existing path retained for attempt two.', stageId: 'reuse-check', evidence: [{ id: 'inspection', reference: 'git-diff-check-2.txt' }] });
    await controllerIngestProgress({ ...input, eventPath: reuse });
    await delay();
    const verification = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Attempt two presentation verified.', stageId: 'verification', evidence: [{ id: 'targeted-test', reference: 'test-output-2.txt' }] });
    await controllerIngestProgress({ ...input, eventPath: verification });
    manifestPath = await writeResultManifest(taskControlHome, projectRoot, input.threadId, 'visual-attempt-2', { visual: true });
    completion = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'visual-attempt-2', resultManifestPath: manifestPath });
    await controllerIngestCompletion({ ...input, eventPath: completion });
    let query = await controllerQueryDeliverables({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(query.tasks[0].deliverables.length, 2);
    assert.match(query.tasks[0].deliverables[0].artifacts[0].path, /after-1\.png$/);
    assert.match(query.tasks[0].deliverables[1].artifacts[0].path, /after-2\.png$/);
    await controllerReclaimTask({ ...input, reason: 'The controller must resolve a presentation contract conflict.', userSummary: 'The visual attempt was stopped for controller contract arbitration.' });
    query = await controllerQueryDeliverables({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(query.tasks[0].status, 'reclaimed');
    assert.equal(query.tasks[0].deliverables[1].deliveryStatus, 'rejected');
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /已收回/);
    assert.match(html, /package failed/);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('legacy tasks without result fields remain readable and report historical evidence as unavailable', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-legacy-result-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-task-control-legacy-project-'));
  try {
    const input = { taskControlHome, projectRoot, controllerThreadId: 'legacy-controller', parentThreadId: 'legacy-controller', threadId: 'legacy-worker', title: 'Legacy implementation record', model: 'gpt-5.6-luna', thinking: 'medium', delegationMode: 'explicit', executionSurface: 'visible_task', modelClass: 'economical', quotaReason: 'Repeatable legacy fixture saves controller quota.', workClass: 'repeatable', decisionStatus: 'resolved', scope: 'Read legacy state only.', acceptance: 'Legacy state remains readable.', forbiddenDecisions: 'Do not invent historical screenshots.', taskMode: 'control_only' };
    await controllerRegisterTask(input);
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    const legacy = registry.tasks[0];
    for (const key of ['taskMode', 'implementationPolicy', 'scopePolicy', 'implementationBriefPath', 'briefSchemaVersion', 'implementationBrief', 'briefDigest', 'hardContractTrigger', 'hardContractReason', 'contractSchemaVersion', 'implementationContractPath', 'contractDigest', 'contractRevision', 'contractCommit', 'reuseRequirements', 'forbiddenNewPaths', 'forbiddenReimplementations', 'stageGates', 'evidenceCommands', 'errorPolicy', 'validationPolicy', 'visualOracle', 'resultProtocolVersion', 'resultRequirements', 'deliverableHistory', 'stageProgress', 'incidentalRepairs', 'controlPlaneRecovery', 'observabilityProtocolVersion', 'observabilityReceipts']) delete legacy[key];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    const before = await readFile(registryPath, 'utf8');
    const query = await controllerQueryDeliverables({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(query.tasks[0].historicalEvidenceStatus, 'historical_evidence_unavailable');
    assert.equal(await readFile(registryPath, 'utf8'), before, 'read-only legacy report query must not rewrite the registry');
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.match(await readFile(report.reportPath, 'utf8'), /历史证据不可用/);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('HTML executive summary never presents control-only review as a business delivery', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-control-summary-'));
  const projectRoot = 'E:\\work\\project\\control-summary';
  try {
    const { input } = await createHeartbeatFixture(taskControlHome, projectRoot, { threadId: 'control-summary-worker' });
    await delay();
    const completion = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'control-summary-candidate' });
    await controllerIngestCompletion({ ...input, eventPath: completion });
    await controllerMarkAccepted({ ...input, reason: 'The read-only control review is correct.' });
    await controllerMarkIntegrated(input);
    const report = await controllerBuildDeliveryReport({ taskControlHome, projectRoot, controllerThreadId: input.controllerThreadId });
    assert.equal(report.businessDeliverableCount, 0);
    assert.equal(report.controlReviewPassedCount, 1);
    const html = await readFile(report.reportPath, 'utf8');
    assert.match(html, /本专题没有可验证的业务交付/);
    assert.match(html, /控制审查已通过/);
    assert.match(html, /控制任务通过不等于产品功能已经交付/);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
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

test('normal controller messages defer locally while a visible task is running and release only when idle', async () => {
  await withFixture(async (fixture) => {
    const deferred = await controllerPrepareMessage({ ...fixture, messageId: 'followup-1', kind: 'follow_up', deliveryMode: 'queue', targetTurnState: 'running', messageText: '补充检查现有测试，但不要改变合同。' });
    assert.equal(deferred.status, 'deferred_local');
    assert.equal(deferred.hostAction, null);

    const scan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(scan.deferredMessages.map((message) => message.messageId), ['followup-1']);
    assert.equal(scan.pendingMessageActions.length, 0);
    assert.equal(scan.staleDeferredMessages.length, 0);

    const stillRunning = await controllerReleaseMessage({ ...fixture, messageId: 'followup-1', targetTurnState: 'running' });
    assert.equal(stillRunning.status, 'deferred_local');
    assert.equal(stillRunning.hostAction, null);

    const prepared = await controllerReleaseMessage({ ...fixture, messageId: 'followup-1', targetTurnState: 'idle' });
    assert.equal(prepared.status, 'prepared');
    assert.equal(prepared.hostAction.type, 'send_thread_message');
    assert.equal(prepared.hostAction.deliveryMode, 'start_next_turn_only');
    await assert.rejects(
      controllerRecordMessageDelivery({ ...fixture, messageId: 'followup-1', actionId: 'forged-action', outcome: 'delivered', receipt: 'host-ok' }),
      (error) => error instanceof TaskControlError && error.code === 'MESSAGE_ACTION_STALE',
    );
    const delivered = await controllerRecordMessageDelivery({ ...fixture, messageId: 'followup-1', actionId: prepared.actionId, outcome: 'delivered', receipt: 'send-message-receipt-1' });
    assert.equal(delivered.status, 'delivered');
    assert.equal(delivered.receipt, 'send-message-receipt-1');
  });
});

test('worker completion defaults to a durable deferred-parent event and controller ingestion records observed', async () => {
  await withFixture(async (fixture) => {
    const script = fileURLToPath(new URL('./task-control.mjs', import.meta.url));
    const output = JSON.parse(execFileSync(process.execPath, [
      script,
      'complete',
      '--self', fixture.threadId,
      '--candidate-commit', 'queued-candidate',
      '--task-control-home', fixture.taskControlHome,
    ], { encoding: 'utf8' }));
    assert.equal(output.notificationRequired, false);
    assert.equal(output.notificationDeferred, true);
    assert.equal(output.notificationText, null);
    assert.equal(output.parentNotification.disposition, 'deferred_parent');
    assert.equal(output.parentNotification.targetTurnState, 'unknown');
    assert.equal(output.parentNotification.hostAction, null);

    const event = JSON.parse(await readFile(output.eventPath, 'utf8'));
    assert.deepEqual(event.parentNotification, {
      protocolVersion: 1,
      deliveryMode: 'queue',
      targetTurnState: 'unknown',
      disposition: 'deferred_parent',
      actionId: null,
      actionExpiresAt: null,
    });
    const scan = await controllerScanPendingEvents(fixture);
    assert.equal(scan.pendingEvents[0].parentNotification.disposition, 'deferred_parent');
    const awaiting = await controllerIngestCompletion({ ...fixture, eventPath: output.eventPath });
    assert.equal(awaiting.notificationStatus, 'observed');
    await assert.rejects(
      controllerMarkNotificationSent(fixture),
      (error) => error instanceof TaskControlError && error.code === 'NOTIFICATION_ALREADY_RECORDED',
    );
  });
});

test('worker notification returns a send action only for a confirmed idle direct parent', async () => {
  await withFixture(async (fixture) => {
    const script = fileURLToPath(new URL('./task-control.mjs', import.meta.url));
    const output = JSON.parse(execFileSync(process.execPath, [
      script,
      'complete',
      '--self', fixture.threadId,
      '--candidate-commit', 'idle-parent-candidate',
      '--parent-turn-state', 'idle',
      '--task-control-home', fixture.taskControlHome,
    ], { encoding: 'utf8' }));
    assert.equal(output.notificationRequired, true);
    assert.equal(output.notificationDeferred, false);
    assert.match(output.notificationText, /等待主控审查/);
    assert.equal(output.parentNotification.disposition, 'prepared');
    assert.equal(output.parentNotification.hostAction.type, 'send_thread_message');
    assert.equal(output.parentNotification.hostAction.deliveryMode, 'start_next_turn_only');
    const awaiting = await controllerIngestCompletion({ ...fixture, eventPath: output.eventPath });
    assert.equal(awaiting.notificationStatus, 'pending');
    const sent = await controllerMarkNotificationSent({ ...fixture, hostReceipt: 'host-delivered-idle-parent-notification' });
    assert.equal(sent.notificationStatus, 'sent');
  });
});

test('legacy completion events without a parent queue envelope remain read-compatible', async () => {
  await withFixture(async (fixture) => {
    const eventPath = await createCompletionEvent({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, candidateCommit: 'legacy-candidate' });
    const event = JSON.parse(await readFile(eventPath, 'utf8'));
    delete event.parentNotification;
    await writeFile(eventPath, `${JSON.stringify(event, null, 2)}\n`, 'utf8');
    const awaiting = await controllerIngestCompletion({ ...fixture, eventPath });
    assert.equal(awaiting.notificationStatus, 'pending');
  });
});

test('worker progress and failure use the same event-first parent queue and reject invalid turn state', async () => {
  await withFixture(async (fixture) => {
    const progressPath = await createProgressEvent({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, summary: 'Completed the bounded inspection.' });
    const failurePath = await createFailureEvent({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, eventType: 'task_blocked', attemptedStage: 'inspection', failureClass: 'mechanical', failureDomain: 'tooling', commandSummary: 'The local inspection tool is unavailable.', mechanicalRetryEligible: false, evidence: [{ id: 'tool-log', reference: 'logs/tool-unavailable.txt' }] });
    const progress = JSON.parse(await readFile(progressPath, 'utf8'));
    const failure = JSON.parse(await readFile(failurePath, 'utf8'));
    assert.equal(progress.parentNotification.disposition, 'deferred_parent');
    assert.equal(failure.parentNotification.disposition, 'deferred_parent');
    const scan = await controllerScanPendingEvents(fixture);
    assert.ok(scan.pendingEvents.filter((event) => ['task_progress', 'task_blocked'].includes(event.type)).every((event) => event.parentNotification.disposition === 'deferred_parent'));
    await assert.rejects(
      createCompletionEvent({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, candidateCommit: 'invalid-state', parentTurnState: 'busy' }),
      (error) => error instanceof TaskControlError && error.code === 'CLI_INVALID_ARGUMENTS',
    );
  });
});

test('interrupt is fail closed except for explicitly authorized stop or cancel', async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      controllerPrepareMessage({ ...fixture, messageId: 'unsafe-interrupt', kind: 'follow_up', deliveryMode: 'interrupt', targetTurnState: 'running', messageText: '立刻插入这条普通补充。', interruptAuthority: 'controller_safety' }),
      (error) => error instanceof TaskControlError && error.code === 'MESSAGE_INTERRUPT_NOT_AUTHORIZED',
    );
    await assert.rejects(
      controllerPrepareMessage({ ...fixture, messageId: 'missing-authority', kind: 'stop', deliveryMode: 'interrupt', targetTurnState: 'running', messageText: '立即停止当前执行。' }),
      (error) => error instanceof TaskControlError && error.code === 'MESSAGE_INTERRUPT_NOT_AUTHORIZED',
    );
    const stop = await controllerPrepareMessage({ ...fixture, messageId: 'safe-stop', kind: 'stop', deliveryMode: 'interrupt', targetTurnState: 'running', messageText: '立即停止当前执行并保留证据。', interruptAuthority: 'controller_safety' });
    assert.equal(stop.status, 'prepared');
    assert.equal(stop.hostAction.type, 'steer_thread_message');
    assert.equal(stop.hostAction.deliveryMode, 'interrupt_current_turn');
  });
});

test('deferred messages never restart a task after its lifecycle becomes terminal', async () => {
  await withFixture(async (fixture) => {
    await controllerPrepareMessage({ ...fixture, messageId: 'stale-followup', kind: 'clarification', deliveryMode: 'queue', targetTurnState: 'unknown', messageText: '空闲后补充一条澄清。' });
    await controllerMarkBlocked({ ...fixture, reason: 'superseded', userSummary: 'The task is no longer needed.', blockerSource: 'superseded' });
    const scan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(scan.staleDeferredMessages.map((message) => message.messageId), ['stale-followup']);
    const cancelled = await controllerReleaseMessage({ ...fixture, messageId: 'stale-followup', targetTurnState: 'idle' });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.hostAction, null);
    assert.match(cancelled.failureReason, /target lifecycle/);
  });
});

test('legacy registries without a controller message group stay read-compatible without scan-time rewrites', async () => {
  await withFixture(async (fixture) => {
    const registryPath = join(fixture.taskControlHome, 'projects', projectKeyForRoot(fixture.projectRoot), 'task-registry.json');
    const legacy = JSON.parse(await readFile(registryPath, 'utf8'));
    delete legacy.controllerMessages;
    delete legacy.controllerCheckpoints;
    delete legacy.controllerHandoffs;
    await writeFile(registryPath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
    const self = await querySelf({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId });
    assert.equal(self.task.threadId, fixture.threadId);
    const scan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(scan.deferredMessages, []);
    assert.deepEqual(scan.pendingMessageActions, []);
    const after = JSON.parse(await readFile(registryPath, 'utf8'));
    assert.equal('controllerMessages' in after, false);
    assert.equal('controllerCheckpoints' in after, false);
    assert.equal('controllerHandoffs' in after, false);
  });
});

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

test('adaptive heartbeat starts on dispatch, renews a logical lease on progress, and only reschedules at a real boundary', async () => {
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
    const awaitingDispatch = await controllerFinalizeCycle(input);
    assert.equal(awaitingDispatch.phase, 'awaiting_dispatch');
    assert.equal(awaitingDispatch.businessAllowed, true);
    assert.equal(awaitingDispatch.heartbeatAction, null);
    await assert.rejects(createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'not actually dispatched' }), (error) => error instanceof TaskControlError && error.code === 'TASK_DISPATCH_NOT_AUTHORIZED');

    const dispatched = await controllerRecordDispatched(input);
    assert.equal(dispatched.heartbeatAction.type, 'create_controller_heartbeat');
    assert.equal(dispatched.heartbeatAction.intervalMs, 3 * 60 * 1000);
    assert.equal(dispatched.heartbeatAction.mode, 'one_shot');
    assert.equal(dispatched.heartbeatState.generation, 0, 'prepare must not advance confirmed generation');
    const dispatchGeneration = dispatched.heartbeatAction.generation;
    const dispatchDueAt = dispatched.heartbeatAction.dueAt;
    const confirmedDispatch = await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'heartbeat-auto-1' });
    assert.equal(confirmedDispatch.heartbeatState.generation, dispatchGeneration);
    assert.equal(confirmedDispatch.heartbeatState.lastSuccessfulGeneration, dispatchGeneration);

    await delay();
    const progressPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'targeted tests are running' });
    scan = await controllerScanPendingEvents(input);
    assert.deepEqual(scan.pendingEvents.map((event) => event.type), ['task_progress']);
    const progressed = await controllerIngestProgress({ ...input, eventPath: progressPath });
    assert.equal(progressed.heartbeatState.generation, dispatchGeneration);
    assert.equal(progressed.heartbeatAction, null, 'progress must not replace the physical App automation');
    assert.ok(Date.parse(progressed.heartbeatState.logicalLeaseDueAt) > Date.parse(dispatchDueAt));

    await delay();
    const completionPath = await createCompletionEvent({ taskControlHome, selfThreadId: input.threadId, candidateCommit: 'adaptive-candidate-1' });
    const completed = await controllerIngestCompletion({ ...input, eventPath: completionPath });
    assert.equal(completed.heartbeatState.generation, dispatchGeneration);
    assert.equal(completed.heartbeatAction.intervalMs, 5 * 60 * 1000);
    assert.ok(completed.heartbeatAction.generation > dispatchGeneration);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('heartbeat replacement failure does not advance the confirmed generation', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-2pc-'));
  const projectRoot = 'E:\\work\\project\\heartbeat-two-phase-failure';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot);
    const first = await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'heartbeat-2pc-auto-1' });
    assert.equal(first.heartbeatState.generation, 1);

    await delay();
    const progressPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'bounded check reached a real checkpoint' });
    const prepared = await controllerIngestProgress({ ...input, eventPath: progressPath });
    assert.equal(prepared.heartbeatState.generation, 1);
    assert.equal(prepared.heartbeatAction, null);
    const replacement = await controllerRearmHeartbeat({ ...input, reason: 'reconcile' });
    assert.equal(replacement.heartbeatAction.generation, 2);
    const failed = await controllerRecordHeartbeatActionFailed({ ...input, actionId: replacement.heartbeatAction.actionId, reason: 'automation_update timed out' });
    assert.equal(failed.heartbeatState.generation, 1);
    assert.equal(failed.heartbeatState.automationId, 'heartbeat-2pc-auto-1');
    assert.equal(failed.heartbeatState.pendingAction, null);
    assert.equal(failed.heartbeatAction, null, 'an unknown create result must not delete the confirmed fallback automation');

    const retry = await controllerRearmHeartbeat({ ...input, reason: 'reconcile' });
    const partial = await controllerRecordHeartbeatActionFailed({ ...input, actionId: retry.heartbeatAction.actionId, automationId: 'heartbeat-2pc-partial-2', reason: 'create returned an id but confirmation timed out' });
    assert.equal(partial.heartbeatState.generation, 1);
    assert.equal(partial.heartbeatState.automationId, 'heartbeat-2pc-auto-1');
    assert.equal(partial.heartbeatAction.automationId, 'heartbeat-2pc-partial-2', 'only the known partial replacement may be compensated');

    const oldStillValid = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 1, heartbeatAutomationId: 'heartbeat-2pc-auto-1', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 1 });
    assert.equal(oldStillValid.staleHeartbeat, false);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('legacy confirmed heartbeat migrates to protocol v3 without losing generation', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-migration-'));
  const projectRoot = 'E:\\work\\project\\heartbeat-v2-migration';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot);
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'heartbeat-migration-auto-1' });
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    const heartbeat = registry.controllerHeartbeats[0];
    for (const key of ['protocolVersion', 'automationId', 'lastSuccessfulGeneration', 'lastSuccessfulAt', 'pendingAction', 'consecutiveStaleCount', 'lastStaleGeneration', 'lastStaleAt', 'observedAutomationId', 'observedGeneration', 'observedTriggerCount', 'lastTriggeredAt', 'actionFailureCount', 'deleteFailureCount', 'disabledAt', 'disableReason', 'notificationStatus', 'actionHistory', 'retiredAutomationIds', 'consecutiveNoProgressCycles', 'lastCycleFingerprint', 'lastCycleReceiptKey', 'lastMeaningfulProgressAt', 'noProgressFuseCount', 'manualResumeCount', 'lastManualResumeAt', 'lastManualResumeReason']) delete heartbeat[key];
    heartbeat.generation = 121;
    heartbeat.updatedAt = new Date().toISOString();
    registry.updatedAt = heartbeat.updatedAt;
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

    const scan = await controllerScanPendingEvents(input);
    assert.equal(scan.heartbeatState.generation, 121);
    assert.equal(scan.heartbeatState.protocolVersion, 3);
    assert.equal(scan.heartbeatState.consecutiveNoProgressCycles, 0);
    const unchanged = JSON.parse(await readFile(registryPath, 'utf8'));
    assert.equal('protocolVersion' in unchanged.controllerHeartbeats[0], false, 'read-only scan without automation identity must not rewrite legacy heartbeat');

    const prepared = await controllerRearmHeartbeat({ ...input, reason: 'reconcile' });
    assert.equal(prepared.heartbeatState.generation, 121);
    assert.equal(prepared.heartbeatAction.generation, 122);
    const migrated = JSON.parse(await readFile(registryPath, 'utf8'));
    assert.equal(migrated.controllerHeartbeats[0].protocolVersion, 3);
    assert.equal(migrated.controllerHeartbeats[0].lastSuccessfulGeneration, 121);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('protocol v2 prepared generation zero remains readable and migrates in memory', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-v2-zero-'));
  const projectRoot = 'E:\\work\\project\\heartbeat-v2-zero';
  try {
    const { input } = await createHeartbeatFixture(taskControlHome, projectRoot);
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    const heartbeat = registry.controllerHeartbeats[0];
    heartbeat.protocolVersion = 2;
    for (const key of ['consecutiveNoProgressCycles', 'lastCycleFingerprint', 'lastCycleReceiptKey', 'lastMeaningfulProgressAt', 'noProgressFuseCount', 'manualResumeCount', 'lastManualResumeAt', 'lastManualResumeReason']) delete heartbeat[key];
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

    const scan = await controllerScanPendingEvents(input);
    assert.equal(scan.heartbeatState.protocolVersion, 3);
    assert.equal(scan.heartbeatState.generation, 0);
    assert.equal(scan.heartbeatState.consecutiveNoProgressCycles, 0);
    const unchanged = JSON.parse(await readFile(registryPath, 'utf8'));
    assert.equal(unchanged.controllerHeartbeats[0].protocolVersion, 2, 'read-only scan must not rewrite the v2 ledger');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('a timed-out pending heartbeat action returns bounded compensation', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-timeout-'));
  const projectRoot = 'E:\\work\\project\\heartbeat-pending-timeout';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot);
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'heartbeat-timeout-auto-1' });
    await delay();
    const progressPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'checkpoint before a hanging host call' });
    await controllerIngestProgress({ ...input, eventPath: progressPath });
    await controllerRearmHeartbeat({ ...input, reason: 'reconcile' });
    const registryPath = join(taskControlHome, 'projects', projectKeyForRoot(projectRoot), 'task-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    registry.controllerHeartbeats[0].pendingAction.expiresAt = '2000-01-01T00:00:00.000Z';
    registry.updatedAt = new Date().toISOString();
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    const scan = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 1, heartbeatAutomationId: 'heartbeat-timeout-auto-1', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 1 });
    assert.equal(scan.pendingHeartbeat, true);
    assert.equal(scan.heartbeatAction.type, 'compensate_timed_out_heartbeat_action');
    assert.equal(scan.pendingEvents.length, 0);
    assert.equal(scan.needsControllerAttention, false);
    const blocked = await controllerMarkBlocked({ ...input, reason: 'Business recovery must remain available despite heartbeat compensation.', userSummary: 'Lifecycle recovery continued while the host heartbeat was reconciled separately.', blockerSource: 'external' });
    assert.equal(blocked.status, 'blocked');
    const finalization = await controllerFinalizeCycle(input);
    assert.equal(finalization.phase, 'compensate_timed_out_heartbeat');
    assert.equal(finalization.heartbeatAction.type, 'compensate_timed_out_heartbeat_action');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('a pending automation can self-confirm, while repeated stale generations fuse and notify once', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-stale-'));
  const projectRoot = 'E:\\work\\project\\heartbeat-stale-fuse';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot);
    const observed = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 1, heartbeatAutomationId: 'heartbeat-stale-auto-1', heartbeatActionId: dispatched.heartbeatAction.actionId, heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 1 });
    assert.equal(observed.pendingHeartbeat, true);
    assert.equal(observed.heartbeatAction.type, 'confirm_observed_heartbeat');
    await controllerConfirmHeartbeatAction({ ...input, actionId: observed.heartbeatAction.actionId, automationId: 'heartbeat-stale-auto-1', observed: true });

    await delay();
    const progressPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'checkpoint before generation switch' });
    await controllerIngestProgress({ ...input, eventPath: progressPath });
    const prepared = await controllerRearmHeartbeat({ ...input, reason: 'reconcile' });
    await controllerConfirmHeartbeatAction({ ...input, actionId: prepared.heartbeatAction.actionId, automationId: 'heartbeat-stale-auto-2' });

    let stale;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      stale = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 1, heartbeatAutomationId: 'heartbeat-stale-auto-1', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: attempt });
      assert.equal(stale.staleHeartbeat, true);
      assert.equal(stale.heartbeatAction.type, attempt === 1 ? 'delete_stale_automation' : 'manual_heartbeat_cleanup_required');
      assert.equal(stale.pendingEvents.length, 0);
      assert.equal(stale.needsControllerAttention, false);
    }
    assert.equal(stale.heartbeatState.consecutiveStaleCount, 2);
    assert.equal(stale.notificationRequired, true);
    await controllerMarkHeartbeatNotificationSent(input);
    const afterNotification = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 1, heartbeatAutomationId: 'heartbeat-stale-auto-1', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 3 });
    assert.equal(afterNotification.notificationRequired, false);
    assert.equal(afterNotification.heartbeatAction.type, 'manual_heartbeat_cleanup_required');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('misconfigured or exhausted one-shot heartbeat returns only a delete action', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-count-'));
  const projectRoot = 'E:\\work\\project\\heartbeat-count-fuse';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot);
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'heartbeat-count-auto-1' });
    const misconfigured = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 1, heartbeatAutomationId: 'heartbeat-count-auto-1', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=10;COUNT=2', heartbeatOccurrence: 1 });
    assert.equal(misconfigured.staleReason, 'rrule_count_misconfigured');
    assert.equal(misconfigured.heartbeatAction.type, 'delete_stale_automation');
    assert.equal(misconfigured.pendingEvents.length, 0);
    const exhausted = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 1, heartbeatAutomationId: 'heartbeat-count-auto-1', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=10;COUNT=1', heartbeatOccurrence: 2 });
    assert.equal(exhausted.staleReason, 'one_shot_exhausted');
    assert.equal(exhausted.heartbeatAction.type, 'delete_stale_automation');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('repeated retired-automation delete failures open a bounded fuse', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-delete-'));
  const projectRoot = 'E:\\work\\project\\heartbeat-delete-fuse';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot);
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'heartbeat-delete-auto-1' });
    await delay();
    const progressPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'checkpoint before replacing automation' });
    await controllerIngestProgress({ ...input, eventPath: progressPath });
    const prepared = await controllerRearmHeartbeat({ ...input, reason: 'reconcile' });
    const confirmed = await controllerConfirmHeartbeatAction({ ...input, actionId: prepared.heartbeatAction.actionId, automationId: 'heartbeat-delete-auto-2' });
    const cleanup = confirmed.cleanupHeartbeatAction;
    assert.equal(cleanup.automationId, 'heartbeat-delete-auto-1');
    let failure;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      failure = await controllerRecordHeartbeatActionFailed({ ...input, actionId: cleanup.actionId, automationId: cleanup.automationId, reason: `delete attempt ${attempt} timed out` });
    }
    assert.equal(failure.fuseOpen, true);
    assert.equal(failure.notificationRequired, true);
    assert.equal(failure.heartbeatState.deleteFailureCount, 2);
    assert.equal(failure.heartbeatAction.type, 'manual_heartbeat_cleanup_required');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('current heartbeat delete failures fuse while business recovery remains available', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-current-delete-'));
  const projectRoot = 'E:\\work\\project\\heartbeat-current-delete-fuse';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot);
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'heartbeat-current-auto-1' });
    const blocked = await controllerMarkBlocked({ ...input, reason: 'superseded heartbeat fixture', userSummary: 'The heartbeat fixture is no longer needed.', blockerSource: 'superseded' });
    await controllerConfirmHeartbeatAction({ ...input, actionId: blocked.heartbeatAction.actionId, automationId: 'heartbeat-current-auto-2' });
    const notification = await controllerMarkCloseoutNotificationSent(input);
    await controllerConfirmHeartbeatAction({ ...input, actionId: notification.heartbeatAction.actionId, automationId: 'heartbeat-current-auto-3' });
    const reportSynced = await controllerRefreshCloseoutReport(input);
    await controllerConfirmHeartbeatAction({ ...input, actionId: reportSynced.heartbeatAction.actionId, automationId: 'heartbeat-current-auto-4' });
    await controllerRecordTitleSynced({ ...input, title: blocked.desiredThreadTitle });
    const deletePrepared = await controllerRecordArchiveSucceeded(input);
    assert.equal(deletePrepared.heartbeatAction.type, 'delete_controller_heartbeat');
    assert.equal(deletePrepared.heartbeatAction.automationId, 'heartbeat-current-auto-4');
    let failure;
    let deleteAction = deletePrepared.heartbeatAction;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      failure = await controllerRecordHeartbeatActionFailed({ ...input, actionId: deleteAction.actionId, automationId: 'heartbeat-current-auto-4', reason: `current delete attempt ${attempt} timed out` });
      deleteAction = failure.heartbeatAction;
    }
    assert.equal(failure.fuseOpen, true);
    assert.equal(failure.heartbeatState.status, 'armed');
    assert.equal(failure.heartbeatState.generation, deletePrepared.heartbeatAction.generation - 1);
    assert.equal(failure.heartbeatState.automationId, 'heartbeat-current-auto-4');
    assert.equal(failure.heartbeatState.pendingAction.type, 'delete_controller_heartbeat');
    assert.equal(failure.heartbeatState.pendingAction.manualOnly, true);
    assert.equal(failure.heartbeatAction.type, 'manual_heartbeat_cleanup_required');
    assert.equal((await controllerAssertBusinessReady(input)).businessAllowed, true);
    const stale = await controllerScanPendingEvents({ ...input, heartbeatGeneration: deletePrepared.heartbeatAction.generation - 1, heartbeatAutomationId: 'heartbeat-current-auto-4', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=5;COUNT=1', heartbeatOccurrence: 4 });
    assert.equal(stale.heartbeatAction.type, 'manual_heartbeat_cleanup_required');
    assert.equal(stale.pendingEvents.length, 0);
    const manuallyCleaned = await controllerConfirmHeartbeatAction({ ...input, actionId: failure.heartbeatState.pendingAction.actionId, automationId: 'heartbeat-current-auto-4' });
    assert.equal(manuallyCleaned.heartbeatState.status, 'cancelled');
    assert.notEqual(manuallyCleaned.heartbeatState.disabledAt, null);
    const resumed = await controllerResumeWatchdog({ ...input, reason: 'User verified the host automation was removed.' });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.heartbeatState.disabledAt, null);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('two consecutive no-progress watchdog cycles stop automatic rearm without blocking business recovery', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-watchdog-no-progress-'));
  const projectRoot = 'E:\\work\\project\\watchdog-no-progress';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot);
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'watchdog-no-progress-auto-1' });

    const first = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 1, heartbeatAutomationId: 'watchdog-no-progress-auto-1', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 1 });
    assert.equal(first.cycleEvidence.baseline, true);
    assert.equal(first.cycleEvidence.consecutiveNoProgressCycles, 0);
    let finalized = await controllerFinalizeCycle(input);
    await controllerConfirmHeartbeatAction({ ...input, actionId: finalized.heartbeatAction.actionId, automationId: 'watchdog-no-progress-auto-2' });

    const second = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 2, heartbeatAutomationId: 'watchdog-no-progress-auto-2', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 1 });
    assert.equal(second.cycleEvidence.consecutiveNoProgressCycles, 1);
    assert.equal(second.watchdogFused, false);
    finalized = await controllerFinalizeCycle(input);
    await controllerConfirmHeartbeatAction({ ...input, actionId: finalized.heartbeatAction.actionId, automationId: 'watchdog-no-progress-auto-3' });

    const third = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 3, heartbeatAutomationId: 'watchdog-no-progress-auto-3', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 1 });
    assert.equal(third.cycleEvidence.consecutiveNoProgressCycles, 2);
    assert.equal(third.cycleEvidence.fuseOpened, true);
    assert.equal(third.watchdogFused, true);
    assert.equal(third.shouldKeepHeartbeat, false);
    assert.equal(third.heartbeatAction.type, 'controller_finalize_cycle');
    assert.equal((await controllerAssertBusinessReady(input)).businessAllowed, true);

    await delay();
    const lateProgressPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'Late progress arrived after the watchdog fuse opened.' });
    const lateProgress = await controllerIngestProgress({ ...input, eventPath: lateProgressPath });
    assert.notEqual(lateProgress.heartbeatState.disabledAt, null, 'business progress must not silently reopen a fused watchdog');
    assert.equal(lateProgress.heartbeatAction.type, 'delete_controller_heartbeat');
    await controllerConfirmHeartbeatAction({ ...input, actionId: lateProgress.heartbeatAction.actionId, automationId: 'watchdog-no-progress-auto-3' });
    const resumed = await controllerResumeWatchdog({ ...input, reason: 'User reviewed the stalled worker and chose to continue monitoring.' });
    assert.equal(resumed.heartbeatAction.type, 'create_controller_heartbeat');
    assert.equal(resumed.heartbeatState.consecutiveNoProgressCycles, 0);
    assert.equal(resumed.heartbeatState.manualResumeCount, 1);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('real progress resets the no-progress watchdog counter and schedules a consumed one-shot again', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-watchdog-progress-reset-'));
  const projectRoot = 'E:\\work\\project\\watchdog-progress-reset';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot);
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'watchdog-progress-auto-1' });
    await controllerScanPendingEvents({ ...input, heartbeatGeneration: 1, heartbeatAutomationId: 'watchdog-progress-auto-1', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 1 });
    let finalized = await controllerFinalizeCycle(input);
    await controllerConfirmHeartbeatAction({ ...input, actionId: finalized.heartbeatAction.actionId, automationId: 'watchdog-progress-auto-2' });
    const unchanged = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 2, heartbeatAutomationId: 'watchdog-progress-auto-2', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 1 });
    assert.equal(unchanged.cycleEvidence.consecutiveNoProgressCycles, 1);

    await delay();
    const progressPath = await createProgressEvent({ taskControlHome, selfThreadId: input.threadId, summary: 'A real worker checkpoint arrived.' });
    const progressed = await controllerIngestProgress({ ...input, eventPath: progressPath });
    assert.equal(progressed.heartbeatState.consecutiveNoProgressCycles, 0);
    assert.equal(progressed.heartbeatAction.type, 'create_controller_heartbeat', 'a one-shot that already fired must be replaced after real progress');
    await controllerConfirmHeartbeatAction({ ...input, actionId: progressed.heartbeatAction.actionId, automationId: 'watchdog-progress-auto-3' });
    const afterProgress = await controllerScanPendingEvents({ ...input, heartbeatGeneration: 3, heartbeatAutomationId: 'watchdog-progress-auto-3', heartbeatRrule: 'FREQ=MINUTELY;INTERVAL=3;COUNT=1', heartbeatOccurrence: 1 });
    assert.equal(afterProgress.cycleEvidence.baseline, true);
    assert.equal(afterProgress.cycleEvidence.consecutiveNoProgressCycles, 0);
    assert.equal(afterProgress.watchdogFused, false);
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('terminal closeout supersedes an unconfirmed create without blocking unrelated business recovery', async () => {
  const taskControlHome = await mkdtemp(join(tmpdir(), 'codex-task-control-heartbeat-terminal-finalize-'));
  const projectRoot = 'E:\\work\\project\\heartbeat-terminal-finalize';
  try {
    const { input, dispatched } = await createHeartbeatFixture(taskControlHome, projectRoot, { threadId: 'terminal-worker' });
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'heartbeat-confirmed-generation-155' });

    const failurePath = await createFailureEvent({
      taskControlHome,
      selfThreadId: input.threadId,
      eventType: 'task_blocked',
      attemptedStage: 'runner',
      failureClass: 'comprehension',
      failureDomain: 'tooling',
      commandSummary: 'The runner stopped before producing a candidate commit.',
      mechanicalRetryEligible: false,
      evidence: [{ id: 'runner-log', reference: 'logs/runner-blocked.txt' }],
    });
    const failed = await controllerIngestFailure({ ...input, eventPath: failurePath, eventType: 'task_blocked' });
    assert.equal(failed.heartbeatAction, null, 'failure must reuse the untriggered confirmed one-shot');

    const reclaimed = await controllerReclaimTask({ ...input, reason: 'A second blocker requires controller recovery.', userSummary: 'The failed attempt was closed without another automatic replacement.' });
    await controllerMarkCloseoutNotificationSent(input);
    await controllerRefreshCloseoutReport(input);
    await controllerRecordTitleSynced({ ...input, title: reclaimed.desiredThreadTitle });
    const archived = await controllerRecordArchiveSucceeded(input);

    assert.equal(archived.heartbeatAction.type, 'finalize_controller_cycle');
    assert.deepEqual(archived.heartbeatAction.hostActions.at(-1), { type: 'delete_confirmed_automation', automationId: 'heartbeat-confirmed-generation-155', generation: dispatched.heartbeatAction.generation });

    const finalized = await controllerFinalizeCycle(input);
    assert.equal(finalized.finalized, false);
    assert.equal(finalized.businessAllowed, false);
    assert.equal(finalized.phase, 'delete_heartbeat');
    assert.equal(finalized.heartbeatAction.actionId, archived.heartbeatAction.actionId);
    assert.equal((await controllerAssertBusinessReady(input)).businessAllowed, true);

    const retryCleanup = await controllerRecordHeartbeatActionFailed({
      ...input,
      actionId: archived.heartbeatAction.actionId,
      automationId: 'heartbeat-confirmed-generation-155',
      reason: 'host compare-and-delete timed out',
    });
    assert.equal(retryCleanup.heartbeatAction.type, 'finalize_controller_cycle');
    assert.notEqual(retryCleanup.heartbeatAction.actionId, archived.heartbeatAction.actionId);
    assert.deepEqual(retryCleanup.heartbeatAction.hostActions, archived.heartbeatAction.hostActions);
    assert.equal((await controllerAssertBusinessReady(input)).businessAllowed, true);

    const confirmed = await controllerConfirmHeartbeatAction({
      ...input,
      actionId: retryCleanup.heartbeatAction.actionId,
      automationId: 'heartbeat-confirmed-generation-155',
      pendingCreateCleanupOutcome: 'not_found',
    });
    assert.equal(confirmed.cycleFinalized, true);
    assert.equal(confirmed.heartbeatState.status, 'cancelled');
    assert.equal(confirmed.heartbeatState.automationId, null);
    const ready = await controllerAssertBusinessReady(input);
    assert.equal(ready.businessAllowed, true);
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
    await controllerConfirmHeartbeatAction({ ...input, actionId: dispatched.heartbeatAction.actionId, automationId: 'routing-terra-auto-1' });

    const cleanupInput = {
      ...input,
      threadId: 'terminal-cleanup-worker',
      title: '清理终态任务',
      model: 'gpt-5.6-luna',
      thinking: 'medium',
      workClass: 'repeatable',
      quotaReason: 'repeatable cleanup setup saves premium controller quota',
    };
    const { dispatched: cleanupDispatched } = await register(cleanupInput);
    await controllerConfirmHeartbeatAction({ ...cleanupInput, actionId: cleanupDispatched.heartbeatAction.actionId, automationId: 'routing-cleanup-auto-2' });
    const blocked = await controllerMarkBlocked({ ...cleanupInput, reason: 'superseded test task', userSummary: 'The test task is superseded and safely stopped.', blockerSource: 'superseded' });
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
    for (const key of ['workClass', 'decisionStatus', 'scope', 'acceptance', 'forbiddenDecisions', 'executionStatus', 'nextOwner', 'attemptCount', 'failureClass', 'changesRequestedReason', 'reclaimedReason', 'taskMode', 'implementationPolicy', 'implementationBriefPath', 'briefSchemaVersion', 'implementationBrief', 'briefDigest', 'hardContractTrigger', 'hardContractReason', 'contractSchemaVersion', 'implementationContractPath', 'contractDigest', 'contractRevision', 'contractCommit', 'reuseRequirements', 'forbiddenNewPaths', 'forbiddenReimplementations', 'stageGates', 'evidenceCommands', 'errorPolicy', 'validationPolicy', 'visualOracle', 'resultProtocolVersion', 'resultRequirements', 'deliverableHistory', 'stageProgress', 'observabilityProtocolVersion', 'observabilityReceipts']) delete task[key];
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
    const reclaimed = await invokeCli(['controller-reclaim', ...common, '--reason', 'The controller will resolve the contract boundary.', '--user-summary', 'The worker was stopped so the controller can resolve the contract boundary.']);
    assert.equal(reclaimed.desiredThreadTitle, '收回｜01 Implement bounded validator');
  } finally {
    await rm(taskControlHome, { recursive: true, force: true });
  }
});

test('lifecycle titles synchronize before terminal archive and heartbeat cleanup', async () => {
  await withFixture(async (fixture) => {
    await delay();
    const eventPath = await createCompletionEvent({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, candidateCommit: 'candidate-2', parentTurnState: 'idle' });
    await delay();
    const event = JSON.parse(await readFile(eventPath, 'utf8'));
    const receiptPath = await createNotificationFailureReceipt({ taskControlHome: fixture.taskControlHome, selfThreadId: fixture.threadId, actionId: event.parentNotification.actionId, reason: 'send_message_to_thread unavailable' });
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

    const blockedParent = await controllerMarkBlocked({ ...fixture, reason: 'superseded', userSummary: 'The parent fixture is superseded.', blockerSource: 'superseded' });
    await controllerRecordTitleFailed({ ...fixture, title: blockedParent.desiredThreadTitle, reason: 'temporary title API failure' });
    let rootScan = await controllerScanPendingEvents(fixture);
    assert.deepEqual(rootScan.threadActions, []);
    assert.deepEqual(rootScan.pendingCleanupTasks, []);
    assert.equal(rootScan.deferredCleanupTasks[0].actionability, 'title_failed');
    assert.equal(rootScan.shouldKeepHeartbeat, true);
    assert.equal(rootScan.incidentQueue.length, 1);
    await assert.rejects(controllerRecordTitleSynced({ ...fixture, title: blockedParent.desiredThreadTitle }), (error) => error instanceof TaskControlError && error.code === 'THREAD_ACTION_NOT_PENDING');
    const titleRetry = await invokeCli(['controller-retry-thread-action', '--task-control-home', fixture.taskControlHome, '--project-root', fixture.projectRoot, '--controller', fixture.controllerThreadId, '--thread', fixture.threadId, '--action', 'set_thread_title', '--reason', 'The title API is available again.']);
    assert.deepEqual(titleRetry.requiredThreadActions, [{ type: 'set_thread_title', threadId: fixture.threadId, title: blockedParent.desiredThreadTitle }]);
    assert.equal(titleRetry.heartbeatAction.type, 'create_controller_heartbeat');
    await controllerRecordTitleSynced({ ...fixture, title: blockedParent.desiredThreadTitle });
    rootScan = await controllerScanPendingEvents(fixture);
    assert.equal(rootScan.threadActions.length, 0);
    assert.equal(rootScan.deferredCleanupTasks[0].actionability, 'waiting_descendants');
    assert.equal(rootScan.shouldKeepHeartbeat, true);

    const blockedChild = await controllerMarkBlocked({ ...nestedInput, reason: 'superseded', userSummary: 'The child fixture is superseded.', blockerSource: 'superseded' });
    await controllerRecordTitleSynced({ ...nestedInput, title: blockedChild.desiredThreadTitle });
    const failedArchive = await controllerRecordArchiveFailed({ ...nestedInput, reason: 'Inactive thread archive did not persist' });
    assert.ok(['create_controller_heartbeat', 'delete_controller_heartbeat'].includes(failedArchive.heartbeatAction.type));
    let childScan = await controllerScanPendingEvents({ ...nestedInput, controllerThreadId: fixture.threadId });
    assert.deepEqual(childScan.threadActions, []);
    assert.deepEqual(childScan.pendingCleanupTasks, []);
    assert.equal(childScan.deferredCleanupTasks[0].actionability, 'archive_failed');
    assert.equal(childScan.shouldKeepHeartbeat, true);
    assert.equal(childScan.incidentQueue.length, 1);
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
