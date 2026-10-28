import { PilotApprovalSchema, PilotEventSchema, type PilotEvent } from '../../schema/proactive-pilot.js';
import { canonicalHash, type PilotAdmissionContext, type PilotApprovalContext } from './admission.js';

/** All identities, commits, approvals and evidence in this module are fictional. */
export const fixtureId = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const FIXTURE_NOW = '2026-10-28T12:00:00.000Z';
export const FIXTURE_EXPIRY = '2026-10-29T12:00:00.000Z';
export const FIXTURE_BASE = 'b'.repeat(40);
export const FIXTURE_CANDIDATE = 'c'.repeat(40);

export function fixtureArtifact(n: number, label: string) {
  return {
    artifactId: fixtureId(n),
    revision: 1,
    contentHash: canonicalHash({ fixture: true, label }),
    classification: 'internal' as const,
  };
}

export function buildPilotFlowFixtures() {
  const actor = { principalId: fixtureId(4), kind: 'service' as const };
  const context: PilotAdmissionContext = {
    tenantId: fixtureId(1), now: FIXTURE_NOW,
    expectedRecipientId: fixtureId(5), trustedPrincipal: actor,
    trustedAuthContextRef: fixtureId(6),
  };
  const source = {
    evidenceId: fixtureId(8), sourceType: 'fixture',
    sourceResourceId: 'fictional-customer-message',
    contentHash: canonicalHash({ text: 'Fixture customer needs a source-linked workflow preview.' }),
    classification: 'internal' as const,
  };
  const account = { entityType: 'account', entityId: fixtureId(9), revision: 1 };
  const plan = fixtureArtifact(10, 'accepted-plan');
  const spec = fixtureArtifact(11, 'product-spec');
  const acceptance = fixtureArtifact(12, 'acceptance-criteria');
  const tests = fixtureArtifact(13, 'protected-test-suite');
  const review = fixtureArtifact(17, 'independent-review-fixture');
  const preview = fixtureArtifact(18, 'unpublished-preview-artifact');
  const calculator = fixtureArtifact(19, 'deterministic-pricing-fixture');
  const args = {
    operation: 'engineering.scope' as const,
    acceptedPlan: plan, spec, acceptanceCriteria: acceptance,
    repositoryId: 'fixture-repository', baseCommit: FIXTURE_BASE,
    protectedTestSuite: tests,
    sandboxProfileRef: 'fixture:sandbox', egressProfileRef: 'fixture:no-network',
    modelProfileRef: 'fixture:no-inference', playbookReleaseRef: 'fixture:team-v1',
    rootBudgetId: fixtureId(14), reservationId: fixtureId(15),
    maxCostMicroUsd: 0, maxModelCalls: 1, maxToolCalls: 5,
    maxConcurrentWorkers: 1, maxWallTimeMs: 1000,
    deadlineAt: FIXTURE_EXPIRY, externalWrites: false as const,
    productionDeploy: false as const,
  };
  const approval = PilotApprovalSchema.parse({
    schema: 'ae.approval/1', version: 1,
    tenantId: fixtureId(1), taskId: fixtureId(7), rootTaskId: fixtureId(7),
    effectId: fixtureId(16), effectKind: 'engineering.scope',
    target: 'fixture-repository', visibility: 'internal',
    argumentsHash: canonicalHash(args), artifactRefs: [plan, spec, acceptance, tests],
    repositoryId: 'fixture-repository', baseCommit: FIXTURE_BASE,
    policyVersion: 1, budgetReservationId: fixtureId(15), maxCostMicroUsd: 0,
    expiresAt: FIXTURE_EXPIRY, singleUse: true,
    requiredHumanRole: 'fixture-owner', arguments: args,
  });
  const approvalHash = canonicalHash(approval);
  const approvalContext: PilotApprovalContext = {
    tenantId: fixtureId(1), now: FIXTURE_NOW,
    expectedPayloadHash: approvalHash, currentPayload: approval,
    currentPolicyVersion: 1,
    trustedHuman: { principalId: fixtureId(20), active: true, roles: ['fixture-owner'] },
    latestDecision: { payloadHash: approvalHash, principalId: fixtureId(20), decision: 'approved' },
    grantActive: true, reservationActive: true, killSwitch: false,
  };
  const route: Array<{ type: PilotEvent['type']; data: unknown }> = [
    { type: 'sales.request.received', data: {
      sourceMessageRef: source, accountRef: account,
      requestedOutcome: 'Prepare an unpublished fixture preview; do not contact anyone.',
      sensitivity: 'internal', evidenceRefs: [source],
      responseDeadline: FIXTURE_EXPIRY, requestedByChannel: 'workspace',
    } },
    { type: 'product.gap.requested', data: {
      accountRef: account, gapSummary: 'Fixture gap: traceable handoffs.', evidenceRefs: [source],
      proposedUseCase: 'Sales to Product to Engineering rehearsal', responseDeadline: FIXTURE_EXPIRY,
    } },
    { type: 'engineering.preview.requested', data: {
      specRef: spec, acceptanceCriteriaRef: acceptance, repositoryId: 'fixture-repository',
      baseCommit: FIXTURE_BASE, requestedCapability: 'sandbox.preview',
      approvalRef: fixtureId(16), classification: 'internal',
    } },
    { type: 'engineering.preview.ready', data: {
      commitSha: FIXTURE_CANDIDATE, buildArtifactHash: preview.contentHash,
      testReceiptRefs: [tests], reviewReceiptRef: review, previewRef: preview,
      limitations: ['Fake implementation and fake review; not live execution evidence.'],
    } },
    { type: 'sales.preview.available', data: {
      authorizedPreviewRef: preview, calculatorRef: calculator, pricingPolicyVersion: 'fixture-only/1',
      customerSafeSummary: 'Unpublished fixture preview; no delivery or pricing commitment.',
      limitations: ['Human communication required; no artifact was published.'],
    } },
  ];
  const events = route.map((step, index) => {
    const body = {
      schema: 'ae.event/1', version: 1, type: step.type,
      eventId: fixtureId(100 + index), tenantId: fixtureId(1),
      rootEventId: fixtureId(100),
      ...(index ? { causationId: fixtureId(99 + index) } : {}),
      correlationId: fixtureId(3), taskId: fixtureId(7), rootTaskId: fixtureId(7),
      hop: index, occurredAt: FIXTURE_NOW, expiresAt: FIXTURE_EXPIRY,
      idempotencyKey: `fixture-route-${index}`, actor,
      authContextRef: fixtureId(6), recipientPrincipalId: fixtureId(5), data: step.data,
    };
    return PilotEventSchema.parse({ ...body, canonicalHash: canonicalHash(body) });
  });
  return { context, approval, approvalContext, events, plan, spec, acceptance, tests, review, preview };
}
