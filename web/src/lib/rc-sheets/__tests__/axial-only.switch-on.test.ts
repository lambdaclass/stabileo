import { describe, it, expect } from 'vitest';
import { axialOnlyChecks, type FlexureCheck } from '../beam-row';
import { makeFmt } from '../format';

const f = makeFmt('.');
const at = (sign: 'pos' | 'neg', nc: number, ok: boolean): FlexureCheck => ({ section: 'span', sign, phiMn: 0, mu: 0, nc, epsT: 0, epsTMin: 0, d: 0.5, ok, ductile: true });

describe('a section with axial force and no moment', () => {
  it('keeps the failing check where the same section has a passing one before it', () => {
    const lines = axialOnlyChecks([at('pos', 100, true), at('neg', -900, false)], '§22.4', f);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.ok).toBe(false);
    expect(lines[0]!.demand).toContain('-900');
  });
});
