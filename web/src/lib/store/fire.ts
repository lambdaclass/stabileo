/**
 * Fire resistance of the project's members, for the rating R the project states.
 *
 *  · Steel: each member checked by CIRSOC 301 gets its section factor Am/V (three or four sides,
 *    contour or box), its utilization in fire μ0 = (cold utilization) · ηfi, and the temperature
 *    it reaches at R, bare or under the protection the project states, against its critical
 *    temperature (`engine/design/fire/fire.ts`, EN 1993-1-2).
 *  · Concrete: beams, columns, slabs and walls against the minimum width and axis distance the
 *    project's fire table states for R (no fire chapter in CIRSOC 201).
 *  · Timber: the residual section after charring at the rate the project states, under the
 *    fire combination D + ψ·L.
 *
 * ηfi = (D + ψ·L) / max(1,4·D; 1,2·D + 1,6·L) on the member's governing force, its dead and live
 * parts read from the analysis by case; without results by case it is 1 (the safe side).
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { verificationStore } from './verification.svelte';
import { physicalGroups, physicalThickness } from './physical';
import { coverOf, designData, patchOwnDesignData } from './design-data';
import { extractForcesAtStation } from '../engine/station-forces';
import { steelUtilization } from '../engine/steel/steel-utilization';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import {
  axisDistance, concreteFireRows, sectionFactor, steelFireRows, timberFireRows,
  type ConcreteFireEntry, type ExposedSides, type FireProtection, type FireShape,
} from '../engine/design/fire/fire';
import { worstStatus, type CheckRow } from '../design-contract';
import type { FireSettings } from '../model/special-elements';

export type { FireSettings };

export const fireSettings = (): FireSettings => designData().fire ?? {};
export const patchFire = (p: Partial<FireSettings>) => patchOwnDesignData({ fire: { ...fireSettings(), ...p } });

const statusOf = (rows: readonly CheckRow[]) => (rows.length ? worstStatus(rows.map((r) => r.status)) : 'notVerified');

/** Largest |M|, |N| and |V| along a member in each result set of the cases of a type, summed per type. */
function caseForces(elementId: number): { dead: { m: number; n: number; v: number }; live: { m: number; n: number; v: number } } | null {
  if (!resultsStore.perCase3D.size) return null;
  const types = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type]));
  const out = { dead: { m: 0, n: 0, v: 0 }, live: { m: 0, n: 0, v: 0 } };
  for (const [id, r] of resultsStore.perCase3D) {
    const ef = r.elementForces.find((f) => f.elementId === elementId);
    if (!ef) continue;
    let m = 0, n = 0, v = 0;
    for (let i = 0; i <= 10; i++) {
      const s = extractForcesAtStation(ef, i / 10);
      m = Math.max(m, Math.abs(s.my), Math.abs(s.mz)); n = Math.max(n, Math.abs(s.n)); v = Math.max(v, Math.abs(s.vy), Math.abs(s.vz));
    }
    const t = types.get(id) ?? 'D';
    const into = t === 'D' || t === '' ? out.dead : t === 'L' || t === 'Lr' ? out.live : null;
    if (into) { into.m += m; into.n += n; into.v += v; }
  }
  return out;
}

/** ηfi on the force that governs it: the largest of the moment's and the axial force's. */
function etaFi(elementId: number, psi: number): number {
  const f = caseForces(elementId);
  if (!f) return 1;
  const eta = (d: number, l: number) => { const u = Math.max(1.4 * d, 1.2 * d + 1.6 * l); return u > 0 ? (d + psi * l) / u : 0; };
  return Math.max(eta(f.dead.m, f.live.m), eta(f.dead.n, f.live.n), eta(f.dead.v, f.live.v));
}

function fireShape(s: { shape?: string; h?: number; b?: number; tw?: number; tf?: number; a: number }): FireShape | null {
  const sh = (s.shape ?? '').toUpperCase();
  if ((sh === 'I' || sh === 'H') && s.h && s.b && s.tw && s.tf) return { kind: 'I', h: s.h, b: s.b, tw: s.tw, tf: s.tf, A: s.a } as FireShape;
  if (sh === 'RHS' && s.h && s.b) return { kind: 'rhs', h: s.h, b: s.b, A: s.a } as FireShape;
  if (sh === 'CHS' && (s.h || s.b)) return { kind: 'chs', D: (s.h ?? s.b)!, A: s.a } as FireShape;
  if (sh === 'RECT' && s.h && s.b) return { kind: 'rect', h: s.h, b: s.b } as FireShape;
  return null;
}

export interface FireCheck { id: string; family: 'steel' | 'concrete' | 'timber'; elementId?: number; groupId?: number; name: string; data: Array<[string, string]>; rows: CheckRow[]; status: CheckRow['status'] }

const isVertical = (id: number) => {
  const e = modelStore.elements.get(id); if (!e) return false;
  const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
  return !!a && !!b && Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0)) < 0.05;
};

export function fireChecks(): FireCheck[] {
  const fs = fireSettings(), R = fs.rMinutes;
  if (!R) return [];
  const psi = fs.psi ?? 0.5, out: FireCheck[] = [], dd = designData();
  // Steel: every member the CIRSOC 301 check reached.
  for (const v of verificationStore.steel) {
    const e = modelStore.elements.get(v.elementId), s = e ? modelStore.sections.get(e.sectionId) : undefined;
    if (!e || !s) continue;
    const shape = fireShape(s as never);
    if (!shape) { out.push({ id: `f${e.id}`, family: 'steel', elementId: e.id, name: `${e.id} · ${s.name}`, data: [], rows: [{ code: 'en-1993-1-2', clause: '4.2.5', title: 'Section factor', titleKey: 'check.fire.shape', formula: 'I, H, RHS, CHS or rectangle', inputs: [], ratio: null, status: 'unsupported' }], status: 'unsupported' }); continue; }
    const st = fs.steel ?? {};
    const amv = sectionFactor(shape, st.exposure ?? 4, st.method ?? 'contour');
    const eta = etaFi(e.id, psi), mu0 = Math.min(1, steelUtilization(v) * eta);
    const prot = st.protection;
    const rows = steelFireRows({ amv, mu0, rMinutes: R, ...(prot ? { protection: prot as FireProtection } : {}) });
    out.push({ id: `f${e.id}`, family: 'steel', elementId: e.id, name: `${e.id} · ${s.name}`, data: [['Am/V', `${amv.toFixed(1)} 1/m`], ['ηfi', eta.toFixed(3)], ['μ0', mu0.toFixed(3)]], rows, status: statusOf(rows) });
  }
  // Concrete members and timber members.
  const table: ConcreteFireEntry[] = fs.concreteTable ?? [];
  const minBar = Math.min(...(dd.longDiametersMm.length ? dd.longDiametersMm : [12]));
  for (const e of modelStore.elements.values()) {
    const mat = modelStore.materials.get(e.materialId), s = modelStore.sections.get(e.sectionId);
    if (!mat || !s) continue;
    const fam = materialFamilyOf(mat as never, catalogueGradeFamily).family;
    const vertical = isVertical(e.id);
    if (fam === 'concrete' && s.b && s.h) {
      const kind = vertical ? 'column' : 'beam';
      const a = axisDistance(coverOf(kind), dd.stirrupDiaMm, minBar);
      const rows = concreteFireRows({ kind, b: Math.min(s.b, s.h), a }, table, R);
      out.push({ id: `f${e.id}`, family: 'concrete', elementId: e.id, name: `${e.id} · ${s.name}`, data: [['b', `${(Math.min(s.b, s.h) * 1000).toFixed(0)} mm`], ['a', `${(a * 1000).toFixed(0)} mm`]], rows, status: statusOf(rows) });
    } else if (fam === 'timber' && s.b && s.h && fs.timber) {
      const ref = (mat as { timber?: { fb: number; fc: number; fv: number } }).timber;
      const f = caseForces(e.id);
      if (!ref || !f) { out.push({ id: `f${e.id}`, family: 'timber', elementId: e.id, name: `${e.id} · ${s.name}`, data: [], rows: [{ code: 'timber-fire', clause: '—', title: 'Fire combination', titleKey: 'check.fire.timberData', formula: 'reference values and results by case', inputs: [], ratio: null, status: 'notVerified' }], status: 'notVerified' }); continue; }
      const sides: ExposedSides = vertical ? { top: true, bottom: true, left: true, right: true } : { top: false, bottom: true, left: true, right: true };
      const comb = (d: number, l: number) => d + psi * l;
      const rows = timberFireRows({ b: s.b, h: s.h, sides, betaN: fs.timber.betaN, d0: fs.timber.d0, rMinutes: R, demand: { m: comb(f.dead.m, f.live.m), n: comb(f.dead.n, f.live.n), v: comb(f.dead.v, f.live.v) }, strengths: { fm: ref.fb, fc: ref.fc, fv: ref.fv }, kfi: fs.timber.kfi });
      out.push({ id: `f${e.id}`, family: 'timber', elementId: e.id, name: `${e.id} · ${s.name}`, data: [['βn', `${fs.timber.betaN} mm/min`]], rows, status: statusOf(rows) });
    }
  }
  // Concrete slabs and walls, from the physical elements.
  for (const g of physicalGroups()) {
    if (g.physical.kind !== 'slab' && g.physical.kind !== 'wall') continue;
    if (g.physical.kind === 'wall' && g.physical.typology === 'masonry') continue;
    const h = physicalThickness(g);
    if (!h) continue;
    const kind: 'slab' | 'wall' = g.physical.kind === 'slab' ? 'slab' : 'wall';
    const a = axisDistance(coverOf(kind), 0, minBar);
    const rows = concreteFireRows({ kind, b: h, a }, table, R);
    out.push({ id: `fg${g.id}`, family: 'concrete', groupId: g.id, name: g.name, data: [['h', `${(h * 1000).toFixed(0)} mm`], ['a', `${(a * 1000).toFixed(0)} mm`]], rows, status: statusOf(rows) });
  }
  return out;
}
