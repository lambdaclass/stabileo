import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ToolbarAdvanced from '../../../components/toolbar/ToolbarAdvanced.svelte';
import FiniteSpectrumWarning from '../../../components/advanced/FiniteSpectrumWarning.svelte';
import { resultsStore, uiStore } from '../../store';
import { setLocale, t } from '../../i18n';
import { solveModal3D } from '../wasm-solver';
import type { ModalResult3D } from '../result-types';
import type { SolverInput3D } from '../types-3d';
import { finiteSpectrumWarning, eigenRefusalText } from '../finite-spectrum-warning';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

  it('says one finite mode in the singular', () => {
    setLocale('en');
    expect(finiteSpectrumWarning({ modes: [{}], finiteSpectrumDiagnostic: 'x' }, t)).toBe('Only 1 finite mode exists. Massless directions have no finite frequency.');
  });
});

describe('modal refusals in the user language', () => {
  const engine = (path: string) => readFileSync(fileURLToPath(new URL(`../../../../../engine/src/${path}`, import.meta.url)), 'utf8');
  const belowThreshold = 'Eigenvalue decomposition failed: Modal completeness could not be established: only 5 of 7 computed modes passed the positive-frequency threshold (omega² > 1e-10); no incomplete modes were returned. Check stiffness/mass conditioning and supports.';
  const notCertified = 'Eigenvalue decomposition failed: could not establish convergence and Sturm completeness for 42 free DOFs (factorization failure or iteration limit). Check supports and releases for mechanisms, stiffness/mass conditioning, or request fewer modes; no incomplete modes were returned.';

  it('matches the sentences the engine emits', () => {
    const modal = engine('solver/modal.rs');
    expect(modal.split(belowThreshold.replace('only 5 of 7', 'only {} of {}')).length - 1).toBe(2);
    expect(engine('linalg/lanczos.rs')).toContain(notCertified.replace('42', '{n}'));
    expect(engine('solver/buckling.rs').split('eigen_failure_message(').length - 1).toBeGreaterThan(0);
  });

  it.each(['en', 'es', 'pt', 'de', 'fr', 'tr'])('translates both refusals in %s', (locale) => {
    setLocale(locale);
    const below = eigenRefusalText(belowThreshold, t);
    const failed = eigenRefusalText(notCertified, t);
    for (const text of [below, failed]) {
      expect(text).not.toMatch(/advanced\.|\{n\}|\{m\}/);
      if (locale !== 'en') expect(text).not.toContain('Eigenvalue decomposition');
    }
    expect(below).toContain('5');
    expect(below).toContain('7');
    expect(failed).toContain('42');
    expect(failed).not.toMatch(/modal|Modal/);
    expect(eigenRefusalText('No valid modes found', t)).toBe('No valid modes found');
  });
});
