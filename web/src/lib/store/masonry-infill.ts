/**
 * Masonry walls and masonry infills, as the design reads them.
 *
 *  · Masonry walls: the physical walls declared `masonry`, each with the material and confining
 *    elements the person states, checked by INPRES-CIRSOC 103 Parte III (`confinedWallRows`) with
 *    the forces at the wall's base read from its shells in every active combination: the axial
 *    load (the least of them for the shear strength), the in-plane shear and moment, and the
 *    bending out of the plane.
 *  · Infills: a frame bay (two columns and the beam over them) filled with masonry, idealised by
 *    the equivalent diagonal strut. «Put the struts» adds two pin-ended diagonals to the model,
 *    each with half the strut's area (a linear analysis cannot drop the one in tension; together
 *    they give the bay the strut's stiffness), on a masonry material of its own with no weight
 *    (the wall's weight is already a load). Putting them again replaces them; one undo step.
 */
import { modelStore } from './model.svelte';
import { activePerCombo3D, activeResultSet3D } from './active-results';
import { physicalGroups, physicalThickness } from './physical';
import { patchSpecialElements, specialElements, statusOf } from './special-elements';
import { confinedWallRows, type ConfinedWallResult } from '../engine/design/masonry/confined-masonry';
import { infillRows, infillStrut, type InfillStrut } from '../engine/design/masonry/infill-strut';
import { extractForcesAtStation } from '../engine/station-forces';
import type { CheckRow } from '../design-contract';
import type { InfillEntry, MasonryChoice } from '../model/special-elements';

export type { InfillEntry, MasonryChoice };

// ─── Masonry walls ───

export interface MasonryWallCheck {
  key: string; groupId: number; name: string;
  L: number; H: number; t: number;
  forces: { nMin: number; vu: number; mu: number; nu: number; muOut: number } | null;
  choice: MasonryChoice | undefined; result: ConfinedWallResult | null;
  rows: CheckRow[]; status: CheckRow['status'];
}

type P3 = { x: number; y: number; z: number };

/** Length, height and base shells of a wall, with the unit vector along it on plan. */
function wallGeometry(quadIds: readonly number[]) {
  const quads = quadIds.map((id) => modelStore.quads.get(id)).filter(Boolean) as Array<{ id: number; nodes: number[]; thickness: number }>;
  const pts = (q: { nodes: number[] }): P3[] => q.nodes.map((n) => modelStore.nodes.get(n)!).filter(Boolean).map((n) => ({ x: n.x, y: n.y ?? 0, z: n.z ?? 0 }));
  const all = quads.flatMap(pts);
  if (all.length < 3) return null;
  const z0 = Math.min(...all.map((p) => p.z)), z1 = Math.max(...all.map((p) => p.z));
  let a = all[0]!, b = all[0]!, d = -1;
  for (const p of all) for (const q of all) { const e = Math.hypot(p.x - q.x, p.y - q.y); if (e > d) { d = e; a = p; b = q; } }
  const u = d > 0 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 };
  const along = (p: P3) => (p.x - a.x) * u.x + (p.y - a.y) * u.y;
  const base = quads.filter((q) => Math.abs(Math.min(...pts(q).map((p) => p.z)) - z0) < 1e-6);
  return { L: d, H: z1 - z0, base, pts, along, centre: d / 2 };
}

/** Forces at the wall's base in each active combination: P (compression +), in-plane V and M, out-of-plane m per metre. */
function wallBaseForces(g: NonNullable<ReturnType<typeof wallGeometry>>) {
  let sets = [...activePerCombo3D().values()];
  const single = sets.length === 0 ? activeResultSet3D() : null;
  if (single) sets = [single];
  const ids = new Set(g.base.map((q) => q.id));
  let nMin = Infinity, vu = 0, mu = 0, nu = 0, muOut = 0, found = false;
  for (const r of sets) {
    const st = new Map((r.quadStresses ?? []).filter((s) => ids.has(s.elementId)).map((s) => [s.elementId, s]));
    if (!st.size) continue;
    found = true;
    let p = 0, m = 0, v = 0;
    for (const q of g.base) {
      const s = st.get(q.id); if (!s) continue;
      const us = g.pts(q).map(g.along), w = Math.max(...us) - Math.min(...us), uc = us.reduce((a, x) => a + x, 0) / us.length;
      const f = -s.sigmaYy * q.thickness * w;
      p += f; m += f * (uc - g.centre); v += s.tauXy * q.thickness * w;
      muOut = Math.max(muOut, Math.abs(s.my));
    }
    nMin = Math.min(nMin, Math.max(0, p));
    if (Math.abs(v) > vu) vu = Math.abs(v);
    if (Math.abs(m) > mu) { mu = Math.abs(m); nu = Math.max(0, p); }
  }
  return found ? { nMin: Number.isFinite(nMin) ? nMin : 0, vu, mu, nu, muOut } : null;
}

export function masonryWallChecks(): MasonryWallCheck[] {
  const choices = specialElements().masonry ?? {}, out: MasonryWallCheck[] = [];
  for (const g of physicalGroups()) {
    if (g.physical.kind !== 'wall' || g.physical.typology !== 'masonry') continue;
    const key = `W${g.id}`, geo = wallGeometry(g.members.quads ?? []), t = physicalThickness(g);
    if (!geo || !t) continue;
    const choice = choices[key], forces = wallBaseForces(geo);
    if (!choice || !forces) {
      const rows: CheckRow[] = [{ code: 'inpres-cirsoc-103-iii', edition: '2018', clause: '2.3', title: 'Masonry', titleKey: !choice ? 'check.masonry.material' : 'check.masonry.demand', formula: !choice ? 'state the units, mortar and confining elements' : 'solve the model', inputs: [], ratio: null, status: 'notVerified' }];
      out.push({ key, groupId: g.id, name: g.name, L: geo.L, H: geo.H, t, forces, choice, result: null, rows, status: 'notVerified' });
      continue;
    }
    const result = confinedWallRows({ ...choice, L: geo.L, t, H: geo.H, nMin: forces.nMin, vu: forces.vu, mu: forces.mu, nu: forces.nu, ...(choice.muOut !== undefined ? { muOut: choice.muOut } : forces.muOut > 0 ? { muOut: forces.muOut } : {}) });
    out.push({ key, groupId: g.id, name: g.name, L: geo.L, H: geo.H, t, forces, choice, result, rows: result.rows, status: statusOf(result.rows) });
  }
  return out;
}

export function setMasonryChoice(key: string, c: MasonryChoice | null): void {
  const masonry = { ...(specialElements().masonry ?? {}) };
  if (c) masonry[key] = c; else delete masonry[key];
  patchSpecialElements({ masonry });
}

// ─── Infills ───

const node = (id: number) => { const n = modelStore.nodes.get(id)!; return { id, x: n.x, y: n.y ?? 0, z: n.z ?? 0 }; };

/** The bay's corners: each column's bottom and top node, the top ones on the beam's level. */
function bayOf(e: InfillEntry) {
  const cols = e.columns.map((id) => modelStore.elements.get(id));
  const beam = modelStore.elements.get(e.beam);
  if (cols.some((c) => !c) || !beam) return null;
  const ends = cols.map((c) => { const a = node(c!.nodeI), b = node(c!.nodeJ); return a.z <= b.z ? { bottom: a, top: b } : { bottom: b, top: a }; });
  const [c1, c2] = ends as [{ bottom: P3 & { id: number }; top: P3 & { id: number } }, { bottom: P3 & { id: number }; top: P3 & { id: number } }];
  const sb = modelStore.sections.get(beam.sectionId), sc = modelStore.sections.get(cols[0]!.sectionId), mc = modelStore.materials.get(cols[0]!.materialId);
  const hcol = c1.top.z - c1.bottom.z, span = Math.hypot(c2.bottom.x - c1.bottom.x, c2.bottom.y - c1.bottom.y);
  const hinf = hcol - (sb?.h ?? 0), linf = span - (sc?.h ?? sc?.b ?? 0);
  return { c1, c2, hcol, hinf, linf, ec: mc?.e ?? 25000, icol: Math.max(sc?.iy ?? 0, sc?.iz ?? 0) };
}

export interface InfillCheck { entry: InfillEntry; strut: InfillStrut | null; demand: number | null; rows: CheckRow[]; status: CheckRow['status'] }

export function infillChecks(): InfillCheck[] {
  return (specialElements().infills ?? []).map((entry) => {
    const bay = bayOf(entry);
    if (!bay || !(bay.hinf > 0) || !(bay.linf > 0)) return { entry, strut: null, demand: null, rows: [{ code: 'fema-356', clause: '7.5.2.1', title: 'Infill bay', titleKey: 'check.infill.bay', formula: 'two columns and the beam over them', inputs: [], ratio: null, status: 'unsupported' }], status: 'unsupported' };
    const strut = infillStrut({ hcol: bay.hcol, hinf: bay.hinf, linf: bay.linf, t: entry.t, Em: entry.em, Ec: bay.ec, Icol: bay.icol });
    // The compressed diagonal of the pair carries half the strut's force.
    let demand: number | null = null;
    if (entry.strutIds?.length) {
      let sets = [...activePerCombo3D().values()];
      const single = sets.length === 0 ? activeResultSet3D() : null;
      if (single) sets = [single];
      if (sets.length) {
        let c = 0;
        for (const r of sets) for (const id of entry.strutIds) { const ef = r.elementForces.find((f) => f.elementId === id); if (ef) c = Math.max(c, -extractForcesAtStation(ef, 0.5).n); }
        demand = 2 * Math.max(0, c);
      }
    }
    const rows = demand === null
      ? [{ code: 'fema-356', clause: '7.5.2.1', title: 'Strut force', titleKey: 'check.infill.demand', formula: 'put the struts in the model and solve', inputs: [], ratio: null, status: 'notVerified' } as CheckRow]
      : infillRows({ strut, t: entry.t, strength: entry.strength, demand });
    return { entry, strut, demand, rows, status: statusOf(rows) };
  });
}

/** Put a bay's two diagonals in the model, replacing the ones it had; the elements made. */
export function placeInfillStruts(id: string): number[] {
  const entry = (specialElements().infills ?? []).find((x) => x.id === id);
  const bay = entry ? bayOf(entry) : null;
  if (!entry || !bay) return [];
  const strut = infillStrut({ hcol: bay.hcol, hinf: bay.hinf, linf: bay.linf, t: entry.t, Em: entry.em, Ec: bay.ec, Icol: bay.icol });
  const made: number[] = []; let materialId = entry.materialId, sectionId = entry.sectionId;
  modelStore.batch(() => {
    for (const s of entry.strutIds ?? []) if (modelStore.elements.has(s)) modelStore.removeElement(s);
    if (!materialId || !modelStore.materials.has(materialId)) materialId = modelStore.addMaterial({ name: `Infill ${entry.name}`, e: entry.em, nu: 0.25, rho: 0 });
    else modelStore.updateMaterial(materialId, { e: entry.em });
    const sec = { name: `Strut ${entry.name}`, a: strut.area / 2, iz: 1e-8, iy: 1e-8, j: 1e-8, b: strut.width / 2, h: entry.t, shape: 'rect' as const };
    if (!sectionId || !modelStore.sections.has(sectionId)) sectionId = modelStore.addSection(sec as never);
    else modelStore.updateSection(sectionId, sec as never);
    for (const [a, b] of [[bay.c1.bottom.id, bay.c2.top.id], [bay.c2.bottom.id, bay.c1.top.id]] as const) {
      const el = modelStore.addElement(a, b, 'truss');
      modelStore.updateElement(el, { materialId: materialId!, sectionId: sectionId! });
      made.push(el);
    }
  });
  const infills = (specialElements().infills ?? []).map((x) => (x.id === id ? { ...x, strutIds: made, materialId: materialId!, sectionId: sectionId! } : x));
  patchSpecialElements({ infills });
  return made;
}

/** Take a bay's struts out of the model. */
export function removeInfillStruts(id: string): void {
  const entry = (specialElements().infills ?? []).find((x) => x.id === id);
  if (!entry?.strutIds?.length) return;
  modelStore.batch(() => { for (const s of entry.strutIds!) if (modelStore.elements.has(s)) modelStore.removeElement(s); });
  patchSpecialElements({ infills: (specialElements().infills ?? []).map((x) => (x.id === id ? { ...x, strutIds: [] } : x)) });
}
