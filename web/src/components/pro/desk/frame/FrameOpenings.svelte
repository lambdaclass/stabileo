<script lang="ts">
  /**
   * Openings through the web of a beam line's members, placed from the frame editor: where along
   * the line, how long and how deep. Each is the special element «opening» (`OpeningEntry`), so
   * it is checked by the same design (`beam-opening.ts`, chords and side stirrups) and listed with
   * the others; the elevation draws it where it was placed.
   */
  import { t, tp } from '../../../../lib/i18n';
  import { openingChecks, removeEntry, saveEntry } from '../../../../lib/store/special-elements';
  import type { LineOpening } from '../../../../lib/store/line-openings';

  interface Props {
    openings: LineOpening[];
    /** The member and its own position at a point of the line, for a new opening. */
    locate: (x: number) => { elementId: number; x: number } | null;
    total: number;
  }
  let { openings, locate, total }: Props = $props();

  let x = $state(1), lo = $state(0.3), ho = $state(0.15);
  let note = $state<string | null>(null);
  function add() {
    const at = locate(Math.max(0, Math.min(total, x)));
    if (!at) { note = t('frameEd.openings.noMember'); return; }
    saveEntry('openings', { id: `op${Date.now().toString(36)}`, elementId: at.elementId, x: +at.x.toFixed(3), lo, ho });
    note = null;
  }
  // Read so the list follows a save made here or in the special elements editor.
  const n = $derived(openingChecks().length);
</script>

<section class="fo" data-testid="frame-openings" data-count={n}>
  <h5>{t('frameEd.openings.title')}</h5>
  {#each openings as o (o.entry.id)}
    <div class="fo-row" class:bad={o.status === 'fail'} data-testid="frame-opening-{o.entry.id}">
      <span>{tp('frameEd.openings.item', { lo: o.entry.lo.toFixed(2), ho: o.entry.ho.toFixed(2), x: o.lineX.toFixed(2) })}</span>
      <span>{o.status === 'fail' ? tp('frameEd.openings.fails', { clauses: o.failing.join(', ') }) : o.status === 'notVerified' ? t('frameEd.openings.notVerified') : tp('frameEd.openings.ok', { u: o.worst.toFixed(2) })}</span>
      <button aria-label={t('frameEd.openings.remove')} onclick={() => removeEntry('openings', o.entry.id)}>×</button>
    </div>
  {/each}
  <div class="fo-row">
    <label>{t('frameEd.openings.x')}<input type="number" step="0.05" min="0" max={total} bind:value={x} data-testid="frame-opening-x" /></label>
    <label>{t('frameEd.openings.lo')}<input type="number" step="0.05" min="0.05" bind:value={lo} data-testid="frame-opening-lo" /></label>
    <label>{t('frameEd.openings.ho')}<input type="number" step="0.01" min="0.02" bind:value={ho} data-testid="frame-opening-ho" /></label>
    <button onclick={add} data-testid="frame-opening-add">{t('frameEd.openings.add')}</button>
  </div>
  {#if note}<p class="fo-hint">{note}</p>{/if}
</section>

<style>
  .fo { border: 1px solid var(--st-hair); border-radius: 4px; padding: 6px 8px; background: var(--st-surface-2); font-size: 0.7rem; }
  .fo h5 { margin: 0 0 4px; font-size: 0.74rem; font-weight: 600; }
  .fo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 3px; }
  .fo-row label { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); }
  .fo-row input { width: 3.8rem; font-size: 0.7rem; }
  .fo-row.bad { color: var(--st-danger); }
  .fo button { font-size: 0.68rem; padding: 1px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .fo-hint { margin: 3px 0 0; color: var(--st-text-3); }
</style>
