import { describe, expect, it } from 'vitest';
import { straightSegment, type BarPath, type Point3 } from '../../../codes/cirsoc201/bar-geometry';
import { ColumnBarIndex } from '../column-bar-index';

function bar(id: string, x: number, y: number, z0 = 0, z1 = 3): BarPath {
  return {
    id, diameterMm: 20, role: 'longitudinal',
    segments: [straightSegment({ x, y, z: z0 }, { x, y, z: z1 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: Math.abs(z1 - z0), ownerElementIds: [],
    source: 'generated', locked: false, refs: [],
  };
}

type Member = { elementId: number; bars: BarPath[] };

// Exhaustive pre-index query: retain its tolerance, first-point convention and ordering.
function reference(members: Member[], centre: Point3, radius: number) {
  return members.flatMap(m => m.bars).filter(b => {
    const p = b.segments[0]?.start;
    if (!p || Math.hypot(p.x - centre.x, p.y - centre.y) > radius) return false;
    const zs = b.segments.flatMap(s => [s.start.z, s.end.z]);
    return !(Math.min(...zs) > centre.z + 0.02 || Math.max(...zs) < centre.z - 0.02);
  }).map(b => ({ id: b.id, diameterMm: b.diameterMm, x: b.segments[0].start.x, y: b.segments[0].start.y }));
}

function expectEquivalent(index: ColumnBarIndex, members: Member[], centre: Point3, radius: number) {
  const actual = index.query(centre, centre.z, radius).map(({ id, diameterMm, x, y }) => ({ id, diameterMm, x, y }));
  expect(actual).toEqual(reference(members, centre, radius));
}

describe('column cage spatial index', () => {
  it('matches exhaustive queries across cells, elevations and both production radii', () => {
    const members: Member[] = Array.from({ length: 100 }, (_, i) => ({
      elementId: i,
      bars: Array.from({ length: 12 }, (_, j) => bar(`${i}:${j}`,
        (i % 10 - 5) * 1.5 + (j % 3) * 0.08,
        (Math.floor(i / 10) - 5) * 1.5 + (j % 4) * 0.08,
        j % 3, 3 + j % 3)),
    }));
    const index = new ColumnBarIndex(members);
    for (const radius of [1, 1.5]) for (const z of [-0.021, -0.02, 0, 3, 5.02, 5.021]) {
      for (let i = -5; i <= 5; i++) expectEquivalent(index, members, { x: i * 1.5, y: -i * 1.5, z }, radius);
    }
  });

  it('includes exact radius/elevation boundaries and every segment endpoint', () => {
    const multi = bar('multi', -1.5, 0, 5, 4);
    multi.segments.push(straightSegment({ x: 8, y: 8, z: 4 }, { x: 8, y: 8, z: -0.02 }));
    const empty = bar('empty', 0, 0); empty.segments = [];
    const members = [{ elementId: 1, bars: [
      multi, empty, bar('at', 1.5, 0, 0.02, 3), bar('outside', 1.50000001, 0),
      bar('above', 0, 0, 0.02000001, 3), bar('below', 0, 0, -3, -0.02000001),
      bar('reversed', 0, 0, 3, -0.02),
    ] }];
    const index = new ColumnBarIndex(members);
    expectEquivalent(index, members, { x: 0, y: 0, z: 0 }, 1.5);
    expect(index.query({ x: 0, y: 0 }, 0, 1.5).map(b => b.id)).toEqual(['multi', 'at', 'reversed']);
  });

  it('places appended joint ties in member order, including initially empty members', () => {
    const members = [
      { elementId: 9, bars: [bar('a', 0, 0)] },
      { elementId: 3, bars: [] as BarPath[] },
      { elementId: 1, bars: [bar('b', 0, 0)] },
    ];
    const index = new ColumnBarIndex(members);
    for (const member of members.slice(0, 2)) {
      const ties = [bar(`tie:${member.elementId}`, 0, 0)];
      index.append(member.elementId, ties);
      member.bars.push(...ties);
    }
    expectEquivalent(index, members, { x: 0, y: 0, z: 1 }, 1);
    expect(index.query({ x: 0, y: 0 }, 1, 1).map(b => b.id)).toEqual(['a', 'tie:9', 'tie:3', 'b']);
  });

  it('retains points that round onto the radius across a cell boundary', () => {
    const members = [{ elementId: 1, bars: [bar('rounded', -Number.EPSILON / 4, 0)] }];
    const index = new ColumnBarIndex(members);
    expectEquivalent(index, members, { x: 1, y: 0, z: 1 }, 1);
    expect(index.query({ x: 1, y: 0 }, 1, 1).map(b => b.id)).toEqual(['rounded']);
  });

  it('does not re-read geometry on repeated queries', () => {
    const b = bar('cached', 0, 0);
    let reads = 0;
    const segments = b.segments;
    Object.defineProperty(b, 'segments', { get() { reads++; return segments; } });
    const index = new ColumnBarIndex([{ elementId: 1, bars: [b] }]);
    const afterBuild = reads;
    expect(afterBuild).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) expect(index.query({ x: 0, y: 0 }, 1, 1)).toHaveLength(1);
    expect(reads).toBe(afterBuild);
  });

  it('rebuilds elevation bounds after lap geometry replacement', () => {
    const members = [{ elementId: 1, bars: [bar('lap', 0, 0, 0, 3)] }];
    expect(new ColumnBarIndex(members).query({ x: 0, y: 0 }, 3.5, 1)).toHaveLength(0);
    members[0].bars = [bar('lap', 0, 0, 0, 4)];
    expectEquivalent(new ColumnBarIndex(members), members, { x: 0, y: 0, z: 3.5 }, 1);
  });

  it('falls back without losing exhaustive semantics for extreme coordinates', () => {
    const members = [{ elementId: 1, bars: [bar('normal', 0, 0), bar('huge', 1e20, 1e20), bar('nan', NaN, 0)] }];
    const index = new ColumnBarIndex(members);
    for (const centre of [{ x: 0, y: 0, z: 1 }, { x: 1e20, y: 1e20, z: 1 }, { x: NaN, y: 0, z: 1 }]) {
      for (const radius of [1, 100, Infinity]) expectEquivalent(index, members, centre, radius);
    }
  });
});
