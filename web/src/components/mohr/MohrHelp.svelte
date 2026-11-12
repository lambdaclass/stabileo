<script lang="ts">
  import type { MohrKind } from '../../lib/mohr/state';
  import { tm } from './i18n';

  let { kind, id, lead }: { kind: MohrKind; id?: string; lead?: string } = $props();
</script>

<section class="mh-help" {id} data-testid="mohr-help" aria-label={tm('mohr.help')}>
  {#if lead}<p class="mh-help-lead">{lead}</p>{/if}
  <h3>{tm('mohr.conventions')}</h3>
  <p>{tm('mohr.sign')}</p>
  {#each [1, 2, 3, 4] as i (i)}<p>{tm(`mohr.help${kind === 'plane' ? 'Plane' : 'Space'}.${i}`)}</p>{/each}
  {#if kind === 'plane'}<p>{tm('mohr.tauDownHelp')}</p>{:else}<p>{tm('mohr.anglesNote')}</p>{/if}
  <p>{tm('mohr.unitNote')}</p>
</section>
