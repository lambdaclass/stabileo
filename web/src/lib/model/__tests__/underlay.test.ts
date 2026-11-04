import { describe, it, expect, beforeEach } from 'vitest';
import { parseCadDxf } from '../../cad/parse';
import { buildDxf, dxfArc, dxfInsert, dxfLine, dxfLwPolyline, columnBlock } from '../../cad/__tests__/dxf-fixture';
import { cadSegments, laidPoint, type Underlay } from '../underlay';
import { osnapUnderlays } from '../osnap';
import { historyStore, modelStore } from '../../store';

/** The snaps a template offered before they could be chosen: segment ends and middles. */
const ENDS = new Set(['endpoint', 'midpoint'] as const);

const PLAN = buildDxf({
  layers: ['MUROS', 'COTAS', 'PILARES'],
  blocks: columnBlock('COL'),
  entities: [
    dxfLine('MUROS', 0, 0, 6000, 0),
    dxfLwPolyline('MUROS', [[0, 0], [0, 5000], [6000, 5000]], false),
    dxfLine('COTAS', 0, -500, 6000, -500),
    dxfArc('MUROS', 6000, 2500, 500, 270, 90),
    dxfInsert('PILARES', 'COL', 3000, 0),
  ].join('\n'),
});

describe('a background drawing', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('reads the chosen layers in metres, arcs as chords and blocks drawn through', () => {
    const doc = parseCadDxf(PLAN, 'plan.dxf');
    const walls = cadSegments(doc, 'mm', new Set(['MUROS']));
    // A line, two polyline sides, and the half circle as chords of at most 10°.
    expect(walls.segments.length / 4).toBe(1 + 2 + 18);
    expect(walls.segments.slice(0, 4)).toEqual([0, 0, 6, 0]);
    const xs = walls.segments.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeCloseTo(6.5, 9);
    // The block's 0.4 square (block units, read as mm here) around (3000, 0) mm.
    const cols = cadSegments(doc, 'mm', new Set(['PILARES']));
    expect(cols.segments.length / 4).toBe(4);
    expect(Math.min(...cols.segments.filter((_, i) => i % 2 === 0))).toBeCloseTo(3 - 0.0002, 9);
    expect(cadSegments(doc, 'mm').segments.length / 4).toBe(1 + 2 + 1 + 18 + 4);
  });

  it('captures the end of a segment where it is laid: turned, then shifted', () => {
    const u: Underlay = { id: 'u', name: 'p', z: 3, segments: [0, 0, 2, 0], dx: 10, dy: 0, rotationDeg: 90, visible: true };
    expect(laidPoint(u, 2, 0)[0]).toBeCloseTo(10, 9);
    expect(laidPoint(u, 2, 0)[1]).toBeCloseTo(2, 9);
    expect(osnapUnderlays([u], 10.05, 2.02, 0.1, 3, ENDS)).toMatchObject({ x: expect.closeTo(10, 9), y: expect.closeTo(2, 9) });
    // On another level, or hidden, it captures nothing.
    expect(osnapUnderlays([u], 10.05, 2.02, 0.1, 0, ENDS)).toBeNull();
    expect(osnapUnderlays([{ ...u, visible: false }], 10.05, 2.02, 0.1, 3, ENDS)).toBeNull();
    expect(osnapUnderlays([u], 11, 2, 0.1, 3, ENDS)).toBeNull();
  });

  it('is saved with the project and undone on the views channel', () => {
    const u: Underlay = { id: 'u', name: 'p', z: 0, segments: [0, 0, 1, 0], dx: 0, dy: 0, rotationDeg: 0, visible: true };
    modelStore.setUnderlays([u]);
    const snap = modelStore.snapshot();
    expect(snap.underlays).toEqual([u]);
    modelStore.clear();
    expect(modelStore.underlays).toEqual([]);
    modelStore.restore(snap);
    expect(modelStore.underlays).toEqual([u]);
    modelStore.setUnderlays([]);
    historyStore.undo();
    expect(modelStore.underlays).toEqual([u]);
  });
});
