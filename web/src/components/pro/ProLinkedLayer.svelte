<script lang="ts">
  /** PRO's linked models drawn in the 3D scene as a reference, in the 'linked' view category. */
  import { onDestroy } from 'svelte';
  import { uiStore } from '../../lib/store';
  import { federation } from '../../lib/store/federation.svelte';
  import { linkedGeometry } from '../../lib/store/linked-geometry';
  import { createLinkedLayer } from '../../lib/three/linked-layer';
  import { sceneHost } from '../../lib/viewport3d/scene-host.svelte';

  const layer = createLinkedLayer();

  $effect(() => {
    const host = sceneHost.current;
    const hashes = uiStore.analysisMode === 'pro' ? federation().links.filter((l) => l.visible && l.reference).map((l) => l.reference!.hash) : [];
    let stale = false;
    void Promise.all(hashes.map((h) => linkedGeometry(h))).then((refs) => {
      if (stale) return;
      layer.show(host, refs.filter((r): r is NonNullable<typeof r> => !!r));
    });
    return () => { stale = true; };
  });

  onDestroy(() => layer.clear(sceneHost.current));
</script>
