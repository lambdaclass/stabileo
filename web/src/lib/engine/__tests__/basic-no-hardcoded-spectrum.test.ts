/**
 * Basic must not run a hidden national-code seismic spectrum.
 *
 * `ToolbarAdvanced.svelte` — which renders only in Basic — used to expose a
 * "Espectral" button that called `cirsoc103Spectrum(4, 'II')`: CIRSOC 103,
 * seismic Zone 4, Soil II, hardcoded, with no UI to see or change either
 * parameter. The success toast reported only a base shear, so a student
 * anywhere other than that one zone and soil class received a confident,
 * unlabelled, wrong number.
 *
 * The action is removed until Basic can offer a generic, user-defined
 * spectrum. National-code presets stay in PRO, where zone and soil are already
 * selectable. The solver entrypoints are deliberately preserved.
 *
 * This is a source-level guard: the component is Svelte, and what matters is
 * that no Basic code path can construct the preset at all.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Every component reachable from the Basic left toolbar. */
const BASIC_TOOLBAR_SOURCES = [
  '../../../components/Toolbar.svelte',
  '../../../components/toolbar/ToolbarAdvanced.svelte',
  '../../../components/toolbar/ToolbarResults.svelte',
  '../../../components/toolbar/ToolbarExamples.svelte',
  '../../../components/toolbar/ToolbarConfig.svelte',
  '../../../components/toolbar/ToolbarProject.svelte',
  '../../../components/toolbar/ToolbarAiReview.svelte',
];

/** Strip block and line comments so the explanatory note does not match. */
function stripComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/.*$/gm, '');
}

describe('Basic cannot launch the hardcoded CIRSOC spectrum', () => {
  for (const rel of BASIC_TOOLBAR_SOURCES) {
    it(`${rel.split('/').pop()} never constructs a code spectrum`, () => {
      const code = stripComments(read(rel));
      expect(code).not.toContain('cirsoc103Spectrum');
      expect(code).not.toMatch(/Spectrum\s*\(\s*\d/); // any preset(zone, soil) call
    });
  }

  it('ToolbarAdvanced no longer calls the spectral solvers at all', () => {
    const code = stripComments(read('../../../components/toolbar/ToolbarAdvanced.svelte'));
    expect(code).not.toContain('solveSpectral');
    expect(code).not.toContain('wasmSpectral3D');
    expect(code).not.toContain('handleSpectral');
    expect(code).not.toContain('setSpectralResult');
  });

  it('the spectral button is gone from the Basic advanced panel', () => {
    const code = read('../../../components/toolbar/ToolbarAdvanced.svelte');
    // Other advanced actions are untouched — this is a targeted removal.
    expect(code).toContain("t('advanced.pdelta')");
    expect(code).toContain("t('advanced.buckling')");
    expect(code).toContain("t('advanced.dynamic')");
    expect(code).not.toContain("t('advanced.spectral')");
    expect(code).not.toContain("t('advanced.spectralLabel')");
  });

  it('the solver entrypoints are preserved for the future generic selector', async () => {
    const wasm = await import('../wasm-solver');
    expect(typeof wasm.solveSpectral).toBe('function');
    expect(typeof wasm.solveSpectral3D).toBe('function');
    // PRO's spectrum is the regulation's own (codes/cirsoc103/spectrum.ts); the invented
    // table `cirsoc103Spectrum` used to be, with wrong coefficients and a jump at Ts, is gone.
    const resultTypes = await import('../result-types');
    expect('cirsoc103Spectrum' in resultTypes).toBe(false);
  });

  it('PRO keeps its own selectable-zone spectral workflow, on the regulation spectrum', () => {
    const pro = read('../../../components/pro/ProAdvancedTab.svelte');
    expect(pro).not.toContain('cirsoc103Spectrum');
    // Zone and site come from state there, not from literals.
    expect(pro).toMatch(/designSpectrum\(\{\s*zone:\s*seismicZone\s*,\s*site:\s*siteClass\s*\}\)/);
  });
});
