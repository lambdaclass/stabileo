/**
 * #439: the torsional data of 3D sections, through the real store → engine path.
 *
 * The geometric stiffness carries the Wagner term (#434), so a compressed member has a torsional
 * buckling load (G·J + π²·E·Cw/L²)/r0², and a tee or channel a flexural-torsional one through its
 * shear-centre offset. The web used to send J = 0.001·Iy when it had none, never sent Cw and never
 * sent the shear centre. These columns are built in the model store from catalogue profiles,
 * solved by `solveBuckling3D` on `modelStore.buildSolverInput3D`, and checked against the closed
 * forms evaluated with the section's own constants.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';
import { initSolver, solveBuckling3D, solvePDelta3D, solve3D } from '../wasm-solver';
import { validateAndSolve3D } from '../solver-service';
import { workerPDelta } from '../direct-analysis';
import { solverProperties } from '../../section/state';
import { bucklingWarpingInput } from '../buckling-warping';
import type { SolverInput3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear(); });

const E = 200_000; // MPa
const NU = 0.3;
const Ek = E * 1000; // kN/m²
const Gk = Ek / (2 * (1 + NU));

/** A column of `n` members along global Z, fork-supported at both ends (twist held, warping free). */
function forkColumn(section: Parameters<typeof modelStore.addSection>[0], l: number, n: number) {
  const mat = modelStore.addMaterial({ name: 'Steel', e: E, nu: NU, rho: 0 } as never);
  const sec = modelStore.addSection(section);
  const nodes = Array.from({ length: n + 1 }, (_, i) => modelStore.addNode(0, 0, (l * i) / n));
  const elems = nodes.slice(1).map((nj, i) => {
    const id = modelStore.addElement(nodes[i]!, nj, 'frame');
    modelStore.updateElement(id, { sectionId: sec, materialId: mat } as never);
    return id;
  });
  modelStore.addSupport(nodes[0]!, 'custom3d' as never, undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: true } });
  modelStore.addSupport(nodes[n]!, 'custom3d' as never, undefined, { dofRestraints: { tx: true, ty: true, tz: false, rx: false, ry: false, rz: true } });
  modelStore.addNodalLoad3D(nodes[n]!, 0, 0, -1, 0, 0, 0);
  return { sec, nodes, elems };
}

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  analysis: modelStore.analysis, groups: modelStore.model.groups,
});
const input = () => modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false }) as SolverInput3D;

/** Max |twist| (rz, the column is along Z) over max |translation| of a mode. */
function twistShare(m: { displacements: Array<{ ux: number; uy: number; rz: number }> }): { rz: number; tr: number } {
  const rz = m.displacements.reduce((a, d) => Math.max(a, Math.abs(d.rz)), 0);
  const tr = m.displacements.reduce((a, d) => Math.max(a, Math.abs(d.ux), Math.abs(d.uy)), 0);
  return { rz, tr };
}

/**
 * Smallest root of the flexural-torsional determinant of a monosymmetric section (Timoshenko &
 * Gere §5.4; Trahair §3.5): the plane whose displacement couples with the twist (`pa`), the
 * torsional load `pt`, the offset `e` of the shear centre across that plane:
 * (pa − P)(pt − P)·r0² − P²·e² = 0. The other plane buckles on its own at its Euler load.
 */
function flexuralTorsional(pa: number, pt: number, r0sq: number, e: number): number {
  const a = r0sq - e * e, b = -r0sq * (pa + pt), c = r0sq * pa * pt;
  return (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('IPE 300 column, 2 m, fork supports', () => {
  const IPE300 = { name: 'IPE 300', shape: 'I' as const, profileFamily: 'IPE', a: 53.8e-4, iy: 8356e-8, iz: 604e-8, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107 };

  it('the section carries a real J and Cw (within a few percent of the tables), and a centred shear centre', () => {
    const { sec } = forkColumn(IPE300, 2, 8);
    const p = solverProperties(modelStore.sections.get(sec)!);
    // Tabulated (ArcelorMittal): It = 20.12 cm⁴, Iw = 125.9·10³ cm⁶. The outline has the root fillets.
    expect(p.jProvenance).toBe('saintVenant');
    expect(rel(p.j!, 20.12e-8)).toBeLessThan(0.05);
    expect(rel(p.cw!, 125.9e-9)).toBeLessThan(0.03);
    expect(p.shearCentre).toEqual([0, 0]);
    const s = input().sections.get(sec)!;
    expect(s.j).toBe(p.j);
    expect(s.cw).toBeUndefined(); // never on the static input
    expect(s.bucklingCw).toBe(p.cw);
    expect(s.shearCenterY ?? 0).toBe(0);
    expect(s.shearCenterZ ?? 0).toBe(0);
  });

  it('flexure governs at Euler; the torsional mode is (GJ + π²ECw/L²)/r0², not GJ/r0²', () => {
    const l = 2;
    const { sec } = forkColumn(IPE300, l, 8);
    const p = solverProperties(modelStore.sections.get(sec)!);
    const pe = (Math.PI ** 2 * Ek * p.iz) / l ** 2; // weak axis (`iz` is about the vertical section axis)
    const r0sq = (p.iy + p.iz) / p.a;
    const ptSV = (Gk * p.j!) / r0sq;
    const pt = (Gk * p.j! + (Math.PI ** 2 * Ek * p.cw!) / l ** 2) / r0sq;
    expect(ptSV).toBeLessThan(pe); // without Cw torsion would govern: the defect of #439
    expect(pt).toBeGreaterThan(pe);

    const r = solveBuckling3D(input(), 6) as ReturnType<typeof solveBuckling3D> & { warpingMembers: number[] };
    expect(r.warpingMembers.length).toBe(8);
    const first = r.modes[0]!;
    expect(rel(first.loadFactor, pe)).toBeLessThan(2e-3);
    expect(twistShare(first as never).rz).toBeLessThan(1e-9);
    const torsional = r.modes.find((m: unknown) => { const s = twistShare(m as never); return s.rz > 0 && s.tr < 1e-6 * s.rz; });
    expect(torsional, 'a pure twist mode among the first six').toBeDefined();
    // Eight cubic elements: from above, within 0.1 %.
    expect(torsional!.loadFactor).toBeGreaterThanOrEqual(pt * (1 - 1e-6));
    expect(rel(torsional!.loadFactor, pt)).toBeLessThan(1e-3);
  });

  it('static, P-Δ and modal inputs carry no warping: the static solve is the one without Cw', () => {
    forkColumn(IPE300, 2, 8);
    const i = input();
    for (const s of i.sections.values()) expect(s.cw).toBeUndefined();
    const r = solvePDelta3D(i, 20, 1e-6);
    expect(r.converged ?? true).toBe(true);
    expect(r.isStable ?? true).toBe(true);
  });
});

describe('UPN 200 column, 2 m: flexural-torsional through the shear centre', () => {
  it('sends the shear-centre offset, and a coupled twist mode sits at the flexural-torsional root', () => {
    const l = 2;
    const { sec } = forkColumn({ name: 'UPN 200', shape: 'U', profileFamily: 'UPN', a: 32.2e-4, iy: 1910e-8, iz: 148e-8, h: 0.2, b: 0.075, tw: 0.0085, tf: 0.0115 }, l, 8);
    const p = solverProperties(modelStore.sections.get(sec)!);
    const [y0, z0] = p.shearCentre!;
    // Symmetric about the horizontal axis: the shear centre is off the centroid horizontally only,
    // behind the web. Tables put it some 4 cm from the centroid for a UPN 200 (e + x̄).
    expect(z0).toBe(0);
    expect(Math.abs(y0)).toBeGreaterThan(0.03);
    expect(Math.abs(y0)).toBeLessThan(0.05);
    // Tabulated It = 11.9 cm⁴; the rolled flange taper is in the outline.
    expect(rel(p.j!, 11.9e-8)).toBeLessThan(0.1);
    expect(p.cw!).toBeGreaterThan(0);
    const s = input().sections.get(sec)!;
    expect(s.shearCenterY).toBe(y0);

    const pv = (Math.PI ** 2 * Ek * p.iz) / l ** 2;
    const pw = (Math.PI ** 2 * Ek * p.iy) / l ** 2;
    const r0sq = (p.iy + p.iz) / p.a + y0 ** 2 + z0 ** 2;
    const pt = (Gk * p.j! + (Math.PI ** 2 * Ek * p.cw!) / l ** 2) / r0sq;
    const pft = flexuralTorsional(pw, pt, r0sq, y0);
    expect(pft).toBeLessThan(Math.min(pw, pt) * 0.999);

    const r = solveBuckling3D(input(), 6);
    // The weak-axis flexural mode is uncoupled and governs this column.
    expect(rel(r.modes[0]!.loadFactor, Math.min(pv, pft))).toBeLessThan(2e-3);
    const coupled = r.modes.find((m: unknown) => twistShare(m as never).rz > 1e-6);
    expect(coupled).toBeDefined();
    expect(coupled!.loadFactor).toBeGreaterThanOrEqual(pft * (1 - 1e-6));
    expect(rel(coupled!.loadFactor, pft)).toBeLessThan(2e-3);
  });
});

describe('Tee column: flexural-torsional with Cw ≈ 0', () => {
  it('matches the coupled root with the section\'s own shear centre', () => {
    const l = 1.5;
    const { sec } = forkColumn({ name: 'T 38x38x4.8', shape: 'T', profileFamily: 'T', a: 3.46e-4, iy: 4.5766e-8, iz: 2.2127e-8, h: 0.038, b: 0.038, tw: 0.0048, tf: 0.0048 }, l, 16);
    const p = solverProperties(modelStore.sections.get(sec)!);
    const [y0, z0] = p.shearCentre!;
    expect(y0).toBe(0);
    expect(Math.abs(z0)).toBeGreaterThan(0.005);
    const pv = (Math.PI ** 2 * Ek * p.iz) / l ** 2;
    const pw = (Math.PI ** 2 * Ek * p.iy) / l ** 2;
    const r0sq = (p.iy + p.iz) / p.a + y0 ** 2 + z0 ** 2;
    const pt = (Gk * p.j! + (Math.PI ** 2 * Ek * (p.cw ?? 0)) / l ** 2) / r0sq;
    // Symmetric about the vertical axis: the offset z0 couples the twist with v (bending about z).
    const pft = flexuralTorsional(pv, pt, r0sq, z0);
    const r = solveBuckling3D(input(), 6);
    const coupled = r.modes.find((m: unknown) => twistShare(m as never).rz > 1e-6);
    expect(coupled).toBeDefined();
    expect(rel(coupled!.loadFactor, pft)).toBeLessThan(3e-3);
    expect(r.modes[0]!.loadFactor).toBeLessThanOrEqual(Math.min(pw, pft) * (1 + 3e-3));
  });
});

describe('no invented torsion constant', () => {
  it('a section with no J is sent j = 0 and every 3D frame analysis refuses it by name', () => {
    // Stated by its properties only, with no J and no geometry.
    const { sec, elems } = forkColumn({ name: 'Declared', a: 50e-4, iy: 8000e-8, iz: 600e-8 }, 3, 2);
    const i = input();
    expect(i.sections.get(sec)!.j).toBe(0);
    expect(i.sections.get(sec)!.torsionGap).toBe('j');
    for (const id of elems) expect(i.elements.get(id)!.releaseTStart).toBe(false);
    const said = validateAndSolve3D(md() as never, false, false);
    expect(typeof said).toBe('string');
    expect(said as string).toMatch(/torsion constant J/);
    expect(said as string).toContain(elems.join(', '));
    expect(() => solve3D(i)).toThrow(/torsion constant J/);
    expect(() => solveBuckling3D(i, 2)).toThrow(/J/);
    expect(() => solvePDelta3D(i, 20, 1e-6)).toThrow(/J/);
  });

  it('a member released in torsion needs no J', () => {
    const { elems } = forkColumn({ name: 'Declared', a: 50e-4, iy: 8000e-8, iz: 600e-8 }, 3, 1);
    modelStore.updateElement(elems[0]!, { releaseJ: { my: false, mz: false, t: true } } as never);
    const said = validateAndSolve3D(md() as never, false, false);
    expect(typeof said, String(said)).not.toBe('string');
  });

  it('a channel stated by its properties only has no shear centre: buckling refuses rather than drop the coupling', () => {
    const { sec } = forkColumn({ name: 'C declared', shape: 'U', declared: true, a: 32.2e-4, iy: 1910e-8, iz: 148e-8, j: 11.9e-8 } as never, 2, 2);
    const i = input();
    expect(i.sections.get(sec)!.torsionGap).toBe('shearCentre');
    expect(() => solveBuckling3D(i, 2)).toThrow(/shear center/);
  });

  it('P-Delta in a worker refuses the same channel (it used to publish forces without the coupling)', async () => {
    // The wire object drops `torsionGap`, so the worker could not know (Codex review of #468).
    forkColumn({ name: 'C declared', shape: 'U', declared: true, a: 32.2e-4, iy: 1910e-8, iz: 148e-8, j: 11.9e-8 } as never, 2, 2);
    let dispatched = 0;
    const run = workerPDelta(async () => { dispatched++; return {}; });
    await expect(run(input(), 20, 1e-4)).rejects.toThrow(/shear center/);
    expect(dispatched).toBe(0);
  });
});

describe('where Cw goes in the buckling input', () => {
  it('only to compressed straight runs; a joint never ties the warping of members at an angle', () => {
    // A portal: two columns and a beam, all with Cw. Columns compressed, the beam in bending.
    const mk = (id: number, x: number, z: number) => ({ id, x, y: 0, z });
    const sec = { id: 1, a: 1e-2, iy: 1e-4, iz: 1e-5, j: 1e-7, bucklingCw: 1e-8 };
    const frame = (id: number, nodeI: number, nodeJ: number) => ({ id, type: 'frame' as const, nodeI, nodeJ, materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false });
    const base: SolverInput3D = {
      nodes: new Map([[1, mk(1, 0, 0)], [2, mk(2, 0, 3)], [3, mk(3, 4, 3)], [4, mk(4, 4, 0)], [5, mk(5, 0, 6)]]),
      materials: new Map([[1, { id: 1, e: E, nu: NU }]]),
      sections: new Map([[1, sec]]),
      elements: new Map([[1, frame(1, 1, 2)], [2, frame(2, 2, 3)], [3, frame(3, 4, 3)], [4, frame(4, 2, 5)]]),
      supports: new Map(), loads: [],
    } as never;
    // Column 1–2 most compressed, the beam 2–3 also compressed, column 2–5 above it, column 4–3.
    const axial = new Map([[1, -100], [2, -50], [3, -80], [4, -20]]);
    const { input: out, warped } = bucklingWarpingInput(base, axial);
    // 1 (most compressed), then 3 (its own nodes), then 2 is refused at node 2 (column 1 there,
    // at an angle) and at node 3; 4 is collinear with 1 at node 2: a continuous column.
    expect(warped).toEqual([1, 3, 4]);
    const cwOf = (id: number) => out.sections.get(out.elements.get(id)!.sectionId)!.cw;
    expect(cwOf(1)).toBe(1e-8);
    expect(cwOf(2)).toBeUndefined();
    // Tension or released members never get it.
    const none = bucklingWarpingInput(base, new Map([[1, 10], [2, 10], [3, 10], [4, 10]]));
    expect(none.warped).toEqual([]);
    expect(none.input).toBe(base);
  });
});
