<script lang="ts">
  /**
   * A column's section shape, changed from the editor: rectangle or circle, for the lift, its
   * stack or its group. The bars chosen for the old shape are taken off and the editor says how
   * many lifts need designing again.
   */
  import { t, tp } from '../../../../lib/i18n';
  import { changeColumnShape } from '../../../../lib/store/column-stack-store';

  let { columnId, b, h, circle, onDone }: { columnId: number; b: number; h: number; circle: boolean; onDone: (note: string) => void } = $props();
  let kind = $state<'rect' | 'circle'>('rect'), nb = $state(0.3), nh = $state(0.3), nd = $state(0.4);
  let scope = $state<'lift' | 'stack' | 'group'>('stack');
  $effect(() => { kind = circle ? 'circle' : 'rect'; nb = +b.toFixed(2); nh = +h.toFixed(2); nd = +Math.max(b, h).toFixed(2); });
  function go() {
    const r = changeColumnShape(columnId, kind === 'circle' ? { kind: 'circle', D: nd } : { kind: 'rect', b: nb, h: nh }, scope);
    onDone(r.cleared ? tp('colEd.shape.doneCleared', { n: r.changed.length, c: r.cleared }) : tp('colEd.shape.done', { n: r.changed.length }));
  }
</script>

<section class="cs" data-testid="column-shape">
  <label>{t('colEd.shape.title')}
    <select bind:value={kind} data-testid="column-shape-kind"><option value="rect">{t('colEd.shape.rect')}</option><option value="circle">{t('colEd.shape.circle')}</option></select>
  </label>
  {#if kind === 'rect'}
    <label>b<input type="number" step="0.05" min="0.15" bind:value={nb} /> m</label>
    <label>h<input type="number" step="0.05" min="0.15" bind:value={nh} /> m</label>
  {:else}
    <label>D<input type="number" step="0.05" min="0.2" bind:value={nd} data-testid="column-shape-d" /> m</label>
  {/if}
  <select bind:value={scope} aria-label={t('colEd.shape.scope')}>
    <option value="lift">{t('colEd.shape.lift')}</option><option value="stack">{t('colEd.shape.stack')}</option><option value="group">{t('colEd.shape.group')}</option>
  </select>
  <button onclick={go} data-testid="column-shape-apply">{t('colEd.shape.apply')}</button>
</section>

<style>
  .cs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.7rem; color: var(--st-text-2); margin: 4px 0; }
  .cs label { display: flex; align-items: center; gap: 4px; }
  .cs input { width: 3.6rem; font-size: 0.7rem; }
  .cs select { font-size: 0.7rem; }
  .cs button { font-size: 0.68rem; padding: 1px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
</style>
