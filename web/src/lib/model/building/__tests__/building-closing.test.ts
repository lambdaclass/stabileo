/**
 * The closing check of the building tools: a seven-storey building placed with them solves as
 * the same building made bar by bar, and with its slabs it is still in equilibrium.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../../store';
import { placeFrame, placeSlabs } from '../build-on-grid';
import { physicalGroups } from '../../../store/physical';
import type { AnalysisResults3D } from '../../../engine/types-3d';
import type { StructuralGrid } from '../../grid';

const XS = [0, 6, 13.5], YS = [0, 5], ZS = [0, 3.5, 6.5, 9.5, 12.5, 15.5, 18.5, 21.5];
const grid: StructuralGrid = {
  axes: [
    ...XS.map((at, i) => ({ id: `x${i}`, name: String(i + 1), axis: 'x' as const, at })),
    ...YS.map((at, j) => ({ id: `y${j}`, name: 'AB'[j]!, axis: 'y' as const, at })),
  ],
  levels: ZS.map((z, k) => ({ id: `N${k}`, name: `N${k}`, z })),
};
const S = { sectionId: 1, materialId: 1 };

function loadRoof() {
  for (const n of modelStore.nodes.values()) {
    // The two roof corners on the last axis, whatever the slab mesh added along it.
    if (Math.abs((n.z ?? 0) - 21.5) < 1e-9 && Math.abs(n.x - 13.5) < 1e-9 && YS.some((y) => Math.abs(n.y - y) < 1e-9)) modelStore.addNodalLoad3D(n.id, 20, 0, -50, 0, 0, 0);
  }
}
const solve = () => {
  const r = modelStore.solve3D(false, false, false);
  expect(typeof r, String(r)).not.toBe('string');
  return r as AnalysisResults3D;
};
const at = (r: AnalysisResults3D) => {
  const out = new Map<string, number[]>();
  for (const d of r.displacements) {
    const n = modelStore.nodes.get(d.nodeId)!;
    out.set(`${n.x},${n.y},${n.z ?? 0}`, [d.ux, d.uy, d.uz]);
  }
  return out;
};

describe('a seven-storey building placed with the tools', () => {
  beforeEach(() => { historyStore.clear(); uiStore.analysisMode = 'pro'; modelStore.clear(); });

  it('solves as the same building made bar by bar', () => {
    placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y1'], levels: ['N0', 'N7'], columns: S, beamsX: S, beamsY: S }, { fixBase: true });
    expect(physicalGroups().filter((g) => g.physical.kind === 'column')).toHaveLength(6);
    // One continuous beam per axis and level: 2 along X, 3 along Y, on 7 levels.
    expect(physicalGroups().filter((g) => g.physical.kind === 'beam')).toHaveLength(7 * 5);
    loadRoof();
    const tools = at(solve());

    modelStore.clear();
    const id = new Map<string, number>();
    const node = (x: number, y: number, z: number) => {
      const k = `${x},${y},${z}`;
      if (!id.has(k)) id.set(k, modelStore.addNode(x, y, z));
      return id.get(k)!;
    };
    for (const x of XS) for (const y of YS) {
      modelStore.addSupport(node(x, y, 0), 'fixed3d' as never);
      for (let k = 1; k < ZS.length; k++) modelStore.addElement(node(x, y, ZS[k - 1]!), node(x, y, ZS[k]!));
    }
    for (let k = 1; k < ZS.length; k++) {
      const z = ZS[k]!;
      for (const y of YS) for (let i = 1; i < XS.length; i++) modelStore.addElement(node(XS[i - 1]!, y, z), node(XS[i]!, y, z));
      for (const x of XS) for (let j = 1; j < YS.length; j++) modelStore.addElement(node(x, YS[j - 1]!, z), node(x, YS[j]!, z));
    }
    loadRoof();
    const bars = at(solve());

    expect(tools.size).toBe(bars.size);
    for (const [k, u] of bars) {
      const v = tools.get(k)!;
      for (let c = 0; c < 3; c++) expect(v[c]).toBeCloseTo(u[c]!, 9);
    }
  });

  it('with its slabs meshed into the beams, the reactions balance the loads', () => {
    placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y1'], levels: ['N0', 'N7'], columns: S, beamsX: S, beamsY: S }, { fixBase: true });
    const r = placeSlabs(grid, { levels: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7'], thickness: 0.15, materialId: 1, meshSize: 1.5 });
    expect(r.created).toBe(14);
    loadRoof();
    const res = solve();
    const sum = [0, 0, 0];
    for (const q of res.reactions) { sum[0] += q.fx; sum[1] += q.fy; sum[2] += q.fz; }
    expect(sum[0]).toBeCloseTo(-40, 6);
    expect(sum[1]).toBeCloseTo(0, 6);
    expect(sum[2]).toBeCloseTo(100, 6);
  });
});

describe('the seven-storey building on its foundations', () => {
  beforeEach(() => { historyStore.clear(); uiStore.analysisMode = 'pro'; modelStore.clear(); });

  it('gets footings sized from its own solved reactions and ties, and keeps them through the file', async () => {
    const { resultsStore } = await import('../../../store');
    const { supportedNodes, placeFootings, anchorsFor, proposeTies, placeFoundationBeams } = await import('../../foundation/generate');
    const { presizeModelFootings } = await import('../../../store/foundation-tools');
    const { serializeProject, deserializeProject } = await import('../../../store/file');
    modelStore.setGrid(grid);
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iz: 0.00213, iy: 0.00213, b: 0.4, h: 0.4, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y1'], levels: ['N0', 'N7'], columns: { sectionId: col, materialId: 1 }, beamsX: S, beamsY: S }, { fixBase: true });
    // Every floor node carries 60 kN dead and 30 kN live.
    for (const n of modelStore.nodes.values()) if ((n.z ?? 0) > 0) { modelStore.addNodalLoad3D(n.id, 0, 0, -60, 0, 0, 0, 1); modelStore.addNodalLoad3D(n.id, 0, 0, -30, 0, 0, 0, 2); }
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);

    const soil = modelStore.addSoilProfile('Limo');
    modelStore.updateSoilProfile(soil, { bearing: { kind: 'allowablePressure', allowableBearingKPa: 250 } });
    modelStore.setDefaultSoilProfile(soil);
    const { bare } = supportedNodes();
    expect(bare).toHaveLength(6);
    placeFootings(bare, { kind: 'isolated', thickness: 0.6, anchors: anchorsFor(bare, {}) });
    const sized = presizeModelFootings();
    expect(sized.every((o) => 'size' in o)).toBe(true);
    // Together they bear the whole service load: 7 floors × 6 nodes × 90 kN.
    const qNet = 250 - 25 * 0.6;
    const bearing = [...modelStore.model.footings.values()].reduce((s, f) => s + f.B * f.L * qNet, 0);
    expect(bearing).toBeGreaterThanOrEqual(7 * 6 * 90);
    placeFoundationBeams(proposeTies(8, 45), { sectionId: 1, materialId: 1 });
    const ties = physicalGroups().filter((g) => g.physical.typology === 'tie').length;
    expect(ties).toBe(7);

    const before = [...modelStore.model.footings.values()].map((f) => [f.nodeId, f.B, f.L]);
    const text = serializeProject();
    modelStore.clear();
    expect(deserializeProject(text)).toBe(true);
    expect([...modelStore.model.footings.values()].map((f) => [f.nodeId, f.B, f.L])).toEqual(before);
    expect(physicalGroups().filter((g) => g.physical.typology === 'tie')).toHaveLength(ties);
  });
});
