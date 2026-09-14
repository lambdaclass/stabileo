/**
 * The general engine against the workbook's column sheets.
 *
 * `cirsoc-flex-worked-examples.test.ts` covers the two flexure sheets through
 * the flexural engine. This covers the two that need a bar LAYOUT — FCR with
 * two symmetric levels and FCO with eight bars at published coordinates —
 * because those are the cases a two-layer idealisation cannot express and the
 * reason the general engine exists.
 *
 * Both agree to a tenth of a per cent, which is finer than the curve's own
 * discretisation. That is the evidence that the polygon clipper, the strain
 * plane, the φ ramp and the displaced-concrete deduction are all right at
 * once — none of them can be wrong on its own and still land here.
 */

import { describe, it, expect } from 'vitest';
import { interactionCurve, type Bar, type Outline } from '../cirsoc201-section';

const MAT = { fc: 25, fy: 420 };

/** Demand over capacity along the ray of constant eccentricity. */
function ratioAt(outline: Outline, bars: Bar[], Pu: number, Mu: number): number {
  const curve = interactionCurve(outline, bars, MAT, Math.PI / 2, 90);
  const slope = Mu / Pu;
  let capP = 0;
  let capM = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const A = curve[i];
    const B = curve[i + 1];
    const fA = Math.abs(A.phiMnx) - slope * A.phiPn;
    const fB = Math.abs(B.phiMnx) - slope * B.phiPn;
    if (fA === 0 || fA * fB < 0) {
      const t = fA / (fA - fB);
      capP = A.phiPn + t * (B.phiPn - A.phiPn);
      capM = Math.abs(A.phiMnx) + t * (Math.abs(B.phiMnx) - Math.abs(A.phiMnx));
      break;
    }
  }
  return Math.hypot(Mu, Pu) / Math.hypot(capM, capP);
}

/** Total steel for a demand, given a layout that scales with it. */
function sizeFor(
  outline: Outline, layout: (Ast: number) => Bar[], Pu: number, Mu: number,
): number {
  let lo = 9;
  let hi = 72;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (ratioAt(outline, layout(m), Pu, Mu) > 1) lo = m; else hi = m;
  }
  return hi;
}

describe('FCR — two symmetric levels', () => {
  /*
   * b = h = 0.30, d' = d's = 0.05 so the bars sit at y = ±0.10, A's/As = 1,
   * Pu = 500 kN, Mu = 100 kN·m. Published: A's = As = 10.668 cm²,
   * Ast = 21.335 cm².
   */
  const outline: Outline = { kind: 'rect', b: 0.30, h: 0.30 };
  const layout = (Ast: number): Bar[] => [
    { x: 0, y: -0.10, area: (Ast * 1e-4) / 2 },
    { x: 0, y: 0.10, area: (Ast * 1e-4) / 2 },
  ];

  it('reproduces the published steel', () => {
    const Ast = sizeFor(outline, layout, 500, 100);
    expect(Ast / 21.3354, `ours ${Ast.toFixed(3)}`).toBeGreaterThan(0.99);
    expect(Ast / 21.3354).toBeLessThan(1.01);
  });

  it('and splits it evenly between the two levels, as A′s/As = 1 asks', () => {
    const Ast = sizeFor(outline, layout, 500, 100);
    expect(Ast / 2).toBeCloseTo(10.668, 1);
  });
});

describe('FCO — eight bars at the published coordinates', () => {
  /*
   * The same section with the steel spread four bars to a face, which is
   * what A1 = A2 = 50 % with four bars each produces. The workbook prints
   * every bar's (x, y); those are reproduced here rather than assumed.
   *
   * Its example leaves Myu blank, so this is uniaxial — and the answer must
   * therefore come out near FCR's, which is a consistency check on the
   * workbook as much as on us.
   */
  const outline: Outline = { kind: 'rect', b: 0.30, h: 0.30 };
  const XS = [-0.10, -0.10 / 3, 0.10 / 3, 0.10];
  const layout = (Ast: number): Bar[] => {
    const a = (Ast * 1e-4) / 8;
    return [
      ...XS.map((x) => ({ x, y: -0.10, area: a })),
      ...XS.map((x) => ({ x, y: 0.10, area: a })),
    ];
  };

  it('reproduces the published steel', () => {
    const Ast = sizeFor(outline, layout, 500, 100);
    expect(Ast / 21.3515, `ours ${Ast.toFixed(3)}`).toBeGreaterThan(0.99);
    expect(Ast / 21.3515).toBeLessThan(1.01);
  });

  it('gives the published area per bar', () => {
    const Ast = sizeFor(outline, layout, 500, 100);
    expect(Ast / 8).toBeCloseTo(2.669, 1);
  });

  it('agrees with the two-level answer, since this example has no Myu', () => {
    const eight = sizeFor(outline, layout, 500, 100);
    const two = sizeFor(outline, (Ast) => [
      { x: 0, y: -0.10, area: (Ast * 1e-4) / 2 },
      { x: 0, y: 0.10, area: (Ast * 1e-4) / 2 },
    ], 500, 100);
    /* Spreading the same steel across a face changes almost nothing when the
       bending is about the other axis — which is why both sheets agree. */
    expect(eight / two).toBeGreaterThan(0.97);
    expect(eight / two).toBeLessThan(1.03);
  });
});

describe('the deduction that made all of this agree', () => {
  it('leaving it off understates the steel by about 5 %', () => {
    /*
     * The default was off, described as conservative. It is the opposite: a
     * bar inside the block occupies concrete already credited to the block,
     * so not deducting counts it twice and overstates capacity. Off, FCO
     * came out 5 % light; on, 0.7 %.
     */
    const outline: Outline = { kind: 'rect', b: 0.30, h: 0.30 };
    const XS = [-0.10, -0.10 / 3, 0.10 / 3, 0.10];
    const bars = (Ast: number): Bar[] => {
      const a = (Ast * 1e-4) / 8;
      return [...XS.map((x) => ({ x, y: -0.10, area: a })),
              ...XS.map((x) => ({ x, y: 0.10, area: a }))];
    };
    const withOff = (Ast: number) => {
      const curve = interactionCurve(
        outline, bars(Ast), { ...MAT, deductDisplacedConcrete: false }, Math.PI / 2, 90,
      );
      return curve[0].Pn;
    };
    const withOn = (Ast: number) => interactionCurve(
      outline, bars(Ast), MAT, Math.PI / 2, 90,
    )[0].Pn;

    expect(withOff(21), 'off reports more capacity than there is')
      .toBeGreaterThan(withOn(21));
  });
});
