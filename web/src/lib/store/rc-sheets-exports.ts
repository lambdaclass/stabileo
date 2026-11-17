/**
 * What left the reinforcement sheets: each drawing set, workbook, schedule and BVBS file, recorded
 * with the project (`exportRecordStore`, kept by save and never by undo) and stamped with the model
 * and design data it was drawn from, so that a file issued before the model changed says so.
 */
import { exportRecordStore } from './export-record.svelte';
import { canonicalJson, designFingerprint, hashString } from './design-fingerprint';
import { storedDesignData } from './design-data';
import { sheetsStale } from './rc-sheets-view.svelte';
import { RC_RETOUCH_NOT_APPLICABLE } from '../flow/rc-selection';
import { EXPORT_CANNOT_ASSERT, type ExportKind, type ExportRecord } from '../flow/rc-export-record';

export const SHEETS_SERIES = 'rc-sheets';

export type SheetsExportKind = Extract<ExportKind, 'rcPlans' | 'rcWorkbook' | 'rcScheduleCsv' | 'bvbs'>;

/** The model's design inputs and the project's design data, bars adopted in the sheets among them. */
export function sheetsStateFingerprint(): string {
  return hashString(`${designFingerprint()}|${canonicalJson(storedDesignData())}`);
}

export function recordSheetsExport(kind: SheetsExportKind, filename: string, scope: string, at = new Date().toISOString()): ExportRecord | null {
  return exportRecordStore.record(SHEETS_SERIES, {
    kind, revision: 0, at, filename, error: null, elements: [], retouched: RC_RETOUCH_NOT_APPLICABLE,
    limitations: EXPORT_CANNOT_ASSERT, state: 'ready', fingerprint: sheetsStateFingerprint(), staleSheets: sheetsStale(), scope,
  });
}

export interface SheetsExport extends ExportRecord {
  /** Drawn from the model and design data as they are now, from sheets that were up to date. */
  current: boolean;
}

/** The sheets' exports, newest first (reactive). */
export function sheetsExports(): SheetsExport[] {
  const now = sheetsStateFingerprint();
  return exportRecordStore.exports.filter((r) => r.seriesId === SHEETS_SERIES)
    .map((r) => ({ ...r, current: r.fingerprint === now && !r.staleSheets }))
    .reverse();
}
