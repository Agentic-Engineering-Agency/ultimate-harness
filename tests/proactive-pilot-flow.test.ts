import { describe, expect, it } from 'vitest';
import { runProactivePilotDemo } from '../src/harness/proactive-pilot/demo.js';

describe('local AE proactive pilot rehearsal', () => {
  it('rehearses the five typed handoffs without activating a real team or external action', () => {
    const report = runProactivePilotDemo();
    expect(report.mode).toBe('fixture-only');
    expect(report.route).toEqual([
      'sales.request.received',
      'product.gap.requested',
      'engineering.preview.requested',
      'engineering.preview.ready',
      'sales.preview.available',
    ]);
    expect(report.externalEffects).toEqual([]);
    expect(report.activated).toBe(false);
    expect(report.scopeGate).toBe('fixture-approved-not-human-authority');
    expect(report.artifact.customerSafeSummary).toContain('fixture');
    expect(report.artifact.published).toBe(false);
    expect(report.checks.duplicateReturnedOriginal).toBe(true);
    expect(report.checks.changedScopeRejected).toBe(true);
    expect(report.checks.staleEpochRejected).toBe(true);
    expect(report.checks.cancelIsNotQuiescence).toBe(true);
    expect(report.checks.unconfiguredTeamsBlocked).toBe(true);
  });
});
