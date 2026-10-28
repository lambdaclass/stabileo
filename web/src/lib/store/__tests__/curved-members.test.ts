/**
 * A curved member as one piece:
 *  - drawn from its ends and a point, its segments read in order along the arc, s up to the arc's
 *    length;
 *  - a load along it keeps its total force on any number of segments, and its moment converges to
 *    the arc's;
 *  - remade with more segments it keeps its id, its section and its load, leaves no node behind and
 *    loads nothing twice; undo takes the remake back;
 *  - its forces read along it from start to end, with every segment's values;
 *  - copied, the copy is another arc with its own load; saved and opened, all of it comes back;
 *  - a member a plate's mesh cut reads as the whole member.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '..';
import { addCurveLoad, createArc, curveLoadDefs, piece, remakeArc, selectPiece } from '../curved-members';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { serializeProject, deserializeProject } from '../file';
import { pieceDiagram } from '../../model/curve-entity';
import { copyTransformed } from '../../model/edit/transformed-copy';
import { translation } from '../../model/edit/affine';
import { applyPlateMeshes, createPlate, planPlateMesh } from '../physical-plates';
import type { AnalysisResults3D } from '../../engine/types-3d';

const R = 5;
/** A quarter arch in the XZ plane, centre at the origin, from (R,0,0) up to (0,0,R), fixed at both ends. */
function arch(segments: number) {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
  const a = modelStore.addNode(R, 0, 0), b = modelStore.addNode(0, 0, R);
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
  const s = Math.SQRT1_2 * R;
  const made = createArc(a, { x: s, y: 0, z: s }, b, segments);
  expect(made.length).toBe(segments);
  return { a, b, made, arcId: modelStore.elements.get(made[0]!)!.arc!.id };
}

/** Vertical force and moment about the Y axis of the arc's defined loads (global, per metre of chord). */
function loadResultant(arcId: number) {
  syncDefinedLoadsForAnalysis();
  let fz = 0, my = 0;
  for (const l of modelStore.loads) {
    const d = l.data as { elementId?: number; frame?: string; qZI?: number; fromDef?: number };
    if (l.type !== 'distributed3d' || d.fromDef === undefined) continue;
    const e = modelStore.elements.get(d.elementId!)!;
    if (e.arc?.id !== arcId) continue;
    const ni = modelStore.nodes.get(e.nodeI)!, nj = modelStore.nodes.get(e.nodeJ)!;
    const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, (nj.z ?? 0) - (ni.z ?? 0));
    const F = (d.qZI ?? 0) * L;
    fz += F;
    my += -((ni.x + nj.x) / 2) * F;
  }
  return { fz, my };
}

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('a curved member as one piece', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('reads its segments in order along the arc', () => {
    const { a, b, made } = arch(8);
    const p = piece(made[5]!)!;
    expect(p.kind).toBe('arc');
    expect(p.segments.map((s) => s.elementId).sort()).toEqual([...made].sort());
    expect(p.start).toBe(a);
    expect(p.end).toBe(b);
    expect(p.length).toBeCloseTo((Math.PI / 2) * R, 9);
    for (let k = 1; k < p.segments.length; k++) expect(p.segments[k]!.s0).toBeGreaterThan(p.segments[k - 1]!.s0);
    // A click picks it whole, or one segment when asked.
    selectPiece(made[3]!);
    expect(uiStore.selectedElements.size).toBe(8);
    uiStore.memberPickScope = 'segment';
    selectPiece(made[3]!);
    expect([...uiStore.selectedElements]).toEqual([made[3]]);
    uiStore.memberPickScope = 'piece';
  });

  it('keeps the total force of a load along it, and its moment converges to the arc\'s', () => {
    const q = 2;
    const exactF = -q * (Math.PI / 2) * R;
    // ∫ x ds over the quarter = R², so the gravity load's moment about Y is q·R² (sign: −x·Fz).
    const exactM = q * R * R;
    const errs: number[] = [];
    for (const n of [4, 8, 32]) {
      const { arcId } = arch(n);
      addCurveLoad({ arcId, caseId: 1, q, dir: [0, 0, -1] });
      const r = loadResultant(arcId);
      expect(r.fz).toBeCloseTo(exactF, 6);
      errs.push(Math.abs(r.my - exactM) / exactM);
    }
    expect(errs[1]!).toBeLessThan(errs[0]!);
    expect(errs[2]!).toBeLessThan(0.002);
  });

  it('remakes with more segments keeping its id, section and load, nothing left behind', () => {
    const { arcId, made } = arch(8);
    modelStore.updateElement(made[0]!, { sectionId: 1 } as never);
    addCurveLoad({ arcId, caseId: 1, q: 3, dir: [0, 0, -1] });
    const nodes8 = modelStore.nodes.size;
    const r = remakeArc(arcId, { segments: 16 })!;
    expect(r.members).toHaveLength(16);
    expect(modelStore.nodes.size).toBe(nodes8 + 8);
    expect(r.members.every((id) => modelStore.elements.get(id)!.arc!.id === arcId)).toBe(true);
    expect(curveLoadDefs(arcId)).toHaveLength(1);
    const f = loadResultant(arcId).fz;
    expect(f).toBeCloseTo(-3 * (Math.PI / 2) * R, 6);
    const perSegment = modelStore.loads.filter((l) => l.type === 'distributed3d').map((l) => (l.data as { elementId: number }).elementId);
    expect(new Set(perSegment).size).toBe(perSegment.length);
    historyStore.undo();
    expect(piece(modelStore.elements.values().next().value!.id)!.segments).toHaveLength(8);
    expect(modelStore.nodes.size).toBe(nodes8);
  });

  it('reads its forces along it, from start to end', () => {
    const { arcId, made } = arch(12);
    addCurveLoad({ arcId, caseId: 1, q: 2, dir: [0, 0, -1] });
    syncDefinedLoadsForAnalysis();
    const res = modelStore.solve3D(false, false, true);
    expect(typeof res, String(res)).not.toBe('string');
    const forces = new Map((res as AnalysisResults3D).elementForces.map((f) => [f.elementId, f]));
    const p = piece(made[0]!)!;
    for (const k of ['axial', 'momentZ', 'momentY', 'shearY'] as const) {
      const st = pieceDiagram(p, forces, k)!;
      expect(st.length).toBeGreaterThan(12 * 2);
      expect(st[0]!.s).toBeCloseTo(0, 9);
      expect(st[st.length - 1]!.s).toBeCloseTo(p.length, 9);
      for (let i = 1; i < st.length; i++) expect(st[i]!.s).toBeGreaterThanOrEqual(st[i - 1]!.s - 1e-12);
    }
    // Each segment keeps its own end value at a joint (nothing is averaged across it). With no
    // point load there, the axial force differs between two chords only by the turn: about the
    // shear times the angle between them.
    const n = pieceDiagram(p, forces, 'axial')!, vy = pieceDiagram(p, forces, 'shearY')!, vz = pieceDiagram(p, forces, 'shearZ')!;
    const turn = (Math.PI / 2) / 12;
    for (let k = 1; k < p.segments.length; k++) {
      const s = p.segments[k]!.s0;
      const at = (st: typeof n) => st.filter((x) => Math.abs(x.s - s) < 1e-9).map((x) => x.value);
      const N = at(n), V = [...at(vy), ...at(vz)].map(Math.abs);
      expect(N.length).toBe(2);
      expect(Math.abs(N[0]! - N[1]!)).toBeLessThanOrEqual(1.2 * Math.max(...V) * Math.sin(turn) + 1e-6);
    }
  });

  it('copies as another arc with its own load, and opens again whole', () => {
    const { arcId, made } = arch(8);
    addCurveLoad({ arcId, caseId: 1, q: 1, dir: [0, 0, -1] });
    copyTransformed({ nodes: [], elements: made }, [translation([0, 10, 0])], { withLoads: true, withSupports: true });
    const ids = new Set([...modelStore.elements.values()].map((e) => e.arc!.id));
    expect(ids.size).toBe(2);
    const other = [...ids].find((i) => i !== arcId)!;
    expect(curveLoadDefs(other)).toHaveLength(1);
    expect(loadResultant(other).fz).toBeCloseTo(-(Math.PI / 2) * R, 6);
    expect(loadResultant(arcId).fz).toBeCloseTo(-(Math.PI / 2) * R, 6);
    const text = serializeProject();
    modelStore.clear();
    expect(deserializeProject(text)).toBe(true);
    expect(curveLoadDefs(arcId)).toHaveLength(1);
    expect(piece([...modelStore.elements.values()].find((e) => e.arc?.id === arcId)!.id)!.segments).toHaveLength(8);
  });

  it('reads a member a plate mesh cut as the whole member', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const c = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const b0 = modelStore.addNode(0, 2, 0), b1 = modelStore.addNode(4, 2, 0);
    const beam = modelStore.addElement(b0, b1);
    const { id } = createPlate({ outline: c, materialId: 1, thickness: 0.2 }) as { id: number };
    applyPlateMeshes([planPlateMesh(id, { size: 1, element: 'quad', followMembers: true })!]);
    const pieces = [...modelStore.elements.values()].filter((e) => Math.abs(modelStore.nodes.get(e.nodeI)!.y - 2) < 1e-9 && Math.abs(modelStore.nodes.get(e.nodeJ)!.y - 2) < 1e-9);
    expect(pieces.length).toBeGreaterThanOrEqual(4);
    const p = piece(pieces[2]!.id)!;
    expect(p.kind).toBe('chain');
    expect(p.segments).toHaveLength(pieces.length);
    expect(p.length).toBeCloseTo(4, 9);
    expect(modelStore.elements.has(beam) && pieces.length === 1).toBe(false);
  });
});
