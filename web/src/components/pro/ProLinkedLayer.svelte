<script lang="ts">
  /** PRO's linked models drawn in the 3D scene as a reference, in the 'linked' view category. */
  import { uiStore } from '../../lib/store';
  import { federation } from '../../lib/store/federation.svelte';
  import { linkedGeometry } from '../../lib/store/linked-geometry';
  import { buildLinkedReference, swapLinked } from '../../lib/three/linked-3d';
  import { sceneHost } from '../../lib/viewport3d/scene-host.svelte';
  import * as THREE from 'three';

  let group: THREE.Group | null = null;
  let onScene: THREE.Scene | null = null;

  $effect(() => {
    const host = sceneHost.current;
    const hashes = uiStore.analysisMode === 'pro' ? federation().links.filter((l) => l.visible && l.reference).map((l) => l.reference!.hash) : [];
    let stale = false;
    void Promise.all(hashes.map((h) => linkedGeometry(h))).then((refs) => {
      if (stale) return;
      if (group) { sceneHost.release(group); if (onScene) swapLinked(onScene, group, null); group = null; }
      const got = refs.filter((r): r is NonNullable<typeof r> => !!r);
      if (!host || !got.length) { host?.redraw(); return; }
      const next = new THREE.Group();
      next.name = 'linkedModels';
      for (const r of got) next.add(buildLinkedReference(r));
      group = swapLinked(host.scene, null, next);
      onScene = host.scene;
      if (group) sceneHost.tone(group, 'linked');
    });
    return () => { stale = true; };
  });
</script>
