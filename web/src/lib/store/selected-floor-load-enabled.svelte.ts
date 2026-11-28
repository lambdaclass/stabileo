import { t, tp } from '../i18n';
import type { FloorLoadDef, FloorTarget } from '../model/loads/floor-definitions';
import { plateSurfaceOf } from '../model/physical/plate';
import { addFloorLoadDef } from './defined-loads';
import { floorLoadRequest } from './floor-load-request.svelte';
export { requestFloorLoad } from './floor-load-request.svelte';
import { modelStore, uiStore } from './index';
import { pickedPlateDefs, plateEntry, previewPlateDefs } from './physical-plates';
import type { physicalGroups } from './physical';

export function acceptsFloorPlate(group: ReturnType<typeof physicalGroups>[number]) {
  const meshed = (group.members.quads?.length ?? 0) + (group.members.plates?.length ?? 0) > 0;
  return (group.physical.kind === 'slab' || group.physical.kind === 'wall') && (meshed || !!plateSurfaceOf(group));
}

export function selectedFloorLoad(select: (key: string) => void) {
  const plates = $derived([...uiStore.selectedPlates].filter(id => !!plateEntry(id)));
  let previous = '';
  $effect(() => {
    const asked = floorLoadRequest.target;
    if (asked) {
      select(asked);
      floorLoadRequest.target = null;
    }
  });
  $effect(() => {
    const current = plates.join(',');
    if (current === previous) return;
    previous = current;
    if (plates.length > 1) select('plates');
    else if (plates.length === 1) select('g:' + plates[0]);
  });
  return {
    get targets() {
      return plates.length > 1 ? [{ key: 'plates', label: tp('floorLoad.pickedPlates', { n: plates.length }) }] : [];
    },
    target(): FloorTarget | null {
      return plates.length ? { by: 'group', groupId: plates[0]! } : null;
    },
    preview(def: FloorLoadDef, leftHand: boolean) {
      return previewPlateDefs(pickedPlateDefs(plates, def), { leftHand });
    },
    allowsEmpty(def: FloorLoadDef, key: string) {
      return key === 'plates' || (def.target.by === 'group' && def.distribution === 'slab'
        && !!plateSurfaceOf(modelStore.model.groups.get(def.target.groupId)));
    },
    apply(def: FloorLoadDef, name: string) {
      const defs = pickedPlateDefs(plates, def);
      const label = name.trim() || t('floorLoad.plateDefault');
      modelStore.batch(() => {
        for (const { id, def } of defs) addFloorLoadDef(label + ' · ' + plateEntry(id)!.name, def);
      });
      return tp('floorLoad.addedPlates', { n: defs.length });
    },
  };
}

export function watchFloorLoadRequest(open: () => void): void {
  $effect(() => { if (floorLoadRequest.target) open(); });
}
