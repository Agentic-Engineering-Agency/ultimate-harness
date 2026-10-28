import { readFileSync } from 'node:fs';
import { admitPilotEvent, canonicalHash, PilotError, validateScopeApproval, type PilotPriorReceipt } from './admission.js';
import { buildPilotFlowFixtures, fixtureId, FIXTURE_BASE, FIXTURE_CANDIDATE, fixtureArtifact } from './fixtures.js';
import { derivePilotActivationReport, loadPilotTeam } from './team.js';
import { FakePilotWorker, type ArtifactRef, type PilotStartRequest, type Result } from './worker.js';

function requireSuccess<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Fixture invariant failed: ${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** Explicit boundary mapping: retain the artifact ID and exact digest; never fetch or rewrite evidence. */
function workerArtifact(ref: { artifactId: string; contentHash: string }): ArtifactRef {
  return { id: ref.artifactId, sha256: ref.contentHash.slice('sha256:'.length) };
}

/**
 * Local, synchronous fixture rehearsal. No model, network, broker, process runner,
 * actual human decision, protected-test execution or durable store is involved.
 * A successful return is not authority to activate TEAMs or publish an artifact.
 */
export function runProactivePilotDemo() {
  const fixtures = buildPilotFlowFixtures();
  const loaded = (['sales', 'product', 'engineering'] as const).map((department) => {
    const markdown = readFileSync(new URL(`../../../fixtures/proactive-pilot/teams/${department}/TEAM.md`, import.meta.url), 'utf8');
    const result = loadPilotTeam(markdown);
    if (!result.ok) throw new Error(`Invalid ${department} fixture TEAM: ${result.errors.join('; ')}`);
    return result;
  });
  // Deliberately no configured policy/identity/resource context.
  const activation = derivePilotActivationReport(loaded, undefined);
  if (activation.activatable) throw new Error('Fixture TEAMs must never activate');

  const receipts: PilotPriorReceipt[] = [];
  const route: string[] = [];
  let scopeGate: 'fixture-approved-not-human-authority' | undefined;
  for (const event of fixtures.events) {
    if (event.type === 'engineering.preview.requested') {
      const { approval } = validateScopeApproval(fixtures.approval, fixtures.approvalContext);
      if (approval.effectKind !== 'engineering.scope'
          || approval.arguments.operation !== 'engineering.scope'
          || event.data.approvalRef !== approval.effectId
          || event.tenantId !== approval.tenantId
          || event.taskId !== approval.taskId
          || event.rootTaskId !== approval.rootTaskId
          || event.data.repositoryId !== approval.repositoryId
          || event.data.baseCommit !== approval.baseCommit
          || canonicalHash(event.data.specRef) !== canonicalHash(approval.arguments.spec)
          || canonicalHash(event.data.acceptanceCriteriaRef) !== canonicalHash(approval.arguments.acceptanceCriteria)) {
        throw new PilotError('PILOT_APPROVAL_BINDING_MISMATCH');
      }
      scopeGate = 'fixture-approved-not-human-authority';
    }
    const receipt = admitPilotEvent(event, fixtures.context, receipts);
    receipts.push(receipt);
    route.push(receipt.event.type);
  }
  const duplicate = admitPilotEvent(fixtures.events[0], fixtures.context, receipts);
  const original = receipts[0];
  const duplicateReturnedOriginal = duplicate.status === 'duplicate'
    && duplicate.eventId === original.eventId && duplicate.canonicalHash === original.canonicalHash;

  let changedScopeRejected = false;
  try {
    validateScopeApproval(fixtures.approval, {
      ...fixtures.approvalContext,
      currentPayload: { ...fixtures.approval, baseCommit: FIXTURE_CANDIDATE },
    });
  } catch (error) {
    if (!(error instanceof PilotError) || error.code !== 'PILOT_APPROVAL_BINDING_MISMATCH') throw error;
    changedScopeRejected = true;
  }

  const base = { repositoryId: 'fixture-repository', sha: FIXTURE_BASE };
  const candidate = { repositoryId: base.repositoryId, sha: FIXTURE_CANDIDATE };
  const request: PilotStartRequest = {
    missionId: fixtureId(200), attemptId: fixtureId(201), taskEpoch: 1,
    mode: 'implementation', acceptedPlan: workerArtifact(fixtures.plan),
    spec: workerArtifact(fixtures.spec), acceptanceCriteria: workerArtifact(fixtures.acceptance),
    originalBaseCommit: base, requiredCapabilities: ['workspace.edit', 'test.execute'],
    budget: { reservationId: fixtureId(15), maxCostMicroUsd: 0 },
  };
  const implementation = new FakePilotWorker();
  requireSuccess(implementation.start(request));
  requireSuccess(implementation.recordCandidate(request, candidate));
  const implementationBundle = requireSuccess(implementation.exportArtifacts(request, candidate));

  const review = new FakePilotWorker();
  const reviewRequest: PilotStartRequest = {
    ...request, attemptId: fixtureId(202), mode: 'independent_review',
    candidateToReview: candidate, requiredCapabilities: ['review.read_only'],
  };
  requireSuccess(review.start(reviewRequest));
  const reviewBundle = requireSuccess(review.exportArtifacts(reviewRequest, candidate));
  if (reviewBundle.candidateCommit.sha !== implementationBundle.candidateCommit.sha
      || reviewBundle.spec.sha256 !== implementationBundle.spec.sha256) {
    throw new Error('Fixture review must bind the exact candidate and spec');
  }

  const cancellationProbe = new FakePilotWorker();
  const cancelRequest = { ...request, attemptId: fixtureId(203) };
  requireSuccess(cancellationProbe.start(cancelRequest));
  requireSuccess(cancellationProbe.fence(2));
  const stale = cancellationProbe.cancel(cancelRequest, 'old epoch');
  const staleEpochRejected = !stale.ok && stale.error.code === 'stale_epoch';
  const current = { ...cancelRequest, taskEpoch: 2 };
  const cancellation = requireSuccess(cancellationProbe.cancel(current, 'fixture cancellation probe'));
  const cancelIsNotQuiescence = cancellation.acknowledgment === 'request_recorded' && !cancellation.quiescent;
  requireSuccess(cancellationProbe.proveQuiescence(current, workerArtifact(fixtureArtifact(204, 'fake-quiescence-proof'))));

  const last = fixtures.events[4];
  if (last.type !== 'sales.preview.available') throw new Error('Fixture route must end in a Sales-safe draft');
  if (!scopeGate) throw new PilotError('PILOT_APPROVAL_BINDING_MISMATCH');
  return {
    mode: 'fixture-only' as const,
    activated: activation.activatable,
    scopeGate,
    route,
    rootTaskId: fixtures.events[0].rootTaskId,
    receipts: receipts.map(({ eventId, idempotencyKey, canonicalHash }) => ({ eventId, idempotencyKey, canonicalHash })),
    externalEffects: [] as string[],
    artifact: { customerSafeSummary: last.data.customerSafeSummary, published: false as const },
    worker: { adapter: 'FakePilotWorker', candidate: implementationBundle.candidateCommit, reviewCandidate: reviewBundle.candidateCommit },
    activation,
    checks: {
      duplicateReturnedOriginal, changedScopeRejected, staleEpochRejected, cancelIsNotQuiescence,
      unconfiguredTeamsBlocked: activation.teams.every((team) => !team.activatable && team.blockers.length > 0),
    },
    limitations: [
      'Local, ephemeral fixtures only; no authenticated human authority or durable ledger.',
      'Implementation/review/quiescence artifacts are fictional, not live runner or OS evidence.',
      'This is a contract rehearsal, not a production event router, broker, or enabled proactive process.',
    ],
  };
}
