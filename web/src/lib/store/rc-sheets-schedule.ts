import { modelStore } from './model.svelte';
import { designData } from './design-data';
import { downloadText } from './file';
import { rcSheetsData, saveRcSheetsData, type SheetRows } from './rc-sheets.svelte';
import { bendingSchedule, DEFAULT_WASTE, type BendingSchedule } from '../rc-sheets/schedule/schedule';
import { scheduleBvbs, scheduleCsv } from '../rc-sheets/schedule/exports';
import { SHEET_CODE_LIST, SHEET_CODES, type MarkScope, type SheetCode } from '../rc-sheets/types';

export function scheduleSettings(): { waste: number; scope: MarkScope } {
  const s = rcSheetsData().schedule;
  return { waste: s?.waste ?? DEFAULT_WASTE, scope: s?.scope ?? 'element' };
}

/** Saved with the sheets' data; a waste out of 0–50 % is clamped. */
export function setScheduleSettings(patch: Partial<{ waste: number; scope: MarkScope }>): void {
  const d = rcSheetsData();
  const next = { ...scheduleSettings(), ...patch };
  next.waste = Math.min(0.5, Math.max(0, Number.isFinite(next.waste) ? next.waste : DEFAULT_WASTE));
  saveRcSheetsData({ ...d, schedule: next });
}

/** The code the rows were designed to, from the name they carry. */
export const rowsCode = (rows: Pick<SheetRows, 'code'>): SheetCode => SHEET_CODE_LIST.find((c) => SHEET_CODES[c].name === rows.code) ?? 'cirsoc201-2025';

export function sheetsSchedule(rows: SheetRows): BendingSchedule {
  const dd = designData();
  return bendingSchedule(rows, { code: rowsCode(rows), slabCover: dd.covers.slab, endZones: dd.columnEndZones === true, ...scheduleSettings() });
}

const baseName = () => (modelStore.model.name || 'stabileo').replace(/[^\w.-]+/g, '-');

export function downloadSchedule(rows: SheetRows, kind: 'csv' | 'bvbs', tr: (k: string) => string): void {
  const s = sheetsSchedule(rows);
  const name = `${baseName()}-${tr('rcSheets.bbs.fileName')}`;
  if (kind === 'csv') { downloadText(`﻿${scheduleCsv(s, tr)}`, `${name}.csv`, 'text/csv;charset=utf-8'); return; }
  const info = modelStore.model.projectInfo;
  downloadText(scheduleBvbs(s, { project: info?.jobNumber || info?.job || modelStore.model.name || 'stabileo', index: '', grade: designData().rebarGrade ?? '' }), `${name}.abs`, 'text/plain');
}
