<script lang="ts">
  /**
   * "Exportar vista": which figures, how they are drawn and how they come out, then a file or the
   * clipboard. The figures are drawn from the model (`lib/export/view-figure.ts`), not taken
   * from the screen, so they come out the same whatever the view is zoomed to or selecting.
   */
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store';
  import ExportDialog from './ExportDialog.svelte';
  import ExportSection from './ExportSection.svelte';
  import DrawingPresets, { type Preset } from './DrawingPresets.svelte';
  import DrawingLayout from './DrawingLayout.svelte';
  import { DEFAULT_FIGURE_OPTIONS, FIGURE_CONTENTS, NEEDS_RESULTS, type FigureContent, type FigureOptions } from '../../lib/export/view-figure';
  import { copyView, exportView, type ViewFormat } from '../../lib/export/view-export';
  import type { InkStyle } from '../../lib/export/paper-ink';

  let { open = $bindable(false), format = $bindable('svg') }: { open: boolean; format: ViewFormat } = $props();
  const FORMATS: ViewFormat[] = ['svg', 'png', 'jpg'];

  const KEY = 'stabileo-view-export';
  interface Prefs { contents: FigureContent[]; options: FigureOptions; sheet: boolean }
  function load(): Prefs {
    const base: Prefs = { contents: ['model'], options: { ...DEFAULT_FIGURE_OPTIONS }, sheet: true };
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const p = JSON.parse(raw) as Partial<Prefs>;
      return {
        contents: (p.contents ?? base.contents).filter((c) => FIGURE_CONTENTS.includes(c)),
        options: { ...base.options, ...(p.options ?? {}) },
        sheet: p.sheet ?? base.sheet,
      };
    } catch { return base; }
  }
  const prefs = load();
  let contents = $state<FigureContent[]>(prefs.contents);
  let options = $state<FigureOptions>(prefs.options);
  let sheet = $state(prefs.sheet);
  let busy = $state(false);

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ contents, options, sheet })); } catch { /* the choices last this session */ }
  }

  const LABEL: Record<FigureContent, string> = {
    model: 'figures.model', reactions: 'figures.reactions', despiece: 'figures.despiece',
    moment: 'figures.moment', shear: 'figures.shear', axial: 'figures.axial', deformed: 'figures.deformed',
    shellMap: 'figures.shellMap',
  };
  const DCL: Array<{ id: 'members' | 'nodes' | 'all'; key: string }> = [
    { id: 'members', key: 'viewExport.dclMembers' },
    { id: 'nodes', key: 'viewExport.dclNodes' },
    { id: 'all', key: 'viewExport.dclAll' },
  ];
  const STYLES: Array<{ id: InkStyle; key: string }> = [
    { id: 'color', key: 'viewExport.styleColor' },
    { id: 'bw', key: 'viewExport.styleBw' },
    { id: 'screen', key: 'viewExport.styleScreen' },
  ];

  const PRESETS: Preset[] = [
    { id: 'model', label: t('viewExport.presetModel'), ids: ['model'] },
    { id: 'diagrams', label: t('viewExport.presetDiagrams'), ids: ['model', 'moment', 'shear', 'axial'] },
    { id: 'all', label: t('viewExport.presetAll'), ids: FIGURE_CONTENTS },
  ];
  function preset(ids: readonly string[]) {
    contents = FIGURE_CONTENTS.filter((c) => ids.includes(c));
    save();
  }

  function toggle(c: FigureContent) {
    contents = contents.includes(c) ? contents.filter((x) => x !== c) : FIGURE_CONTENTS.filter((x) => x === c || contents.includes(x));
    save();
  }

  const contentSummary = $derived(contents.length
    ? [contents.map((c) => t(LABEL[c])).join(', '), contents.length > 1 ? t(sheet ? 'viewExport.layoutSheet' : 'viewExport.layoutSeparate') : null].filter(Boolean).join(' · ')
    : t('viewExport.nothing'));
  const drawingSummary = $derived([
    options.loads ? t('viewExport.optLoads') : null,
    options.numbering ? t('viewExport.optNumbering') : null,
    options.lengths ? t('viewExport.optLengths') : null,
    options.values ? t('viewExport.optValues') : null,
    options.titles ? t('viewExport.optTitles') : null,
  ].filter(Boolean).join(' · ') || '—');
  const outputSummary = $derived(t(STYLES.find((s) => s.id === options.style)!.key));

  const needsSolve = $derived(contents.some((c) => NEEDS_RESULTS.has(c)));

  async function run(kind: 'download' | 'copy') {
    if (busy || contents.length === 0) return;
    busy = true;
    const req = { format, contents: [...contents], options: { ...options }, sheet };
    try {
      if (kind === 'copy') {
        if (await copyView(req)) { uiStore.toast(t('viewExport.copied'), 'success'); open = false; }
      } else if (await exportView(req)) open = false;
    } finally {
      busy = false;
    }
  }
</script>

<ExportDialog bind:open title={`${t('export.drawingsTitle')} — ${format.toUpperCase()}`} testid="view-export-dialog">
  <ExportSection title={t('export.formats')} summary={format.toUpperCase()} open testid="view-export-format">
    <div class="xs-seg vx-formats">
      {#each FORMATS as f (f)}<button type="button" class:on={format === f} aria-pressed={format === f} onclick={() => (format = f)} data-testid={`view-export-format-${f}`}>{f.toUpperCase()}</button>{/each}
    </div>
    <p class="xs-note">{t(`proExport.drawingFormatNote.${format}`)}</p>
  </ExportSection>
  <ExportSection title={t('viewExport.sectionContent')} summary={contentSummary} open testid="view-export-content">
    <DrawingPresets presets={PRESETS} chosen={contents} onpick={preset} testid="view-export" />
    <div class="xs-grid">
      {#each FIGURE_CONTENTS as c (c)}
        <label class="xs-check"><input type="checkbox" checked={contents.includes(c)} onchange={() => toggle(c)} data-testid={`view-export-${c}`} />{t(LABEL[c])}</label>
      {/each}
    </div>
    {#if needsSolve}<p class="xs-note">{t('viewExport.needsSolve')}</p>{/if}
    {#if contents.includes('despiece')}<p class="xs-note">{t('viewExport.despieceNote')}</p>{/if}
    {#if contents.length > 1}
      <DrawingLayout together={sheet} labels={[t('viewExport.layoutSheet'), t('viewExport.layoutSeparate')]}
        notes={[t('viewExport.layoutSheetNote'), t('viewExport.layoutSeparateNote')]}
        onpick={(v) => { sheet = v; save(); }} testid="view-export-layout" />
    {/if}
  </ExportSection>

  <ExportSection title={t('viewExport.sectionDrawing')} summary={drawingSummary}>
    <label class="xs-check"><input type="checkbox" bind:checked={options.loads} onchange={save} />{t('viewExport.optLoadsLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={options.numbering} onchange={save} />{t('viewExport.optNumberingLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={options.lengths} onchange={save} data-testid="view-opt-lengths" />{t('viewExport.optLengthsLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={options.values} onchange={save} />{t('viewExport.optValuesLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={options.titles} onchange={save} />{t('viewExport.optTitlesLong')}</label>
    {#if contents.includes('despiece')}
      <div class="xs-field">
        <span>{t('viewExport.dcl')}</span>
        <div class="xs-seg">
          {#each DCL as o (o.id)}
            <button type="button" class:on={(options.dcl ?? 'members') === o.id} onclick={() => { options.dcl = o.id; save(); }} data-testid={`view-export-dcl-${o.id}`}>{t(o.key)}</button>
          {/each}
        </div>
      </div>
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
    <button type="button" onclick={() => run('copy')} disabled={busy || contents.length === 0} data-testid="view-export-copy">{t('viewExport.copy')}</button>
    <button type="button" class="primary" onclick={() => run('download')} disabled={busy || contents.length === 0} data-testid="view-export-download">{t('viewExport.download')}</button>
  {/snippet}
</ExportDialog>

<style>
  .vx-formats { align-self: flex-start; }
</style>
