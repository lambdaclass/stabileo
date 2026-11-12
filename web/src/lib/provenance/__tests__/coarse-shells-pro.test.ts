import { expect, it } from 'vitest';
import { modelFeatures, type FeatureSnapshot } from '../model-features';

const shell = (side: number) => ({
  analysisMode: 'pro',
  nodes: [[1, { x: 0, y: 0, z: 0 }], [2, { x: side, y: 0, z: 0 }], [3, { x: side, y: side, z: 0 }], [4, { x: 0, y: side, z: 0 }]],
  quads: [[1, { nodes: [1, 2, 3, 4] }]],
}) as unknown as FeatureSnapshot;

it('marks the shells PRO meshes before the analysis: a side over 1.5 times the default mesh size', () => {
  expect(modelFeatures(shell(0.8)).has('coarseShellsPro')).toBe(true);
  expect(modelFeatures(shell(0.7)).has('coarseShellsPro')).toBe(false);
});
