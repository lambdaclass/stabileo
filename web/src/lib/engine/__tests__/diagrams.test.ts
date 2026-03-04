/**
 * Diagram Tests — M(x), V(x), N(x) verified against analytical solutions
 *
 * These diagrams are the primary output the user sees. Errors here
 * directly mislead students about structural behavior.
 *
 * SIGN CONVENTION (module internal):
 *   M(x) = mStart - vStart·x - qI·x²/2 - (qJ-qI)·x³/(6L)
 *   → Sagging (beam bends concave up) produces NEGATIVE values
 *   → Hogging (beam bends concave down) produces POSITIVE values
 *
 * References:
 *   - Hibbeler, Structural Analysis, Ch. 4-6
 *   - Kassimali, Structural Analysis, Ch. 5
 */

import { describe, it, expect } from 'vitest';
import {
  computeMomentDiagram,
  computeShearDiagram,
  computeAxialDiagram,
  computeDiagramValueAt,
  computeDeformedShape,
} from '../diagrams';

// ─── Helpers ──────────────────────────────────────────────────

/** Find diagram value closest to normalized position t */
function valueAt(diagram: { points: Array<{ t: number; value: number }> }, t: number): number {
  let best = diagram.points[0];
  for (const p of diagram.points) {
    if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  }
  return best.value;
}

/** Horizontal element from (0,0) to (L,0) */
const horiz = (L: number) => ({ ix: 0, iy: 0, jx: L, jy: 0 });

// ─── Simply-Supported Beam with Uniform Load ──────────────────
// q = -10 kN/m (downward in solver convention)
// Reactions: R = wL/2 upward
// In module convention, sagging moment is NEGATIVE.
// |M_max| = wL²/8 at midspan

describe('Diagrams: Simply-Supported Beam, uniform load', () => {
  const L = 6;
  const q = -10; // kN/m (downward)
  const w = -q;  // 10 (positive for formulas)
  const vStart = w * L / 2; // +30 kN (upward reaction at I)
  const mStart = 0;
  const mEnd = 0;
  const h = horiz(L);

  it('moment diagram: zero at supports, −wL²/8 at midspan (sagging negative)', () => {
    const diag = computeMomentDiagram(mStart, mEnd, vStart, q, q, L, h.ix, h.iy, h.jx, h.jy);

    // M at supports ≈ 0
    expect(valueAt(diag, 0)).toBeCloseTo(0, 1);
    expect(valueAt(diag, 1)).toBeCloseTo(0, 1);

    // M at midspan = −wL²/8 (sagging is negative in this convention)
    const Mmid = -(w * L * L / 8); // −45 kN·m
    expect(valueAt(diag, 0.5)).toBeCloseTo(Mmid, 0);

    // maxAbsValue captures the peak magnitude
    expect(Math.abs(diag.maxAbsValue)).toBeCloseTo(w * L * L / 8, 0);
  });

  it('shear diagram: +wL/2 at left, −wL/2 at right, zero at midspan', () => {
    const diag = computeShearDiagram(vStart, q, q, L, h.ix, h.iy, h.jx, h.jy);

    expect(valueAt(diag, 0)).toBeCloseTo(vStart, 1);
    expect(valueAt(diag, 0.5)).toBeCloseTo(0, 1);
    expect(valueAt(diag, 1)).toBeCloseTo(-vStart, 1);
  });

  it('computeDiagramValueAt matches moment diagram', () => {
    const ef = { mStart, mEnd, vStart, vEnd: -vStart, nStart: 0, nEnd: 0, qI: q, qJ: q, length: L };
    const Mmid = -(w * L * L / 8);
    expect(computeDiagramValueAt('moment', 0, ef)).toBeCloseTo(0, 4);
    expect(computeDiagramValueAt('moment', 0.5, ef)).toBeCloseTo(Mmid, 1);
    expect(computeDiagramValueAt('moment', 1, ef)).toBeCloseTo(0, 1);
  });

  it('computeDiagramValueAt matches shear diagram', () => {
    const ef = { mStart, mEnd, vStart, vEnd: -vStart, nStart: 0, nEnd: 0, qI: q, qJ: q, length: L };
    expect(computeDiagramValueAt('shear', 0, ef)).toBeCloseTo(vStart, 4);
    expect(computeDiagramValueAt('shear', 0.5, ef)).toBeCloseTo(0, 1);
    expect(computeDiagramValueAt('shear', 1, ef)).toBeCloseTo(-vStart, 1);
  });
});

// ─── Cantilever with Point Load at Tip ────────────────────────
// P = −20 kN at node J (free end), fixed at node I
// vStart = +20 (reaction upward), mStart = P·L = −100 (hogging)
// M(x) = mStart − vStart·x = −100 − 20x → at tip (x=L): −100 − 100 = −200?
// Wait — let's derive correctly:
// Fixed-end with point load at tip: reaction V=+P(up)=+20, M_fix = +PL = +100 (hogging)
// Actually in solver convention:
//   vStart = reaction shear (upward) = +20 kN
//   mStart = fixed-end moment = +P*L in hogging → let's just verify numerically.

describe('Diagrams: Cantilever, point load at tip', () => {
  const L = 5;
  const P = -20; // kN downward at tip
  // Fixed end: V_reaction = −P = +20, M_fixed = P·L = −100 (or check solver)
  // Actually the solver delivers end forces in element convention.
  // For cantilever with P at tip:
  //   vStart (shear at fixed end) = −P = +20
  //   mStart (moment at fixed end) = P·L = −20·5 = −100 (negative → sagging/tension on bottom)
  // Wait, for a cantilever with downward tip load:
  //   - The beam bends concave-up at the root → hogging at root
  //   - Conventional moment at root is NEGATIVE (for downward P)
  // But in the module: mStart = P*L = −100 (from solver output)
  // M(x) = −100 − 20·x
  // At x=0: −100 (hogging, but negative in this convention means...)
  // Hmm, let me just use the actual formula: M(x) = mStart − vStart·x
  // = −100 − 20x
  // At x=0: −100
  // At x=5: −100 − 100 = −200
  // That doesn't match physics (should be 0 at free end!)
  //
  // The issue is the sign of mStart. For a cantilever with P=−20 at tip:
  // Equilibrium: vStart = +20, mStart = +100 (positive hogging in module convention)
  // Then M(x) = 100 − 20x → M(0)=100, M(5)=0 ✓
  const vStart = -P; // +20
  const mStart = -P * L; // +100 (hogging at root)
  const mEnd = 0;
  const h = horiz(L);

  it('moment: +PL at support (hogging), 0 at tip', () => {
    const diag = computeMomentDiagram(mStart, mEnd, vStart, 0, 0, L, h.ix, h.iy, h.jx, h.jy);

    expect(valueAt(diag, 0)).toBeCloseTo(mStart, 1); // +100
    expect(valueAt(diag, 1)).toBeCloseTo(0, 1);
    expect(valueAt(diag, 0.5)).toBeCloseTo(mStart / 2, 1); // +50
  });

  it('shear: constant = +20', () => {
    const diag = computeShearDiagram(vStart, 0, 0, L, h.ix, h.iy, h.jx, h.jy);

    expect(valueAt(diag, 0)).toBeCloseTo(vStart, 1);
    expect(valueAt(diag, 0.5)).toBeCloseTo(vStart, 1);
    expect(valueAt(diag, 1)).toBeCloseTo(vStart, 1);
  });
});

// ─── Trapezoidal Distributed Load ─────────────────────────────

describe('Diagrams: Trapezoidal load on SS beam', () => {
  const L = 8;
  const qI = -10, qJ = -20; // kN/m (downward)
  const wI = -qI, wJ = -qJ; // 10, 20
  const W = (wI + wJ) * L / 2; // 120 kN
  const xbar = L * (2 * wJ + wI) / (3 * (wI + wJ));
  const RB = W * xbar / L;
  const RA = W - RB;

  const vStart = RA;
  const mStart = 0;
  const mEnd = 0;
  const h = horiz(L);

  it('shear starts at RA and ends near −RB', () => {
    const diag = computeShearDiagram(vStart, qI, qJ, L, h.ix, h.iy, h.jx, h.jy);

    expect(valueAt(diag, 0)).toBeCloseTo(RA, 1);
    expect(valueAt(diag, 1)).toBeCloseTo(-RB, 1);
  });

  it('moment is zero at supports', () => {
    const diag = computeMomentDiagram(mStart, mEnd, vStart, qI, qJ, L, h.ix, h.iy, h.jx, h.jy);

    expect(valueAt(diag, 0)).toBeCloseTo(0, 1);
    expect(valueAt(diag, 1)).toBeCloseTo(0, 0);
  });

  it('moment is negative in the span (sagging in module convention)', () => {
    const diag = computeMomentDiagram(mStart, mEnd, vStart, qI, qJ, L, h.ix, h.iy, h.jx, h.jy);

    // Sagging = negative in module convention
    expect(valueAt(diag, 0.5)).toBeLessThan(0);
  });
});

// ─── Point Load on Element ────────────────────────────────────
// SS beam L=10, P=−50 kN at a=4m
// Module convention: sagging moment is negative

describe('Diagrams: Point load on SS beam element', () => {
  const L = 10;
  const P = -50; // kN (downward)
  const a = 4;
  const b = L - a;
  const h = horiz(L);

  const vStart = (-P) * b / L; // 30 kN
  const mStart = 0;
  const mEnd = 0;
  const pointLoads = [{ a, p: P }];

  it('shear: jump at point load location', () => {
    const diag = computeShearDiagram(vStart, 0, 0, L, h.ix, h.iy, h.jx, h.jy, pointLoads);

    const vBefore = valueAt(diag, (a - 0.1) / L);
    expect(vBefore).toBeCloseTo(vStart, 0);

    const vAfter = valueAt(diag, (a + 0.1) / L);
    expect(vAfter).toBeCloseTo(vStart + P, 0); // 30 + (−50) = −20
  });

  it('moment: peak magnitude at load position = |Pab/L|', () => {
    const diag = computeMomentDiagram(mStart, mEnd, vStart, 0, 0, L, h.ix, h.iy, h.jx, h.jy, pointLoads);

    const Mexpected = -((-P) * a * b / L); // −120 (sagging → negative)
    const mAtLoad = valueAt(diag, a / L);
    expect(mAtLoad).toBeCloseTo(Mexpected, 0);
  });

  it('computeDiagramValueAt: moment at load position', () => {
    const ef = { mStart, mEnd, vStart, vEnd: 0, nStart: 0, nEnd: 0, qI: 0, qJ: 0, length: L, pointLoads };
    const Mexpected = -((-P) * a * b / L); // −120
    expect(computeDiagramValueAt('moment', a / L, ef)).toBeCloseTo(Mexpected, 1);
  });
});

// ─── Axial Force Diagram ──────────────────────────────────────

describe('Diagrams: Axial force', () => {
  it('constant axial (truss bar)', () => {
    const N = 100;
    const diag = computeAxialDiagram(N, N, 5, 0, 0, 5, 0);

    expect(valueAt(diag, 0)).toBeCloseTo(N, 4);
    expect(valueAt(diag, 0.5)).toBeCloseTo(N, 4);
    expect(valueAt(diag, 1)).toBeCloseTo(N, 4);
    expect(diag.maxAbsValue).toBeCloseTo(N, 4);
  });

  it('linearly varying axial', () => {
    const diag = computeAxialDiagram(100, -50, 10, 0, 0, 10, 0);

    expect(valueAt(diag, 0)).toBeCloseTo(100, 2);
    expect(valueAt(diag, 1)).toBeCloseTo(-50, 2);
    expect(valueAt(diag, 0.5)).toBeCloseTo(25, 2);
  });

  it('computeDiagramValueAt for axial', () => {
    const ef = { mStart: 0, mEnd: 0, vStart: 0, vEnd: 0, nStart: 80, nEnd: 80, qI: 0, qJ: 0, length: 5 };
    expect(computeDiagramValueAt('axial', 0, ef)).toBeCloseTo(80, 4);
    expect(computeDiagramValueAt('axial', 1, ef)).toBeCloseTo(80, 4);
  });
});

// ─── Fixed-Fixed Beam ─────────────────────────────────────────
// q = −10, w = 10
// In module convention: mStart = +wL²/12 (hogging at support = positive)
// M(L/2) = mStart − vStart·(L/2) − q·(L/2)²/2
//         = wL²/12 − wL²/4 + wL²/8
//         = wL²(1/12 − 1/4 + 1/8) = wL²(2/24 − 6/24 + 3/24) = −wL²/24

describe('Diagrams: Fixed-fixed beam, uniform load', () => {
  const L = 6;
  const q = -10;
  const w = -q;
  const vStart = w * L / 2; // +30
  const mStart = w * L * L / 12; // +30 (hogging = positive)
  const mEnd = w * L * L / 12; // +30 (hogging at far end = positive)
  const h = horiz(L);

  it('moment at supports and midspan', () => {
    const diag = computeMomentDiagram(mStart, mEnd, vStart, q, q, L, h.ix, h.iy, h.jx, h.jy);

    expect(valueAt(diag, 0)).toBeCloseTo(mStart, 1); // +30
    // Midspan: −wL²/24 = −15
    expect(valueAt(diag, 0.5)).toBeCloseTo(-(w * L * L / 24), 0);
    // End: mEnd = −30
    expect(valueAt(diag, 1)).toBeCloseTo(mEnd, 0);
  });
});

// ─── Deformed Shape ───────────────────────────────────────────

describe('Diagrams: Deformed shape (Hermite)', () => {
  it('no deformation → all points on original line', () => {
    const pts = computeDeformedShape(0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 100, 10);

    for (const p of pts) {
      expect(p.y).toBeCloseTo(0, 6);
      expect(p.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.x).toBeLessThanOrEqual(10.01);
    }
  });

  it('endpoints match node displacements', () => {
    const scale = 50;
    const uIx = 0.001, uIy = -0.002;
    const uJx = 0.002, uJy = -0.005;
    const pts = computeDeformedShape(0, 0, 8, 0, uIx, uIy, 0, uJx, uJy, 0, scale, 8);

    expect(pts[0].x).toBeCloseTo(0 + uIx * scale, 4);
    expect(pts[0].y).toBeCloseTo(0 + uIy * scale, 4);

    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(8 + uJx * scale, 4);
    expect(last.y).toBeCloseTo(0 + uJy * scale, 4);
  });

  it('max deflection at midspan for SS beam', () => {
    const L = 10;
    const theta = 0.01;
    const pts = computeDeformedShape(0, 0, L, 0, 0, 0, theta, 0, 0, -theta, 1, L);

    const mid = pts[Math.floor(pts.length / 2)];
    expect(Math.abs(mid.y)).toBeGreaterThan(0);

    expect(pts[0].y).toBeCloseTo(0, 6);
    expect(pts[pts.length - 1].y).toBeCloseTo(0, 6);
  });
});

// ─── Diagram Metadata ─────────────────────────────────────────

describe('Diagrams: metadata (max/min, point count)', () => {
  it('diagram has at least 21 sampling points', () => {
    const diag = computeMomentDiagram(0, 0, 30, -10, -10, 6, 0, 0, 6, 0);
    expect(diag.points.length).toBeGreaterThanOrEqual(21);
  });

  it('point loads add extra sampling points', () => {
    const diagNoPL = computeShearDiagram(30, 0, 0, 10, 0, 0, 10, 0);
    const diagPL = computeShearDiagram(30, 0, 0, 10, 0, 0, 10, 0, [{ a: 4, p: -50 }]);
    expect(diagPL.points.length).toBeGreaterThan(diagNoPL.points.length);
  });

  it('maxAbsValue tracks the peak correctly', () => {
    // SS beam: mStart=0, vStart=30, q=−10, L=6
    // M(3) = 0 − 30·3 − (−10)·9/2 = −90 + 45 = −45
    const diag = computeMomentDiagram(0, 0, 30, -10, -10, 6, 0, 0, 6, 0);
    expect(Math.abs(diag.maxAbsValue)).toBeCloseTo(45, 0);
  });

  it('world coordinates interpolate correctly', () => {
    // Inclined element from (0,0) to (3,4), length = 5
    const diag = computeAxialDiagram(100, 100, 5, 0, 0, 3, 4);
    const mid = diag.points.find(p => Math.abs(p.t - 0.5) < 0.01)!;
    expect(mid.x).toBeCloseTo(1.5, 2);
    expect(mid.y).toBeCloseTo(2, 2);
  });
});
