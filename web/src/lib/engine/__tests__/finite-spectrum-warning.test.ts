import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ToolbarAdvanced from '../../../components/toolbar/ToolbarAdvanced.svelte';
import FiniteSpectrumWarning from '../../../components/advanced/FiniteSpectrumWarning.svelte';
import { resultsStore, uiStore } from '../../store';
import { setLocale, t } from '../../i18n';
import { solveModal3D } from '../wasm-solver';
import type { ModalResult3D } from '../result-types';
import type { SolverInput3D } from '../types-3d';
import { finiteSpectrumWarning } from '../finite-spectrum-warning';

// A cantilever with translational tip mass and exactly massless rotations.
const input: SolverInput3D = {
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]]),
  materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]]),
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
  supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
  loads: [], masses: { nodal: [{ nodeId: 2, mass: 1 }] },
};

afterEach(() => {
  resultsStore.clearModal(); resultsStore.clearModal3D();
  uiStore.analysisMode = '2d'; setLocale('en');
});

describe('finite spectrum result warnings', () => {
  it.each(['en', 'es', 'pt', 'de', 'fr', 'tr'])('renders the exhausted massless model in %s', (locale) => {
    const result: ModalResult3D = solveModal3D(input, new Map(), 6);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') throw new Error(result);
    expect(result.modes).toHaveLength(3);
    expect(result.finiteSpectrumDiagnostic).toBeTruthy();
    setLocale(locale);
    const warning = finiteSpectrumWarning(result, t);
    expect(warning).toContain('3');
    expect(warning).not.toContain('advanced.finiteSpectrum');
    expect(warning).not.toContain('{n}');
    // Same production result presenter serves both workspace dimensions.
    for (const workspace of ['2d', '3d'] as const) {
      uiStore.analysisMode = workspace;
      if (workspace === '3d') resultsStore.setModalResult3D(result);
      else resultsStore.setModalResult({ ...result, modes: result.modes.map(m => ({
        ...m, displacements: m.displacements.map(d => ({ nodeId: d.nodeId, ux: d.ux, uy: d.uz, rz: d.ry })),
      })) });
      const html = render(ToolbarAdvanced, { props: { flat: true } }).body;
      expect(html).toContain('data-testid="finite-spectrum-warning"');
      expect(html).toContain(warning);
    }
    expect(render(FiniteSpectrumWarning, { props: { result } }).body).toContain(warning);
  });

  it('does not claim exhaustion without the engine diagnostic', () => {
    const result = { modes: [{ frequency: 1 }] };
    expect(finiteSpectrumWarning(result, t)).toBe('');
    expect(render(FiniteSpectrumWarning, { props: { result } }).body).not.toContain('role="status"');
  });
});
