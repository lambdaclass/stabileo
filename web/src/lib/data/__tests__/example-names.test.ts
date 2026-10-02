/**
 * A gallery example opens with its names in the app's language: the project, its load cases,
 * its materials and the combinations built from them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { setLocale } from '../../i18n';
import { PRO_EXAMPLES } from '../pro-examples';

beforeAll(async () => { await initSolver(); uiStore.analysisMode = 'pro'; });
afterAll(() => setLocale('en'));

const load = (id: string) => PRO_EXAMPLES.find((e) => e.id === id)!.load();

describe('example names', () => {
  it('open in English when the app is in English', async () => {
    setLocale('en');
    await load('pro-simple-shed');
    expect(modelStore.model.name).toBe('Simple shed');
    const cases = modelStore.model.loadCases.map((c) => c.name);
    expect(cases).toContain('Dead load');
    expect(cases).toContain('Wind X');
    expect(cases.join()).not.toMatch(/Cargas|Viento|Sobrecarga/);
    expect([...modelStore.materials.values()].map((m) => m.name)).toContain('F-24 steel');
    expect(modelStore.combinations.map((c) => c.name).join()).not.toMatch(/Viento/);
  });

  it('open in Portuguese, fixtures written in English included', async () => {
    setLocale('pt');
    await load('pro-simple-shed');
    expect(modelStore.model.name).toBe('Galpão simples');
    expect(modelStore.model.loadCases.map((c) => c.name)).toContain('Vento X');
    await load('3d-building');
    expect(modelStore.model.loadCases.map((c) => c.name)).toContain('Cargas permanentes');
  });

  it('keep a name the table does not know as written', async () => {
    setLocale('en');
    await load('3d-nave-industrial');
    expect([...modelStore.sections.values()].map((s) => s.name)).toContain('Carrilera IPN500');
  });
});
