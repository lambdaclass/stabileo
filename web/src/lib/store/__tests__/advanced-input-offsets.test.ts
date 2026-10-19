/**
 * The advanced analyses' input is built without the helper nodes and rigid arms that carry a
 * declared insertion (`dynamic-input.ts` `centerlineInput`, `seismic-modes.ts`). It used to be
 * handed out anyway: a model whose beams hang h/2 under their nodes got modes, spectra and
 * histories of the same beams centred on the nodes, presented as the model's. Refused now, as the
 * internal joints are; the static solve keeps them.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { centerlineInput, dynamicInput } from '../dynamic-input';
import { planModalResult } from '../seismic-modes';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

function portal(offset: boolean) {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(5, 0, 3), d = modelStore.addNode(5, 0, 0);
  modelStore.addElement(a, b, 'frame'); const beam = modelStore.addElement(b, c, 'frame'); modelStore.addElement(c, d, 'frame');
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'fixed3d');
  if (offset) modelStore.setElementOffset(beam, { frame: 'global', i: { x: 0, y: 0, z: -0.25 }, j: { x: 0, y: 0, z: -0.25 } });
}

describe('an advanced analysis of a model with declared insertions', () => {
  it('is refused, not solved centred', () => {
    portal(true);
    expect(() => centerlineInput()).toThrow(t('advanced.offsetsUnsupported'));
    expect(() => dynamicInput()).toThrow(t('advanced.offsetsUnsupported'));
    expect(planModalResult({ distributed: [], surface: [] } as never, 0.25)).toEqual({ error: t('advanced.offsetsUnsupported') });
    // The static solve carries them: two arms for the beam's two ends.
    const input = modelStore.buildSolverInput3D(false, false)!;
    expect((input.constraints ?? []).filter((x) => (x as { type: string }).type === 'eccentricConnection').length).toBe(2);
  });

  it('runs as before where the model declares none', () => {
    portal(false);
    const input = centerlineInput();
    expect(input.constraints ?? []).toEqual([]);
    expect(input.nodes.size).toBe(4);
  });
});
