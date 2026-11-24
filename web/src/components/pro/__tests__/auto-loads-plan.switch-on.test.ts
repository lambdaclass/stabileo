/**
 * The load generator's settings read as one (`auto-loads-plan.ts`): what the dialog saves on each
 * role is what it opens on, the saved objects are copies, and the plan they build is the dialog's,
 * whoever builds it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { modelStore } from '../../../lib/store/model.svelte';
import { regulationsStore } from '../../../lib/store/regulations.svelte';
import { bindRole, defaultRegulations, REGULATIONS_SCHEMA_VERSION } from '../../../lib/codes/roles';
import { autoLoadsDefaults, autoLoadsMemory, type AutoLoadsMemory } from '../auto-loads-memory';
import { planInputOf, roleSettingsOf, deadComponent } from '../auto-loads-plan';

const BOTH = { wind: true, seismic: true };

/** Every value off its default, wind, snow and the earthquake on. */
function everything(): AutoLoadsMemory {
  const m = autoLoadsDefaults(defaultRegulations());
  return {
    ...m,
    genCombos: false, comboSet: 'both', comboSource: 'project', bothSenses: false, patternsInCompanions: true,
    selectedOccupancy: 'vivienda_dormitorio', tributaryWidth: 4, applyLiveReduction: false, reductionElementKind: 'interiorColumn', floorsSupported: 3,
    deadRows: [{ entryKey: null, thickness: 0, onBattens: false, q: 1.5, isPartition: false }],
    partitionLive: { on: false, q: 1 }, gravityMode: 'width', gravitySlab: 'oneWay', gravitySpan: 'y', gravityLoadEveryPanel: true,
    roofCfg: { ...m.roofCfg, enabled: false }, livePatterns: 'none',
    special: { ...m.special, thermal: { on: true, dt: 15, grad: 2 } },
    enableWind: true, windV: 40, windExposure: 'C', windEnclosure: 'partiallyEnclosed', windAltitude: 100, windKzt: 1.1, windKztSurveyed: true, windRoofSlope: 5,
    windDyn: { n1Source: 'approximate', system: 'concreteMomentFrame', beta: 0.02, rigidG: 'default' },
    windDirs: ['+y', '-y'], windCaseSet: 'case1', windService: { enabled: true, v50: 40, mri: 10 },
    snowCfg: { ...m.snowCfg, enabled: true, parapet: 1 },
    enableSeismic: true, seismicZone: 3, siteClass: 'SC', destinationGroup: 'A', systemKey: 'rc_frame_full_ductility', periodSystem: 'concreteMomentFrame',
    regularity: 'regular', seismicOccupancy: 'reduced', elasticDesign: true,
    seismicMethod: { method: 'static', vertical: false, torsion: 'low', diagonal: true }, seismicDirectionX: true, seismicDirectionZ: false,
  };
}

beforeEach(() => { modelStore.clear(); });

describe('what the generator saves', () => {
  it('is what it opens on, every value, when wind, snow and the earthquake are bound', () => {
    const roles = defaultRegulations();
    roles.seismic = { ...bindRole('seismic', 'inpres103-2018'), state: 'applied', appliedAtRevision: 0 };
    modelStore.model.regulations = { version: REGULATIONS_SCHEMA_VERSION, roles };
    const m = everything();
    for (const [role, settings] of roleSettingsOf(m)) regulationsStore.configureRole(role, settings, true);
    expect(autoLoadsMemory(regulationsStore.roles, BOTH)).toEqual(m);
  });

  it('saves wind, snow and the earthquake only when they are generated', () => {
    const roles = (m: AutoLoadsMemory) => roleSettingsOf(m).map(([r]) => r);
    expect(roles(everything())).toEqual(['basis', 'loads', 'wind', 'snow', 'seismic']);
    expect(roles({ ...everything(), enableWind: false, snowCfg: { ...everything().snowCfg, enabled: false }, enableSeismic: false })).toEqual(['basis', 'loads']);
  });

  it('saves copies: editing the settings afterwards changes nothing saved', () => {
    const m = everything();
    const saved = roleSettingsOf(m);
    m.deadRows[0]!.q = 9; m.windDirs.push('+x'); m.seismicMethod.torsion = 'extreme'; m.special.thermal.dt = 99;
    const loads = saved.find(([r]) => r === 'loads')![1] as { dialog: { deadRows: Array<{ q: number }>; special: { thermal: { dt: number } } } };
    const wind = saved.find(([r]) => r === 'wind')![1] as { dialog: { windDirs: string[] } };
    const seismic = saved.find(([r]) => r === 'seismic')![1] as { dialog: { seismicMethod: { torsion: string } } };
    expect([loads.dialog.deadRows[0]!.q, loads.dialog.special.thermal.dt, wind.dialog.windDirs, seismic.dialog.seismicMethod.torsion]).toEqual([1.5, 15, ['+y', '-y'], 'low']);
  });
});

describe('the plan the settings build', () => {
  const ctx = () => ({ roles: regulationsStore.roles, model: { nodes: new Map(), elements: new Map(), sections: new Map(), materials: new Map(), loadCases: [] } as never });

  it('asks for what is on and nothing that is off', () => {
    const on = planInputOf(everything(), ctx());
    expect([!!on.wind, !!on.snow, !!on.seismic, !!on.thermal, on.roof]).toEqual([true, true, true, true, undefined]);
    expect(on.wind!.senses).toEqual(['+y', '-y']);
    expect(on.wind!.directions).toEqual({ x: false, y: true });
    expect(on.seismic!.code).toMatchObject({ zone: 3, site: 'SC', group: 'A', elastic: true });
    expect(on.dead).toEqual([deadComponent(everything().deadRows[0]!)]);
    const off = planInputOf(autoLoadsDefaults(defaultRegulations()), ctx());
    expect([off.wind, off.snow, off.seismic, off.thermal]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('takes the preview\'s modal frequencies over the saved dynamics, and the project\'s combination rules only when chosen', () => {
    const modal = { n1Source: 'modal' as const, n1: { x: 1.2 }, beta: 0.02, rigidG: 'default' as const };
    const rules = [{ id: 'r', name: 'r', factors: [] }] as never;
    expect(planInputOf(everything(), { ...ctx(), windDynamics: modal, projectCombinations: rules })).toMatchObject({ wind: { dynamics: modal }, projectCombinations: rules });
    expect(planInputOf({ ...everything(), comboSource: 'regulation' }, { ...ctx(), projectCombinations: rules }).projectCombinations).toBeUndefined();
  });

  it('is how the dialog builds its preview and saves its settings', () => {
    const dialog = readFileSync(join(process.cwd(), 'src/components/pro/ProAutoLoadsDialog.svelte'), 'utf8');
    expect(dialog).toMatch(/function planInput\(\): LoadPlanInput \{\s*return planInputOf\(memoryNow\(\), \{/);
    expect(dialog).toMatch(/for \(const \[role, settings\] of roleSettingsOf\(memoryNow\(\)\)\) regulationsStore\.configureRole\(role, settings, true\);/);
    const memory = dialog.match(/function memoryNow\(\): AutoLoadsMemory \{([\s\S]*?)\n  \}/)![1]!;
    for (const key of Object.keys(everything())) expect(memory, key).toMatch(new RegExp(`\\b${key}\\b`));
  });
});
