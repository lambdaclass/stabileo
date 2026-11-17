import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '..';
import type { SupportType } from '../model.svelte';
import { supportDofs3D } from '../../engine/support-dofs-3d';
import { buildSolverInput3D, validateAndSolve3D, validateAndSolve3DAsync } from '../../engine/solver-service';
import { hasNonlinearBehaviour } from '../../engine/member-behaviour';

const regression = process.env.RUN_KNOWN_WRONG === '2277' ? it : it.skip;
const masks = {
  rollerX: { tx: false, ty: true, tz: true, rx: true, ry: true, rz: false },
  rollerY: { tx: true, ty: false, tz: true, rx: true, ry: true, rz: false },
  rollerZ: { tx: true, ty: false, tz: true, rx: true, ry: true, rz: false },
  rollerXY: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false },
  rollerXZ: { tx: false, ty: true, tz: false, rx: false, ry: false, rz: false },
  rollerYZ: { tx: true, ty: false, tz: false, rx: false, ry: false, rz: false },
} as const;
const paths = ['single', 'bulk', 'entry', 'edit'] as const;

beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

for (const mode of ['3d', 'pro'] as const) {
  for (const path of paths) {
    for (const type of Object.keys(masks) as Array<keyof typeof masks>) {
      regression(`known wrong result: #2277 ${mode} ${path} creates explicit ${type} restraints`, () => {
        uiStore.analysisMode = mode;
        const nodeId = modelStore.addNode(0, 0, 0);
        const id = path === 'single' ? modelStore.addSupport(nodeId, type)
          : path === 'bulk' ? modelStore.addSupports([nodeId], type)[0]!
          : path === 'entry' ? modelStore.addSupportEntry({ nodeId, type })
          : modelStore.addSupport(nodeId, 'fixed3d');
        if (path === 'edit') modelStore.updateSupport(id, { type });
        const s = modelStore.supports.get(id)!;
        expect(s.dofRestraints).toEqual(masks[type]);
        expect(s.type).toBe(type === 'rollerZ' ? 'rollerY' : type);
        expect(() => supportDofs3D(s)).not.toThrow();
      });
    }
  }
}

regression('known wrong result: #2277 changing a roller direction replaces the previous mask', () => {
  const node = modelStore.addNode(0, 0, 0);
  const id = modelStore.addSupport(node, 'rollerX', undefined, { dofRestraints: masks.rollerX });
  modelStore.updateSupport(id, { type: 'rollerZ' });
  expect(modelStore.supports.get(id)!.dofRestraints).toEqual(masks.rollerY);
});

it('#2277 an explicit mask takes precedence over a creation alias and survives field edits', () => {
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
  for (const async of [false, true]) {
    regression(`known wrong result: #2277 newly selected Y roller solves nonlinear=${nonlinear} async=${async}`, async () => {
      await modelStore.loadExample('rc-beam-flexure');
      const left = modelStore.addSupport(1, 'fixed3d');
      modelStore.addSupport(3, 'rollerY');
      if (nonlinear) modelStore.updateSupport(left, { uplift: true });
      const m = modelStore.model;
      expect(hasNonlinearBehaviour(m)).toBe(nonlinear);
      expect(buildSolverInput3D(m)!.supports.get(3)).toMatchObject({ rx: true, ry: false, rz: true, rrx: true, rry: true, rrz: false });
      const result = async ? await validateAndSolve3DAsync(m) : validateAndSolve3D(m);
      if (!result || typeof result === 'string') throw new Error(String(result));
      expect(result.displacements.length).toBe(m.nodes.size);
      expect(result.reactions.every(r => Number.isFinite(r.fz))).toBe(true);
    });
  }
}
