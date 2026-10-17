// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyEvent, applyEvents, initialRunState, toRunEvent, type RunEvent } from './events';

const run: RunEvent[] = [
  { id: 1, type: 'run.started', data: { prompt: 'Order parts' } },
  { id: 2, type: 'step.started', data: { step_id: 'plan', title: 'Plan' } },
  { id: 3, type: 'token', data: { step_id: 'plan', text: 'I will ' } },
  { id: 4, type: 'token', data: { step_id: 'plan', text: 'check.' } },
  { id: 5, type: 'step.completed', data: { step_id: 'plan' } },
  { id: 6, type: 'step.started', data: { step_id: 'po', title: 'Create purchase order' } },
  { id: 7, type: 'approval.required', data: { step_id: 'po', action: 'create_purchase_order', details: { amount: 1250 }, timeout_s: 120 } },
];

describe('applyEvent', () => {
  it('builds steps, text and the pending approval', () => {
    const state = run.reduce((s, e) => applyEvent(s, e, 1_000), initialRunState);
    expect(state.status).toBe('awaiting_approval');
    expect(state.steps.map((s) => [s.id, s.status])).toEqual([
      ['plan', 'done'],
      ['po', 'running'],
    ]);
    expect(state.steps[0].text).toBe('I will check.');
    expect(state.approval).toEqual({ stepId: 'po', action: 'create_purchase_order', details: { amount: 1250 }, deadline: 121_000 });
    expect(state.announcement).toBe('Approval needed: create purchase order');
  });

  it("keeps the server's deadline when the log is replayed later, capped at one full timeout", () => {
    const required = (expires_at_ms?: number): RunEvent => ({
      id: 7,
      type: 'approval.required',
      data: { step_id: 'po', action: 'create_purchase_order', details: {}, timeout_s: 120, expires_at_ms },
    });
    const before = applyEvents(initialRunState, run.slice(0, 6));
    const replayAt = (now: number, e: RunEvent) => applyEvent(before, e, now);
    // Reloaded 90 s after the approval was requested: 30 s left, not a fresh 120.
    expect(replayAt(90_000, required(120_000)).approval?.deadline).toBe(120_000);
    // A client clock running behind the server's never shows more than a full timeout.
    expect(replayAt(0, required(500_000)).approval?.deadline).toBe(120_000);
    // An older server without the field: fall back to now + timeout.
    expect(replayAt(1_000, required()).approval?.deadline).toBe(121_000);
  });

  it('ignores events it has already applied, so a replay after reconnecting changes nothing', () => {
    const once = applyEvents(initialRunState, run);
    const replayed = applyEvents(once, run.slice(2));
    expect(replayed).toBe(once);
  });

  it('records why a run stopped', () => {
    const state = applyEvents(initialRunState, [...run, { id: 8, type: 'run.cancelled', data: { reason: 'abandoned' } }]);
    expect(state.status).toBe('cancelled');
    expect(state.approval).toBeNull();
    expect(state.outcome).toBe('abandoned');
  });
});

describe('toRunEvent', () => {
  it('accepts known events and rejects unknown types, bad ids and bad JSON', () => {
    expect(toRunEvent({ event: 'token', id: '3', data: '{"step_id":"a","text":"x"}' })).toEqual({
      id: 3,
      type: 'token',
      data: { step_id: 'a', text: 'x' },
    });
    expect(toRunEvent({ event: 'brand.new', id: '4', data: '{}' })).toBeNull(); // from a newer server: skip, do not crash
    expect(toRunEvent({ event: 'token', id: '', data: '{}' })).toBeNull();
    expect(toRunEvent({ event: 'token', id: '5', data: '{not json' })).toBeNull();
  });
});
