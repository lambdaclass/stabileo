import { expect, it } from 'vitest';
import { memberLoadSpans, plannedMemberLoadSpans } from '../member-load-spans';
import { modelStore, type DistributedLoad3D, type Load } from '../../../store/model.svelte';
import '../../../store/index';
import { splitElementLoads } from '../../../model/edit/member-split';
import { subdivideForAnalysis } from '../../../model/edit/analysis-subdivision';
import { expandVariableMembers } from '../../variable-members';
import { builtSpec, builtSectionFields } from '../../generators/variable-pair';

const regression = it;
const moments = { x: [1, 1, 1] as [number, number, number], y: [0, 0, 0] as [number, number, number], z: [0, 0, 0] as [number, number, number] };

for (const kind of ['force', 'torque', 'bending', 'reversing'] as const) for (const end of ['i', 'interior', 'j'] as const) for (const width of [0.5e-12, 1.5e-12, 0.5e-9, 1.5e-9]) regression(`density stays distributed or refuses: ${kind} ${end} ${width}`, () => {
  const a = end === 'i' ? 0 : end === 'j' ? 2 - width : 1;
  const b = end === 'j' ? 2 : a + width, h = b - a;
  const load: DistributedLoad3D = { id: 1, elementId: 17, a, b, frame: 'global', qYI: kind === 'force' || kind === 'reversing' ? 1 / h : 0, qYJ: kind === 'force' ? 1 / h : kind === 'reversing' ? -1 / h : 0, qZI: 0, qZJ: 0 };
  if (kind === 'torque' || kind === 'bending') load.moments = kind === 'torque' ? moments : { x: [0, 0, 0], y: [1, -2, 3], z: [4, 5, 6] };
  const run = () => memberLoadSpans([load], () => 2);
  expect(run().distributed).toEqual([load]); expect(run().concentrated).toEqual([]);
});

for (const width of [0.5e-12, 1e-12, 1.5e-12]) regression(`planned projected force uses the same refusal at ${width}`, () => {
  const load = { elementId: 17, a: 0, b: width, q: -1 / width, frame: 'projected' as const };
  const model = { nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 3, y: 0, z: 4 }]]), elements: new Map([[17, { nodeI: 1, nodeJ: 2 }]]) };
  const run = () => plannedMemberLoadSpans([load], model);
  expect(run().distributed).toHaveLength(1); expect(run().concentrated).toEqual([]);
});

for (const operation of ['store', 'analysis', 'variable'] as const) for (const plane of [false, true]) for (const width of [0.5e-12, 0.5e-9]) regression(`split ${operation} plane=${plane} retains density or refuses width=${width}`, () => {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0), elementId = modelStore.addElement(a, b);
  const load: Load = plane ? { type: 'distributed', data: { id: 1, elementId, a: 3 - width, b: 6, qI: 1, qJ: -1 } } : { type: 'distributed3d', data: { id: 1, elementId, a: 3 - width, b: 6, qYI: 1, qYJ: -1, qZI: 0, qZJ: 0, moments } };
  modelStore.addLoadEntry(load);
  const run = () => {
    if (operation === 'store') return splitElementLoads(modelStore.loads, elementId, [0, 3, 6], [2, 3], () => 10).added;
    if (operation === 'analysis') return subdivideForAnalysis(modelStore.model, 2).model.loads;
    const rect = (h: number) => modelStore.addSection(builtSectionFields(builtSpec('concrete-rect', { b: 0.2, h }))! as never);
    modelStore.updateElement(elementId, { sectionId: rect(0.2), variableSection: { sectionJ: rect(0.4), segments: 2 } });
    return expandVariableMembers(modelStore.model).loads;
  };
  const out = run(); expect(out).toHaveLength(2); expect(out.every(l => l.type === load.type)).toBe(true);
});
