<script lang="ts">
  import { modelStore, resultsStore, uiStore, verificationStore } from '../lib/store';
  import {
    openCalcReport, generateCalcReportHtml, DEFAULT_REPORT_CONTENT, RESULT_ROWS,
    type CalcReportData, type CalcReportConfig, type ResultProvenance, type AnalysisModeLabel, type CalcReportContent, type ResultRow,
  } from '../lib/engine/calc-report';
  import ExportDialog from './export/ExportDialog.svelte';
  import ExportSection from './export/ExportSection.svelte';
  import { ensureResults } from '../lib/actions/solve';
  import { tellIfEmpty } from '../lib/export/empty-model';
  import { kinematicReportOfModel } from '../lib/engine/kinematic-model';
  import { reportFigures } from '../lib/export/report-figures';
  import { DEFAULT_FIGURE_OPTIONS, type FigureOptions } from '../lib/export/view-figure';
  import type { InkStyle } from '../lib/export/paper-ink';
  import { loadComponentsText, distributedText, pointOnElementText, thermalText } from '../lib/engine/calc-report-loads';
  import { t, tp, i18n } from '../lib/i18n';
  import { shouldProjectModelToXZ } from '../lib/geometry/coordinate-system';
  import { captureProvenanceToken, provenanceForExport, provenanceLabels, ensureEngineHashes } from '../lib/store/result-provenance';
  import { reportProvenanceLines } from '../lib/export/provenance-attach';
  import type { ReportFormat } from '../lib/export/report-formats';

  const FORMATS: ReportFormat[] = ['pdf', 'docx', 'html'];
  let format = $state<ReportFormat>('pdf');

  let { open = $bindable(false) }: { open: boolean } = $props();

  let projectName = $state(modelStore.model.name || t('calcReport.defaultProject'));
  let engineerName = $state('');
  let companyName = $state('');
  let notes = $state('');

  /*
   * What goes in, and how the figures look: remembered between sessions, per browser. The
   * project's own data (name, author) is not: it belongs to the model.
   */
  const KEY = 'stabileo-calc-report';
  interface Prefs { content: CalcReportContent; figures: Pick<FigureOptions, 'style' | 'values' | 'lengths'> }
  function loadPrefs(): Prefs {
    const base: Prefs = { content: structuredClone(DEFAULT_REPORT_CONTENT), figures: { style: 'color', values: true, lengths: false } };
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const p = JSON.parse(raw) as Partial<Prefs>;
      const c = p.content ?? base.content;
      return {
        content: { ...base.content, ...c, rows: { ...base.content.rows, ...(c.rows ?? {}) } },
        figures: { ...base.figures, ...(p.figures ?? {}) },
      };
    } catch { return base; }
  }
  const prefs = loadPrefs();
  let content = $state<CalcReportContent>(prefs.content);
  let figStyle = $state<InkStyle>(prefs.figures.style);
  let figValues = $state(prefs.figures.values);
  let figLengths = $state(prefs.figures.lengths);
  let busy = $state(false);
  function savePrefs() {
    try { localStorage.setItem(KEY, JSON.stringify({ content: $state.snapshot(content), figures: { style: figStyle, values: figValues, lengths: figLengths } })); } catch { /* this session only */ }
  }

  const ROW_LABEL: Record<ResultRow, string> = {
    reactions: 'calcReport.rowReactions', displacements: 'calcReport.rowDisplacements',
    moment: 'figures.moment', shear: 'figures.shear', axial: 'figures.axial',
  };
  const projectSummary = $derived([projectName, engineerName, companyName].map((s) => s.trim()).filter(Boolean).join(' · ') || '—');
  const contentSummary = $derived.by(() => {
    const parts: string[] = [];
    if (content.modelData) parts.push(t('calcReport.partModel'));
    if (content.loads) parts.push(t('calcReport.partLoads'));
    if (content.kinematics) parts.push(t('calcReport.partKinematics'));
    if (content.despiece) parts.push(t('calcReport.partDespiece'));
    const tables = RESULT_ROWS.filter((r) => content.rows[r].table).length;
    const diagrams = RESULT_ROWS.filter((r) => content.rows[r].diagram).length;
    if (tables) parts.push(tp('calcReport.nTables', { n: tables }));
    if (diagrams) parts.push(tp('calcReport.nDiagrams', { n: diagrams }));
    return parts.join(' · ') || '—';
  });
  const figureSummary = $derived([
    t(figStyle === 'bw' ? 'viewExport.styleBw' : figStyle === 'screen' ? 'viewExport.styleScreen' : 'viewExport.styleColor'),
    figValues ? t('viewExport.optValues') : null,
    figLengths ? t('viewExport.optLengths') : null,
  ].filter(Boolean).join(' · '));

  // The dialog component stays mounted for the app's lifetime, so the $state
  // initializer above only sees the startup model. Re-seed the project name
  // from the current model each time the dialog opens (it remains editable).
  $effect(() => {
    if (open) projectName = modelStore.model.name || t('calcReport.defaultProject');
  });

  const is3D = $derived(uiStore.is3DWorkspace);
  const modeLabel = $derived<AnalysisModeLabel>(uiStore.analysisMode === 'pro' ? 'PRO' : uiStore.is3DWorkspace ? '3D' : '2D');

  function deriveProvenance(): ResultProvenance {
    const view = resultsStore.activeView;
    if (view === 'envelope') {
      return { kind: 'envelope' };
    }
    if (view === 'combo') {
      const comboId = resultsStore.activeComboId;
      const combo = comboId !== null
        ? modelStore.model.combinations.find(c => c.id === comboId)
        : undefined;
      return { kind: 'combo', comboName: combo?.name ?? `${t('results.comboFallback')} ${comboId}` };
    }
    const caseId = resultsStore.activeCaseId;
    const caseName = caseId !== null ? modelStore.getLoadCaseName(caseId) : undefined;
    return { kind: 'single', caseName: caseName || undefined };
  }

  async function generateReport() {
    if (busy) return;
    // The tab is opened now, inside the click: one opened after the solve and the figures is
    // one the pop-up blocker refuses.
    const win = format === 'pdf' ? window.open('', '_blank') : null;
    busy = true;
    try {
      // Solved first when there are no results; a failure still gives the report, saying why.
      const solved = await ensureResults();
      // What the report is taken from, checked again before its provenance is written.
      const token = captureProvenanceToken();
      // Started now, so the engine hashes are computed while the figures are drawn.
      void ensureEngineHashes();
      const figureOptions: FigureOptions = { ...DEFAULT_FIGURE_OPTIONS, style: figStyle, values: figValues, lengths: figLengths, loads: false };
      const figures = await reportFigures(content, solved.ok, figureOptions);
      const data = reportData();
      data.content = $state.snapshot(content);
      data.figures = figures;
      data.kinematics = content.kinematics ? kinematicReportOfModel() : undefined;
      if (!solved.ok) data.solveError = solved.error;
      // After the solve: the record names the results the report prints.
      // Throws ExportChangedError (said below, nothing opened) if the project moved meanwhile.
      data.resultProvenance = { record: await provenanceForExport(token), labels: provenanceLabels() };
      tellIfEmpty();
      if (format !== 'pdf') {
        const { downloadReport } = await import('../lib/export/report-download');
        const stem = (data.config.projectName || 'stabileo').replace(/[^\w.-]+/g, '-');
        await downloadReport(format, { title: data.config.projectName || t('calcReport.title'), html: generateCalcReportHtml(data), stem, ...(data.resultProvenance ? { provenance: reportProvenanceLines(data.resultProvenance.record) } : {}) });
        open = false;
      // No tab to be had: the report came as a file, which is said, and the dialog stays.
      } else if (openCalcReport(data, win) === 'tab') open = false;
      else uiStore.toast(t('calcReport.popupBlocked'), 'info');
    } catch (e) {
      win?.close();
      uiStore.toast(String((e as Error)?.message ?? e), 'error');
    } finally {
      busy = false;
    }
  }

  function reportData(): CalcReportData {
    const config: CalcReportConfig = {
      projectName,
      engineerName,
      companyName,
      date: new Date().toLocaleDateString(i18n.locale, { year: 'numeric', month: 'long', day: 'numeric' }),
      notes,
    };

    // Extract load descriptions from model
    const loadWords = { global: t('report.loadGlobal') };
    // The report is written in the units chosen in Settings; the model stays in SI.
    const us = uiStore.unitSystem;
    const loads = modelStore.loads.map((l) => {
      const d = l.data as any;
      let description = '';
      // Basic with load cases off names no case.
      let caseLabel = uiStore.showLoadCasePicker ? modelStore.getLoadCaseName(d.caseId ?? 1) || undefined : undefined;
      // Every non-zero component, named by its axis, to four significant figures
      // (`calc-report-loads.ts`, which reads each load type by the store's own field names).
      if (l.type === 'nodal' || l.type === 'nodal3d') {
        description = `${t('table.nodeLabel')} ${d.nodeId}: ${loadComponentsText(l.type, d, us) || t('calcReport.loadZero')}`;
      } else if (l.type === 'distributed') {
        description = `${t('table.elemLabel')} ${d.elementId}: ${distributedText(d, loadWords, us)}`;
      } else if (l.type === 'distributed3d') {
        description = `${t('table.elemLabel')} ${d.elementId}: ${loadComponentsText(l.type, d, us) || t('calcReport.loadZero')}`;
      } else if (l.type === 'pointOnElement') {
        description = `${t('table.elemLabel')} ${d.elementId}: ${pointOnElementText(d, loadWords, us) || t('calcReport.loadZero')}`;
      } else if (l.type === 'thermal') {
        description = `${t('table.elemLabel')} ${d.elementId}: ${thermalText(d, us, uiStore.analysisMode === 'pro' ? 'pro' : 'basic')}`;
      } else {
        description = tp('calcReport.loadOn', { type: l.type, target: d.elementId ?? d.nodeId ?? '?' });
      }
      return { type: l.type, description, caseLabel };
    });

    // Build combination info
    const combinations = (uiStore.showLoadCasePicker ? modelStore.model.combinations : []).map(c => ({
      id: c.id,
      name: c.name,
      factors: c.factors.map(f => ({
        caseName: modelStore.getLoadCaseName(f.caseId) || `${t('results.caseFallback')} ${f.caseId}`,
        factor: f.factor,
      })),
    }));

    const data: CalcReportData = {
      config,
      is3D,
      // The figure stands a flat model up the way the 3D view does (vertical in y, not z).
      project2DToXZ: is3D && shouldProjectModelToXZ({
        analysisMode: uiStore.analysisMode,
        viewportPresentation3D: uiStore.viewportPresentation3D,
        nodes: modelStore.nodes.values(),
        supports: modelStore.supports.values(),
        loads: modelStore.loads,
        plateCount: modelStore.plates.size,
        quadCount: modelStore.quads.size,
      }),
      analysisMode: modeLabel,
      provenance: deriveProvenance(),
      unitSystem: us,
      // The design's checks go into the report only while design is on in PRO's settings.
      hasDesignChecks: uiStore.designInPro && verificationStore.hasResults,
      nodes: [...modelStore.nodes.values()],
      elements: [...modelStore.elements.values()],
      materials: [...modelStore.materials.values()],
      sections: [...modelStore.sections.values()],
      supports: [...modelStore.supports.values()],
      loads,
      loadCases: modelStore.model.loadCases ?? [],
      combinations,
      results2D: !is3D ? (resultsStore.results ?? undefined) : undefined,
      results3D: is3D ? (resultsStore.results3D ?? undefined) : undefined,
      // The envelope on screen: the force tables read its diagrams along each member.
      envelope2D: !is3D && resultsStore.activeView === 'envelope' ? (resultsStore.fullEnvelope ?? undefined) : undefined,
      envelope3D: is3D && resultsStore.activeView === 'envelope' ? (resultsStore.fullEnvelope3D ?? undefined) : undefined,
    };
    return data;
  }

  function setRow(r: ResultRow, part: 'table' | 'diagram', v: boolean) {
    content.rows[r][part] = v;
    savePrefs();
  }
</script>

<ExportDialog bind:open title={t('calcReport.title')} testid="calc-report-dialog">
  <ExportSection title={t('export.formats')} summary={t(`proReport.format.${format}`)} open testid="calc-report-format">
    <div class="xs-seg">
      {#each FORMATS as f (f)}<button type="button" class:on={format === f} aria-pressed={format === f} onclick={() => (format = f)} data-testid={`calc-report-format-${f}`}>{t(`proReport.format.${f}`)}</button>{/each}
    </div>
    <p class="xs-note">{t(`proReport.formatNote.${format}`)}</p>
  </ExportSection>
  <ExportSection title={t('calcReport.sectionProject')} summary={projectSummary}>
    <label class="xs-field"><span>{t('calcReport.projectName')}</span><input type="text" bind:value={projectName} /></label>
    <label class="xs-field"><span>{t('calcReport.engineerName')}</span><input type="text" bind:value={engineerName} placeholder={t('calcReport.optional')} /></label>
    <label class="xs-field"><span>{t('calcReport.companyName')}</span><input type="text" bind:value={companyName} placeholder={t('calcReport.optional')} /></label>
    <label class="xs-field"><span>{t('calcReport.notes')}</span><textarea bind:value={notes} rows="2" placeholder={t('calcReport.optional')}></textarea></label>
  </ExportSection>

  <ExportSection title={t('calcReport.sectionContent')} summary={contentSummary} testid="calc-report-content">
    <label class="xs-check"><input type="checkbox" bind:checked={content.modelData} onchange={savePrefs} />{t('calcReport.partModelLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={content.loads} onchange={savePrefs} />{t('calcReport.partLoadsLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={content.kinematics} onchange={savePrefs} data-testid="calc-report-kinematics" />{t('calcReport.partKinematicsLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={content.despiece} onchange={savePrefs} data-testid="calc-report-despiece" />{t('calcReport.partDespieceLong')}</label>
    <table class="cr-rows">
      <thead><tr><th></th><th>{t('calcReport.colTable')}</th><th>{t('calcReport.colDiagram')}</th></tr></thead>
      <tbody>
        {#each RESULT_ROWS as r (r)}
          <tr>
            <td>{t(ROW_LABEL[r])}</td>
            <td><input type="checkbox" checked={content.rows[r].table} onchange={(e) => setRow(r, 'table', e.currentTarget.checked)} aria-label={`${t(ROW_LABEL[r])} — ${t('calcReport.colTable')}`} data-testid={`calc-report-${r}-table`} /></td>
            <td><input type="checkbox" checked={content.rows[r].diagram} onchange={(e) => setRow(r, 'diagram', e.currentTarget.checked)} aria-label={`${t(ROW_LABEL[r])} — ${t('calcReport.colDiagram')}`} data-testid={`calc-report-${r}-diagram`} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="xs-note">{t('calcReport.autoSolveNote')}</p>
  </ExportSection>

  <ExportSection title={t('calcReport.sectionFigures')} summary={figureSummary} testid="calc-report-figures">
      <div class="xs-field">
        <span>{t('viewExport.style')}</span>
        <div class="xs-seg">
          <button type="button" class:on={figStyle === 'color'} onclick={() => { figStyle = 'color'; savePrefs(); }}>{t('viewExport.styleColor')}</button>
          <button type="button" class:on={figStyle === 'bw'} onclick={() => { figStyle = 'bw'; savePrefs(); }}>{t('viewExport.styleBw')}</button>
        </div>
      </div>
    <label class="xs-check"><input type="checkbox" bind:checked={figValues} onchange={savePrefs} />{t('viewExport.optValuesLong')}</label>
    <label class="xs-check"><input type="checkbox" bind:checked={figLengths} onchange={savePrefs} data-testid="calc-report-lengths" />{t('viewExport.optLengthsLong')}</label>
  </ExportSection>

  {#snippet actions()}
    <button type="button" onclick={() => (open = false)}>{t('calcReport.cancel')}</button>
    <button type="button" class="primary" onclick={generateReport} disabled={busy} data-testid="calc-report-generate">{busy ? t('calcReport.generating') : tp('proReport.generate', { format: t(`proReport.format.${format}`) })}</button>
  {/snippet}
</ExportDialog>

<style>
  .cr-rows { border-collapse: collapse; margin: 4px 0 2px; font-size: 0.8rem; }
  .cr-rows th { font-weight: 500; color: var(--st-text-3); font-size: 0.72rem; padding: 2px 10px; text-align: center; }
  .cr-rows td { padding: 2px 10px; color: var(--st-text-2); }
  .cr-rows td:not(:first-child) { text-align: center; }
  .cr-rows td:first-child { padding-left: 0; }
  .cr-rows input { accent-color: var(--st-accent); }
</style>
