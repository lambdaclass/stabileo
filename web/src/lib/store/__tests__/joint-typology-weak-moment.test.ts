/**
 * The joint typologies design the strong-axis moment only (#532): a beam framing into a column
 * and pushed sideways carries a weak-axis moment at the joint, which leaves the joint unresolved.
 * A 4 m IPE cantilever from the top of a 3 m column; 10 kN at its tip along Y (weak axis):
 * Mz at the root = 40 kN·m by statics.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import { resultsStore } from '../results.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { profileToSectionFull, PROFILE_FAMILIES } from '../../data/steel-profiles';
import { publishCombinations3D } from '../active-results';
import { typologyContext } from '../joint-typology';
import { proposeAndSize } from '../../connection/typology';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

function cantileverOnColumn(fy: number, fz: number) {
  const ipe = PROFILE_FAMILIES.IPE[10]!;
  const sid = modelStore.addSection({ name: ipe.name, profileFamily: ipe.family, ...profileToSectionFull(ipe) } as never);
  const mid = modelStore.addMaterial({ name: 'S235', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400 } as never);
  const base = modelStore.addNode(0, 0, 0), top = modelStore.addNode(0, 0, 3), tip = modelStore.addNode(4, 0, 3);
  const column = modelStore.addElement(base, top, 'frame'), beam = modelStore.addElement(top, tip, 'frame');
  for (const id of [column, beam]) { modelStore.updateElementSection(id, sid); modelStore.updateElementMaterial(id, mid); }
  modelStore.addSupport(base, 'fixed3d');
  const D = modelStore.model.loadCases[0]!.id;
  modelStore.addNodalLoad3D(tip, 0, fy, fz, 0, 0, 0, D);
  modelStore.addCombination('1.0D', [{ caseId: D, factor: 1 }]);
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const combos = modelStore.solveCombinations3D(false, false, true);
  if (!combos || typeof combos === 'string') throw new Error(String(combos));
  publishCombinations3D(combos);
  resultsStore.activeView = 'single';
  return { top, column, beam };
}

describe('joint typology with a weak-axis moment', () => {
  it('reads the beam end weak-axis moment and leaves the joint unresolved', () => {
    const { top, column, beam } = cantileverOnColumn(10, 0);
    const ctx = typologyContext(top, [column, beam])!;
    const b = ctx.members.find((m) => m.id === beam)!;
    expect(b.Mw).toBeCloseTo(40, 6);
    expect(b.M).toBeCloseTo(0, 6);
    const d = proposeAndSize(ctx);
    expect('unresolvedKey' in d && d.unresolvedKey).toBe('joint.typ.unresolved.weakAxisMoment');
  });

  it('the same beam loaded downward is designed', () => {
    const { top, column, beam } = cantileverOnColumn(0, -10);
    const ctx = typologyContext(top, [column, beam])!;
    const b = ctx.members.find((m) => m.id === beam)!;
    expect(b.M).toBeCloseTo(40, 6);
    expect(b.Mw).toBeCloseTo(0, 6);
    const d = proposeAndSize(ctx);
    expect('unresolvedKey' in d ? d.unresolvedKey : undefined).not.toBe('joint.typ.unresolved.weakAxisMoment');
  });
});
