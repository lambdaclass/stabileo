import { describe, it, expect } from 'vitest';
import { smartQuotes } from '../typography';

describe('smartQuotes', () => {
  it('opens after a space or at the start, closes otherwise', () => {
    expect(smartQuotes('lo que llamamos "mostrar el desarrollo", y')).toBe('lo que llamamos “mostrar el desarrollo”, y');
    expect(smartQuotes('"Hola" dijo')).toBe('“Hola” dijo');
    expect(smartQuotes('(say "yes")')).toBe('(say “yes”)');
  });
  it('turns an apostrophe in a word into ’ and leaves curly text alone', () => {
    expect(smartQuotes("the engine's result, don't")).toBe('the engine’s result, don’t');
    expect(smartQuotes('ya “curvas” y Stabileo’s')).toBe('ya “curvas” y Stabileo’s');
  });
  it('touches nothing else: numbers, units and symbols stay', () => {
    const s = 'ΣM = 0, 6×6, φMn = 73,3 kN·m — εt = 1,51‰';
    expect(smartQuotes(s)).toBe(s);
  });
});
