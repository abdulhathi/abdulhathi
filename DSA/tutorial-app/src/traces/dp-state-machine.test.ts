import { describe, expect, it } from 'vitest';
import { stockCooldown, stockTwoTransactions } from './dp-state-machine';

describe('state machine DP traces', () => {
  it('handles the cooldown', () => {
    expect(stockCooldown([1, 2, 3, 0, 2]).answer).toBe(3);
    expect(stockCooldown([1]).answer).toBe(0);
    expect(stockCooldown([3, 1, 4, 2, 5, 0, 3]).answer).toBe(6); // the walkthrough, checked by brute force
    expect(stockCooldown([5, 4, 3]).answer).toBe(0);
  });

  it('allows at most two transactions', () => {
    expect(stockTwoTransactions([3, 3, 5, 0, 0, 3, 1, 4]).answer).toBe(6);
    expect(stockTwoTransactions([1, 2, 3, 4, 5]).answer).toBe(4);
    expect(stockTwoTransactions([5, 2, 6, 1, 4, 8, 3, 7]).answer).toBe(11); // the walkthrough, checked by brute force
    expect(stockTwoTransactions([7, 6, 4, 3, 1]).answer).toBe(0);
  });

  it('explains every frame', () => {
    for (const { frames } of [stockCooldown([1, 2, 3, 0, 2]), stockTwoTransactions([3, 3, 5, 0, 0, 3, 1, 4])]) {
      expect(frames.length).toBeGreaterThan(4);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(20);
    }
  });
});
