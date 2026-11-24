import type { WorkbookSheet } from '../export/workbook-cells';
import { safeText } from '../export/workbook-cells';
import { groupsArea, groupsLabel, meshArea, meshLabel, stirrupsLabel } from './bars';
import type { BeamRow } from './beam-row';
import type { LineLayout } from './beam-line';
import { columnLabel, crosstiesText, tieLabel, type ColumnRow } from './column-row';
import { SLAB_FACES, type SlabRow } from './slab-row';
import { wallLabel, type WallRow } from './wall-row';
import type { CheckLine } from './types';
import type { PunchingRow } from './punching-row';
import type { FootingRow } from './footing-types';
import type { StairRow } from './stair-row';
import { purchaseOrder, type PurchaseOrder } from './schedule/order';
import { meshText } from './footing-mesh';
import { dowelsText } from './footing-dowels';
import { groupDowelRows } from './footing-group-detail';
import { cageText, dropText } from './footing-punching-row';
import type { BendingSchedule } from './schedule/schedule';
import { scheduleSheets } from './schedule/exports';

type Tr = (key: string) => string;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : '∞');
const cm = (v: number) => Math.round(v * 100);
const fmtOf = (v: number, digits = 2): string => v.toFixed(digits);
const worst = (v: CheckLine[]) => Math.max(0, ...v.map((x) => x.ratio ?? 0));

export function rcSheetsWorkbook(rows: { beam: BeamRow[]; line?: LineLayout[]; column: ColumnRow[]; slab: SlabRow[]; wall: WallRow[]; punching?: PunchingRow[]; footing?: FootingRow[]; stair?: StairRow[]; levels?: string[]; code: string }, tr: Tr, bending?: BendingSchedule): WorkbookSheet[] {
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
    tr('rcSheets.col.bars'), 'As (cm²)', tr('rcSheets.col.ties'), tr('rcSheets.col.crossties'), `${tr('rcSheets.elev.lap')} (cm)`, ratio, status,
  ]];
  for (const r of rows.column) {
    if (r.pier) { columns.push([safeText(r.name), safeText(r.level ?? ''), cm(r.b), cm(r.h), '—', '—', '—', `→ ${safeText(r.pier.name)}`, '—', '—', '—', '—', r3(worst(r.verifications)), state(r.status)]); continue; }
    columns.push([safeText(r.name), safeText(r.level ?? ''), cm(r.b), cm(r.h), r2(Math.max(0, ...r.demand.cases.map((c) => c.pu))), r2(r.req.rho * 100), r2(r.req.ast),
      columnLabel(r.adopted), r2(r.checks.area), tieLabel(r.adopted), crosstiesText(r.checks.crossties), r.lap ? cm(r.lap.length) : '—', r3(worst(r.verifications)), state(r.status)]);
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
      r3(r.req.rhoL * 100), r3(r.req.rhoT * 100), [wallLabel(r.adopted), ...(r.pier?.columns.filter((c) => c.host).map((c) => `${safeText(c.name)}: ${c.label} · ${tieLabel({ tieDia: c.tieDia, tieSpacing: c.tieSpacing })}`) ?? [])].join(' · '), r3(worst(r.verifications)), state(r.status)]);
  }
  const schedule: WorkbookSheet['rows'] = [head, [name, level, tr('rcSheets.line.mark'), tr('rcSheets.line.kind'), tr('rcSheets.col.bars'), tr('rcSheets.line.from'), tr('rcSheets.line.to'), tr('rcSheets.line.length'), 'kg']];
  for (const l of rows.line ?? []) {
    for (const b of l.bars) schedule.push([safeText(l.name), safeText(l.level ?? ''), b.mark, `${tr(`rcSheets.line.kind.${b.kind}`)} (${tr(b.face === 'top' ? 'rcSheets.col.top' : 'rcSheets.col.bottom')})`, `${b.bars.count} Ø${b.bars.dia}`, r2(b.from), r2(b.to), r2(b.length), Math.round(b.weight * 10) / 10]);
  }
  const punch: WorkbookSheet['rows'] = [head, [name, level, tr('rcSheets.s.punchPosition'), 'Vu (kN)', 'φVc (kN)', ratio, status]];
  for (const r of rows.punching ?? []) punch.push([safeText(r.name), safeText(r.level ?? ''), r.position === '—' ? '—' : tr(`rcSheets.punchPos.${r.position}`), r2(r.vu), r2(r.phiVc), r3(r.utilization), state(r.status)]);
  const feet: WorkbookSheet['rows'] = [head, [name, level, tr('rcSheets.foot.kind'), 'B (cm)', 'L (cm)', 'h (cm)', `${tr('rcSheets.foot.founding')} (m)`, 'N (kN)', 'qmax (kPa)', 'qadm (kPa)', tr('rcSheets.foot.mesh.x'), tr('rcSheets.foot.mesh.y'), tr('rcSheets.foot.mesh.top'), tr('rcSheets.foot.dowels'), tr('rcSheets.foot.punching'), tr('rcSheets.foot.piles'), ratio, status]];
  for (const r of rows.footing ?? []) {
    const kind = r.cap ? tr('rcSheets.footKind.pileCap') : r.group ? tr(`rcSheets.footKind.${r.group.kind}`) : r.combined ? tr('rcSheets.footKind.combined') : tr(`rcSheets.footPos.${r.edge?.position ?? 'centred'}`);
    const tops = r.adopted.tops ? [r.adopted.tops.x && `X ${meshText(r.adopted.tops.x)}`, r.adopted.tops.y && `Y ${meshText(r.adopted.tops.y)}`].filter(Boolean).join(' · ') : r.adopted.top ? meshText(r.adopted.top) : '—';
    const dowels = r.group
      ? groupDowelRows(r).map((m) => `${m.name} ${dowelsText(m.row)}${m.row.dowels ? ` · ${cm(m.row.dowels.lap)} cm` : ''}`).join(' / ') || '—'
      : r.adopted.dowels && !r.uncovered ? `${dowelsText(r)}${r.dowels ? ` · ${cm(r.dowels.lap)} cm` : ''}` : '—';
    const piles = r.adopted.piles ? `${r.adopted.piles.at.length} Ø${Math.round(r.adopted.piles.diameter * 100)} · L ${r2(r.adopted.piles.length)} m · ${r.adopted.piles.bars.count} Ø${r.adopted.piles.bars.dia}` : '—';
    const punch = (r.group?.columns ?? []).filter((k) => k.punching?.fix).map((k) => `${safeText(k.name)}: ${k.punching!.fix!.cage ? `${tr('rcSheets.footFig.cage')} ${cageText(k, fmtOf)}` : `${tr('rcSheets.footFig.drop')} ${dropText(k, fmtOf)}`}`).join(' / ') || '—';
    feet.push([safeText(r.name), safeText(r.level ?? ''), kind, cm(r.B), cm(r.L), cm(r.h), r2(r.founding), r2(r.demand.service?.N ?? 0), r2(r.bearing?.qMax ?? 0), r2(r.bearing?.allowable ?? 0),
      meshText(r.adopted.x), meshText(r.adopted.y), tops, dowels, punch, piles, r3(r.utilization), state(r.status)]);
  }
  const stairs: WorkbookSheet['rows'] = [head, [name, level, tr('rcSheets.stair.col.flight'), 'ℓ (m)', 'h (cm)', 'Mu (kN·m/m)', tr('rcSheets.stair.bars.main'), tr('rcSheets.stair.bars.top'), tr('rcSheets.stair.bars.dist'), ratio, status]];
  const cm1 = (v: number) => Math.round(v * 1000) / 10;
  const stairBar = (b: { dia: number; spacing: number } | undefined) => (b ? `Ø${b.dia} c/${cm1(b.spacing)}` : '—');
  for (const r of rows.stair ?? []) {
    const s = r.demand.spec;
    stairs.push([safeText(r.name), safeText(r.level ?? ''), `${s.steps} × ${cm1(s.riser)}/${cm1(s.tread)}`, r.design ? r2(r.design.geometry.span) : '—', cm(s.waist), r.design ? r2(r.design.mu) : '—',
      stairBar(r.adopted.main), stairBar(r.adopted.top), stairBar(r.adopted.dist), r3(r.utilization), state(r.status)]);
  }
  return [
    { name: tr('rcSheets.family.beam'), rows: beams },
    { name: tr('rcSheets.sheet.schedule'), rows: schedule },
    { name: tr('rcSheets.family.column'), rows: columns },
    { name: tr('rcSheets.family.wall'), rows: walls },
    { name: tr('rcSheets.family.slab'), rows: slabs },
    ...((rows.punching ?? []).length ? [{ name: tr('rcSheets.family.punching'), rows: punch }] : []),
    ...((rows.footing ?? []).length ? [{ name: tr('rcSheets.family.footing'), rows: feet }] : []),
    ...((rows.stair ?? []).length ? [{ name: tr('rcSheets.family.stair'), rows: stairs }] : []),
    ...(bending?.rows.length ? scheduleSheets(bending, tr, rows.code) : []),
    ...(bending?.rows.length ? [orderSheet(purchaseOrder({ line: rows.line ?? [], column: rows.column, slab: rows.slab, wall: rows.wall, footing: rows.footing ?? [], stair: rows.stair ?? [] }, bending, rows.levels ?? []), tr)] : []),
  ];
}

/** The purchase order's sheet: each level's concrete, its steel with the waste, kg per m³ and its stock bars by diameter, and the total. */
function orderSheet(o: PurchaseOrder, tr: Tr): WorkbookSheet {
  const dias = o.total.bars.map((b) => b.dia);
  const rows: WorkbookSheet['rows'] = [[tr('rcSheets.order.title'), `${o.stockLength} m · ${Math.round(o.waste * 100)} %`], [tr('rcSheets.col.level'), tr('rcSheets.order.concrete'), 'kg', 'kg/m³', ...dias.map((d) => `Ø${d}`)]];
  for (const l of [...o.levels, o.total]) rows.push([l === o.total ? tr('rcSheets.order.total') : safeText(l.level || '—'), Math.round(l.concrete * 100) / 100, Math.round(l.withWaste), l.ratio === null ? '—' : Math.round(l.ratio), ...dias.map((d) => l.bars.find((b) => b.dia === d)?.stockBars ?? 0)]);
  return { name: tr('rcSheets.order.title'), rows };
}
