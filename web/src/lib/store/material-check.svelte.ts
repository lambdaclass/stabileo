/**
 * The members of the other materials, checked with the design: timber by CIRSOC 601, aluminium
 * by EN 1999-1-1, cold-formed steel by CIRSOC 303 (the AISI S100 checker it adopts), and
 * steel-concrete members by AISC 360-10 Chapter I. One result per member, as check rows, beside
 * the concrete and the hot-rolled steel the design already reads.
 *
 * Which checker a member gets: a composite definition on the element first, then the material
 * (timber reference values, an aluminium grade), then a cold-formed section on a steel material.
 */
import { modelStore } from './model.svelte';
import { designData } from './design-data';
import { activeCombinations, activePerCombo3D, activeResultSet3D } from './active-results';
import { memberContexts } from '../engine/design/other-codes/run';
import { runOtherCode } from '../engine/design/other-codes/run';
import { AISI_S100 } from '../engine/design/other-codes/cfs-code';
import type { MemberContext } from '../engine/design/other-codes/types';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { isColdFormedSection } from '../profiles/cold-formed-catalogue';
import { gradeById } from '../data/structural-grades';
import { timberCheckRows, timberSection } from '../engine/design/materials/timber';
import { aluminiumCheckRows, type AluSection } from '../engine/design/materials/aluminium';
import { compositeCheckRows, type SteelShape } from '../engine/design/materials/composite';
import { statusOfRatio, worstStatus, type CheckRow } from '../design-contract';

export type OtherMaterialFamily = 'timber' | 'aluminium' | 'coldFormed' | 'composite';
export const OTHER_FAMILIES: readonly OtherMaterialFamily[] = ['timber', 'aluminium', 'coldFormed', 'composite'];

export interface MaterialMemberResult { elementId: number; family: OtherMaterialFamily; code: string; rows: CheckRow[]; utilization: number | null; status: CheckRow['status'] }

let results = $state<Map<number, MaterialMemberResult>>(new Map());
export const materialCheckState = { get results() { return results; } };

/** The checker a member gets, or null when it is concrete or hot-rolled steel. */
export function otherFamilyOf(e: { composite?: unknown }, section: { name?: string; profileFamily?: string } | undefined, material: Parameters<typeof materialFamilyOf>[0]): OtherMaterialFamily | null {
  if (e.composite) return 'composite';
  const fam = materialFamilyOf(material, catalogueGradeFamily).family;
  if (fam === 'timber') return 'timber';
  if (fam === 'aluminium') return 'aluminium';
  if (fam === 'steel' && isColdFormedSection(section ?? undefined)) return 'coldFormed';
  return null;
}

const shapeKind = (s: { shape?: string }) => (s.shape ?? '').toUpperCase();

function aluSection(s: MemberContext['section']): AluSection {
  const k = shapeKind(s);
  const kind: AluSection['kind'] = k === 'I' || k === 'H' ? 'I' : k === 'RHS' || k === 'SHS' ? 'RHS' : k === 'CHS' ? 'CHS' : 'rect';
  return { kind, b: s.b ?? s.h ?? 0.1, h: s.h ?? 0.1, ...(s.tw ? { tw: s.tw } : {}), ...(s.tf ? { tf: s.tf } : {}), ...(s.t ? { t: s.t } : {}), a: s.a, iy: s.iy ?? 0, iz: s.iz ?? 0, j: s.j ?? 0 };
}

function steelShape(s: MemberContext['section'], fy: number): SteelShape {
  const k = shapeKind(s);
  const kind: SteelShape['kind'] = k === 'CHS' ? 'CHS' : k === 'RHS' || k === 'SHS' ? 'RHS' : 'I';
  return { kind, b: s.b ?? s.h ?? 0.1, h: s.h ?? 0.1, ...(s.tw ? { tw: s.tw } : {}), ...(s.tf ? { tf: s.tf } : {}), ...(s.t ? { t: s.t } : {}), a: s.a, iy: s.iy ?? 0, iz: s.iz ?? 0, fy };
}

const unsupported = (code: string, clause: string, title: string, key: string, why: string): CheckRow =>
  ({ code, clause, title, titleKey: key, formula: why, inputs: [], ratio: null, status: 'unsupported' });

function result(elementId: number, family: OtherMaterialFamily, code: string, rows: CheckRow[]): MaterialMemberResult {
  const ratios = rows.map((r) => r.ratio).filter((x): x is number => x !== null);
  const utilization = ratios.length ? Math.max(...ratios) : null;
  return { elementId, family, code, rows, utilization, status: rows.length ? worstStatus(rows.map((r) => r.status)) : 'notVerified' };
}

/** Check every member of the other materials against the active results. */
export function runMaterialChecks(): { checked: number } | { refused: 'noResults' } {
  const m = modelStore.model;
  let perCombo = activePerCombo3D(), combos = activeCombinations();
  // A single solve without combinations: read as one, holding every load case.
  const single = perCombo.size === 0 ? activeResultSet3D() : null;
  if (single) {
    perCombo = new Map([[0, single]]);
    combos = [{ id: 0, name: 'solve', factors: m.loadCases.map((c) => ({ caseId: c.id, factor: 1 })) }];
  }
  if (perCombo.size === 0) { results = new Map(); return { refused: 'noResults' }; }
  const contexts = memberContexts(m as never, perCombo, combos).filter((c) => otherFamilyOf(c.element as never, c.section as never, c.material as never));
  const caseType = new Map(m.loadCases.map((c) => [c.id, c.type ?? '']));
  const typesOf = new Map(combos.map((c) => [c.id, c.factors.filter((f) => f.factor !== 0).map((f) => caseType.get(f.caseId) ?? '')]));
  const out = new Map<number, MaterialMemberResult>();
  const cfs: MemberContext[] = [];
  const settings = designData().timber ?? { wet: false };
  for (const ctx of contexts) {
    const fam = otherFamilyOf(ctx.element as never, ctx.section as never, ctx.material as never)!;
    const geo = { L: ctx.L, Lb: ctx.Lb, ...(ctx.kStrong !== undefined ? { kStrong: ctx.kStrong } : {}), ...(ctx.kWeak !== undefined ? { kWeak: ctx.kWeak } : {}) };
    const forces = ctx.demands.map((d) => ({ n: d.forces.n, vStrong: d.forces.vz, vWeak: d.forces.vy, mStrong: d.forces.my, mWeak: d.forces.mz, comboName: d.comboName, x: d.stationX, caseTypes: typesOf.get(d.comboId) ?? [] }));
    if (fam === 'timber') {
      const sec = timberSection(ctx.section as never), ref = (ctx.material as { timber?: import('../engine/design/materials/timber').TimberReference }).timber!;
      out.set(ctx.elementId, result(ctx.elementId, fam, 'cirsoc-601', sec ? timberCheckRows(ref, sec, settings, geo, forces) : [unsupported('cirsoc-601', '3.1', 'Section', 'check.timber.section', 'rectangular or round section')]));
    } else if (fam === 'aluminium') {
      const g = gradeById((ctx.material as { gradeId?: string }).gradeId ?? '');
      out.set(ctx.elementId, result(ctx.elementId, fam, 'en-1999-1-1', g ? aluminiumCheckRows(aluSection(ctx.section), { fo: g.fy, fu: g.fu, designation: g.designation }, geo, forces) : [unsupported('en-1999-1-1', '3.2', 'Grade', 'check.alu.grade', 'catalogued EN AW grade')]));
    } else if (fam === 'composite') {
      const spec = (ctx.element as { composite?: import('../engine/design/materials/composite').CompositeSpec }).composite!;
      out.set(ctx.elementId, result(ctx.elementId, fam, 'aisc-360', compositeCheckRows(steelShape(ctx.section, ctx.material.fy ?? 250), spec, geo,
        forces.map((f) => ({ n: f.n, v: Math.max(Math.abs(f.vStrong), Math.abs(f.vWeak)), mStrong: f.mStrong, mWeak: f.mWeak, comboName: f.comboName, x: f.x })))));
    } else cfs.push(ctx);
  }
  // Cold-formed: the AISI S100 checker CIRSOC 303 adopts, its governing reading per member.
  if (cfs.length) {
    const run = runOtherCode(AISI_S100, cfs);
    for (const r of run.rows) {
      const rows: CheckRow[] = r.status === 'checked'
        ? [{ code: 'cirsoc-303', edition: '2009', clause: r.reading.clause ?? 'C', title: r.reading.governing, titleKey: r.reading.governing, formula: 'Ru ≤ φ·Rn', inputs: [],
          ratio: Math.round(r.reading.ratio * 1000) / 1000, status: r.reading.pass ? statusOfRatio(r.reading.ratio) : 'fail', combination: r.comboName, location: `x = ${r.stationX.toFixed(2)} m` },
          ...r.reading.unevaluated.map((k) => unsupported('cirsoc-303', 'C', k, k, 'not evaluated by the checker'))]
        : [unsupported('cirsoc-303', 'A', r.reasonKey, r.reasonKey, 'not described for the checker')];
      out.set(r.elementId, result(r.elementId, 'coldFormed', 'cirsoc-303', rows));
    }
    if (run.errorKey) for (const c of cfs) if (!out.has(c.elementId)) out.set(c.elementId, result(c.elementId, 'coldFormed', 'cirsoc-303', [unsupported('cirsoc-303', 'A', run.errorKey, run.errorKey, 'checker unavailable')]));
  }
  results = out;
  return { checked: out.size };
}

/** Forget the results (a new analysis, a new project). */
export function clearMaterialChecks(): void { results = new Map(); }
