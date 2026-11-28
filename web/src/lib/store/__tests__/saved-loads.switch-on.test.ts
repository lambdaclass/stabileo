/**
 * Loads written by the generator from the settings a project saved (`store/saved-loads.ts`), as
 * opening the generator and applying would: the gallery's house brings the settings.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import { regulationsStore } from '../regulations.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { loadCodeExample } from '../../templates/examples';
import { bindRole, REGULATIONS_SCHEMA_VERSION } from '../../codes/roles';
import { generateSavedLoads, loadPlanModel } from '../saved-loads';
import { applyLoadPlan } from '../apply-load-plan';
import { buildLoadPlan } from '../../engine/loads/load-plan';
import { autoLoadsMemory } from '../../../components/pro/auto-loads-memory';
import { planInputOf } from '../../../components/pro/auto-loads-plan';
import { tp } from '../../i18n';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { preparePlatesForAnalysis } from '../physical-plates';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';

beforeAll(async () => { await initSolver(); });
beforeEach(async () => {
  uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear();
  await loadCodeExample('pro-rc-house');
});

const types = () => [...new Set(modelStore.model.loadCases.map((c) => c.type))].sort();

describe('loads from the saved settings', () => {
  it('writes the dwelling loads, the wind and their combinations, every load marked as the generator\'s', () => {
    expect(modelStore.loads).toHaveLength(0);
    expect(generateSavedLoads()).toBeNull();
    expect(types()).toEqual(['D', 'L', 'W']);
    expect(modelStore.model.loadCases.filter((c) => c.type === 'W')).toHaveLength(32);
    expect(modelStore.loads.length).toBeGreaterThan(0);
    expect(modelStore.loads.every((l) => (l.data as { generatedBy?: string }).generatedBy === 'cirsoc101-2025-basis')).toBe(true);
    expect(modelStore.combinations.length).toBeGreaterThan(0);
    expect(modelStore.combinations.every((c) => c.origin?.code === 'cirsoc101-2025-basis')).toBe(true);
  });

  it('puts each slab\'s loads, a plate not meshed yet, in a definition on it that the mesh takes at the analysis', () => {
    expect(generateSavedLoads()).toBeNull();
    const slabs = [...modelStore.model.groups.values()].filter((g) => g.kind === 'physicalMember' && (g.data as { kind?: string }).kind === 'slab').map((g) => g.id);
    const defs = [...modelStore.model.groups.values()].filter((g) => g.kind === 'floorLoad').map((g) => ({ id: g.id, ...(g.data as { caseId: number; target: { groupId: number }; generatedBy?: string }) }));
    const caseType = (id: number) => modelStore.model.loadCases.find((c) => c.id === id)!.type;
    expect(defs.map((d) => `${d.target.groupId}:${caseType(d.caseId)}`).sort()).toEqual(slabs.flatMap((id) => [`${id}:D`, `${id}:L`]).sort());
    expect(defs.every((d) => d.generatedBy === 'cirsoc101-2025-basis')).toBe(true);
    expect(modelStore.loads.some((l) => l.type === 'surface3d')).toBe(false);

    meshBeforeAnalysis.value = true;
    expect(preparePlatesForAnalysis().ok).toBe(true);
    syncDefinedLoadsForAnalysis();
    for (const d of defs) {
      const shells = new Set(modelStore.model.groups.get(d.target.groupId)!.members.quads ?? []);
      const on = modelStore.loads.filter((l) => (l.data as { fromDef?: number }).fromDef === d.id).map((l) => (l.data as { quadId: number }).quadId);
      expect(shells.size).toBeGreaterThan(0);
      expect(new Set(on)).toEqual(shells);
    }
  });

  it('replacing the generated loads takes the slabs\' definitions back with them, and writes them once', () => {
    expect(generateSavedLoads()).toBeNull();
    const count = () => [...modelStore.model.groups.values()].filter((g) => g.kind === 'floorLoad').length;
    const before = count();
    const memory = autoLoadsMemory(regulationsStore.roles, { wind: true, seismic: false });
    const plan = buildLoadPlan(planInputOf(memory, { roles: regulationsStore.roles, model: loadPlanModel() }));
    expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: (k, p) => tp(k, p) })).toBeUndefined();
    expect(count()).toBe(before);
  });

  it('refuses a temperature on plates not meshed yet, rather than write loads on shells that do not exist', () => {
    const memory = autoLoadsMemory(regulationsStore.roles, { wind: true, seismic: false });
    const plan = buildLoadPlan(planInputOf({ ...memory, special: { ...memory.special, thermal: { ...memory.special.thermal, on: true, dt: 20, grad: 0 } } }, { roles: regulationsStore.roles, model: loadPlanModel() }));
    expect(plan.blockedKeys?.map((m) => m.key)).toContain('loadPlan.blocked.unmeshedPlateThermal');
    expect(plan.thermal.some((t) => (t.quadId ?? 0) < 0)).toBe(true);
  });

  it('refuses what the regulation refuses and leaves the model as it was', () => {
    regulationsStore.configureRole('loads', { occupancyKey: 'oficina' }, true);
    const cases = modelStore.model.loadCases.length;
    const refused = generateSavedLoads();
    expect(refused?.map((m) => m.key)).toContain('loadPlan.blocked.concentratedLive');
    expect([modelStore.loads.length, modelStore.model.loadCases.length, modelStore.combinations.length]).toEqual([0, cases, 0]);
  });

  it('adds the earthquake a person states, with the site\'s zone and soil', () => {
    const roles = { ...regulationsStore.roles, seismic: { ...bindRole('seismic', 'inpres103-2018'), state: 'applied' as const, appliedAtRevision: 0 } };
    modelStore.model.regulations = { version: REGULATIONS_SCHEMA_VERSION, roles };
    regulationsStore.configureRole('seismic', { zone: 2, site: 'SD', destinationGroup: 'B', systemKey: 'rc_frame_full_ductility', periodSystem: 'concreteMomentFrame', regularity: 'regular', occupancy: 'reduced', elastic: false }, true);
    expect(generateSavedLoads()).toBeNull();
    expect(types()).toEqual(['D', 'E', 'L', 'W']);
  });
});
