<script lang="ts">
  /**
   * Copying a beam line's bars onto a different line, or its whole floor onto another floor: the
   * target, the length tolerance, a preview member by member (what copies, what does not fit and
   * why), and «Apply», one undo step. Bars are never stretched to another length.
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { applyFrameCopy, frameTolerance, lineLevels, modelBeamLines, previewFloorCopy, previewFrameCopy } from '../../../lib/store/frame-equalize';
  import { lineAxis } from '../../../lib/store/line-axis';
  import type { BeamLine } from '../../../lib/engine/design/repeated-frames';
  import type { CopyPlan } from '../../../lib/engine/design/frame-copy';

  let { line }: { line: BeamLine } = $props();

  let mode = $state<'line' | 'floor'>('line');
  let target = $state(''), toZ = $state<number | null>(null);
  let tol = $state(frameTolerance());
  let note = $state<string | null>(null);
  const lines = $derived.by(() => { void modelStore.elements; return modelBeamLines().filter((l) => l.id !== line.id); });
  const fromZ = $derived(lineAxis(line)?.start.z ?? 0);
  const levels = $derived.by(() => { void modelStore.elements; return lineLevels().filter((z) => Math.abs(z - fromZ) > 0.01); });
  const labelOf = (id: string) => [line, ...lines].find((l) => l.id === id)?.label ?? id;

  const preview = $derived.by((): { plans: CopyPlan[]; unmatched: BeamLine[] } | null => {
    void modelStore.elements;
    if (mode === 'line') {
      const tl = lines.find((l) => l.id === target);
      return tl ? { plans: previewFrameCopy(line, [tl], tol), unmatched: [] } : null;
    }
    return toZ === null ? null : previewFloorCopy(fromZ, toZ, tol);
  });
  const fits = $derived(preview ? preview.plans.flatMap((p) => p.rows).filter((r) => r.status === 'copy').length : 0);
  function apply() {
    if (!preview) return;
    note = tp('desk.copy.done', { n: applyFrameCopy(preview.plans).length });
  }
</script>

<section class="fc" data-testid="frame-copy">
  <h5>{t('desk.copy.title')}</h5>
  <div class="fc-row">
    <select bind:value={mode} data-testid="frame-copy-mode"><option value="line">{t('desk.copy.toLine')}</option><option value="floor">{t('desk.copy.toFloor')}</option></select>
    {#if mode === 'line'}
      <select bind:value={target} data-testid="frame-copy-target">
        <option value="">{t('desk.copy.pick')}</option>
        {#each lines as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
      </select>
    {:else}
      <select value={toZ ?? ''} onchange={(e) => (toZ = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} data-testid="frame-copy-level">
        <option value="">{t('desk.copy.pick')}</option>
        {#each levels as z}<option value={z}>z = {z.toFixed(2)} m</option>{/each}
      </select>
    {/if}
    <label>{t('desk.copy.tol')}<input type="number" min="0" max="500" step="5" bind:value={tol} data-testid="frame-copy-tol" /> mm</label>
  </div>
  {#if preview}
    <table class="fc-table" data-testid="frame-copy-preview">
      <tbody>
        {#each preview.plans as p (p.target)}
          <tr><th colspan="3">{labelOf(p.source)} → {labelOf(p.target)}{p.reversed ? ` (${t('desk.copy.reversed')})` : ''}</th></tr>
          {#each p.rows as r (r.target)}
            <tr class="st-{r.status}" data-testid="frame-copy-row-{r.target}" data-status={r.status}>
              <td>#{r.target}{r.source !== null ? ` ← #${r.source}` : ''}</td>
              <td>{t(`desk.copy.status.${r.status}`)}</td>
              <td class="num">{r.lengthTarget.toFixed(2)}{r.lengthSource !== null && Math.abs(r.lengthSource - r.lengthTarget) > 1e-6 ? ` / ${r.lengthSource.toFixed(2)}` : ''} m</td>
            </tr>
          {/each}
        {/each}
        {#each preview.unmatched as u (u.id)}
          <tr class="st-noSource"><td colspan="3">{tp('desk.copy.unmatched', { line: u.label })}</td></tr>
        {/each}
      </tbody>
    </table>
    <button disabled={fits === 0} onclick={apply} data-testid="frame-copy-apply">{tp('desk.copy.apply', { n: fits })}</button>
  {/if}
  {#if note}<p class="fc-hint" role="status">{note}</p>{/if}
</section>

<style>
  .fc { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; font-size: 0.7rem; }
  .fc h5 { margin: 0; font-size: 0.72rem; }
  .fc-row { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
  .fc-row label { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); }
  .fc-row input { width: 3.6rem; font-size: 0.7rem; }
  .fc select { font-size: 0.7rem; max-width: 100%; }
  .fc-table { border-collapse: collapse; width: 100%; }
  .fc-table th { text-align: left; font-weight: 600; padding-top: 4px; }
  .fc-table td { padding: 1px 6px 1px 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .st-length, .st-section, .st-noSource { color: var(--st-danger); }
  .fc button { align-self: flex-start; font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .fc button:disabled { opacity: 0.45; cursor: default; }
  .fc-hint { margin: 0; color: var(--st-text-3); }
</style>
