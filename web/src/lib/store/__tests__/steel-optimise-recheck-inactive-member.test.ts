/**
 * An inactive member sharing an optimised section.
 *
 * The optimiser does not design an inactive member, but the section row still lists it, since
 * the section is replaced in place for every member using it. The re-verification required one
 * checked member per listed id, so a row with an inactive member read "not re-verified" after
 * every solve. It now requires every designed member, and only those, as the proposal did.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { profileToSectionFull, PROFILE_FAMILIES } from '../../data/steel-profiles';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { steelOptimise } from '../steel-optimise.svelte';

describe('optimiser recheck with an inactive member sharing the section', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; steelOptimise.clearApplied(); });

  function solve() {
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
  }

  it('re-verifies a section row after a new solve', () => {
    modelStore.clear();
    historyStore.clear();
    const heavy = PROFILE_FAMILIES.IPE[PROFILE_FAMILIES.IPE.length - 1]!;
    const sid = modelStore.addSection({ name: heavy.name, profileFamily: heavy.family, ...profileToSectionFull(heavy) } as never);
    const mid = modelStore.addMaterial({ name: 'S235', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400 } as never);
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 4), modelStore.addNode(6, 0, 4), modelStore.addNode(6, 0, 0)];
    const ids = [modelStore.addElement(n[0]!, n[1]!, 'frame'), modelStore.addElement(n[3]!, n[2]!, 'frame'), modelStore.addElement(n[1]!, n[2]!, 'frame')];
    const brace = modelStore.addElement(n[0]!, n[2]!, 'frame');
    for (const id of [...ids, brace]) { modelStore.updateElementSection(id, sid); modelStore.updateElementMaterial(id, mid); }
    modelStore.updateElement(brace, { behaviour: 'inactive' } as never);
    modelStore.addSupport(n[0]!, 'fixed3d');
    modelStore.addSupport(n[3]!, 'fixed3d');
    modelStore.addDistributedLoad3D(ids[2]!, 0, 0, -15, -15);
    solve();
    const hasBraceForces = resultsStore.results3D!.elementForces.some((f) => f.elementId === brace);
    steelOptimise.run('section');
    expect(steelOptimise.rows).toHaveLength(1);
    expect(steelOptimise.rows[0]!.elementIds).toContain(brace);
    steelOptimise.apply([steelOptimise.rows[0]!.key]);
    solve();
    steelOptimise.recheck();
    // The solve reports the inactive member's forces; the checker skips it all the same.
    expect(hasBraceForces).toBe(true);
    expect(steelOptimise.applied[0]!.status).not.toBe('unchecked');
    expect(steelOptimise.awaitingReverify).toBe(false);
  });
});
