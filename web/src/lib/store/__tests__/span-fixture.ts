/**
 * The building the per-span tests read, and what the documents print of it.
 *
 * Two bays of 6 m by one of 5 m, two storeys of 3 m, H-30, columns 30×30, beams 20×50, a
 * 0,15 m slab meshed at the size asked on both floors (none: no slab, the beams loaded along
 * their length with the slab's share). The same model as `design-per-span.test.ts`.
 *
 * The design checks every bar end in a column as the detailing builds it
 * (`end-support-anchorage.ts`): a 30 cm column leaves a top bar's hook 17,8 cm past its face (its
 * tail behind the column's Ø12 with §25.2.3's 40 mm, clear of the crossing beam's corner bars),
 * less than ℓdh of every bar the project admits at H-30 (Ø10: 18,4 cm), and none of the 14 spans
 * has an arrangement that anchors on the 1 m mesh (`design-anchorage-coherence.test.ts`). A test that designs and details the frame asks
 * for columns that hold the beams' hooks, `columnSide: 0.4`.
 */
import { expect } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { PHYSICAL_GROUP_KIND } from '../../model/physical/types';
import { bendingSchedule } from '../../sheets/plans/bending-schedule';
import { extractGoverningDemands, type ElementStationResult } from '../../engine/station-design-forces';
import { resolveDesignAxes } from '../../engine/design/design-axes';
import type { MemberContext } from '../../engine/design/member-context';
import type { DocumentModel } from '../../engine/detailing/document-model';
import type { StructuralGrid } from '../../model/grid';
import type { LateralRole } from '../../model/lateral-system';
import { setBeamsLateral } from '../lateral-system';
import { stateSuiteLateral } from './suite-lateral';

export const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 }, { id: 'C', name: 'C', axis: 'x', at: 12 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

/**
 * The building, solved. `lateral`: the beams' role in the lateral-force-resisting system the
 * project declares (§9.7.3.8.2); absent, the reading the suites on this fixture were written
 * under (`suite-lateral.ts`, outside the system); `null`, none declared.
 */
export function building(mesh: number | null, o: {
  columnSide?: number; lateral?: LateralRole | null;
  /** Tie each column's section to the slab as a rigid body (`tieColumnFootprints`): the reference joint. */
  footprint?: boolean;
  /** Multiply the beams' modulus (a material of their own), for the reference's stiffness study. */
  beamStiffness?: number;
} = {}): void {
  const side = o.columnSide ?? 0.3;
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); detailingStore.clear();
  designRunStore.resetMarks();
  uiStore.analysisMode = 'pro';
  if (o.lateral === undefined) stateSuiteLateral(); else if (o.lateral) setBeamsLateral(o.lateral);
  const mat = modelStore.addMaterial({ name: 'H-30', e: 27500, nu: 0.2, rho: 25, fy: 30, fc: 30 } as never);
  const cm = Math.round(side * 100);
  // Square: I = b⁴/12, Saint-Venant J ≈ 0,1406·b⁴ (the 30×30's J as it always was, to the digit).
  const j = cm === 30 ? 0.00114 : 0.1406 * side ** 4;
  const col = modelStore.addSection({ name: `Rect ${cm}x${cm} cm`, a: side * side, iy: side ** 4 / 12, iz: side ** 4 / 12, j, b: side, h: side, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: 'Rect 20x50 cm', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  const S = (s: number, m = mat) => ({ sectionId: s, materialId: m });
  // The section's inertias follow its b and h; a stiffer beam is a beam of a stiffer material.
  const beamMat = o.beamStiffness ? modelStore.addMaterial({ name: `H-30 ×${o.beamStiffness}`, e: 27500 * o.beamStiffness, nu: 0.2, rho: 25, fy: 30, fc: 30 } as never) : mat;
  placeFrame(grid, { x: ['A', 'C'], y: ['1', '2'], levels: ['N0', 'N2'], columns: S(col), beamsX: S(bm, beamMat), beamsY: S(bm, beamMat) }, { fixBase: true });
  if (mesh !== null) {
    placeSlabs(grid, { levels: ['N1', 'N2'], thickness: 0.15, materialId: mat, meshSize: mesh, typology: 'solid' });
    for (const q of modelStore.quads.values()) { modelStore.addSurfaceLoad3D(q.id, 1.5, 1); modelStore.addSurfaceLoad3D(q.id, 2, 2); }
  } else {
    for (const e of modelStore.elements.values()) {
      const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      if (Math.abs((a.z ?? 0) - (b.z ?? 0)) > 1e-6) continue;
      const w = Math.abs(a.x - 6) < 1e-6 && Math.abs(b.x - 6) < 1e-6 ? 5 : 2.5;
      modelStore.addDistributedLoad3D(e.id, 0, 0, -5.25 * w, -5.25 * w, undefined, undefined, 1, { frame: 'global' });
      modelStore.addDistributedLoad3D(e.id, 0, 0, -2 * w, -2 * w, undefined, undefined, 2, { frame: 'global' });
    }
  }
  if (o.footprint) tieColumnFootprints(side);
  const combo = modelStore.solveCombinations3D(true, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
}

/**
 * The reference idealisation of the slab-column joint, for tests only: every shell node inside
 * a column's section or on its faces, at a floor, follows the column's top node as a rigid body
 * (a `rigidLink` on all six DOFs, the engine's u_s = u_m + θ_m × r). The column then holds the
 * slab over its whole footprint, as a column of finite section does, instead of at one node.
 * Needs a mesh with nodes on the faces (a size dividing the half side). Returns the links made.
 */
export function tieColumnFootprints(side: number): number {
  const half = side / 2, eps = 1e-6;
  const shellNodes = new Set([...modelStore.quads.values()].flatMap((q) => q.nodes));
  let made = 0;
  for (const e of modelStore.elements.values()) {
    const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
    if (Math.abs(a.x - b.x) > eps || Math.abs(a.y - b.y) > eps) continue; // not a column
    for (const c of [a, b]) {
      if (!shellNodes.has(c.id)) continue;
      for (const id of shellNodes) {
        const n = modelStore.nodes.get(id)!;
        if (id === c.id || Math.abs((n.z ?? 0) - (c.z ?? 0)) > eps) continue;
        if (Math.abs(n.x - c.x) > half + eps || Math.abs(n.y - c.y) > half + eps) continue;
        if ((modelStore.model.constraints as Array<{ slaveNode?: number }>).some((k) => k.slaveNode === id)) continue;
        modelStore.addConstraint({ type: 'rigidLink', masterNode: c.id, slaveNode: id, dofs: [0, 1, 2, 3, 4, 5] });
        made++;
      }
    }
  }
  return made;
}

/** Design columns and beams, detail them and build the document the sheets print. */
export function designAndDocument(): DocumentModel {
  designRunStore.designFamilies(['column', 'beam']);
  const doc = detailingStore.buildDocument({ author: 'test', at: '2026-10-11T00:00:00Z' });
  expect(doc, 'document built').toBeTruthy();
  return doc!;
}

/**
 * Where a design member is, whatever the mesh: its two end points, `x,y,z>x,y,z`. A span reads
 * its start and end nodes, a member that is one element its own; the pieces' ids and the mesh
 * nodes between the ends are not in it.
 */
export function designPlace(c: MemberContext): string {
  const p = (id: number) => { const n = modelStore.nodes.get(id)!; return `${n.x},${n.y},${n.z ?? 0}`; };
  if (c.span) return `${p(c.span.start)}>${p(c.span.end)}`;
  const e = modelStore.elements.get(c.elementId)!;
  return `${p(e.nodeI)}>${p(e.nodeJ)}`;
}

/** What the design reads of the analysis for one member: its stations and slenderness factors. */
export interface PrescribedForces { stations: ElementStationResult; slenderDeltaNs: number; slenderDeltaS: number }

/**
 * The design forces of the building as solved, by place: every design member's stations (for a
 * span, merged along it: `design-spans.ts`) and its δns, δs, as `computeDemands` builds them.
 * `compute: false` reads the contexts the last design ran on instead of building them again.
 */
export function forcesByPlace(compute = true): Map<string, PrescribedForces> {
  if (compute) designRunStore.computeDemands();
  const out = new Map<string, PrescribedForces>();
  for (const c of verificationStore.contexts.values()) {
    if (!c.stations || out.has(designPlace(c))) continue;
    out.set(designPlace(c), { stations: structuredClone(c.stations), slenderDeltaNs: c.slenderDeltaNs, slenderDeltaS: c.slenderDeltaS });
  }
  return out;
}

/**
 * Design columns and beams, detail them and build the document, the design reading the forces
 * given instead of the solve's: each member's context is the one `computeDemands` builds for
 * this model (geometry, section, faces, flange, span), with the stations of the member at the
 * same place in `forces` — the same tuples at the same positions along it — and the demands and
 * axes derived from them as `buildAllMemberContexts` and `applySpanContexts` derive them. Then
 * the same steps as `designFamilies(['column', 'beam'])`: code check, design, detailing.
 */
export function designAndDocumentUnder(forces: ReadonlyMap<string, PrescribedForces>): DocumentModel {
  designRunStore.computeDemands();
  const next = new Map<number, MemberContext>();
  for (const [id, c] of verificationStore.contexts) {
    const f = forces.get(designPlace(c));
    expect(f, `forces for ${designPlace(c)}`).toBeTruthy();
    const stations: ElementStationResult = { ...structuredClone(f!.stations), elementId: c.stations!.elementId };
    const demands = extractGoverningDemands(stations);
    next.set(id, {
      ...c, stations, demands, axes: resolveDesignAxes(c.elementType, { b: c.section.b, h: c.section.h }, demands),
      slenderDeltaNs: f!.slenderDeltaNs, slenderDeltaS: f!.slenderDeltaS,
    });
  }
  verificationStore.setDemandData(next, verificationStore.orientationIssues);
  expect(designRunStore.runCodeCheck().ok).toBe(true);
  const ids = [...next.values()].filter((c) => c.elementType === 'beam' || c.elementType === 'column').map((c) => c.elementId);
  expect(designRunStore.autoDesign(ids, { deferDetailing: true }).ok).toBe(true);
  detailingStore.generate({});
  const doc = detailingStore.buildDocument({ author: 'test', at: '2026-10-11T00:00:00Z' });
  expect(doc, 'document built').toBeTruthy();
  return doc!;
}

export interface PhysicalBeam { id: string; name: string; elements: number[] }

/** The physical beams of the model, from the groups the building placed. */
export function physicalBeams(): PhysicalBeam[] {
  return [...modelStore.model.groups.values()]
    .filter((g) => g.kind === PHYSICAL_GROUP_KIND && (g.data as { kind?: string } | undefined)?.kind === 'beam')
    .map((g) => ({ id: String(g.id), name: g.name, elements: [...(g.members.elements ?? [])] }));
}

/** The X beam on axis 1 at level N1 (y = 0, z = 3): two spans of 6 m through column B. */
export function beamOnAxis1AtN1(): PhysicalBeam {
  const on = (id: number) => {
    const e = modelStore.elements.get(id)!; const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
    return [a, b].every((n) => Math.abs(n.y) < 1e-6 && Math.abs((n.z ?? 0) - 3) < 1e-6) && Math.abs(a.x - b.x) > 1e-6;
  };
  const found = physicalBeams().filter((b) => b.elements.length > 0 && b.elements.every(on));
  expect(found).toHaveLength(1);
  return found[0]!;
}

/** One row of the planilla de doblado as printed: every text cell but the figure. */
export interface PrintedRow { assembly: string; mark: string; dia: string; code: string; count: string; cut: string; total: string; mass: string }

/**
 * The bending schedule's rows read back off the drawing `bendingSchedule` produces — the same
 * function the sheet set calls (`work-drawings.ts`, kind `bbs`) — so they are what the document
 * prints, not a second computation of it. Each table's text cells are grouped by row (their
 * baseline) and by column (the table's column extents).
 */
export function printedSchedule(doc: DocumentModel): PrintedRow[] {
  const widths = [34, 14, 12, 72, 24, 14, 20, 22, 20];
  const xs = widths.reduce<number[]>((a, w) => [...a, a[a.length - 1]! + w], [0]);
  const out: PrintedRow[] = [];
  const fmt = (v: number, d: number) => v.toFixed(d);
  for (const d of bendingSchedule(doc, (k) => k, fmt)) {
    if (!/^bbs-\d+$/.test(d.key)) continue;
    const rows = new Map<number, Map<number, string>>();
    for (const p of d.primitives) {
      // Body cells are 2,5 high; the header is drawn 5 % taller and leg labels sit on RC-TEXT.
      if (p.kind !== 'text' || p.layer !== 'TB-TEXT' || p.height !== 2.5) continue;
      const col = xs.findIndex((x, j) => j < widths.length && p.at.x > x && p.at.x < xs[j + 1]!);
      const y = Math.round(p.at.y * 1000);
      const r = rows.get(y) ?? new Map<number, string>();
      r.set(col, p.text);
      rows.set(y, r);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const r = rows.get(y)!;
      if (!r.has(1)) continue; // a hook note under a figure, not a row of its own
      out.push({ assembly: r.get(0) ?? '', mark: r.get(1)!, dia: r.get(2)!, code: r.get(4)!, count: r.get(5)!, cut: r.get(6)!, total: r.get(7)!, mass: r.get(8)! });
    }
  }
  return out;
}

/** The name the schedule prints for an assembly (`bending-schedule.ts`). */
export const assemblyLabel = (id: string) => (id.length > 14 ? id.slice(-14) : id);
