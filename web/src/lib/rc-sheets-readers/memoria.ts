/**
 * The reinforcement sheets' rows as the memoria's concrete elements: per family, the adopted bars,
 * each verification with its clause, and the row's status. A row whose bars nobody adopted is
 * printed with the proposal and held by that, so it never reads as satisfying.
 */
import { statusOfRatio, type CheckRow, type DesignStatus } from '../design-contract';
import type { MemoriaElement } from '../report/memoria/types';
import { groupsLabel, meshLabel, stirrupsLabel } from '../rc-sheets/bars';
import { columnLabel, tieLabel, type ColumnRow } from '../rc-sheets/column-row';
import { wallLabel, type WallRow } from '../rc-sheets/wall-row';
import { SLAB_FACES, type SlabRow } from '../rc-sheets/slab-row';
import { SHEET_CODES, type CheckLine, type SheetCode } from '../rc-sheets/types';
import { localizeCriterion } from '../rc-sheets/criteria';
import type { BeamRow } from '../rc-sheets/beam-row';
import type { LineLayout } from '../rc-sheets/beam-line';
import type { PunchingRow } from '../rc-sheets/punching-row';

type Tr = (key: string, params?: Record<string, string | number>) => string;

export interface SheetsForMemoria {
  beam: readonly BeamRow[]; line: readonly LineLayout[]; column: readonly ColumnRow[];
  slab: readonly SlabRow[]; wall: readonly WallRow[]; punching: readonly PunchingRow[];
}

/** The regulation id and edition the memoria's rows cite for each code the sheets design to. */
export const SHEET_CODE_ROW: Record<SheetCode, { code: string; edition: string }> = {
  'cirsoc201-2025': { code: 'cirsoc-201', edition: '2025' },
  'aci318-19': { code: 'aci-318', edition: '2019' },
  'en1992-1-1': { code: 'en-1992-1-1', edition: '2004' },
  'bs-en1992-1-1': { code: 'bs-en-1992-1-1', edition: '2004' },
  'ts500-2000': { code: 'ts-500', edition: '2000' },
};

function statusOf(l: CheckLine, ratio: number | null): DesignStatus {
  if (!l.ok) return 'fail';
  return ratio === null ? 'ok' : statusOfRatio(Math.min(ratio, 1));
}

export function sheetCheckRow(l: CheckLine, code: SheetCode, tr: Tr): CheckRow {
  const ratio = l.ratio !== undefined && Number.isFinite(l.ratio) ? l.ratio : null;
  return {
    ...SHEET_CODE_ROW[code], ...(l.clause ? { clause: localizeCriterion(l.clause, tr) } : {}), title: tr(l.label), titleKey: l.label,
    inputs: [
      ...(l.demand ? [{ symbol: tr('rcSheets.v.demand'), value: l.demand }] : []),
      ...(l.capacity ? [{ symbol: tr('rcSheets.v.capacity'), value: l.capacity }] : []),
    ],
    ratio, status: statusOf(l, ratio),
  };
}

/** A row's adopted bars as (i18n key, text) pairs: what the memoria and the IFC print of it. */
export function rowBars(r: BeamRow | LineLayout | ColumnRow | SlabRow | WallRow): Array<[string, string]> {
  if ('spanAdopted' in r) {
    const a = r.adopted;
    return [['rcSheets.col.bottom', groupsLabel([a.bottom])], ['rcSheets.col.top', groupsLabel([a.top])], ['memo.rc.supportTop', a.supportTop.map((g) => groupsLabel([g])).join(' · ')]];
  }
  if (r.family === 'beam') {
    const a = r.adopted, at = a.at;
    return [['rcSheets.col.bottom', groupsLabel(at?.span?.bottom ?? a.bottom)],
      ['rcSheets.col.top', at?.start && at.end ? `${groupsLabel(at.start.top)} · ${groupsLabel(at.end.top)}` : groupsLabel(a.top)],
      ['rcSheets.col.stirrups', stirrupsLabel(a.stirrups)]];
  }
  if (r.family === 'column') return [['rcSheets.col.bars', columnLabel(r.adopted)], ['rcSheets.col.ties', tieLabel(r.adopted)]];
  if (r.family === 'slab') return SLAB_FACES.map((f): [string, string] => [`rcSheets.face.${f}`, r.adopted[f].dia ? meshLabel(r.adopted[f]) : '—']);
  return [['rcSheets.col.bars', wallLabel(r.adopted)]];
}

export function sheetsMemoriaElements(rows: SheetsForMemoria, code: SheetCode, tr: Tr, n2: (v: number) => string): MemoriaElement[] {
  const cm = (v: number) => String(Math.round(v * 100));
  const codeDatum: [string, string] = [tr('rcSheets.code'), SHEET_CODES[code].name];
  const held = (adopted: boolean) => (adopted ? {} : { heldBy: [tr('memo.rc.notAdopted')] });
  const level = (l?: string) => (l ? { level: l } : {});
  const checks = (v: readonly CheckLine[]) => v.map((l) => sheetCheckRow(l, code, tr));
  const bars = (r: Parameters<typeof rowBars>[0]) => rowBars(r).map(([k, v]): [string, string] => [tr(k), v]);
  const out: MemoriaElement[] = [];
  for (const l of rows.line) {
    out.push({
      id: `rc-${l.key}`, family: 'beam', name: `${l.name} — ${tr('memo.rc.line')}`, ...level(l.level),
      data: [[tr('memo.el.length'), `${n2(l.length)} m`], ...bars(l), codeDatum],
      rows: checks(l.verifications), notes: [], ...held(l.isAdopted),
    });
  }
  for (const r of rows.beam) {
    out.push({
      id: `rc-${r.key}`, family: 'beam', name: r.name, ...level(r.level),
      data: [[tr('memo.el.section'), `${cm(r.b)}×${cm(r.h)} cm`], [tr('memo.el.length'), `${n2(r.length)} m`], ...bars(r), codeDatum],
      rows: checks(r.verifications), notes: [], ...held(r.isAdopted),
    });
  }
  for (const r of rows.column) {
    out.push({
      id: `rc-${r.key}`, family: 'column', name: r.name, ...level(r.level),
      data: [[tr('memo.el.section'), `${cm(r.b)}×${cm(r.h)} cm`], [tr('memo.el.length'), `${n2(r.length)} m`], ...bars(r), codeDatum],
      rows: checks(r.verifications), notes: [], ...held(r.isAdopted),
    });
  }
  for (const r of rows.slab) {
    out.push({
      id: `rc-${r.key}`, family: 'slab', name: r.name, ...level(r.level),
      data: [[tr('memo.el.thickness'), `${cm(r.h)} cm`], [tr('memo.el.span'), `${n2(r.lx)} × ${n2(r.ly)} m`], ...bars(r), codeDatum],
      rows: checks(r.verifications), notes: [], ...held(r.isAdopted),
    });
  }
  for (const r of rows.wall) {
    out.push({
      id: `rc-${r.key}`, family: 'wall', name: r.name, ...level(r.level),
      data: [[tr('memo.el.size'), `${n2(r.length)} × ${n2(r.height)} × ${n2(r.thickness)} m`], ...bars(r), codeDatum],
      rows: checks(r.verifications), notes: [], ...held(r.isAdopted),
    });
  }
  for (const r of rows.punching) {
    out.push({
      id: `rc-${r.key}`, family: 'slab', name: `${r.name} — ${tr('rcSheets.family.punching')}`, ...level(r.level),
      data: [[tr('rcSheets.s.punchPosition'), r.position], codeDatum], rows: checks(r.verifications), notes: [],
    });
  }
  return out;
}
