/**
 * The reinforcement drawings as sheets: the drawings of the families and levels asked for (or of
 * one element), each at its scale, composed onto sheets of the chosen A size with the shared sheet
 * set (`sheets/sheet-set.ts`: frame, title block, model-space viewports), and written as DXF 2004
 * (one file per sheet) and one vector PDF. A drawing too large for the sheet at its scale goes on
 * the next larger size; a beam's elevation is cut at its axes instead.
 */
import { zipSync } from 'fflate';
import { CAPTION_MM, fitsDense, type DrawingInput } from '../../sheets/compose';
import { fittingScale, formatGeometry, type SheetFormat } from '../../sheets/formats';
import { buildSheetSet, type SetSheet } from '../../sheets/sheet-set';
import { sheetsToPdf } from '../../sheets/to-pdf';
import { dxf2004Bytes, sheetToDxf2004 } from '../../sheets/to-dxf2004';
import type { LineLayout } from '../beam-line';
import type { BeamRow } from '../beam-row';
import type { ColumnRow } from '../column-row';
import type { LevelPlan } from '../slab-plan';
import type { SlabRow } from '../slab-row';
import type { WallRow } from '../wall-row';
import type { SheetCode } from '../types';
import type { Fmt } from '../format';
import { beamPlans } from './beam-elevation';
import { columnPlans } from './column-elevation';
import { slabLevelPlans } from './slab-level';
import { wallPlans } from './wall-detail';
import { footingPlans } from './footing-detail';
import { stairPlans } from './stair-detail';
import type { StairRow } from '../stair-row';
import type { FootingRow } from '../footing-types';
import type { Tr } from './draw';
import type { StructurePlan } from '../structure-plan';
import { structurePlanDrawing } from './structure-plan';

export type PlanFormat = 'A3' | 'A1' | 'A0';
export const PLAN_FORMATS: readonly PlanFormat[] = ['A3', 'A1', 'A0'];
export type PlanFamily = 'beam' | 'vertical' | 'slab' | 'footing' | 'stair';
export const PLAN_FAMILIES: readonly PlanFamily[] = ['beam', 'vertical', 'slab', 'footing', 'stair'];

/** Elevations and sections 1:`elevation`, slab plans 1:`plan`. */
export interface PlanScales { elevation: number; plan: number }
export const DEFAULT_PLAN_SCALES: PlanScales = { elevation: 20, plan: 50 };

/** `structure`: each family's level plans, drawn ahead of its elements when families are asked for. */
export interface PlanRows { line: LineLayout[]; beam: BeamRow[]; column: ColumnRow[]; slab: SlabRow[]; slabPlan: LevelPlan[]; wall: WallRow[]; footing?: FootingRow[]; stair?: StairRow[]; structure?: readonly StructurePlan[] }

/** The families and levels to draw (all levels when `levels` is null), or one element by its row key. */
export interface PlanSelection { families: readonly PlanFamily[]; levels: readonly string[] | null; element?: string }

export interface PlanOptions {
  format: PlanFormat; scales: PlanScales; code: SheetCode; endZones: boolean; slabCover: number; fmt: Fmt; tr: Tr;
}

const levelOk = (sel: PlanSelection, level: string | undefined) => !sel.levels || sel.levels.includes(level ?? '');

/** The drawings asked for, in family order, and the level each sheet group stands for. */
export function planDrawings(rows: PlanRows, sel: PlanSelection, o: PlanOptions): { drawings: DrawingInput[]; levels: Map<string, string> } {
  const drawings: DrawingInput[] = [], levels = new Map<string, string>();
  const e = { scale: o.scales.elevation, fmt: o.fmt, tr: o.tr }, p = { scale: o.scales.plan, fmt: o.fmt, tr: o.tr };
  const fam = (f: PlanFamily) => o.tr(`rcSheets.tab.${f}`);
  const group = (f: PlanFamily, level: string | undefined) => {
    const g = [fam(f), level || '—'].join(' · ');
    levels.set(g, level ?? '');
    return g;
  };
  const elementLevel = sel.element ? rows.slab.find((r) => r.key === sel.element)?.level : undefined;
  const want = (f: PlanFamily, key: string, level: string | undefined) => (sel.element ? key === sel.element : sel.families.includes(f) && levelOk(sel, level));
  const maxWidth = formatGeometry(o.format).drawable.x1 - formatGeometry(o.format).drawable.x0;
  const structure = (f: PlanFamily) => {
    if (sel.element || !sel.families.includes(f)) return;
    for (const sp of rows.structure ?? []) if (sp.family === f && sp.items.length && levelOk(sel, sp.level)) drawings.push(structurePlanDrawing(sp, { ...p, group: group(f, sp.level) }));
  };
  structure('beam');
  for (const line of rows.line) {
    if (!want('beam', line.key, line.level)) continue;
    const spans = rows.beam.filter((r) => r.demand.line?.group === line.group);
    drawings.push(...beamPlans(line, spans, { ...e, code: o.code, maxWidth, group: group('beam', line.level) }));
  }
  structure('vertical');
  for (const row of rows.column) {
    if (!want('vertical', row.key, row.level)) continue;
    drawings.push(...columnPlans(row, rows.column, { ...e, code: o.code, endZones: o.endZones, group: group('vertical', row.level) }));
  }
  for (const row of rows.wall) {
    if (!want('vertical', row.key, row.level)) continue;
    drawings.push(...wallPlans(row, rows.wall, { ...e, code: o.code, group: group('vertical', row.level) }));
  }
  for (const plan of rows.slabPlan) {
    const pick = sel.element ? elementLevel !== undefined && plan.level === elementLevel : sel.families.includes('slab') && levelOk(sel, plan.level);
    if (!pick || !plan.packages.length) continue;
    drawings.push(...slabLevelPlans(plan, { ...p, code: o.code, slabCover: o.slabCover, group: group('slab', plan.level) }));
  }
  for (const row of rows.footing ?? []) {
    if (!want('footing', row.key, row.level)) continue;
    drawings.push(...footingPlans(row, { ...e, code: o.code, group: group('footing', row.level) }));
  }
  for (const row of rows.stair ?? []) {
    if (!want('stair', row.key, row.level)) continue;
    drawings.push(...stairPlans(row, { ...e, code: o.code, group: group('stair', row.level) }));
  }
  return { drawings, levels };
}

const ORDER: readonly SheetFormat[] = ['A3', 'A2', 'A1', 'A0'];

/** Each drawing on the chosen size when it fits there at its scale, else on the smallest larger one that holds it; on A0 at a smaller scale when none does. */
export function fitFormats(drawings: readonly DrawingInput[], format: PlanFormat): { drawings: DrawingInput[]; moved: string[] } {
  const moved: string[] = [];
  const holds = (d: DrawingInput, f: SheetFormat, s: number) => fitsDense(formatGeometry(f), d.width / s, d.height / s + CAPTION_MM);
  const out = drawings.map((d) => {
    const s = d.paper ? 1 : d.scale ?? 1;
    if (holds(d, format, s)) return d;
    const larger = ORDER.slice(ORDER.indexOf(format) + 1).find((f) => holds(d, f, s));
    moved.push(d.key);
    if (larger) return { ...d, format: larger };
    const g = formatGeometry('A0').drawable;
    return { ...d, format: 'A0' as SheetFormat, scale: fittingScale(d.width, d.height, g.x1 - g.x0, g.y1 - g.y0 - CAPTION_MM) ?? 500 };
  });
  return { drawings: out, moved };
}

export interface PlanProject { name: string; author: string; licence: string; date: string; client?: string; checker?: string; approver?: string }

export function planSheets(drawings: readonly DrawingInput[], levels: ReadonlyMap<string, string>, format: PlanFormat, project: PlanProject, tr: Tr): SetSheet[] {
  const L = (k: string) => tr(`rcSheets.plans.tb.${k}`);
  return buildSheetSet({
    drawings: fitFormats(drawings, format).drawings, settings: { format, prefix: 'E-', start: 0 }, label: (k) => tr(k), dense: true,
    project: { project: project.name, ...(project.client ? { client: project.client } : {}), designer: project.author, ...(project.checker ? { checker: project.checker } : {}), ...(project.approver ? { approver: project.approver } : {}) },
    titleBlock: {
      layout: 'standard',
      lines: [`${L('level')}: {planta}`, `${L('date')}: {fecha}`, `${L('author')}: {profesional} · ${L('licence')}: {matricula}`],
      values: { obra: project.name, profesional: project.author, matricula: project.licence, fecha: project.date },
    },
    floorOf: (g) => (g === undefined ? undefined : levels.get(g) || '—'),
  }).slice(1);
}

export interface PlanFile { name: string; data: Uint8Array }

export function planFiles(sheets: readonly SetSheet[], kinds: { dxf: boolean; pdf: boolean }, base: string, title: string): PlanFile[] {
  const out: PlanFile[] = [];
  if (kinds.dxf) for (const s of sheets) out.push({ name: `${base}-${s.number}.dxf`, data: dxf2004Bytes(sheetToDxf2004(s)) });
  if (kinds.pdf && sheets.length) out.push({ name: `${base}.pdf`, data: sheetsToPdf(sheets.map((s) => ({ width: s.width, height: s.height, primitives: s.primitives })), title) });
  return out;
}

/** One file as it is, several in one zip. */
export function planDownload(files: readonly PlanFile[], base: string): { name: string; data: Uint8Array; mime: string } | null {
  if (!files.length) return null;
  if (files.length === 1) { const f = files[0]!; return { ...f, mime: f.name.endsWith('.pdf') ? 'application/pdf' : 'application/dxf' }; }
  return { name: `${base}.zip`, data: zipSync(Object.fromEntries(files.map((f) => [f.name, f.data]))), mime: 'application/zip' };
}
