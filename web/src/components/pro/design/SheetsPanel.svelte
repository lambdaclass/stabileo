<!--
  The sheet set of the issued document: its drawings composed onto sheets of one format, numbered,
  each with the title block, plus the index. Built from the SAME document the other exports use
  (`resolve` is the panel's single builder), in the documents' language, which may differ from the
  app's. A revision per sheet overrides the project's current one on that sheet and in the index.
-->
<script lang="ts" module>
  /** The configuration's open state, across mounts of the panel in the session. */
  let setupOpenKept: boolean | null = null;
</script>

<script lang="ts">
  import { t, tp, OFFERED_LOCALES } from '../../../lib/i18n';
  import { onMount } from 'svelte';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { SHEET_FORMATS, type SheetFormat } from '../../../lib/sheets/formats';
  import { sheetSvg, type SetSheet } from '../../../lib/sheets/sheet-set';
  import {
    exportSheetsDxf, exportSheetsPdf, exportSheetsSvg, patchSheetSettings, projectSheetSet, projectSheetSetAsync, setSheetEntries, setSheetRevision, sheetEntries, sheetKinds, sheetSettings,
  } from '../../../lib/store/sheet-set';
  import SheetEntriesEditor from './SheetEntriesEditor.svelte';
  import SheetDisplayEditor from './SheetDisplayEditor.svelte';
  import TitleBlockEditor from './TitleBlockEditor.svelte';
  import SheetTemplates from './SheetTemplates.svelte';
  import SheetComposer from './SheetComposer.svelte';
  import DetailCatalog from './DetailCatalog.svelte';
  import { PLAN_KINDS, type PlanKind } from '../../../lib/store/work-drawings';
  import type { DocumentModel } from '../../../lib/engine/detailing/document-model';
  import { designFingerprint } from '../../../lib/store/design-fingerprint';
  import OutdatedNotice from './OutdatedNotice.svelte';

  /**
   * `autoBuild`: the drawings place of the design desk. The set is laid out on arrival, the sheets
   * come first and the set's configuration folds below them.
   */
  let { resolve, projectName, autoBuild = false }: { resolve: () => DocumentModel | null; projectName: string; autoBuild?: boolean } = $props();
  /** Whether the set's configuration is open, kept while the panel comes and goes (`setupOpenKept`). */
  let setupOpen = $state(setupOpenKept ?? !autoBuild);
  $effect(() => { setupOpenKept = setupOpen; });

  let doc = $state<DocumentModel | null>(null);
  let sheets = $state<SetSheet[]>([]);
  let shown = $state(0);
  let built = $state(false);
  /** The model the sheets on screen were laid out from: a change after it makes them out of date. */
  let builtFrom = $state<string | null>(null);
  const outdated = $derived(built && builtFrom !== null && builtFrom !== designFingerprint());
  const st = $derived(sheetSettings());
  const kinds = $derived(sheetKinds());

  const entries = $derived(sheetEntries());
  /** A kind on or off: in the arranged list when there is one (all its entries go, or one comes back), else in the kinds. */
  function toggleKind(k: PlanKind) {
    if (st.entries?.length) {
      const has = st.entries.some((e) => e.kind === k);
      const next = has ? st.entries.filter((e) => e.kind !== k) : [...st.entries, { id: st.entries.some((e) => e.id === k) ? `${k}-${Date.now().toString(36)}` : k, kind: k }];
      setEntries(next);
      return;
    }
    const next = new Set(kinds);
    if (next.has(k)) next.delete(k); else next.add(k);
    patch({ kinds: PLAN_KINDS.filter((x) => next.has(x)) });
  }
  function setEntries(next: typeof entries) { setSheetEntries(next); if (built) sheets = projectSheetSet(doc, projectName); }

  // The set built entry by entry, with its progress and a way to stop it.
  let progress = $state<{ done: number; total: number; label: string } | null>(null);
  let abort: AbortController | null = null;
  /**
   * Lay the set out. On arrival in the drawings place (`autoBuild`) it reads the document already
   * built, never builds one: building a document is a revision, and looking at the drawings is not
   * a reason to issue one. «Lay out the sheets» builds it.
   */
  async function build(fromCurrent = false) {
    doc = fromCurrent ? detailingStore.document : resolve();
    abort?.abort();
    const ctl = new AbortController(); abort = ctl;
    const from = designFingerprint();
    const next = await projectSheetSetAsync(doc, projectName, {
      signal: ctl.signal,
      onProgress: (done, total, e) => { progress = { done, total, label: e.label || t(`sheet.kind.${e.kind}`) }; },
    });
    progress = null;
    if (!next || ctl.signal.aborted) return;
    built = true; builtFrom = from; sheets = next;
    shown = Math.min(shown, Math.max(0, sheets.length - 1));
  }
  function cancel() { abort?.abort(); progress = null; }
  onMount(() => { if (autoBuild) void build(true); });
  /**
   * The kinds of plan in the set, in its order, each with how many sheets it takes and the first
   * one (QA of 20-oct: a jump per sheet title made forty chips of one set). A sheet's kind is its
   * entry's, read from its first drawing's key (`entry:drawing`).
   */
  const kindsInSet = $derived.by(() => {
    const out: Array<{ kind: string; title: string; i: number; n: number }> = [];
    sheets.forEach((s, i) => {
      const entry = s.drawings[0]?.split(':')[0];
      if (!entry) return;
      const e = entries.find((x) => x.id === entry);
      const kind = e?.kind ?? entry;
      const at = out.find((x) => x.kind === kind && x.title === (e?.label || t(`sheet.kind.${kind}`)));
      if (at) at.n++; else out.push({ kind, title: e?.label || t(`sheet.kind.${kind}`), i, n: 1 });
    });
    return out;
  });
  /** The kind of the sheet on screen, for the jump that holds it. */
  const shownKind = $derived.by(() => { const s = sheets[shown]; const entry = s?.drawings[0]?.split(':')[0]; return entries.find((x) => x.id === entry)?.kind ?? entry; });
  let dxfVersion = $state<'2004' | 'r12'>('2004');
  /** The sheets chosen for a partial export; none chosen, all of them. */
  let chosen = $state<Set<string>>(new Set());
  const toExport = $derived(chosen.size ? sheets.filter((s) => chosen.has(s.number)) : sheets);
  function choose(n: string, on: boolean) { const c = new Set(chosen); if (on) c.add(n); else c.delete(n); chosen = c; }
  const conflicts = $derived(sheets[0]?.layoutConflicts ?? []);

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

  <details class="setup" bind:open={setupOpen} data-testid="sheets-setup">
    <summary>{t('sheet.ui.setup')} <span class="muted">· {st.format} · {tp('sheet.ui.kindsSummary', { n: kinds.size, m: PLAN_KINDS.length })}</span></summary>
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
  
    <SheetEntriesEditor {entries} onChange={setEntries} />
    <DetailCatalog {doc} onChange={() => { if (built) sheets = projectSheetSet(doc, projectName); }} />
    <SheetDisplayEditor display={st.display} onChange={(d) => patch({ display: d })} />
    <TitleBlockEditor template={st.titleBlock} onChange={(tb) => patch({ titleBlock: tb })} />
    <SheetTemplates onApplied={() => { if (built) sheets = projectSheetSet(doc, projectName); }} />
  
  </details>

  <OutdatedNotice what="detailing" testid="sheets-detailing-outdated" />
  <OutdatedNotice what="sheets" stale={outdated} testid="sheets-outdated" />
  <div class="actions">
    <button data-testid="sheets-build" disabled={!!progress} onclick={() => build()}>{t('sheet.ui.build')}</button>
    {#if progress}
      <span class="muted" role="status" data-testid="sheets-progress">{tp('sheet.ui.progress', { done: progress.done + 1, total: progress.total, label: progress.label })}</span>
      <button data-testid="sheets-cancel" onclick={cancel}>{t('sheet.ui.cancel')}</button>
    {/if}
    {#if sheets.length > 0}
      <!-- Sheets laid out before the last change are not downloaded: lay them out again first. -->
      <button data-testid="sheets-pdf" disabled={outdated} onclick={() => exportSheetsPdf(doc, toExport, at(), projectName)}>{t('sheet.ui.pdf')}</button>
      <button data-testid="sheets-dxf" disabled={outdated} onclick={() => exportSheetsDxf(doc, toExport, at(), dxfVersion)}>{t('sheet.ui.dxf')}</button>
      <select data-testid="sheets-dxf-version" bind:value={dxfVersion} aria-label={t('sheet.ui.dxfVersion')}><option value="2004">DXF 2004</option><option value="r12">DXF R12</option></select>
      <button data-testid="sheets-svg" disabled={outdated} onclick={() => exportSheetsSvg(doc, toExport, at())}>{t('sheet.ui.svg')}</button>
    {/if}
  </div>

  {#if built && sheets.length === 0}
    <p class="muted" data-testid="sheets-none">{t('sheet.ui.none')}</p>
  {:else if sheets.length > 0}
    <p class="muted" data-testid="sheets-count">{tp('sheet.ui.count', { n: sheets.length })}{chosen.size ? ` · ${tp('sheet.ui.chosen', { n: chosen.size })}` : ''}</p>
    {#if conflicts.length}
      <ul class="muted conflicts" data-testid="sheets-layout-conflicts">{#each conflicts as c}<li>{tp(`sheet.ui.conflict.${c.reason}`, { key: c.key, detail: c.detail ?? '' })}</li>{/each}</ul>
    {/if}
    {#if kindsInSet.length > 1}
      <!-- Straight to a kind of drawing: the first sheet that holds it. -->
      <div class="jump" role="group" aria-label={t('sheet.ui.jump')} data-testid="sheets-jump">
        {#each kindsInSet as k (k.i)}<button class:on={shownKind === k.kind} onclick={() => (shown = k.i)} data-testid="sheets-jump-{k.i}">{k.title}{k.n > 1 ? ` · ${k.n}` : ''}</button>{/each}
      </div>
    {/if}
    <ul class="list" data-testid="sheets-list">
      {#each sheets as s, i (s.number)}
        <li class:on={i === shown}>
          <input type="checkbox" checked={chosen.has(s.number)} onchange={(e) => choose(s.number, e.currentTarget.checked)} aria-label={tp('sheet.ui.choose', { n: s.number })} data-testid={`sheets-choose-${s.number}`} />
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
      <div class="one" role="group" aria-label={tp('sheet.ui.thisSheet', { n: sheets[shown]!.number })}>
        <span class="muted">{tp('sheet.ui.thisSheet', { n: sheets[shown]!.number })}</span>
        <button disabled={outdated} onclick={() => exportSheetsPdf(doc, [sheets[shown]!], at(), projectName)} data-testid="sheets-one-pdf">PDF</button>
        <button disabled={outdated} onclick={() => exportSheetsDxf(doc, [sheets[shown]!], at(), dxfVersion)} data-testid="sheets-one-dxf">DXF</button>
        <button disabled={outdated} onclick={() => exportSheetsSvg(doc, [sheets[shown]!], at())} data-testid="sheets-one-svg">SVG</button>
      </div>
      <div class="preview" data-testid="sheets-preview">{@html sheetSvg(sheets[shown]!, st.display, 'screen')}</div>
      <SheetComposer sheet={sheets[shown]!} all={sheets} onChange={() => (sheets = projectSheetSet(doc, projectName))} />
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
  .conflicts { color: var(--st-warn); padding-left: 1rem; }
  .setup > summary { font-size: 0.7rem; cursor: pointer; color: var(--st-text); }
  .jump, .one { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .jump button, .one button { font-size: 0.66rem; padding: 1px 8px; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; cursor: pointer; }
  .jump button.on { border-color: var(--st-value); }
</style>
