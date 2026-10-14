import { describe, expect, it } from 'vitest';
import { flipGrundy, predictTheWinner, squareGame } from './game-theory';

describe('game theory traces', () => {
  it('labels winning and losing positions for the square game', () => {
    const { win } = squareGame(12);
    expect(win[1]).toBe(true);
    expect(win[2]).toBe(false);
    expect(win[4]).toBe(true);
    expect(win[5]).toBe(false);
    expect(win[7]).toBe(false);
  });

  it('runs minimax on score differences', () => {
    expect(predictTheWinner([1, 5, 2]).diff).toBe(-2);
    expect(predictTheWinner([1, 5, 233, 7]).diff).toBe(222);
    expect(predictTheWinner([4, 10, 50, 6]).diff).toBe(38);
  });

  it('computes Flip Game Grundy numbers', () => {
    expect(flipGrundy(8).g).toEqual([0, 0, 1, 1, 2, 0, 3, 1, 1]);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [squareGame(12), predictTheWinner([1, 5, 233, 7]), flipGrundy(8)]) {
      expect(frames.length).toBeGreaterThan(3);
      expect(frames.length).toBeLessThanOrEqual(20);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
