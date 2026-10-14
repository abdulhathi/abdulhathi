import { describe, expect, it } from 'vitest';
import { addStrings, circularGame, robotPasses } from './simulation';

describe('simulation traces', () => {
  it('decides whether the robot is bounded after one pass', () => {
    const r = robotPasses('GGRG');
    expect(r.bounded).toBe(true);
    expect(r.ends[0]).toEqual([1, 2, 'east']);
    expect(r.ends[3]).toEqual([0, 0, 'north']);
    expect(robotPasses('GG').bounded).toBe(false);
    expect(robotPasses('GGLLGG').bounded).toBe(true);
    expect(robotPasses('GL').bounded).toBe(true);
  });

  it('adds numbers given as strings', () => {
    expect(addStrings('4567', '658').sum).toBe(String(4567 + 658));
    expect(addStrings('11', '123').sum).toBe('134');
    expect(addStrings('999', '1').sum).toBe('1000');
    expect(addStrings('0', '0').sum).toBe('0');
  });

  it('finds the winner of the circular game', () => {
    expect(circularGame(5, 2).winner).toBe(3);
    expect(circularGame(6, 5).winner).toBe(1);
  });

  it('explains every frame', () => {
    for (const { frames } of [robotPasses('GGRG'), addStrings('9', '9'), circularGame(3, 2)]) {
      expect(frames.length).toBeGreaterThan(1);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
