/**
 * The gallery as it is shown: the concrete buildings first, from a house to a building with its
 * lift and stair, each group in the order it is listed, every card said in the app's languages,
 * and each building arriving with the loads the generator writes from the settings it saves.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { regulationsStore } from '../../store/regulations.svelte';
import '../../store/index';
import { initSolver } from '../../engine/wasm-solver';
import { autoLoadsMemory } from '../../../components/pro/auto-loads-memory';
import { physicalPlates } from '../../store/physical-plates';
import { designData } from '../../store/design-data';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';
import pt from '../../i18n/locales/pt';
import de from '../../i18n/locales/de';
import fr from '../../i18n/locales/fr';
import tr from '../../i18n/locales/tr';
import hu from '../../i18n/locales/hu';
import zh from '../../i18n/locales/zh';
import { PRO_EXAMPLES, PRO_EXAMPLE_GROUP_ORDER, proExampleGroups, isHeavyExample } from '../pro-examples';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('the gallery', () => {
  it('opens on the concrete buildings, from a house to a building with its lift and stair, then the steel ones', () => {
    const groups = proExampleGroups((k) => k);
    expect(groups.map((g) => g.group)).toEqual([...PRO_EXAMPLE_GROUP_ORDER]);
    expect(groups.slice(0, 2).map((g) => [g.group, g.examples.map((e) => e.id)])).toEqual([
      ['rcBuildings', ['pro-rc-house', 'pro-rc-four-storey', 'pro-rc-steel-columns', 'pro-rc-lift-core', 'pro-rc-party-wall']],
      ['steelBuildings', ['pro-plane-frame-seismic', 'pro-steel-building-slabs', 'torre-irregular-con-retiros']],
    ]);
    for (const g of groups) expect(g.examples, g.group).toEqual(PRO_EXAMPLES.filter((e) => e.group === g.group));
  });

  it('shows each model once and warns on the heavy ones only', () => {
    const ids = PRO_EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('pro-edificio-7p');
    expect(ids).not.toContain('pro-rc-frame-area-loads');
    expect(PRO_EXAMPLES.filter(isHeavyExample).map((e) => e.id).sort()).toEqual(['cad-arch-structure-dxf', 'la-bombonera', 'xl-diagrid-tower']);
  });

  it.each([['es', es], ['en', en], ['pt', pt], ['de', de], ['fr', fr], ['tr', tr], ['hu', hu], ['zh', zh]] as const)('says every card in %s', (_lang, dict) => {
    const d = dict as Record<string, string>;
    const missing = PRO_EXAMPLES.flatMap((ex) => [ex.nameKey, ex.descKey, ex.purposeKey, ex.lookKey, ex.groupKey, ...ex.tags]).filter((k) => !d[k]);
    expect(missing).toEqual([]);
  });
});

describe.each(PRO_EXAMPLES.filter((e) => e.loads === 'generator').map((e) => [e.id, e] as const))('%s', (_id, ex) => {
  it('is the size its card says, its plates not meshed, and arrives with the generator\'s loads, the live load on every slab, wind and no earthquake, the gravity cases shown, its dialog on its settings', async () => {
    await ex.load();
    expect([modelStore.nodes.size, modelStore.elements.size, modelStore.quads.size + modelStore.plates.size]).toEqual([ex.stats.nodes, ex.stats.members, ex.stats.shells ?? 0]);
    expect(physicalPlates().length, 'plates, none meshed').toBe(ex.stats.plates ?? 0);
    const slabs = physicalPlates().filter((pl) => pl.physical.kind === 'slab').map((pl) => pl.id);
    const typeOf = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type]));
    const defs = [...modelStore.model.groups.values()].filter((g) => g.kind === 'floorLoad').map((g) => g.data as { target: { groupId: number }; caseId: number });
    for (const type of ['D', 'L']) {
      const loaded = new Set(defs.filter((d) => typeOf.get(d.caseId) === type).map((d) => d.target.groupId));
      expect(slabs.filter((id) => !loaded.has(id)), `every slab given its ${type} through a definition on it`).toEqual([]);
    }
    expect(modelStore.loads.every((l) => (l.data as { generatedBy?: string }).generatedBy)).toBe(true);
    expect(modelStore.model.loadCases.some((c) => c.type === 'W')).toBe(true);
    expect(modelStore.model.loadCases.some((c) => c.type === 'E')).toBe(false);
    expect(uiStore.visibleLoadCases3D, 'the gravity cases shown, the wind ones hidden').toEqual(modelStore.model.loadCases.filter((c) => c.type === 'D' || c.type === 'L').map((c) => c.id));
    const memory = autoLoadsMemory(regulationsStore.roles, { wind: regulationsStore.bound('wind'), seismic: regulationsStore.bound('seismic') });
    expect([memory.selectedOccupancy, memory.enableWind, memory.enableSeismic, memory.roofCfg.enabled]).toEqual(['vivienda', true, false, false]);
    if (ex.id.startsWith('pro-rc-')) {
      expect(designData().placement?.reference, 'the tops of the beams and slabs on the level').toBe('slabTop');
      const flat = physicalPlates().filter((pl) => pl.physical.kind === 'slab' && !pl.physical.stair);
      expect(flat.every((pl) => Math.abs((pl.surface.offset?.z ?? 0) + pl.surface.thickness / 2) < 1e-9)).toBe(true);
      const level = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6 && Math.hypot(b.x - a.x, b.y - a.y) > 1e-6; });
      expect(level.length).toBeGreaterThan(0);
      expect(level.every((e) => Math.abs((e.offset?.i?.z ?? 0) + (modelStore.sections.get(e.sectionId)!.h ?? 0) / 2) < 1e-9)).toBe(true);
    }
    const dead = modelStore.model.loadCases.find((c) => c.type === 'D')!;
    expect(modelStore.analysis?.selfWeight).toEqual([{ caseId: dead.id, direction: 'Z', factor: -1 }]);
    const cases = new Set(modelStore.model.loadCases.map((c) => c.id));
    for (const c of modelStore.combinations) for (const f of c.factors) expect(cases.has(f.caseId), c.name).toBe(true);
  }, 300_000);
});
