import { describe, it, expect } from 'vitest';
import { jointSceneLayout, hasSceneContent } from '../joint-layout';
import { designJoint } from '../../connection/joint-design';
import type { BoltLayoutChoice } from '../../connection/bolted-joint';

const elements = new Map([[1, { id: 1, nodeI: 10, nodeJ: 11 }]]);
const combos = [{
  id: 1, name: 'C1',
  elementForces: [{ elementId: 1, NI: 50, VyI: 40, VzI: 30 }],
}];
const bolts: BoltLayoutChoice = {
  diameterMm: 20, grade: 'A325', threads: 'included', count: 4, rows: 2,
  spacingMm: 70, edgeDistanceMm: 40,
};
const at = { x: 10, y: 5, z: 2 };
const designed = () => designJoint({
  nodeId: 10, elementIds: [1], elements, combos, originM: at,
  bolts, plate: { thicknessMm: 12, fuMPa: 400 },
});

describe('a complete joint places its parts', () => {
  it('puts the plate at the joint, at the size the design carries', () => {
    const l = jointSceneLayout(designed());
    expect(l.plate).not.toBeNull();
    expect(l.plate!.centreM).toEqual(at);
    expect(l.plate!.thicknessM).toBeCloseTo(0.012, 9);
    // 2 per row: (2−1)·70 + 2·40 = 150 mm each way.
    expect(l.plate!.lengthM).toBeCloseTo(0.150, 9);
  });

  it('places one bolt per hole, and no more', () => {
    const l = jointSceneLayout(designed());
    expect(l.bolts).toHaveLength(4);
  });

  /*
   * The BOLT, not the hole. `holeDiameterM` is 22 mm for a 20 mm bolt — Tabla J.3.3 — and a
   * shank drawn to fill it would be 2 mm too fat on every one.
   */
  it('draws the shank at the bolt diameter, not the hole', () => {
    const l = jointSceneLayout(designed());
    expect(l.bolts[0].diameterM * 1000).toBeCloseTo(20, 6);
    expect(l.bolts[0].diameterM * 1000).not.toBeCloseTo(22, 1);
  });

  it('the bolts sit inside the plate', () => {
    const l = jointSceneLayout(designed());
    for (const b of l.bolts) {
      const du = Math.abs(b.centreM.x - at.x);
      const dv = Math.abs(b.centreM.y - at.y);
      expect(du).toBeLessThanOrEqual(l.plate!.lengthM / 2 + 1e-9);
      expect(dv).toBeLessThanOrEqual(l.plate!.widthM / 2 + 1e-9);
    }
  });

  it('the bolt group is centred on the joint', () => {
    const l = jointSceneLayout(designed());
    const cx = l.bolts.reduce((s, b) => s + b.centreM.x, 0) / l.bolts.length;
    const cy = l.bolts.reduce((s, b) => s + b.centreM.y, 0) / l.bolts.length;
    expect(cx).toBeCloseTo(at.x, 9);
    expect(cy).toBeCloseTo(at.y, 9);
  });

  it('and the shank is as long as the plate is thick', () => {
    const l = jointSceneLayout(designed());
    expect(l.bolts[0].lengthM).toBeCloseTo(l.plate!.thicknessM, 9);
  });
});

describe('the frame follows the member', () => {
  /*
   * Measured on an ASYMMETRIC group — three bolts per row by two rows.
   *
   * My first version used the 2×2 default, which is square and therefore invariant under a 90°
   * rotation: the x-coordinates came back identical and the test read that as the axis being
   * ignored. The layout was right; the pattern could not tell the two apart.
   */
  it('rotates the group with the axis', () => {
    const asymmetric = () => designJoint({
      nodeId: 10, elementIds: [1], elements, combos, originM: at,
      bolts: { ...bolts, count: 6, rows: 2 }, plate: { thicknessMm: 12, fuMPa: 400 },
    });
    const along = jointSceneLayout(asymmetric(), { x: 1, y: 0, z: 0 });
    const across = jointSceneLayout(asymmetric(), { x: 0, y: 1, z: 0 });
    const spreadX = (l: typeof along) =>
      Math.max(...l.bolts.map((b) => b.centreM.x)) - Math.min(...l.bolts.map((b) => b.centreM.x));
    // Along x the long side spans x; across it, the short one does.
    expect(spreadX(along)).toBeGreaterThan(spreadX(across));
  });

  /*
   * A vertical member makes the horizontal cross-axis degenerate. Falling back to global Y keeps
   * the plate a plate; picking the degenerate basis would collapse it to a line.
   */
  it('does not collapse on a vertical member', () => {
    const l = jointSceneLayout(designed(), { x: 0, y: 0, z: 1 });
    expect(l.bolts).toHaveLength(4);
    const spread = Math.max(...l.bolts.map((b) => b.centreM.y))
      - Math.min(...l.bolts.map((b) => b.centreM.y));
    expect(spread).toBeGreaterThan(0);
  });

  it('normalises an unnormalised axis', () => {
    const unit = jointSceneLayout(designed(), { x: 1, y: 0, z: 0 });
    const long = jointSceneLayout(designed(), { x: 7, y: 0, z: 0 });
    expect(long.bolts.map((b) => b.centreM.x)).toEqual(unit.bolts.map((b) => b.centreM.x));
  });
});

describe('nothing fictional is placed', () => {
  it('an undesigned joint places nothing', () => {
    const d = designJoint({ nodeId: 10, elementIds: [1], elements, combos, originM: at });
    const l = jointSceneLayout(d);
    expect(l.plate).toBeNull();
    expect(l.bolts).toEqual([]);
    expect(hasSceneContent(l)).toBe(false);
    expect(l.emptyReasonKeys.length).toBeGreaterThan(0);
  });

  it('an incomplete joint places nothing, and says what is missing', () => {
    const d = designJoint({ nodeId: 10, elementIds: [1], elements, combos, originM: at, bolts });
    expect(d.state).toBe('incomplete');
    const l = jointSceneLayout(d);
    expect(hasSceneContent(l)).toBe(false);
    expect(l.emptyReasonKeys).toContain('plate.missing.thickness');
  });

  /*
   * An `exceeded` joint HAS geometry, and hiding it would hide exactly what the user needs to
   * look at. Only the ABSENCE of geometry stops the drawing — never the verdict about it.
   */
  it('but a failing joint is still drawn', () => {
    const d = designJoint({
      nodeId: 10, elementIds: [1], elements, combos, originM: at,
      bolts: { ...bolts, count: 1, rows: 1, spacingMm: 10 },
      plate: { thicknessMm: 12, fuMPa: 400 },
    });
    expect(d.state).toBe('exceeded');
    expect(hasSceneContent(jointSceneLayout(d))).toBe(true);
  });
});

describe('battens are placed only where §E.6 put them', () => {
  it('appear along the member when the layout exists', () => {
    const d = designJoint({
      nodeId: 10, elementIds: [1], elements, combos, originM: at,
      bolts, plate: { thicknessMm: 12, fuMPa: 400 },
      battens: { arrangement: 'doubleBack', gapMm: 10, lengthM: 6 },
    });
    const l = jointSceneLayout(d, { x: 1, y: 0, z: 0 });
    expect(l.battens).toHaveLength(4);
    expect(l.battens.map((b) => b.atM)).toEqual([0, 2, 4, 6]);
    // Placed along the axis from the joint.
    expect(l.battens[3].centreM.x).toBeCloseTo(at.x + 6, 9);
  });

  it('and not at all when the member is not built up', () => {
    const l = jointSceneLayout(designed());
    expect(l.battens).toEqual([]);
  });
});
