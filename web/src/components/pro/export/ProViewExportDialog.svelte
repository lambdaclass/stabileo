<script lang="ts">
  /**
   * PRO's "Exportar imagen": Basic's figures (`lib/export/view-figure.ts`), with what a PRO model
   * adds: its shells, as faces and as a result in colour; a fixed view (plan, the two elevations,
   * isometric) besides the camera's; the results of any case, combination or the envelope; and
   * JPG besides SVG and PNG. The frame and the folded sections are Basic's export dialog's.
   */
  import { t } from '../../../lib/i18n';
  import { uiStore } from '../../../lib/store';
  import ExportDialog from '../../export/ExportDialog.svelte';
  import ExportSection from '../../export/ExportSection.svelte';
  import DrawingPresets, { type Preset } from '../../export/DrawingPresets.svelte';
  import DrawingLayout from '../../export/DrawingLayout.svelte';
  import {
    DEFAULT_FIGURE_OPTIONS, NEEDS_RESULTS, PRO_FIGURE_CONTENTS,
    type FigureContent, type FigureOptions, type FigureView,
  } from '../../../lib/export/view-figure';
  import { copyView, exportView, type ViewFormat } from '../../../lib/export/view-export';
  import type { InkStyle } from '../../../lib/export/paper-ink';
  import { SHELL_CONTOUR_COMPONENTS, shellComponentLabelKey, type ShellContourComponent } from '../../../lib/engine/shell-stress';
  import { ensureProResults, hasShells, resultSet, resultSetChoices } from '../../../lib/pro/export-results';
  import CheckGroup from './CheckGroup.svelte';
  import DrawingFormatRow, { type DrawingFormat } from './DrawingFormatRow.svelte';

  let { open = $bindable(false), format = $bindable('svg'), onformat }: { open: boolean; format: ViewFormat; onformat?: (f: DrawingFormat) => void } = $props();
  function pick(f: DrawingFormat) { if (f !== 'dxf') format = f; onformat?.(f); }

  const KEY = 'stabileo-pro-view-export';
  type Saved = Omit<FigureOptions, 'results' | 'resultsName'>;
  interface Prefs { contents: FigureContent[]; options: Saved; sheet: boolean }
  function load(): Prefs {
    const base: Prefs = { contents: ['model'], options: { ...DEFAULT_FIGURE_OPTIONS, view: 'screen', shells: true, shellComponent: 'vonMises' }, sheet: true };
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const p = JSON.parse(raw) as Partial<Prefs>;
      return {
        contents: (p.contents ?? base.contents).filter((c) => PRO_FIGURE_CONTENTS.includes(c)),
        options: { ...base.options, ...(p.options ?? {}) },
        sheet: p.sheet ?? base.sheet,
      };
    } catch { return base; }
  }
  const prefs = load();
  let contents = $state<FigureContent[]>(prefs.contents);
  let options = $state<Saved>(prefs.options);
  let sheet = $state(prefs.sheet);
  let setKey = $state('screen');
  let busy = $state(false);

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ contents, options, sheet })); } catch { /* the choices last this session */ }
  }

  const shells = $derived(open && hasShells());
  /** The figures this model can have: the shells' only with shells. */
  const offered = $derived(PRO_FIGURE_CONTENTS.filter((c) => c !== 'shellMap' || shells));
  const chosen = $derived(contents.filter((c) => offered.includes(c)));
  const needsSolve = $derived(chosen.some((c) => NEEDS_RESULTS.has(c)));
  const choices = $derived(open ? resultSetChoices() : []);

  const LABEL: Record<FigureContent, string> = {
    model: 'figures.model', reactions: 'figures.reactions', despiece: 'figures.despiece',
    moment: 'figures.moment', shear: 'figures.shear', axial: 'figures.axial', deformed: 'figures.deformed',
    shellMap: 'figures.shellMap',
  };
  const VIEWS: Array<{ id: FigureView; key: string }> = [
    { id: 'screen', key: 'proExport.viewScreen' }, { id: 'top', key: 'proExport.viewTop' },
    { id: 'front', key: 'proExport.viewFront' }, { id: 'side', key: 'proExport.viewSide' }, { id: 'iso', key: 'proExport.viewIso' },
  ];
  const STYLES: Array<{ id: InkStyle; key: string }> = [
    { id: 'color', key: 'viewExport.styleColor' }, { id: 'bw', key: 'viewExport.styleBw' }, { id: 'screen', key: 'viewExport.styleScreen' },
  ];
  const compName = (k: ShellContourComponent) => t(shellComponentLabelKey(k));

  const MODEL_PART: FigureContent[] = ['model', 'despiece'];
  const groupItems = (part: 'model' | 'results') => offered
    .filter((c) => MODEL_PART.includes(c) === (part === 'model'))
    .map((c) => ({ id: c, label: t(LABEL[c]) }));
  function setGroup(part: 'model' | 'results', v: boolean) {
    const ids = groupItems(part).map((i) => i.id as FigureContent);
    contents = PRO_FIGURE_CONTENTS.filter((x) => (ids.includes(x) ? v : contents.includes(x)));
    save();
  }
  const presets = $derived<Preset[]>([
    { id: 'model', label: t('viewExport.presetModel'), ids: ['model'] },
    { id: 'diagrams', label: t('viewExport.presetDiagrams'), ids: ['model', 'moment', 'shear', 'axial'] },
    { id: 'all', label: t('viewExport.presetAll'), ids: offered },
  ]);
  function preset(ids: readonly string[]) {
    contents = PRO_FIGURE_CONTENTS.filter((c) => ids.includes(c));
    save();
  }
  function toggle(c: FigureContent) {
    contents = contents.includes(c) ? contents.filter((x) => x !== c) : PRO_FIGURE_CONTENTS.filter((x) => x === c || contents.includes(x));
    save();
  }

  const contentSummary = $derived(chosen.length
    ? [chosen.map((c) => t(LABEL[c])).join(', '), chosen.length > 1 ? t(sheet ? 'viewExport.layoutSheet' : 'viewExport.layoutSeparate') : null].filter(Boolean).join(' · ')
    : t('viewExport.nothing'));
  const resultsSummary = $derived(choices.find((c) => c.key === setKey)?.label ?? choices[0]?.label ?? '—');
  const drawingSummary = $derived([
    t(VIEWS.find((v) => v.id === (options.view ?? 'screen'))!.key),
    options.loads ? t('viewExport.optLoads') : null,
    options.numbering ? t('viewExport.optNumbering') : null,
    options.values ? t('viewExport.optValues') : null,
    shells && options.shells !== false ? t('proExport.optShells') : null,
  ].filter(Boolean).join(' · '));
  const outputSummary = $derived(`${format.toUpperCase()} · ${t(STYLES.find((s) => s.id === options.style)!.key)}`);

  async function run(kind: 'download' | 'copy') {
    if (busy || chosen.length === 0) return;
    busy = true;
    try {
      // Solved here, with PRO's solve, so the export does not solve with another one.
      if (needsSolve) await ensureProResults();
      const set = setKey === 'screen' ? null : resultSet(setKey);
      const req = {
        format, contents: [...chosen], sheet,
        options: { ...$state.snapshot(options), ...(set ? { results: set.results, resultsName: set.name } : {}) } as FigureOptions,
      };
      if (kind === 'copy') {
        if (await copyView(req)) { uiStore.toast(t('viewExport.copied'), 'success'); open = false; }
      } else if (await exportView(req)) open = false;
    } finally {
      busy = false;
    }
  }
</script>

<ExportDialog bind:open width={560} title={`${t('proExport.drawingsTitle')} — ${format.toUpperCase()}`} testid="pro-view-export-dialog">
  <DrawingFormatRow current={format} onpick={pick} />
  <ExportSection title={t('viewExport.sectionContent')} summary={contentSummary} open testid="pro-view-export-content">
    <DrawingPresets {presets} chosen={chosen} onpick={preset} testid="pro-view-export" />
    <div class="vx-cols">
      <CheckGroup title={t('proExport.groupModel')} items={groupItems('model')} on={(id) => contents.includes(id as FigureContent)}
        toggle={(id) => toggle(id as FigureContent)} setAll={(v) => setGroup('model', v)} testid="pro-view-export" />
      <CheckGroup title={t('proExport.groupResults')} items={groupItems('results')} on={(id) => contents.includes(id as FigureContent)}
        toggle={(id) => toggle(id as FigureContent)} setAll={(v) => setGroup('results', v)} testid="pro-view-export">
        {#snippet after()}
          {#if chosen.includes('shellMap')}
            <select class="vx-select" bind:value={options.shellComponent} onchange={save} aria-label={t('proExport.shellComponent')} data-testid="pro-view-export-shell-component">
              {#each SHELL_CONTOUR_COMPONENTS as m (m.key)}<option value={m.key}>{compName(m.key)}</option>{/each}
            </select>
          {/if}
        {/snippet}
      </CheckGroup>
    </div>
    {#if needsSolve}<p class="xs-note">{t('viewExport.needsSolve')}</p>{/if}
    {#if chosen.includes('despiece')}<p class="xs-note">{t('viewExport.despieceNote')}</p>{/if}
    {#if chosen.length > 1}
      <DrawingLayout together={sheet} labels={[t('viewExport.layoutSheet'), t('viewExport.layoutSeparate')]}
        notes={[t('viewExport.layoutSheetNote'), t('viewExport.layoutSeparateNote')]}
        onpick={(v) => { sheet = v; save(); }} testid="pro-view-export-layout" />
    {/if}
  </ExportSection>

  {#if needsSolve && choices.length > 1}
    <ExportSection title={t('proExport.sectionResults')} summary={resultsSummary} testid="pro-view-export-results">
      <label class="xs-field">
        <span>{t('proExport.resultsOf')}</span>
        <select bind:value={setKey} data-testid="pro-view-export-set">
          {#each choices as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
        </select>
      </label>
      <p class="xs-note">{t('proExport.resultsNote')}</p>
    </ExportSection>
  {/if}

  <ExportSection title={t('viewExport.sectionDrawing')} summary={drawingSummary}>
    <label class="xs-field">
      <span>{t('proExport.view')}</span>
      <select value={options.view ?? 'screen'} onchange={(e) => { options.view = e.currentTarget.value as FigureView; save(); }} data-testid="pro-view-export-view">
        {#each VIEWS as v (v.id)}<option value={v.id}>{t(v.key)}</option>{/each}
      </select>
    </label>
    <label class="xs-check"><input type="checkbox" bind:checked={options.loads} onchange={save} />{t('viewExport.optLoadsLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={options.numbering} onchange={save} />{t('viewExport.optNumberingLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={options.values} onchange={save} />{t('viewExport.optValuesLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={options.titles} onchange={save} />{t('viewExport.optTitlesLong')}</label>
    {#if shells}
      <label class="xs-check"><input type="checkbox" checked={options.shells !== false} onchange={(e) => { options.shells = e.currentTarget.checked; save(); }} data-testid="pro-view-export-shells" />{t('proExport.optShellsLong')}</label>
    {/if}
  </ExportSection>

  <ExportSection title={t('viewExport.sectionOutput')} summary={outputSummary}>
    <div class="xs-field">
      <span>{t('viewExport.style')}</span>
      <div class="xs-seg">
        {#each STYLES as s (s.id)}
          <button type="button" class:on={options.style === s.id} onclick={() => { options.style = s.id; save(); }}>{t(s.key)}</button>
        {/each}
      </div>
    </div>
  </ExportSection>

  {#snippet actions()}
    <button type="button" onclick={() => (open = false)}>{t('calcReport.cancel')}</button>
    <button type="button" onclick={() => run('copy')} disabled={busy || chosen.length === 0} data-testid="pro-view-export-copy">{t('viewExport.copy')}</button>
    <button type="button" class="primary" onclick={() => run('download')} disabled={busy || chosen.length === 0} data-testid="pro-view-export-download">{t('viewExport.download')}</button>
  {/snippet}
</ExportDialog>

<style>
  .vx-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; align-items: start; }
  @media (max-width: 520px) { .vx-cols { grid-template-columns: 1fr; } }
  .vx-select { margin-top: 2px; padding: 3px 6px; background: var(--st-surface-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); color: var(--st-text); font: inherit; font-size: 0.76rem; }
  .xs-seg { justify-self: start; align-self: flex-start; }
</style>
