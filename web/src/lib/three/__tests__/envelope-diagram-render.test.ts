import { expect, it } from 'vitest';
import { Line } from 'three';
import { modelStore } from '../../store/model.svelte';
import { createEnvelopeDiagramGroup3D } from '../diagram-render-3d';
import { disposeObject } from '../selection-helpers';

function render(posValues: number[], negValues: number[], globalMax = 100, showValues = false) {
  modelStore.clear();
  const start = modelStore.addNode(0, 0, 0);
  const end = modelStore.addNode(5, 0, 0);
  const elementId = modelStore.addElement(start, end);
  return createEnvelopeDiagramGroup3D(modelStore.elements, modelStore.nodes, {
    kind: 'momentY', globalMax,
    elements: [{ elementId, tPositions: [0, 1], posValues, negValues }],
  }, 'momentY', 1, showValues);
}

it('known wrong result: #2581 uses the magnitude of each signed spatial envelope curve', () => {
  for (const { upper, lower, curve } of [
    { upper: [-100, 0], lower: [-100, 0], curve: 'pos' },
    { upper: [100, 0], lower: [100, 0], curve: 'neg' },
  ]) {
    const group = render(upper, lower);
    try {
      const outline = group.children.find(child => child.userData.type === 'diagram3dEnvelopeLine'
        && child.userData.curve === curve);
      expect(outline).toBeInstanceOf(Line);
      const positions = (outline as Line).geometry.getAttribute('position');
      expect(Math.abs(positions.getZ(0))).toBeCloseTo(0.4, 6);
      expect(positions.getZ(1)).toBe(0);
    } finally {
      disposeObject(group);
      modelStore.clear();
    }
  }
});

it('keeps the per-curve display cutoff inclusive for sign-clipped envelopes', () => {
  const group = render([0, 0.1], [-0.099, 0]);
  try {
    expect(group.children.filter(child => child.userData.type === 'diagram3dEnvelopeLine')
      .map(child => child.userData.curve)).toEqual(['pos']);
  } finally {
    disposeObject(group);
    modelStore.clear();
  }
});
