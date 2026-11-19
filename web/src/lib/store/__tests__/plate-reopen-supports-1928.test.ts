import { expect, it } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { deserializeProject, serializeProject } from '../file';
import { clearPlateMesh, holdPlateSides, createPlate, physicalPlates, planPlateMesh, applyPlateMeshes, setPlateShellSpec } from '../physical-plates';
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

it.skip('known wrong result: #1928 — keeps a user replacement of a generated restraint of the same type', () => {
  modelStore.clear();
  historyStore.clear();
  uiStore.analysisMode = 'pro';
  const nodes = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const made = createPlate({ outline: nodes, materialId: 1, thickness: 0.15 });
  if ('problem' in made) throw new Error(made.problem);
  holdPlateSides(made.id, [[nodes[0]!, nodes[1]!]], 'pinned3d');
  expect(applyPlateMeshes([planPlateMesh(made.id, { size: 2, element: 'quad' })!]).plates).toBe(1);
  const generated = [...modelStore.supports.values()].find(s => !nodes.includes(s.nodeId));
  expect(generated).toBeDefined();
  const replacementId = modelStore.addSupport(generated!.nodeId, 'pinned3d');
  expect(replacementId).not.toBe(generated!.id);
  clearPlateMesh(made.id);
  expect(modelStore.supports.get(replacementId)?.nodeId).toBe(generated!.nodeId);
});

it.skip('known wrong result: #1928 — removes only the contribution of a cleared spring plate at its outline nodes', () => {
  modelStore.clear();
  historyStore.clear();
  uiStore.analysisMode = 'pro';
  const a = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const b = [a[1]!, modelStore.addNode(8, 0, 0), modelStore.addNode(8, 4, 0), a[2]!];
  const ids = [a, b].map(outline => {
    const plate = createPlate({ outline, materialId: 1, thickness: 0.2 });
    if ('problem' in plate) throw new Error(plate.problem);
    return plate.id;
  });
  setPlateShellSpec(ids, { springs: { ks: 20000, uplift: false, holdHorizontal: false } });
  const plans = ids.map(id => planPlateMesh(id, { size: 1 })!);
  expect(applyPlateMeshes(plans).plates).toBe(2);
  const k = (node: number) => [...modelStore.supports.values()].find(s => s.nodeId === node)?.kz;
  const old = k(a[1]!);
  expect(old).toBeGreaterThan(0);
  expect(k(a[0]!)).toBeGreaterThan(0);
  clearPlateMesh(ids[0]!);
  expect(k(a[1]!)).toBe(old! / 2);
  expect(k(a[0]!)).toBeUndefined();
});
