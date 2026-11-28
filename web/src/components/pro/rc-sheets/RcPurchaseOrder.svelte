<script lang="ts">
  /** What each pour orders: by level, its concrete and its stock bars by diameter, the steel per m³ by level and by family, and the order as text to send. */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { orderText, purchaseOrder, type OrderLevel } from '../../../lib/rc-sheets/schedule/order';
  import type { BendingSchedule } from '../../../lib/rc-sheets/schedule/schedule';
  import { SHEET_FAMILIES } from '../../../lib/rc-sheets/types';
  import type { SheetRows } from '../../../lib/store/rc-sheets.svelte';

  let { rows, schedule }: { rows: SheetRows; schedule: BendingSchedule } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const o = $derived(purchaseOrder(rows, schedule, rows.levels ?? []));
  const dias = $derived(o.total.bars.map((b) => b.dia));
  const barsAt = (l: OrderLevel, dia: number) => l.bars.find((b) => b.dia === dia);
  const families = $derived(SHEET_FAMILIES.filter((f) => o.total.byFamily[f]));
  let copied = $state(false);
  async function copy() {
    await navigator.clipboard.writeText(orderText(o, (k, p) => (p ? tp(k, p) : t(k)), fmt));
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<section class="rpo" data-testid="rc-order">
  <div class="bar">
    <strong>{t('rcSheets.order.title')}</strong>
    <span class="dim">{tp('rcSheets.order.note', { waste: fmt(o.waste * 100, 0), length: o.stockLength })}</span>
    <button type="button" class="rcs-btn" onclick={copy} data-testid="rc-order-copy">{copied ? t('rcSheets.order.copied') : t('rcSheets.order.copy')}</button>
  </div>
  <table class="tbl" data-testid="rc-order-table">
    <thead><tr>
      <th>{t('rcSheets.col.level')}</th><th class="n">{t('rcSheets.order.concrete')}</th><th class="n">kg + {fmt(o.waste * 100, 0)} %</th><th class="n">kg/m³</th>
      {#each dias as d (d)}<th class="n">Ø{d}</th>{/each}
    </tr></thead>
    <tbody>
      {#each [...o.levels, o.total] as l, i (i)}
        <tr class:tot={l === o.total} data-testid={l === o.total ? 'rc-order-total' : 'rc-order-level'}>
          <td>{l === o.total ? t('rcSheets.order.total') : l.level || '—'}</td>
          <td class="n">{fmt(l.concrete, 2)}</td>
          <td class="n">{fmt(l.withWaste, 0)}</td>
          <td class="n">{l.ratio === null ? '—' : fmt(l.ratio, 0)}</td>
          {#each dias as d (d)}
            {@const b = barsAt(l, d)}
            <td class="n" title={b ? `${fmt(b.withWaste, 0)} kg` : ''}>{b ? b.stockBars : '—'}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  <table class="tbl fam" data-testid="rc-order-families">
    <thead><tr><th>{t('rcSheets.order.family')}</th><th class="n">{t('rcSheets.order.concrete')}</th><th class="n">kg</th><th class="n">kg/m³</th></tr></thead>
    <tbody>
      {#each families as f (f)}
        {@const x = o.total.byFamily[f]!}
        <tr><td>{t(`rcSheets.family.${f}`)}</td><td class="n">{fmt(x.concrete, 2)}</td><td class="n">{fmt(x.kg, 0)}</td><td class="n">{x.concrete > 1e-9 ? fmt(x.kg / x.concrete, 0) : '—'}</td></tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  .rpo { display: flex; flex-direction: column; gap: 8px; font-size: 0.74rem; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .dim { color: var(--st-text-2); }
  .tbl { border-collapse: collapse; width: max-content; max-width: 100%; }
  .tbl th, .tbl td { padding: 3px 8px; border-bottom: 1px solid var(--st-hair); text-align: left; }
  .tbl .n { text-align: right; font-variant-numeric: tabular-nums; }
  .tbl tr.tot td { font-weight: 600; border-top: 1px solid var(--st-hair-strong); }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
</style>
