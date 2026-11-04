/**
 * Every user action that reaches an engine-only computation says so when the engine cannot answer.
 *
 * The combinations, the seismic arithmetic, the footing check, the section stresses and
 * capacities, the shell recombination, the station forces and the design checks come from the
 * engine only; without it they throw `EngineUnavailableError`, and when it refuses,
 * `EngineCheckError`. A button whose handler let that escape did nothing visible (Codex, #321:
 * the combination generator and the auto-loads preview). Here each entry point is run with the
 * engine down and must end in a visible message (a toast, a BLOCKED plan, an error string or a
 * panel state), never an exception.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const flags = vi.hoisted(() => ({ loads: 'up' as 'up' | 'down' | 'refuse', init: 'up' as 'up' | 'down', combos: 'up' as 'up' | 'down' }));

vi.mock('../../engine/wasm-solver', async (orig) => {
  const actual = await orig<typeof import('../../engine/wasm-solver')>();
  const { EngineUnavailableError, EngineCheckError } = await import('../../engine/engine-unavailable');
  return {
    ...actual,
    loadsRequest: (req: { op: string } & Record<string, unknown>) => {
      if (flags.loads === 'down') throw new EngineUnavailableError(`load generation (${req.op})`);
      if (flags.loads === 'refuse') throw new EngineCheckError(`load generation (${req.op})`, 'Parse error: invalid input');
      return actual.loadsRequest(req);
    },
    initSolver: async () => {
      if (flags.init === 'down') throw new Error('Failed to fetch WASM binary: HTTP 404');
      return actual.initSolver();
    },
  };
});

vi.mock('../../engine/solver-service', async (orig) => {
  const actual = await orig<typeof import('../../engine/solver-service')>();
  const { EngineUnavailableError } = await import('../../engine/engine-unavailable');
  return {
    ...actual,
    solveCombinations3D: (...args: Parameters<typeof actual.solveCombinations3D>) => {
      if (flags.combos === 'down') throw new EngineUnavailableError('the shell stresses of the combinations');
      return actual.solveCombinations3D(...args);
    },
  };
});

import { uiStore } from '../ui.svelte';
import { modelStore } from '../model.svelte';
import { regulationsStore } from '../regulations.svelte';
import { runEngineAction, runEngineActionAsync, engineGuarded } from '../engine-action';
import { templateCombinationSpecs } from '../generated-combinations';
import { codeSa } from '../spectral-cases';
import { buildLoadPlan, type LoadPlanInput } from '../../engine/loads/load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../codes/roles';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import { EngineUnavailableError } from '../../engine/engine-unavailable';
import { t } from '../../i18n';

const lastToast = () => uiStore.toasts[uiStore.toasts.length - 1];

function planInput(): LoadPlanInput {
  const reg = defaultRegulations();
  const applied = { ...reg } as ProjectRegulations;
  for (const k of Object.keys(applied) as Array<keyof ProjectRegulations>) {
    if (applied[k].adapterId) applied[k] = { ...applied[k], configComplete: true, state: 'applied' };
  }
  const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }], [3, { id: 3, x: 6, y: 0, z: 3 }]]);
  const elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }], [2, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 1, materialId: 1 }]]);
  return {
    regulations: applied,
    model: { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }] },
    dead: [{ labelKey: 'a', q: 1.0 }],
    occupancyKey: 'vivienda', tributaryWidth: 3, reductionElementKind: 'interiorBeam', floorsSupported: 1,
    applyLiveReduction: true, generateCombinations: true,
  } as LoadPlanInput;
}

beforeEach(() => { flags.loads = 'up'; flags.init = 'up'; flags.combos = 'up'; });
afterEach(() => { flags.loads = 'up'; flags.init = 'up'; flags.combos = 'up'; });

describe('the helpers', () => {
  it('runEngineAction shows "engine not available" and returns undefined; other errors still throw', () => {
    const before = uiStore.toasts.length;
    expect(runEngineAction(() => { throw new EngineUnavailableError('x'); })).toBeUndefined();
    expect(uiStore.toasts.length).toBe(before + 1);
    expect(lastToast()).toMatchObject({ type: 'error', message: t('engine.unavailable') });
    expect(() => runEngineAction(() => { throw new TypeError('a defect'); })).toThrow(TypeError);
    expect(runEngineAction(() => 7)).toBe(7);
  });

  it('runEngineActionAsync does the same for an async action', async () => {
    await expect(runEngineActionAsync(async () => { throw new EngineUnavailableError('x'); })).resolves.toBeUndefined();
    expect(lastToast()).toMatchObject({ type: 'error', message: t('engine.unavailable') });
  });

  it('engineGuarded gives a derived its message instead of an exception', () => {
    expect(engineGuarded(() => { throw new EngineUnavailableError('x'); })).toEqual({ value: null, error: t('engine.unavailable') });
    expect(engineGuarded(() => 3)).toEqual({ value: 3, error: null });
  });
});

describe('each entry point, with the engine down', () => {
  it('the auto-loads preview: the plan is BLOCKED and says "engine not available"', () => {
    expect(buildLoadPlan(planInput()).outcome).toBe('READY');
    flags.loads = 'down';
    const p = buildLoadPlan(planInput());
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys).toEqual([{ key: 'engine.unavailable' }]);
  });

  it('the auto-loads preview: an engine refusal is BLOCKED with the engine\'s own words', () => {
    flags.loads = 'refuse';
    const p = buildLoadPlan(planInput());
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys[0]!.key).toBe('engine.failedWith');
    expect(String(p.blockedKeys[0]!.params?.message)).toContain('Parse error: invalid input');
  });

  it('the combination generator (ProLoadsTab) and the rules seed (ProCombinationRules): a toast, no exception', () => {
    flags.loads = 'down';
    const before = uiStore.toasts.length;
    const out = runEngineAction(() => templateCombinationSpecs('lrfd', { L: true } as never, []));
    expect(out).toBeUndefined();
    expect(uiStore.toasts.length).toBe(before + 1);
    expect(lastToast()!.message).toBe(t('engine.unavailable'));
    // And both components route their handlers through it.
    const tab = read('components/pro/ProLoadsTab.svelte');
    expect(tab).toMatch(/runEngineAction\(\(\) => buildCandidates\(template\)\)/);
    expect(tab.match(/candidateCombos = buildCandidates\(/g)).toBeNull();
    expect(read('components/pro/ProCombinationRules.svelte')).toMatch(/runEngineAction\(\(\) => \[\.\.\.generateCombinations/);
  });

  it('opening a PRO example while the engine failed to load: a toast, nothing half-loaded', async () => {
    flags.init = 'down';
    const ex = PRO_EXAMPLES.find((e) => e.combinations !== 'own')!;
    await expect(ex.load()).rejects.toBeInstanceOf(EngineUnavailableError);
    const before = uiStore.toasts.length;
    expect(await runEngineActionAsync(async () => { await ex.load(); return true; })).toBeUndefined();
    expect(uiStore.toasts.length).toBe(before + 1);
    expect(read('components/pro/ProPanel.svelte')).toMatch(/runEngineActionAsync\(async \(\) => \{ await ex\.load\(\); return true; \}\)/);
  });

  it('the code spectrum of a spectral case: the reason, as the string the solve reports', () => {
    regulationsStore.configureRole('seismic', { zone: 3, site: 'SB' }, true);
    expect(typeof codeSa()).toBe('function');
    flags.loads = 'down';
    expect(codeSa()).toBe(t('engine.unavailable'));
  });

  it('a combination solve whose shell recombination needs the kernel: the solve\'s error string', () => {
    modelStore.clear();
    flags.combos = 'down';
    expect(modelStore.solveCombinations3D(false, false, true)).toBe(t('engine.unavailable'));
  });
});

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p: string) => readFileSync(SRC + p, 'utf8');

describe('the remaining entry points route the engine error to the screen', () => {
  // Their behaviour is the helpers' above; this pins that each one uses them.
  it.each([
    ['components/pro/steel/SteelResultsTable.svelte', /engineGuarded\(/, /data-testid="steel-results-engine"/],
    ['components/pro/steel/TensionRuptureTable.svelte', /engineGuarded\(/, /data-testid="tc-results-engine"/],
    ['components/pro/ProResultTableModes.svelte', /engineGuarded\(/, /data-testid="tm-maxtype-engine"/],
    ['components/CirsocFlexPanel.svelte', /isEngineUnavailable\(e\)/, /engineGuarded\(\(\) => fcoSurfaceCut/],
    ['components/SectionStressPanel.svelte', /stressFailure/, /data-testid="stress-engine-failure"/],
    ['components/pro/ProOtherCodesPanel.svelte', /engineFailureText\(err\)/, /data-testid="other-codes-run-error"/],
    ['components/pro/ProSteelOptimise.svelte', /errorDetail/, /data-testid="so-error"/],
    ['lib/store/steel-optimise.svelte.ts', /engineFailed\(err\)/, /errorDetail/],
    ['lib/store/detailing.svelte.ts', /lastError = errorText\(e\)/, /from '.\/engine-action'/],
    ['lib/store/design-run.svelte.ts', /isEngineUnavailable\(err\)/, /fail\('engine\.unavailable'\)/],
    ['lib/export/excel.ts', /runEngineActionAsync\(\(\) => buildExcelWorkbook/, /export async function buildExcelWorkbook/],
    ['lib/pro/report-export.ts', /runEngineActionAsync\(\(\) => exportReportWithEngine/, /async function exportReportWithEngine/],
    ['lib/store/model.svelte.ts', /engineFailureMessage\(err\)/, /return tp\(m\.key, m\.params \?\? \{\}\);/],
    ['lib/engine/codes/argentina/serviceability.ts', /isEngineUnavailable\(err\)/, /no verificado/],
    ['components/pro/ProAdvancedTab.svelte', /previewCodeSpectrum\(/, /from '..\/..\/lib\/store\/spectrum-preview'/],
    ['components/pro/ProAutoLoadsDialog.svelte', /previewCodeSpectrum\(/, /from '..\/..\/lib\/store\/spectrum-preview'/],
  ])('%s', (file, a, b) => {
    const s = read(file);
    expect(s).toMatch(a);
    expect(s).toMatch(b);
  });
});
