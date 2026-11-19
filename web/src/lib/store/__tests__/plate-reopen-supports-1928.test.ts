import { expect, it } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { deserializeProject, serializeProject } from '../file';
import { createPlate, physicalPlates, planPlateMesh, applyPlateMeshes } from '../physical-plates';
import { ensurePlates } from '../plates-from-shells';

it.skip.each(['loose shell', 'old plate'])('known wrong result: #1928 — reopens %s with point supports still at the four corners', kind => {
  modelStore.clear();
  historyStore.clear();
  uiStore.analysisMode = 'pro';
  const nodes = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  for (const node of nodes) modelStore.addSupport(node, 'pinned3d');
  if (kind === 'loose shell') {
    modelStore.addQuad(nodes as [number, number, number, number], 1, 0.15);
  } else {
    const made = createPlate({ outline: nodes, materialId: 1, thickness: 0.15 });
    if ('problem' in made) throw new Error(made.problem);
    const group = modelStore.model.groups.get(made.id)!;
    const { edgeSupports: _edges, ...surface } = physicalPlates()[0]!.surface;
    modelStore.setGroupData(made.id, { ...group.data, surface });
  }

  const saved = serializeProject();
  modelStore.clear();
  expect(deserializeProject(saved)).toBe(true);
  ensurePlates();
  const [plate] = physicalPlates();
  expect(plate).toBeDefined();
  const plan = planPlateMesh(plate!.id, { size: 2, element: 'quad' })!;
  expect(applyPlateMeshes([plan]).plates).toBe(1);
  expect([...modelStore.supports.values()].map(s => s.nodeId).sort((a, b) => a - b)).toEqual(nodes);
});
