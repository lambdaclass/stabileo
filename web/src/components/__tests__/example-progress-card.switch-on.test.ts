/**
 * A gallery example on its way in says so, step by step, so a building opening does not look like
 * the app hung; the card goes when the example is in.
 */
import { afterEach, describe, expect, it, vi, beforeAll } from 'vitest';
import { render } from 'svelte/server';
import ExampleProgressCard from '../pro/ExampleProgressCard.svelte';
import { exampleProgress } from '../../lib/store/example-progress.svelte';
import { setLocale } from '../../lib/i18n';
import { modelStore } from '../../lib/store/model.svelte';
import { uiStore } from '../../lib/store/ui.svelte';
import '../../lib/store';
import { initSolver } from '../../lib/engine/wasm-solver';
import { PRO_EXAMPLES } from '../../lib/data/pro-examples';

const text = (html: string) => html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, '');

beforeAll(async () => { await initSolver(); });
afterEach(() => { exampleProgress.end(); setLocale('en'); vi.restoreAllMocks(); });

describe('the example card', () => {
  it('names the example and the step it is on, and is gone when it ends', () => {
    setLocale('es');
    exampleProgress.begin('ex.pro-rc-party-wall');
    expect(text(render(ExampleProgressCard).body)).toContain('Abriendo «Edificio entre medianeras con ascensor y escalera»');
    expect(text(render(ExampleProgressCard).body)).toContain('Cargando el modelo');
    exampleProgress.step('loads');
    expect(text(render(ExampleProgressCard).body)).toContain('Generando las cargas por norma y sus combinaciones');
    exampleProgress.end();
    expect(text(render(ExampleProgressCard).body)).toBe('');
  });

  it('follows a building from its model through its generated loads to its drawing, and ends with it', async () => {
    uiStore.analysisMode = 'pro'; modelStore.clear();
    const steps: string[] = [];
    const step = exampleProgress.step.bind(exampleProgress);
    vi.spyOn(exampleProgress, 'step').mockImplementation((s) => { steps.push(s); step(s); });
    const loading = PRO_EXAMPLES.find((e) => e.id === 'pro-rc-house')!.load();
    expect(exampleProgress.now).toMatchObject({ nameKey: 'ex.pro-rc-house', step: 'model' });
    await loading;
    expect(steps).toEqual(['loads', 'draw']);
    expect(exampleProgress.now).toBeNull();
  }, 120_000);
});
