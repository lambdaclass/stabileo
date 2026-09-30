/**
 * The drawn mode shape is the member's displacement field, rotations included.
 *
 * drawModeShape interpolated the nodal translations only, so a mode made of
 * nodal rotations (a beam whose nodes all sit on supports) drew as a straight
 * line: the first mode of a simply supported beam did not move. Each case here
 * solves the real modal problem and reads back the polyline drawn on a
 * recording canvas.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../store';
import { solveModal, isSolverReady } from '../../engine/wasm-solver';
import { drawModeShape } from '../draw-modes';

const quiet: Array<ReturnType<typeof vi.spyOn>> = [];
beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
  for (const k of ['log', 'warn', 'info'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}));
});
afterAll(() => { quiet.forEach((s) => s.mockRestore()); });

function build(fn: () => void) {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(fn);
  const id = modelStore.addSection({ name: 'R 10x20', a: 0.02, iy: (0.1 * 0.2 ** 3) / 12, iz: (0.2 * 0.1 ** 3) / 12, b: 0.1, h: 0.2, shape: 'rect' } as never);
  for (const e of [...modelStore.elements.keys()]) modelStore.updateElement(e, { sectionId: id });
}

const densities = () => new Map([...modelStore.materials].map(([id, m]) => [id, (m.rho * 1000) / 9.81]));

/** The polylines drawModeShape strokes, one per member, in world coordinates. */
function drawnMode(modeIndex = 0, scale = 1): Array<Array<{ x: number; y: number }>> {
  const result = solveModal(modelStore.buildSolverInput(false)!, densities());
  const mode = result.modes[modeIndex];
  const paths: Array<Array<{ x: number; y: number }>> = [];
  let cur: Array<{ x: number; y: number }> = [];
  const ctx = {
    beginPath: () => { cur = []; },
    moveTo: (x: number, y: number) => { cur.push({ x, y }); },
    lineTo: (x: number, y: number) => { cur.push({ x, y }); },
    stroke: () => { paths.push(cur); },
    arc: () => {}, fill: () => {}, setLineDash: () => {},
    strokeStyle: '', fillStyle: '', lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
  // Scale so the largest nodal quantity maps to `scale` metres (a rotation times a span counts).
  const amp = Math.max(...mode.displacements.map((d: any) => Math.max(Math.abs(d.ux), Math.abs(d.uz), Math.abs(d.ry))));
  drawModeShape(mode.displacements as never, {
    ctx,
    worldToScreen: (x, y) => ({ x, y }),
    nodes: modelStore.nodes as never,
    elements: modelStore.elements as never,
  }, 1, scale / amp);
  return paths;
}

/** The vertical offsets of a beam on y = 0, left to right, normalised to a peak of 1. */
function profile(paths: Array<Array<{ x: number; y: number }>>) {
  const pts = paths.flat().sort((a, b) => a.x - b.x);
  const peak = Math.max(...pts.map((p) => Math.abs(p.y)));
  return { pts, peak, norm: pts.map((p) => ({ x: p.x, v: p.y / peak })) };
}

describe('drawModeShape — mode shapes with the nodal rotations', () => {
  it('simply supported, one member: the first mode is a half wave peaking at midspan', () => {
    const L = 6;
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(L, 0);
      modelStore.addElement(a, b, 'frame');
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    });
    const { pts, peak, norm } = profile(drawnMode());
    // Both nodes are held: every bit of motion comes from the rotations.
    expect(peak).toBeGreaterThan(0.5);
    const top = pts.reduce((m, p) => (Math.abs(p.y) > Math.abs(m.y) ? p : m));
    expect(top.x).toBeCloseTo(L / 2, 1);
    const sign = Math.sign(top.y);
    for (const p of norm) {
      expect(p.v * sign).toBeGreaterThan(-1e-9);                          // one side of the axis
      expect(Math.abs(p.v * sign - Math.sin((Math.PI * p.x) / L))).toBeLessThan(0.06); // sine-like
    }
  });

  it('simply supported, four members: the drawn curve is the sine, continuous across the nodes', () => {
    const L = 8;
    build(() => {
      const n = [0, 2, 4, 6, 8].map((x) => modelStore.addNode(x, 0));
      for (let i = 0; i < 4; i++) modelStore.addElement(n[i], n[i + 1], 'frame');
      modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[4], 'rollerX');
    });
    const { pts, norm } = profile(drawnMode());
    const top = pts.reduce((m, p) => (Math.abs(p.y) > Math.abs(m.y) ? p : m));
    expect(top.x).toBeCloseTo(L / 2, 1);
    const sign = Math.sign(top.y);
    // A rotation read with the wrong sign would put a cusp at every inner node.
    for (const p of norm) expect(Math.abs(p.v * sign - Math.sin((Math.PI * p.x) / L))).toBeLessThan(0.02);
  });

  it('cantilever: the first mode leaves the root flat and grows to the tip', () => {
    build(() => {
      const n = [0, 1.5, 3, 4.5].map((x) => modelStore.addNode(x, 0));
      for (let i = 0; i < 3; i++) modelStore.addElement(n[i], n[i + 1], 'frame');
      modelStore.addSupport(n[0], 'fixed');
    });
    const { norm } = profile(drawnMode());
    const sign = Math.sign(norm[norm.length - 1].v);
    const v = norm.map((p) => p.v * sign);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1] - 1e-6);
    expect(v[v.length - 1]).toBeCloseTo(1, 6);
    // Cantilever first mode at 1/3 of the span: 1 − cos … form gives ≈ 0.14 of the tip.
    const third = norm.find((p) => Math.abs(p.x - 1.5) < 1e-6)!;
    expect(Math.abs(third.v)).toBeGreaterThan(0.08);
    expect(Math.abs(third.v)).toBeLessThan(0.25);
  });

  it('continuous beam on a support at every node: the first modes move', () => {
    build(() => {
      const n = [0, 5, 10, 15].map((x) => modelStore.addNode(x, 0));
      for (let i = 0; i < 3; i++) modelStore.addElement(n[i], n[i + 1], 'frame');
      modelStore.addSupport(n[0], 'pinned');
      for (let i = 1; i < 4; i++) modelStore.addSupport(n[i], 'rollerX');
    });
    for (const k of [0, 1]) expect(profile(drawnMode(k)).peak).toBeGreaterThan(0.3);
  });

  it('a truss bar stays straight between its displaced nodes', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(2, 2);
      modelStore.addElement(a, b, 'truss'); modelStore.addElement(a, c, 'truss'); modelStore.addElement(c, b, 'truss');
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    });
    for (const path of drawnMode()) {
      const p0 = path[0], p1 = path[path.length - 1];
      for (const p of path) {
        const cross = (p1.x - p0.x) * (p.y - p0.y) - (p1.y - p0.y) * (p.x - p0.x);
        expect(Math.abs(cross)).toBeLessThan(1e-6);
      }
    }
  });
});
