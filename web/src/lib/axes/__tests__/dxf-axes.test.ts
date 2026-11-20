/**
 * PRO's DXF in the user's axes: coordinates, the axes it states, and every component written as
 * text (reactions, nodal moments, imposed displacements, support types, load case names).
 *
 * A projection is the view the user knows, so its geometry is the same under every frame and only
 * its axes' names and signs change; in space each point is the user's coordinates, with the third
 * axis reversed under a left-handed choice so that the drawing (CAD is right-handed) is not mirrored.
 */
import { describe, it, expect } from 'vitest';
import { writeDxf, dxfPaperAxes, dxfPaperAxesText, DXF_CONTENTS, type DxfContents, type DxfModel, type DxfProjection } from '../../dxf/writer';
import { allChoices, makeFrame, pseudoToUser, toUser, type AxesChoice } from '../frame';
import type { AnalysisResults3D } from '../../engine/types-3d';

const tr = (k: string) => k.split('.').pop()!.toUpperCase();
const none = Object.fromEntries(DXF_CONTENTS.map((k) => [k, false])) as unknown as DxfContents;

const Y_UP: AxesChoice = { up: '+Y', right: '+X', hand: 'right' };
const LEFT: AxesChoice = { up: '+Z', right: '+X', hand: 'left' };
const ODD: AxesChoice = { up: '-X', right: '+Z', hand: 'left' };

function model(): DxfModel {
  const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 2, y: 3, z: 5 }]]);
  return {
    nodes, elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } as never]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'rollerXY' } as never]]),
    plates: new Map(), quads: new Map(), sections: new Map(), materials: new Map(),
    loads: [
      { type: 'nodal3d', id: 1, data: { nodeId: 2, fx: 1, fy: 2, fz: 3, mx: 4, my: 5, mz: 6, caseId: 1 } } as never,
      { type: 'displacement3d', id: 2, data: { nodeId: 2, dx: 0.001, dz: -0.002, dry: 0.01, caseId: 1 } } as never,
    ],
    loadCases: [{ id: 1, name: 'Wind +X' }],
    flat: false,
  };
}

const results = {
  displacements: [], elementForces: [],
  reactions: [{ nodeId: 1, fx: 10, fy: 20, fz: 30, mx: 1, my: 2, mz: 3 }],
} as unknown as AnalysisResults3D;

function write(axes: AxesChoice | undefined, projection: DxfProjection, contents: Partial<DxfContents>, extra: object = {}) {
  return writeDxf(model(), { projection, units: 'm', contents: { ...none, ...contents }, results, axes, ...extra }, tr);
}

/** Points of the nodes layer, as written. */
function points(dxf: string): number[][] {
  const l = dxf.split('\n');
  const out: number[][] = [];
  for (let i = 0; i < l.length; i++) if (l[i] === 'POINT') out.push([Number(l[i + 4]), Number(l[i + 6]), Number(l[i + 8])]);
  return out;
}
const texts = (dxf: string): string[] => { const l = dxf.split('\n'); return l.flatMap((v, i) => (v === 'TEXT' ? [l[i + 12]!] : [])); };

const det = (a: number[], b: number[], c: number[]) => a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);

describe('DXF in the user axes', () => {
  it('the default frame writes the model as before, with no comment', () => {
    const d = write(undefined, 'space', { nodes: true });
    expect(d.startsWith('0\nSECTION')).toBe(true);
    expect(points(d)).toEqual([[0, 0, 0], [2, 3, 5]]);
    expect(dxfPaperAxesText('top')).toBe('x = X, y = Y');
    expect(dxfPaperAxesText('front')).toBe('x = X, y = Z');
    expect(dxfPaperAxesText('side')).toBe('x = Y, y = Z');
  });

  it('in space, each point is in the user coordinates (Y up)', () => {
    const d = write(Y_UP, 'space', { nodes: true });
    expect(points(d)[1]).toEqual(toUser(makeFrame(Y_UP), [2, 3, 5]));
    expect(points(d)[1]).toEqual([2, 5, -3]);
    expect(d.split('\n')[1]).toBe('stabileo axes: up=+Y right=+X hand=right; x = X, y = Y, z = Z');
  });

  it('in every frame the space drawing is a right-handed image of the model, never mirrored', () => {
    const pts: Array<[number, number, number]> = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (const c of allChoices()) {
      const f = makeFrame(c);
      const axes = dxfPaperAxes('space', c);
      const map = (p: [number, number, number]) => { const u = toUser(f, p); return axes.map((a) => a.sign * u['XYZ'.indexOf(a.name)]!); };
      const [o, x, y, z] = pts.map(map);
      const e = [x, y, z].map((v) => v.map((k, i) => k - o![i]!));
      expect(det(e[0]!, e[1]!, e[2]!), JSON.stringify(c)).toBe(1);
      // Up and right are the user's own coordinates, as typed.
      const up = 'XYZ'.indexOf(c.up[1]!), right = 'XYZ'.indexOf(c.right[1]!);
      expect(axes[up]!.sign).toBe(1);
      expect(axes[right]!.sign).toBe(1);
    }
  });

  it('a left-handed frame reverses its third axis in space and says so', () => {
    const d = write(LEFT, 'space', { nodes: true });
    expect(points(d)[1]).toEqual([2, 3, 5]);
    expect(dxfPaperAxesText('space', LEFT)).toBe('x = X, y = −Y, z = Z');
    expect(d).toContain('hand=left; x = X, y = −Y, z = Z');
  });

  it('projections are the same view under every frame, named in the user axes', () => {
    for (const p of ['top', 'front', 'side'] as const) {
      const ref = points(write(undefined, p, { nodes: true }));
      for (const c of [Y_UP, LEFT, ODD]) expect(points(write(c, p, { nodes: true })), `${p} ${JSON.stringify(c)}`).toEqual(ref);
    }
    expect(dxfPaperAxesText('top', Y_UP)).toBe('x = X, y = −Z');
    expect(dxfPaperAxesText('front', Y_UP)).toBe('x = X, y = Y');
    expect(dxfPaperAxesText('side', Y_UP)).toBe('x = −Z, y = Y');
    expect(dxfPaperAxesText('front', ODD)).toBe('x = Z, y = −X');
  });

  it('reactions, nodal moments and imposed displacements are written in the user axes', () => {
    for (const c of [Y_UP, LEFT, ODD]) {
      const f = makeFrame(c);
      const d = write(c, 'space', { loads: true, reactions: true });
      const all = texts(d).join('\n');
      const F = toUser(f, [10, 20, 30]), M = pseudoToUser(f, [1, 2, 3]);
      const want = [...F.map((v, i) => `F${'xyz'[i]}=${v.toFixed(2)}`), ...M.map((v, i) => `M${'xyz'[i]}=${v.toFixed(2)}`)].join(' ');
      expect(all).toContain(want);
      const m = pseudoToUser(f, [4, 5, 6]);
      expect(all).toContain(`M ${m.map((v) => v.toFixed(2)).join(', ')} kN·m`);
      const u = toUser(f, [1, 0, -2]), r = pseudoToUser(f, [0, 0.01, 0]);
      const parts = [...u.map((v, i) => [`d${'xyz'[i]}`, v, ' mm'] as const), ...r.map((v, i) => [`r${'xyz'[i]}`, v, ' rad'] as const)]
        .filter(([, v]) => v !== 0).map(([k, v, s]) => `${k}=${v.toFixed(2)}${s}`).join(' ');
      expect(all).toContain(parts);
    }
  });

  it('a roller is named in the user axes, and a load layer takes the name the user reads', () => {
    const d = write(Y_UP, 'space', { supports: true, loads: true }, { caseNames: new Map([[1, 'Wind −Z']]) });
    // rollerXY rolls in the model's horizontal plane: X–Z for a Y-up user.
    expect(texts(d)).toContain('ROLLERXZ');
    expect(d).toContain('LOADS_WIND_Z');
    expect(write(undefined, 'space', { supports: true })).toContain('ROLLERXY');
  });
});
