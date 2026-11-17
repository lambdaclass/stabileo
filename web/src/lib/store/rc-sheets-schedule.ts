import { modelStore } from './model.svelte';
import { designData } from './design-data';
import { downloadText } from './file';
import { rcSheetsData, saveRcSheetsData, type SheetRows } from './rc-sheets.svelte';
import { bendingSchedule, DEFAULT_WASTE, type BendingSchedule } from '../rc-sheets/schedule/schedule';
import { scheduleBvbs, scheduleCsv } from '../rc-sheets/schedule/exports';
import { DEFAULT_SCHEDULE_VIEW, isScheduleView, type ScheduleView } from '../rc-sheets/schedule/views';
import { SHEET_CODE_LIST, SHEET_CODES, type MarkScope, type SheetCode } from '../rc-sheets/types';
import { recordSheetsExport } from './rc-sheets-exports';

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

const VIEW_KEY = 'stabileo-rc-bbs-view';

/** The view this viewer last chose, kept in the browser rather than with the project. */
export function scheduleViewChoice(): ScheduleView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return isScheduleView(v) ? v : DEFAULT_SCHEDULE_VIEW;
  } catch { return DEFAULT_SCHEDULE_VIEW; }
}

export function setScheduleViewChoice(view: ScheduleView): void {
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* lasts the session */ }
}

/** The code the rows were designed to, from the name they carry. */
export const rowsCode = (rows: Pick<SheetRows, 'code'>): SheetCode => SHEET_CODE_LIST.find((c) => SHEET_CODES[c].name === rows.code) ?? 'cirsoc201-2025';

export function sheetsSchedule(rows: SheetRows): BendingSchedule {
  const dd = designData();
  return bendingSchedule(rows, { code: rowsCode(rows), slabCover: dd.covers.slab, endZones: dd.columnEndZones === true, ...scheduleSettings() });
}

const baseName = () => (modelStore.model.name || 'stabileo').replace(/[^\w.-]+/g, '-');

/** The CSV as the view lays the schedule out; BVBS one record per mark of each element group, whatever the view. */
export function downloadSchedule(rows: SheetRows, kind: 'csv' | 'bvbs', tr: (k: string) => string, view: ScheduleView = 'element'): void {
  const s = sheetsSchedule(rows);
  const name = `${baseName()}-${tr('rcSheets.bbs.fileName')}`;
  if (kind === 'csv') {
    downloadText(`﻿${scheduleCsv(s, tr, view)}`, `${name}.csv`, 'text/csv;charset=utf-8');
    recordSheetsExport('rcScheduleCsv', `${name}.csv`, tr(`rcSheets.bbs.view.${view}`));
    return;
  }
  const info = modelStore.model.projectInfo;
  downloadText(scheduleBvbs(s, { project: info?.jobNumber || info?.job || modelStore.model.name || 'stabileo', index: '', grade: designData().rebarGrade ?? '' }), `${name}.abs`, 'text/plain');
  recordSheetsExport('bvbs', `${name}.abs`, tr('rcSheets.bbs.view.element'));
}
