/**
 * Every typology against a hand calculation. IPE 360 beam (d 360, bf 170, tf 12,7, tw 8, F-24),
 * HEB 240 column (d 240, bf 240, tf 17, tw 10, r 21), A325 Ø20 bolts: φ·Fnv·Ab = 0,75·330·3,1416/10
 * = 77,75 kN, φ·Fnt·Ab = 146,08 kN; fillets E70 (FEXX 480): 17,28 kN per cm² of throat area.
 */
import { describe, it, expect } from 'vitest';
import { designTypology, proposeTypology, sizeTypology, type JointMember, type TypologyContext } from '../index';

const IPE360 = { name: 'IPE 360', shape: 'I', d: 360, bf: 170, tf: 12.7, tw: 8, r: 18, A: 7270, Fy: 240, Fu: 370 };
const HEB240 = { name: 'HEB 240', shape: 'H', d: 240, bf: 240, tf: 17, tw: 10, r: 21, A: 10600, Fy: 240, Fu: 370 };
const M = (o: Partial<JointMember> & Pick<JointMember, 'id' | 'kind'>): JointMember => ({ dir: { x: 1, y: 0, z: 0 }, inclination: 0, section: IPE360, N: 0, V: 0, M: 0, released: false, ...o });
const ctx = (members: JointMember[], support: TypologyContext['support'] = null): TypologyContext => ({ nodeId: 1, origin: { x: 0, y: 0, z: 3 }, members, support });
const P = { plateT: 10, boltD: 20, boltGrade: 'A325' as const, rows: 3, weldLeg: 6 };
const get = (d: ReturnType<typeof designTypology>, label: string) => d.checks.find((c) => c.labelKey === label)!;

describe('shear tab', () => {
  // V = 100 kN, three bolts at 60 mm, 35 mm ends: plate 190 × 10.
  const d = designTypology('shearTab', ctx([M({ id: 1, kind: 'beam', V: 100, released: true }), M({ id: 2, kind: 'column', section: HEB240, dir: { x: 0, y: 0, z: -1 }, inclination: -90 })]), P, 1);
  it('bolts, bearing on the web, plate shear and block shear by hand', () => {
    expect(get(d, 'joint.typ.check.boltShear').capacity).toBeCloseTo(77.75, 1);
    expect(get(d, 'joint.typ.check.bearing').capacity).toBeCloseTo(106.56, 1);   // web 8 mm: 0,75·2,4·20·8·370
    expect(get(d, 'joint.typ.check.plateShear').capacity).toBeCloseTo(206.46, 1); // rupture, Anv = (190 − 66)·10
    expect(get(d, 'joint.typ.check.blockShear').capacity).toBeCloseTo(233.1, 1);
    expect(get(d, 'joint.typ.check.weld').capacity).toBeCloseTo(17.28 * (4.2426 * 190 * 2) / 100, 0);
    expect(d.state).toBe('designed');
  });
});

describe('end plate', () => {
  // M = 100 kN·m: Ff = 100/0,3473 = 287,9 kN on two bolts: 144,0 kN each. Plate 20 mm, g 90,
  // bp 190: b' = 31, a' = 60, tc = √(4·146080·31/(0,9·95·370)) = 23,93 mm; with t = 20 the bolt
  // takes 146,08·(20/23,93)²·(1 + 0,768·0,370) = 131,1 kN: prying governs.
  const members = [M({ id: 1, kind: 'beam', M: 100, V: 50 }), M({ id: 2, kind: 'column', section: HEB240, dir: { x: 0, y: 0, z: -1 }, inclination: -90 })];
  const d = designTypology('endPlate', ctx(members), { ...P, plateT: 20, rows: 1, weldLeg: 8 }, 1);
  it('carries the flange force on the tension bolts, with prying', () => {
    expect(get(d, 'joint.typ.check.boltTensionShear').demand).toBeCloseTo(143.97, 1);
    expect(get(d, 'joint.typ.check.prying').capacity).toBeCloseTo(131.1, 0);
    expect(d.state).toBe('exceeded');
  });
  it('checks the column: flange bending, web yielding and the panel', () => {
    expect(get(d, 'joint.typ.check.flangeBending').capacity).toBeCloseTo(390.15, 1);
    expect(get(d, 'joint.typ.check.panelZone').capacity).toBeCloseTo(311.04, 1);
  });
  it('is sized until it holds: a thicker plate', () => {
    const s = sizeTypology('endPlate', ctx(members), 1, { plateT: 20, rows: 1, weldLeg: 8, boltD: 20 });
    expect(s.state).toBe('designed');
    expect(s.params.plateT).toBeGreaterThan(20);
  });
});

describe('base plate', () => {
  // HEB 240 on 340 × 340 × 20, 800 kN: l = n = 74, t = 74·√(2·800000/(0,9·240·115600)) = 18,73 mm.
  const d = designTypology('basePinned', ctx([M({ id: 1, kind: 'column', section: HEB240, dir: { x: 0, y: 0, z: 1 }, inclination: 90, N: -800, V: 30 })], 'pinned'), { ...P, plateT: 20 }, 1);
  it('bears on the concrete and bends the plate', () => {
    expect(get(d, 'joint.typ.check.base.plate').demand).toBeCloseTo(18.73, 1);
    expect(get(d, 'joint.typ.check.base.bearing').demand).toBeCloseTo(800000 / (340 * 340), 3);
    expect(get(d, 'joint.typ.check.base.anchorShear').capacity).toBeCloseTo(34.87, 1);
  });
});

describe('splice', () => {
  // 80 kN·m: Ff = 230,3 kN on four bolts per flange side: 57,6 kN; plate 170 × 12 with two holes:
  // An = 15,12 cm² < 0,85·20,4 → φRn = 0,75·370·15,12/10 = 419,6 kN.
  const d = designTypology('splice', ctx([M({ id: 1, kind: 'beam', M: 80, V: 40 }), M({ id: 2, kind: 'beam', dir: { x: -1, y: 0, z: 0 }, M: 80, V: 40 })]), { ...P, plateT: 12, rows: 2 }, 1);
  it('carries the flange force across the cut', () => {
    expect(get(d, 'joint.typ.check.boltShear').demand).toBeCloseTo(57.59, 1);
    expect(get(d, 'joint.typ.check.plateTension').capacity).toBeCloseTo(419.6, 1);
    expect(get(d, 'joint.typ.check.webBolts').capacity).toBeCloseTo(155.5, 1);
  });
});

describe('gusset', () => {
  // 200 kN, three bolts at 60: L = 120, lw = 2·120·tan 30° + 70 = 208,6 mm; yielding 0,9·240·20,86 = 450,5 kN.
  const d = designTypology('gusset', ctx([M({ id: 3, kind: 'brace', section: null, dir: { x: 0.707, y: 0, z: 0.707 }, inclination: 45, N: 200 })]), P, 3);
  it('spreads the brace force over the Whitmore width', () => {
    expect(get(d, 'joint.typ.check.whitmore').capacity).toBeCloseTo(450.5, 1);
    expect(get(d, 'joint.typ.check.boltShear').demand).toBeCloseTo(66.67, 1);
  });
});

describe('the proposal', () => {
  const col = M({ id: 2, kind: 'column', section: HEB240, dir: { x: 0, y: 0, z: -1 }, inclination: -90 });
  it('reads the roles at the joint', () => {
    expect(proposeTypology([col], 'fixed').kind).toBe('baseFixed');
    expect(proposeTypology([col], 'pinned').kind).toBe('basePinned');
    expect(proposeTypology([M({ id: 1, kind: 'beam' }), col], null).kind).toBe('endPlate');
    expect(proposeTypology([M({ id: 1, kind: 'beam', released: true }), col], null).kind).toBe('shearTab');
    expect(proposeTypology([M({ id: 1, kind: 'beam', inclination: 10 }), col], null).kind).toBe('knee');
    expect(proposeTypology([M({ id: 1, kind: 'beam', inclination: -10, dir: { x: 0.98, y: 0, z: -0.17 } }), M({ id: 4, kind: 'beam', inclination: -10, dir: { x: -0.98, y: 0, z: -0.17 } })], null).kind).toBe('apex');
    expect(proposeTypology([M({ id: 1, kind: 'beam' }), M({ id: 4, kind: 'beam', dir: { x: -1, y: 0, z: 0 } })], null).kind).toBe('splice');
    expect(proposeTypology([M({ id: 3, kind: 'brace' }), col], null).kind).toBe('gusset');
    // A lattice of angles: a gusset, on its most loaded member.
    const L = { name: '2L100', shape: 'L', d: 100, bf: 100, tf: 10, tw: 10, A: 1900, Fy: 240, Fu: 370 };
    const lat = proposeTypology([M({ id: 5, kind: 'beam', section: L, N: 20 }), M({ id: 6, kind: 'beam', section: L, N: -180, dir: { x: 0, y: 0, z: -1 } })], null);
    expect(lat).toEqual({ kind: 'gusset', mainId: 6 });
  });
  it('a knee checks the column like an end plate, an apex does not', () => {
    const knee = designTypology('knee', ctx([M({ id: 1, kind: 'beam', inclination: 10, M: 60, V: 30 }), col]), { ...P, plateT: 20, rows: 1 }, 1);
    expect(knee.checks.some((c) => c.labelKey === 'joint.typ.check.panelZone')).toBe(true);
    const apex = designTypology('apex', ctx([M({ id: 1, kind: 'beam', inclination: -10, M: 60 }), M({ id: 4, kind: 'beam', inclination: -10, M: 60 })]), { ...P, plateT: 20, rows: 1 }, 1);
    expect(apex.checks.some((c) => c.labelKey === 'joint.typ.check.panelZone')).toBe(false);
    expect(apex.parts.filter((p) => p.kind === 'plate')).toHaveLength(2);
  });
});
