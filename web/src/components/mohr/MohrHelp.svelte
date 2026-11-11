<script lang="ts">
  import type { MohrKind } from '../../lib/mohr/state';
  import { tm } from './i18n';

  let { kind, id }: { kind: MohrKind; id?: string } = $props();
</script>

<section class="mh-help" {id} data-testid="mohr-help" aria-label={tm('mohr.help')}>
  <h3>{tm('mohr.conventions')}</h3>
  <p>{tm('mohr.sign')}</p>
  {#each [1, 2, 3, 4] as i (i)}<p>{tm(`mohr.help${kind === 'plane' ? 'Plane' : 'Space'}.${i}`)}</p>{/each}
  {#if kind === 'plane'}<p>{tm('mohr.tauDownHelp')}</p>{/if}
  <p>{tm('mohr.unitNote')}</p>
</section>
