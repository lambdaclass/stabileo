<script lang="ts">
  /**
   * A batch over a family's items (walls, slab panels, footings or stairs): which items, the
   * fields to set (empty leaves each item's own), a preview of each item before and after with the
   * ones a limit blocks, and «Apply», one undo step. Closed until opened, with its summary.
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { planFootingBatch, planSlabBatch, planStairBatch, planWallBatch, type FamilyRow, type MatPatch, type SlabKey } from '../../../lib/engine/design/family-batch';
  import { applyFamilyBatch, batchDiameters, footingItems, slabItems, stairItems, wallItems, type BatchFamily } from '../../../lib/store/family-batch-store';
  import { detailingStore } from '../../../lib/store/detailing.svelte';

  let { family }: { family: BatchFamily } = $props();

  const items = $derived.by(() => {
    void modelStore.designDecisions; void modelStore.designData; void detailingStore.lastFloorRun; void modelStore.model.footings;
    return family === 'wall' ? wallItems() : family === 'slab' ? slabItems() : family === 'footing' ? footingItems() : stairItems();
  });
  let chosen = $state<Set<string>>(new Set());
  const all = $derived(items.length > 0 && items.every((i) => chosen.has(i.id)));
  function toggle(id: string) { const n = new Set(chosen); if (n.has(id)) n.delete(id); else n.add(id); chosen = n; }
  function toggleAll() { chosen = all ? new Set() : new Set(items.map((i) => i.id)); }

  const dias = $derived(batchDiameters());
  // Fields: «a» is the first mat of the family (vertical, bottom, main bars), «b» the second.
  let aDia = $state<number | undefined>(undefined), aSp = $state<number | undefined>(undefined);
  let bDia = $state<number | undefined>(undefined), bSp = $state<number | undefined>(undefined);
  let curtains = $state<'' | '1' | '2'>(''), topOff = $state(false), hooks = $state<'' | 'yes' | 'no'>('');
  let slabKey = $state<SlabKey>('bottomX');
  let note = $state<string | null>(null);
  const mp = (d?: number, s?: number): MatPatch | undefined => (d === undefined && s === undefined ? undefined : { ...(d !== undefined ? { diameter: d } : {}), ...(s !== undefined ? { spacing: s / 100 } : {}) });

  const rows = $derived.by((): FamilyRow<unknown>[] => {
    const sel = items.filter((i) => chosen.has(i.id));
    if (!sel.length) return [];
    if (family === 'wall') return planWallBatch(sel as never, { ...(mp(aDia, aSp) ? { vertical: mp(aDia, aSp) } : {}), ...(mp(bDia, bSp) ? { horizontal: mp(bDia, bSp) } : {}), ...(curtains ? { curtains: Number(curtains) as 1 | 2 } : {}) }, dias);
    if (family === 'slab') return planSlabBatch(sel as never, { ...(mp(aDia, aSp) ? { base: { [slabKey]: mp(aDia, aSp) } } : {}), ...(mp(bDia, bSp) || hooks ? { bands: { ...(mp(bDia, bSp) ?? {}), ...(hooks ? { hooks: hooks === 'yes' } : {}) } } : {}) }, dias);
    if (family === 'footing') return planFootingBatch(sel as never, { ...(mp(aDia, aSp) ? { bottom: mp(aDia, aSp) } : {}), ...(topOff ? { top: null } : mp(bDia, bSp) ? { top: mp(bDia, bSp) } : {}) }, dias);
    return planStairBatch(sel as never, { ...(aDia !== undefined ? { barDia: aDia } : {}), ...(bDia !== undefined ? { distDia: bDia } : {}) }, dias);
  });
  const changing = $derived(rows.filter((r) => r.next !== undefined).length);
  const blocked = $derived(rows.filter((r) => r.blocked).length);
  const labels = $derived(({
    wall: [t('design.fbatch.vertical'), t('design.fbatch.horizontal')],
    slab: [t('design.fbatch.base'), t('design.fbatch.bands')],
    footing: [t('design.fbatch.bottom'), t('design.fbatch.top')],
    stair: [t('design.fbatch.main'), t('design.fbatch.dist')],
  } as const)[family]);
  function apply() { note = tp('design.fbatch.done', { n: applyFamilyBatch(family, rows) }); }
  const num = (e: Event) => { const v = (e.currentTarget as HTMLInputElement | HTMLSelectElement).value; return v === '' ? undefined : Number(v); };
</script>

<details class="fb" data-testid="family-batch-{family}">
  <summary>{tp('design.fbatch.title', { n: items.length })}{chosen.size ? ` · ${tp('design.fbatch.chosen', { n: chosen.size })}` : ''}</summary>
  <div class="fb-items">
    <label><input type="checkbox" checked={all} onchange={toggleAll} data-testid="family-batch-all" /> {t('design.fbatch.all')}</label>
    {#each items as i (i.id)}<label><input type="checkbox" checked={chosen.has(i.id)} onchange={() => toggle(i.id)} /> {i.label}</label>{/each}
  </div>
  <div class="fb-fields">
    {#each [0, 1] as k (k)}
      <fieldset>
        <legend>{labels[k]}</legend>
        {#if family === 'slab' && k === 0}
          <select bind:value={slabKey} aria-label={t('design.fbatch.base')}>{#each ['bottomX', 'bottomY', 'topX', 'topY'] as key}<option value={key}>{t(`design.fbatch.key.${key}`)}</option>{/each}</select>
        {/if}
        <label>Ø<select onchange={(e) => (k === 0 ? (aDia = num(e)) : (bDia = num(e)))} data-testid="family-batch-dia-{k}"><option value="">—</option>{#each dias as d}<option value={d}>{d}</option>{/each}</select></label>
        {#if family !== 'stair'}
          <label>{t('design.fbatch.spacing')}<input type="number" min="5" max="45" step="2.5" oninput={(e) => (k === 0 ? (aSp = num(e)) : (bSp = num(e)))} data-testid="family-batch-sp-{k}" /> cm</label>
        {/if}
        {#if family === 'footing' && k === 1}<label><input type="checkbox" bind:checked={topOff} /> {t('design.fbatch.topOff')}</label>{/if}
        {#if family === 'slab' && k === 1}
          <label>{t('design.fbatch.hooks')}<select bind:value={hooks}><option value="">—</option><option value="yes">{t('design.fbatch.yes')}</option><option value="no">{t('design.fbatch.no')}</option></select></label>
        {/if}
      </fieldset>
    {/each}
    {#if family === 'wall'}
      <label>{t('design.fbatch.curtains')}<select bind:value={curtains}><option value="">—</option><option value="1">1</option><option value="2">2</option></select></label>
    {/if}
  </div>
  {#if rows.length}
    <table class="fb-table" data-testid="family-batch-preview">
      <tbody>
        {#each rows as r (r.id)}
          <tr class:blocked={!!r.blocked} class:same={!r.blocked && !r.next} data-testid="family-batch-row-{r.id}">
            <td>{r.label}</td><td>{r.before}</td><td>→</td>
            <td>{r.blocked ? tp(r.blocked.key, r.blocked.params) : r.next ? r.after : t('design.fbatch.unchanged')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button disabled={changing === 0} onclick={apply} data-testid="family-batch-apply">{tp('design.fbatch.apply', { n: changing })}</button>
    {#if blocked}<p class="fb-hint">{tp('design.fbatch.blockedN', { n: blocked })}</p>{/if}
  {/if}
  {#if note}<p class="fb-hint" role="status">{note}</p>{/if}
</details>

<style>
  .fb { border: 1px solid var(--st-hair); border-radius: 4px; padding: 4px 8px; background: var(--st-surface-2); font-size: 0.7rem; margin-top: 8px; }
  .fb summary { cursor: pointer; font-weight: 600; font-size: 0.72rem; }
  .fb-items { display: flex; flex-wrap: wrap; gap: 2px 10px; margin: 4px 0; max-height: 7rem; overflow: auto; }
  .fb-items label, .fb-fields label { display: inline-flex; align-items: center; gap: 4px; color: var(--st-text-2); }
  .fb-fields { display: flex; flex-wrap: wrap; gap: 6px; }
  .fb-fields fieldset { border: 1px solid var(--st-hair); border-radius: 4px; padding: 2px 6px; display: flex; flex-wrap: wrap; gap: 4px 8px; }
  .fb-fields legend { font-size: 0.68rem; color: var(--st-text-2); }
  .fb-fields input[type='number'] { width: 3.4rem; font-size: 0.7rem; }
  .fb-fields select { font-size: 0.7rem; }
  .fb-table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  .fb-table td { padding: 1px 6px 1px 0; vertical-align: top; }
  .fb-table tr.blocked td:last-child { color: var(--st-danger); }
  .fb-table tr.same td { color: var(--st-text-3); }
  .fb button { margin-top: 4px; font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .fb button:disabled { opacity: 0.45; cursor: default; }
  .fb-hint { margin: 4px 0 0; color: var(--st-text-3); }
</style>
