import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import type { Support, SupportType } from '../../store/model.svelte';
import { supportDofs3D } from '../support-dofs-3d';
import { imposedUnsupported } from '../case-displacements';
import { buildSolverInput3D, solveCombinations3D, solveCombinations3DParallel, validateAndSolve2D, validateAndSolve3D, validateAndSolve3DAsync } from '../solver-service';
import { hasNonlinearBehaviour } from '../member-behaviour';
import { addSupportFromTool3D } from '../../store/support-tool-3d';

const regression = process.env.RUN_KNOWN_WRONG === '2276' ? it : it.skip;
const keys = ['rx', 'ry', 'rz', 'rrx', 'rry', 'rrz'] as const;
const bits = (s: ReturnType<typeof supportDofs3D>) => keys.map(k => s[k]);
const support = (type: SupportType): Support => ({ id: 2, nodeId: 3, type });
const masks = {
  fixed: [true, true, true, true, true, true],
  pinned: [true, true, true, true, true, false],
  rollerX: [false, true, true, true, true, false],
  rollerY: [true, false, true, true, true, false],
  rollerZ: 'ambiguous',
  spring: [false, false, false, false, false, false],
  fixed3d: [true, true, true, true, true, true],
  pinned3d: [true, true, true, false, false, false],
  rollerXZ: [false, true, false, false, false, false],
  rollerXY: [false, false, true, false, false, false],
  rollerYZ: [true, false, false, false, false, false],
  spring3d: [false, false, false, false, false, false],
  custom3d: [true, true, true, true, true, true],
} satisfies Record<SupportType, readonly boolean[] | 'ambiguous'>;
const bearing = { tx: true, ty: false, tz: true, rx: true, ry: false, rz: false };

beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

it('#2276 every unambiguous inventoried name retains its defined mask', () => {
  for (const [type, mask] of Object.entries(masks)) {
    if (mask === 'ambiguous') continue;
    expect(bits(supportDofs3D(support(type as SupportType))), type).toEqual(mask);
  }
});

regression('known wrong result: #2276 every inventoried name has explicit 3D semantics or a refusal', () => {
  for (const type of Object.keys(masks) as SupportType[]) {
    if (type === 'rollerZ') expect(() => supportDofs3D(support(type))).toThrow(/rollerZ.*ambiguous.*explicit/i);
    else expect(bits(supportDofs3D(support(type)))).toEqual(masks[type]);
  }
});

regression('known wrong result: #2276 unknown support names never acquire fixed restraints in either projection', () => {
  for (const type of ['unrecognised-bearing', '', 'constructor', '__proto__', undefined, null]) {
    for (const project of [false, true]) {
      for (const explicit of [false, true]) {
        const s = { ...support(type as SupportType), ...(explicit ? { dofRestraints: bearing } : {}) };
        expect(() => supportDofs3D(s, project)).toThrow(/unknown support type/i);
      }
    }
  }
});

regression('known wrong result: #2276 explicit restraints resolve a legacy roller without guessing its name', () => {
  expect(bits(supportDofs3D({ ...support('rollerZ'), dofRestraints: bearing }))).toEqual([true, false, true, true, false, false]);
});

it('#2276 both sides of the 2D projection retain the declared vertical slider', () => {
  for (const type of ['rollerY', 'rollerZ'] as const) {
    expect(bits(supportDofs3D(support(type), true))).toEqual([true, true, false, true, false, true]);
  }
});

regression('known wrong result: #2276 imposed displacements cannot use invented fixed DOFs', () => {
  const loads = [{ type: 'displacement3d' as const, data: { id: 1, nodeId: 3, dry: 1 } }];
  for (const type of ['rollerZ', 'unrecognised-bearing']) {
    expect(() => imposedUnsupported(new Map([[2, support(type as SupportType)]]), loads)).toThrow(new RegExp(type));
  }
});

for (const type of ['rollerZ', 'unrecognised-bearing']) {
  for (const nonlinear of [false, true]) {
    for (const entry of ['input', 'sync', 'async', 'combinations', 'parallel'] as const) {
      regression(`known wrong result: #2276 ${type} refuses at ${entry} nonlinear=${nonlinear}`, async () => {
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

regression('known wrong result: #2276 rc-beam-flexure retains the simply supported hand solution in PRO', async () => {
  await modelStore.loadExample('rc-beam-flexure');
  const m = modelStore.model;
  const L = m.nodes.get(3)!.x - m.nodes.get(1)!.x;
  const w = -m.loads.filter(l => l.type === 'distributed3d' && l.data.elementId === 1)
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
    loads: [{ type: 'nodal' as const, data: { id: 1, nodeId: 2, fx: P, fy: 0, mz: 0 } }],
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
