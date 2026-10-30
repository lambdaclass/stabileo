<script lang="ts">
  /**
   * The calculation report, as PDF, Word or HTML (the results as data are the Results export): who
   * it is from, what it carries and how its figures look.
   *
   * The same frame and folded sections as Basic's report (`components/export/`): each section
   * closed, its title saying in one line what is chosen inside. Each result is printed as its
   * table, its figures or both; the figures are drawn from the model (`pro/report-export.ts`),
   * and figures added from the view still go at the end.
   */
  import { proNav } from '../../lib/store/pro-nav.svelte';
  import { modelStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import ExportDialog from '../export/ExportDialog.svelte';
  import ExportSection from '../export/ExportSection.svelte';
  import type { ReportConfig, ReportPart, ReportResult, ResultMode } from '../../lib/engine/pro-report';
  import type { ReportFigureChoices } from '../../lib/pro/report-export';
  import type { FigureView } from '../../lib/export/view-figure';
  import type { InkStyle } from '../../lib/export/paper-ink';
  import { SHELL_CONTOUR_COMPONENTS, shellComponentLabelKey } from '../../lib/engine/shell-stress';
  import { reportStoryDrifts } from '../../lib/engine/pro-report-inputs';
  import { reportFigures } from '../../lib/store/report-figures.svelte';
  import { captureFigure } from '../../lib/export/figure';
  import CheckGroup from './export/CheckGroup.svelte';
  import type { ReportFormat } from '../../lib/export/report-formats';

  interface Props {
    open: boolean;
    hasResults: boolean;
    hasAdvanced: boolean;
    /** WHICH advanced analyses actually ran — the keys of their results. */
    advancedRan: string[];
    hasDiagnostics: boolean;
    hasQuantities: boolean;
    ongenerate: (config: ReportConfig, figures: ReportFigureChoices, format?: ReportFormat) => void;
  }

  let { open = $bindable(false), hasResults, hasAdvanced, advancedRan, hasDiagnostics, hasQuantities, ongenerate }: Props = $props();

  // ─── Remembered between sessions (localStorage) ─────────────
  // Migrate old storage key
  if (localStorage.getItem('dedaliano-report-config') !== null && localStorage.getItem('stabileo-report-config') === null) {
    localStorage.setItem('stabileo-report-config', localStorage.getItem('dedaliano-report-config')!);
    localStorage.removeItem('dedaliano-report-config');
  }
  const STORAGE_KEY = 'stabileo-report-config';
  type Sections = Omit<ReportConfig['sections'], 'parts'>;
  interface Saved {
    companyName?: string; companyLogo?: string | null;
    sections?: Partial<Sections>; parts?: Partial<Record<ReportPart, boolean>>;
    modes?: Partial<Record<ReportResult, ResultMode>>; figures?: Partial<ReportFigureChoices>;
  }
  function loadSaved(): Saved {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  const saved = loadSaved();

  let companyName = $state(saved.companyName ?? '');
  let companyLogo = $state<string | null>(saved.companyLogo ?? null);
  let sec = $state<Sections>({
    modelData: true, results: true, advancedAnalysis: true, storyDrift: true,
    diagnostics: true, quantities: true, loads: true, envelope: true, statics: true, deflections: true, figures: true,
    ...(saved.sections ?? {}),
    // Never offered here: a code check is a design output, reported by the memoria (Documents).
  });
  // The CIRSOC 103 drift check runs when the seismic settings and a solved seismic case exist.
  const hasDrift = $derived(open && (reportStoryDrifts().drifts?.length ?? 0) > 0);
  let parts = $state<Record<ReportPart, boolean>>({
    nodes: true, materials: true, sections: true, members: true, supports: true, shells: true, combinations: true, ...(saved.parts ?? {}),
  });
  let modes = $state<Record<ReportResult, ResultMode>>({ reactions: 'both', displacements: 'both', forces: 'both', shells: 'both', ...(saved.modes ?? {}) });
  let figs = $state<ReportFigureChoices>({ style: 'color', values: true, view: 'screen', shellComponent: 'vonMises', ...(saved.figures ?? {}) });
  /** Which advanced analyses to print, of the ones that ran. */
  let advancedPicked = $state<Record<string, boolean>>({});

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        companyName, companyLogo, sections: $state.snapshot(sec), parts: $state.snapshot(parts),
        modes: $state.snapshot(modes), figures: $state.snapshot(figs),
      }));
    } catch { /* this session only */ }
  }

  /*
   * A letterhead nobody filled in is not a letterhead: `hasProjectInfo` decides whether the
   * report prints one at all, so leaving it blank is a decision the document honours.
   */
  const hasProjectInfo = $derived(!!(companyName.trim() || companyLogo));
  let logoError = $state<string | null>(null);
  function handleLogoUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    logoError = null;
    if (file.size > 500_000) { logoError = t('report.logoTooLarge'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { companyLogo = reader.result as string; persist(); };
    reader.readAsDataURL(file);
  }

  let figureError = $state(false);
  function addFigure() {
    const f = captureFigure();
    figureError = !f;
    if (f) reportFigures.add(f);
  }

  const shells = $derived(open && modelStore.plates.size + modelStore.quads.size > 0);
  /** The model's tables, and the loads' detail, which belongs with them. */
  const PARTS: Array<{ id: ReportPart | 'loads'; key: string }> = [
    { id: 'nodes', key: 'proExport.sheet.Nodes' }, { id: 'members', key: 'proExport.sheet.Members' },
    { id: 'shells', key: 'proExport.sheet.Shells' }, { id: 'supports', key: 'proExport.sheet.Supports' },
    { id: 'materials', key: 'proExport.sheet.Materials' }, { id: 'sections', key: 'proExport.sheet.Sections' },
    { id: 'loads', key: 'proReport.loads' }, { id: 'combinations', key: 'proExport.sheet.Combinations' },
  ];
  const partsShown = $derived(PARTS.filter((p) => p.id !== 'shells' || shells));
  const partOn = (id: string) => (id === 'loads' ? sec.loads : parts[id as ReportPart]);
  function setPart(id: string, v: boolean) { if (id === 'loads') sec.loads = v; else parts[id as ReportPart] = v; persist(); }
  const RESULTS: Array<{ id: ReportResult; key: string }> = [
    { id: 'reactions', key: 'proExport.sheet.Reactions' },
    { id: 'displacements', key: 'proExport.sheet.Displacements' },
    { id: 'forces', key: 'proReport.rowForces' },
    { id: 'shells', key: 'proReport.rowShells' },
  ];
  const resultsShown = $derived(RESULTS.filter((r) => r.id !== 'shells' || shells));
  const MODES: Array<{ id: ResultMode; key: string }> = [
    { id: 'table', key: 'proReport.modeTable' }, { id: 'figure', key: 'proReport.modeFigure' }, { id: 'both', key: 'proReport.modeBoth' },
  ];
  const SUMMARIES = [
    { id: 'envelope', key: 'report.env.title' }, { id: 'statics', key: 'proExport.sheet.Statics' }, { id: 'deflections', key: 'defl.title' },
  ] as const;
  type SecKey = 'envelope' | 'statics' | 'deflections' | 'quantities' | 'diagnostics' | 'storyDrift';
  const otherItems = $derived([
    { id: 'storyDrift', label: t('report.secDrift'), disabled: !hasDrift, hint: hasDrift ? undefined : t('report.noData') },
    { id: 'quantities', label: t('report.secQuantities'), disabled: !hasQuantities },
    { id: 'diagnostics', label: t('report.secDiagnostics'), disabled: !hasDiagnostics, hint: hasDiagnostics ? undefined : t('proReport.noneFound') },
  ]);
  const advItems = $derived(advancedRan.length
    ? advancedRan.map((key) => ({ id: key, label: t(`pro.adv.${key}`) === `pro.adv.${key}` ? key : t(`pro.adv.${key}`) }))
    : [{ id: '-', label: t('proReport.noAdvanced'), disabled: true }]);
  const VIEWS: Array<{ id: FigureView; key: string }> = [
    { id: 'screen', key: 'proExport.viewScreen' }, { id: 'top', key: 'proExport.viewTop' },
    { id: 'front', key: 'proExport.viewFront' }, { id: 'side', key: 'proExport.viewSide' }, { id: 'iso', key: 'proExport.viewIso' },
  ];
  const STYLES: Array<{ id: InkStyle; key: string }> = [
    { id: 'color', key: 'viewExport.styleColor' }, { id: 'bw', key: 'viewExport.styleBw' },
  ];

  const projectSummary = $derived(hasProjectInfo ? [companyName.trim(), companyLogo ? t('report.companyLogo') : ''].filter(Boolean).join(' · ') : t('report.projectInfoEmpty'));
  const contentSummary = $derived.by(() => {
    const out: string[] = [];
    if (partsShown.some((p) => partOn(p.id))) out.push(t('proReport.partModel'));
    if (sec.loads) out.push(t('proReport.partLoads'));
    if (sec.results && hasResults) out.push(t('proReport.partResults'));
    if (sec.advancedAnalysis && hasAdvanced) out.push(t('proReport.partAdvanced'));
    if (sec.quantities && hasQuantities) out.push(t('proReport.partQuantities'));
    if (sec.diagnostics && hasDiagnostics) out.push(t('proReport.partDiagnostics'));
    if (sec.storyDrift && hasDrift) out.push(t('report.secDrift'));
    return out.join(' · ') || '—';
  });
  const figuresSummary = $derived([
    t(STYLES.find((s) => s.id === figs.style)?.key ?? 'viewExport.styleColor'),
    t(VIEWS.find((v) => v.id === figs.view)!.key),
    figs.values ? t('viewExport.optValues') : null,
    reportFigures.list.length ? tp('proReport.addedN', { n: reportFigures.list.length }) : null,
  ].filter(Boolean).join(' · '));

  /** The PDF opens to print; Word and HTML download. HTML is the copy a provenance check can load. */
  const FORMATS: ReportFormat[] = ['pdf', 'docx', 'html'];
  let format = $state<ReportFormat>('pdf');
  function handleGenerate() {
    persist();
    ongenerate({
      companyName,
      companyLogo,
      figures: sec.figures ? reportFigures.list.map(({ dataUrl, caption }) => ({ dataUrl, caption })) : [],
      hasProjectInfo,
      advancedPicked: { ...advancedPicked },
      sections: {
        ...$state.snapshot(sec), parts: $state.snapshot(parts),
        // The model's section goes when any of its tables does; what has no data is not asked for.
        modelData: partsShown.some((p) => partOn(p.id)),
        advancedAnalysis: sec.advancedAnalysis && hasAdvanced,
        quantities: sec.quantities && hasQuantities,
        diagnostics: sec.diagnostics && hasDiagnostics,
        storyDrift: sec.storyDrift && hasDrift,
      },
      resultModes: $state.snapshot(modes),
    }, $state.snapshot(figs), format);
  }
</script>

<ExportDialog bind:open width={640} title={t('proReport.title')} testid="pro-report-dialog">
  <ExportSection title={t('proExport.format')} summary={t(`proReport.format.${format}`)} open testid="rpt-format">
    <div class="xs-seg">
      {#each FORMATS as f (f)}<button type="button" class:on={format === f} aria-pressed={format === f} onclick={() => (format = f)} data-testid={`rpt-format-${f}`}>{t(`proReport.format.${f}`)}</button>{/each}
    </div>
    <p class="xs-note">{t(`proReport.formatNote.${format}`)}</p>
  </ExportSection>
  <ExportSection title={t('proReport.letterhead')} summary={projectSummary} open={hasProjectInfo} testid="rpt-project">
    <div class="rpt-logo-row">
      <span>{t('report.companyLogo')}</span>
      {#if companyLogo}
        <img src={companyLogo} alt="Logo" class="rpt-logo-preview" />
        <button type="button" class="rpt-link" onclick={() => { companyLogo = null; persist(); }}>{t('report.removeLogo')}</button>
      {:else}
        <label class="rpt-file-btn">{t('report.chooseLogo')}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml" onchange={handleLogoUpload} class="rpt-file-input" data-testid="rpt-logo-file" />
        </label>
        {#if logoError}<span class="rpt-error" role="alert" data-testid="rpt-logo-error">{logoError}</span>{/if}
      {/if}
    </div>
    <label class="xs-field">
      <span>{t('report.companyName')}</span>
      <input type="text" bind:value={companyName} onchange={persist} placeholder={t('report.companyNamePh')} />
    </label>
    <p class="xs-note">{t('report.projectDataMoved')}
      <button type="button" class="rpt-link" onclick={() => { open = false; proNav.openProjectInfo(); }} data-testid="rpt-open-project-info">{t('report.openProjectInfo')}</button>
    </p>
  </ExportSection>

  <ExportSection title={t('viewExport.sectionContent')} summary={contentSummary} open testid="rpt-content">
    <div class="rpt-cols">
      <div class="rpt-col">
        <CheckGroup title={t('proReport.modelData')} items={partsShown.map((p) => ({ id: p.id, label: t(p.key) }))}
          on={partOn} toggle={(id) => setPart(id, !partOn(id))}
          setAll={(v) => { for (const p of partsShown) setPart(p.id, v); }} testid="rpt-part" />
        <CheckGroup title={t('proReport.summaries')} items={SUMMARIES.map((x) => ({ id: x.id, label: t(x.key), disabled: !hasResults }))}
          on={(id) => !!sec[id as SecKey]} toggle={(id) => { sec[id as SecKey] = !sec[id as SecKey]; persist(); }}
          setAll={(v) => { for (const x of SUMMARIES) sec[x.id] = v; persist(); }} testid="rpt" />
      </div>
      <div class="rpt-col">
        <div class="rpt-results" data-testid="rpt-results">
          <label class="rpt-results-head">
            <input type="checkbox" bind:checked={sec.results} onchange={persist} disabled={!hasResults} />
            <span>{t('proReport.results')}</span>
          </label>
          {#each resultsShown as r (r.id)}
            <label class="rpt-row" class:off={!sec.results || !hasResults}>
              <span>{t(r.key)}</span>
              <select bind:value={modes[r.id]} onchange={persist} disabled={!sec.results || !hasResults} data-testid={`rpt-mode-${r.id}`}>
                {#each MODES as m (m.id)}<option value={m.id}>{t(m.key)}</option>{/each}
              </select>
            </label>
            {#if r.id === 'shells' && sec.results && modes.shells !== 'table'}
              <label class="rpt-row rpt-row-sub">
                <span>{t('proReport.shellFigure')}</span>
                <select bind:value={figs.shellComponent} onchange={persist}>
                  {#each SHELL_CONTOUR_COMPONENTS as m (m.key)}<option value={m.key}>{t(shellComponentLabelKey(m.key))}</option>{/each}
                </select>
              </label>
            {/if}
          {/each}
        </div>
        <CheckGroup title={t('proReport.advanced')} items={advItems}
          on={(id) => sec.advancedAnalysis && (advancedPicked[id] ?? true)}
          toggle={(id) => { const v = !(sec.advancedAnalysis && (advancedPicked[id] ?? true)); advancedPicked = { ...advancedPicked, [id]: v }; if (v) sec.advancedAnalysis = true; }}
          setAll={(v) => { sec.advancedAnalysis = v; advancedPicked = Object.fromEntries(advancedRan.map((k) => [k, v])); persist(); }} testid="rpt-adv" />
        <CheckGroup title={t('proReport.others')} items={otherItems}
          on={(id) => !!sec[id as SecKey]} toggle={(id) => { sec[id as SecKey] = !sec[id as SecKey]; persist(); }}
          setAll={(v) => { sec.quantities = v; sec.diagnostics = v; persist(); }} testid="rpt" />
      </div>
    </div>
  </ExportSection>

  <ExportSection title={t('report.figures')} summary={figuresSummary} testid="rpt-figures">
    <div class="xs-field">
      <span>{t('viewExport.style')}</span>
      <div class="xs-seg">
        {#each STYLES as s (s.id)}
          <button type="button" class:on={figs.style === s.id} onclick={() => { figs.style = s.id; persist(); }}>{t(s.key)}</button>
        {/each}
      </div>
    </div>
    <label class="xs-field">
      <span>{t('proExport.view')}</span>
      <select bind:value={figs.view} onchange={persist} data-testid="rpt-view">
        {#each VIEWS as v (v.id)}<option value={v.id}>{t(v.key)}</option>{/each}
      </select>
    </label>
    <label class="xs-check"><input type="checkbox" bind:checked={figs.values} onchange={persist} />{t('viewExport.optValuesLong')}</label>
    <p class="xs-note">{t('proReport.figuresNote')}</p>

    <label class="xs-check"><input type="checkbox" bind:checked={sec.figures} onchange={persist} />{t('proReport.addedFigures')} ({reportFigures.list.length})</label>
    <div>
      <button type="button" class="rpt-small" onclick={addFigure} data-testid="rpt-add-figure">+ {t('report.addFigure')}</button>
      {#if figureError}<span class="xs-note">{t('report.figureFailed')}</span>{/if}
    </div>
    {#each reportFigures.list as f, i (f.id)}
      <div class="rpt-figure" data-testid="rpt-figure">
        <img src={f.dataUrl} alt={f.caption} />
        <input type="text" value={f.caption} onchange={(e) => reportFigures.caption(f.id, e.currentTarget.value)} aria-label={t('report.figureCaption')} />
        <button type="button" class="rpt-small" disabled={i === 0} onclick={() => reportFigures.move(f.id, -1)} aria-label="↑">↑</button>
        <button type="button" class="rpt-small" onclick={() => reportFigures.remove(f.id)} aria-label={t('report.removeFigure')}>×</button>
      </div>
    {/each}
    <p class="xs-note">{t('report.figuresHint')}</p>
  </ExportSection>

  {#snippet actions()}
    <button type="button" onclick={() => (open = false)}>{t('report.cancel')}</button>
    <button type="button" class="primary" onclick={handleGenerate} data-testid="rpt-pdf">{tp('proReport.generate', { format: t(`proReport.format.${format}`) })}</button>
  {/snippet}
</ExportDialog>

<style>
  .rpt-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; align-items: start; }
  .rpt-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  @media (max-width: 560px) { .rpt-cols { grid-template-columns: 1fr; } }
  .rpt-results { display: flex; flex-direction: column; gap: 4px; }
  .rpt-results-head { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
  .rpt-results-head input { accent-color: var(--st-accent); margin: 0; }
  .rpt-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-left: 20px; color: var(--st-text-2); font-size: 0.78rem; }
  .rpt-row.off { opacity: 0.5; }
  .rpt-row-sub { padding-left: 32px; color: var(--st-text-3); }
  .rpt-row select { flex: none; width: 9.5em; padding: 2px 4px; background: var(--st-surface-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); color: var(--st-text); font: inherit; }
  .xs-seg { justify-self: start; align-self: flex-start; }
  .rpt-logo-row { display: flex; align-items: center; gap: 8px; color: var(--st-text-2); }
  .rpt-logo-preview { max-height: 32px; max-width: 120px; border-radius: 4px; border: 1px solid var(--st-hair); }
  .rpt-file-btn { position: relative; display: inline-flex; padding: 3px 10px; font-size: 0.74rem; color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); cursor: pointer; }
  .rpt-file-btn:focus-within { outline: 2px solid var(--st-interactive); outline-offset: 1px; }
  .rpt-file-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .rpt-error { font-size: 0.72rem; color: var(--st-danger); }
  .rpt-link { padding: 0; background: none; border: none; color: var(--st-interactive); cursor: pointer; font: inherit; text-decoration: underline; }
  .rpt-small { padding: 2px 8px; font-size: 0.72rem; border-radius: var(--st-radius); border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2); cursor: pointer; }
  .rpt-small:disabled { opacity: 0.45; cursor: not-allowed; }
  .rpt-figure { display: flex; gap: 6px; align-items: center; }
  .rpt-figure img { width: 64px; height: auto; border: 1px solid var(--st-hair); }
  .rpt-figure input { flex: 1; min-width: 0; padding: 3px 6px; background: var(--st-surface-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); color: var(--st-text); font: inherit; }
</style>
