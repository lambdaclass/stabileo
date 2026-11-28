import { expect, it } from 'vitest';
import { checkModel } from '../../engine/model-diagnostics';
import { modelStore } from '../model.svelte';
import { createPlate, planPlateMesh, applyPlateMeshes, plateEntry } from '../physical-plates';
import { plateDiagnostics } from '../plate-diagnostics';
import { uiStore } from '../ui.svelte';
import { t } from '../../i18n';

it.each(['triangle', 'quadrilateral'] as const)('names only the T member sharing its two ends with the modeled %s slab', shell => {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(2, 0, 0);
  const c = modelStore.addNode(2, 2, 0), d = modelStore.addNode(0, 2, 0);
  const remote = modelStore.addNode(4, 0, 0);
  const tee = modelStore.addSection({ name: 'T', shape: 'T', a: 0.22, iy: 0.004, iz: 0.003, j: 0.002, b: 1.2, h: 0.5, tw: 0.2, tf: 0.12 });
  const beam = modelStore.addElement(a, b, 'frame'), other = modelStore.addElement(b, remote, 'frame');
  modelStore.updateElementSection(beam, tee);
  modelStore.updateElementSection(other, tee);
  const finding = () => checkModel({ ...modelStore.model, loads: [] }).find(diagnostic => diagnostic.code === 'MODEL_FLANGE_TWICE');
  expect(finding()).toBeUndefined();
  if (shell === 'triangle') modelStore.addPlate([a, b, c], 1, 0.12);
  else modelStore.addQuad([a, b, c, d], 1, 0.12);
  expect(finding()).toMatchObject({ severity: 'info', elementIds: [beam] });
  modelStore.updateElementSection(beam, 1);
  expect(finding()).toBeUndefined();
});

it('identifies loose mesh corners on an owned slab and clears the finding when all nodes are held', () => {
  modelStore.clear();
  uiStore.analysisMode = 'pro';
  const outline = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const created = createPlate({ name: 'Slab', outline, thickness: 0.15, materialId: 1 });
  if (!('id' in created)) throw new Error(JSON.stringify(created));
  const findings = () => plateDiagnostics(t).filter(diagnostic => diagnostic.code === 'PLATE_LOOSE_CORNER');
  expect(findings()).toEqual([]);
  const plan = planPlateMesh(created.id);
  expect(plan).not.toBeNull();
  expect(applyPlateMeshes([plan!])).toMatchObject({ plates: 1 });
  const found = findings();
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ severity: 'warning', objects: [{ kind: 'plate', id: created.id }], details: { plate: 'Slab' } });
  expect(found[0]!.message).not.toBe('pro.plates.diag.looseCorner');
  const { members } = plateEntry(created.id)!.group;
  const connected = new Set([...(members.quads ?? []).flatMap(id => modelStore.quads.get(id)!.nodes), ...(members.plates ?? []).flatMap(id => modelStore.plates.get(id)!.nodes)]);
  for (const node of connected) modelStore.addSupport(node, 'fixed3d');
  expect(findings()).toEqual([]);
});
