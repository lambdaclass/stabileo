/**
 * Tubular truss joints and timber dowel-type connections, as the design reads them.
 *
 *  · Tubular joints: at a node the person names, the chord is the pair of collinear hollow
 *    sections with the larger area and the branches are the other hollow sections; the joint
 *    type follows from the geometry (one branch: T or Y by its angle; two on one side: K; two on
 *    opposite sides: X) unless stated. The forces are those of the combination that loads the
 *    branches most (the sum of their axial forces), the chord's on its side with the lower
 *    compression. Checked by AISC 360-10 chapter K (`hss-truss.ts`), the base of CIRSOC 301.
 *  · Timber connections: the fastener and the members' bearing values the person states, and the
 *    force, stated or read from a member's largest axial force; NDS 12.3 (`timber-dowel.ts`).
 */
import { modelStore } from './model.svelte';
import { activePerCombo3D, activeResultSet3D } from './active-results';
import { envelopeAt, specialElements, statusOf } from './special-elements';
import { gradeById } from '../data/structural-grades';
import { extractForcesAtStation } from '../engine/station-forces';
import { hssTrussRows, type HssBranch, type HssJoint, type HssTrussInput } from '../engine/design/connections/hss-truss';
import { timberConnectionRows } from '../engine/design/connections/timber-dowel';
import type { CheckRow } from '../design-contract';
import type { DowelEntry, HssJointEntry } from '../model/special-elements';

export type { DowelEntry, HssJointEntry };

type V = { x: number; y: number; z: number };
const pos = (id: number): V => { const n = modelStore.nodes.get(id)!; return { x: n.x, y: n.y ?? 0, z: n.z ?? 0 }; };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: V) => Math.hypot(a.x, a.y, a.z);
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

const hollow = (sectionId: number) => { const s = modelStore.sections.get(sectionId); const k = (s?.shape ?? '').toUpperCase(); return s && (k === 'RHS' || k === 'CHS') ? s : null; };

function memberOf(elementId: number): { shape: 'round' | 'rect'; m: HssBranch | (HssTrussInput['chord']) } | null {
  const e = modelStore.elements.get(elementId), s = e ? hollow(e.sectionId) : null;
  if (!e || !s || !s.t) return null;
  const mat = modelStore.materials.get(e.materialId) as { fy?: number; fu?: number; gradeId?: string } | undefined;
  const Fy = mat?.fy ?? 240, Fu = (mat?.gradeId ? gradeById(mat.gradeId)?.fu : undefined) ?? mat?.fu ?? 370;
  const round = (s.shape ?? '').toUpperCase() === 'CHS';
  const base = { t: s.t * 1000, Fy, Fu };
  return round ? { shape: 'round', m: { ...base, D: (s.h ?? s.b ?? 0) * 1000 } as never } : { shape: 'rect', m: { ...base, B: (s.b ?? 0) * 1000, H: (s.h ?? 0) * 1000 } as never };
}

export interface HssJointCheck { entry: HssJointEntry; joint: HssJoint | null; input: HssTrussInput | null; rows: CheckRow[]; status: CheckRow['status'] }

/** The joint at a node: chord, branches with their angles, and the type the geometry gives. */
export function hssJointGeometry(nodeId: number): { chord: [number, number]; branches: Array<{ elementId: number; theta: number; side: number }>; joint: HssJoint } | null {
  const at = [...modelStore.elements.values()].filter((e) => (e.nodeI === nodeId || e.nodeJ === nodeId) && hollow(e.sectionId));
  if (at.length < 2) return null;
  const dirOf = (id: number) => { const e = modelStore.elements.get(id)!; const far = e.nodeI === nodeId ? e.nodeJ : e.nodeI; const d = sub(pos(far), pos(nodeId)); const l = len(d) || 1; return { x: d.x / l, y: d.y / l, z: d.z / l }; };
  let chord: [number, number] | null = null, best = -1;
  for (const a of at) for (const b of at) {
    if (a.id >= b.id || dot(dirOf(a.id), dirOf(b.id)) > -0.999) continue;
    const area = (modelStore.sections.get(a.sectionId)?.a ?? 0) + (modelStore.sections.get(b.sectionId)?.a ?? 0);
    if (area > best) { best = area; chord = [a.id, b.id]; }
  }
  if (!chord) return null;
  const axis = dirOf(chord[0]);
  const rest = at.filter((e) => !chord!.includes(e.id));
  if (!rest.length) return null;
  const ref = cross(axis, dirOf(rest[0]!.id));
  const branches = rest.map((e) => {
    const d = dirOf(e.id), c = Math.abs(dot(d, axis));
    const theta = (Math.acos(Math.min(1, c)) * 180) / Math.PI;
    // Which side of the chord: the sign of the branch's component across it, in the joint's plane.
    const across = cross(ref, axis), side = Math.sign(dot(d, across)) || 1;
    return { elementId: e.id, theta, side };
  });
  const joint: HssJoint = branches.length === 1 ? (Math.abs(branches[0]!.theta - 90) < 5 ? 'T' : 'Y') : branches.every((b) => b.side === branches[0]!.side) ? 'K' : 'X';
  return { chord, branches, joint };
}

/** Axial force at the node end of a member in one result set, kN (+ tension). */
const axialAt = (r: ReturnType<typeof activePerCombo3D> extends Map<number, infer R> ? R : never, elementId: number, nodeId: number) => {
  const e = modelStore.elements.get(elementId)!, ef = r.elementForces.find((f) => f.elementId === elementId);
  return ef ? extractForcesAtStation(ef, e.nodeI === nodeId ? 0 : 1).n : 0;
};

export function hssJointChecks(): HssJointCheck[] {
  let sets = [...activePerCombo3D().values()];
  const single = sets.length === 0 ? activeResultSet3D() : null;
  if (single) sets = [single];
  return (specialElements().hss ?? []).map((entry) => {
    const g = hssJointGeometry(entry.nodeId);
    const chordM = g ? memberOf(g.chord[0]) : null;
    if (!g || !chordM || !sets.length) {
      const rows: CheckRow[] = [{ code: 'aisc-360', edition: '2010', clause: 'K2', title: 'Tubular joint', titleKey: 'check.hss.geometry', formula: !g || !chordM ? 'a hollow chord and hollow branches at the node' : 'solve the model', inputs: [], ratio: null, status: 'notVerified' }];
      return { entry, joint: g?.joint ?? null, input: null, rows, status: 'notVerified' };
    }
    // The combination that loads the branches most.
    let gov = sets[0]!, most = -1;
    for (const r of sets) { const s = g.branches.reduce((a, b) => a + Math.abs(axialAt(r, b.elementId, entry.nodeId)), 0); if (s > most) { most = s; gov = r; } }
    const branches = g.branches.map((b) => { const m = memberOf(b.elementId); return m ? { ...(m.m as HssBranch), theta: b.theta, P: axialAt(gov, b.elementId, entry.nodeId) } : null; }).filter((b): b is HssBranch => !!b);
    const chordP = Math.max(...g.chord.map((id) => axialAt(gov, id, entry.nodeId)));
    const joint = entry.joint ?? g.joint;
    const input: HssTrussInput = { joint, shape: chordM.shape, chord: chordM.m as HssTrussInput['chord'], branches, chordForce: { P: chordP },
      ...(entry.gap !== undefined ? { gap: entry.gap } : {}), ...(entry.e !== undefined ? { e: entry.e } : {}) };
    const rows = hssTrussRows(input);
    return { entry, joint, input, rows, status: statusOf(rows) };
  });
}

// ─── Timber connections ───

export interface DowelCheck { entry: DowelEntry; demand: number | null; rows: CheckRow[]; status: CheckRow['status'] }

export function dowelChecks(): DowelCheck[] {
  return (specialElements().dowels ?? []).map((entry) => {
    let demand = entry.demand ?? null;
    if (entry.from) { let n = 0; for (const t of [0, 0.5, 1]) n = Math.max(n, envelopeAt(entry.from.elementId, t)?.n ?? 0); demand = n; }
    if (demand === null) return { entry, demand, rows: [{ code: 'nds', clause: '12.3', title: 'Connection force', titleKey: 'check.dowel.demand', formula: 'state the force or the member', inputs: [], ratio: null, status: 'notVerified' } as CheckRow], status: 'notVerified' as const };
    const { id: _i, name: _n, from: _f, demand: _d, ...dowel } = entry;
    const rows = timberConnectionRows({ ...dowel, demand });
    return { entry, demand, rows, status: statusOf(rows) };
  });
}
