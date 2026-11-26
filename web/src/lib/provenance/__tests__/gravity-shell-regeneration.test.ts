import { doubleAttachedRoof, offsetRoof, triangulateRoof } from '../../engine/loads/__tests__/gravity-offset-roof-fixture';
import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const change = RESULT_CHANGES.changes.find(c => c.id === 'gravity-shell-coverage')!;
const legacy = {
  elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
  loadCases: [{ id: 1, type: 'D' }],
  loads: [{ type: 'distributed3d', data: { elementId: 1, caseId: 1, generatedBy: 'cirsoc-101' } }],
} satisfies FeatureSnapshot;
const derivation = [{ key: 'loadPlan.gravity.partlyUnderShells' }];

function changes(snapshot: FeatureSnapshot) {
  const stamp = { ...stampSolve('linear', null), resultsVersion: change.resultsVersion };
  return assessProject(snapshot, stamp).changes.map(c => c.id);
}

it('#2200 a partial-shell derivation flags legacy plans with only stored beam loads', () => {
  for (const analysisMode of ['3d', 'pro']) {
    const snapshot = { ...legacy, analysisMode, designData: { loadBasis: { derivation } } };
    expect(modelFeatures(snapshot).has('generatedPanelGravityShells')).toBe(true);
    expect(changes(snapshot)).toContain(change.id);
  }
});

it('limits the shell regeneration notice to older three-dimensional plans with shell evidence', () => {
  const shellPlan = { ...legacy, designData: { loadBasis: { derivation } } };
  expect(changes({ ...shellPlan, analysisMode: '2d' })).not.toContain(change.id);
  const current = { ...legacy, designData: { loadBasis: { derivation, resultsVersion: change.resultsVersion } } };
  expect(changes({ ...current, analysisMode: 'pro' })).not.toContain(change.id);
  const plain = { ...legacy, designData: { loadBasis: { derivation: [{ key: 'loadPlan.gravity.panels' }] } } };
  expect(changes({ ...plain, analysisMode: 'pro' })).not.toContain(change.id);
});

const legacyPanel: FeatureSnapshot = {
  ...legacy,
  quads: [[1, { id: 1 }]],
  regulations: { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode: 'panels' } } } } },
};

it('#2282 saved panel-mode shell geometry and generated member loads require regeneration', () => {
  for (const analysisMode of ['3d', 'pro']) {
    for (const analysis of ['linear', 'pdelta'] as const) {
      for (const designData of [undefined, { loadBasis: {} }]) {
        const snapshot = { ...legacyPanel, analysisMode, designData };
        expect(assessProject(snapshot, stampSolve(analysis, null)).changes.map(c => c.id)).toContain(change.id);
      }
    }
  }
});

it('requires saved panel mode, shell geometry, generated member gravity and an older generation stamp for the fallback', () => {
  const manual = [{ type: 'distributed3d', data: { elementId: 1, caseId: 1 } }];
  const width = { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode: 'width' } } } } };
  for (const overrides of [
    { analysisMode: '2d' }, { loads: manual }, { regulations: width }, { regulations: undefined }, { quads: [] },
    { designData: { loadBasis: { resultsVersion: change.resultsVersion } } },
  ]) {
    expect(changes({ ...legacyPanel, analysisMode: 'pro', ...overrides })).not.toContain(change.id);
  }
});

it('#2512 explicit width gravity does not qualify for panel gravity regeneration', () => {
  const snapshot: FeatureSnapshot = {
    ...legacyPanel, analysisMode: 'pro',
    regulations: { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode: 'width' } } } } },
    designData: { loadBasis: { derivation: [{ key: 'loadPlan.gravity.width' }] } },
  };
  const features = modelFeatures(snapshot);
  expect(features.has('generatedWidthGravity')).toBe(true);
  expect(features.has('generatedPanelGravity')).toBe(false);
});

it('#2586 requires an actual paired roof attachment with a bounded gap', () => {
  checkRafterGapRegeneration('gravity-attached-rafter-gaps');
});

it('#2607 bounded attached roof gaps have a separate width regeneration notice', () => {
  checkRafterGapRegeneration('gravity-attached-rafter-gap-width');
});

function checkRafterGapRegeneration(id: string) {
  const check = (gap: false | readonly [number, number], paired: boolean, mode: 'width' | 'panels') => {
    const { model } = offsetRoof(0.02, 0.53, 1, true, gap);
    const remote = [...model.nodes.values()].at(-1)!;
    const first = remote.id + 1, second = remote.id + 2;
    model.nodes.set(first, { ...remote, id: first, x: remote.x + 20 });
    model.nodes.set(second, { ...remote, id: second, x: remote.x + 20, z: remote.z! + 1 });
    const constraints = paired ? model.constraints.map(link => ({ ...link })) : [{ type: 'rigidLink', masterNode: first, slaveNode: second }];
    return changes({
      ...legacyPanel, analysisMode: 'pro', nodes: [...model.nodes], elements: [...model.elements],
      quads: [...model.quads], constraints,
      regulations: { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode: mode } } } } },
    }).includes(id);
  };
  expect.soft(check([4, 6], true, 'panels')).toBe(true);
  expect.soft(check([4, 6], false, 'panels')).toBe(false);
  expect.soft(check(false, true, 'panels')).toBe(false);
  expect.soft(check([4, 6], true, 'width')).toBe(false);
}

it.each([false, true])('#2607 older panel gravity with stacked gap decks requires regeneration (triangles %s)', triangles => {
  const id = 'gravity-attached-gap-decks';
  const quads = doubleAttachedRoof(false, [4, 6], true);
  const model = triangles ? triangulateRoof(quads) : { ...quads, plates: undefined };
  const result = (mode: 'panels' | 'width', constraints: FeatureSnapshot['constraints']) => changes({
    ...legacyPanel, analysisMode: '3d', nodes: [...model.nodes], elements: [...model.elements],
    quads: [...model.quads], plates: model.plates && [...model.plates], constraints,
    regulations: { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode: mode } } } } },
  });
  const constraints = model.constraints.map(link => ({ ...link }));
  expect(result('panels', constraints)).toContain(id);
  expect(result('panels', [])).not.toContain(id);
  expect(result('width', constraints)).not.toContain(id);
});

it.each(['linear', 'pdelta'] as const)(
  '#2607 an older %s result with unequal gap end widths requires regeneration', analysis => {
    const { model } = offsetRoof(0.02, 0, 1, true, [4, 6]);
    for (const node of model.nodes.values()) if (node.x === 6) node.y *= 1.5;
    for (const [mode, paired, affected] of [['panels', true, true], ['panels', false, false], ['width', true, false]] as const) {
      const snapshot = {
        ...legacyPanel, analysisMode: 'pro', nodes: [...model.nodes], elements: [...model.elements],
        quads: [...model.quads],
        constraints: (paired ? model.constraints : model.constraints.slice(0, 1)).map(link => ({ ...link })),
        regulations: { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode: mode } } } } },
      } satisfies FeatureSnapshot;
      const stamp = { ...stampSolve(analysis, null), resultsVersion: change.resultsVersion };
      const notices = assessProject(snapshot, stamp).changes.map(c => c.id);
      expect.soft(modelFeatures(snapshot).has('roofShellFrameLinks')).toBe(affected);
      expect.soft(notices.includes('gravity-attached-rafter-gap-width')).toBe(affected);
    }
  },
);

function checkLegacyPanelDerivation(triangles: boolean, gravityMode?: 'panels' | 'width') {
  const { model: source } = offsetRoof(0.02, 0, 1, false, [4, 6]);
  const model = triangles ? triangulateRoof(source) : { ...source, plates: undefined };
  for (const analysisMode of ['3d', 'pro']) {
    const snapshot: FeatureSnapshot = {
      ...legacy, analysisMode, nodes: [...model.nodes], elements: [...model.elements],
      quads: [...model.quads], plates: model.plates && [...model.plates],
      constraints: model.constraints.map(link => ({ ...link })),
      designData: { loadBasis: { derivation: [{ key: 'loadPlan.gravity.panels' }] } },
      regulations: { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode } } } } },
    };
    const panel = gravityMode !== 'width';
    const features = modelFeatures(snapshot);
    expect.soft(features.has('generatedPanelGravityShells')).toBe(panel);
    expect.soft(features.has('roofShellFrameLinks')).toBe(panel);
    for (const analysis of ['linear', 'pdelta'] as const) {
      const notices = assessProject(snapshot, stampSolve(analysis, null)).changes.map(entry => entry.id);
      for (const id of [change.id, 'gravity-attached-rafter-gap-width', 'gravity-stacked-rafter-gap-exposure']) {
        expect.soft(notices.includes(id)).toBe(panel);
      }
    }
  }
}

it.each([false, true])('#2607 infers older shell panel gravity from derivation (triangles %s)', triangles => {
  checkLegacyPanelDerivation(triangles);
});

it.each([false, true])('#2607 respects explicit gravity mode with a panel derivation (triangles %s)', triangles => {
  checkLegacyPanelDerivation(triangles, 'panels');
  checkLegacyPanelDerivation(triangles, 'width');
});
