import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { historyStore, modelStore, resultsStore, uiStore } from '../../store';
import { solveModal } from '../wasm-solver';

const FRAMES = ['portal-frame', 'two-story-frame', 'building-3story-dlw', 'frame-seismic', 'three-hinge-arch', 'thermal'];

type Diagnosed = { structuredDiagnostics?: Array<{ code: string; phase?: string }> } | null | undefined;
const knownIssues = (r: Diagnosed) => (r?.structuredDiagnostics ?? []).filter((d) => d.code === 'known_issue').map((d) => d.phase ?? '');
const secondOrder = (r: Diagnosed) => knownIssues(r).filter((p) => p.startsWith('LIN-SECOND-ORDER'));
const densities = () => new Map([...modelStore.materials].map(([id, m]) => [id, ((m.rho ?? 78.5) * 1000) / 9.81]));

async function load(name: string) {
  historyStore.clear();
  uiStore.analysisMode = '2d';
  modelStore.clear();
  await modelStore.loadExample(name);
}

beforeAll(() => { uiStore.analysisMode = '2d'; });
afterEach(() => { resultsStore.clear(); });

describe('second-order screen on the Basic 2D frames (#1551)', () => {
  it.each(FRAMES)('%s carries no second-order warning', async (name) => {
    await load(name);
    const single = modelStore.solve(false);
    expect(typeof single).not.toBe('string');
    expect(secondOrder(single as Diagnosed)).toEqual([]);
    const combos = modelStore.solveCombinations(false);
    expect(combos && typeof combos !== 'string').toBe(true);
    if (!combos || typeof combos === 'string') return;
    for (const r of [...combos.perCase.values(), ...combos.perCombo.values(), combos.envelope.maxAbsResults]) {
      expect(secondOrder(r as Diagnosed)).toEqual([]);
    }
  }, 60_000);

  it('the steel portal near its critical load (λ₁ ≈ 4) still warns', async () => {
    await load('portal-second-order');
    const single = modelStore.solve(false);
    expect(secondOrder(single as Diagnosed)).toContain('LIN-SECOND-ORDER');
  }, 60_000);
});

describe('rotary inertia in modal analysis (#370)', () => {
  it.each(FRAMES)('%s: modal analysis carries neither half of #370', async (name) => {
    await load(name);
    const modal = solveModal(modelStore.buildSolverInput(false)!, densities());
    expect(modal.modes.length).toBeGreaterThan(0);
    expect(knownIssues(modal as Diagnosed)).not.toContain('NL-DYNAMIC-GAPS');
    expect(knownIssues(modal as Diagnosed)).not.toContain('NL-UNCONVERGED-INCREMENT');
  }, 60_000);

  it('a deep beam (L/h = 3) still warns', async () => {
    await load('deep-beam-bar');
    const concrete = new Map([...modelStore.materials.keys()].map((id) => [id, 2500]));
    const modal = solveModal(modelStore.buildSolverInput(false)!, concrete);
    expect(knownIssues(modal as Diagnosed)).toContain('NL-DYNAMIC-GAPS');
    expect(knownIssues(modal as Diagnosed)).not.toContain('NL-UNCONVERGED-INCREMENT');
  }, 60_000);
});

describe('an advisory is shown once', () => {
  it('the results table does not repeat a warning the canvas banner shows', async () => {
    await load('portal-frame');
    const clean = modelStore.solve(false);
    expect(typeof clean).not.toBe('string');
    const warned = { ...(clean as object), structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'NL-3', value: 426, message: 'ENGINE' }] };
    resultsStore.setResults(warned as never);
    expect(resultsStore.knownIssues.messages.join(' ')).toContain('#426');
    const { default: ResultsTable } = await import('../../../components/tables/ResultsTable.svelte');
    const html = render(ResultsTable).body;
    expect(html).not.toContain('#426');
    expect(html).not.toContain('role="alert"');
  }, 60_000);

  it('the Advanced panel does not render the known-issue messages', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../../../components/toolbar/ToolbarAdvanced.svelte', import.meta.url), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '');
    expect(source).not.toMatch(/knownIssues3?D?\)?\.messages/);
  });
});
