import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { beamLine, splicePieces, type LineAdopted } from '../beam-line';
import { barArea, groupsArea } from '../bars';
import { makeFmt } from '../format';

const fmt = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const sec = (x: number, pos: number, neg: number, n = 0): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: n, nNeg: n });

/** Fixed-ended spans under w kN/m, each its own row; `n` the axial force with every moment, kN (+ compression). */
function rows(o: { spans?: number; L?: number; w?: number; n?: number; end?: BeamEnd } = {}) {
  const { spans = 1, L = 5, w = 40, n = 0, end = { kind: 'column', half: 0.2 } } = o;
  return Array.from({ length: spans }, (_, k) => {
    const env = Array.from({ length: 21 }, (_, i) => {
      const x = (i * L) / 20, m = (w * x * (L - x)) / 2 - (w * L * L) / 12;
      return { x, pos: Math.max(0, m), neg: Math.max(0, -m), v: Math.abs(w * (L / 2 - x)), nPos: n, nNeg: n, nV: n };
    });
    const d: BeamDemand = {
      key: `beam:1:${k}`, name: `V1-${k + 1}`, length: L, b: 0.25, h: 0.5,
      start: sec(0, 0, (w * L * L) / 12, n), span: sec(L / 2, (w * L * L) / 24, 0, n), end: sec(L, 0, (w * L * L) / 12, n),
      negAny: { value: (w * L * L) / 12 }, nNegAny: n, vu: { value: (w * L) / 2 }, nAtV: n, tu: { value: 0 }, combos: [], env,
      supportHalf: { start: end.half, end: end.half }, ends: { start: k === 0 ? end : { kind: 'column', half: 0.2 }, end: k === spans - 1 ? end : { kind: 'column', half: 0.2 } },
      line: { group: 1, index: k, spans, startNode: k, endNode: k + 1, lineName: 'V1' },
    };
    return beamRow(d, ctx, undefined, fmt);
  });
}

describe('a continuous beam line', () => {
  it('reads each station\'s capacity with the axial force that comes with its moment', () => {
    const plain = beamLine(rows(), ctx, undefined, fmt);
    const pulled = beamLine(rows({ n: -300 }), ctx, plain.adopted, fmt);
    const mid = (l: typeof plain) => l.envelope.find((e) => Math.abs(e.x - 2.5) < 1e-9)!;
    expect(mid(pulled).phiPos).toBeLessThan(mid(plain).phiPos - 10);
  });

  it('credits a hooked end only with what it develops between the hook and the support face', () => {
    const a: LineAdopted = { bottom: { count: 2, dia: 12 }, top: { count: 2, dia: 16 }, supportTop: [{ count: 2, dia: 16 }, { count: 2, dia: 16 }], spanBottom: [{ count: 0, dia: 12 }] };
    const narrow = beamLine(rows({ end: { kind: 'beam', half: 0.1 } }), ctx, a, fmt);
    const hooks = narrow.verifications.find((v) => v.label === 'rcSheets.v.lineHooks')!;
    expect(hooks.ok).toBe(false);
    expect(hooks.demand).toMatch(/ldh Ø16/);
    expect(narrow.verifications.find((v) => v.label === 'rcSheets.v.lineEnvelope')!.ok).toBe(false);
    const wide = beamLine(rows({ end: { kind: 'column', half: 0.3 } }), ctx, a, fmt);
    expect(wide.verifications.find((v) => v.label === 'rcSheets.v.lineHooks')!.ok).toBe(true);
  });

  it('keeps bars of different diameters at a section apart, with their own areas', () => {
    const r = rows({ spans: 2 });
    const a: LineAdopted = {
      bottom: { count: 2, dia: 16 }, top: { count: 2, dia: 12 },
      supportTop: [{ count: 2, dia: 16 }, { count: 3, dia: 12 }, { count: 2, dia: 16 }], spanBottom: [{ count: 0, dia: 16 }, { count: 0, dia: 16 }],
      bent: [{ count: 1, dia: 20 }, { count: 1, dia: 20 }],
    };
    const l = beamLine(r, ctx, a, fmt);
    const top = l.spanAdopted[0]!.at!.end!.top;
    expect(top.map((g) => g.dia).sort()).toEqual([12, 20]);
    expect(groupsArea(top)).toBeCloseTo(5 * barArea(12) + 2 * barArea(20), 9);
  });

  it('fails the line when the stirrups of a zone do not carry the shear there', () => {
    const plain = beamLine(rows({ w: 120 }), ctx, undefined, fmt);
    expect(plain.verifications.find((v) => v.label === 'rcSheets.v.lineShear')!.ok).toBe(true);
    const sparse = beamLine(rows({ w: 120 }), ctx, { ...plain.adopted, stirrups: [{ dia: 6, legs: 2, spacing: 0.3 }] }, fmt);
    const v = sparse.verifications.find((x) => x.label === 'rcSheets.v.lineShear')!;
    expect(v.ok).toBe(false);
    expect(v.ratio!).toBeGreaterThan(1);
    expect(sparse.status).toBe('fail');
  });

  it('laps a 15 m run of three 5 m spans so that every piece fits a 12 m bar', () => {
    const l = beamLine(rows({ spans: 3 }), ctx, undefined, fmt);
    const run = l.bars.find((b) => b.kind === 'continuous' && b.face === 'bottom')!;
    const laps = l.splices.filter((s) => s.mark === run.mark);
    expect(laps.length).toBeGreaterThan(0);
    const lap = laps[0]!.length, xs = [...new Set(laps.map((s) => s.x))];
    const stagger = laps.length > 1 ? Math.abs(laps[1]!.x - laps[0]!.x) / 2 : 0;
    const centres = laps.length > 1 ? [(laps[0]!.x + laps[1]!.x) / 2] : xs;
    expect(Math.max(...splicePieces(run.shape, lap, centres, stagger))).toBeLessThanOrEqual(12 + 1e-6);
    expect(l.verifications.find((v) => v.label === 'rcSheets.v.lineSplices')!.ok).toBe(true);
  });
});
