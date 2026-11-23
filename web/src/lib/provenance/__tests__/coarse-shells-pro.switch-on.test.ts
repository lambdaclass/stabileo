import { expect, it } from 'vitest';
import { modelFeatures, type FeatureSnapshot } from '../model-features';

const shell = (side: number, plate?: { size: number; typology?: string; ribs?: number }) => ({
  analysisMode: 'pro',
  nodes: [[1, { x: 0, y: 0, z: 0 }], [2, { x: side, y: 0, z: 0 }], [3, { x: side, y: side, z: 0 }], [4, { x: 0, y: side, z: 0 }]],
  quads: [[1, { nodes: [1, 2, 3, 4] }]],
  ...(plate ? {
    groups: [[7, { kind: 'physicalMember', members: { nodes: [1, 2, 3, 4], quads: [1] }, data: { kind: 'slab', ...(plate.typology ? { typology: plate.typology } : {}), surface: { loops: [4], mesh: { size: plate.size } } } }]],
    ...(plate.ribs ? { designData: { specialFloors: { systems: { S7: { ribbed: { spacingX: plate.ribs } } } } } } : {}),
  } : {}),
}) as unknown as FeatureSnapshot;
const coarse = (s: FeatureSnapshot) => modelFeatures(s).has('coarseShellsPro');

it('marks the shells PRO meshes before the analysis: a side over 1.5 times the default mesh size when no plate holds them', () => {
  expect(coarse(shell(0.8))).toBe(true);
  expect(coarse(shell(0.7))).toBe(false);
});

it('measures a plate\'s shells against that plate\'s own mesh size, a waffle slab\'s against its ribs', () => {
  expect(coarse(shell(2.5, { size: 2 }))).toBe(false);
  expect(coarse(shell(3.5, { size: 2 }))).toBe(true);
  expect(coarse(shell(0.5, { size: 0.3 }))).toBe(true);
  expect(coarse(shell(0.4, { size: 0.3 }))).toBe(false);
  expect(coarse(shell(2.5, { size: 2, typology: 'waffle', ribs: 0.6 }))).toBe(true);
  expect(coarse(shell(2.5, { size: 2, typology: 'solid', ribs: 0.6 }))).toBe(false);
});
