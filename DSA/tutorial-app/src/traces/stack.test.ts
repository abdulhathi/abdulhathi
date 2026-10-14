import { describe, expect, it } from 'vitest';
import { decode, evalPostfix, validBrackets } from './stack';

describe('stack traces', () => {
  it('checks bracket matching', () => {
    expect(validBrackets('{[()()]}').valid).toBe(true);
    expect(validBrackets('([)]').valid).toBe(false);
    expect(validBrackets('((').valid).toBe(false);
    expect(validBrackets(')').valid).toBe(false);
  });

  it('evaluates postfix with truncating division', () => {
    expect(evalPostfix(['5', '1', '2', '+', '4', '*', '+', '3', '-']).value).toBe(14);
    expect(evalPostfix(['7', '-2', '/']).value).toBe(-3);
  });

  it('decodes nested repeats', () => {
    expect(decode('2[a3[b]]c').result).toBe('abbbabbbc');
    expect(decode('10[x]').result).toBe('x'.repeat(10));
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [validBrackets('{[()()]}'), evalPostfix(['3', '4', '+']), decode('2[a3[b]]c')]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
