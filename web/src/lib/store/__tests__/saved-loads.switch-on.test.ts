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
import { generateSavedLoads } from '../saved-loads';

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
