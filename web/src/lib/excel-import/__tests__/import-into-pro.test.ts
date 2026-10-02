/**
 * What an Excel import leaves on screen in 3D and PRO.
 *
 * A flat workbook (X and Z filled, Y blank) is a plane frame and is stored as one. `clear()` sets
 * the native 3D view, so in PRO the portal used to come in lying on the floor; a bundled 2D
 * example is shown standing on X–Z, and an imported one now is too. The constraints reach the
 * store in the engine's shape, so the solve can read them.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { applyWorkbook } from '../apply';
import { modelStore, uiStore } from '../../store';

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
