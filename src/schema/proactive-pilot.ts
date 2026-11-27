import { z } from 'zod';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const commit = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString() === s);
const safe = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive = safe.min(1);
const label = (max: number) => z.string().min(1).max(max);
const classification = z.enum(['public', 'internal', 'confidential', 'restricted']);
const artifact = z.object({ artifactId: uuid, revision: safe, contentHash: hash, classification }).strict();
const entity = z.object({ entityType: label(128), entityId: uuid, revision: safe, stateHash: hash.optional() }).strict();
const evidence = z.object({ evidenceId: uuid, sourceType: label(128), sourceResourceId: label(512), sourceRevision: label(256).optional(), contentHash: hash, classification }).strict();
const actor = z.object({ principalId: uuid, kind: z.enum(['human', 'service', 'captain', 'worker']), initiatedByPrincipalId: uuid.optional() }).strict();
const base = { schema: z.literal('ae.event/1'), version: z.literal(1), eventId: uuid, tenantId: uuid, rootEventId: uuid, causationId: uuid.optional(), correlationId: uuid, taskId: uuid, rootTaskId: uuid, hop: safe.max(6), occurredAt: timestamp, expiresAt: timestamp, idempotencyKey: label(512), actor, authContextRef: uuid, budgetReservationId: uuid.optional(), recipientPrincipalId: uuid, canonicalHash: hash };
const limitations = z.array(label(1000)).max(32);

export const PilotEventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('sales.request.received'), data: z.object({ sourceMessageRef: evidence, accountRef: entity, requestedOutcome: label(2000), sensitivity: classification, evidenceRefs: z.array(evidence).max(64), responseDeadline: timestamp, requestedByChannel: z.enum(['slack', 'linear', 'email', 'workspace', 'api']) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('product.gap.requested'), data: z.object({ accountRef: entity, gapSummary: label(4000), evidenceRefs: z.array(evidence).max(64), proposedUseCase: label(2000), responseDeadline: timestamp }).strict() }).strict(),
  z.object({ ...base, type: z.literal('engineering.preview.requested'), data: z.object({ specRef: artifact, acceptanceCriteriaRef: artifact, repositoryId: label(256), baseCommit: commit, requestedCapability: z.literal('sandbox.preview'), approvalRef: uuid, classification }).strict() }).strict(),
  z.object({ ...base, type: z.literal('engineering.preview.ready'), data: z.object({ commitSha: commit, buildArtifactHash: hash, testReceiptRefs: z.array(artifact).min(1).max(64), reviewReceiptRef: artifact, previewRef: artifact, limitations }).strict() }).strict(),
  z.object({ ...base, type: z.literal('sales.preview.available'), data: z.object({ authorizedPreviewRef: artifact, calculatorRef: artifact, pricingPolicyVersion: label(128), customerSafeSummary: label(4000), limitations }).strict() }).strict(),
]);
export type PilotEvent = z.infer<typeof PilotEventSchema>;

const scopeArguments = z.object({ operation: z.literal('engineering.scope'), acceptedPlan: artifact, spec: artifact, acceptanceCriteria: artifact, repositoryId: label(256), baseCommit: commit, protectedTestSuite: artifact, sandboxProfileRef: label(512), egressProfileRef: label(512), modelProfileRef: label(512), playbookReleaseRef: label(512), rootBudgetId: uuid, reservationId: uuid, maxCostMicroUsd: safe, maxModelCalls: positive, maxToolCalls: positive, maxConcurrentWorkers: positive.max(2), maxWallTimeMs: positive, deadlineAt: timestamp, externalWrites: z.literal(false), productionDeploy: z.literal(false) }).strict();
const previewArguments = z.object({ operation: z.literal('private_preview.publish'), repositoryId: label(256), candidateCommit: commit, buildArtifact: artifact, buildDigest: hash, testReceiptRefs: z.array(artifact).min(1).max(64), independentReviewReceipt: artifact, accessPolicyRef: label(512), audiencePrincipalIds: z.array(uuid).min(1).max(64).refine((ids) => new Set(ids).size === ids.length), targetEnvironment: z.literal('private_preview'), expiresAt: timestamp, productionDeploy: z.literal(false), publicAnonymousAccess: z.literal(false) }).strict();
const approvalBase = { schema: z.literal('ae.approval/1'), version: z.literal(1), tenantId: uuid, taskId: uuid, rootTaskId: uuid, effectId: uuid, target: label(512), argumentsHash: hash, artifactRefs: z.array(artifact).min(1).max(64), artifactHash: hash.optional(), repositoryId: label(256), policyVersion: positive, budgetReservationId: uuid, maxCostMicroUsd: safe, expiresAt: timestamp, singleUse: z.literal(true), requiredHumanRole: label(128) };
export const PilotApprovalSchema = z.discriminatedUnion('effectKind', [
  z.object({ ...approvalBase, effectKind: z.literal('engineering.scope'), visibility: z.enum(['private', 'internal']), baseCommit: commit, candidateCommit: commit.optional(), arguments: scopeArguments }).strict(),
  z.object({ ...approvalBase, effectKind: z.literal('private_preview.publish'), visibility: z.literal('private'), baseCommit: commit.optional(), candidateCommit: commit, arguments: previewArguments }).strict(),
]);
export type PilotApproval = z.infer<typeof PilotApprovalSchema>;
