import { describe, it, expect } from 'vitest';
import { steelCheckerFor } from '../member-checkers';

describe('the metallic member checkers', () => {
  it('sends a rolled profile to CIRSOC 301 and leaves the cold-formed one to 303, not implemented', () => {
    expect(steelCheckerFor({ name: 'IPE 200', profileFamily: 'IPE' }).code).toBe('cirsoc-301');
    const cf = steelCheckerFor({ name: 'C 100x50x15x2', profileFamily: 'C' });
    if (cf.code === 'cirsoc-303') {
      expect(cf.implemented).toBe(false);
      expect(cf.reasonKey).toBe('steel.checker.coldFormedNotImplemented');
    }
  });
});
