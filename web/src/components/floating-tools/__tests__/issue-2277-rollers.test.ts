import { beforeEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ToolSupportOptions from '../ToolSupportOptions.svelte';
import SelectedEntityPanel from '../SelectedEntityPanel.svelte';
import { modelStore, uiStore } from '../../../lib/store';
import type { SupportType } from '../../../lib/store/model.svelte';
import { addSupportFromTool3D } from '../../../lib/store/support-tool-3d';
import { drawState } from '../../../lib/store/draw-state.svelte';
import { validateAndSolve3D } from '../../../lib/engine/solver-service';

const directions = {
  X: { tx: false, ty: true, tz: true, rx: true, ry: true, rz: false },
  Y: { tx: true, ty: false, tz: true, rx: true, ry: true, rz: false },
  Z: { tx: true, ty: true, tz: false, rx: true, ry: true, rz: false },
  XY: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false },
  XZ: { tx: false, ty: true, tz: false, rx: false, ry: false, rz: false },
  YZ: { tx: true, ty: false, tz: false, rx: false, ry: false, rz: false },
};

beforeEach(() => { uiStore.analysisMode = '3d'; uiStore.clearSelection(); modelStore.clear(); });

for (const [direction, mask] of Object.entries(directions)) {
  for (const path of ['viewport', 'panel', 'bulk panel'] as const) {
    it(`#2277 ${path} places the ${direction} roller shown by the component and solves`, async () => {
      await modelStore.loadExample('rc-beam-flexure');
      uiStore.analysisMode = '3d';
      modelStore.addSupport(1, 'fixed3d');
      uiStore.sup3dTx = mask.tx; uiStore.sup3dTy = mask.ty; uiStore.sup3dTz = mask.tz;
      uiStore.sup3dRx = mask.rx; uiStore.sup3dRy = mask.ry; uiStore.sup3dRz = mask.rz;
      uiStore.sup3dKx = 0; uiStore.sup3dKy = 0; uiStore.sup3dKz = 0;
      uiStore.sup3dKrx = 0; uiStore.sup3dKry = 0; uiStore.sup3dKrz = 0;
      const body = render(ToolSupportOptions).body;
      for (const [index, [dof, restrained]] of Object.entries(mask).entries()) {
        const label = body.match(/<label[^>]*class="ft-chk ft-dof[^"]*"[^>]*>.*?<\/label>/g)![index]!;
        expect(label.includes('checked'), dof).toBe(restrained);
        expect(label).toContain(['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'][index]);
      }
      drawState.support.dofs = { ...mask }; drawState.support.elastic = false; drawState.support.springs = {};
      const id = path === 'viewport' ? addSupportFromTool3D(3)
        : path === 'panel' ? drawState.addSupportAt(3) : drawState.addSupportsAt([3])[0]!;
      const s = modelStore.supports.get(id)!;
      expect(s.dofRestraints).toEqual(mask);
      expect(s.type).not.toBe('rollerZ');
      const result = validateAndSolve3D(modelStore.model);
      if (!result || typeof result === 'string') throw new Error(String(result));
      expect(result.displacements).toHaveLength(modelStore.nodes.size);
    });
  }
}

for (const type of ['rollerX', 'rollerY', 'rollerZ', 'rollerXY', 'rollerXZ', 'rollerYZ'] as const) {
  it(`#2277 selected 3D ${type} exposes its explicit DOFs without plane direction buttons`, () => {
    const node = modelStore.addNode(0, 0, 0);
    const id = modelStore.addSupport(node, type, undefined, { dofRestraints: directions.XY });
    uiStore.selectSupport(id, false);
    const body = render(SelectedEntityPanel).body;
    expect(body).not.toContain('ft-dir-btn');
    expect(body).toContain('>Fz</span>');
  });
}

for (const [type, mask] of Object.entries({
  fixed3d: [true, true, true, true, true, true],
  pinned3d: [true, true, true, false, false, false],
  spring3d: [false, false, false, false, false, false],
  rollerXY: [false, false, true, false, false, false],
  rollerXZ: [false, true, false, false, false, false],
  rollerYZ: [true, false, false, false, false, false],
} as const)) {
  it(`#2277 selected unmasked ${type} shows its effective restraints`, () => {
    const nodeId = modelStore.addNode(0, 0, 0);
    modelStore.model.supports.set(1, { id: 1, nodeId, type: type as SupportType });
    uiStore.selectSupport(1, false);
    const body = render(SelectedEntityPanel).body;
    const labels = body.match(/<label[^>]*class="ft-chk[^\"]*"[^>]*>.*?<\/label>/g)!;
    expect(labels.slice(0, 6).map(label => label.includes('checked'))).toEqual(mask);
  });
}
