import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import type { Support, SupportType } from '../../store/model.svelte';
import { supportDofs3D } from '../support-dofs-3d';
import { imposedUnsupported } from '../case-displacements';
import { buildSolverInput3D, imposedRefusal, linearSolveInput3D, solveCombinations3D, solveCombinations3DParallel, validateAndSolve2D, validateAndSolve3D, validateAndSolve3DAsync } from '../solver-service';
import { hasNonlinearBehaviour } from '../member-behaviour';
import { addSupportFromTool3D } from '../../store/support-tool-3d';

const keys = ['rx', 'ry', 'rz', 'rrx', 'rry', 'rrz'] as const;
const bits = (s: ReturnType<typeof supportDofs3D>) => keys.map(k => s[k]);
const support = (type: SupportType): Support => ({ id: 2, nodeId: 3, type });
const masks = {
  fixed: [true, true, true, true, true, true],
  pinned: [true, true, true, true, true, false],
  rollerX: [false, true, true, true, true, false],
  guidedZ: [true, true, false, true, true, true],
  guidedX: [false, true, true, true, true, true],
  rollerY: [true, false, true, true, true, false],
  rollerZ: 'ambiguous',
  spring: [false, false, false, false, false, false],
  fixed3d: [true, true, true, true, true, true],
  pinned3d: [true, true, true, false, false, false],
  rollerXZ: [false, true, false, false, false, false],
  rollerXY: [false, false, true, false, false, false],
  rollerYZ: [true, false, false, false, false, false],
  spring3d: [false, false, false, false, false, false],
  custom3d: 'explicit-only',
} satisfies Record<SupportType, readonly boolean[] | 'ambiguous' | 'explicit-only'>;
const bearing = { tx: true, ty: false, tz: true, rx: true, ry: false, rz: false };

beforeEach(() => { uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = true; modelStore.clear(); });

it('#2276 every unambiguous inventoried name retains its defined mask', () => {
  for (const [type, mask] of Object.entries(masks)) {
    if (typeof mask === 'string') continue;
    expect(bits(supportDofs3D(support(type as SupportType))), type).toEqual(mask);
  }
});

it('known wrong result: #2276 every inventoried name has explicit 3D semantics or a refusal', () => {
  for (const type of Object.keys(masks) as SupportType[]) {
    if (type === 'rollerZ') expect(() => supportDofs3D(support(type))).toThrow(/rollerZ.*ambiguous.*explicit/i);
    else if (type !== 'custom3d') expect(bits(supportDofs3D(support(type)))).toEqual(masks[type]);
  }
});

it('known wrong result: #2276 unknown support names never acquire fixed restraints in either projection', () => {
  for (const type of ['unrecognised-bearing', '', 'constructor', '__proto__', undefined, null]) {
    for (const project of [false, true]) {
      for (const explicit of [false, true]) {
        const s = { ...support(type as SupportType), ...(explicit ? { dofRestraints: bearing } : {}) };
        expect(() => supportDofs3D(s, project)).toThrow(/unknown support type/i);
      }
    }
  }
});

it('known wrong result: #2276 explicit restraints resolve a legacy roller without guessing its name', () => {
  expect(bits(supportDofs3D({ ...support('rollerZ'), dofRestraints: bearing }))).toEqual([true, false, true, true, false, false]);
});

it('#2276 both sides of the 2D projection retain the declared vertical slider', () => {
  for (const type of ['rollerY', 'rollerZ'] as const) {
    expect(bits(supportDofs3D(support(type), true))).toEqual([true, true, false, true, false, true]);
  }
});

it('known wrong result: #2276 imposed displacements cannot use invented fixed DOFs', () => {
  const loads = [{ type: 'displacement3d' as const, data: { id: 1, nodeId: 3, dry: 1 } }];
  for (const type of ['rollerZ', 'unrecognised-bearing']) {
    expect(() => imposedUnsupported(new Map([[2, support(type as SupportType)]]), loads)).toThrow(new RegExp(type));
  }
});

for (const type of ['rollerZ', 'unrecognised-bearing']) {
  for (const nonlinear of [false, true]) {
    for (const entry of ['input', 'sync', 'async', 'combinations', 'parallel'] as const) {
      it(`known wrong result: #2276 ${type} refuses at ${entry} nonlinear=${nonlinear}`, async () => {
        await modelStore.loadExample('rc-beam-flexure');
        const s = [...modelStore.supports.values()].find(s => s.nodeId === 3)!;
        modelStore.model.supports.set(s.id, { ...s, type: type as SupportType, dofRestraints: undefined });
        if (nonlinear) {
          const first = [...modelStore.supports.values()].find(s => s.nodeId === 1)!;
          modelStore.model.supports.set(first.id, { ...first, uplift: true });
        }
        expect(hasNonlinearBehaviour(modelStore.model)).toBe(nonlinear);
        if (entry === 'input') {
          expect(() => buildSolverInput3D(modelStore.model)).toThrow(new RegExp(type));
          return;
        }
        const m = modelStore.model;
        const result = entry === 'sync' ? validateAndSolve3D(m)
          : entry === 'async' ? await validateAndSolve3DAsync(m)
          : entry === 'combinations' ? solveCombinations3D(m, m.loadCases!, m.combinations!)
          : await solveCombinations3DParallel(m, m.loadCases!, m.combinations!);
        expect(typeof result).toBe('string');
        expect(result).toMatch(new RegExp(type));
      });
    }
  }
}

it('known wrong result: #2276 rc-beam-flexure retains the simply supported hand solution in PRO', async () => {
  await modelStore.loadExample('rc-beam-flexure');
  const m = modelStore.model;
  const L = m.nodes.get(3)!.x - m.nodes.get(1)!.x;
  const e = m.elements.get(1)!;
  const weight = m.materials.get(e.materialId)!.rho * m.sections.get(e.sectionId)!.a;
  const selfWeight = (m.analysis?.selfWeight ?? []).reduce((sum, row) => {
    expect(row.direction).toBe('Z');
    expect(row.elements).toBeUndefined();
    expect(row.groupId).toBeUndefined();
    return sum - row.factor * weight;
  }, 0);
  const w = selfWeight - m.loads.filter(l => l.type === 'distributed3d' && l.data.elementId === 1)
    .reduce((sum, l) => sum + (l.data as { qZI: number }).qZI, 0);
  const r = validateAndSolve3D(m);
  expect(r).toBeTruthy();
  if (!r || typeof r === 'string') throw new Error(String(r));
  const end = r.elementForces.find(f => f.elementId === 2)!;
  console.log(JSON.stringify({ rollerReaction: r.reactions.find(r => r.nodeId === 3), end }));
  expect(end.myEnd).toBeCloseTo(0, 9);
  expect(r.elementForces.find(f => f.elementId === 1)!.myStart).toBeCloseTo(0, 9);
  for (const nodeId of [1, 3]) {
    const reaction = r.reactions.find(r => r.nodeId === nodeId)!;
    expect(reaction.fz).toBeCloseTo(w * L / 2, 9);
    expect(reaction.my).toBeCloseTo(0, 9);
  }
  expect(Math.abs(end.myStart)).toBeCloseTo(w * L ** 2 / 8, 9);
});

it('#2276 the current 3D viewport tool keeps a non-x sliding direction explicit', () => {
  const n = modelStore.addNode(0, 0, 0);
  uiStore.sup3dTx = true; uiStore.sup3dTy = false; uiStore.sup3dTz = true;
  uiStore.sup3dRx = true; uiStore.sup3dRy = false; uiStore.sup3dRz = false;
  uiStore.sup3dKx = 0; uiStore.sup3dKy = 0; uiStore.sup3dKz = 0;
  uiStore.sup3dKrx = 0; uiStore.sup3dKry = 0; uiStore.sup3dKrz = 0;
  const id = addSupportFromTool3D(n);
  const s = modelStore.supports.get(id)!;
  expect(s.dofRestraints).toEqual(bearing);
  const b = modelStore.addNode(1, 0, 0);
  modelStore.addElement(n, b, 'frame');
  expect(bits(buildSolverInput3D(modelStore.model)!.supports.get(n)!)).toEqual([true, false, true, true, false, false]);
});

it('#2276 a 2D vertical slider still solves its plane and embedded models', async () => {
  await modelStore.loadExample('rc-beam-flexure');
  const base = modelStore.model;
  const L = base.nodes.get(3)!.x - base.nodes.get(1)!.x;
  const P = L;
  const m = { ...base,
    nodes: new Map([...base.nodes].map(([id, n]) => [id, { ...n, x: 0, y: n.x, z: 0 }])),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' as const }], [2, support('rollerZ')]]),
    loads: [{ type: 'nodal' as const, data: { id: 1, nodeId: 2, fx: P, fz: 0, my: 0 } }],
    loadCases: [], combinations: [],
  };
  const r2 = validateAndSolve2D(m);
  if (!r2 || typeof r2 === 'string') throw new Error(String(r2));
  const r3 = validateAndSolve3D(m);
  if (!r3 || typeof r3 === 'string') throw new Error(String(r3));
  for (const nodeId of [1, 3]) {
    expect(r2.reactions.find(r => r.nodeId === nodeId)!.rx).toBeCloseTo(-P / 2, 9);
    expect(r3.reactions.find(r => r.nodeId === nodeId)!.fx).toBeCloseTo(-P / 2, 9);
  }
});

const missingCustomMask = /custom support without restraints; set them explicitly/i;

it('#2276 custom3d has no implicit restraints in either projection', () => {
  for (const projection of [false, true]) {
    expect(() => supportDofs3D(support('custom3d'), projection)).toThrow(missingCustomMask);
  }
});

it('#2276 explicit custom restraints are authoritative in either projection', () => {
  const free = { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false };
  for (const projection of [false, true]) {
    for (const mask of [bearing, free]) {
      expect(bits(supportDofs3D({ ...support('custom3d'), dofRestraints: mask }, projection)))
        .toEqual([mask.tx, mask.ty, mask.tz, mask.rx, mask.ry, mask.rz]);
    }
  }
});

for (const nonlinear of [false, true]) {
  for (const entry of ['input', 'linear input', 'imposed displacement', 'sync', 'async', 'combinations', 'parallel'] as const) {
    if (nonlinear && entry === 'linear input') continue;
    it(`#2276 unmasked custom3d refuses at ${entry} nonlinear=${nonlinear}`, async () => {
      await modelStore.loadExample('rc-beam-flexure');
      const m = modelStore.model;
      const s = [...m.supports.values()].find(s => s.nodeId === 3)!;
      m.supports.set(s.id, { ...s, type: 'custom3d', dofRestraints: undefined });
      if (nonlinear) {
        const first = [...m.supports.values()].find(s => s.nodeId === 1)!;
        m.supports.set(first.id, { ...first, uplift: true });
      }
      expect(hasNonlinearBehaviour(m)).toBe(nonlinear);
      if (entry === 'input') {
        expect(() => buildSolverInput3D(m)).toThrow(missingCustomMask);
        return;
      }
      if (entry === 'linear input') {
        expect(linearSolveInput3D(m)).toBeNull();
        return;
      }
      const result = entry === 'imposed displacement'
        ? imposedRefusal({ ...m, loads: [{ type: 'displacement3d', data: { id: 1, nodeId: s.nodeId, dz: 1 } }] })
        : entry === 'sync' ? validateAndSolve3D(m, true)
        : entry === 'async' ? await validateAndSolve3DAsync(m, true)
        : entry === 'combinations' ? solveCombinations3D(m, m.loadCases!, m.combinations!)
        : await solveCombinations3DParallel(m, m.loadCases!, m.combinations!);
      expect(typeof result).toBe('string');
      expect(result).toMatch(missingCustomMask);
    });
  }

  it(`#2276 masked custom3d keeps the beam's explicit bearing result nonlinear=${nonlinear}`, async () => {
    await modelStore.loadExample('rc-beam-flexure');
    const m = modelStore.model;
    if (nonlinear) {
      const first = [...m.supports.values()].find(s => s.nodeId === 1)!;
      m.supports.set(first.id, { ...first, uplift: true });
    }
    const r0 = validateAndSolve3D(m, true);
    if (!r0 || typeof r0 === 'string') throw new Error(String(r0));
    const s = [...m.supports.values()].find(s => s.nodeId === 3)!;
    expect(s.dofRestraints).toBeDefined();
    m.supports.set(s.id, { ...s, type: 'custom3d' });
    const r1 = validateAndSolve3D(m, true);
    if (!r1 || typeof r1 === 'string') throw new Error(String(r1));
    expect(r1.reactions).toEqual(r0.reactions);
    expect(r1.elementForces).toEqual(r0.elementForces);
  });
}

it('#2276 a genuine 2D solve refuses a spatial custom support name', () => {
  const a = modelStore.addNode(0, 0);
  const b = modelStore.addNode(2, 0);
  modelStore.addElement(a, b);
  modelStore.addSupportEntry({ nodeId: a, type: 'fixed' });
  modelStore.addSupportEntry({ nodeId: b, type: 'custom3d' });
  modelStore.addNodalLoad(b, 1, 0);
  expect(validateAndSolve2D(modelStore.model)).toMatch(/unknown type 'custom3d'/i);
});
