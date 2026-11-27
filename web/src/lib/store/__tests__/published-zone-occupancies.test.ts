import { beforeEach, expect, it } from 'vitest';
import { findOccupancy } from '../../codes/cirsoc101/live-loads';
import { zoneLiveLoad, zoneStatus, zoneUseOf } from '../../model/use-zones';
import { modelStore } from '..';
import { deserializeProject, loadFile, loadProject, serializeProject } from '../file';
import { applyZoneLoadPlan, createUseZone, zoneLoadPlan } from '../use-zones';

beforeEach(() => modelStore.clear());

it.each(['authored', 'deserialize', 'loadProject', 'loadFile'])('known wrong result: #1928 %s zones use only published occupancy tables', async entry => {
  const enhanced = !!__PUBLIC_FEATURES__.proPlatesUnified;
  const foreign = ['ec-A-floor', 'uk-A1', 'accessOffice', 'tr_attic_rooms'];
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const other = [...foreign, 'unknown-row', 'vivienda', 'balcon_otros'];
  const ids = other.map((occupancy, i) => createUseZone(pts, i, occupancy, { occupancy, provenance: 'confirmed' }));
  const manual = createUseZone(pts, ids.length, 'Manual', { occupancy: foreign[0], manualQ: 3, provenance: 'manual' });
  const text = serializeProject();
  if (entry !== 'authored') {
    modelStore.clear();
    if (entry === 'deserialize') expect(deserializeProject(text)).toBe(true);
    else {
      const file = new File([text], 'zones.ded');
      if (entry === 'loadFile') await loadFile(file);
      else await loadProject(file);
    }
  }
  const plan = zoneLoadPlan();
  if (!plan) throw new Error('Missing live load case');
  for (const [i, occupancy] of other.entries()) {
    const id = ids[i]!;
    const use = zoneUseOf(modelStore.model.groups.get(id));
    const assigned = occupancy === 'vivienda' || (enhanced && foreign.includes(occupancy));
    expect(use?.occupancy).toBe(occupancy);
    expect.soft(zoneStatus(use), occupancy).toBe(assigned ? 'assigned' : 'unsupported');
    expect.soft(zoneLiveLoad(use)?.row?.key, occupancy).toBe(assigned ? occupancy : undefined);
    expect.soft(plan.add.some(a => a.zoneId === id), occupancy).toBe(assigned);
    expect.soft(plan.unresolved.some(u => u.zoneId === id && u.status === 'unsupported'), occupancy).toBe(!assigned);
  }
  expect(plan.add.find(a => a.zoneId === ids[other.indexOf('vivienda')])?.q).toBe(findOccupancy('vivienda')!.uniformKNm2);
  expect(plan.add.find(a => a.zoneId === manual)?.q).toBe(3);
  const { added } = applyZoneLoadPlan(plan);
  expect(added).toBe(enhanced ? foreign.length + 2 : 2);
  expect([...modelStore.model.groups.values()].filter(g => g.kind === 'floorLoad')).toHaveLength(added);
});
