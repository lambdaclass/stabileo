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

import { buildProReportData } from '../engine/pro-report-inputs';
import { openReport } from '../engine/pro-report';
import type { ReportConfig, ReportData } from '../engine/pro-report';
import { downloadExcel } from '../store/file';

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
  const canvas = document.querySelector('.viewport-container canvas');
  if (!canvas) return undefined;
  try { return (canvas as HTMLCanvasElement).toDataURL('image/png'); } catch { return undefined; }
}

/**
 * Produce whichever document the dialog asked for.
 *
 * The workbook is the same results in another form, so it is reached from the
 * same dialog and goes out through `downloadExcel` — the route the results
 * table already uses. One exporter with two doors, rather than a second one
 * here that could come to disagree with it.
 */
export function exportReportAs(input: ReportExportInputs): void {
  if (input.config.format === 'xlsx') { void downloadExcel(); return; }

  const data = buildProReportData({
    config: input.config,
    verifications: input.verifications,
    advancedResults: Object.keys(input.advancedResults).length > 0
      ? input.advancedResults as ReportData['advancedResults']
      : undefined,
    screenshot: screenshotOfCanvas(),
    t: input.t,
  });
  if (!data) return;
  openReport(data);
}
