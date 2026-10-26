import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeColumnCapacity, computeColumnLayout, type BarInstance } from '../station-design-forces';
import { prepareSection } from '../codes/argentina/cirsoc201-section';
import { checkColumn, REBAR_DB } from '../codes/argentina/cirsoc201';

/*
 * Station moments reach the column check as magnitudes, so the uniaxial capacity is the weaker of
 * the two moment signs. 6, 10, 14… bars put the extra bar on the bottom face, and a user's faces
 * can differ (nTop ≠ nBottom): the capacity with that face compressed is the smaller one, and it
 * was never read — the check bent the section one way only (+y compressed).
 */
const area = (dia: number) => (REBAR_DB.find((r) => r.diameter === dia)?.area ?? Math.PI / 4 * (dia / 10) ** 2) * 1e-4;
const flip = (bars: BarInstance[], h: number) => bars.map((bar) => ({ ...bar, y: h - bar.y }));

/** φMn at Nu with the +y face (θ = π/2) or the −y face compressed, straight from the section engine. */
function bothSigns(b: number, h: number, fcMpa: number, fy: number, bars: BarInstance[], Nu: number, edition: '2005' | '2025') {
  const s = prepareSection({ kind: 'rect', b, h },
    bars.map((bar) => ({ x: bar.x - b / 2, y: bar.y - h / 2, area: area(bar.diameter) })), { fc: fcMpa, fy, edition });
  try {
    return [Math.PI / 2, -Math.PI / 2].map((theta) => {
      const p = s.atAxial(theta, Nu);
      return p ? Math.abs(p.phiMnx) : 0;
    });
  } finally { s.free(); }
}

describe('uniaxial column capacity, either sign of the moment', () => {
  it('30×30 with 6 Ø20 at Nu 100 kN: the face with the extra bar compressed governs, 78.6 kN·m', () => {
    const lay = computeColumnLayout(6, 20, 0.3, 0.3, 0.025, 8);
    const run = (bars: BarInstance[]) => computeColumnCapacity(lay.totalArea, 0.3, 0.3, 25, 420, 0.025, 8, 100, 100, bars, 'z', '2025');
    const [top, bottom] = bothSigns(0.3, 0.3, 25, 420, lay.bars, 100, '2025');
    expect(top).toBeCloseTo(101.57, 1); // what the check read: 'warn' at 0.984
    expect(bottom).toBeCloseTo(78.57, 1);
    const cap = run(lay.bars);
    expect(cap.phiMn).toBeCloseTo(78.57, 1);
    expect(cap.ratio).toBeCloseTo(0.786, 2);
    expect(cap.status).toBe('fail');
    expect(cap.momentSign).toBe(-1); // the bottom face, with three bars, in compression
    const flipped = run(flip(lay.bars, 0.3));
    expect(flipped.phiMn).toBeCloseTo(cap.phiMn, 2);
    expect(flipped.momentSign).toBe(1);
  });

  it('the designer no longer picks 6 Ø20 for 30×30 at Nu 100, Mu 100, and what it picks carries either sign', () => {
    const c = checkColumn({ fc: 25, fy: 420, cover: 0.025, b: 0.3, h: 0.3, stirrupDia: 8 }, 100, 100);
    expect(c.bars).toBe('12 Ø16'); // 6 Ø20 is the lighter arrangement, and it passed one way only
    expect(c.status).not.toBe('fail');
    const [count, dia] = c.bars.split(' Ø').map(Number);
    const lay = computeColumnLayout(count, dia, 0.3, 0.3, 0.025, 8);
    for (const phiMn of bothSigns(0.3, 0.3, 25, 420, lay.bars, 100, '2025')) expect(phiMn).toBeGreaterThanOrEqual(100);
  });

  it('for any layout the capacity holds for both signs, and flipping the bars changes nothing', () => {
    const column = fc.record({
      b: fc.double({ min: 0.2, max: 0.8, noNaN: true }), h: fc.double({ min: 0.2, max: 1.0, noNaN: true }),
      fc: fc.constantFrom(20, 25, 30, 40, 50), fy: fc.constantFrom(220, 420, 500),
      edition: fc.constantFrom('2005' as const, '2025' as const),
      dia: fc.constantFrom(12, 16, 20, 25), faceDia: fc.constantFrom(12, 16, 20, 25),
      // A designer count (6, 10, 14… are uneven) or a user's own faces.
      count: fc.constantFrom(4, 6, 8, 10, 12, 14, 16, 20, 24),
      faces: fc.option(fc.tuple(fc.nat(4), fc.nat(4), fc.nat(4), fc.nat(4)), { nil: undefined }),
      // Fraction of the way from the tension capacity to φPn,max.
      load: fc.double({ min: 0.02, max: 0.95, noNaN: true }),
    });
    fc.assert(fc.property(column, (c) => {
      const colReinf = c.faces && { cornerDia: c.dia, faceDia: c.faceDia,
        nBottom: c.faces[0], nTop: c.faces[1], nLeft: c.faces[2], nRight: c.faces[3] };
      const lay = computeColumnLayout(c.count, c.dia, c.b, c.h, 0.025, 8, colReinf);
      const Ast = lay.bars.reduce((t, bar) => t + area(bar.diameter), 0);
      const phiPnMax = 0.8 * 0.65 * (0.85 * c.fc * (c.b * c.h - Ast) + c.fy * Ast) * 1e3;
      const phiPt = -0.9 * c.fy * Ast * 1e3;
      const Nu = phiPt + c.load * (phiPnMax - phiPt);
      const run = (bars: BarInstance[]) => computeColumnCapacity(lay.totalArea, c.b, c.h, c.fc, c.fy, 0.025, 8, Nu, 1, bars, 'z', c.edition);
      const cap = run(lay.bars), flipped = run(flip(lay.bars, c.h));
      const weaker = Math.min(...bothSigns(c.b, c.h, c.fc, c.fy, lay.bars, Nu, c.edition));
      expect(cap.phiMn).toBeLessThanOrEqual(weaker * (1 + 1e-6) + 0.005); // φMn is rounded to 0.01
      expect(Math.abs(cap.phiMn - flipped.phiMn)).toBeLessThanOrEqual(0.01 + 1e-6 * cap.phiMn);
    }), { numRuns: 300 });
  });
});
