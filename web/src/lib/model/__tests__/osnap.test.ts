/**
 * Object snaps on a background drawing (`osnap.ts`): each kind where a CAD program puts it, only
 * when turned on, never from a hidden layer, and laid with the drawing's shift and turn.
 */
import { describe, it, expect } from 'vitest';
import { osnapUnderlays, type OsnapMode } from '../osnap';
import type { Underlay } from '../underlay';

/** A 10 × 6 m rectangle of lines, a diagonal, a circle r = 1 at (5, 3), an arc and a bulged polyline. */
function drawing(over: Partial<Underlay> = {}): Underlay {
  const lines: Array<[number, number, number, number]> = [[0, 0, 10, 0], [10, 0, 10, 6], [10, 6, 0, 6], [0, 6, 0, 0], [0, 0, 10, 6]];
  const segments = lines.flat();
  // The circle and the arc, drawn as chords as the drawing keeps them.
  const chords = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const t0 = a0 + ((a1 - a0) * k) / n, t1 = a0 + ((a1 - a0) * (k + 1)) / n;
      segments.push(cx + r * Math.cos(t0), cy + r * Math.sin(t0), cx + r * Math.cos(t1), cy + r * Math.sin(t1));
    }
  };
  chords(5, 3, 1, 0, 2 * Math.PI, 36);
  chords(15, 0, 2, 0, Math.PI / 2, 9);
  return {
    id: 'u', name: 'plan', z: 0, dx: 0, dy: 0, rotationDeg: 0, visible: true, segments,
    layers: ['A', 'B'], segLayer: segments.map(() => 0).slice(0, segments.length / 4),
    shapes: [
      ...lines.map(([x1, y1, x2, y2]) => ({ k: 'l' as const, L: 0, a: [x1, y1] as [number, number], b: [x2, y2] as [number, number] })),
      { k: 'c', L: 0, c: [5, 3], r: 1 },
      { k: 'a', L: 0, c: [15, 0], r: 2, a0: 0, a1: Math.PI / 2 },
      // A quarter circle from (20, 0) to (22, 2) about (20, 2)… as a bulged polyline piece.
      { k: 'p', L: 1, pts: [[20, 0], [22, 2]], closed: false, bulges: [Math.tan(Math.PI / 8)] },
    ],
    ...over,
  };
}
const snap = (u: Underlay, x: number, y: number, modes: OsnapMode[], tol = 0.3, from?: { x: number; y: number }) => osnapUnderlays([u], x, y, tol, 0, new Set(modes), from ?? null);

describe('object snaps on a background drawing', () => {
  it('takes each kind where it lies, and only the kinds turned on', () => {
    const u = drawing();
    expect(snap(u, 0.1, 0.2, ['endpoint'])).toMatchObject({ x: 0, y: 0, mode: 'endpoint' });
    expect(snap(u, 5.1, 0.1, ['endpoint'])).toBeNull();
    expect(snap(u, 5.1, 0.1, ['midpoint'])).toMatchObject({ x: 5, y: 0, mode: 'midpoint' });
    expect(snap(u, 5.1, 2.9, ['center'])).toMatchObject({ x: 5, y: 3, mode: 'center' });
    expect(snap(u, 6.05, 3.1, ['quadrant'])).toMatchObject({ x: 6, y: 3, mode: 'quadrant' });
    // The arc's own middle, at 45°, and its centre; not a chord's middle.
    const m = snap(u, 16.4, 1.5, ['midpoint'])!;
    expect(m.mode).toBe('midpoint');
    expect(m.x).toBeCloseTo(15 + 2 * Math.SQRT1_2, 9);
    expect(snap(u, 15.1, 0.2, ['center'])).toMatchObject({ x: 15, y: 0, mode: 'center' });
    // The bulged polyline piece: its arc's centre (20, 2) and its middle.
    const pc = snap(u, 20.1, 1.9, ['center'])!;
    expect(pc.x).toBeCloseTo(20, 9); expect(pc.y).toBeCloseTo(2, 9);
    const pm = snap(u, 21.4, 0.6, ['midpoint'])!;
    expect(pm.x).toBeCloseTo(20 + Math.SQRT2, 6); expect(pm.y).toBeCloseTo(2 - Math.SQRT2, 6);
  });

  it('finds crossings, the perpendicular from the last point, and the nearest point last', () => {
    const u = drawing();
    // The diagonal (0,0)-(10,6) crosses x = 10 only at its end; the circle's chords cross it near (4.1, 2.5).
    const x = snap(u, 4.15, 2.45, ['intersection'])!;
    expect(x.mode).toBe('intersection');
    expect(Math.abs(x.y - 0.6 * x.x)).toBeLessThan(1e-9);
    // From (3, 4), the perpendicular foot on the bottom line is (3, 0).
    expect(snap(u, 3.1, 0.15, ['perpendicular'], 0.3, { x: 3, y: 4 })).toMatchObject({ x: 3, y: 0, mode: 'perpendicular' });
    expect(snap(u, 3.1, 0.15, ['perpendicular'])).toBeNull();
    // Nearest answers only when nothing else is in reach.
    const n = snap(u, 7.3, 0.12, ['nearest', 'endpoint'])!;
    expect(n.mode).toBe('nearest');
    expect(n.y).toBeCloseTo(0, 9); expect(n.x).toBeCloseTo(7.3, 9);
    expect(snap(u, 0.1, 0.1, ['nearest', 'endpoint'])!.mode).toBe('endpoint');
  });

  it('gives nothing from a hidden layer or one out of the snaps, and follows the drawing laid', () => {
    expect(snap(drawing({ noSnapLayers: ['B'] }), 20.1, 1.9, ['center'])).toBeNull();
    expect(snap(drawing({ hiddenLayers: ['A'] }), 0.1, 0.1, ['endpoint'])).toBeNull();
    const laid = drawing({ dx: 100, dy: 50, rotationDeg: 90 });
    // (10, 0) turned 90° is (0, 10), shifted to (100, 60).
    expect(snap(laid, 100.1, 59.9, ['endpoint'])).toMatchObject({ mode: 'endpoint' });
    const p = snap(laid, 100.1, 59.9, ['endpoint'])!;
    expect(p.x).toBeCloseTo(100, 9); expect(p.y).toBeCloseTo(60, 9);
    expect(osnapUnderlays([drawing({ visible: false })], 0.1, 0.1, 0.3, 0, new Set(['endpoint']))).toBeNull();
    expect(osnapUnderlays([drawing()], 0.1, 0.1, 0.3, 3, new Set(['endpoint'])), 'another level').toBeNull();
  });
});
