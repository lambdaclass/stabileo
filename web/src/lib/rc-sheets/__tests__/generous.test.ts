/** "Generous" by the governing utilisation: a member that verifies with every check under half its capacity, in every family and code. */
import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type SectionEnv } from '../beam-row';
import { columnRow, type ColumnDemand } from '../column-row';
import { lineRowStatus } from '../beam-line';
import { GENEROUS_BELOW, governingRatio, isGenerous, check } from '../types';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';

const f = makeFmt('.');
const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const beamCtx = { mat: { fc: 30, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const beam: BeamDemand = {
  key: 'beam:1:0', name: 'V1', length: 6, b: 0.3, h: 0.6,
  start: env(0, 0, 120), span: env(3, 140, 0), end: env(6, 0, 120),
  negAny: { value: 0 }, nNegAny: 0, vu: { value: 110 }, nAtV: 0, tu: { value: 0 }, combos: [],
};

describe('the generous rule', () => {
  it('reads the governing ratio of the checks, below 0.5 and only when every check holds', () => {
    expect(GENEROUS_BELOW).toBe(0.5);
    expect(governingRatio([check('a', true, { ratio: 0.3 }), check('b', true), check('c', true, { ratio: 0.45 })])).toBe(0.45);
    expect(isGenerous([check('a', true, { ratio: 0.3 }), check('c', true, { ratio: 0.45 })])).toBe(true);
    expect(isGenerous([check('a', true, { ratio: 0.3 }), check('c', true, { ratio: 0.5 })])).toBe(false);
    expect(isGenerous([check('a', true, { ratio: 0.3 }), check('b', false)])).toBe(false);
    expect(isGenerous([check('b', true)])).toBe(false);
  });

  it('a beam with a fifth more steel than it needs verifies, and one at a third of its capacity is generous', () => {
    const p = beamRow(beam, beamCtx, undefined, f);
    expect(p.status).toBe('ok');
    const more = beamRow(beam, beamCtx, { ...p.proposed, bottom: [{ count: Math.ceil(p.proposed.bottom[0]!.count * 1.3), dia: p.proposed.bottom[0]!.dia }] }, f);
    expect(more.verifications.every((v) => v.ok)).toBe(true);
    expect(governingRatio(more.verifications)).toBeGreaterThanOrEqual(0.5);
    expect(more.status).toBe('ok');
    expect(more.generous).toBe(false);
    const light: BeamDemand = { ...beam, start: env(0, 0, 25), span: env(3, 30, 0), end: env(6, 0, 25), vu: { value: 20 } };
    const heavy = beamRow(light, beamCtx, { ...p.proposed, bottom: [{ count: 4, dia: 20 }], top: [{ count: 4, dia: 20 }] }, f);
    expect(governingRatio(heavy.verifications)).toBeLessThan(0.5);
    expect(heavy.status).toBe('warn');
  });

  it('a column at its minimum steel is never generous, whatever its interaction ratio', () => {
    const col: ColumnDemand = { key: 'column:1:0', name: 'C1', b: 0.4, h: 0.4, length: 3, lu: 2.7, psiTop: 1, psiBot: 1, cases: [{ combo: 'U', pu: 300, mxTop: 10, mxBot: -5, myTop: 5, myBot: -2, vx: 5, vy: 5 }] };
    const r = columnRow(col, { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20] }, undefined, f);
    expect(r.checks.ratio).toBeLessThan(0.5);
    expect(r.status).toBe('ok');
  });

  it('holds the same under the other codes', () => {
    for (const code of ['aci318-19', 'en1992-1-1', 'ts500-2000'] as const) {
      const p = rulesFor(code).beamRow(beam, beamCtx, undefined, f);
      expect(p.status === 'warn', code).toBe(isGenerous(p.verifications));
    }
  });

  it('a beam line is generous only when the line and all its spans are', () => {
    const lineOk = { status: 'ok' as const, verifications: [check('l', true, { ratio: 0.3 })] };
    expect(lineRowStatus(lineOk, [{ status: 'ok', verifications: [check('s', true, { ratio: 0.4 })] }])).toBe('warn');
    expect(lineRowStatus(lineOk, [{ status: 'ok', verifications: [check('s', true, { ratio: 0.7 })] }])).toBe('ok');
    expect(lineRowStatus(lineOk, [{ status: 'fail', verifications: [check('s', false, { ratio: 1.2 })] }])).toBe('fail');
  });
});
