/**
 * The 3D loads are rebuilt only when their signature changes (`loadsSignature`): it has to hold
 * every node a drawing is placed by, and every reading preference its labels follow.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { displayUnits } from '../../store/display-units.svelte';
import { addLoads } from '../../store/load-ops';
import { loadsSignature } from '../scene-sync';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); });

describe('loadsSignature', () => {
  it('a beam with only a tendon and a ΔT: moving node J redraws them', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    addLoads([
      { type: 'prestress3d', data: { id: 0, elementId: e, force: 500, eI: 0, eM: 0.2, eJ: 0, caseId: 1 } },
      { type: 'thermal', data: { id: 0, elementId: e, dtUniform: 20, dtGradient: 0, caseId: 1 } },
    ]);
    const before = loadsSignature(false);
    modelStore.updateNode(b, 6, 0, 2);
    expect(loadsSignature(false)).not.toBe(before);
  });

  it('a tendon follows the member\'s roll and its section\'s rotation', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    addLoads([{ type: 'prestress3d', data: { id: 0, elementId: e, force: 500, eI: 0, eM: 0.2, eJ: 0, caseId: 1 } }]);
    const before = loadsSignature(false);
    modelStore.elements.get(e)!.rollAngle = 90;
    expect(loadsSignature(false)).not.toBe(before);
  });

  it('a slab\'s temperature and an imposed displacement follow their nodes', () => {
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(2, 0, 0), modelStore.addNode(2, 2, 0), modelStore.addNode(0, 2, 0)];
    const q = modelStore.addQuad(n as [number, number, number, number], 1, 0.2);
    addLoads([
      { type: 'thermalQuad3d', data: { id: 0, quadId: q, dtUniform: 10, dtGradient: 0, caseId: 1 } },
      { type: 'displacement3d', data: { id: 0, nodeId: n[0]!, dz: -0.01, caseId: 1 } },
    ]);
    let before = loadsSignature(false);
    modelStore.updateNode(n[2]!, 2, 2, 1);
    expect(loadsSignature(false)).not.toBe(before);
    before = loadsSignature(false);
    modelStore.updateNode(n[0]!, 0, 0, 0.5);
    expect(loadsSignature(false)).not.toBe(before);
  });

  it('the reader\'s decimals change the labels, so the signature', () => {
    const a = modelStore.addNode(0, 0, 0);
    addLoads([{ type: 'nodal3d', data: { id: 0, nodeId: a, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0, caseId: 1 } }]);
    const before = loadsSignature(false);
    displayUnits.setDecimals('force', 3);
    try {
      expect(loadsSignature(false)).not.toBe(before);
    } finally {
      displayUnits.setDecimals('force', null);
    }
  });
});
