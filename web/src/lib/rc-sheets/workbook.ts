import type { WorkbookSheet } from '../export/workbook-cells';
import { safeText } from '../export/workbook-cells';
import { groupsArea, groupsLabel, meshArea, meshLabel, stirrupsLabel } from './bars';
import type { BeamRow } from './beam-row';
import { columnLabel, tieLabel, type ColumnRow } from './column-row';
import { SLAB_FACES, type SlabRow } from './slab-row';

type Tr = (key: string) => string;
const r2 = (v: number) => Math.round(v * 100) / 100;
const cm = (v: number) => Math.round(v * 100);
const state = (tr: Tr, s: string) => tr(`rcSheets.status.${s}`);

export function rcSheetsWorkbook(rows: { beam: BeamRow[]; column: ColumnRow[]; slab: SlabRow[] }, tr: Tr): WorkbookSheet[] {
  const beams: WorkbookSheet['rows'] = [[
    tr('rcSheets.col.name'), tr('rcSheets.col.level'), 'b (cm)', 'h (cm)', 'Mu+ (kN·m)', 'Mu− (kN·m)', 'Vu (kN)', 'Tu (kN·m)',
    `${tr('rcSheets.col.bottom')} ${tr('rcSheets.req')} (cm²)`, tr('rcSheets.col.bottom'), `${tr('rcSheets.col.top')} ${tr('rcSheets.req')} (cm²)`, tr('rcSheets.col.top'),
    tr('rcSheets.col.stirrups'), tr('rcSheets.col.torsionLong'), tr('rcSheets.col.status'),
  ]];
  for (const r of rows.beam) {
    const d = r.demand;
    beams.push([safeText(r.name), safeText(r.level ?? ''), cm(r.b), cm(r.h), r2(d.mPos.value), r2(Math.max(d.mNegStart.value, d.mNegEnd.value)), r2(d.vu.value), r2(d.tu.value),
      r2(r.req.bottom), `${groupsLabel(r.adopted.bottom)} (${r2(groupsArea(r.adopted.bottom))})`, r2(r.req.top), `${groupsLabel(r.adopted.top)} (${r2(groupsArea(r.adopted.top))})`,
      stirrupsLabel(r.adopted.stirrups), r.req.torsionNeglected ? '—' : groupsLabel(r.adopted.torsionLong ? [r.adopted.torsionLong] : []), state(tr, r.status)]);
  }
  const columns: WorkbookSheet['rows'] = [[
    tr('rcSheets.col.name'), tr('rcSheets.col.level'), 'b (cm)', 'h (cm)', 'Pu (kN)', `ρ ${tr('rcSheets.req')} (%)`, `As ${tr('rcSheets.req')} (cm²)`,
    tr('rcSheets.col.bars'), 'As (cm²)', tr('rcSheets.col.ties'), tr('rcSheets.col.crossties'), tr('rcSheets.col.ratio'), tr('rcSheets.col.status'),
  ]];
  for (const r of rows.column) {
    columns.push([safeText(r.name), safeText(r.level ?? ''), cm(r.b), cm(r.h), r2(Math.max(0, ...r.demand.cases.map((c) => c.pu))), r2(r.req.rho * 100), r2(r.req.ast),
      columnLabel(r.adopted), r2(r.checks.area), tieLabel(r.adopted), `${r.checks.crossties.x} · ${r.checks.crossties.y}`, Math.round(r.checks.ratio * 1000) / 1000, state(tr, r.status)]);
  }
  const slabs: WorkbookSheet['rows'] = [[
    tr('rcSheets.col.name'), tr('rcSheets.col.level'), 'h (cm)', 'Lx (m)', 'Ly (m)',
    ...SLAB_FACES.flatMap((f) => [`${tr(`rcSheets.face.${f}`)} Mu (kN·m/m)`, `${tr(`rcSheets.face.${f}`)} ${tr('rcSheets.req')} (cm²/m)`, tr(`rcSheets.face.${f}`)]),
    tr('rcSheets.col.status'),
  ]];
  for (const r of rows.slab) {
    slabs.push([safeText(r.name), safeText(r.level ?? ''), cm(r.h), r2(r.lx), r2(r.ly),
      ...SLAB_FACES.flatMap((f) => [r2(r.faces[f].mu), r2(r.faces[f].asReq), r.adopted[f].dia ? `${meshLabel(r.adopted[f])} (${r2(meshArea(r.adopted[f]))})` : '—']),
      state(tr, r.status)]);
  }
  return [
    { name: tr('rcSheets.family.beam'), rows: beams },
    { name: tr('rcSheets.family.column'), rows: columns },
    { name: tr('rcSheets.family.slab'), rows: slabs },
  ];
}
