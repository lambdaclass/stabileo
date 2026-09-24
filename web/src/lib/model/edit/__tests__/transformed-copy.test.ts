/**
 * A transformed copy is the same structure, moved — and the solver is the judge of that.
 *
 * The strongest check available: put the original and its copy in one model, solve, and require
 * the copy's reactions and displacements to be the original's carried by the same transform —
 * forces and displacements as vectors, moments and rotations as axial vectors. Everything the
 * edit layer carries has to be right for that to hold: the copy's local frame (a channel, whose
 * orientation matters), its member offsets, its supports, and its loads in local axes and at
 * nodes. A frame one degree off, a local load with the wrong sign, would show here as a reaction
 * that is not the mirror image.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { validateAndSolve3D } from '../../../engine/solver-service';
import * as wasmSolver from '../../../engine/wasm-solver';
import { reflection, rotation, translation, applyAxial, applyVector, type Affine, type Vec3 } from '../affine';
import { copyTransformed } from '../transformed-copy';
import { transformInPlace } from '../transform-in-place';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

/**
 * An L-shaped frame in space: a column, a beam along X, a beam along Y, a channel section with a
 * roll, a member offset, a partial local load, a local point load and a nodal force and moment.
 * Deliberately without symmetry, so an error in any carried field changes the answer.
 */
function asymmetricFrame(): { nodes: number[]; elements: number[] } {
  modelStore.restore({
    nodes: [
      [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }],
      [3, { id: 3, x: 4, y: 0, z: 3 }], [4, { id: 4, x: 0, y: 5, z: 3 }],
      [5, { id: 5, x: 4, y: 0, z: 0 }],
    ],
    materials: [[1, { id: 1, name: 'S', e: 200000, nu: 0.3, rho: 78.5 }]],
    sections: [
      [1, { id: 1, name: 'HEB', a: 0.0065, iz: 1.1e-5, iy: 3.7e-5, j: 4e-7, shape: 'H' }],
      [2, { id: 2, name: 'UPN', a: 0.0042, iz: 1.5e-6, iy: 2.1e-5, j: 1e-7, shape: 'C' }],
    ],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 2, rollAngle: 30,
        offset: { frame: 'local', j: { x: 0, y: 0.05, z: -0.1 } } }],
      [3, { id: 3, type: 'frame', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 2 }],
      [4, { id: 4, type: 'frame', nodeI: 5, nodeJ: 3, materialId: 1, sectionId: 1 }],
    ],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 5, type: 'pinned3d' }]],
    loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
    nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 1 },
  } as never);
  modelStore.addDistributedLoad3D(2, 2, 1, -8, -3, 0.5, 3.2, 1);
  modelStore.addPointLoadOnElement3D(3, 2, 4, -6, 1);
  modelStore.addNodalLoad3D(4, 3, -2, -5, 1.5, 0, 2, 1);
  historyStore.clear();
  return { nodes: [1, 2, 3, 4, 5], elements: [1, 2, 3, 4] };
}

function solve() {
  const md = {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
  };
  const r = validateAndSolve3D(md as never, false, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
}

/** Map original node → copy node by position. */
function nodeMapOf(T: Affine, originals: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of originals) {
    const n = modelStore.nodes.get(id)!;
    const p = [n.x, n.y, n.z ?? 0] as Vec3;
    const q = applyVector(T, p).map((v, i) => v + T.t[i]!);
    const hit = [...modelStore.nodes.values()].find((m) => m.id !== id && Math.hypot(m.x - q[0]!, m.y - q[1]!, (m.z ?? 0) - q[2]!) < 1e-6);
    out.set(id, hit!.id);
  }
  return out;
}

const ALL = { withLoads: true, withSupports: true };

/**
 * Solve the original alone, copy it, delete the original, solve the copy alone. The solver
 * rejects a model in two disconnected pieces, so they cannot be solved together.
 */
function solveCopyApart(T: Affine) {
  const src = asymmetricFrame();
  const before = solve();
  copyTransformed(src, [T], ALL);
  const map = nodeMapOf(T, src.nodes);
  modelStore.batch(() => { for (const id of src.nodes) modelStore.removeNode(id); });
  return { before, after: solve(), map };
}

/** The copy's response equals the original's carried by T, node by node. */
function expectImageOf(T: Affine, before: ReturnType<typeof solve>, after: ReturnType<typeof solve>, map: Map<number, number>) {
  const d0 = new Map(before.displacements.map((d) => [d.nodeId, d]));
  const d1 = new Map(after.displacements.map((d) => [d.nodeId, d]));
  const r0 = new Map(before.reactions.map((r) => [r.nodeId, r]));
  const r1 = new Map(after.reactions.map((r) => [r.nodeId, r]));
  // One scale per quantity for the whole structure: a node that barely moves is not a reason to
  // demand relative precision of round-off.
  const maxOf = (vs: Vec3[]) => Math.max(1e-12, ...vs.map((v) => Math.hypot(...v)));
  const uScale = maxOf([...d0.values()].map((d) => [d.ux, d.uy, d.uz] as Vec3));
  const tScale = maxOf([...d0.values()].map((d) => [d.rx, d.ry, d.rz] as Vec3));
  const fScale = maxOf([...r0.values()].map((r) => [r.fx, r.fy, r.fz] as Vec3));
  const mScale = maxOf([...r0.values()].map((r) => [r.mx, r.my, r.mz] as Vec3));
  const close = (a: Vec3, b: Vec3, scale: number, label: string) => {
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / scale, label).toBeLessThan(1e-7);
  };
  for (const [o, c] of map) {
    const a = d0.get(o)!, b = d1.get(c)!;
    close(applyVector(T, [a.ux, a.uy, a.uz]), [b.ux, b.uy, b.uz], uScale, `u ${o}→${c}`);
    close(applyAxial(T, [a.rx, a.ry, a.rz]), [b.rx, b.ry, b.rz], tScale, `θ ${o}→${c}`);
    const ra = r0.get(o), rb = r1.get(c);
    if (ra || rb) {
      expect(!!ra && !!rb, `support at ${o}→${c}`).toBe(true);
      close(applyVector(T, [ra!.fx, ra!.fy, ra!.fz]), [rb!.fx, rb!.fy, rb!.fz], fScale, `R ${o}→${c}`);
      close(applyAxial(T, [ra!.mx, ra!.my, ra!.mz]), [rb!.mx, rb!.my, rb!.mz], mScale, `M ${o}→${c}`);
    }
  }
}

describe('the copy is the same structure, moved — the solver agrees', () => {
  it('mirrored in an oblique plane clear of the structure', () => {
    const T = reflection([10, 0, 0], [1, 0.3, 0]);
    const { before, after, map } = solveCopyApart(T);
    expectImageOf(T, before, after, map);
  });

  it('rotated about an oblique axis', () => {
    const T = rotation([12, -3, 1], [0.3, 0.4, 0.87], 57);
    const { before, after, map } = solveCopyApart(T);
    expectImageOf(T, before, after, map);
  });

  it('rotated in place about an oblique axis', () => {
    const src = asymmetricFrame();
    const before = solve();
    const T = rotation([1, 2, 0], [0, 0.6, 0.8], -41);
    transformInPlace(src, T);
    expectImageOf(T, before, solve(), new Map(src.nodes.map((n) => [n, n])));
  });

  it('mirrored in place', () => {
    const src = asymmetricFrame();
    const before = solve();
    const T = reflection([2, 0, 0], [0.2, 1, 0.1]);
    transformInPlace(src, T);
    expectImageOf(T, before, solve(), new Map(src.nodes.map((n) => [n, n])));
  });
});

describe('repeat', () => {
  it('welds shared nodes, links the copies, carries groups, and is one undo step', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(5, 0, 3), d = modelStore.addNode(5, 0, 0);
    const e1 = modelStore.addElement(a, b, 'frame'), e2 = modelStore.addElement(b, c, 'frame'), e3 = modelStore.addElement(d, c, 'frame');
    modelStore.addGroup('frame', 'physicalMember', { elements: [e2] }, { data: { kept: true } });
    historyStore.clear();
    const nodesBefore = modelStore.nodes.size, elementsBefore = modelStore.elements.size;

    const T = [1, 2, 3].map((k) => translation([0, 6 * k, 0]));
    const rep = copyTransformed({ nodes: [], elements: [e1, e2, e3] }, T, { link: { type: 'frame', materialId: 1, sectionId: 1 } });
    expect(rep.elements.length).toBe(9);
    expect(rep.links.length).toBe(12);      // 4 nodes × 3 gaps
    expect(rep.groups.length).toBe(3);
    const g = modelStore.model.groups.get(rep.groups[0]!)!;
    expect(g.kind).toBe('physicalMember');
    expect(g.data).toEqual({ kept: true });
    expect(rep.warnings.groupDataVerbatim).toBe(3);

    expect(historyStore.undoCount).toBe(1);
    historyStore.undo();
    expect(modelStore.nodes.size).toBe(nodesBefore);
    expect(modelStore.elements.size).toBe(elementsBefore);
  });

  it('a copy landing on the original welds onto it and adds no duplicate member', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    // Mirroring a member in the plane that bisects it maps it onto itself.
    const rep = copyTransformed({ nodes: [], elements: [e] }, [reflection([2, 0, 0], [1, 0, 0])]);
    expect(rep.welded).toBe(2);
    expect(rep.duplicates).toBe(1);
    expect(modelStore.elements.size).toBe(1);
  });
});

describe('what cannot be carried is said, not guessed', () => {
  it('a joint mask survives a quarter turn about a global axis, and is dropped by an oblique one', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, { jointJ: { dof: [false, false, false, false, true, false] } });
    const q = copyTransformed({ nodes: [], elements: [e] }, [rotation([0, 0, 5], [0, 0, 1], 90)]);
    expect(modelStore.elements.get(q.elements[0]!)!.jointJ?.dof).toEqual([false, false, false, true, false, false]);
    const o = copyTransformed({ nodes: [], elements: [e] }, [rotation([0, 0, 9], [1, 1, 0], 30)]);
    expect(o.warnings.jointDropped).toBe(1);
    expect(modelStore.elements.get(o.elements[0]!)!.jointJ).toBeUndefined();
  });

  it('an angle cannot be its own mirror image, and the mirror says so', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const sid = modelStore.addSection({ name: 'L', a: 0.001, iz: 1e-6, iy: 1e-6, j: 1e-8, shape: 'L' } as never);
    modelStore.updateElementSection(e, sid);
    const r = copyTransformed({ nodes: [], elements: [e] }, [reflection([0, 5, 0], [0, 1, 0])]);
    expect(r.warnings.asymmetricProfile).toBe(1);
  });
});
