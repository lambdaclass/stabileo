import { describe, it, expect } from 'vitest';
import { gravityLayout, type GravityModel } from '../plan-gravity';

type Node = { id: number; x: number; y: number; z: number };
type Element = { id: number; nodeI: number; nodeJ: number; type?: 'frame' | 'truss' };

function builder() {
  const nodes = new Map<number, Node>();
  const elements = new Map<number, Element>();
  let n = 1, e = 1;
  const node = (x: number, y: number, z: number) => {
    for (const p of nodes.values()) if (p.x === x && p.y === y && p.z === z) return p.id;
    nodes.set(n, { id: n, x, y, z });
    return n++;
  };
  const bar = (a: number, b: number, type: 'frame' | 'truss' = 'frame') => { elements.set(e, { id: e++, nodeI: a, nodeJ: b, type }); };
  return { nodes, elements, node, bar, model: (): GravityModel => ({ nodes, elements }) };
}

const sum = (m: Map<number, number>) => [...m.values()].reduce((s, a) => s + a, 0);
const keys = (l: ReturnType<typeof gravityLayout>) => l.notes.map((x) => x.key);

/** A 6 × 6 m floor at 3 m with one beam 1 m over its front edge and nothing over the rest. */
function floorUnderOneLowBeam(): GravityModel {
  const b = builder();
  const corners: Array<[number, number]> = [[0, 0], [6, 0], [6, 6], [0, 6]];
  const floor = corners.map(([x, y]) => b.node(x, y, 3));
  corners.forEach(([x, y], i) => b.bar(b.node(x, y, 0), floor[i]!));
  floor.forEach((id, i) => b.bar(id, floor[(i + 1) % 4]!));
  const p0 = b.node(0, 0, 4), p1 = b.node(6, 0, 4);
  b.bar(floor[0]!, p0); b.bar(floor[1]!, p1); b.bar(p0, p1);
  return b.model();
}

/**
 * A 10 × 6 m ring of beams at 4 m under two gable trusses (truss members) at y = 0 and y = 6,
 * `depth` deep at the ridge, with frame purlins at x = 2.5, 5 and 7.5 when `purlins`.
 */
function trussedRing(depth: number, purlins: boolean): GravityModel {
  const b = builder();
  const corners: Array<[number, number]> = [[0, 0], [10, 0], [10, 6], [0, 6]];
  const ring = corners.map(([x, y]) => b.node(x, y, 4));
  corners.forEach(([x, y], i) => b.bar(b.node(x, y, 0), ring[i]!));
  ring.forEach((id, i) => b.bar(id, ring[(i + 1) % 4]!));
  const roofZ = (x: number) => 4 + depth * (1 - Math.abs(x - 5) / 5);
  for (const y of [0, 6]) {
    const xs = [0, 2.5, 5, 7.5, 10];
    for (let i = 0; i + 1 < xs.length; i++) b.bar(b.node(xs[i]!, y, roofZ(xs[i]!)), b.node(xs[i + 1]!, y, roofZ(xs[i + 1]!)), 'truss');
    b.bar(b.node(5, y, 4), b.node(5, y, 4 + depth), 'truss');
  }
  if (purlins) for (const x of [2.5, 5, 7.5]) b.bar(b.node(x, 0, roofZ(x)), b.node(x, 6, roofZ(x)));
  return b.model();
}

describe('a panel only partly under low roof structure keeps its area load', () => {
  it('a floor with one low beam over an edge is loaded, and the derivation says so', () => {
    const layout = gravityLayout(floorUnderOneLowBeam(), { mode: 'panels', tributaryWidth: 3 });
    expect(layout.areaByLevel.get(3)).toBeCloseTo(36, 6);
    expect(sum(layout.areaOf) + sum(layout.roofAreaOf)).toBeGreaterThanOrEqual(36 - 1e-6);
    expect(keys(layout)).not.toContain('loadPlan.gravity.lowHeadroom');
    expect(keys(layout)).toContain('loadPlan.gravity.headroomUnclear');
  });

  it('by width, the beam under the low one keeps its load', () => {
    const layout = gravityLayout(floorUnderOneLowBeam(), { mode: 'width', tributaryWidth: 3 });
    const floorBeams = [...floorUnderOneLowBeam().elements.values()].filter((e) => e.id >= 5 && e.id <= 8).map((e) => e.id);
    for (const id of floorBeams) expect(layout.widthMembers.map((m) => m.elementId)).toContain(id);
    expect(keys(layout)).not.toContain('loadPlan.gravity.membersLowHeadroom');
  });
});

describe('trusses count as the roof\'s structure', () => {
  it('a ring under a deep truss is loaded with a diagnostic, not silently as a storey', () => {
    const layout = gravityLayout(trussedRing(3, true), { mode: 'panels', tributaryWidth: 3 });
    expect(layout.areaByLevel.get(4)).toBeCloseTo(60, 6);
    expect(keys(layout)).toContain('loadPlan.gravity.headroomUnclear');
    expect(keys(layout)).not.toContain('loadPlan.gravity.lowHeadroom');
  });

  it('a ring under a shallow truss with loaded purlins is the roof\'s structure', () => {
    const layout = gravityLayout(trussedRing(1.5, true), { mode: 'panels', tributaryWidth: 3 });
    expect(layout.areaByLevel.get(4)).toBeUndefined();
    expect(keys(layout)).toContain('loadPlan.gravity.lowHeadroom');
    expect(sum(layout.roofAreaOf)).toBeGreaterThan(0);
  });

  it('a ring under trusses that carry no area load takes the roof load itself', () => {
    const layout = gravityLayout(trussedRing(1.5, false), { mode: 'panels', tributaryWidth: 3 });
    expect(layout.areaByLevel.get(4)).toBeCloseTo(60, 6);
    expect(sum(layout.roofAreaOf)).toBeCloseTo(60, 6);
    expect(keys(layout)).not.toContain('loadPlan.gravity.lowHeadroom');
  });
});
