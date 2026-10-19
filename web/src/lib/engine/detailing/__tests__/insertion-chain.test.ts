/**
 * A member's insertion, carried from the model through every stage that reads the member.
 *
 * The model can say where a member's axis is relative to its nodes: `Element.offset`, written by
 * the grid tool's column fixed point and beam alignment, the CAD import's flush beams and the
 * offset editor. The analysis honours it (helper nodes and rigid eccentric arms,
 * `member-offsets.ts`). Every stage after the analysis used to read the member off its nodes, as
 * if the model said nothing: the detailing's convention was "the node is the member's centroidal
 * axis", whatever the model declared. So a top-flush beam (its axis h/2 under the node, as a beam
 * flush with the slab top is modelled) was solved h/2 down and reinforced h/2 up, its top bars
 * above the slab it is flush with, and a column placed by its corner was solved half a side off
 * the node and caged on it.
 *
 * Each link is asserted with numbers, on qa-8 (four 40×40 columns, four 30×55 beams at
 * z = 3,2 m) in three versions: as committed (no insertion — the centroidal reading, assumed and
 * said), every beam top-flush (offset z = −0,275 m), and column 1 placed by its corner
 * (offset +0,2 m in x and y). The centred version is the regression guard: nothing moves.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import frame from '../../../templates/fixtures/rc-design-qa-8.json';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { modelFromFixture, solveFixture } from '../../design/__tests__/helpers';
import { supportInputOf } from '../../design/end-support-anchorage';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import { membersFromModel } from '../member-geometry';
import { buildSolverInput3D, validateAndSolve3D } from '../../solver-service';
import { resolveOffsetWorldVectors } from '../../member-offsets';
import { createElementGroup } from '../../../three/create-element-mesh';
import type { BarPath } from '../../../codes/cirsoc201/bar-geometry';

type Variant = 'centred' | 'topFlush' | 'columnCorner';
const E = 0.275;   // half the beams' depth
const TOP = 3.2;   // the beams' nodes

function fixtureOf(v: Variant) {
  const f = JSON.parse(JSON.stringify(frame));
  if (v === 'topFlush') {
    for (const e of f.elements) if (e.sectionId === 2) e.offset = { frame: 'global', i: { x: 0, y: 0, z: -E }, j: { x: 0, y: 0, z: -E } };
  }
  if (v === 'columnCorner') {
    const c = f.elements.find((e: { id: number }) => e.id === 1);
    c.offset = { frame: 'global', i: { x: 0.2, y: 0.2, z: 0 }, j: { x: 0.2, y: 0.2, z: 0 } };
  }
  return f;
}

const cache = new Map<Variant, ReturnType<typeof run>>();
function run(v: Variant) {
  const solved = solveFixture(fixtureOf(v));
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  const r: RunDetailingResult = runDetailing({
    contexts: solved.contexts, outcomes: summary.outcomes,
    nodes: solved.data.nodes as never, elements: solved.data.elements as never,
    sections: solved.data.sections as never,
    edition: '2025', maxAggregateSizeMm: 19, verifierId: 'cirsoc201.provided.v2.2025', demandRevision: 1,
  });
  return { solved, summary, r };
}
const chain = (v: Variant) => { if (!cache.has(v)) cache.set(v, run(v)); return cache.get(v)!; };

const bars = (r: RunDetailingResult) => r.assemblies.flatMap((a) => a.bars);
/** The straight runs of a beam's longitudinal bars: the body each one is. */
const beamRuns = (r: RunDetailingResult, id: number) => bars(r)
  .filter((b) => b.role === 'longitudinal' && b.ownerElementIds.includes(id) && !b.ownerElementIds.some((o) => o <= 4))
  .map((b) => b.segments.filter((s) => s.kind === 'straight').sort((p, q) => q.length - p.length)[0]!);
const zsOf = (bs: readonly BarPath[]) => bs.flatMap((b) => b.segments.flatMap((s) => [s.start.z, s.end.z]));

describe('analysis: the eccentricity reaches the engine (hand calc)', () => {
  /**
   * A 6 m cantilever, fixed at node 1, an axial 100 kN at node 2, its axis declared 0,275 m under
   * both nodes. Both ends hang on rigid arms, so the force acts e above the axis at the tip and is
   * reacted e above it at the root: N = 100 kN and a constant moment P·e = 27,5 kN·m along the
   * member, nothing at the support. Centred, the moment is zero.
   */
  const cantilever = (offset: boolean) => {
    const f = {
      name: 'cantilever', materials: frame.materials, sections: [frame.sections[1]],
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 6, y: 0, z: 0 }],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 2, hingeStart: false, hingeEnd: false,
        ...(offset ? { offset: { frame: 'global', i: { x: 0, y: 0, z: -E }, j: { x: 0, y: 0, z: -E } } } : {}) }],
      supports: [{ id: 1, nodeId: 1, type: 'fixed3d' }],
      loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 2, fx: 100, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }],
    };
    return modelFromFixture(f).model;
  };

  it('the solver input carries a rigid arm per offset end, at the declared vector', () => {
    const input = buildSolverInput3D(cantilever(true), false, false)!;
    const arms = (input.constraints ?? []).filter((c: { type: string }) => c.type === 'eccentricConnection') as unknown as Array<{ offsetX: number; offsetY: number; offsetZ: number }>;
    expect(arms.map((a) => [a.offsetX, a.offsetY, a.offsetZ])).toEqual([[0, 0, -E], [0, 0, -E]]);
    expect(buildSolverInput3D(cantilever(false), false, false)!.constraints ?? []).toEqual([]);
  });

  it('N = P and M = P·e along the member; zero moment when centred', () => {
    const ecc = validateAndSolve3D(cantilever(true), false, false) as Exclude<ReturnType<typeof validateAndSolve3D>, string | null>;
    const cen = validateAndSolve3D(cantilever(false), false, false) as Exclude<ReturnType<typeof validateAndSolve3D>, string | null>;
    const fe = ecc.elementForces.find((x) => x.elementId === 1)!;
    const fc = cen.elementForces.find((x) => x.elementId === 1)!;
    expect(Math.abs(fe.nStart)).toBeCloseTo(100, 6);
    expect(Math.abs(fe.myStart)).toBeCloseTo(100 * E, 4);
    expect(Math.abs(fe.myEnd)).toBeCloseTo(100 * E, 4);
    expect(Math.abs(fc.myStart)).toBeLessThan(1e-6);
    // The support sees the force on its own line: no moment reaction either way.
    const rx = ecc.reactions.find((x) => x.nodeId === 1)!;
    expect(Math.abs(rx.my)).toBeLessThan(1e-6);
    expect(rx.fx).toBeCloseTo(-100, 6);
  });
});

describe('qa-8: centred, top-flush beams, a column placed by its corner', () => {
  it('runs the whole chain in every version, with the same design outcomes', () => {
    const kinds = (v: Variant) => [...chain(v).summary.outcomes].map(([id, o]) => `${id}:${o.outcome}`);
    // Beam 7 and column 1, which the links below read, are designed in every version, and the
    // insertions change no member's outcome.
    for (const v of ['centred', 'topFlush', 'columnCorner'] as const) {
      expect(kinds(v), v).toContain('7:VERIFIED');
      expect(kinds(v), v).toContain('1:VERIFIED');
      expect(kinds(v), v).toEqual(kinds('centred'));
    }
  }, 600_000);

  it('solids: the concrete stands on the axis the analysis used', () => {
    const box = (v: Variant, id: number) => {
      const { solved } = chain(v);
      const m = membersFromModel({
        elementIds: [id], nodes: [...solved.data.nodes.values()] as never,
        elements: [...solved.data.elements.values()] as never, sections: [...solved.data.sections.values()] as never,
      }).members[0]!;
      return { zLo: m.start.z - m.depth / 2, zHi: m.start.z + m.depth / 2, x: m.start.x, y: m.start.y };
    };
    // Beam 7 (along y at x = 0): centred about the node, or hanging under it, flush with it.
    expect(box('centred', 7).zLo).toBeCloseTo(TOP - E, 9);
    expect(box('centred', 7).zHi).toBeCloseTo(TOP + E, 9);
    expect(box('topFlush', 7).zLo).toBeCloseTo(TOP - 2 * E, 9);
    expect(box('topFlush', 7).zHi).toBeCloseTo(TOP, 9);
    // Column 1: on its node, or with its corner on it.
    expect([box('centred', 1).x, box('centred', 1).y]).toEqual([0, 0]);
    expect([box('columnCorner', 1).x, box('columnCorner', 1).y]).toEqual([0.2, 0.2]);

    // The 3-D viewport draws the profile at the same ends (`scene-sync` → `resolveOffsetWorldVectors`).
    const el = chain('topFlush').solved.data.elements.get(7) as never;
    const a = { x: 0, y: 0, z: TOP }, b = { x: 0, y: 5, z: TOP };
    const off = resolveOffsetWorldVectors(el, a, b, undefined, false)!;
    const g = createElementGroup(
      { x: a.x + off.i!.x, y: a.y + off.i!.y, z: a.z + off.i!.z }, { x: b.x + off.j!.x, y: b.y + off.j!.y, z: b.z + off.j!.z },
      { elementId: 7, elementType: 'frame', section: { id: 2, name: 'RC Beam 300×550', a: 0.165, iy: 0.004159375, iz: 0.0012375, b: 0.3, h: 0.55, shape: 'rect' } as never,
        renderMode: 'sections', localAxes: { ex: [0, 1, 0], ey: [-1, 0, 0], ez: [0, 0, 1] } },
    );
    let mesh: THREE.Mesh | null = null;
    g.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh && !o.userData?.pickingHelper) mesh = o as THREE.Mesh; });
    const bb = new THREE.Box3().setFromObject(mesh!);
    expect(bb.min.z).toBeCloseTo(TOP - 2 * E, 6);
    expect(bb.max.z).toBeCloseTo(TOP, 6);
  }, 600_000);

  it('design: d is the section\'s, the support face moves with the column\'s insertion', () => {
    const cs = (v: Variant) => chain(v).solved.contexts.get(7)!.criticalSections!;
    // d = 0,55 − 0,025 − 0,008 − 0,008 = 0,509 m in every version; L = 5 m.
    for (const v of ['centred', 'topFlush'] as const) {
      expect(cs(v).start).toEqual({ tFace: 0.04, tCritShear: 0.1418, source: 'column', halfDepth: 0.2 });
    }
    // Column 1's axis 0,2 m into beam 7's span: its face is a whole side, 0,4 m, from the node.
    expect(cs('columnCorner').start).toEqual({ tFace: 0.08, tCritShear: 0.1818, source: 'column', halfDepth: 0.4, insertion: { shift: 0.2 } });
    expect(cs('columnCorner').end).toEqual(cs('centred').end);

    // The anchorage the design verifies: near face 0,4 m and the far face ON the node, against
    // 0,2 m either way; the column is as deep along the beam as before.
    const cage = (v: Variant) => {
      const { solved, summary } = chain(v);
      return supportInputOf(solved.contexts.get(7)!, summary.outcomes.get(7)!.accepted!)!.cages.start;
    };
    expect(cage('centred').face).toBeCloseTo(0.2, 12);
    expect(cage('centred').far).toBeUndefined();
    expect(cage('columnCorner').face).toBeCloseTo(0.4, 12);
    expect(cage('columnCorner').far).toBeCloseTo(0, 12);
  }, 600_000);

  it('rebar: a top-flush beam\'s bars are under its top face, the joint and the column follow', () => {
    const c = chain('centred').r, f = chain('topFlush').r;
    const zc = beamRuns(c, 7).map((s) => s.start.z), zf = beamRuns(f, 7).map((s) => s.start.z);
    // The same bars, a half depth lower: under the top face at 3,2 instead of 3,475, by the same
    // cover, stirrup and half bar.
    expect(zf.length).toBe(zc.length);
    expect(Math.max(...zf)).toBeCloseTo(Math.max(...zc) - E, 9);
    expect(Math.min(...zf)).toBeCloseTo(Math.min(...zc) - E, 9);
    expect(Math.max(...zc)).toBeLessThan(TOP + E - 0.025 - 0.006);
    expect(Math.max(...zf)).toBeLessThan(TOP - 0.025 - 0.006);
    expect(Math.min(...zf)).toBeGreaterThan(TOP - 2 * E + 0.025 + 0.006);
    // Joint 5's ties: in the band the beams make, [2,65, 3,2], a depth lower than centred.
    const ties = (r: RunDetailingResult) => bars(r).filter((b) => b.id.startsWith('joint-5:')).map((b) => b.segments[0]!.start.z);
    expect(ties(f).length).toBe(ties(c).length);
    expect(Math.min(...ties(f))).toBeCloseTo(Math.min(...ties(c)) - E, 9);
    expect(Math.max(...ties(f))).toBeCloseTo(Math.max(...ties(c)) - E, 9);
    expect(Math.min(...ties(f))).toBeGreaterThan(TOP - 2 * E);
    // Column 1's roof bars rise to the beams' top cover: 3,2 − 0,025, not 3,475 − 0,025.
    const col = (r: RunDetailingResult) => zsOf(bars(r).filter((b) => b.role === 'longitudinal' && b.ownerElementIds.length === 1 && b.ownerElementIds[0] === 1));
    expect(Math.max(...col(c))).toBeCloseTo(TOP + E - 0.025, 9);
    expect(Math.max(...col(f))).toBeCloseTo(TOP - 0.025, 9);
    // And the beams' top bars thread the column's at their own elevation: no clash in either.
    expect(f.assemblies.flatMap((a) => a.conflicts)).toEqual([]);
    expect(c.assemblies.flatMap((a) => a.conflicts)).toEqual([]);
  }, 600_000);

  it('rebar: a column placed by its corner is caged on its axis, the beam stops at its real face', () => {
    const c = chain('centred').r, k = chain('columnCorner').r;
    const plan = (r: RunDetailingResult) => bars(r).filter((b) => b.role === 'longitudinal' && b.ownerElementIds.length === 1 && b.ownerElementIds[0] === 1).map((b) => b.segments[0]!.start);
    // The same cage, 0,2 m along x and y: centred on (0,2; 0,2), not on the node.
    const mid = (ps: Array<{ x: number; y: number }>, k: 'x' | 'y') => (Math.min(...ps.map((p) => p[k])) + Math.max(...ps.map((p) => p[k]))) / 2;
    expect(plan(k).length).toBe(plan(c).length);
    expect(mid(plan(c), 'x')).toBeCloseTo(0, 9);
    expect(mid(plan(c), 'y')).toBeCloseTo(0, 9);
    expect(mid(plan(k), 'x')).toBeCloseTo(0.2, 9);
    expect(mid(plan(k), 'y')).toBeCloseTo(0.2, 9);
    expect(Math.min(...plan(k).map((p) => p.x))).toBeCloseTo(Math.min(...plan(c).map((p) => p.x)) + 0.2, 9);
    // Beam 7 runs +y from node 5: its stirrups start past the face at 0,4 m, not 0,2 m, and its
    // bars end inside the column's outer face at y = 0 (a cover, a tie and a millimetre in at
    // least), where centred they ran through to y = −0,072.
    const stirrupStart = (r: RunDetailingResult) => Math.min(...bars(r)
      .filter((b) => b.ownerElementIds.includes(7) && b.role !== 'longitudinal' && !b.id.startsWith('joint'))
      .map((b) => Math.min(...b.segments.map((s) => s.start.y))));
    expect(stirrupStart(c)).toBeGreaterThan(0.2);
    expect(stirrupStart(k)).toBeCloseTo(stirrupStart(c) + 0.2, 9);
    const yEnds = (r: RunDetailingResult) => bars(r).filter((b) => b.role === 'longitudinal' && b.ownerElementIds.includes(7) && !b.ownerElementIds.some((o) => o <= 4))
      .flatMap((b) => b.segments.flatMap((s) => [s.start.y, s.end.y]));
    expect(Math.min(...yEnds(c))).toBeLessThan(0);
    expect(Math.min(...yEnds(k))).toBeGreaterThanOrEqual(0.025 + 0.008 + 0.001 - 1e-9);
    // The joint's ties are the column's: centred on its axis.
    const tieX = (r: RunDetailingResult) => bars(r).filter((b) => b.id.startsWith('joint-5:')).flatMap((b) => b.segments.flatMap((s) => [s.start.x, s.end.x]));
    expect((Math.min(...tieX(k)) + Math.max(...tieX(k))) / 2).toBeCloseTo(0.2, 6);
    expect((Math.min(...tieX(c)) + Math.max(...tieX(c))) / 2).toBeCloseTo(0, 6);
  }, 600_000);

  it('the derivation says where each member\'s line came from', () => {
    const trace = (v: Variant) => chain(v).r.coordination.flatMap((x) => x.trace);
    expect(trace('topFlush')).toContain('Línea de referencia: eje baricéntrico a (0.000; 0.000; -0.275) m del nodo i y (0.000; 0.000; -0.275) m del nodo j, según la inserción declarada en el modelo (la misma que recibe el análisis).');
    expect(trace('centred').filter((l) => l.includes('convención supuesta, no un dato')).length).toBeGreaterThan(0);
    expect(trace('centred').some((l) => l.includes('inserción declarada'))).toBe(false);
  }, 600_000);
});
