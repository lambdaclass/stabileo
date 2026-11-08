import type { WorkbookSheet } from '../export/workbook-cells';
import { safeText } from '../export/workbook-cells';
import { groupsArea, groupsLabel, meshArea, meshLabel, stirrupsLabel } from './bars';
import type { BeamRow } from './beam-row';
import type { LineLayout } from './beam-line';
import { columnLabel, tieLabel, type ColumnRow } from './column-row';
import { SLAB_FACES, type SlabRow } from './slab-row';
import { wallLabel, type WallRow } from './wall-row';
import type { CheckLine } from './types';

type Tr = (key: string) => string;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : '∞');
const cm = (v: number) => Math.round(v * 100);
const worst = (v: CheckLine[]) => Math.max(0, ...v.map((x) => x.ratio ?? 0));

export function rcSheetsWorkbook(rows: { beam: BeamRow[]; line?: LineLayout[]; column: ColumnRow[]; slab: SlabRow[]; wall: WallRow[]; code: string }, tr: Tr): WorkbookSheet[] {
  const head = [`${tr('rcSheets.code')}: ${rows.code}`];
  const state = (s: string) => tr(`rcSheets.status.${s}`);
  const name = tr('rcSheets.col.name'), level = tr('rcSheets.col.level'), status = tr('rcSheets.col.status'), ratio = tr('rcSheets.col.ratio'), req = tr('rcSheets.req');

  const beams: WorkbookSheet['rows'] = [head, [
    name, level, 'b (cm)', 'h (cm)', 'L (m)', 'Mu+ (kN·m)', 'Mu− (kN·m)', 'Vu (kN)', 'Tu (kN·m)',
    `${tr('rcSheets.col.bottom')} ${req} (cm²)`, tr('rcSheets.col.bottom'), `${tr('rcSheets.col.top')} ${req} (cm²)`, tr('rcSheets.col.top'),
    tr('rcSheets.col.stirrups'), tr('rcSheets.col.torsionLong'), ratio, status,
  ]];
  for (const r of rows.beam) {
    const d = r.demand;
    beams.push([safeText(r.name), safeText(r.level ?? ''), cm(r.b), cm(r.h), r2(r.length),
      r2(Math.max(d.start.pos.value, d.span.pos.value, d.end.pos.value)), r2(Math.max(d.start.neg.value, d.span.neg.value, d.end.neg.value, d.negAny.value)), r2(d.vu.value), r2(d.tu.value),
      r2(r.req.bottom), `${groupsLabel(r.adopted.bottom)} (${r2(groupsArea(r.adopted.bottom))})`, r2(r.req.top), `${groupsLabel(r.adopted.top)} (${r2(groupsArea(r.adopted.top))})`,
      stirrupsLabel(r.adopted.stirrups), r.req.torsionNeglected ? '—' : groupsLabel(r.adopted.torsionLong ? [r.adopted.torsionLong] : []), r3(worst(r.verifications)), state(r.status)]);
  }
  const columns: WorkbookSheet['rows'] = [head, [
    name, level, 'b (cm)', 'h (cm)', 'Pu (kN)', `ρ ${req} (%)`, `As ${req} (cm²)`,
    tr('rcSheets.col.bars'), 'As (cm²)', tr('rcSheets.col.ties'), tr('rcSheets.col.crossties'), ratio, status,
  ]];
  for (const r of rows.column) {
    columns.push([safeText(r.name), safeText(r.level ?? ''), cm(r.b), cm(r.h), r2(Math.max(0, ...r.demand.cases.map((c) => c.pu))), r2(r.req.rho * 100), r2(r.req.ast),
      columnLabel(r.adopted), r2(r.checks.area), tieLabel(r.adopted), `${r.checks.crossties.x} · ${r.checks.crossties.y}`, r3(worst(r.verifications)), state(r.status)]);
  }
  const slabs: WorkbookSheet['rows'] = [head, [
    name, level, 'h (cm)', 'Lx (m)', 'Ly (m)',
    ...SLAB_FACES.flatMap((f) => [`${tr(`rcSheets.face.${f}`)} Mu (kN·m/m)`, `${tr(`rcSheets.face.${f}`)} ${req} (cm²/m)`, tr(`rcSheets.face.${f}`)]),
    ratio, status,
  ]];
  for (const r of rows.slab) {
    slabs.push([safeText(r.name), safeText(r.level ?? ''), cm(r.h), r2(r.lx), r2(r.ly),
      ...SLAB_FACES.flatMap((f) => [r2(r.faces[f].mu), r2(r.faces[f].asReq), r.adopted[f].dia ? `${meshLabel(r.adopted[f])} (${r2(meshArea(r.adopted[f]))})` : '—']),
      r3(worst(r.verifications)), state(r.status)]);
  }
  const walls: WorkbookSheet['rows'] = [head, [
    name, level, 'lw (m)', 'hw (m)', 't (cm)', 'Pu max (kN)', 'Mu max (kN·m)', 'Vu max (kN)', `ρl ${req} (%)`, `ρt ${req} (%)`, tr('rcSheets.col.bars'), ratio, status,
  ]];
  for (const r of rows.wall) {
    const k = r.demand.combos;
    walls.push([safeText(r.name), safeText(r.level ?? ''), r2(r.length), r2(r.height), cm(r.thickness),
      r2(Math.max(0, ...k.map((x) => x.pu))), r2(Math.max(0, ...k.map((x) => x.mu))), r2(Math.max(0, ...k.map((x) => x.vu))),
      r3(r.req.rhoL * 100), r3(r.req.rhoT * 100), wallLabel(r.adopted), r3(worst(r.verifications)), state(r.status)]);
  }
  const schedule: WorkbookSheet['rows'] = [head, [name, level, tr('rcSheets.line.mark'), tr('rcSheets.line.kind'), tr('rcSheets.col.bars'), tr('rcSheets.line.from'), tr('rcSheets.line.to'), tr('rcSheets.line.length'), 'kg']];
  for (const l of rows.line ?? []) {
    for (const b of l.bars) schedule.push([safeText(l.name), safeText(l.level ?? ''), b.mark, `${tr(`rcSheets.line.kind.${b.kind}`)} (${tr(b.face === 'top' ? 'rcSheets.col.top' : 'rcSheets.col.bottom')})`, `${b.bars.count} Ø${b.bars.dia}`, r2(b.from), r2(b.to), r2(b.length), Math.round(b.weight * 10) / 10]);
  }
  return [
    { name: tr('rcSheets.family.beam'), rows: beams },
    { name: tr('rcSheets.sheet.schedule'), rows: schedule },
    { name: tr('rcSheets.family.column'), rows: columns },
    { name: tr('rcSheets.family.slab'), rows: slabs },
    { name: tr('rcSheets.family.wall'), rows: walls },
  ];
}
