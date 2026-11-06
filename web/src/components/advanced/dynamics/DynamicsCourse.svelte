<script lang="ts">
  /**
   * The classroom side of the Dynamic panel, under its modes: what the
   * numbers mean, the point masses, and in 2D the single and multiple degree
   * of freedom systems and the discretization of the mass, each a closed
   * section with a summary that opens its explained document.
   */
  import ModalExplain from './ModalExplain.svelte';
  import PointMassesSection from './PointMassesSection.svelte';
  import SdofSection from './SdofSection.svelte';
  import MdofSection from './MdofSection.svelte';
  import MassSection from './MassSection.svelte';

  let { result, mode, is3D, onRerun }: { result: any; mode: number; is3D: boolean; onRerun: () => void } = $props();
</script>

<div class="dc" data-testid="dynamics-course">
  <ModalExplain {result} {mode} {is3D} />
  <PointMassesSection onChange={onRerun} />
  {#if !is3D}
    <SdofSection />
    <MdofSection />
    <MassSection />
  {/if}
</div>

<style>
  .dc { display: flex; flex-direction: column; gap: 4px; margin: 4px 0 6px; }
</style>
