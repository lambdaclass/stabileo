/**
 * Two plans in one DXF (cm), side by side: plan A at x 0–600, plan B at x 1000–1600, both 500
 * deep. Each has its frame on VIGAS (B also an arc and a piece drawn twice, and a loose end),
 * columns as small circles on PILARES, and a label on TEXTOS.
 *  - the drawing is offered as two regions, not one;
 *  - each region laid at its own level by its lower-left corner falls on the same plan position;
 *  - hidden layers and layers out of the snaps are not captured;
 *  - B's frame converted at level 2: members, a curved member, columns down to level 1, the
 *    duplicate left out, the loose end reported, and run again it adds nothing;
 *  - two pairs of points lay a turned drawing back; a scale mismatch is said, not applied;
 *  - saved and opened, the templates keep their regions, layers and placement.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { parseCadDxf } from '../../cad/parse';
import { buildDxf, dxfArc, dxfCircle, dxfLine, dxfText } from '../../cad/__tests__/dxf-fixture';
import { drawingRegions } from '../../model/underlay-regions';
import { osnapUnderlays } from '../../model/osnap';
import { planConversion } from '../../model/underlay-convert';
import { addUnderlays, alignByPoints, editUnderlay, underlayFromDrawing } from '../underlays';
import { applyConversion } from '../underlay-convert';
import { serializeProject, deserializeProject } from '../file';
import { arcs } from '../curved-members';

/** The snaps a template offered before they could be chosen: segment ends and middles. */
const ENDS = new Set(['endpoint', 'midpoint'] as const);

function plan(x0: number, extra: string[] = []): string[] {
  const L = (a: number, b: number, c: number, d: number) => dxfLine('VIGAS', x0 + a, b, x0 + c, d);
  return [
    L(0, 0, 600, 0), L(600, 0, 600, 500), L(600, 500, 0, 500), L(0, 500, 0, 0),
    dxfCircle('PILARES', x0, 0, 15), dxfCircle('PILARES', x0 + 600, 0, 15), dxfCircle('PILARES', x0 + 600, 500, 15), dxfCircle('PILARES', x0, 500, 15),
    dxfText('TEXTOS', x0 + 300, 250, 'ESTAR'),
    ...extra,
  ];
}
const DXF = buildDxf({
  insunits: 5, layers: ['VIGAS', 'PILARES', 'TEXTOS'],
  entities: [
    ...plan(0),
    ...plan(1000, [
      // An arc from (1600,0) out to (1600,500) bulging to +x, a piece drawn twice, and one that ends in the air.
      dxfArc('VIGAS', 1600, 250, 250, -90, 90),
      dxfLine('VIGAS', 1000, 0, 1600, 0),
      dxfLine('VIGAS', 1300, 500, 1300, 700),
    ]),
  ].join('\n'),
});

describe('templates from a DXF with two plans', () => {
  beforeEach(() => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    modelStore.setGrid({ axes: [], levels: [{ id: 'N1', name: 'Planta 1', z: 3 }, { id: 'N2', name: 'Planta 2', z: 6 }] });
  });

  it('offers the plans as regions and lays each at its level on the same position', () => {
    const doc = parseCadDxf(DXF, 'two.dxf');
    const regions = drawingRegions(doc, 'cm');
    expect(regions).toHaveLength(2);
    const [a, b] = [...regions].sort((p, q) => p.box.minX - q.box.minX);
    expect(a!.box.maxX).toBeLessThan(b!.box.minX);
    const layers = ['VIGAS', 'PILARES', 'TEXTOS'];
    const ua = underlayFromDrawing(doc, { name: 'A', unit: 'cm', layers, region: a, levelId: 'N1', z: 3 })!.underlay;
    const ub = underlayFromDrawing(doc, { name: 'B', unit: 'cm', layers, region: b, levelId: 'N2', z: 6 })!.underlay;
    addUnderlays([ua, ub]);
    // The column at A's lower-left (radius 15 cm) is at -0.15 in the drawing; laid by its region's
    // corner both plans' frames land at (0.15, 0.15)… on their own levels only.
    expect(osnapUnderlays(modelStore.underlays, 0.15, 0.15, 0.05, 3, ENDS)).toMatchObject({ x: expect.closeTo(0.15, 9), y: expect.closeTo(0.15, 9) });
    expect(osnapUnderlays(modelStore.underlays, 6.15, 5.15, 0.05, 6, ENDS)).toMatchObject({ x: expect.closeTo(6.15, 9), y: expect.closeTo(5.15, 9) });
    expect(ua.shapes!.filter((s) => s.k === 'l')).toHaveLength(4);
    expect(ub.leftOut).toBeUndefined();
    expect(ub.shapes!.filter((x) => x.k === 't').map((x) => (x as { text: string }).text)).toEqual(['ESTAR']);

    // A hidden layer, or one out of the snaps, is not captured.
    editUnderlay(ua.id, { hiddenLayers: ['VIGAS'] });
    expect(osnapUnderlays(modelStore.underlays, 3.15, 0.15, 0.05, 3, ENDS)).toBeNull();
    editUnderlay(ua.id, { hiddenLayers: [], noSnapLayers: ['VIGAS'] });
    expect(osnapUnderlays(modelStore.underlays, 3.15, 0.15, 0.05, 3, ENDS)).toBeNull();
    editUnderlay(ua.id, { noSnapLayers: [] });
    // The middle of a member line is a snap point too.
    expect(osnapUnderlays(modelStore.underlays, 3.15, 0.15, 0.05, 3, ENDS)).not.toBeNull();

    // A locked template does not move.
    editUnderlay(ua.id, { locked: true });
    expect(editUnderlay(ua.id, { dx: 10 })).toBe(false);
    expect(modelStore.underlays.find((u) => u.id === ua.id)!.dx).toBe(ua.dx);

    const text = serializeProject();
    modelStore.clear();
    expect(deserializeProject(text)).toBe(true);
    const back = modelStore.underlays;
    expect(back.map((u) => [u.name, u.levelId, !!u.region, u.locked ?? false])).toEqual([['A', 'N1', true, true], ['B', 'N2', true, false]]);
    expect(back[1]!.segLayer?.length).toBe(back[1]!.segments.length / 4);
  });

  it('converts plan B at its level, reports what it cannot, and adds nothing the second time', () => {
    const doc = parseCadDxf(DXF, 'two.dxf');
    const b = drawingRegions(doc, 'cm').sort((p, q) => q.box.minX - p.box.minX)[0]!;
    // Laid by the drawing point (1000, 0) cm onto the model's origin.
    const ub = underlayFromDrawing(doc, { name: 'B', unit: 'cm', layers: ['VIGAS', 'PILARES', 'TEXTOS'], region: b, ref: { x: 10, y: 0 }, target: { x: 0, y: 0 }, levelId: 'N2', z: 6 })!.underlay;
    addUnderlays([ub]);
    const opts = { memberLayers: ['VIGAS'], columnLayers: ['PILARES'], tol: 0.02, maxColumn: 0.8, columnFootZ: 3 };
    const p = planConversion(ub, opts, modelStore.model);
    expect(p.beams).toHaveLength(5);
    expect(p.arcs).toHaveLength(1);
    expect(p.columns).toHaveLength(4);
    expect(p.duplicates).toBe(1);
    expect(p.loose.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)])).toEqual([[3, 7]]);
    expect(p.tees.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)])).toEqual([[3, 5]]);
    expect(p.skipped).toEqual({});
    const r = applyConversion(ub, p, { beamSection: 1, columnSection: 1, materialId: 1, tol: 0.02, columnFootZ: 3, memberLayers: ['VIGAS'], columnLayers: ['PILARES'] });
    expect(r.columns).toBe(4);
    expect(arcs()).toHaveLength(1);
    // The arc's ends are the frame's corners at x = 6.
    const arc = arcs()[0]!;
    expect([arc.spec.start.x, arc.spec.end.x]).toEqual([expect.closeTo(6, 9), expect.closeTo(6, 9)]);
    // Every member at level 2 or a column from 3 to 6; the top beam cut where the loose piece meets it.
    for (const e of modelStore.elements.values()) {
      const zi = modelStore.nodes.get(e.nodeI)!.z ?? 0, zj = modelStore.nodes.get(e.nodeJ)!.z ?? 0;
      expect(zi === 6 && zj === 6 || (Math.min(zi, zj) === 3 && Math.max(zi, zj) === 6)).toBe(true);
    }
    const atTee = [...modelStore.nodes.values()].find((n) => Math.abs(n.x - 3) < 1e-9 && Math.abs(n.y - 5) < 1e-9 && n.z === 6)!;
    expect([...modelStore.elements.values()].filter((e) => e.nodeI === atTee.id || e.nodeJ === atTee.id)).toHaveLength(3);
    const census = { nodes: modelStore.nodes.size, elements: modelStore.elements.size };
    const again = planConversion(ub, opts, modelStore.model);
    expect(again.beams.length + again.arcs.length).toBe(0);
    expect(again.existing).toBeGreaterThanOrEqual(6);
    expect(again.columns).toHaveLength(0);
    applyConversion(ub, again, { beamSection: 1, columnSection: 1, materialId: 1, tol: 0.02, columnFootZ: 3, memberLayers: ['VIGAS'], columnLayers: ['PILARES'] });
    expect({ nodes: modelStore.nodes.size, elements: modelStore.elements.size }).toEqual(census);
  });

  it('lays a turned drawing back by two pairs of points, and says a scale mismatch', () => {
    const u = { id: 'x', name: 'x', z: 0, segments: [0, 0, 1, 0], dx: 0, dy: 0, rotationDeg: 0, visible: true };
    const r = alignByPoints(u, [{ from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }, { from: { x: 0, y: 10 }, to: { x: -5, y: 5 } }]);
    expect(r.rotationDeg).toBeCloseTo(90, 9);
    expect(r.dx).toBeCloseTo(5, 9); expect(r.dy).toBeCloseTo(5, 9);
    expect(r.scaleMismatch).toBeCloseTo(0, 9);
    const scaled = alignByPoints(u, [{ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }, { from: { x: 1, y: 0 }, to: { x: 100, y: 0 } }]);
    expect(scaled.scaleMismatch).toBeCloseTo(99, 9);
  });
});
