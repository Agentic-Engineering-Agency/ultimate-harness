import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '../src/harness/proactive-pilot/admission.js';
import { runProactivePilotDemo } from '../src/harness/proactive-pilot/demo.js';
import * as fixtures from '../src/harness/proactive-pilot/fixtures.js';
import { loadPilotTeam } from '../src/harness/proactive-pilot/team.js';
import { demoPilotStartRequest, FakePilotWorker } from '../src/harness/proactive-pilot/worker.js';
import type { PilotEvent } from '../src/schema/proactive-pilot.js';

const proof = { id: fixtures.fixtureId(300), sha256: '9'.repeat(64) };

it('rejects multiple YAML documents inside TEAM frontmatter explicitly', () => {
  const result = loadPilotTeam('---\na: 1\n--- x\nb: 2\n---\n');
  expect(result.ok).toBe(false);
  expect(!result.ok && result.errors.join('\n')).toContain('MULTIPLE_DOCS');
});

function started() {
  const worker = new FakePilotWorker();
  const request = demoPilotStartRequest();
  const candidate = { ...request.originalBaseCommit, sha: 'c'.repeat(40) };
  expect(worker.start(request).ok).toBe(true);
  expect(worker.recordCandidate(request, candidate).ok).toBe(true);
  return { worker, request, candidate };
}

describe('pilot worker terminal-state invariants', () => {
  it('requires proof before exporting a canceled attempt', () => {
    const { worker, request, candidate } = started();
    expect(worker.cancel(request, 'handoff').ok).toBe(true);
    expect(worker.exportArtifacts(request, candidate)).toMatchObject({ ok: false, error: { code: 'policy_denied' } });
    expect(worker.proveQuiescence(request, proof).ok).toBe(true);
    expect(worker.exportArtifacts(request, candidate).ok).toBe(true);
  });

  it.each(['cancel_requested', 'quiescent', 'blocked', 'completed'] as const)('rejects candidate changes while %s', (state) => {
    const { worker, request, candidate } = started();
    if (state === 'completed') {
      expect(worker.exportArtifacts(request, candidate).ok).toBe(true);
    } else {
      if (state === 'blocked') {
        expect(worker.perform(request, { effectId: 'lost-result', capability: 'test.execute', outcome: 'unknown' }).ok).toBe(true);
      }
      expect(worker.cancel(request, 'handoff').ok).toBe(true);
      if (state !== 'cancel_requested') expect(worker.proveQuiescence(request, proof).ok).toBe(true);
      if (state === 'blocked') expect(worker.checkpoint(request).ok).toBe(false);
    }
    expect(worker.recordCandidate(request, { ...candidate, sha: 'd'.repeat(40) }))
      .toMatchObject({ ok: false, error: { code: 'policy_denied' } });
    if (state === 'quiescent') {
      expect(worker.checkpoint(request)).toMatchObject({ ok: true, value: { checkpointCommit: candidate } });
    }
  });

  it('exports a completed candidate only once', () => {
    const { worker, request, candidate } = started();
    expect(worker.exportArtifacts(request, candidate).ok).toBe(true);
    expect(worker.exportArtifacts(request, candidate)).toMatchObject({ ok: false, error: { code: 'policy_denied' } });
    const events = worker.streamEvents(request);
    expect(events.ok && events.value.filter((event) => event.type === 'artifact.exported')).toHaveLength(1);
  });

  it('repeats cancellation truthfully without emitting duplicate acknowledgments', () => {
    const { worker, request } = started();
    const requested = worker.cancel(request, 'handoff');
    expect(worker.cancel(request, 'again')).toEqual(requested);
    const proven = worker.proveQuiescence(request, proof);
    expect(worker.cancel(request, 'after proof')).toEqual(proven);
    const events = worker.streamEvents(request);
    expect(events.ok && events.value.map((event) => event.type))
      .toEqual(['task.started', 'task.cancel.requested', 'task.cancel.ack', 'task.cancel.ack']);
  });

  it.each(['completed', 'blocked'] as const)('does not append a cancel receipt while %s', (state) => {
    const { worker, request, candidate } = started();
    if (state === 'completed') {
      expect(worker.exportArtifacts(request, candidate).ok).toBe(true);
    } else {
      expect(worker.perform(request, { effectId: 'lost-result', capability: 'test.execute', outcome: 'unknown' }).ok).toBe(true);
      expect(worker.cancel(request, 'handoff').ok).toBe(true);
      expect(worker.proveQuiescence(request, proof).ok).toBe(true);
      expect(worker.checkpoint(request).ok).toBe(false);
    }
    const before = worker.streamEvents(request);
    expect(worker.cancel(request, 'too late')).toMatchObject({ ok: false, error: { code: 'policy_denied' } });
    expect(worker.streamEvents(request)).toEqual(before);
  });
});

type PreviewRequest = Extract<PilotEvent, { type: 'engineering.preview.requested' }>;
const mismatches: Array<[string, (event: PreviewRequest) => void]> = [
  ['approval', (event) => { event.data.approvalRef = fixtures.fixtureId(400); }],
  ['spec', (event) => { event.data.specRef = fixtures.fixtureArtifact(401, 'different-spec'); }],
  ['acceptance criteria', (event) => { event.data.acceptanceCriteriaRef = fixtures.fixtureArtifact(402, 'different-acceptance'); }],
  ['repository', (event) => { event.data.repositoryId = 'different-repository'; }],
  ['base commit', (event) => { event.data.baseCommit = 'd'.repeat(40); }],
  ['task', (event) => { event.taskId = fixtures.fixtureId(403); }],
  ['root task', (event) => { event.rootTaskId = fixtures.fixtureId(404); }],
];

describe('pilot scope handoff binding', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(mismatches)('rejects a correctly hashed event with different %s', (_name, mutate) => {
    const flow = fixtures.buildPilotFlowFixtures();
    const event = flow.events.find((entry) => entry.type === 'engineering.preview.requested');
    if (!event || event.type !== 'engineering.preview.requested') throw new Error('Missing preview fixture');
    mutate(event);
    const { canonicalHash: _oldHash, ...body } = event;
    event.canonicalHash = canonicalHash(body);
    vi.spyOn(fixtures, 'buildPilotFlowFixtures').mockReturnValue(flow);
    expect(() => runProactivePilotDemo()).toThrow('PILOT_APPROVAL_BINDING_MISMATCH');
  });
});
