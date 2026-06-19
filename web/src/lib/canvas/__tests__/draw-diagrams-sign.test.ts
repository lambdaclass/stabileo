/**
 * 2D diagram side convention (PR13).
 *
 * Default (towardLocalAxes = false): positive N, V, M all plot on the SAME
 * "structural" side — DOWN for a horizontal member, RIGHT for a vertical one.
 * ON (towardLocalAxes = true): all flip together to the local positive axis.
 *
 * The drawing offset is `value · sideFactor · scale/50 · perp`, perp = (-dy, dx)/L
 * (the member's local +z, UP for a horizontal member). Engine moments are
 * hogging-positive, so a sagging ("displayed-positive") moment has engine value
 * < 0; shear & axial use raw values. We feed DISPLAYED-positive inputs (moment
 * engine −10, shear/axial engine +10) and check which side each plots on.
 */
import { describe, it, expect } from 'vitest';
import { drawDiagrams, type DiagramKind } from '../draw-diagrams';

type Pt = { x: number; y: number };

// A no-op canvas context: every method call is a no-op, property sets are ignored.
function fakeCtx(): CanvasRenderingContext2D {
  return new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
}

/** Run drawDiagrams with worldToScreen=identity and return the perp-offset of the diagram. */
function perpOffset(
  kind: DiagramKind,
  I: Pt, J: Pt,
  vals: { mStart: number; vStart: number; nStart: number },
  towardLocalAxes: boolean,
): Pt {
  const pts: Pt[] = [];
  const L = Math.hypot(J.x - I.x, J.y - I.y);
  const results = {
    elementForces: [{
      elementId: 1,
      mStart: vals.mStart, mEnd: vals.mStart,
      vStart: vals.vStart, vEnd: vals.vStart,
      nStart: vals.nStart, nEnd: vals.nStart,
      qI: 0, qJ: 0, length: L, pointLoads: [],
    }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const dc = {
    ctx: fakeCtx(),
    worldToScreen: (x: number, y: number) => { pts.push({ x, y }); return { x, y }; },
    getNode: (id: number) => (id === 1 ? I : J),
    getElement: () => ({ nodeI: 1, nodeJ: 2 }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  drawDiagrams(results, kind, dc, 1, false, undefined, undefined, towardLocalAxes);
  // perp = (-dy, dx)/L; baseline points (on the I→J axis through I=origin) project
  // to ~0, diagram points project to the signed offset. Take the largest |proj|.
  const perp = { x: -(J.y - I.y) / L, y: (J.x - I.x) / L };
  let off = 0;
  for (const p of pts) {
    const proj = p.x * perp.x + p.y * perp.y;
    if (Math.abs(proj) > Math.abs(off)) off = proj;
  }
  return { x: off * perp.x, y: off * perp.y }; // world-space offset vector (purely along perp)
}

const KINDS: DiagramKind[] = ['moment', 'shear', 'axial'];
// DISPLAYED-positive inputs: moment sags (engine −10), shear & axial positive (+10).
const POS = { mStart: -10, vStart: 10, nStart: 10 };

describe('2D diagram side convention', () => {
  it('DEFAULT: horizontal member draws positive N, V, M DOWNWARD (same side)', () => {
    const I = { x: 0, y: 0 }, J = { x: 4, y: 0 };           // horizontal
    for (const k of KINDS) {
      const o = perpOffset(k, I, J, POS, false);
      expect(o.y).toBeLessThan(0);                           // world −Y = down
      expect(Math.abs(o.x)).toBeLessThan(1e-9);              // purely vertical offset
    }
  });

  it('DEFAULT: vertical member draws positive N, V, M to the RIGHT (same side)', () => {
    const I = { x: 0, y: 0 }, J = { x: 0, y: 4 };           // vertical
    for (const k of KINDS) {
      const o = perpOffset(k, I, J, POS, false);
      expect(o.x).toBeGreaterThan(0);                        // world +X = right
      expect(Math.abs(o.y)).toBeLessThan(1e-9);
    }
  });

  it('ON: every kind flips to the opposite (local-axis) side, still unified', () => {
    const I = { x: 0, y: 0 }, J = { x: 4, y: 0 };
    for (const k of KINDS) {
      const off = perpOffset(k, I, J, POS, false);
      const on = perpOffset(k, I, J, POS, true);
      expect(off.y).toBeLessThan(0);                         // default down
      expect(on.y).toBeGreaterThan(0);                       // toggled up (local +z)
    }
  });

  it('INCLINED member: N, V, M stay consistent (same side) and flip together', () => {
    const I = { x: 0, y: 0 }, J = { x: 3, y: 3 };           // 45°
    const L = Math.hypot(3, 3);
    const perp = { x: -3 / L, y: 3 / L };
    const sideSign = (o: Pt) => Math.sign(o.x * perp.x + o.y * perp.y);
    const def = KINDS.map(k => sideSign(perpOffset(k, I, J, POS, false)));
    const on = KINDS.map(k => sideSign(perpOffset(k, I, J, POS, true)));
    // all three on the same side by default…
    expect(new Set(def).size).toBe(1);
    // …all three flipped together when the option is on…
    expect(new Set(on).size).toBe(1);
    // …and the two modes are opposite sides.
    expect(def[0]).toBe(-on[0]);
  });
});
