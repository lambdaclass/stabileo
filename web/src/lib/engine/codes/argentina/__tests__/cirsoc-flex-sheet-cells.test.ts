/**
 * Cells the panel prints that no earlier test pinned to the workbook.
 *
 * Each of these was found by reading the sheet beside the panel and seeing a
 * different number: εt on the T beam, As mín and Pu (max) on the biaxial
 * sheets, and the biaxial verification's φMn / Mu, which measured a different
 * quantity from the sheet's and agreed only at the shipped example. The
 * published values are the sheet's cached cells, read with xlrd.
 */
import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput } from '../cirsoc-flex';
import { diagramSeries, type DiagramPoint } from '../cirsoc-flex-diagram';
import { twoLevels } from '../cirsoc201-layouts';
import type { Bar, Materials, Outline } from '../cirsoc201-section';
import workbook from './fcr-verif-diagram.json';

const BASE: FlexInput = {
  kase: 'FCR', mode: 'design',
  fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true,
  b: 0.30, h: 0.30, dPrime: 0.05, dPrimeS: 0.05, dPrimeH: 0.05, dPrimeV: 0.05,
  holeB: 0, holeH: 0,
  bf: 1.37, hf: 0.10, bw: 0.12,
  D: 0.40, Dint: 0, barCount: 12, barAtExtremeFibre: true,
  ratioAsPrime: 1,
  pctA1: 50, pctA2: 50, pctA3: 0, nA1: 4, nA2: 4, nA3: 4,
  AstGiven: 20, levels: [],
  Pu: 500, Mu: 100, Muy: 0,
};

const rel = (ours: number, published: number) => Math.abs(ours / published - 1);

describe('FST — the state at the answer', () => {
  const r = solveFlex({ ...BASE, kase: 'FST', h: 0.40, dPrime: 0.032, dPrimeS: 0.032, Pu: 0, Mu: 52 });

  it('εt is the sheet’s 0,169718, not an interpolation of a hyperbola', () => {
    /*
     * Was 0,17197 — 1,3 % high — from interpolating εt linearly in c. Solved
     * for, it agrees with the cell to 1e-12: the method was the sheet's all
     * along and only the reading of it was not.
     */
    expect(rel(r.epsilonT!, 0.16971761611818456)).toBeLessThan(1e-9);
  });
  it('c and cmax', () => {
    expect(rel(r.c!, 0.006391936299332501)).toBeLessThan(1e-9);
    expect(rel(r.cMax!, 0.138)).toBeLessThan(1e-9);
  });
});

describe('FSR — the state at the answer', () => {
  const r = solveFlex({ ...BASE, kase: 'FSR', b: 0.12, h: 0.40, dPrime: 0.034, dPrimeS: 0.034, Pu: 0, Mu: 52 });
  it('a, c and εt, to the cell', () => {
    expect(rel(r.a!, 0.06827513395658998)).toBeLessThan(1e-9);
    expect(rel(r.c!, 0.08032368700775291)).toBeLessThan(1e-9);
    expect(rel(r.epsilonT!, 0.010669691231853188)).toBeLessThan(1e-9);
  });
});

describe('FCO — the rows of 4.2', () => {
  it('As mín is 2,50 cm² whatever the rectangular cases left in d′s', () => {
    /* The panel shares one d′s field between cases; FSR leaves 3,4 in it. */
    const r = solveFlex({ ...BASE, kase: 'FCO', dPrimeS: 0.034 });
    expect(rel(r.AsMinCm2!, 2.4999999999999996)).toBeLessThan(1e-9);
  });

  it('Pu (max) when sizing is the 8 % ceiling: 2 487,42 kN', () => {
    const r = solveFlex({ ...BASE, kase: 'FCO' });
    expect(rel(r.puMax!, 2487.42)).toBeLessThan(1e-5);
  });

  it('Pu (max) when checking is for the steel given: 1 437,23 kN', () => {
    const r = solveFlex({ ...BASE, kase: 'FCO', mode: 'verify', AstGiven: 21.352 });
    expect(rel(r.puMax!, 1437.23372)).toBeLessThan(1e-4);
  });
});

describe('FCO-VERIF — φMn / Mu at the fixed axial load', () => {
  const verify = (Mu: number, Muy: number, Pu = 500) =>
    solveFlex({ ...BASE, kase: 'FCO', mode: 'verify', AstGiven: 21.352, Pu, Mu, Muy });

  it('the sheet’s own example: 1,00035', () => {
    const r = verify(100, 0);
    /* 1,00044 against 1,00035. */
    expect(rel(1 / r.ratio, 1.0003512045440135)).toBeLessThan(2e-4);
    expect(r.phiPn).toBe(500);
  });

  it('half the moment is twice the reserve — the axial load stays put', () => {
    /*
     * Along the (M, P) ray the section would be credited with more axial load
     * as well, and the reserve would come out different. The sheet holds Pu.
     */
    const r = verify(50, 0);
    expect(r.phiMn! / 50).toBeCloseTo(2.0007, 2);
    expect(r.phiPn).toBe(500);
  });

  it('a skew demand is judged on the same ray it points along', () => {
    const r = verify(55.40, 44.21);
    expect(Math.abs(r.ratio - 1)).toBeLessThan(0.0035);
  });
});

describe('the diagram, both curves, both edges', () => {
  const OUT: Outline = { kind: 'rect', b: workbook.section.b, h: workbook.section.h };
  const MAT: Materials = { fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true };
  const BARS: Bar[] = workbook.section.bars.map((b) => ({ x: b.x, y: b.y, area: b.areaCm2 * 1e-4 }));
  const s = diagramSeries(OUT, BARS, MAT, 600);

  const gapTo = (poly: DiagramPoint[], q: DiagramPoint) => {
    let best = Infinity;
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1];
      const b = poly[i];
      const dm = b.m - a.m;
      const dn = b.n - a.n;
      const len2 = dm * dm + dn * dn;
      const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((q.m - a.m) * dm + (q.n - a.n) * dn) / len2));
      best = Math.min(best, Math.hypot(q.m - (a.m + t * dm), q.n - (a.n + t * dn)));
    }
    return best;
  };
  const scale = Math.hypot(250, 2600);

  it('the uncapped curve reaches φ·Po = 1 796,13 kN, as the sheet’s does', () => {
    expect(Math.max(...s.uncapped.map((p) => p.n))).toBeCloseTo(1796.13, 0);
    expect(Math.max(...s.capped.map((p) => p.n))).toBeCloseTo(1436.90, 0);
  });

  it('follows the sheet’s "sin limitación" series at all 80 points', () => {
    const theirs = (workbook.uncapped as Array<[number, number]>).map(([m, n]) => ({ m, n }));
    /* Compared with the edge each point belongs to: both signs are present. */
    const worst = Math.max(...theirs.map((q) =>
      Math.min(gapTo(s.uncapped, q), gapTo(s.uncapped, { m: -q.m, n: q.n }))));
    /* Measured 0,006 % of the diagram's size. */
    expect(worst / scale).toBeLessThan(1e-4);
  });

  it('computes each edge rather than mirroring one', () => {
    /* A′s/As = 0,5: three times the steel at the bottom as at the top. */
    const bars = twoLevels(0.30, 0.05, 0.05, 20, 0.5);
    const d = diagramSeries(OUT, bars, MAT, 200);
    const pos = Math.max(...d.capped.map((p) => p.m));
    const neg = -Math.min(...d.capped.map((p) => p.m));
    expect(Math.abs(pos - neg) / pos).toBeGreaterThan(0.05);
  });
});

describe('FCR-VERIF — "4.- Resultados" is the levels, summed', () => {
  it('Ast 21,336 and ρ 0,0237 from two levels of 10,668, whatever the Ast box says', () => {
    const r = solveFlex({
      ...BASE, mode: 'verify', AstGiven: 20,
      levels: [
        { distanceFromBottom: 0.05, areaCm2: 10.668 },
        { distanceFromBottom: 0.25, areaCm2: 10.668 },
      ],
    });
    expect(r.AstCm2).toBeCloseTo(21.336, 9);
    expect(rel(r.rho, 0.023706666666666667)).toBeLessThan(1e-9);
    /* And the sheet's own MV res / MV sol: 509,9106 / 509,902. */
    expect(rel(1 / r.ratio, 509.9106 / 509.902)).toBeLessThan(2e-5);
  });
});
