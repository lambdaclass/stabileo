import { render } from 'svelte/server';
import { afterEach, expect, it } from 'vitest';
import ProShellTab from '../pro/ProShellTab.svelte';
import { modelStore, uiStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { addPlateLoad, createPlate, plateEntry } from '../../lib/store/physical-plates';
import { shellLoadForces } from '../../lib/engine/shell-load-integration';

const previousHelp = uiStore.inlineHelp;
afterEach(() => { uiStore.inlineHelp = previousHelp; uiStore.clearSelection(); modelStore.clear(); });

it.each(['wall', 'slab'] as const)('known wrong result: #1928 the selected %s describes the direction it applies and offers only supported mesh edits', kind => {
  for (const triangular of [false, true]) {
    modelStore.clear();
    const points = [[0, 0], [2, 0], [2, 2], [0, 2]].slice(0, triangular ? 3 : 4)
      .map(([x, h]) => ({ x: x!, y: kind === 'slab' ? h! : 0, z: kind === 'wall' ? h! : 0 }));
    const nodes = points.map(p => modelStore.addNode(p.x, p.y, p.z));
    const shape = createPlate({ outline: nodes, materialId: 1, thickness: 0.15 });
    if ('problem' in shape) throw Error(shape.problem);
    const plate = plateEntry(shape.id)!;
    expect(plate.physical.kind).toBe(kind);
    const mesh = triangular ? modelStore.addPlate(nodes as [number, number, number], 1, 0.15)
      : modelStore.addQuad(nodes as [number, number, number, number], 1, 0.15);
    modelStore.setGroupMembers(shape.id, { ...plate.group.members, [triangular ? 'plates' : 'quads']: [mesh] });
    const def = addPlateLoad(shape.id, 1, 2);
    expect(def).not.toBeNull();
    const applied = modelStore.loads.find(l => l.type === 'surface3d' && l.data.fromDef === def);
    if (applied?.type !== 'surface3d') throw new Error('missing authored surface load');
    const equivalent = shellLoadForces(triangular ? 'plate' : 'quad', points, applied.data);
    if (!equivalent) throw new Error('missing equivalent forces');
    expect(equivalent.forces.every(([x, y, z]) => x === 0 && y === 0 && z < 0)).toBe(true);
    modelStore.addSurfaceLoad3D(mesh, 3, 1, triangular ? { on: 'plate' } : {});
    const direct = modelStore.addLoadCase('Element pressure', 'L');
    modelStore.addSurfaceLoad3D(mesh, 3, direct, triangular ? { on: 'plate' } : {});
    uiStore.inlineHelp = true;
    uiStore.selectMode = 'shells';
    uiStore.shellPickScope = 'plate';
    uiStore.selectPlates([shape.id]);
    const html = render(ProShellTab).body;
    expect.soft(html).toContain(t('plates.areaLoadHint'));
    expect.soft(html).toContain('data-testid="plate-load-add"');
    expect.soft(html.includes('data-testid="plate-typology"')).toBe(Boolean(__PUBLIC_FEATURES__.proPlatesUnified));
    expect.soft(html.includes('data-testid="plate-element-load-1"')).toBe(false);
    expect.soft(html.includes('data-testid="plate-element-load-' + direct + '"')).toBe(kind === 'slab' && Boolean(__PUBLIC_FEATURES__.proPlatesUnified));
  }
});

it('known wrong result: #1928 the selected panel offers level loads only on a matching horizontal slab in the unified view', () => {
  modelStore.clear();
  const nodes = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const plate = createPlate({ outline: nodes, materialId: 1, thickness: 0.15 });
  if ('problem' in plate) throw Error(plate.problem);
  uiStore.selectMode = 'shells';
  uiStore.shellPickScope = 'plate';
  uiStore.selectPlates([plate.id]);
  const definition = (z: number) => modelStore.addGroup('Floor', 'floorLoad', {}, { data: { caseId: 1, q: 2, target: { by: 'level', z }, distribution: 'slab' } });
  const same = definition(0), other = definition(1);
  const html = render(ProShellTab).body;
  expect(html.includes('data-testid="plate-level-load-' + same + '"')).toBe(Boolean(__PUBLIC_FEATURES__.proPlatesUnified));
  expect(html.includes('data-testid="plate-level-load-' + other + '"')).toBe(false);
});
