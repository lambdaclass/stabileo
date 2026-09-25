<script lang="ts">
  /**
   * Which diagram the sketches draw. A plane frame has one bending moment
   * worth drawing and an axial force; a space frame has two bending planes
   * and torsion as well, and one picture cannot carry them all.
   */
  import { t } from '../../lib/i18n';
  import { fmStepsStore } from '../../lib/store';

  let { is3D = false }: { is3D?: boolean } = $props();
  const options = $derived(is3D
    ? [['m', 'Mz'], ['my', 'My'], ['t', 'T'], ['n', 'N']] as const
    : [['m', 'M'], ['n', 'N']] as const);
</script>

<div class="fm-dpick" role="group" aria-label={t('fm.diagram.pick')}>
  <span>{t('fm.diagram.pick')}</span>
  {#each options as [key, label] (key)}
    <button class="fm-dchip" class:on={fmStepsStore.diagramComponent === key}
      onclick={() => (fmStepsStore.diagramComponent = key)} data-testid="fm-diagram-{key}">{label}</button>
  {/each}
</div>

<style>
  .fm-dpick { display: flex; align-items: center; gap: 4px; font-size: 0.62rem; color: var(--st-text-3); margin: 2px 0; }
  .fm-dchip {
    padding: 1px 7px; border: 1px solid var(--st-hair); border-radius: 8px; background: transparent;
    color: var(--st-text-3); font-size: 0.62rem; cursor: pointer; font-family: inherit;
  }
  .fm-dchip.on { border-color: var(--st-accent); color: var(--st-accent); }
</style>
