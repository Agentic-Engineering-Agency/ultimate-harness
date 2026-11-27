import { createHash } from 'node:crypto';
import { PilotApprovalSchema, PilotEventSchema, type PilotApproval, type PilotEvent } from '../../schema/proactive-pilot.js';

export class PilotError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'PilotError'; }
}
const fail = (code: string): never => { throw new PilotError(code); };
const invalidJson = (): never => fail('PILOT_INVALID_JSON');
const validString = (s: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s);

/** Restricted JSON: well-formed Unicode, safe integers, plain data objects, bounded depth. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (v: unknown, depth: number): string => {
    if (depth > 64) return invalidJson();
    if (v === null) return 'null';
    if (typeof v === 'string') return validString(v) ? JSON.stringify(v) : invalidJson();
    if (typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') return Number.isSafeInteger(v) ? JSON.stringify(v) : invalidJson();
    if (typeof v !== 'object' || ancestors.has(v)) return invalidJson();
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return invalidJson();
    if (Object.getOwnPropertySymbols(v).length) return invalidJson();
    ancestors.add(v);
    let result: string;
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length || Object.getOwnPropertyNames(v).length !== v.length + 1) return invalidJson();
      result = `[${v.map((_, i) => {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !('value' in d)) return invalidJson();
        return visit(d.value, depth + 1);
      }).join(',')}]`;
    } else {
      const names = Object.getOwnPropertyNames(v).sort();
      result = `{${names.map((name) => {
        const d = Object.getOwnPropertyDescriptor(v, name);
        if (!validString(name) || !d || !d.enumerable || !('value' in d)) return invalidJson();
        return `${JSON.stringify(name)}:${visit(d.value, depth + 1)}`;
      }).join(',')}}`;
    }
    ancestors.delete(v);
    return result;
  };
  return visit(value, 0);
}
export function canonicalHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

/** Parse raw JSON before object construction so duplicate keys cannot disappear. */
export function parsePilotJson(text: string): unknown {
  if (typeof text !== 'string' || text.length > 1_000_000) return invalidJson();
  try {
    const value: unknown = JSON.parse(text);
    let i = 0;
    const ws = () => { while (/\s/.test(text[i] ?? '') && i < text.length) i++; };
    const string = (): string => {
      const start = i++;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i++] === '"') return JSON.parse(text.slice(start, i)) as string;
      }
      return invalidJson();
    };
    const scan = (depth: number): void => {
      if (depth > 64) return invalidJson();
      ws();
      if (text[i] === '{') {
        i++; ws(); const keys = new Set<string>();
        if (text[i] === '}') { i++; return; }
        while (true) {
          ws(); const key = string();
          if (keys.has(key)) return invalidJson();
          keys.add(key); ws(); i++; scan(depth + 1); ws();
          if (text[i++] === '}') return;
        }
      }
      if (text[i] === '[') {
        i++; ws(); if (text[i] === ']') { i++; return; }
        while (true) { scan(depth + 1); ws(); if (text[i++] === ']') return; }
      }
      if (text[i] === '"') { string(); return; }
      const start = i;
      while (i < text.length && !/[\s,\]}]/.test(text[i]!)) i++;
      const token = text.slice(start, i);
      if (!['true', 'false', 'null'].includes(token) && (!/^-?(?:0|[1-9]\d*)$/.test(token) || !Number.isSafeInteger(Number(token)))) return invalidJson();
    };
    scan(0); canonicalJson(value);
    return value;
  } catch { return invalidJson(); }
}

type Principal = PilotEvent['actor'];
export interface PilotAdmissionContext { tenantId: string; now: string; expectedRecipientId?: string; trustedPrincipal: Principal; trustedAuthContextRef: string }
export interface PilotPriorReceipt { eventId: string; idempotencyKey: string; canonicalHash: string }
export interface PilotAdmissionReceipt extends PilotPriorReceipt { status: 'accepted' | 'duplicate'; event: PilotEvent }
const validTime = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString() === s;

export function admitPilotEvent(event: unknown, context: PilotAdmissionContext, prior: PilotPriorReceipt[] = []): PilotAdmissionReceipt {
  try { canonicalJson(event); } catch { return fail('PILOT_INVALID_EVENT'); }
  const parsed = PilotEventSchema.safeParse(event);
  if (!parsed.success) return fail('PILOT_INVALID_EVENT');
  const e = parsed.data;
  if (!context || e.tenantId !== context.tenantId) return fail('PILOT_TENANT_MISMATCH');
  if (!context.trustedPrincipal || canonicalJson(e.actor) !== canonicalJson(context.trustedPrincipal) || e.authContextRef !== context.trustedAuthContextRef) return fail('PILOT_PRINCIPAL_MISMATCH');
  if (context.expectedRecipientId !== undefined && e.recipientPrincipalId !== context.expectedRecipientId) return fail('PILOT_RECIPIENT_MISMATCH');
  if (!validTime(context.now) || e.occurredAt > context.now || e.expiresAt <= context.now || e.expiresAt <= e.occurredAt) return fail('PILOT_EVENT_EXPIRED');
  const { canonicalHash: supplied, ...body } = e;
  if (canonicalHash(body) !== supplied) return fail('PILOT_HASH_MISMATCH');
  let duplicate = false;
  for (const entry of prior) {
    if (entry.eventId === e.eventId || entry.idempotencyKey === e.idempotencyKey) {
      if (entry.eventId !== e.eventId || entry.idempotencyKey !== e.idempotencyKey || entry.canonicalHash !== supplied) return fail('PILOT_DUPLICATE_CONFLICT');
      duplicate = true;
    }
  }
  return { status: duplicate ? 'duplicate' : 'accepted', eventId: e.eventId, idempotencyKey: e.idempotencyKey, canonicalHash: supplied, event: e };
}

export interface PilotApprovalContext {
  tenantId: string; now: string; expectedPayloadHash: string; currentPayload: unknown; currentPolicyVersion: number;
  trustedHuman: { principalId: string; active: boolean; roles: string[] };
  latestDecision: { payloadHash: string; principalId: string; decision: 'approved' | 'denied' | 'revoked' | 'expired' };
  grantActive: boolean; reservationActive: boolean; killSwitch: boolean;
}
export interface PilotApprovalReceipt { status: 'valid'; payloadHash: string; approval: PilotApproval }

/** Current facts are trusted fixture inputs, never assertions from the approval itself. */
export function validateScopeApproval(payload: unknown, context: PilotApprovalContext): PilotApprovalReceipt {
  try { canonicalJson(payload); } catch { return fail('PILOT_INVALID_APPROVAL'); }
  const parsed = PilotApprovalSchema.safeParse(payload);
  if (!parsed.success) return fail('PILOT_INVALID_APPROVAL');
  const a = parsed.data;
  if (!context || a.tenantId !== context.tenantId) return fail('PILOT_TENANT_MISMATCH');
  if (!validTime(context.now) || a.expiresAt <= context.now) return fail('PILOT_APPROVAL_EXPIRED');
  let payloadHash: string;
  try {
    payloadHash = canonicalHash(a);
    if (payloadHash !== context.expectedPayloadHash || canonicalHash(context.currentPayload) !== payloadHash || canonicalHash(a.arguments) !== a.argumentsHash) return fail('PILOT_APPROVAL_BINDING_MISMATCH');
  } catch (error) { if (error instanceof PilotError && error.code === 'PILOT_APPROVAL_BINDING_MISMATCH') throw error; return fail('PILOT_APPROVAL_BINDING_MISMATCH'); }
  if (!context.trustedHuman || context.trustedHuman.active !== true || !Array.isArray(context.trustedHuman.roles) || !context.trustedHuman.roles.includes(a.requiredHumanRole) || !context.latestDecision || context.latestDecision.decision !== 'approved' || context.latestDecision.principalId !== context.trustedHuman.principalId || context.latestDecision.payloadHash !== payloadHash || context.currentPolicyVersion !== a.policyVersion || context.grantActive !== true || context.reservationActive !== true || context.killSwitch !== false) return fail('PILOT_APPROVAL_DENIED');
  const args = a.arguments;
  if (a.repositoryId !== args.repositoryId) return fail('PILOT_APPROVAL_BINDING_MISMATCH');
  const refs = a.effectKind === 'engineering.scope' && args.operation === 'engineering.scope'
    ? [args.acceptedPlan, args.spec, args.acceptanceCriteria, args.protectedTestSuite]
    : args.operation === 'private_preview.publish' ? [args.buildArtifact, ...args.testReceiptRefs, args.independentReviewReceipt] : [];
  if (refs.some((ref) => !a.artifactRefs.some((entry) => canonicalJson(entry) === canonicalJson(ref)))) return fail('PILOT_APPROVAL_BINDING_MISMATCH');
  if (a.effectKind === 'engineering.scope' && args.operation === 'engineering.scope' && (a.baseCommit !== args.baseCommit || a.budgetReservationId !== args.reservationId || a.maxCostMicroUsd !== args.maxCostMicroUsd || args.deadlineAt <= context.now)) return fail('PILOT_APPROVAL_BINDING_MISMATCH');
  if (a.effectKind === 'private_preview.publish' && args.operation === 'private_preview.publish' && (a.candidateCommit !== args.candidateCommit || args.buildDigest !== args.buildArtifact.contentHash || args.expiresAt <= context.now)) return fail('PILOT_APPROVAL_BINDING_MISMATCH');
  return { status: 'valid', payloadHash, approval: a };
}
