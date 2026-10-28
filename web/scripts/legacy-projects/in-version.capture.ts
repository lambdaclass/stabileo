/**
 * Runs INSIDE a released version's checkout (#718), never in this one.
 *
 * `generate.mjs` copies this file into `<tag>/web/src/lib/__legacy_capture__/generate.test.ts`,
 * next to `capture-results.ts` and `compare.mjs`, and runs it with that version's own Vitest.
 * Everything below is that version's code: its example loader, its solve entry point, its
 * results store and its `.ded` writer. So the files it writes are what an engineer using that
 * release would have saved, and the results are what that release showed.
 *
 * It uses only what every released version has had since v0.2.0. The solve goes through
 * `solveNow` where the version has it (v0.4.0 on) and `ensureResults` before: both are what
 * Calcular ran in that release. It is plain on purpose: it is not typechecked here (it lives
 * outside `src/`), and it has to compile against several versions of the stores.
 *
 * Input: LEGACY_PLAN, a JSON file `{ out, examples: [{ id, workspace, solve }], session: [{ id, workspace }] }`.
 * Output, in `out`: `<id>.ded`, `<id>.results.json` (flat values), `session.ded`, `run.json`.
 */
import { it, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { modelStore } from '../store/model.svelte';
import { historyStore } from '../store/history.svelte';
import { uiStore } from '../store/ui.svelte';
import { resultsStore } from '../store/results.svelte';
import { tabManager } from '../store/tabs.svelte';
import '../store';
import * as file from '../store/file';
import * as solveActions from '../actions/solve';
import { setLocale } from '../i18n';
import { initSolver } from '../engine/wasm-solver';
import { resultValues, type Values } from './capture-results';

interface PlanExample { id: string; workspace: '2d' | '3d' | 'pro'; solve: boolean }
interface Plan { out: string; examples: PlanExample[]; session: Array<{ id: string; workspace: '2d' | '3d' | 'pro' }> }

const plan: Plan = JSON.parse(readFileSync(process.env.LEGACY_PLAN!, 'utf8'));
mkdirSync(plan.out, { recursive: true });

const actions = solveActions as unknown as Record<string, () => Promise<{ ok: boolean; error?: string }>>;
const solve = actions.solveNow ?? actions.ensureResults;
const solveEntry = actions.solveNow ? 'solveNow' : 'ensureResults';

/** A fresh session's state, in the workspace the example is opened in (the app's defaults). */
function reset(workspace: PlanExample['workspace']): void {
  modelStore.clear();
  historyStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = workspace;
  uiStore.axisConvention3D = 'rightHand';
  // PRO opens with self-weight on, Basic with it off: the results snapshot gate's rule.
  uiStore.includeSelfWeight = workspace === 'pro';
}

async function solveAndRecord(values: Values): Promise<void> {
  const outcome = await solve();
  values['solve.ok'] = outcome.ok;
  if (!outcome.ok) values['solve.refusal'] = outcome.error ?? '';
  else resultValues(resultsStore as never, uiStore.is3DWorkspace, values);
}

beforeAll(async () => {
  setLocale('en');
  await initSolver();
});

const run: Record<string, unknown> = { solveEntry, examples: {} as Record<string, unknown> };

for (const ex of plan.examples) {
  it(ex.id, async () => {
    reset(ex.workspace);
    await modelStore.loadExample(ex.id);
    const values: Values = {
      'model.nodes': modelStore.nodes.size,
      'model.elements': modelStore.elements.size,
      'model.shells': (modelStore.quads?.size ?? 0) + (modelStore.plates?.size ?? 0),
    };
    if (ex.solve) await solveAndRecord(values);
    // Saved after the solve, as an engineer saves: the file carries what that version stamps on it.
    writeFileSync(join(plan.out, `${ex.id}.ded`), file.serializeProject());
    writeFileSync(join(plan.out, `${ex.id}.results.json`), JSON.stringify(values));
    (run.examples as Record<string, unknown>)[ex.id] = { analysisMode: uiStore.analysisMode };
  }, 300_000);
}

it('session', async () => {
  // A session file: several tabs, each an example solved in its workspace, written by the
  // version's own session writer (the v1 session envelope every release has written).
  tabManager.init();
  for (const [i, ex] of plan.session.entries()) {
    if (i > 0) tabManager.createTab();
    uiStore.analysisMode = ex.workspace;
    uiStore.includeSelfWeight = ex.workspace === 'pro';
    await modelStore.loadExample(ex.id);
    await solve();
  }
  // v0.2.0 and v0.3.0 could not write one: their `sessionPayload` called `$state.snapshot` from a
  // plain .ts module, a ReferenceError in the browser too (fixed before v0.4.0, `sessionTabsCopy`).
  // No session file of theirs exists, so none is made up: the error is recorded instead.
  try {
    writeFileSync(join(plan.out, 'session.ded'), file.sessionPayload().content);
  } catch (e) {
    writeFileSync(join(plan.out, 'session.unavailable.txt'), String((e as Error)?.message ?? e));
  }
}, 300_000);

it('run record', () => {
  writeFileSync(join(plan.out, 'run.json'), JSON.stringify(run));
});
