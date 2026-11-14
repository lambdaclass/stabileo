import { describe, it, expect } from 'vitest';
import { modelToCode, codeToModel } from '../format';
import { transformSnapshot } from '../frame';
import { allChoices, makeFrame, pseudoToUser, toUser, type AxesChoice } from '../../../axes/frame';

const YUP: AxesChoice = { up: '+Y', right: '-Z', hand: 'left' };

function spaceSnapshot(): Record<string, any> {
  return {
    name: 'coverage', analysisMode: 'pro',
    materials: [[1, { id: 1, name: 'S', e: 200000, nu: 0.3, rho: 78.5 }]],
    sections: [[1, { id: 1, name: 'R', a: 0.01, iz: 1e-4 }]],
    nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }], [3, { id: 3, x: 4, y: 3 }], [4, { id: 4, x: 0, y: 3, z: 2 }]],
    elements: [[1, {
      id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
      releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false },
      localYx: 0, localYy: 0.6, localYz: 0.8, offset: { frame: 'global', i: { x: 0.1, y: 0.2, z: 0.3 }, j: { x: -0.1, y: 0, z: 0.5 } },
    }], [2, {
      id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1,
      releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false },
      offset: { frame: 'local', i: { x: 0, y: 0.1, z: 0.2 } },
    }]],
    plates: [],
    quads: [[1, { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.2, offset: { frame: 'global', x: 0.05, y: -0.1, z: 0.3 } }]],
    supports: [
      [1, { id: 1, nodeId: 1, type: 'custom3d', dofRestraints: { tx: true, ty: false, tz: true, rx: false, ry: true, rz: false }, kx: 10, ky: 20, kz: 30, krx: 1, kry: 2, krz: 3, curves: { x: [[0.01, 5]], z: [[0.02, 8]] } }],
      [2, { id: 2, nodeId: 2, type: 'inclined3d', isInclined: true, normalX: 0.6, normalY: 0, normalZ: 0.8, dx: 0.001, dz: -0.002, drx: 0.003 }],
    ],
    loadCases: [{ id: 1, type: 'D', name: 'Dead' }],
    combinations: [],
    loads: [
      { type: 'nodal3d', data: { id: 1, nodeId: 3, fx: 1, fy: -2, fz: -10, mx: 0.5, my: 0, mz: 3, caseId: 1 } },
      { type: 'distributed3d', data: { id: 2, elementId: 1, frame: 'global', qXI: 1, qXJ: 2, qYI: 0, qYJ: 0, qZI: -5, qZJ: -6, caseId: 1 } },
      { type: 'pointOnElement3d', data: { id: 3, elementId: 2, a: 1, frame: 'global', px: 2, py: 3, pz: -4, mx: 1, my: 0, mz: 0, caseId: 1 } },
      { type: 'displacement3d', data: { id: 4, nodeId: 1, dx: 0.01, drz: 0.002, caseId: 1 } },
      { type: 'surface3d', data: {
        id: 5, quadId: 1, q: 3, frame: 'global', dir: [0, 0, -1],
        vary: { dir: [0, 1, 0], c1: 0, q1: 1, c2: 3, q2: 2 },
        region: { normal: [0, 0, 1], points: [[0, 0, 0], [2, 0, 0], [2, 2, 0]], holes: [[[0.5, 0.5, 0], [1, 0.5, 0], [1, 1, 0]]] },
        caseId: 1,
      } },
      { type: 'surface3d', data: { id: 6, quadId: 1, q: 2, caseId: 1 } },
      { type: 'distributed3d', data: { id: 7, elementId: 2, qYI: 1, qYJ: 1, qZI: -2, qZJ: -2, caseId: 1 } },
    ],
    constraints: [
      { type: 'rigidLink', masterNode: 1, slaveNode: 2, dofs: [0, 4] },
      { type: 'equalDOF', masterNode: 1, slaveNode: 3, dofs: [1, 5] },
      { type: 'linearMPC', terms: [{ nodeId: 1, dof: 2, coefficient: 1 }, { nodeId: 2, dof: 3, coefficient: -2 }] },
      { type: 'diaphragm', masterNode: 1, slaveNodes: [2, 3], plane: 'XY' },
      { type: 'eccentricConnection', masterNode: 2, slaveNode: 3, offsetX: 0.1, offsetY: 0.2, offsetZ: 0.3, releases: [false, true, false, false, false, true] },
    ],
  };
}

const strip = (o: unknown) => JSON.parse(JSON.stringify(o));

describe('model code carries every global direction in the user axes', () => {
  it('round-trips loads, supports, members, shells and constraints in all 48 frames', () => {
    const snap = spaceSnapshot();
    for (const c of allChoices()) {
      const back = transformSnapshot(transformSnapshot(strip(snap), c, 'toUser'), c, 'toModel');
      for (const k of ['nodes', 'elements', 'quads', 'supports', 'loads', 'constraints']) {
        expect(back[k], `${k} ${JSON.stringify(c)}`).toEqual(snap[k]);
      }
      const r = codeToModel(modelToCode(strip(snap) as never, c));
      expect(r.errors).toEqual([]);
      const s = r.snapshot as Record<string, any>;
      expect(s.loads, JSON.stringify(c)).toEqual(snap.loads);
      expect(s.constraints, JSON.stringify(c)).toEqual(snap.constraints);
      expect(s.supports, JSON.stringify(c)).toEqual(snap.supports);
      expect(s.quads, JSON.stringify(c)).toEqual(snap.quads);
    }
  });

  it('writes the surface load direction, its range and its region in the user axes', () => {
    const f = makeFrame(YUP);
    const u = transformSnapshot(spaceSnapshot(), YUP, 'toUser');
    const sl = u.loads.find((l: any) => l.data.id === 5).data;
    expect(sl.dir).toEqual(toUser(f, [0, 0, -1]).map((x) => x + 0));
    expect(sl.dir).toEqual([0, -1, 0]);
    expect(sl.vary.dir).toEqual(toUser(f, [0, 1, 0]).map((x) => x + 0));
    expect(sl.vary.c1).toBe(0);
    expect(sl.region.normal).toEqual([0, 1, 0]);
    expect(sl.region.points[1]).toEqual(toUser(f, [2, 0, 0]).map((x) => x + 0));
    expect(sl.region.holes[0][2]).toEqual(toUser(f, [1, 1, 0]).map((x) => x + 0));
    const gravity = u.loads.find((l: any) => l.data.id === 6).data;
    expect(gravity.dir).toBeUndefined();
    const local = u.loads.find((l: any) => l.data.id === 7).data;
    expect(local).toEqual({ id: 7, elementId: 2, qYI: 1, qYJ: 1, qZI: -2, qZJ: -2, caseId: 1 });
  });

  it('writes a member orientation vector and global offsets in the user axes and leaves local offsets', () => {
    const f = makeFrame(YUP);
    const u = transformSnapshot(spaceSnapshot(), YUP, 'toUser');
    const [, e1] = u.elements[0];
    expect([e1.localYx, e1.localYy, e1.localYz]).toEqual(toUser(f, [0, 0.6, 0.8]).map((x) => x + 0));
    expect([e1.offset.i.x, e1.offset.i.y, e1.offset.i.z]).toEqual(toUser(f, [0.1, 0.2, 0.3]).map((x) => x + 0));
    const [, e2] = u.elements[1];
    expect(e2.offset).toEqual({ frame: 'local', i: { x: 0, y: 0.1, z: 0.2 } });
    const [, q] = u.quads[0];
    expect([q.offset.x, q.offset.y, q.offset.z]).toEqual(toUser(f, [0.05, -0.1, 0.3]).map((x) => x + 0));
  });

  it('names constraint directions by the user axes: indices, signs and the diaphragm plane', () => {
    const f = makeFrame(YUP);
    const u = transformSnapshot(spaceSnapshot(), YUP, 'toUser');
    const [rigid, equal, mpc, dia, ecc] = u.constraints;
    expect(dia.plane).toBe('XZ');
    const userIndexOf = (modelAxis: number) => f.rows.findIndex((r) => r[modelAxis] !== 0);
    expect(rigid.dofs).toEqual([userIndexOf(0), 3 + userIndexOf(1)]);
    expect(equal.dofs).toEqual([userIndexOf(1), 3 + userIndexOf(2)]);
    const signOf = (modelAxis: number) => f.rows[userIndexOf(modelAxis)][modelAxis];
    expect(mpc.terms[0]).toEqual({ nodeId: 1, dof: userIndexOf(2), coefficient: signOf(2) });
    expect(mpc.terms[1]).toEqual({ nodeId: 2, dof: 3 + userIndexOf(0), coefficient: -2 * signOf(0) * f.det });
    expect([ecc.offsetX, ecc.offsetY, ecc.offsetZ]).toEqual(toUser(f, [0.1, 0.2, 0.3]).map((x) => x + 0));
    const rel = [false, true, false, false, false, true];
    for (let d = 0; d < 6; d++) expect(ecc.releases[(d >= 3 ? 3 : 0) + userIndexOf(d % 3)]).toBe(rel[d]);
  });

  it('permutes a support\'s nonlinear springs with its axes', () => {
    const u = transformSnapshot(spaceSnapshot(), YUP, 'toUser');
    const [, sp] = u.supports[0];
    expect(sp.curves).toEqual({ z: [[0.01, 5]], y: [[0.02, 8]] });
  });

  it('turns the in-plane couple and the global magnitude and angle of plane member loads with the plane', () => {
    const plane = {
      analysisMode: '2d',
      nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 5, y: 0 }]],
      elements: [], supports: [],
      loads: [
        { type: 'pointOnElement', data: { id: 1, elementId: 1, a: 2, p: -10, angle: 30, isGlobal: true, my: 4 } },
        { type: 'distributed', data: { id: 2, elementId: 1, qI: -3, qJ: -3, angle: 15, isGlobal: true } },
      ],
    };
    const mirrored: AxesChoice = { up: '+Z', right: '-X', hand: 'right' };
    const f = makeFrame(mirrored);
    const u = transformSnapshot(strip(plane), mirrored, 'toUser');
    expect(u.loads[0].data).toEqual({ id: 1, elementId: 1, a: 2, p: -10, angle: -30, isGlobal: true, my: pseudoToUser(f, [0, 4, 0])[1] + 0 });
    expect(u.loads[1].data).toEqual({ ...plane.loads[1].data, angle: -15 });
    for (const c of allChoices()) {
      expect(transformSnapshot(transformSnapshot(strip(plane), c, 'toUser'), c, 'toModel').loads).toEqual(plane.loads);
    }
  });
});
