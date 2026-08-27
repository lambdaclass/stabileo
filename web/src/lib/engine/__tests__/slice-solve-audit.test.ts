/**
 * Every cut of every 3D fixture, taken and then solved.
 *
 * # What this is actually measuring
 *
 * A slice is geometrically trivial to get right and easy to get USELESS: the
 * frame that comes out is correct and may still be a mechanism, because in the
 * building it was braced out of plane by the very members the cut discarded.
 * That is not a defect in the cut — it is the truth about taking a frame out
 * of a structure — but a tool that hands back an unsolvable model without
 * saying so has moved the discovery from the dialog to a red toast.
 *
 * So this audit does not assert that every cut solves. It measures HOW MANY
 * do, across every 3D model shipped with the app, and pins the number. A
 * change that makes cuts stop solving shows up as a count, not as a vague
 * sense that something got worse.
 *
 * # Why it solves rather than just cutting
 *
 * The cut has unit tests of its own against a model whose answer is known by
 * hand. What those cannot show is whether the result is a STRUCTURE — whether
 * the supports came through, whether the loads landed on members that still
 * exist, whether the whole thing stands up. Only the solver knows that, and it
 * is the same solver the user will press.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { sliceModelAtPlane, planeOffsets } from '../../geometry/plane-slice';
import { loadFixture } from '../../templates/load-fixture';
import { buildSolverInput2D } from '../solver-service';
import { solve } from '../wasm-solver';
import type { DrawPlane } from '../../geometry/plane-projection';

const fixtureDir = 'src/lib/templates/fixtures';

/** The 3D models Basic and the toolbar offer. */
const MODELS = [
  '3d-cantilever-load', '3d-torsion-beam', '3d-portal-frame', '3d-space-truss',
  '3d-grid-slab', '3d-tower', '3d-nave-industrial', '3d-building',
];

function createMock() {
  let nn = 1, ne = 1, ns = 1, nl = 1, nsc = 2, nm = 2, np = 1, nq = 1;
  const model: any = {
    name: '', nodes: new Map(),
    materials: new Map([[1, { id: 1, name: 'A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]]),
    sections: new Map([[1, { id: 1, name: 'IPN300', a: 0.0069, iy: 0.000098, iz: 0.00000451, j: 1e-7, b: 0.125, h: 0.3 }]]),
    elements: new Map(), supports: new Map(), loads: [] as any[],
    plates: new Map(), quads: new Map(), constraints: [] as any[], loadCases: [], combinations: [],
  };
  const api: any = {
    addNode(x: number, y: number, z?: number) { const id = nn++; model.nodes.set(id, { id, x, y, z: z ?? 0 }); return id; },
    addElement(nI: number, nJ: number, type = 'frame') { const id = ne++; model.elements.set(id, { id, type, nodeI: nI, nodeJ: nJ, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }); return id; },
    addSupport(nodeId: number, type: string, extra?: any) { const id = ns++; model.supports.set(id, { id, nodeId, type, ...(extra || {}) }); return id; },
    updateSupport(id: number, data: any) { const s = model.supports.get(id); if (s) Object.assign(s, data); },
    addMaterial(data: any) { const id = nm++; model.materials.set(id, { id, ...data }); return id; },
    addSection(data: any) { const id = nsc++; model.sections.set(id, { id, ...data }); return id; },
    updateElementMaterial(eid: number, mid: number) { const e = model.elements.get(eid); if (e) e.materialId = mid; },
    updateElementSection(eid: number, sid: number) { const e = model.elements.get(eid); if (e) e.sectionId = sid; },
    toggleHinge(eid: number, end: 'start' | 'end') { const e = model.elements.get(eid); if (e) { if (end === 'start') e.hingeStart = !e.hingeStart; else e.hingeEnd = !e.hingeEnd; } },
    addDistributedLoad(eid: number, qI: number, qJ?: number, angle?: number, isGlobal?: boolean, caseId?: number) { const id = nl++; model.loads.push({ type: 'distributed', data: { id, elementId: eid, qI, qJ: qJ ?? qI, angle, isGlobal, caseId } }); return id; },
    addNodalLoad(nodeId: number, fx: number, fz: number, my?: number, caseId?: number) { const id = nl++; model.loads.push({ type: 'nodal', data: { id, nodeId, fx, fz, my: my ?? 0, caseId } }); return id; },
    addPointLoadOnElement(eid: number, a: number, p: number, opts?: any) { const id = nl++; model.loads.push({ type: 'pointOnElement', data: { id, elementId: eid, a, p, ...(opts || {}) } }); return id; },
    addThermalLoad(eid: number, u: number, g: number) { const id = nl++; model.loads.push({ type: 'thermal', data: { id, elementId: eid, dtUniform: u, dtGradient: g } }); return id; },
    addDistributedLoad3D(eid: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number) { const id = nl++; model.loads.push({ type: 'distributed3d', data: { id, elementId: eid, qYI, qYJ, qZI, qZJ, a, b, caseId } }); return id; },
    addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number) { const id = nl++; model.loads.push({ type: 'nodal3d', data: { id, nodeId, fx, fy, fz, mx, my, mz, caseId } }); return id; },
    addSurfaceLoad3D(qid: number, q: number, caseId?: number) { const id = nl++; model.loads.push({ type: 'surface3d', data: { id, quadId: qid, q, caseId } }); return id; },
    addPlate(nodes: number[], mid: number, t: number) { const id = np++; model.plates.set(id, { id, nodes, materialId: mid, thickness: t }); return id; },
    addQuad(nodes: number[], mid: number, t: number) { const id = nq++; model.quads.set(id, { id, nodes, materialId: mid, thickness: t }); return id; },
    addConstraint(c: any) { model.constraints.push(c); },
    model, nextId: { loadCase: 5, combination: 1 },
  };
  return { model, api };
}

function load(name: string) {
  const json = JSON.parse(readFileSync(`${fixtureDir}/${name}.json`, 'utf8'));
  const { model, api } = createMock();
  loadFixture(json, api);
  return model;
}

interface CutReport {
  model: string;
  plane: DrawPlane;
  offset: number;
  /** Members the cut yielded. */
  elements: number;
  /** How it ended: solved, or why not. */
  outcome: 'solved' | 'noSupports' | 'mechanism' | 'refused';
}

/** Cut, then try to solve, and report which of the four things happened. */
function cutAndSolve(model: any, plane: DrawPlane, offset: number): CutReport['outcome'] {
  const r = sliceModelAtPlane(
    plane, offset, model.nodes.values(), model.elements.values(),
    model.supports.values(), model.loads, model.materials, model.sections,
  );
  if (!r.ok) return 'refused';

  const m = r.model;
  if (m.supports.size === 0) return 'noSupports';

  const case1 = m.loads.filter((l: any) => ((l.data as any).caseId ?? 1) === 1);
  const input = buildSolverInput2D({
    nodes: m.nodes, elements: m.elements, supports: m.supports,
    loads: case1, materials: m.materials, sections: m.sections,
  } as never);
  if (!input) return 'noSupports';

  try {
    const res = solve(input);
    if (!res.displacements.length) return 'mechanism';
    for (const d of res.displacements) {
      if (!Number.isFinite(d.ux) || !Number.isFinite(d.uz)) return 'mechanism';
    }
    return 'solved';
  } catch {
    return 'mechanism';
  }
}

describe('every cut of every 3D model', { timeout: 120_000 }, () => {
  const reports: CutReport[] = [];

  for (const name of MODELS) {
    it(`${name}: cuts on all three planes`, () => {
      const model = load(name);
      // Counted per model, not against the accumulator: reports.length grows
      // with every test, so asserting on it would pass vacuously from the
      // second model on.
      const before = reports.length;
      for (const plane of ['xy', 'xz', 'yz'] as DrawPlane[]) {
        const offs = planeOffsets(plane, model.nodes.values(), model.elements.values());
        for (const o of offs) {
          // An offset with no members in it is refused by the cut before the
          // solver is reached, and is reported by the dialog as such.
          if (o.elements === 0) continue;
          reports.push({
            model: name, plane, offset: o.value, elements: o.elements,
            outcome: cutAndSolve(model, plane, o.value),
          });
        }
      }
      expect(reports.length).toBeGreaterThan(before);
    });
  }

  it('reports what the cuts across the whole library do', () => {
    const by = (k: CutReport['outcome']) => reports.filter((r) => r.outcome === k);
    const total = reports.length;
    const solved = by('solved').length;

    // Printed, because the number itself is the finding: it says how often
    // "take one frame" hands back something that stands up, and a change to
    // it is the thing worth noticing.
    console.log(`\n  cuts audited: ${total}`);
    console.log(`    solved:      ${solved} (${Math.round((solved / total) * 100)}%)`);
    console.log(`    mechanism:   ${by('mechanism').length}`);
    console.log(`    no supports: ${by('noSupports').length}`);
    console.log(`    refused:     ${by('refused').length}`);
    for (const m of MODELS) {
      const mine = reports.filter((r) => r.model === m);
      if (!mine.length) continue;
      const ok = mine.filter((r) => r.outcome === 'solved').length;
      console.log(`    ${m.padEnd(22)} ${ok}/${mine.length}`);
    }

    // A cut must never produce a model that is neither solvable nor
    // explained: every report has to be one of the four known outcomes.
    expect(total).toBe(solved + by('mechanism').length + by('noSupports').length + by('refused').length);

    // The floor: cutting is worth offering only if a fair share of the cuts
    // in the shipped library give a structure that stands. Deliberately a
    // floor and not an equality — the library grows.
    expect(solved / total).toBeGreaterThan(0.3);
  });
});

/**
 * Load accounting, over the same library.
 *
 * A cut that keeps its supports fails LOUDLY when it is wrong — the solver
 * refuses. A cut that keeps no LOAD fails quietly: it solves, every result is
 * zero, and the utilisation map paints it uniformly safe. The dialog warns
 * about that, and the warning is only as good as the count it is gated on.
 *
 * That count used to be a count of load OBJECTS. A load survives a cut
 * whenever the thing it acts on survives, but it carries only its in-plane
 * component into the frame — so a roof load pointing down global Z survived a
 * horizontal cut and acted on nothing. Seven cuts of this library advertised
 * between one and forty loads and produced a frame carrying zero, with the
 * warning silent on every one.
 */
describe('load accounting across the library', { timeout: 120_000 }, () => {
  /** Everything the produced 2D model actually carries, summed. */
  const magnitude = (loads: Array<{ data: Record<string, unknown> }>): number => {
    let m = 0;
    for (const l of loads) {
      for (const k of ['qI', 'qJ', 'fx', 'fz', 'p', 'my']) {
        m += Math.abs(Number((l.data as Record<string, unknown>)[k] ?? 0));
      }
    }
    return m;
  };

  it('no cut advertises load and delivers a frame carrying none', () => {
    let checked = 0;
    for (const name of MODELS) {
      const model = load(name);
      if (!model.loads.length) continue;
      for (const plane of ['xy', 'xz', 'yz'] as DrawPlane[]) {
        for (const cut of planeOffsets(
          plane, model.nodes.values(), model.elements.values(),
          model.supports.values(), model.loads,
        )) {
          if (cut.elements === 0) continue;
          const r = sliceModelAtPlane(
            plane, cut.value, model.nodes.values(), model.elements.values(),
            model.supports.values(), model.loads, model.materials, model.sections,
          );
          if (!r.ok) continue;
          checked++;
          const where = `${name} ${plane}=${cut.value}`;

          // The one that matters: if the dialog says there is load, there is.
          if (cut.loads > 0) {
            expect(magnitude(r.model.loads), `${where} advertised ${cut.loads} loads`)
              .toBeGreaterThan(0);
          }

          /*
           * The preview is exact about ZERO and approximate above it — it runs
           * before the projection, so it cannot know which members will
           * collapse or duplicate away, and a load on one of those goes with
           * it. Four cuts of this library differ by a few. What has to hold
           * exactly is the equivalence the warning is gated on, both ways.
           */
          expect(cut.loads === 0, `${where}`).toBe(r.slice.loads === 0);

          // And nothing may simply vanish from the accounting.
          expect(r.slice.loads + r.slice.droppedLoads, `${where}`).toBe(model.loads.length);
        }
      }
    }
    expect(checked, 'the sweep actually examined cuts').toBeGreaterThan(50);
  });
});
