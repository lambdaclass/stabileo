/**
 * Turning the report dialog's choices into a document.
 *
 * ── Why this is not in `ProPanel` ──────────────────────────────────
 *
 * It was, and the 600-line ceiling on that component is what said it should
 * not be. The panel is a layout shell: which tab is showing, how wide it is,
 * what the header says. Assembling a report — deciding whether the reader
 * asked for a workbook or a printable document, reading the canvas for a
 * screenshot, gathering verifications and advanced results — is a job, and a
 * job in a layout shell is how a layout shell stops being one.
 *
 * The screenshot is taken HERE rather than in `pro-report-inputs.ts` because
 * it is a reading of the DOM at the instant the button was pressed — the
 * canvas as it is on screen, not a property of the model. A tainted canvas
 * throws on `toDataURL`; the report goes out without the picture rather than
 * not going out.
 */

import { viewportCanvas } from '../utils/viewport-canvas';
import { buildProReportData } from '../engine/pro-report-inputs';
import { openReport } from '../engine/pro-report';
import type { ReportConfig, ReportData } from '../engine/pro-report';
import { downloadProjectWorkbook } from '../store/project-workbook';
import { modelStore, resultsStore } from '../store';
import { verificationStore } from '../store/verification.svelte';
import { activePerCombo3D, activeCombinations } from '../store/active-results';
import { computeStationDemands, runUnifiedVerification } from '../engine/verification-service';
import type { ElementVerification } from '../engine/codes/argentina/cirsoc201';

export interface ReportExportInputs {
  config: ReportConfig;
  verifications: ReportData['verifications'];
  advancedResults: Record<string, unknown>;
  t: (key: string) => string;
}

/** The canvas as it is on screen, or nothing if the browser refuses it. */
function screenshotOfCanvas(): string | undefined {
  // The viewport's canvas, not the first canvas in the document: a panel that draws one (a chart,
  // a section preview) would otherwise put its picture in the report as "the model".
  const canvas = viewportCanvas();
  if (!canvas) return undefined;
  try { return (canvas as HTMLCanvasElement).toDataURL('image/png'); } catch { return undefined; }
}

/**
 * Produce whichever document the dialog asked for.
 *
 * The workbook is the same results in another form, so it is the project workbook
 * (`store/project-workbook.ts`), the one the Project tab writes, narrowed to the sections the
 * dialog chose. One exporter with two doors, rather than a second one here that could come to
 * disagree with it.
 */
/**
 * The concrete design as the Design panel verified it, member by member, for the report.
 *
 * The report used to re-design every member with the older checker: bars of its own choosing,
 * a linear P-M interaction, fy 420, 25 mm cover and Ø8 stirrups hard-wired, 2005 clause
 * numbers, so the document described a different design from the panel's. It now prints what
 * the panel checked: the member's own reinforcement against the adapter the project binds.
 */
export function reportDesignChecks(): NonNullable<ReportData['designChecks']> {
  const out: NonNullable<ReportData['designChecks']> = [];
  for (const [id, ctx] of verificationStore.contexts) {
    const pv = verificationStore.providedFor(id);
    if (!pv || !pv.hasProvided) continue;
    const gov = [...pv.checks].sort((a, b) => b.ratio - a.ratio)[0];
    out.push({
      elementId: id, elementType: pv.elementType, section: ctx.section.name,
      status: pv.overallStatus, worstUtilization: pv.worstUtilization, checks: pv.strengthCheckCount,
      ...(gov ? { governing: gov.category, demand: gov.demand, capacity: gov.capacity, unit: gov.unit, comboName: gov.comboName } : {}),
    });
  }
  return out.sort((a, b) => a.elementId - b.elementId);
}

export function exportReportAs(input: ReportExportInputs): void {
  if (input.config.format === 'xlsx') {
    const o = workbookOptions(input);
    void downloadProjectWorkbook(5, { model: o.includeModel, results: o.includeResults, extra: o.extraSheets });
    return;
  }

  const data = buildProReportData({
    config: input.config,
    verifications: [],
    advancedResults: Object.keys(input.advancedResults).length > 0
      ? input.advancedResults as ReportData['advancedResults']
      : undefined,
    screenshot: screenshotOfCanvas(),
    t: input.t,
  });
  if (!data) return;
  data.designChecks = reportDesignChecks();
  openReport(data);
}

/**
 * The workbook for the sections the dialog chose.
 *
 * The dialog says its choices apply to both formats, and the workbook ignored them: it was the
 * whole base export whatever was ticked. Model data and results map to the base sheets; the
 * verification and the story drift, which the base export does not have, go as sheets of their
 * own, read from the same report data the printable document uses.
 */
export function workbookOptions(input: ReportExportInputs): { includeModel: boolean; includeResults: boolean; extraSheets: Array<{ name: string; rows: (string | number)[][] }> } {
  const s = input.config.sections;
  const extraSheets: Array<{ name: string; rows: (string | number)[][] }> = [];
  const checks = s.verification ? reportDesignChecks() : [];
  if (checks.length > 0) {
    extraSheets.push({
      name: input.t('report.verificationTitle') || 'Verification',
      // Demand and capacity mix kN, kN·m and MPa down one column: each row says its unit, as the
      // HTML report does.
      rows: [['ID', input.t('report.type') || 'Type', input.t('report.sectionLabel') || 'Section', input.t('report.design.governing'), input.t('report.design.demand'), input.t('report.design.capacity'), input.t('report.unit') || 'Unit', 'u', input.t('report.status') || 'Status'],
        ...checks.map((c) => [c.elementId, c.elementType, c.section, c.governing ?? '', c.demand ?? '', c.capacity ?? '', c.unit ?? '', c.worstUtilization, c.status])],
    });
  }
  if (s.storyDrift) {
    const data = buildProReportData({ config: input.config, verifications: [], advancedResults: undefined, screenshot: undefined, t: input.t });
    const drifts = data?.storyDrifts ?? [];
    if (drifts.length > 0) {
      extraSheets.push({
        name: input.t('report.storyDrift') || 'Story drift',
        rows: [['z (m)', 'h (m)', 'Δx (mm)', 'Δy (mm)', 'Δx/h', 'Δy/h', input.t('report.status') || 'Status'],
          ...drifts.map((d) => [d.level, d.height, d.driftX * 1000, d.driftY * 1000, d.ratioX, d.ratioY, d.status])],
      });
    }
  }
  return { includeModel: s.modelData, includeResults: s.results, extraSheets };
}

/**
 * The concrete verification the report prints, against the model as it is now.
 *
 * Always re-run, not taken from the verification tab: a prior run may describe a since-edited
 * model. And kept to the report: it used to be written to `verificationStore`, replacing the
 * tab's own results — the ones its colour map draws — with this pass.
 */
export function reportVerification(): ElementVerification[] {
  const results = resultsStore.results3D;
  if (!results) return [];
  const md = { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports };
  const stationData = resultsStore.hasCombinations3D
    ? computeStationDemands(activePerCombo3D(), activeCombinations(), md)
    : undefined;
  return runUnifiedVerification(results, md, resultsStore.governing3D.size > 0 ? resultsStore.governing3D : null, stationData?.demands);
}
