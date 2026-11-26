import { expect, it } from 'vitest';
import { defaults } from '../../../components/examples/define';
import { beamFrame } from '../../../components/examples/beam-frame';
import { earthquake } from '../../../components/examples/earthquake';
import { applyWorkbook } from '../../excel-import/apply';
import { deserializeProject, serializeProject } from '../../store/file';
import { modelStore, uiStore } from '../../store';
import { currentWorkbookSheets } from '../../store/project-workbook';
import { loadCodeExample } from '../../templates/examples';
import { buildSolverInput2D, buildSolverInput3D } from '../solver-service';
import { exactOrphanRotations3D } from '../orphan-rotations-3d';
import { finiteObjectWire, finiteWireJson, input2DToWireObject, input3DToWireObject } from '../wasm-solver';
import { solve_2d, solve_3d, solve_pdelta_2d, solve_pdelta_3d } from '../../wasm/dedaliano_engine';

function planarRoutes(wire: ReturnType<typeof input2DToWireObject>) {
  return [
    () => solve_2d(finiteObjectWire(wire)),
    () => JSON.parse(solve_pdelta_2d(finiteWireJson(wire), 20, 1e-4)).results,
  ];
}

function spatialRoutes(wire: ReturnType<typeof input3DToWireObject>) {
  return [
    () => solve_3d(finiteObjectWire(wire)),
    () => JSON.parse(solve_pdelta_3d(finiteWireJson(wire), 20, 1e-4)).results,
  ];
}

function expectSolutions(routes: (() => { displacements: unknown[] })[]) {
  for (const run of routes) expect(run().displacements.length).toBeGreaterThan(0);
}

function modelRoutes(dim: '2d' | '3d') {
  return dim === '2d'
    ? planarRoutes(input2DToWireObject(buildSolverInput2D(modelStore.model)!))
    : spatialRoutes(input3DToWireObject(buildSolverInput3D(modelStore.model)!));
}

it.each(['2d', '3d'] as const)('strictly decodes edited, saved and workbook models in %s', dim => {
  uiStore.analysisMode = dim;
  modelStore.clear();
  const base = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(2, 0, 0);
  modelStore.addElement(base, tip, 'frame');
  if (dim === '2d') {
    modelStore.addSupport(base, 'fixed');
    modelStore.addNodalLoad(tip, 0, 1);
  } else {
    modelStore.addSupport(base, 'fixed3d');
    modelStore.addNodalLoad3D(tip, 0, 0, 1, 0, 0, 0);
  }

  const expected = modelRoutes(dim).map(run => run());
  for (const result of expected) expect(result.displacements).toHaveLength(2);

  const saved = serializeProject();
  modelStore.clear();
  expect(deserializeProject(saved)).toBe(true);
  expect(modelRoutes(dim).map(run => run().displacements)).toEqual(expected.map(result => result.displacements));

  const sheets = currentWorkbookSheets(2, { results: false, design: false });
  const workbook = Object.fromEntries(sheets.map(sheet => [sheet.name, sheet.rows.map(row => [...row])]));
  expect(applyWorkbook(workbook)).toMatchObject({ problems: [], loaded: { nodes: 2, elements: 1 } });
  expect(modelRoutes(dim).map(run => run().displacements)).toEqual(expected.map(result => result.displacements));
});

it('strictly decodes the gallery, bundled fixture and model-code template producers', async () => {
  expectSolutions(planarRoutes(input2DToWireObject(beamFrame.build(defaults(beamFrame.params)))));
  expectSolutions(spatialRoutes(input3DToWireObject(earthquake.build({ ...defaults(earthquake.params), storeys: 1 }))));

  uiStore.analysisMode = '3d';
  await modelStore.loadExample('3d-cantilever-load');
  expectSolutions(modelRoutes('3d'));
  await loadCodeExample('pro-plane-frame-seismic');
  const input = buildSolverInput3D(modelStore.model)!;
  expectSolutions(spatialRoutes(input3DToWireObject({ ...input, loads: [] })));
});

const beam = () => beamFrame.build(defaults(beamFrame.params));
const space = () => earthquake.build({ ...defaults(earthquake.params), storeys: 1 });

it('#2588 permits the #2171 material and section rows in both dimensions', () => {
  const planar = beam();
  const spatial = space();
  const material = { ...planar.materials.get(1)!, name: 'H25', fc: 25, fy: 420 };
  const shape = { b: 0.3, h: 0.6, rotation: 0 };
  const section = { ...spatial.sections.get(1)!, name: 'RC', ...shape };
  const materialWithDensity = { ...material, rho: 25 };
  planar.materials.set(1, materialWithDensity);
  spatial.materials.set(1, materialWithDensity);
  planar.sections.set(1, section);
  spatial.sections.set(1, section);

  expectSolutions(planarRoutes(input2DToWireObject(planar)));
  expectSolutions(spatialRoutes(input3DToWireObject(spatial)));
});

it('#2588 permits the planar seismic adapter’s shared section rows', () => {
  const planar = beam();
  const section = { ...planar.sections.get(1)!, iy: 1e-4, j: 1e-4 };
  planar.sections.set(1, section);
  expectSolutions(planarRoutes(input2DToWireObject(planar)));
});

it('#2588 permits orphan rotation metadata on generated supports', () => {
  const spatial = space();
  const member = [...spatial.elements.values()][0]!;
  spatial.nodes = new Map([...spatial.nodes].filter(([id]) => id === member.nodeI || id === member.nodeJ));
  spatial.elements = new Map([[member.id, { ...member, releaseTEnd: true }]]);
  spatial.supports = new Map([...spatial.supports].filter(([id]) => id === member.nodeI));
  delete spatial.masses;
  const fixed = { ...spatial.supports.get(member.nodeI)!, id: member.nodeI, type: 'fixed' };
  spatial.supports.set(member.nodeI, fixed);
  const wire = input3DToWireObject(exactOrphanRotations3D(spatial));
  expect(Object.values(wire.supports).some(support => support.stabilised && support.stabilisedAxes)).toBe(true);
  expectSolutions(spatialRoutes(wire));
});

it('refuses misspelled material, section and support solver fields across WASM routes', () => {
  const planar = input2DToWireObject(beam());
  const spatial = input3DToWireObject(space());
  for (const [routes, row, misspelled] of [
    [planarRoutes(planar), planar.materials['1']!, 'nU'],
    [spatialRoutes(spatial), spatial.materials['1']!, 'nU'],
    [planarRoutes(planar), planar.sections['1']!, 'asYY'],
    [spatialRoutes(spatial), spatial.sections['1']!, 'asYY'],
    [spatialRoutes(spatial), spatial.supports['1']!, 'rrX'],
  ] as const) {
    Object.assign(row, { [misspelled]: 1 });
    for (const run of routes) expect(run).toThrow(`unknown field \`${misspelled}\``);
    Reflect.deleteProperty(row, misspelled);
    expectSolutions(routes);
  }
});
