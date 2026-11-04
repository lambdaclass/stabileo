/**
 * What the plastic collapse panel adds over the step-by-step result: which
 * picture the canvas shows (the steps, the collapse mechanism, or a mechanism
 * the user draws), the user's hinges and the reading of them, and the λ–δ
 * curve's choice of abscissa.
 *
 * The model and the plastic moments of the last run are kept with a stamp of
 * its result, so a mechanism is never checked against a model that has changed
 * since (the panel then asks for a new run).
 */
import type { SolverInput } from '../engine/types';
import type { PlasticCollapseResult } from '../engine/plastic-collapse';
import { evaluateUserMechanism, collapseMechanism, type UserHinge, type UserMechanism, type MechanismView } from '../engine/plastic/mechanism';
import { resultsStore } from './results.svelte';
import type { CurveAxis } from '../engine/plastic/curve';

export type PlasticView = 'steps' | 'mechanism' | 'user';

const stampOf = (r: { collapseFactor: number; hinges: unknown[]; steps: unknown[] }) => `${r.collapseFactor}:${r.hinges.length}:${r.steps.length}`;

function createPlasticCourse() {
  let run = $state.raw<{ input: SolverInput; mp: Map<number, number>; stamp: string } | null>(null);
  let view = $state<PlasticView>('steps');
  let picking = $state(false);
  let hinges = $state.raw<UserHinge[]>([]);
  let combine = $state(false);
  let userShows = $state<'mechanism' | 'moments'>('mechanism');
  let axis = $state.raw<CurveAxis | null>(null);

  const fresh = () => {
    const r = resultsStore.plasticResult;
    return run && r && stampOf(r) === run.stamp ? run : null;
  };
  const mpOf = (id: number) => fresh()?.mp.get(id) ?? Infinity;

  const user = $derived.by((): UserMechanism | null => {
    const ctx = fresh();
    if (!ctx || hinges.length === 0) return null;
    try { return evaluateUserMechanism(ctx.input, mpOf, hinges, { combine }); } catch { return null; }
  });
  const collapse = $derived.by((): MechanismView | null => {
    const ctx = fresh();
    const r = resultsStore.plasticResult as PlasticCollapseResult | null;
    if (!ctx || !r) return null;
    try { return collapseMechanism(ctx.input, r); } catch { return null; }
  });

  return {
    /** Called by the plastic action with what it ran. */
    remember(input: SolverInput, mp: Map<number, number>, result: PlasticCollapseResult) {
      run = { input, mp, stamp: stampOf(result) };
      view = 'steps'; picking = false; hinges = []; combine = false; axis = null;
    },
    get ready() { return fresh() !== null; },
    get input() { return fresh()?.input ?? null; },
    mpOf,
    get view() { return fresh() ? view : 'steps'; },
    set view(v: PlasticView) { view = v; if (v !== 'user') picking = false; },
    get picking() { return picking && fresh() !== null; },
    set picking(v: boolean) { picking = v; if (v) view = 'user'; },
    get hinges() { return hinges; },
    get combine() { return combine; },
    set combine(v: boolean) { combine = v; },
    get userShows() { return userShows; },
    set userShows(v: 'mechanism' | 'moments') { userShows = v; },
    get axis() { return axis; },
    set axis(v: CurveAxis | null) { axis = v; },
    get user() { return user; },
    get collapse() { return collapse; },
    toggleHinge(h: UserHinge) {
      const at = hinges.findIndex((x) => x.member === h.member && Math.abs(x.t - h.t) < 1e-6);
      hinges = at >= 0 ? hinges.filter((_, i) => i !== at) : [...hinges, h];
      combine = false;
    },
    removeHinge(i: number) { hinges = hinges.filter((_, k) => k !== i); combine = false; },
    clearHinges() { hinges = []; combine = false; },
  };
}

export const plasticCourse = createPlasticCourse();
