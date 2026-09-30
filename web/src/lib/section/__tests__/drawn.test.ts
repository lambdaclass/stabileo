/**
 * Drawn sections: parts merged into what the engine can solve, and the numbers checked against
 * the engine's own templates and against closed forms.
 */
import { describe, it, expect } from 'vitest';
import { buildSectionGeometry, analyzeSectionTorsion, analyzeSectionShear, hasCanonicalGeometryExport } from '../../engine/wasm-solver';
import { analyzeDrawn } from '../drawn-properties';
import { catalogueOutline } from '../canonical';
import {
  assembleDrawn, thickPolyline, attachOffset, snapOffset, signedArea, momentsOf,
  type DrawnSection, type DrawnPart,
} from '../drawn';

const d = hasCanonicalGeometryExport() ? describe : describe.skip;
const rect = (id: number, b: number, h: number, at: [number, number], extra: Partial<DrawnPart> = {}): DrawnPart =>
  ({ id, shape: { kind: 'rect', b, h }, at, rotationDeg: 0, ...extra });
const sec = (...parts: DrawnPart[]): DrawnSection => ({ version: 1, parts });
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-30);

// An IPE 300 without its root fillets, the engine's own template for the comparison.
const H = 0.3, B = 0.15, TW = 0.0071, TF = 0.0107;
const threePlateI = () => sec(
  rect(1, B, TF, [0, H / 2 - TF / 2]),
  rect(2, B, TF, [0, -H / 2 + TF / 2]),
  rect(3, TW, H - 2 * TF, [0, 0]),
);

d('drawn sections through the engine', () => {
  it('three touching plates are the I template: A, I, S, J and the shear centre', () => {
    const r = analyzeDrawn(threePlateI(), catalogueOutline);
    expect(r.assembled.issues).toEqual([]);
    expect(r.assembled.pieces).toHaveLength(1);
    const p = r.properties!;
    const t = buildSectionGeometry({ kind: 'iSection', h: H, b: B, tw: TW, tf: TF, rootRadius: 0 });
    expect(rel(p.a, t.properties.a)).toBeLessThan(1e-9);
    expect(rel(p.iy, t.properties.iy)).toBeLessThan(1e-9);
    expect(rel(p.iz, t.properties.iz)).toBeLessThan(1e-9);
    expect(rel(p.sTop, t.properties.iy / (H / 2))).toBeLessThan(1e-9);
    expect(rel(p.j!, analyzeSectionTorsion({ geometry: t.geometry }).j)).toBeLessThan(1e-6);
    expect(p.jBasis).toBe('saintVenant');
    const sc = analyzeSectionShear({ geometry: t.geometry }).shearCentre;
    expect(Math.abs(p.shearCentre![0] - sc[0])).toBeLessThan(1e-6);
    expect(Math.abs(p.shearCentre![1] - sc[1])).toBeLessThan(1e-6);
    expect(p.zy!).toBeGreaterThan(p.sTop);
    expect(p.cw!).toBeGreaterThan(0);
  });

  it('a hollow rectangle is the same drawn as a rectangle with a hole', () => {
    const tube = analyzeDrawn(sec({ id: 1, shape: { kind: 'hollowRect', b: 0.2, h: 0.3, t: 0.01 }, at: [0, 0], rotationDeg: 0 }), catalogueOutline).properties!;
    const holed = analyzeDrawn(sec(rect(1, 0.2, 0.3, [0, 0]), rect(2, 0.18, 0.28, [0, 0], { void: true })), catalogueOutline).properties!;
    expect(rel(holed.a, 0.2 * 0.3 - 0.18 * 0.28)).toBeLessThan(1e-9);
    expect(rel(holed.iy, tube.iy)).toBeLessThan(1e-9);
    // Bredt: the closed cell is solved as closed, three orders over a slit tube.
    const bredt = (4 * (0.19 * 0.29) ** 2) / (2 * (0.19 + 0.29) / 0.01);
    expect(rel(holed.j!, bredt)).toBeLessThan(0.05);
  });

  it('two angles apart are two pieces: J summed, no common shear centre', () => {
    const L = (id: number, at: [number, number], mirror: boolean): DrawnPart => ({
      id, shape: { kind: 'polyline', points: [[0, 0.075], [0, 0], [0.075, 0]], t: 0.008 }, at, rotationDeg: 0, mirror,
    });
    const one = analyzeDrawn(sec(L(1, [0.005, 0], false)), catalogueOutline).properties!;
    const two = analyzeDrawn(sec(L(1, [0.005, 0], false), L(2, [-0.005, 0], true)), catalogueOutline);
    expect(two.assembled.issues).toEqual([{ issue: { kind: 'loose', pieces: 2 }, severity: 'warning' }]);
    // The mirrored piece is meshed on its own, so the two halves differ by the mesh only.
    expect(rel(two.properties!.j!, 2 * one.j!)).toBeLessThan(1e-3);
    expect(two.properties!.shearCentre).toBeNull();
    expect(rel(two.properties!.a, 2 * one.a)).toBeLessThan(1e-9);
    expect(Math.abs(two.properties!.yc)).toBeLessThan(1e-12);
  });

  it('the transformed section is the engine\'s when every n is 1, principal axes included', () => {
    // An unequal angle, so Iyz and the principal angle are not zero.
    const legs: DrawnPart = { id: 1, shape: { kind: 'polyline', points: [[0, 0.1], [0, 0], [0.06, 0]], t: 0.008 }, at: [0, 0], rotationDeg: 0 };
    const single = analyzeDrawn(sec(legs), catalogueOutline).properties!;
    // Split it into two materials with n = 1: the composite path, same numbers.
    const vertical = rect(1, 0.008, 0.104, [0, 0.048]);
    const horizontal = rect(2, 0.056, 0.008, [0.032, 0]);
    const split = analyzeDrawn(sec(vertical, { ...horizontal, materialId: 7, ratio: { e: 1, g: 1 } }), catalogueOutline).properties!;
    expect(split.composite).toBe(true);
    for (const k of ['a', 'yc', 'zc', 'iy', 'iz', 'iyz', 'i1', 'i2', 'thetaP', 'sTop', 'sBot', 'sLeft', 'sRight'] as const) {
      expect(rel(split[k], single[k]), k).toBeLessThan(1e-9);
    }
    expect(single.iyz).not.toBe(0);
  });

  it('a steel plate under a timber-like web is transformed by n', () => {
    const n = 20;
    const r = analyzeDrawn(sec(
      rect(1, 0.1, 0.3, [0, 0.15]),
      rect(2, 0.1, 0.01, [0, -0.005], { materialId: 2, ratio: { e: n, g: n } }),
    ), catalogueOutline).properties!;
    const aT = 0.1 * 0.3 + n * 0.1 * 0.01;
    const zc = (0.1 * 0.3 * 0.15 + n * 0.1 * 0.01 * -0.005) / aT;
    const iy = (0.1 * 0.3 ** 3) / 12 + 0.1 * 0.3 * (0.15 - zc) ** 2 + n * ((0.1 * 0.01 ** 3) / 12 + 0.1 * 0.01 * (-0.005 - zc) ** 2);
    expect(rel(r.a, aT)).toBeLessThan(1e-9);
    expect(rel(r.zc, zc)).toBeLessThan(1e-9);
    expect(rel(r.iy, iy)).toBeLessThan(1e-9);
    expect(r.zy).toBeNull();
    expect(r.shearCentre).toBeNull();
    expect(r.j).toBeGreaterThan(0);
    expect(r.jBasis).toBe('homogenised');
  });

  it('a catalogue profile with a cover plate on its top flange', () => {
    const name = 'IPE 300';
    const outline = catalogueOutline(name);
    if (!outline) return;
    const ipe: DrawnPart = { id: 1, shape: { kind: 'profile', name }, at: [0, 0], rotationDeg: 0 };
    const plate0 = rect(2, 0.2, 0.012, [0, 0]);
    const at = attachOffset(plate0, ipe, 'top', 'centre', catalogueOutline)!;
    expect(at[0]).toBeCloseTo(0, 9);
    expect(at[1]).toBeCloseTo(0.15 + 0.006, 6);
    const r = analyzeDrawn(sec(ipe, { ...plate0, at }), catalogueOutline);
    expect(r.assembled.issues).toEqual([]);
    expect(r.assembled.pieces).toHaveLength(1);
    const alone = analyzeDrawn(sec(ipe), catalogueOutline).properties!;
    expect(rel(r.properties!.a, alone.a + 0.2 * 0.012)).toBeLessThan(1e-6);
    expect(r.properties!.zc).toBeGreaterThan(0);
  });

  it('mass per metre from the densities', () => {
    const r = analyzeDrawn(sec(rect(1, 0.1, 0.2, [0, 0])), catalogueOutline, { density: () => 7850 }).properties!;
    expect(r.massPerM).toBeCloseTo(7850 * 0.02, 9);
    const u = analyzeDrawn(sec(rect(1, 0.1, 0.2, [0, 0])), catalogueOutline, { density: () => undefined }).properties!;
    expect(u.massPerM).toBeNull();
  });
});

describe('drawn section checks', () => {
  it('parts of two materials that overlap are an error; of one material, a warning', () => {
    const same = assembleDrawn(sec(rect(1, 0.1, 0.1, [0, 0]), rect(2, 0.1, 0.1, [0.05, 0])), catalogueOutline);
    expect(same.issues).toEqual([{ issue: expect.objectContaining({ kind: 'overlap', sameMaterial: true }), severity: 'warning' }]);
    const two = assembleDrawn(sec(rect(1, 0.1, 0.1, [0, 0]), rect(2, 0.1, 0.1, [0.05, 0], { materialId: 3 })), catalogueOutline);
    expect(two.issues[0]).toMatchObject({ issue: { kind: 'overlap', sameMaterial: false }, severity: 'error' });
    expect((two.issues[0]!.issue as { area: number }).area).toBeCloseTo(0.005, 9);
  });

  it('touching parts are not overlapping', () => {
    expect(assembleDrawn(threePlateI(), catalogueOutline).issues).toEqual([]);
  });

  it('a hole outside the section is an error, one across its edge a warning', () => {
    const out = assembleDrawn(sec(rect(1, 0.1, 0.1, [0, 0]), rect(2, 0.02, 0.02, [1, 1], { void: true })), catalogueOutline);
    expect(out.issues).toEqual([{ issue: { kind: 'holeOutside', partId: 2, fully: true }, severity: 'error' }]);
    const edge = assembleDrawn(sec(rect(1, 0.1, 0.1, [0, 0]), rect(2, 0.02, 0.02, [0.05, 0], { void: true })), catalogueOutline);
    expect(edge.issues).toEqual([{ issue: { kind: 'holeOutside', partId: 2, fully: false }, severity: 'warning' }]);
  });

  it('degenerate parts, unknown profiles and an empty drawing are refused', () => {
    expect(assembleDrawn(sec(rect(1, 0, 0.1, [0, 0])), catalogueOutline).issues.map((i) => i.issue.kind)).toEqual(['degenerate', 'empty']);
    expect(assembleDrawn(sec({ id: 1, shape: { kind: 'profile', name: 'NOPE 1' }, at: [0, 0], rotationDeg: 0 }), () => null).issues[0]!.issue)
      .toEqual({ kind: 'unknownProfile', partId: 1, name: 'NOPE 1' });
    expect(assembleDrawn(sec({ id: 1, shape: { kind: 'hollowRect', b: 0.1, h: 0.1, t: 0.06 }, at: [0, 0], rotationDeg: 0 }), catalogueOutline).issues[0]!.issue.kind).toBe('degenerate');
  });
});

describe('drawn section geometry', () => {
  it('a bent plate keeps its thickness through the corners: area = t × centreline', () => {
    const pts: Array<[number, number]> = [[0.05, 0.02], [0.05, 0], [0, 0], [0, 0.1], [0.05, 0.1], [0.05, 0.08]];
    const ring = thickPolyline(pts, 0.002)!;
    const L = 0.02 + 0.05 + 0.1 + 0.05 + 0.02;
    expect(Math.abs(signedArea(ring))).toBeCloseTo(0.002 * L, 12);
  });

  it('rotation and mirror move the part and keep its moments', () => {
    const a = momentsOf([[[[0, 0], [0.2, 0], [0.2, 0.1], [0, 0.1]]]]);
    const part: DrawnPart = { id: 1, shape: { kind: 'rect', b: 0.2, h: 0.1 }, at: [1, 2], rotationDeg: 90, mirror: true };
    const asm = assembleDrawn(sec(part), catalogueOutline);
    const m = momentsOf(asm.parts[0]!.outline);
    expect(m.a).toBeCloseTo(a.a, 12);
    expect(m.sy / m.a).toBeCloseTo(1, 12);
    expect(m.sz / m.a).toBeCloseTo(2, 12);
    // Turned a quarter: the long side now runs vertically.
    const iyOwn = m.iyy - m.a * 4, izOwn = m.izz - m.a * 1;
    expect(iyOwn).toBeCloseTo((0.1 * 0.2 ** 3) / 12, 12);
    expect(izOwn).toBeCloseTo((0.2 * 0.1 ** 3) / 12, 12);
  });

  it('a dragged part snaps its edge onto the nearest edge within the tolerance', () => {
    const base = rect(1, 0.2, 0.02, [0, 0]);
    const moving = rect(2, 0.01, 0.2, [0, 0]);
    // Its bottom edge 3 mm above the flange top: pulled onto it. Its centre on the flange's.
    const at = snapOffset(moving, [0.002, 0.01 + 0.1 + 0.003], [base], 0.005, catalogueOutline);
    expect(at[1]).toBeCloseTo(0.11, 12);
    expect(at[0]).toBeCloseTo(0, 12);
    const far = snapOffset(moving, [0.05, 0.5], [base], 0.005, catalogueOutline);
    expect(far).toEqual([0.05, 0.5]);
  });
});

import { compositeStress } from '../drawn-properties';
import { analyzeSectionBending } from '../../engine/wasm-solver';

d('stress in a section of several materials', () => {
  const vertical = rect(1, 0.008, 0.104, [0, 0.048]);
  const horizontal = rect(2, 0.056, 0.008, [0.032, 0]);

  it('with every n = 1 it is the engine\'s stress, rotation and unsymmetric bending included', () => {
    const rot = 0.3;
    const homo = analyzeDrawn(sec(vertical, horizontal), catalogueOutline);
    const comp = analyzeDrawn(sec(vertical, { ...horizontal, materialId: 7, ratio: { e: 1, g: 1 } }), catalogueOutline);
    const f = compositeStress(comp, rot)!;
    for (const [n, my, mz] of [[10, 0, 0], [0, 1, 0], [0, 0, 1], [-5, 2, -3]] as const) {
      const eng = analyzeSectionBending({ geometry: { ...homo.geometry!, rotation: rot }, n, my, mz, forcesAreLocal: true });
      const got = f(n, my, mz);
      expect(rel(got.max, eng.max.sigma)).toBeLessThan(1e-6);
      expect(rel(got.min, eng.min.sigma)).toBeLessThan(1e-6);
    }
  });

  it('the stiffer part carries n times the stress at the same fibre', () => {
    const n = 15;
    const a = analyzeDrawn(sec(rect(1, 0.1, 0.2, [0, 0.1]), rect(2, 0.1, 0.2, [0, -0.1], { materialId: 2, ratio: { e: n, g: n } })), catalogueOutline);
    const p = a.properties!;
    const f = compositeStress(a)!;
    const r = f(0, 1, 0);
    // The neutral axis sits in the stiff part, so its fibre at the interface is the most
    // stressed in tension (n times what the soft part has there) and its bottom in compression.
    const interface_ = (n * (0 - p.zc)) / p.iy, top = (0.2 - p.zc) / p.iy, bot = (n * (-0.2 - p.zc)) / p.iy;
    expect(interface_).toBeGreaterThan(top);
    expect(rel(r.max, interface_)).toBeLessThan(1e-9);
    expect(rel(r.min, bot)).toBeLessThan(1e-9);
  });
});
