import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

const { default: ProResultTableModes } = await import('../pro/ProResultTableModes.svelte');
const { modelStore, resultsStore, uiStore } = await import('../../lib/store');

describe('the maximum-by-type table with combinations defined and none solved', () => {
  afterEach(() => { resultsStore.clear3D(); modelStore.clear(); uiStore.analysisMode = '2d'; });

  it('says the combinations are not solved instead of reading the unfactored cases', () => {
    uiStore.analysisMode = 'pro';
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    modelStore.addElement(a, b, 'frame');
    const caseId = modelStore.model.loadCases[0]!.id;
    modelStore.addCombination('1.4D', [{ caseId, factor: 1.4 }]);
    resultsStore.setResults3D({ displacements: [], reactions: [], elementForces: [] } as never);
    const html = render(ProResultTableModes, { props: { kind: 'forces', mode: 'maxType' } }).body;
    expect(html).toContain('data-testid="tm-maxtype-unsolved"');
  });
});
