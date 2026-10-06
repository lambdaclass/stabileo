/**
 * What the load generator dialog opens on (`auto-loads-memory.ts`).
 *
 *  · The restore handed the dialog the project's own settings objects: the dead rows, the roof,
 *    the special loads, the wind directions and service wind, the seismic method. The dialog's
 *    sections edit what they are given in place, so a typed dead row or soil surcharge changed
 *    `model.regulations` with no Apply and no undo, and Cancel kept it.
 *  · With nothing saved it reset six values to the code's defaults and kept the rest from memory,
 *    from an earlier opening or from another project opened in the same session.
 *
 * Run against the real stores. In the browser the restored objects were the state proxies inside
 * the model, which Svelte keeps when they are assigned to the dialog's state; here they are the same
 * objects without the proxy, which is the same sharing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { modelStore } from '../../../lib/store/model.svelte';
import { regulationsStore } from '../../../lib/store/regulations.svelte';
import { registerLoadCodes } from '../../../lib/codes/families';
import { CIRSOC102_WIND } from '../../../lib/codes/families/cirsoc';
import { autoLoadsDefaults, autoLoadsMemory, type AutoLoadsMemory } from '../auto-loads-memory';

const dialog = readFileSync(join(process.cwd(), 'src/components/pro/ProAutoLoadsDialog.svelte'), 'utf8');
const BOTH = { wind: true, seismic: true };

/** Saves what the dialog's Preview saves, with something other than the defaults in every object. */
function saveEverything() {
  regulationsStore.configureRole('basis', { generateCombinations: false,
    dialog: { comboSet: 'both', comboSource: 'project', bothSenses: false, patternsInCompanions: true } }, true);
  regulationsStore.configureRole('loads', {
    occupancyKey: 'oficinas', tributaryWidth: 4, applyLiveReduction: false, reductionElementKind: 'interiorColumn', floorsSupported: 3,
    dialog: {
      deadRows: [{ entryKey: null, thickness: 0, onBattens: false, q: 1.5, isPartition: false }],
      gravityMode: 'width', gravitySlab: 'oneWay', gravitySpan: 'y',
      roofCfg: { enabled: true, use: 'occupancy', dead: 0.8, weight: null, occupancyKey: 'azotea_privada', slopeDeg: null },
      livePatterns: 'none',
      special: {
        thermal: { on: true, dt: 15, grad: 0 },
        soil: { on: true, gradeZ: 0, gamma: 17.3, k: 0.5, surcharge: 2, permanent: true, sideOn: false, sideX: 0, sideY: 0 },
        fluid: { on: false, levelZ: 3, gamma: 10, insideOn: false, insideX: 0, insideY: 0 },
      },
    },
  }, true);
  regulationsStore.configureRole('wind', {
    basicSpeed: 40, exposure: 'C', enclosure: 'partiallyEnclosed', siteAltitudeM: 100, kzt: 1.1, kztSurveyed: true, roofSlopeDeg: 5,
    dynamics: { n1Source: 'typed', n1: { x: 0.8, y: 0.6 }, beta: 0.02, rigidG: 'default', eR: { x: 1 } },
    dialog: { windDirs: ['+x', '-x'], windCaseSet: 'case1', windService: { enabled: true, v50: 40, mri: 10 },
      windStructure: { kind: 'chimney', roof: 'pitched', blocked: false, towerSection: 'square', round: false, solidity: 0.2,
        diagonal: true, members: 'flat', clearance: 2, chimney: 'roundRough', width: 0, diameter: 2 } },
  }, true);
  regulationsStore.configureRole('snow', { enabled: true, parapet: 1, adjacent: [{ side: '+x', topZ: 9, separation: 1, length: 6 }] }, true);
}

/** Every edit a section can make in place: every array grows, every object takes a field. */
function editEverything(v: unknown): void {
  if (Array.isArray(v)) { v.forEach(editEverything); v.push('edited' as never); return; }
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) editEverything(x);
    (v as Record<string, unknown>).edited = true;
  }
}

/** Opens a project that has saved nothing, as File → Open does (`restore`). */
function openFreshProject() {
  modelStore.clear();
  modelStore.restore({ ...modelStore.snapshot(), regulations: undefined });
}

beforeEach(openFreshProject);
afterEach(openFreshProject);

describe('the dialog edits a copy of what the project saved', () => {
  it('editing every restored object leaves model.regulations as it was', () => {
    saveEverything();
    const before = JSON.stringify(modelStore.snapshot().regulations);
    const m = autoLoadsMemory(regulationsStore.roles, BOTH);
    // The values came back...
    expect(m.deadRows[0]!.q).toBe(1.5);
    expect(m.special.soil.surcharge).toBe(2);
    expect(m.windService.v50).toBe(40);
    expect(m.windDyn.n1).toEqual({ x: 0.8, y: 0.6 });
    expect(m.snowCfg.adjacent).toHaveLength(1);
    // ...and nothing the dialog does to them reaches the project.
    editEverything(m);
    expect(JSON.stringify(modelStore.snapshot().regulations)).toBe(before);
  });

  it('Cancel and reopen shows the saved value, not the edit', () => {
    saveEverything();
    const first = autoLoadsMemory(regulationsStore.roles, BOTH);
    first.deadRows[0]!.q = 9;
    first.special.soil.surcharge = 7;
    first.roofCfg.use = 'maintenance';
    first.windDirs.push('+y');
    const again = autoLoadsMemory(regulationsStore.roles, BOTH);
    expect([again.deadRows[0]!.q, again.special.soil.surcharge, again.roofCfg.use, again.windDirs]).toEqual([1.5, 2, 'occupancy', ['+x', '-x']]);
  });

  it('the save path writes snapshots, never the dialog\'s own objects', () => {
    const record = dialog.match(/function recordRoleConfiguration\(\) \{([\s\S]*?)\n  \}\n/)?.[1];
    expect(record).toBeDefined();
    for (const d of record!.matchAll(/dialog: ([^\n]*)/g)) expect(d[1]).toMatch(/^\$state\.snapshot\(/);
    // The combinations' choices are saved with the basis, so a reopening has them to restore.
    expect(record).toMatch(/configureRole\('basis'[\s\S]*dialog: \$state\.snapshot\(\{ comboSet, comboSource, bothSenses, patternsInCompanions \}\)/);
  });
});

describe('with nothing saved, the dialog starts from the defaults whole', () => {
  it('every value of a fresh project is the default', () => {
    expect(autoLoadsMemory(regulationsStore.roles, BOTH)).toEqual(autoLoadsDefaults(regulationsStore.roles));
  });

  it('another project opened after one with saved settings starts from the defaults, not from it', () => {
    saveEverything();
    const a = autoLoadsMemory(regulationsStore.roles, BOTH);
    expect(a.windV).toBe(40);
    openFreshProject();
    const b = autoLoadsMemory(regulationsStore.roles, BOTH);
    expect(b).toEqual(autoLoadsDefaults(regulationsStore.roles));
    expect([b.deadRows.length, b.special.soil.on, b.windDyn.n1Source, b.windDirs.length, b.snowCfg.enabled, b.comboSource, b.enableWind])
      .toEqual([4, false, 'modal', 4, false, 'regulation', false]);
  });

  it('the bound wind code\'s own starting values stand in for the app\'s', () => {
    const unregister = registerLoadCodes([{ ...CIRSOC102_WIND, defaults: { basicSpeed: 31, exposure: 'D', enclosure: 'open' } }]);
    try {
      const m = autoLoadsMemory(regulationsStore.roles, BOTH);
      expect([m.windV, m.windExposure, m.windEnclosure]).toEqual([31, 'D', 'open']);
    } finally { unregister(); }
  });

  it('the defaults are fresh objects each time', () => {
    const a = autoLoadsDefaults(), b = autoLoadsDefaults();
    a.deadRows[0]!.thickness = 1; a.windDirs.pop(); a.special.soil.on = true;
    expect(b).toEqual(autoLoadsDefaults());
  });
});

describe('the dialog applies the memory whole on each opening', () => {
  it('restoreFromRoles sets every value the memory has', () => {
    const restore = dialog.match(/function restoreFromRoles\(\) \{([\s\S]*?)\n  \}\n/)?.[1] ?? '';
    const keys = Object.keys(autoLoadsDefaults()) as Array<keyof AutoLoadsMemory>;
    const missing = keys.filter((k) => !new RegExp(`\\b${k} = m\\.${k};`).test(restore));
    expect(missing).toEqual([]);
  });

  it('the restore runs before the focus, so a section asked for is turned on over it', () => {
    const restoreAt = dialog.indexOf('restoreFromRoles(); wasOpen = now;');
    const focusAt = dialog.indexOf("if (f === 'wind' && windAvailable) enableWind = true;");
    expect(restoreAt).toBeGreaterThan(-1);
    expect(focusAt).toBeGreaterThan(restoreAt);
  });
});
