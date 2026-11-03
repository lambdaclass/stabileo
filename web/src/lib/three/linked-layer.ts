import * as THREE from 'three';
import type { IfcReference } from '../ifc/ifc-reference';
import { buildLinkedReference, swapLinked } from './linked-3d';
import { sceneHost } from '../viewport3d/scene-host.svelte';

type Host = { scene: THREE.Scene; redraw: () => void };

/** PRO's linked models in the shared scene: shown as one group in the 'linked' view category, and taken out whole. */
export function createLinkedLayer() {
  let group: THREE.Group | null = null;
  let onScene: THREE.Scene | null = null;
  return {
    show(host: Host | null, refs: readonly IfcReference[]): void {
      this.clear(null);
      if (!host || !refs.length) { host?.redraw(); return; }
      const next = new THREE.Group();
      next.name = 'linkedModels';
      for (const r of refs) next.add(buildLinkedReference(r));
      group = swapLinked(host.scene, null, next);
      onScene = host.scene;
      if (group) sceneHost.tone(group, 'linked');
    },
    clear(host: Host | null): void {
      if (group) {
        sceneHost.release(group);
        if (onScene) swapLinked(onScene, group, null);
      }
      group = null;
      onScene = null;
      host?.redraw();
    },
  };
}
