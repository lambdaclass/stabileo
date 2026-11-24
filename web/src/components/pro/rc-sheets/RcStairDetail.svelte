<script lang="ts">
  /** A stair's bars to adopt or edit, what the model did not say and was presumed, and its section. */
  import { t } from '../../../lib/i18n';
  import { setAdopted } from '../../../lib/store/rc-sheets.svelte';
  import type { StairAdopted, StairRow } from '../../../lib/rc-sheets/stair-row';
  import RcStairSvg from './RcStairSvg.svelte';

  let { row }: { row: StairRow } = $props();
  const DIAS = [6, 8, 10, 12, 16, 20];
  const copy = (): StairAdopted => JSON.parse(JSON.stringify(row.adopted));
  const set = (k: 'main' | 'top' | 'dist', p: Partial<{ dia: number; spacing: number }>) => {
    const a = copy(), cur = a[k] ?? row.proposed[k] ?? { dia: 8, spacing: 0.2 };
    setAdopted(row.key, { ...a, [k]: { ...cur, ...p } });
  };
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement | HTMLSelectElement).value);
  const parts = $derived((['main', 'top', 'dist'] as const).filter((k) => !!row.adopted[k]));
</script>

{#if row.unsupported}
  <p class="note" data-testid="rc-stair-unsupported">{t('rcSheets.stair.unsupported')}</p>
{:else}
  {#if row.demand.presumed.length}
    <p class="note" data-testid="rc-stair-presumed">{t('rcSheets.stair.presumedTitle')}: {row.demand.presumed.map((k) => t(k)).join(' · ')}</p>
  {/if}
  <div class="rse">
    {#each parts as k (k)}
      {@const b = row.adopted[k]!}
      <label data-testid="rc-stair-edit-{k}">
        <span>{t(`rcSheets.stair.bars.${k}`)}</span>
        <select value={b.dia} onchange={(e) => set(k, { dia: num(e) })}>{#each DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
        <span>c/</span>
        <input type="number" min="7.5" max="45" step="2.5" value={Math.round(b.spacing * 1000) / 10} onchange={(e) => set(k, { spacing: Math.min(0.45, Math.max(0.075, num(e) / 100)) })} />
        <span>cm</span>
      </label>
    {/each}
    {#if !row.isAdopted}<button type="button" class="pk-btn" onclick={() => setAdopted(row.key, row.proposed)} data-testid="rc-stair-adopt">{t('rcSheets.adoptProposal')}</button>{/if}
  </div>
  <div class="rcw-secs"><RcStairSvg {row} /></div>
{/if}

<style>
  .note { font-size: 0.72rem; color: var(--st-text-2); margin: 2px 0 6px; }
  .rse { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; margin: 4px 0 8px; font-size: 0.72rem; }
  .rse label { display: inline-flex; gap: 4px; align-items: center; }
  .rse input { width: 56px; }
  .rcw-secs { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 8px; min-width: 0; }
</style>
