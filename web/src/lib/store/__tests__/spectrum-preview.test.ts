import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const flags = vi.hoisted(() => ({ failure: 'none' as 'none' | 'missing' | 'refused' | 'defect' }));
vi.mock('../../engine/wasm-solver', async (orig) => {
  const actual = await orig<typeof import('../../engine/wasm-solver')>();
  const { EngineUnavailableError, EngineCheckError } = await import('../../engine/engine-unavailable');
  return {
    ...actual,
    loadsRequest: (req: { op: string } & Record<string, unknown>) => {
      if (flags.failure === 'missing') throw new EngineUnavailableError('load generation');
      if (flags.failure === 'refused') throw new EngineCheckError('load generation', 'Parse error: invalid input');
      if (flags.failure === 'defect') throw new TypeError('unexpected defect');
      return actual.loadsRequest(req);
    },
  };
});

import ProAdvancedTab from '../../../components/pro/ProAdvancedTab.svelte';
import { designSpectrum } from '../../codes/cirsoc103/spectrum';
import { isWasmReady } from '../../engine/wasm-solver';
import { t, tp } from '../../i18n';
import { previewCodeSpectrum } from '../spectrum-preview';

afterEach(() => { flags.failure = 'none'; });

describe('code spectrum previews', () => {
  it('preserves healthy spectra and regulation refusals', () => {
    for (const inputs of [
      { zone: 3, site: 'SD' },
      { zone: 0, site: 'SD' },
      { zone: 3, site: 'SF' },
    ] as const) {
      expect(previewCodeSpectrum(inputs)).toEqual(designSpectrum(inputs));
    }
  });

  it('reports a missing export even though WASM is initialized', () => {
    expect(isWasmReady()).toBe(true);
    flags.failure = 'missing';
    expect(previewCodeSpectrum({ zone: 3, site: 'SD' })).toEqual({
      blocked: { key: 'engine.unavailable' }, refs: [],
    });
  });

  it('preserves the engine refusal message', () => {
    flags.failure = 'refused';
    expect(previewCodeSpectrum({ zone: 3, site: 'SD' })).toEqual({
      blocked: { key: 'engine.failedWith', params: { message: 'Parse error: invalid input' } }, refs: [],
    });
  });

  it('does not hide unrelated programming errors', () => {
    flags.failure = 'defect';
    expect(() => previewCodeSpectrum({ zone: 3, site: 'SD' })).toThrow(TypeError);
  });

  it.each(['missing', 'refused'] as const)('renders the %s engine failure in the Advanced panel', (failure) => {
    expect(isWasmReady()).toBe(true);
    flags.failure = failure;
    const html = render(ProAdvancedTab, { props: { advancedResults: {} } }).body;
    expect(html).toContain('data-testid="spectral-basis"');
    expect(html).toContain(failure === 'missing'
      ? t('engine.unavailable')
      : tp('engine.failedWith', { message: 'Parse error: invalid input' }));
  });
});
