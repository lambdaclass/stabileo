/**
 * The particular concrete elements of the project, as the design reads them:
 *
 *  · corbels (CIRSOC 201-2025 16.5), stated by the person, their shear read from the end of the
 *    beam they carry when one is named;
 *  · coupling beams (INPRES-CIRSOC 103 Parte II 3.8.1): the beams of the model whose both ends
 *    land on walls, found from the geometry, with the shear of the analysis;
 *  · openings through beam webs, checked by the chords above and below them at the moment and
 *    shear the analysis gives where the opening is.
 *
 * The forces are the envelope over the active combinations: the largest moment and the largest
 * shear about either local axis, taken together (the safe side). The design data holds what the
 * person states (`model/special-elements.ts`).
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { activePerCombo3D } from './active-results';
import { physicalGroups } from './physical';
import { coverOf, designData, patchOwnDesignData } from './design-data';
import { concreteFc } from '../model/design-data';
import { extractForcesAtStation } from '../engine/station-forces';
import { corbelDesign, type CorbelDesign } from '../engine/design/special/corbel';
import { couplingBeamDesign, type CouplingBeamDesign } from '../engine/design/special/coupling-beam';
import { beamOpeningDesign, type BeamOpeningDesign } from '../engine/design/special/beam-opening';
import { worstStatus, type CheckRow } from '../design-contract';
import type { CorbelEntry, CouplingChoice, OpeningEntry, SpecialElementsData } from '../model/special-elements';

export type { CorbelEntry, CouplingChoice, OpeningEntry, SpecialElementsData };

export const specialElements = (): SpecialElementsData => designData().specialElements ?? {};
export const patchSpecialElements = (p: Partial<SpecialElementsData>) => patchOwnDesignData({ specialElements: { ...specialElements(), ...p } });
export const statusOf = (rows: readonly CheckRow[]) => (rows.length ? worstStatus(rows.map((r) => r.status)) : 'notVerified');

/** Save or replace an entry of one of the lists, by id. */
export function saveEntry<K extends 'corbels' | 'openings' | 'infills' | 'hss' | 'dowels'>(key: K, e: NonNullable<SpecialElementsData[K]>[number]): void {
  const list = (specialElements()[key] ?? []) as Array<{ id: string }>;
  patchSpecialElements({ [key]: [...list.filter((x) => x.id !== (e as { id: string }).id), e] } as Partial<SpecialElementsData>);
}
export function removeEntry(key: 'corbels' | 'openings' | 'infills' | 'hss' | 'dowels', id: string): void {
  const list = (specialElements()[key] ?? []) as Array<{ id: string }>;
  patchSpecialElements({ [key]: list.filter((x) => x.id !== id) } as Partial<SpecialElementsData>);
}

/** Largest |M|, |V| and |N| at a station of a member over the active combinations (or the single solve). */
export function envelopeAt(elementId: number, t: number): { m: number; v: number; n: number } | null {
  let sets = [...activePerCombo3D().values()];
  if (!sets.length && resultsStore.results3D) sets = [resultsStore.results3D];
  let m = 0, v = 0, n = 0, found = false;
  for (const r of sets) {
    const ef = r.elementForces.find((f) => f.elementId === elementId);
    if (!ef) continue;
    found = true;
    const s = extractForcesAtStation(ef, Math.min(Math.max(t, 0), 1));
    m = Math.max(m, Math.abs(s.my), Math.abs(s.mz)); v = Math.max(v, Math.abs(s.vy), Math.abs(s.vz)); n = Math.max(n, Math.abs(s.n));
  }
  return found ? { m, v, n } : null;
}

/** Shear at a member's end from the dead cases alone, unfactored, kN. */
function deadShearAt(elementId: number, t: number): number | undefined {
  const dead = new Set(modelStore.model.loadCases.filter((c) => c.type === 'D' || c.type === '').map((c) => c.id));
  let v = 0, found = false;
  for (const [id, r] of resultsStore.perCase3D) {
    if (!dead.has(id)) continue;
    const ef = r.elementForces.find((f) => f.elementId === elementId);
    if (!ef) continue;
    const s = extractForcesAtStation(ef, t);
    v += Math.max(Math.abs(s.vy), Math.abs(s.vz)); found = true;
  }
  return found ? v : undefined;
}

const lengthOf = (elementId: number) => {
  const e = modelStore.elements.get(elementId); if (!e) return 0;
  const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
  return a && b ? Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), (b.z ?? 0) - (a.z ?? 0)) : 0;
};
const concreteOf = (elementId: number) => {
  const e = modelStore.elements.get(elementId), m = e ? modelStore.materials.get(e.materialId) : undefined;
  return (m ? concreteFc(m) : undefined) ?? 25;
};
/** Effective depth of a beam: its depth less cover, stirrup and half the smallest longitudinal bar. */
const depthOf = (h: number) => { const dd = designData(); return h - coverOf('beam') - dd.stirrupDiaMm / 1000 - Math.min(...dd.longDiametersMm, 16) / 2000; };

// ─── Corbels ───

export interface CorbelCheck { entry: CorbelEntry; design: CorbelDesign | null; vu: number | null; rows: CheckRow[]; status: CheckRow['status'] }

export function corbelChecks(): CorbelCheck[] {
  const fy = designData().rebarFy;
  return (specialElements().corbels ?? []).map((entry) => {
    const t = entry.from?.end === 'j' ? 1 : 0;
    const read = entry.from ? envelopeAt(entry.from.elementId, t) : null;
    const vu = read ? read.v : entry.vu ?? null;
    if (vu === null) {
      const rows: CheckRow[] = [{ code: 'cirsoc-201', edition: '2025', clause: '16.5', title: 'Corbel shear', titleKey: 'check.corbel.demand', formula: 'state Vu or the beam it carries', inputs: [], ratio: null, status: 'notVerified' }];
      return { entry, design: null, vu: null, rows, status: 'notVerified' };
    }
    const sustained = entry.from ? deadShearAt(entry.from.elementId, t) : entry.sustained;
    const fc = entry.from ? concreteOf(entry.from.elementId) : (() => { for (const m of modelStore.materials.values()) { const f = concreteFc(m); if (f) return f; } return 25; })();
    const design = corbelDesign({ bw: entry.bw, h: entry.h, d: entry.d, av: entry.av, Vu: vu, fc, fy, monolithic: entry.monolithic,
      ...(entry.nuc !== undefined ? { Nuc: entry.nuc } : {}), ...(sustained !== undefined ? { sustained } : {}), ...(entry.hEdge ? { hEdge: entry.hEdge } : {}),
      ...(entry.ascProvided ? { ascProvided: entry.ascProvided } : {}), ...(entry.ahProvided ? { ahProvided: entry.ahProvided } : {}) });
    return { entry, design, vu, rows: design.rows, status: statusOf(design.rows) };
  });
}

// ─── Coupling beams ───

/** The concrete walls: the nodes of each one's shells, and its extent (box of its points), by group. */
function concreteWalls(): Array<{ nodes: Set<number>; box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } }> {
  const out: Array<{ nodes: Set<number>; box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } }> = [];
  for (const g of physicalGroups()) {
    if (g.physical.kind !== 'wall' || g.physical.typology === 'masonry') continue;
    const nodes = new Set<number>();
    for (const q of g.members.quads ?? []) for (const n of modelStore.quads.get(q)?.nodes ?? []) nodes.add(n);
    const ps = [...nodes].map((n) => modelStore.nodes.get(n)!).filter(Boolean);
    if (!ps.length) continue;
    const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y ?? 0), zs = ps.map((p) => p.z ?? 0);
    out.push({ nodes, box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: Math.min(...zs), z1: Math.max(...zs) } });
  }
  return out;
}

export interface CouplingCheck { elementId: number; ln: number; h: number; bw: number; vu: number | null; design: CouplingBeamDesign | null; rows: CheckRow[]; status: CheckRow['status']; choice: CouplingChoice | undefined }

/**
 * The coupling beams: level beams from one wall to another, with their middle outside every wall
 * (a beam cast inside a wall, along its length, joins its own nodes and is not one).
 */
export function couplingCandidates(): number[] {
  const walls = concreteWalls();
  if (walls.length < 2) return [];
  const tol = 1e-6;
  const inside = (p: { x: number; y: number; z: number }) => walls.some(({ box: b }) => p.x > b.x0 - tol && p.x < b.x1 + tol && p.y > b.y0 - tol && p.y < b.y1 + tol && p.z > b.z0 - tol && p.z < b.z1 + tol);
  return [...modelStore.elements.values()].filter((e) => {
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    if (e.type === 'truss' || !a || !b || Math.abs((a.z ?? 0) - (b.z ?? 0)) > 0.05) return false;
    const onA = walls.filter((w) => w.nodes.has(e.nodeI)), onB = walls.filter((w) => w.nodes.has(e.nodeJ));
    if (!onA.length || !onB.length || onA.some((w) => onB.includes(w))) return false;
    return !inside({ x: (a.x + b.x) / 2, y: ((a.y ?? 0) + (b.y ?? 0)) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 });
  }).map((e) => e.id).sort((p, q) => p - q);
}

export function couplingChecks(): CouplingCheck[] {
  const choices = specialElements().coupling ?? {}, fy = designData().rebarFy;
  return couplingCandidates().filter((id) => !choices[String(id)]?.excluded).map((elementId) => {
    const e = modelStore.elements.get(elementId)!, s = modelStore.sections.get(e.sectionId), choice = choices[String(elementId)];
    const h = s?.h ?? 0, bw = s?.b ?? 0, ln = lengthOf(elementId);
    let vu = 0, found = false;
    for (const t of [0, 0.5, 1]) { const r = envelopeAt(elementId, t); if (r) { vu = Math.max(vu, r.v); found = true; } }
    if (!found || !h || !bw) {
      const rows: CheckRow[] = [{ code: 'inpres-cirsoc-103-ii', edition: '2005', clause: '3.8.1', title: 'Coupling beam', titleKey: 'check.coupling.demand', formula: !h || !bw ? 'rectangular section' : 'solve the model', inputs: [], ratio: null, status: 'notVerified' }];
      return { elementId, ln, h, bw, vu: null, design: null, rows, status: 'notVerified', choice };
    }
    const design = couplingBeamDesign({ ln, h, bw, d: depthOf(h), Vu: vu, fc: concreteOf(elementId), fy,
      ...(choice?.alphaDeg ? { alphaDeg: choice.alphaDeg } : {}), ...(choice?.barDia ? { barDia: choice.barDia } : {}), ...(choice?.ashProvided ? { ashProvided: choice.ashProvided } : {}) });
    return { elementId, ln, h, bw, vu, design, rows: design.rows, status: statusOf(design.rows), choice };
  });
}

export function setCouplingChoice(elementId: number, c: CouplingChoice | null): void {
  const coupling = { ...(specialElements().coupling ?? {}) };
  if (c) coupling[String(elementId)] = c; else delete coupling[String(elementId)];
  patchSpecialElements({ coupling });
}

// ─── Openings in beams ───

export interface OpeningCheck { entry: OpeningEntry; mu: number | null; vu: number | null; design: BeamOpeningDesign | null; rows: CheckRow[]; status: CheckRow['status'] }

export function openingChecks(): OpeningCheck[] {
  const dd = designData();
  return (specialElements().openings ?? []).map((entry) => {
    const e = modelStore.elements.get(entry.elementId), s = e ? modelStore.sections.get(e.sectionId) : undefined, L = lengthOf(entry.elementId);
    const read = L > 0 ? envelopeAt(entry.elementId, entry.x / L) : null;
    if (!e || !s?.b || !s.h || !read) {
      const rows: CheckRow[] = [{ code: 'cirsoc-201', edition: '2025', clause: '22.5', title: 'Opening', titleKey: 'check.opening.demand', formula: !s?.b || !s?.h ? 'rectangular concrete beam' : 'solve the model', inputs: [], ratio: null, status: 'notVerified' }];
      return { entry, mu: null, vu: null, design: null, rows, status: 'notVerified' };
    }
    const design = beamOpeningDesign({ b: s.b, h: s.h, cover: coverOf('beam'), stirrupDia: dd.stirrupDiaMm, barDia: Math.min(...dd.longDiametersMm, 16), fc: concreteOf(entry.elementId), fy: dd.rebarFy,
      x: entry.x, lo: entry.lo, ho: entry.ho, ...(entry.offset ? { offset: entry.offset } : {}), Mu: read.m, Vu: read.v });
    return { entry, mu: read.m, vu: read.v, design, rows: design.rows, status: statusOf(design.rows) };
  });
}
