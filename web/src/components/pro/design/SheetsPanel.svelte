<!--
  The sheet set of the issued document: its drawings composed onto sheets of one format, numbered,
  each with the title block, plus the index. Built from the SAME document the other exports use
  (`resolve` is the panel's single builder), in the documents' language, which may differ from the
  app's. A revision per sheet overrides the project's current one on that sheet and in the index.
-->
<script lang="ts">
  import { t, tp, OFFERED_LOCALES } from '../../../lib/i18n';
  import { SHEET_FORMATS, type SheetFormat } from '../../../lib/sheets/formats';
  import { sheetSvg, type SetSheet } from '../../../lib/sheets/sheet-set';
  import {
    exportSheetsDxf, exportSheetsPdf, patchSheetSettings, projectSheetSet, setSheetRevision, sheetKinds, sheetSettings,
  } from '../../../lib/store/sheet-set';
  import { PLAN_KINDS, type PlanKind } from '../../../lib/store/work-drawings';
  import type { DocumentModel } from '../../../lib/engine/detailing/document-model';
  import { designFingerprint } from '../../../lib/store/design-fingerprint';
  import OutdatedNotice from './OutdatedNotice.svelte';

  let { resolve, projectName }: { resolve: () => DocumentModel | null; projectName: string } = $props();

  let doc = $state<DocumentModel | null>(null);
  let sheets = $state<SetSheet[]>([]);
  let shown = $state(0);
  let built = $state(false);
  /** The model the sheets on screen were laid out from: a change after it makes them out of date. */
  let builtFrom = $state<string | null>(null);
  const outdated = $derived(built && builtFrom !== null && builtFrom !== designFingerprint());
  const st = $derived(sheetSettings());
  const kinds = $derived(sheetKinds());

  function toggleKind(k: PlanKind) {
    const next = new Set(kinds);
    if (next.has(k)) next.delete(k); else next.add(k);
    patch({ kinds: PLAN_KINDS.filter((x) => next.has(x)) });
  }

  function build() {
    doc = resolve();
    built = true;
    builtFrom = designFingerprint();
    sheets = projectSheetSet(doc, projectName);
    shown = Math.min(shown, Math.max(0, sheets.length - 1));
  }

  /** A setting changed: rebuild what is on screen so it never shows the previous one. */
  function patch(p: Parameters<typeof patchSheetSettings>[0]) {
    patchSheetSettings(p);
    if (built) sheets = projectSheetSet(doc, projectName);
  }

  function revise(number: string, code: string) {
    const c = code.trim();
    setSheetRevision(number, c ? { code: c, date: new Date().toISOString().slice(0, 10) } : null);
    sheets = projectSheetSet(doc, projectName);
  }

  const at = () => new Date().toISOString();
</script>

<section class="sheets" data-testid="sheets-panel" aria-labelledby="sheets-title">
  <h4 id="sheets-title">{t('sheet.ui.title')}</h4>
  <p class="lead">{t('sheet.ui.lead')}</p>

  <div class="settings">
    <label>{t('sheet.ui.format')}
      <select data-testid="sheets-format" value={st.format}
              onchange={(e) => patch({ format: e.currentTarget.value as SheetFormat })}>
        {#each SHEET_FORMATS as f (f)}<option value={f}>{f}</option>{/each}
      </select>
    </label>
    <label>{t('sheet.ui.language')}
      <select data-testid="sheets-language" value={st.language ?? ''}
              onchange={(e) => patch({ language: e.currentTarget.value || undefined })}>
        <option value="">{t('sheet.ui.languageApp')}</option>
        {#each OFFERED_LOCALES as l (l)}<option value={l}>{l}</option>{/each}
      </select>
    </label>
    <label>{t('sheet.ui.prefix')}
      <input data-testid="sheets-prefix" value={st.prefix} size="4"
             onchange={(e) => patch({ prefix: e.currentTarget.value })} />
    </label>
    <label>{t('sheet.ui.start')}
      <input data-testid="sheets-start" type="number" min="0" value={st.start}
             onchange={(e) => patch({ start: Math.max(0, Math.round(Number(e.currentTarget.value) || 0)) })} />
    </label>
  </div>

  <details class="kinds" data-testid="sheets-kinds">
    <summary>{t('sheet.ui.kinds')} <span class="muted">· {tp('sheet.ui.kindsSummary', { n: kinds.size, m: PLAN_KINDS.length })}</span></summary>
    <div class="kind-list">
      {#each PLAN_KINDS as k (k)}
        <label><input type="checkbox" data-testid={`sheets-kind-${k}`} checked={kinds.has(k)} onchange={() => toggleKind(k)} /> {t(`sheet.kind.${k}`)}</label>
      {/each}
    </div>
  </details>

  <OutdatedNotice what="detailing" testid="sheets-detailing-outdated" />
  <OutdatedNotice what="sheets" stale={outdated} testid="sheets-outdated" />
  <div class="actions">
    <button data-testid="sheets-build" onclick={build}>{t('sheet.ui.build')}</button>
    {#if sheets.length > 0}
      <!-- Sheets laid out before the last change are not downloaded: lay them out again first. -->
      <button data-testid="sheets-pdf" disabled={outdated} onclick={() => exportSheetsPdf(doc, sheets, at(), projectName)}>{t('sheet.ui.pdf')}</button>
      <button data-testid="sheets-dxf" disabled={outdated} onclick={() => exportSheetsDxf(doc, sheets, at())}>{t('sheet.ui.dxf')}</button>
    {/if}
  </div>

  {#if built && sheets.length === 0}
    <p class="muted" data-testid="sheets-none">{t('sheet.ui.none')}</p>
  {:else if sheets.length > 0}
    <p class="muted" data-testid="sheets-count">{tp('sheet.ui.count', { n: sheets.length })}</p>
    <ul class="list" data-testid="sheets-list">
      {#each sheets as s, i (s.number)}
        <li class:on={i === shown}>
          <button class="pick" data-testid={`sheets-item-${s.number}`} onclick={() => (shown = i)}>
            <span class="num">{s.number}</span><span class="ttl">{s.title}</span><span class="fmt">{s.format}</span>
          </button>
          <label class="rev">{t('sheet.ui.rev')}
            <input data-testid={`sheets-rev-${s.number}`} size="3" placeholder="—"
                   title={t('sheet.ui.revHint')} value={st.revisions?.[s.number]?.code ?? ''}
                   onchange={(e) => revise(s.number, e.currentTarget.value)} />
          </label>
        </li>
      {/each}
    </ul>
    {#if sheets[shown]}
      <!-- The sheet's own SVG writer escapes every text it draws. -->
      <div class="preview" data-testid="sheets-preview">{@html sheetSvg(sheets[shown]!)}</div>
    {/if}
  {/if}
</section>

<style>
  .sheets { border-top: 1px solid var(--st-hair); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .lead, .muted { margin: 0; font-size: 0.68rem; color: var(--st-text-2); line-height: 1.35; }
  .settings { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .settings label, .rev { display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.64rem; color: var(--st-text-2); }
  .settings select, .settings input, .rev input {
    font-size: 0.7rem; padding: 0.1rem 0.25rem; background: var(--st-surface-2); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: 3px;
  }
  .settings input[type='number'] { width: 4rem; }
  .kinds summary { font-size: 0.68rem; cursor: pointer; color: var(--st-text); }
  .kinds .muted { display: inline; }
  .kind-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.1rem 0.5rem; padding: 0.25rem 0; }
  .kind-list label { display: flex; align-items: center; gap: 0.25rem; font-size: 0.66rem; color: var(--st-text); }
  .actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .actions button {
    font-size: 0.7rem; padding: 0.2rem 0.5rem; background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer;
  }
  .actions button:hover { background: var(--st-hair-strong); }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; max-height: 12rem; overflow: auto; }
  .list li { display: flex; align-items: end; gap: 0.3rem; }
  .list li.on .pick { border-color: var(--st-interactive); }
  .pick {
    flex: 1; min-width: 0; display: flex; gap: 0.4rem; align-items: baseline; text-align: left; font-size: 0.68rem;
    padding: 0.15rem 0.3rem; background: none; color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 3px; cursor: pointer;
  }
  .num { font-weight: 600; min-width: 2.6rem; flex: none; }
  .ttl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fmt { color: var(--st-text-2); flex: none; }
  .rev { flex-direction: row; align-items: center; gap: 0.2rem; }
  .rev input { width: 3rem; }
  .preview { border: 1px solid var(--st-hair); border-radius: 3px; padding: 0.25rem; }
  .preview :global(svg) { display: block; width: 100%; height: auto; }
</style>
