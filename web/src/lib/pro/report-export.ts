/**
 * Turning the report dialog's choices into a document.
 *
 * ── Why this is not in `ProPanel` ──────────────────────────────────
 *
 * It was, and the 600-line ceiling on that component is what said it should
 * not be. The panel is a layout shell: which tab is showing, how wide it is,
 * what the header says. Assembling a report — drawing its figures, gathering
 * advanced results — is a job, and a job in a layout shell is
 * how a layout shell stops being one.
 *
 * The report is the printable document only: the same data as a spreadsheet is
 * Project › Export › Excel, which chooses its own sheets.
 *
 * The figures are drawn from the model (`export/view-figure.ts`), the vector
 * figures "Exportar imagen" makes. The screen is captured only when they cannot
 * be drawn, and that capture is taken HERE rather than in `pro-report-inputs.ts`
 * because it is a reading of the DOM at the instant the button was pressed. A
 * tainted canvas throws on `toDataURL`; the report goes out without the picture
 * rather than not going out.
 */

import { captureProvenanceToken, provenanceForExport, provenanceLabels, ExportChangedError } from '../store/result-provenance';
import { reportProvenanceLines } from '../export/provenance-attach';
import { runEngineActionAsync } from '../store/engine-action';
import { tick } from 'svelte';
import { errorText } from '../utils/error-text';
import { exportMessages } from '../export/containment';
import { viewportCanvas } from '../utils/viewport-canvas';
import { uiStore } from '../store/ui.svelte';
import { viewState } from '../store/view-state.svelte';
import { buildProReportData } from '../engine/pro-report-inputs';
import { generateReportHtml, openReport } from '../engine/pro-report';
import type { ReportConfig, ReportData, ReportResult, ReportResultFigures } from '../engine/pro-report';
import type { ReportFigure } from '../engine/report/project-sections';
import { DEFAULT_FIGURE_OPTIONS, figureTitle, plan2D, toSvg, type FigureContent, type FigureOptions, type FigureView } from '../export/view-figure';
import type { InkStyle } from '../export/paper-ink';
import type { ShellContourComponent } from '../engine/shell-stress';
import { t as tr } from '../i18n';
import { modelStore, resultsStore } from '../store';

export interface ReportExportInputs {
  config: ReportConfig;
  advancedResults: Record<string, unknown>;
  t: (key: string) => string;
  /** How the figures are drawn; without it the report captures the screen for the model. */
  figureOptions?: ReportFigureChoices;
  /** The format: the PDF (the report opened to print, as before) or a file in another of the five. */
  format?: import('../export/report-formats').ReportFormat;
}

/** The canvas as it is on screen, or nothing if the browser refuses it. */
function screenshotOfCanvas(): string | undefined {
  // The viewport's canvas, not the first canvas in the document: a panel that draws one (a chart,
  // a section preview) would otherwise put its picture in the report as "the model".
  const canvas = viewportCanvas();
  if (!canvas) return undefined;
  try { return (canvas as HTMLCanvasElement).toDataURL('image/png'); } catch { return undefined; }
}

/** The next painted frame. */
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * The canvas with every node and member number on, whatever the reader shows: the report's tables
 * name nodes and members by number, and the picture is where a reader finds them. What the reader
 * had on is put back after the picture, also when it fails.
 */
async function screenshotWithNumbers(): Promise<string | undefined> {
  const had = { nodes: uiStore.showNodeLabels3D, members: uiStore.showElementLabels3D, label: viewState.memberLabel, onSelection: viewState.labelsOnSelection };
  const changes = !had.nodes || !had.members || had.label !== 'id' || had.onSelection;
  if (!changes) return screenshotOfCanvas();
  try {
    uiStore.showNodeLabels3D = true;
    uiStore.showElementLabels3D = true;
    viewState.memberLabel = 'id';
    viewState.labelsOnSelection = false;
    await tick();
    // The viewport redraws on the frame after it is invalidated; two leave room for the labels.
    await frame(); await frame(); await frame();
    return screenshotOfCanvas();
  } finally {
    uiStore.showNodeLabels3D = had.nodes;
    uiStore.showElementLabels3D = had.members;
    viewState.memberLabel = had.label;
    viewState.labelsOnSelection = had.onSelection;
  }
}

/**
 * The printable report. The design is not a section of it: what the desk designed and checked
 * goes in the memoria (`lib/report/memoria`), the one document that states it.
 */
export async function exportReportAs(input: ReportExportInputs): Promise<void> {
  // A refused display accessor is null; explain the refusal before report assembly
  // can mistake it for a project with no results.
  if (exportMessages() === null) return;
  // What the report is taken from, checked again before its provenance is written.
  const token = captureProvenanceToken();
  try { await runEngineActionAsync(() => exportReportWithEngine(input, token)); }
  catch (error) { uiStore.toast(errorText(error, 'Error'), 'error'); }
}

async function exportReportWithEngine(input: ReportExportInputs, token: ReturnType<typeof captureProvenanceToken>): Promise<void> {
  const figures = input.figureOptions ? reportResultFigures(input.config, input.figureOptions) : {};
  // The model's figure is drawn; a capture of the screen only when it cannot be.
  const capture = input.config.sections?.modelData !== false && !figures.model;
  const data = buildProReportData({
    config: input.config,
    advancedResults: Object.keys(input.advancedResults).length > 0
      ? input.advancedResults as ReportData['advancedResults']
      : undefined,
    screenshot: capture ? await screenshotWithNumbers() : undefined,
    t: input.t,
  });
  if (!data) return;
  data.resultFigures = figures;
  try {
    data.resultProvenance = { record: await provenanceForExport(token), labels: provenanceLabels() };
  } catch (e) {
    if (e instanceof ExportChangedError) { uiStore.toast(e.message, 'error'); return; }
    throw e;
  }
  if (!input.format || input.format === 'pdf') { openReport(data); return; }
  const { downloadReport } = await import('../export/report-download');
  await downloadReport(input.format, { title: data.projectName || input.t('proReport.title'), html: generateReportHtml(data), stem: `report-${(data.projectName || 'model').replace(/[^\w.-]+/g, '-')}`, ...(data.resultProvenance ? { provenance: reportProvenanceLines(data.resultProvenance.record) } : {}) });
}

/** How the report's figures are drawn: the dialog's choices. */
export interface ReportFigureChoices { style: InkStyle; values: boolean; view: FigureView; shellComponent: ShellContourComponent }

/** A figure as the report embeds it: an SVG in a data URL, with its caption. */
function asReportFigure(content: FigureContent, o: FigureOptions, caption: string): ReportFigure | undefined {
  const plan = plan2D(content, o);
  return plan ? { dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(plan))}`, caption } : undefined;
}

/**
 * The report's figures, drawn from the model like "Exportar imagen" draws them (`view-figure.ts`):
 * the numbered model, the loaded model under the loads, and for each result printed as a figure
 * its figures (reactions; the deformed shape; M, V and N; the shells' result).
 */
export function reportResultFigures(config: ReportConfig, c: ReportFigureChoices): ReportResultFigures {
  const s = config.sections;
  const o: FigureOptions = { ...DEFAULT_FIGURE_OPTIONS, style: c.style, values: c.values, titles: false, view: c.view, shells: true, shellComponent: c.shellComponent };
  const out: ReportResultFigures = {};
  if (s.modelData) {
    out.model = asReportFigure('model', { ...o, loads: false, numbering: true }, tr('report.modelFigureCaption'));
    if (s.loads) out.loads = asReportFigure('model', { ...o, loads: true, numbering: false }, tr('figures.modelLoaded'));
  }
  if (!s.results || !resultsStore.results3D) return out;
  const wants = (k: ReportResult) => (config.resultModes?.[k] ?? 'both') !== 'table';
  const many = (contents: FigureContent[]) => contents.map((f) => asReportFigure(f, o, figureTitle(f, o))).filter((f): f is ReportFigure => !!f);
  if (wants('reactions')) out.reactions = many(['reactions']);
  if (wants('displacements')) out.displacements = many(['deformed']);
  if (wants('forces')) out.forces = many(['moment', 'shear', 'axial']);
  if (wants('shells') && modelStore.plates.size + modelStore.quads.size > 0) out.shells = many(['shellMap']);
  return out;
}
