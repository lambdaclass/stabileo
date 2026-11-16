import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { axesStore } from '../axes.svelte';
import { along, modelRot, modelVec, userRot, userVec } from '../display';
import {
  axisNamesIn, gravityFactorIn, gravityNameIn, modelDof, modelFlags6, modelPlane, planNamesIn, signedAxisText, signedNamesIn,
  typedFrame, userDof, userDofName, userFlags6, userPlane, userSix, userSlot, verticalCoordIn, verticalNameIn,
} from '../typed-frame';
import { modelStore, type Load } from '../../store/model.svelte';
import '../../store/index';
import { buildWrittenLoads, blankWriteForm, type WriteContext, type WriteForm, type WriteOutcome, type WriteRefusal } from '../../model/loads/write-load';
import { buildShellLoads, type ShellLoadFields } from '../../model/loads/shell-load-form';
import type { ShellRef } from '../../model/loads/shell-load-tools';
import { memberRef3D } from '../../engine/solver-service';
import { constraintLabel } from '../../model/constraint-labels';
import { staticsCsv } from '../../store/statics-rows';
import { supportTypeOptions } from '../../pro/support-types';
import type { SurfaceLoad3D } from '../../store/model.svelte';

const ODD = { up: '+Y', right: '-Z', hand: 'left' } as const;

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); });
afterEach(() => { axesStore.reset(); });

const ctx = (ids: number[], toModel = typedFrame): WriteContext => ({
  caseId: 1, ids, chain: false,
  node: (id) => modelStore.nodes.get(id),
  element: (id) => modelStore.elements.get(id),
  axes: (id) => memberRef3D(modelStore.model as never, id)?.axes ?? null,
  length: (id) => modelStore.getElementLength(id),
  toModel,
});
const form = (kind: WriteForm['kind'], patch: (f: WriteForm) => void): WriteForm => { const f = blankWriteForm(kind); patch(f); return f; };
const loadsOf = (r: WriteOutcome | WriteRefusal): Load[] => { if ('error' in r) throw new Error(r.error); return r.loads; };
const data = (l: Load) => l.data as unknown as Record<string, number | undefined>;

describe('the frame used by these checks', () => {
  it('is user X = model Y, user Y = model Z (up), user Z = −model X, left-handed', () => {
    axesStore.choice = ODD;
    expect(userVec(1, 2, 3)).toEqual([2, 3, -1]);
    expect(userRot(1, 2, 3)).toEqual([-2, -3, 1]);
    expect(along(0)).toEqual({ name: 'Z', sign: -1 });
    expect(axesStore.frame.det).toBe(-1);
  });
});

describe('the Add load card types global values in the user frame and stores them canonical', () => {
  it('a nodal force and moment: converted, and shown back as typed', () => {
    axesStore.choice = ODD;
    const n = modelStore.addNode(0, 0, 0);
    const [l] = loadsOf(buildWrittenLoads(form('nodal', (f) => { Object.assign(f.f, { fx: 1, fy: 2, fz: 3, mx: 4, my: 5, mz: 6 }); }), ctx([n])));
    const d = data(l!);
    expect([d.fx, d.fy, d.fz]).toEqual(modelVec(1, 2, 3));
    expect([d.mx, d.my, d.mz]).toEqual(modelRot(4, 5, 6));
    expect(userVec(d.fx!, d.fy!, d.fz!)).toEqual([1, 2, 3]);
    expect(userRot(d.mx!, d.my!, d.mz!)).toEqual([4, 5, 6]);
  });

  it('under the default frame the card writes exactly what the model frame writes', () => {
    const n = modelStore.addNode(0, 0, 0);
    const f = form('nodal', (x) => { Object.assign(x.f, { fx: 1, fy: -2, fz: 3, mx: 0.5 }); });
    expect(loadsOf(buildWrittenLoads(f, ctx([n])))).toEqual(loadsOf(buildWrittenLoads(f, { ...ctx([n]), toModel: undefined })));
  });

  it('an imposed displacement keeps the directions left blank free', () => {
    axesStore.choice = ODD;
    const n = modelStore.addNode(0, 0, 0);
    const [l] = loadsOf(buildWrittenLoads(form('displacement', (f) => { f.u.dz = 0.01; f.u.drx = 0.002; }), ctx([n])));
    expect(l!.data).toMatchObject({ dx: -0.01, dry: -0.002 });
    expect(Object.keys(l!.data).filter((k) => /^d/.test(k)).sort()).toEqual(['dry', 'dx']);
  });

  it('a global distributed load, a global peak and a global point load', () => {
    axesStore.choice = ODD;
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 4, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const [q] = loadsOf(buildWrittenLoads(form('distributed', (f) => { f.frame = 'global'; f.q.yI = -10; f.q.zI = 3; }), ctx([e])));
    expect(data(q!)).toMatchObject({ qZI: -10, qZJ: -10, qXI: -3, qXJ: -3, qYI: 0, qYJ: 0 });
    const tri = loadsOf(buildWrittenLoads(form('distributed', (f) => { f.frame = 'global'; f.shape = 'triangle'; f.peak = 6; f.peakComp = 'z'; }), ctx([e])));
    expect(tri.every((l) => (data(l).qXI ?? 0) <= 0 && (data(l).qXJ ?? 0) <= 0 && Math.min(data(l).qXI ?? 0, data(l).qXJ ?? 0) === -6)).toBe(true);
    const local = loadsOf(buildWrittenLoads(form('distributed', (f) => { f.q.yI = -10; }), ctx([e])));
    expect(data(local[0]!)).toMatchObject({ qYI: -10 });
    const [p] = loadsOf(buildWrittenLoads(form('point', (f) => { f.pFrame = 'global'; f.p.py = -5; f.p.px = 2; f.p.mz = 1; }), ctx([e])));
    expect(data(p!)).toMatchObject({ py: 2, pz: -5, mx: 1, frame: 'global' });
  });

  it('a hydrostatic load along a user axis that runs against the model axis swaps its ends', () => {
    axesStore.choice = ODD;
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const [l] = loadsOf(buildWrittenLoads(form('distributed', (f) => { f.shape = 'hydrostatic'; f.hydroAxis = 'Z'; f.w1 = 0; f.w2 = 8; f.hydroComp = 'y'; f.frame = 'global'; }), ctx([e])));
    expect(data(l!)).toMatchObject({ qZI: 8, qZJ: 0 });
  });

  it('an inclined force from a typed point reads the point in the user frame', () => {
    axesStore.choice = ODD;
    const n = modelStore.addNode(0, 0, 0);
    const [l] = loadsOf(buildWrittenLoads(form('nodal', (f) => { f.inclined = true; f.incF = 10; f.incFromKind = 'point'; f.incFrom = { x: null, y: 5, z: null }; }), ctx([n])));
    expect(userVec(data(l!).fx!, data(l!).fy!, data(l!).fz!).map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([0, -10, 0]);
  });
});

describe('the slab form types its directions, points and region in the user frame', () => {
  const P = (x: number, y: number, z = 0) => ({ x, y, z });
  const wall: ShellRef = { id: 1, pts: [P(0, 0, 0), P(4, 0, 0), P(4, 0, 3), P(0, 0, 3)], nodes: [1, 2, 3, 4] };
  const f = (edit: (x: ShellLoadFields) => void): ShellLoadFields => {
    const x: ShellLoadFields = {
      dirMode: 'down', dirAxis: 'Z', field: 'uniform', q: 2, qc: '',
      va: { axis: 'Z', c1: null, q1: null, c2: null, q2: null }, partial: false,
      rect: { plane: 'XY', u1: null, v1: null, u2: null, v2: null },
      gamma: 10, level: null, inside: { x: null, y: null, z: null },
      at: { x: null, y: null, z: null }, pf: { fx: null, fy: null, fz: null },
    };
    edit(x);
    return x;
  };
  it('a global direction, a variation and a partial rectangle', () => {
    axesStore.choice = ODD;
    const [l] = loadsOf(buildShellLoads('surface', f((x) => { x.dirMode = 'global'; x.dirAxis = 'Z'; x.field = 'axis'; x.va = { axis: 'Y', c1: 0, q1: 1, c2: 3, q2: 2 }; x.partial = true; x.rect = { plane: 'XY', u1: 0, v1: 0, u2: 1, v2: 1 }; }), [wall], 1, undefined, typedFrame.vec));
    const d = l!.data as SurfaceLoad3D;
    expect(d.dir).toEqual([-1, 0, 0]);
    expect(d.vary!.dir).toEqual([0, 0, 1]);
    expect(d.region!.normal).toEqual([-1, 0, 0]);
    expect(d.region!.points[2]).toEqual([0, 1, 1]);
  });
  it('a force at a point', () => {
    axesStore.choice = ODD;
    const flat: ShellRef = { id: 1, pts: [P(0, 0), P(4, 0), P(4, 4), P(0, 4)], nodes: [1, 2, 3, 4] };
    const loads = loadsOf(buildShellLoads('shellPoint', f((x) => { x.at = { x: 2, y: 0, z: -2 }; x.pf = { fx: null, fy: -10, fz: null }; }), [flat], 1, undefined, typedFrame.vec));
    const fz = loads.reduce((s, l) => s + data(l).fz!, 0);
    expect(fz).toBeCloseTo(-10, 9);
    expect(loads.every((l) => data(l).fy === 0 && data(l).fx === 0)).toBe(true);
  });
});

describe('global components, DOFs, planes and flags shown and typed back', () => {
  it('a table cell edits the one model key the user component lies on', () => {
    axesStore.choice = ODD;
    const m = [7, 8, 9];
    for (const moment of [false, true]) {
      const shown = moment ? userRot(7, 8, 9) : userVec(7, 8, 9);
      for (const i of [0, 1, 2]) {
        const s = userSlot(i, moment);
        expect(s.sign * m[s.k]!).toBe(shown[i]);
      }
    }
  });
  it('DOF names, constraint planes and flags', () => {
    axesStore.choice = ODD;
    expect(userDofName(0)).toBe('uz');
    expect(userDofName(5)).toBe('ry');
    expect(modelDof('ux')).toEqual({ index: 1, sign: 1 });
    expect(modelDof('rz')).toEqual({ index: 3, sign: 1 });
    expect(userDof('ux', 5)).toEqual({ dof: 'uz', value: -5 });
    expect(userDof('rx', 5)).toEqual({ dof: 'rz', value: 5 });
    for (const p of ['XY', 'XZ', 'YZ'] as const) expect(modelPlane(userPlane(p))).toBe(p);
    expect(userPlane('XY')).toBe('XZ');
    const f = [true, false, false, false, true, false];
    expect(userFlags6(modelFlags6(f))).toEqual(f);
    expect(userSix({ fx: 1, fy: 2, fz: 3, mx: 1, my: 2, mz: 3 })).toEqual({ fx: 2, fy: 3, fz: -1, mx: -2, my: -3, mz: 1 });
  });
  it('a constraint is described in the user names', () => {
    axesStore.choice = ODD;
    const tr = (k: string) => ({ 'pro.constraintEqDof': '{master}-{slave} {dofs}', 'pro.constraintDiaph': '{plane} {master} {n}', 'pro.constraintEcc': '{offset} {releases}' } as Record<string, string>)[k] ?? k;
    expect(constraintLabel({ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0, 2] }, tr)).toBe('1-2 uz,uy');
    expect(constraintLabel({ type: 'diaphragm', masterNode: 1, slaveNodes: [2], plane: 'XY' }, tr)).toBe('XZ 1 1');
    expect(constraintLabel({ type: 'eccentricConnection', offsetX: 1, offsetY: 0, offsetZ: 2, releases: [true, false, false, false, false, false] }, tr)).toBe('(0, 2, -1) uz');
  });
  it('the statics CSV is written in the user components', () => {
    axesStore.choice = ODD;
    const six = { fx: 1, fy: 2, fz: 3, mx: 0, my: 0, mz: 0 };
    const csv = staticsCsv({ cases: [{ caseId: 1, caseName: 'D', applied: six, reactions: six, difference: six, worstRelative: 0 } as never], combos: [] },
      { name: 'n', kind: 'k', caseLabel: 'c', comboLabel: 'co', applied: 'A', reactions: 'R', residual: 'r', relative: 'rel' });
    expect(csv.split('\n')[1]).toMatch(/^c[,;]D[,;]2[,;]3[,;]-1[,;]/);
  });
});

describe('texts that name a global axis', () => {
  it('follow the frame, and read as before under the default one', () => {
    expect(planNamesIn('Grid lines along Y (constant x)')).toBe('Grid lines along Y (constant x)');
    expect(gravityNameIn('Downward (−Z), true area')).toBe('Downward (−Z), true area');
    axesStore.choice = ODD;
    expect(planNamesIn('Grid lines along Y (constant x)')).toBe('Grid lines along X (constant z)');
    expect(planNamesIn('Ejes a lo largo de X (y constante)')).toBe('Ejes a lo largo de Z (x constante)');
    expect(axisNamesIn('By X, then Y, then Z')).toBe('By Z, then X, then Y');
    expect(gravityNameIn('Downward (−Z), true area')).toBe('Downward (−Y), true area');
    expect(verticalNameIn('Fluid level Z')).toBe('Fluid level Y');
    expect(verticalCoordIn('p = γ·(level − z) normal')).toBe('p = γ·(level − y) normal');
    expect(gravityFactorIn('the factor (−1 in Z is gravity)')).toBe('the factor (−1 in Y is gravity)');
    expect(signedAxisText('+X')).toBe('−Z');
    expect(signedNamesIn('try +X, −X, +Y and −Y')).toBe('try −Z, +Z, +X and −X');
    axesStore.choice = { up: '-Y', right: '+X', hand: 'right' };
    expect(gravityFactorIn('the factor (−1 in Z is gravity)')).toBe('the factor (+1 in Y is gravity)');
  });
  it('the support types', () => {
    const tr = (k: string) => ({ 'pro.rollerXZ': 'Roller XZ', 'pro.rollerX': 'Roller X', 'pro.rollerY': 'Roller Y' } as Record<string, string>)[k] ?? k;
    expect(supportTypeOptions(true, tr).find((o) => o.value === 'rollerXZ')!.label).toBe('Roller XZ');
    axesStore.choice = ODD;
    expect(supportTypeOptions(true, tr).find((o) => o.value === 'rollerXZ')!.label).toBe('Roller YZ');
    expect(supportTypeOptions(false, tr).find((o) => o.value === 'rollerZ')!.label).toBe('Roller Y');
    expect(supportTypeOptions(false, tr).find((o) => o.value === 'rollerX')!.label).toBe('Roller Z');
  });
});
