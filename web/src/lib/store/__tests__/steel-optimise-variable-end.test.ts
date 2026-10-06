/**
 * A section the optimiser resizes that is also a tapered member's end J.
 *
 * A section row replaces its section in place only when every member using it was checked. A
 * member of variable section names a section at J too, and is not designed: the in-place update
 * turned its IPE 600 end into the portal's lighter profile, and the taper ran the other way. Such
 * a section is shared, and the row's members are given a section of their own. A member of
 * variable section whose end I is the section is not in the row, and keeps it, for the same reason.
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

describe('optimiser with a section that is a tapered member\'s end J', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; steelOptimise.clearApplied(); });

  it('leaves the end J where it is and gives the portal a section of its own', () => {
    modelStore.clear();
    historyStore.clear();
    const ipe = (name: string) => {
      const p = PROFILE_FAMILIES.IPE.find((x) => x.name === name)!;
      return modelStore.addSection({ name: p.name, profileFamily: p.family, ...profileToSectionFull(p) } as never);
    };
    const s600 = ipe('IPE 600'), s500 = ipe('IPE 500');
    const mid = modelStore.addMaterial({ name: 'S235', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400 } as never);
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 4), modelStore.addNode(6, 0, 4), modelStore.addNode(6, 0, 0)];
    const portal = [modelStore.addElement(n[0]!, n[1]!, 'frame'), modelStore.addElement(n[3]!, n[2]!, 'frame'), modelStore.addElement(n[1]!, n[2]!, 'frame')];
    for (const id of portal) { modelStore.updateElementSection(id, s600); modelStore.updateElementMaterial(id, mid); }
    // A cantilever off the portal's knee, deep at the knee.
    const b = modelStore.addNode(9, 0, 4);
    const tapered = modelStore.addElement(b, n[2]!, 'frame');
    modelStore.updateElement(tapered, { sectionId: s500, materialId: mid, variableSection: { sectionJ: s600 } } as never);
    // And one off the other knee whose end I is the IPE 600: not designed, so not in the row either.
    const c = modelStore.addNode(-3, 0, 4);
    const other = modelStore.addElement(n[1]!, c, 'frame');
    modelStore.updateElement(other, { sectionId: s600, materialId: mid, variableSection: { sectionJ: s500 } } as never);
    modelStore.addSupport(n[0]!, 'fixed3d');
    modelStore.addSupport(n[3]!, 'fixed3d');
    modelStore.addDistributedLoad3D(portal[2]!, 0, 0, -15, -15);
    modelStore.addNodalLoad3D(b, 0, 0, -5, 0, 0, 0);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
    const before = { ...modelStore.sections.get(s600)! };

    steelOptimise.run('section');
    const row = steelOptimise.rows.find((x) => x.sectionId === s600)!;
    expect(row.elementIds.sort()).toEqual([...portal].sort());
    steelOptimise.apply([row.key]);

    // End J is the IPE 600 it was, unchanged; the portal moved to a section of its own.
    expect(modelStore.elements.get(tapered)!.variableSection).toEqual({ sectionJ: s600 });
    expect(modelStore.elements.get(other)).toMatchObject({ sectionId: s600, variableSection: { sectionJ: s500 } });
    expect(modelStore.sections.get(s600)).toMatchObject({ name: before.name, a: before.a, iy: before.iy });
    for (const id of portal) expect(modelStore.elements.get(id)!.sectionId).not.toBe(s600);
  });
});
