<!--
  Takeoff and budget: the structure's work items measured from the model and its design, priced
  from the person's price base for the place of the works, with the summary coefficient, and
  exported as CSV, workbook or FIEBDC-3 (BC3). No price is assumed: an item without one is shown
  without an amount and counted as missing.
-->
<script lang="ts">
  import { t, tp, i18n } from '../../../../lib/i18n';
  import {
    activeBase, budgetSettings, currentBudget, describeItem, downloadBudgetBc3, downloadBudgetCsv, downloadBudgetXlsx,
    importPrices, removeBase, saveBase, setActiveBase, setPrice, setShares,
  } from '../../../../lib/store/budget';

  const settings = $derived(budgetSettings());
  const base = $derived(activeBase());
  const budget = $derived(currentBudget());
  const describe = $derived(describeItem(tp as never));
  let note = $state('');
  // Open while there is no base; it stays as the person leaves it after that.
  // svelte-ignore state_referenced_locally
  let basesOpen = $state(!activeBase());
  const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return String(s).trim() !== '' && Number.isFinite(v) ? v : undefined; };
  const money = (v: number | null) => (v === null ? '—' : new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v));
  const qty = (v: number) => new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 3 }).format(v);

  let nb = $state<Record<string, string>>({ name: '', location: '', currency: 'ARS', date: new Date().toISOString().slice(0, 10), factor: '1' });
  function createBase() {
    if (!nb.name!.trim() || !nb.location!.trim() || !nb.currency!.trim()) { note = t('bud.ui.missing'); return; }
    saveBase({ id: `pb-${Date.now().toString(36)}`, name: nb.name!.trim(), location: nb.location!.trim(), currency: nb.currency!.trim(), date: nb.date!, locationFactor: num(nb.factor!) ?? 1, prices: {} });
    note = '';
  }
  let csv = $state('');
  function doImport() {
    if (!base) return;
    const r = importPrices(base.id, csv);
    note = tp('bud.ui.imported', { n: r.read, s: r.skipped });
    csv = '';
  }
  async function readFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) csv = await f.text();
  }
  const shares = $derived(settings.shares ?? { overheads: 0, financial: 0, profit: 0, tax: 0 });
  const setShare = (k: keyof typeof shares, v: string) => setShares({ ...shares, [k]: (num(v) ?? 0) / 100 });
</script>

<div class="sf" data-testid="budget-editor">
  <p class="muted">{t('bud.ui.lead')}</p>

  <details class="sf-sec" bind:open={basesOpen} data-testid="budget-bases">
    <summary>{t('bud.ui.bases')} <span class="muted">· {base ? `${base.name} (${base.location}, ${base.currency})` : t('bud.ui.noBase')}</span></summary>
    <div class="sf-form">
      <label>{t('bud.ui.inUse')}
        <select value={settings.activeBaseId ?? ''} onchange={(e) => setActiveBase(e.currentTarget.value || undefined)} data-testid="budget-base-select">
          <option value="">—</option>{#each settings.bases as b (b.id)}<option value={b.id}>{b.name} · {b.location}</option>{/each}
        </select>
      </label>
      {#if base}<button class="link" onclick={() => removeBase(base.id)}>{t('mat.timber.drop')}</button>{/if}
    </div>
    <div class="sf-form">
      {#each [['name', 'bud.ui.name'], ['location', 'bud.ui.location'], ['currency', 'bud.ui.currency'], ['date', 'bud.ui.date'], ['factor', 'bud.ui.factor']] as [k, label] (k)}
        <label>{t(label)} <input bind:value={nb[k]} data-testid="budget-new-{k}" /></label>
      {/each}
      <button onclick={createBase} data-testid="budget-new-save">{t('sfl.add')}</button>
    </div>
    {#if base}
      <div class="sf-form">
        <label class="wide">{t('bud.ui.csv')} <textarea rows="3" bind:value={csv} data-testid="budget-csv"></textarea></label>
        <input type="file" accept=".csv,.txt" onchange={readFile} />
        <button onclick={doImport} data-testid="budget-import">{t('bud.ui.import')}</button>
      </div>
    {/if}
  </details>

  <div class="sf-form" data-testid="budget-shares">
    {#each [['overheads', 'bud.share.overheads'], ['financial', 'bud.share.financial'], ['profit', 'bud.share.profit'], ['tax', 'bud.share.tax']] as [k, label] (k)}
      <label>{t(label)} <input inputmode="decimal" value={String(Math.round((shares[k as keyof typeof shares] ?? 0) * 10000) / 100)} onchange={(e) => setShare(k as keyof typeof shares, e.currentTarget.value)} /></label>
    {/each}
  </div>

  <table class="sf-t" data-testid="budget-table">
    <thead><tr><th>{t('bud.col.code')}</th><th>{t('bud.col.item')}</th><th>{t('bud.col.unit')}</th><th class="n">{t('bud.col.quantity')}</th><th class="n">{t('bud.col.price')}</th><th class="n">{t('bud.col.amount')}</th></tr></thead>
    <tbody>
      {#each budget.chapters as c (c.chapter)}
        <tr class="chap"><td colspan="5">{t(`bud.chapter.${c.chapter}`)}</td><td class="n">{money(c.subtotal)}</td></tr>
        {#each c.lines as l (l.item.code)}
          <tr data-testid="budget-line-{l.item.code}">
            <td>{l.item.code}</td><td>{describe(l.item)}</td><td>{l.item.unit}</td><td class="n">{qty(l.item.quantity)}</td>
            <td class="n">{#if base}<input class="price" inputmode="decimal" value={base.prices[l.item.code] ?? ''} onchange={(e) => setPrice(base.id, l.item.code, num(e.currentTarget.value) ?? null)} />{:else}—{/if}</td>
            <td class="n">{money(l.amount)}</td>
          </tr>
        {/each}
      {/each}
    </tbody>
    <tfoot>
      <tr><td colspan="5">{t('bud.direct')}</td><td class="n" data-testid="budget-direct">{money(budget.directCost)}</td></tr>
      <tr><td colspan="5">{t('bud.coefficient')}</td><td class="n">{budget.coefficient.toFixed(4)}</td></tr>
      <tr class="chap"><td colspan="5">{t('bud.total')}{base ? ` (${base.currency})` : ''}</td><td class="n" data-testid="budget-total">{money(budget.total)}</td></tr>
    </tfoot>
  </table>
  {#if budget.chapters.length === 0}<p class="muted">{t('bud.ui.empty')}</p>{/if}
  {#if budget.missing.length && budget.chapters.length}<p class="muted" data-testid="budget-missing">{tp('bud.ui.missingPrices', { n: budget.missing.length })}</p>{/if}

  <div class="sf-form">
    <button onclick={() => downloadBudgetCsv(tp as never, i18n.locale)} data-testid="budget-csv-out">CSV</button>
    <button onclick={() => downloadBudgetXlsx(tp as never)}>{t('bud.ui.workbook')}</button>
    <button onclick={() => downloadBudgetBc3(tp as never)} data-testid="budget-bc3-out">FIEBDC-3 (BC3)</button>
  </div>
  {#if note}<p class="muted" data-testid="budget-note">{note}</p>{/if}
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td, .sf-t th { padding: 2px 4px; border-top: 1px solid var(--st-hair); text-align: left; }
  .sf-t .n { text-align: right; font-variant-numeric: tabular-nums; }
  .sf-t tr.chap td { font-weight: 600; background: var(--st-surface-2); }
  .sf-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .sf-form label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  .sf-form label.wide { flex: 1 1 18rem; }
  input, select, textarea { font-size: 0.72rem; width: 6.5rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  textarea { width: 100%; font-family: var(--st-mono); }
  input.price { width: 5.5rem; text-align: right; }
  input[type='file'] { width: auto; }
  select { width: auto; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button.link { background: none; border: none; color: var(--st-value); padding: 0 0.3rem; }
</style>
