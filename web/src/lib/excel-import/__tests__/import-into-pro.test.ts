/**
 * What an Excel import leaves on screen in 3D and PRO.
 *
 * A flat workbook (X and Z filled, Y blank) is a plane frame and is stored as one. `clear()` sets
 * the native 3D view, so in PRO the portal used to come in lying on the floor; a bundled 2D
 * example is shown standing on X–Z, and an imported one now is too. The constraints reach the
 * store in the engine's shape, so the solve can read them.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { applyWorkbook } from '../apply';
import { modelStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';

const aoa = (header: string[], ...rows: Array<Array<unknown>>) => [header, ...rows];

function portal(): Record<string, unknown[][]> {
  return {
    Nodes: aoa(['id', 'x [m]', 'y [m]', 'z [m]'], [1, 0, '', 0], [2, 6, '', 0], [3, 6, '', 4], [4, 0, '', 4]),
    Materials: aoa(['id', 'name', 'E [MPa]', 'nu'], [1, 'S', 200000, 0.3]),
    Sections: aoa(['id', 'name'], [1, 'IPE 300']),
    Members: aoa(['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'], [1, 'frame', 1, 4, 1, 1], [2, 'frame', 4, 3, 1, 1], [3, 'frame', 2, 3, 1, 1]),
    Supports: aoa(['node', 'type'], [1, 'fixed'], [2, 'fixed']),
  };
}

const before = uiStore.analysisMode;
afterEach(() => { uiStore.analysisMode = before; });

describe('an Excel import in PRO', () => {
  it('shows a flat workbook standing on X–Z', () => {
    uiStore.analysisMode = 'pro';
    const out = applyWorkbook(portal());
    expect(out.problems).toEqual([]);
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  });

  it('keeps the native view for a workbook that is 3D', () => {
    uiStore.analysisMode = 'pro';
    const b = portal();
    b.Nodes = aoa(['id', 'x', 'y', 'z'], [1, 0, 0, 0], [2, 6, 0, 0], [3, 6, 0, 4], [4, 0, 0, 4]);
    b.Supports = aoa(['node', 'type'], [1, 'fixed3d'], [2, 'fixed3d']);
    applyWorkbook(b);
    expect(uiStore.viewportPresentation3D).toBe('native3d');
  });

  it('delivers a diaphragm the engine can read', () => {
    uiStore.analysisMode = 'pro';
    const b = portal();
    b.Constraints = aoa(['type', 'master', 'slaves'], ['rigidDiaphragm', 3, '4']);
    applyWorkbook(b);
    const [c] = modelStore.constraints;
    expect(c).toMatchObject({ type: 'diaphragm', slaveNodes: [expect.any(Number)] });
  });
});

describe('a rectangle described by b and h (#532)', () => {
  it.fails.each([[0.2, 0.4], [0.4, 0.2]])('#532 bends about its depth: a %s × %s cantilever deflects PL³/(3E·bh³/12)', (b, h) => {
    uiStore.analysisMode = '3d';
    const out = applyWorkbook({
      Nodes: aoa(['id', 'x [m]', 'y [m]', 'z [m]'], [1, 0, '', 0], [2, 3, '', 0]),
      Materials: aoa(['id', 'name', 'E [MPa]', 'nu'], [1, 'H-25', 25000, 0.2]),
      Sections: aoa(['id', 'name', 'b [m]', 'h [m]'], [1, 'V', b, h]),
      Members: aoa(['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'], [1, 'frame', 1, 2, 1, 1]),
      Supports: aoa(['node', 'type'], [1, 'fixed']),
    });
    expect(out.problems).toEqual([]);
    const tip = [...modelStore.nodes.values()].find((n) => n.x === 3)!;
    modelStore.addNodalLoad(tip.id, 0, -10);
    const r = modelStore.solve(false);
    if (typeof r === 'string' || !r) throw new Error(String(r));
    const d = r.displacements.find((x) => x.nodeId === tip.id)!;
    const ei = 25000e3 * (b * h ** 3) / 12;
    expect(Math.abs(d.uz)).toBeCloseTo((10 * 3 ** 3) / (3 * ei), 9);
  });
});

describe('an Excel import whose load cases the combinations cannot all take', () => {
  beforeAll(async () => { await initSolver(); });
  afterEach(() => { modelStore.clear(); });

  it('loads nothing, keeps the open model and says why on the LoadCases sheet', () => {
    uiStore.analysisMode = 'pro';
    applyWorkbook(portal());
    const nodes = modelStore.nodes.size;
    const b = portal();
    b.LoadCases = aoa(['id', 'name', 'type'], [1, 'Dead', 'D'], [2, 'Crane', 'X']);
    b.Loads = aoa(['type', 'case', 'node', 'fz [kN]'], ['nodal3d', 1, 3, -1], ['nodal3d', 2, 3, -1]);
    const out = applyWorkbook(b);
    expect(out.loaded.nodes).toBe(0);
    expect(out.problems).toContainEqual(expect.objectContaining({ sheet: 'LoadCases', message: expect.stringMatching(/takes case 2/) }));
    expect(modelStore.nodes.size).toBe(nodes);
  });

  it('gets the CIRSOC 101-2025 combinations of D, Lr and W, wind among them', () => {
    uiStore.analysisMode = 'pro';
    const b = portal();
    b.LoadCases = aoa(['id', 'name', 'type'], [1, 'Dead', 'D'], [2, 'Roof', 'Lr'], [3, 'Wind', 'W']);
    b.Loads = aoa(['type', 'case', 'node', 'fz [kN]'], ['nodal3d', 1, 3, -1], ['nodal3d', 2, 3, -1], ['nodal3d', 3, 4, -1]);
    const out = applyWorkbook(b);
    expect(out.problems).toEqual([]);
    expect(modelStore.model.combinations.map((c) => c.name)).toContain('0.9 D + 1.0 W');
    expect(modelStore.model.combinations.every((c) => c.factors.every((f) => [1, 2, 3].includes(f.caseId)))).toBe(true);
  });
});
