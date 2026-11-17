<script lang="ts">
  /**
   * The project's listings, each its own document: chosen column by column, filtered, and written
   * as PDF, HTML, a workbook or CSV from the same rows; all of them together in one workbook; the
   * waste added to the quantities; and the bar schedule for bending machines (BVBS).
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { LISTING_IDS, listing, listingColumns, listingSettings, setListingConfig, setWastePct, type ListingId } from '../../../lib/store/listings';
  import { exportBvbs, exportListing, exportListingsWorkbook, type ListingFormat } from '../../../lib/store/listing-export';
  import { sheetLanguage } from '../../../lib/store/sheet-set';
  import type { DocumentModel } from '../../../lib/engine/detailing/document-model';
  import OutdatedNotice from './OutdatedNotice.svelte';

  let { resolve }: { resolve: () => DocumentModel | null } = $props();
  let open = $state<ListingId | null>(null);
  const st = $derived.by(() => { void modelStore.designData; return listingSettings(); });
  const full = $derived.by(() => { void modelStore.designData; void modelStore.elements; return open ? listing(open, sheetLanguage()) : null; });
  // The columns a listing has before any choice: the unconfigured build.
  const allCols = $derived.by(() => { void modelStore.designData; return open ? listingColumns(open, sheetLanguage()) : []; });
  const conf = $derived(open ? st.configs?.[open] ?? {} : {});
  function toggleCol(key: string, on: boolean) {
    if (!open) return;
    const cur = new Set(conf.columns?.length ? conf.columns : allCols.map((c) => c.key));
    if (on) cur.add(key); else cur.delete(key);
    setListingConfig(open, { ...conf, columns: allCols.map((c) => c.key).filter((k) => cur.has(k)) });
  }
  const FORMATS: ListingFormat[] = ['pdf', 'html', 'docx', 'xlsx', 'csv'];
  let note = $state<string | null>(null);
  function bvbs() { const d = resolve(); if (d) exportBvbs(d, new Date().toISOString()); else note = t('list.ui.noDocument'); }
</script>

<section class="lp" data-testid="listings-panel">
  <h4>{t('list.ui.title')}</h4>
  <!-- The quantities, the steel and the BVBS read the detailing: said when it is older than the model. -->
  <OutdatedNotice what="detailing" testid="listings-detailing-outdated" />
  <div class="row">
    <label>{t('list.ui.waste')}<input type="number" min="0" max="50" step="1" value={st.wastePct ?? 0} onchange={(e) => setWastePct(Number(e.currentTarget.value))} data-testid="listings-waste" /> %</label>
    <button onclick={() => exportListingsWorkbook([...LISTING_IDS])} data-testid="listings-all-xlsx">{t('list.ui.allXlsx')}</button>
    <button onclick={bvbs} data-testid="listings-bvbs">{t('list.ui.bvbs')}</button>
  </div>
  <ul>
    {#each LISTING_IDS as id (id)}
      <li data-testid="listing-{id}">
        <button class="name" class:on={open === id} onclick={() => (open = open === id ? null : id)}>{t(`list.${id}.title`)}</button>
        {#each FORMATS as f}<button onclick={() => exportListing(id, f)} data-testid="listing-{id}-{f}">{f.toUpperCase()}</button>{/each}
      </li>
      {#if open === id && full}
        <div class="cfg" data-testid="listing-config-{id}">
          <div class="row">
            <input placeholder={t('list.ui.filter')} value={conf.text ?? ''} onchange={(e) => setListingConfig(id, { ...conf, text: e.currentTarget.value || undefined })} data-testid="listing-filter-{id}" />
            <label><input type="checkbox" checked={!!conf.failingOnly} onchange={(e) => setListingConfig(id, { ...conf, failingOnly: e.currentTarget.checked || undefined })} /> {t('list.ui.failingOnly')}</label>
            <span class="muted">{tp('list.ui.rows', { n: full.rows.length })}</span>
          </div>
          <div class="cols">
            {#each allCols as c (c.key)}<label><input type="checkbox" checked={!conf.columns?.length || conf.columns.includes(c.key)} onchange={(e) => toggleCol(c.key, e.currentTarget.checked)} /> {c.label}</label>{/each}
          </div>
        </div>
      {/if}
    {/each}
  </ul>
  {#if note}<p class="muted" role="status">{note}</p>{/if}
</section>

<style>
  .lp { border-top: 1px solid var(--st-hair); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.68rem; color: var(--st-text-2); }
  h4 { margin: 0; font-size: 0.78rem; color: var(--st-text); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.2rem; }
  .name { flex: 1; min-width: 0; text-align: left; }
  .name.on { border-color: var(--st-interactive); }
  .row, .cols { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.6rem; }
  .cfg { padding: 0.25rem 0 0.4rem 0.8rem; display: flex; flex-direction: column; gap: 0.25rem; }
  label { display: inline-flex; align-items: center; gap: 0.2rem; }
  input, button { font-size: 0.66rem; padding: 0.05rem 0.3rem; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; }
  input[type='number'] { width: 3.2rem; }
  button { cursor: pointer; }
  .muted { margin: 0; }
</style>
