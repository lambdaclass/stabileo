import { describe, it, expect } from 'vitest';
import { columnRow, type ColumnCase, type ColumnDemand } from '../column-row';
import { makeFmt } from '../format';

const f = makeFmt('.');
const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25] };
const cases: ColumnCase[] = [
  { combo: 'U1', pu: 184, puMin: 92, puD: 184, mxTop: 1.4, mxBot: -5.3, myTop: 0.25, myBot: -4, vx: 11.6, vy: 8.2 },
];
const upper: ColumnDemand = {
  key: 'column:5:3', name: 'C1', level: 'N3', b: 0.35, h: 0.35, length: 3, lu: 2.2, psiTop: 0.2, psiBot: 0.2,
  cases, joints: { bottom: 0.8, top: 0.8 },
};

describe('§10.7.4.1: a column face offset 75 mm or more takes separate dowels', () => {
  const offset = (o: number) => columnRow(upper, ctx, undefined, f, { pattern: { nx: 3, ny: 4, maxDia: 12 }, fromBelow: true, offset: o })
    .verifications.find((v) => v.label === 'rcSheets.v.colOffset');
  it('at exactly 7.5 cm, and above it', () => {
    expect(offset(0.075)?.capacity).toBe('≥ 7.5 cm');
    expect(offset(0.1)).toBeDefined();
  });
  it('not below it', () => {
    expect(offset(0.07)).toBeUndefined();
  });
});
