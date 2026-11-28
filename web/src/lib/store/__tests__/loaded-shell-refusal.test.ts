import { afterEach, expect, it } from 'vitest';
import { modelStore } from '..';
import { t } from '../../i18n';

afterEach(() => modelStore.clear());

it.skip.each(['pressure', 'temperature', 'none'] as const)('known wrong result: #2535 Basic identifies the loaded shell for %s', kind => {
  modelStore.clear();
  const nodes = [[0,0], [1,0], [1,1], [0,1]].map(([x,y]) => modelStore.addNode(x!, y!, 0)) as [number, number, number, number];
  const q = modelStore.addQuad(nodes, 1, 0.15);
  const id = kind === 'pressure' ? modelStore.addSurfaceLoad3D(q, 1, 1) : kind === 'temperature' ? modelStore.addThermalLoadQuad3D(q, 1, 0, 1) : null;
  modelStore.addCombination('case', [{ caseId: 1, factor: 1 }]);
  const expected = t('svc.shellsRequirePro3d') + (id === null ? '' : ' (' + (kind === 'pressure' ? 'surface3d' : 'thermalQuad3d') + ' ' + id + ')');
  return Promise.all([modelStore.solve(), modelStore.solveAsync(), modelStore.solveCombinations(), modelStore.solve3D(), modelStore.solve3DAsync(), modelStore.solveCombinations3D(), modelStore.solveCombinations3DParallel()]).then(results => {
    expect(results).toEqual(Array(7).fill(expected));
  });
});
