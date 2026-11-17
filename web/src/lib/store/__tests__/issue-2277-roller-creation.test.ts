import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '..';
import type { Support, SupportType } from '../model.svelte';
import { supportDofs3D } from '../../engine/support-dofs-3d';
import { buildSolverInput3D, solveCombinations3D, solveCombinations3DParallel, validateAndSolve3D, validateAndSolve3DAsync } from '../../engine/solver-service';
import { hasNonlinearBehaviour } from '../../engine/member-behaviour';

const masks = {
  rollerX: { tx: false, ty: true, tz: true, rx: true, ry: true, rz: false },
  rollerY: { tx: true, ty: false, tz: true, rx: true, ry: true, rz: false },
  rollerXY: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false },
  rollerXZ: { tx: false, ty: true, tz: false, rx: false, ry: false, rz: false },
  rollerYZ: { tx: true, ty: false, tz: false, rx: false, ry: false, rz: false },
} as const satisfies Record<Exclude<Extract<SupportType, `roller${string}`>, 'rollerZ'>, NonNullable<Support['dofRestraints']>>;
const paths = ['single', 'bulk', 'edit'] as const;

beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

for (const mode of ['3d', 'pro'] as const) {
  for (const path of paths) {
    for (const type of Object.keys(masks) as Array<keyof typeof masks>) {
      it(`#2277 ${mode} ${path} creates explicit ${type} restraints`, () => {
        uiStore.analysisMode = mode;
        const nodeId = modelStore.addNode(0, 0, 0);
        const id = path === 'single' ? modelStore.addSupport(nodeId, type)
          : path === 'bulk' ? modelStore.addSupports([nodeId], type)[0]!
          : modelStore.addSupport(nodeId, 'fixed3d');
        if (path === 'edit') modelStore.updateSupport(id, { type });
        const s = modelStore.supports.get(id)!;
        expect(s.dofRestraints).toEqual(masks[type]);
        expect(s.type).toBe(type);
        expect(s.dofFrame).toBe('global');
        expect(() => supportDofs3D(s)).not.toThrow();
      });
    }
  }
}

it('#2277 changing a roller direction replaces the previous mask', () => {
  const node = modelStore.addNode(0, 0, 0);
  const id = modelStore.addSupport(node, 'rollerX', undefined, { dofRestraints: masks.rollerX });
  modelStore.updateSupport(id, { type: 'rollerY' });
  expect(modelStore.supports.get(id)!.dofRestraints).toEqual(masks.rollerY);
});

it('#2277 an explicit mask takes precedence over the ambiguous stored name and survives field edits', () => {
  const mask = { tx: true, ty: true, tz: false, rx: false, ry: false, rz: true };
  const node = modelStore.addNode(0, 0, 0);
  const id = modelStore.addSupport(node, 'rollerZ', undefined, { dofRestraints: mask });
  modelStore.updateSupport(id, { dx: 1 });
  expect(modelStore.supports.get(id)!.dofRestraints).toEqual(mask);
  expect(supportDofs3D(modelStore.supports.get(id)!)).toEqual({ rx: true, ry: true, rz: false, rrx: false, rry: false, rrz: true });
});

it('#2277 a saved bare rollerZ stays ambiguous until its type or restraints are explicitly edited', () => {
  const nodeId = modelStore.addNode(0, 0, 0);
  modelStore.model.supports.set(1, { id: 1, nodeId, type: 'rollerZ' });
  modelStore.updateSupport(1, { dx: 1 });
  expect(() => supportDofs3D(modelStore.supports.get(1)!)).toThrow(/ambiguous/);
});

it('#2277 plane creation retains its unmasked vertical roller', () => {
  uiStore.analysisMode = '2d';
  for (const type of ['rollerY', 'rollerZ'] as SupportType[]) {
    const node = modelStore.addNode(0, 0, 0);
    const s = modelStore.supports.get(modelStore.addSupport(node, type))!;
    expect(s.type).toBe('rollerZ');
    expect(s.dofRestraints).toBeUndefined();
    expect(supportDofs3D(s, true)).toEqual({ rx: true, ry: true, rz: false, rrx: true, rry: false, rrz: true });
  }
});

for (const nonlinear of [false, true]) {
  for (const entry of ['input', 'sync', 'async', 'combinations', 'parallel'] as const) {
    it(`#2277 newly selected Y roller solves nonlinear=${nonlinear} entry=${entry}`, async () => {
      await modelStore.loadExample('rc-beam-flexure');
      const left = modelStore.addSupport(1, 'fixed3d');
      modelStore.addSupport(3, 'rollerY');
      if (nonlinear) modelStore.updateSupport(left, { uplift: true });
      const m = modelStore.model;
      expect(hasNonlinearBehaviour(m)).toBe(nonlinear);
      expect(buildSolverInput3D(m)!.supports.get(3)).toMatchObject({ rx: true, ry: false, rz: true, rrx: true, rry: true, rrz: false });
      if (entry === 'input') return;
      const result = entry === 'sync' ? validateAndSolve3D(m)
        : entry === 'async' ? await validateAndSolve3DAsync(m)
        : entry === 'combinations' ? solveCombinations3D(m, m.loadCases!, m.combinations!)
        : await solveCombinations3DParallel(m, m.loadCases!, m.combinations!);
      if (!result || typeof result === 'string') throw new Error(String(result));
      const solved = 'perCase' in result ? [...result.perCase.values(), ...result.perCombo.values()] : [result];
      expect(solved.length).toBeGreaterThan(0);
      for (const r of solved) {
        expect(r.displacements.length).toBe(m.nodes.size);
        expect(r.reactions.every(reaction => Number.isFinite(reaction.fz))).toBe(true);
      }
    });
  }
}

for (const path of paths) {
  it(`#2277 ${path} creates its global roller in the standing model's space coordinates`, async () => {
    uiStore.analysisMode = '2d';
    await modelStore.loadExample('portal-frame');
    const before = [...modelStore.nodes.values()].map(n => ({ ...n }));
    const nodeId = before[0]!.id;
    const original = [...modelStore.supports.values()].find(s => s.nodeId === nodeId)!;
    uiStore.analysisMode = '3d';
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
    const id = path === 'single' ? modelStore.addSupport(nodeId, 'rollerY')
      : path === 'bulk' ? modelStore.addSupports([nodeId], 'rollerY')[0]!
      : original.id;
    if (path === 'edit') modelStore.updateSupport(id, { type: 'rollerY' });
    expect(uiStore.viewportPresentation3D).toBe('native3d');
    expect(modelStore.supports.get(id)!.dofRestraints).toEqual(masks.rollerY);
    for (const n of before) expect(modelStore.nodes.get(n.id)).toMatchObject({ x: n.x, y: 0, z: n.y });
  });
}
