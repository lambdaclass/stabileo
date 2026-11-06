import * as THREE from 'three';
import type { IfcReference } from '../ifc/ifc-reference';
import { buildLinkedReference, swapLinked } from './linked-3d';
import { sceneHost } from '../viewport3d/scene-host.svelte';

type Host = { scene: THREE.Scene; redraw: () => void };

/** PRO's linked models in the shared scene: shown as one group in the 'linked' view category, and taken out whole. */
export function createLinkedLayer() {
  let group: THREE.Group | null = null;
  let shownOn: Host | null = null;
  const takeOut = (): Host | null => {
    const was = shownOn;
    if (group) {
      sceneHost.release(group);
      if (was) swapLinked(was.scene, group, null);
    }
    group = null;
    shownOn = null;
    return was;
  };
  return {
    show(host: Host | null, refs: readonly IfcReference[]): void {
      const was = takeOut();
      if (!host || !refs.length) { (host ?? was)?.redraw(); return; }
      const next = new THREE.Group();
      next.name = 'linkedModels';
      for (const r of refs) next.add(buildLinkedReference(r));
      group = swapLinked(host.scene, null, next);
      shownOn = host;
      if (group) sceneHost.tone(group, 'linked');
    },
    clear(host: Host | null): void {
      const was = takeOut();
      (host ?? was)?.redraw();
    },
  };
}
