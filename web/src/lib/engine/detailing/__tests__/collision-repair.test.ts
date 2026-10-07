import { describe, expect, it, vi } from 'vitest';
import { CollisionGeometry } from '../../../wasm/dedaliano_engine.js';
import { registerCollisionKernel } from '../collision-kernel';
import { detectCollisions, prepareCollisionRepair, type CollisionResult } from '../collision';
import { repairConflicts } from '../coordinate-floor';
import { buildStraightBarWithHooks, straightSegment, type BarPath } from '../../../codes/cirsoc201/bar-geometry';

function bar(id: string, y: number, options: Partial<BarPath> = {}): BarPath {
  return { id, diameterMm: 20, role: 'longitudinal',
    segments: [straightSegment({ x: -1, y, z: 0 }, { x: 1, y, z: 0 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 2, ownerElementIds: [1], source: 'generated', locked: false, refs: [], ...options };
}
function translate(bar: BarPath, dy: number, dz = 0): BarPath {
  return { ...bar, segments: bar.segments.map(s => ({ ...s,
    start: { ...s.start, y: s.start.y + dy, z: s.start.z + dz },
    end: { ...s.end, y: s.end.y + dy, z: s.end.z + dz },
  })) };
}
const reported = (r: CollisionResult) => ({ conflicts: r.conflicts, barCount: r.barCount, constructible: r.constructible });
const need25 = () => 0.025;

describe('incremental collision repair', () => {
  it('removes old pairs, discovers new neighbors on either side, and retains stationary conflicts', () => {
    let bars = [bar('z', -1), bar('b', -0.97), bar('c', 1), bar('a', 1.03), bar('e', 3), bar('f', 3.03)];
    const session = prepareCollisionRepair(bars)!;
    try {
      expect(session).not.toBeNull();
      expect(session.initial).toEqual(detectCollisions(bars));
      for (const [index, dy] of [[3, -2], [0, 2], [3, 4], [0, -2], [3, -2]]) {
        bars = bars.map((b, i) => i === index ? translate(b, dy) : b);
        const next = session.update(bars, new Set([bars[index].id]));
        expect(reported(next)).toEqual(reported(detectCollisions(bars, { kernel: false })));
        expect(next.barPairsTested).toBeLessThan(detectCollisions(bars).barPairsTested);
      }
      const unchanged = session.update(bars, new Set());
      expect(unchanged.barPairsTested).toBe(0);
      expect(reported(unchanged)).toEqual(reported(detectCollisions(bars)));
    } finally { session.free(); }
  });

  it('matches full sweeps through repeated multi-bar moves with hooks, ties, empty and coincident geometry', () => {
    let seed = 2917;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    let bars = Array.from({ length: 35 }, (_, i) => {
      const y = random() - 0.5, z = random() * 0.2;
      return buildStraightBarWithHooks({ id: String(i), diameterMm: [8, 16, 25][i % 3], role: 'longitudinal',
        start: { x: -1, y, z }, end: { x: 1, y, z: z + random() * 0.2 },
        axis: { x: 1, y: 0, z: 0 }, hookNormal: { x: 0, y: 0, z: 1 },
        startHook: i % 2 ? 90 : 135, endHook: 90, ownerElementIds: [i], edition: '2025' });
    });
    bars.push({ ...bars[0], id: 'coincident' }, bar('empty', 0, { segments: [] }),
      bar('point', 0, { segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })] }));
    // Asymmetric policies catch reversed pair orientation; tangents must remain current.
    const opts = { placementFor: (a: BarPath, b: BarPath) => a.id < b.id ? 0.002 : 0,
      classifyFor: (a: BarPath, b: BarPath, surface: number, ta?: { z: number }, tb?: { z: number }) => ({
        reportable: surface < 0 || (ta?.z ?? 0) <= (tb?.z ?? 0), requiredClear: a.id < b.id ? 0.025 : 0.04,
        pairClass: 'sameLayerSpacing' as const, labelKey: 'test', refs: [],
      }) };
    const session = prepareCollisionRepair(bars, opts)!;
    try {
      for (let step = 0; step < 16; step++) {
        const changed = new Set<string>();
        bars = bars.map(b => {
          if (random() > 0.2) return b;
          changed.add(b.id);
          return translate(b, random() * 0.4 - 0.2, random() * 0.1 - 0.05);
        });
        expect(reported(session.update(bars, changed))).toEqual(reported(detectCollisions(bars, { ...opts, kernel: false })));
      }
    } finally { session.free(); }
  });

  it('updates sampled topology and rejects invalid WASM updates without corrupting the index', () => {
    let bars = [bar('a', 0), bar('b', 0.03)];
    const session = prepareCollisionRepair(bars)!;
    try {
      for (const segments of [[], bar('b', -0.01).segments, [
        ...bar('b', -0.01).segments,
        straightSegment({ x: 1, y: -0.01, z: 0 }, { x: 1, y: 1, z: 0 }),
      ]]) {
        bars = [bars[0], { ...bars[1], segments }];
        expect(reported(session.update(bars, new Set(['b'])))).toEqual(reported(detectCollisions(bars)));
      }
    } finally { session.free(); }
    const geometry = new CollisionGeometry(new Float64Array([0, 0, 0, 1, 0, 0, 0, 0.03, 0, 1, 0.03, 0]),
      new Uint32Array([0, 2, 4]), new Float64Array([0.01, 0.01]));
    try {
      geometry.build_hash(0.25, true);
      for (const points of [new Float64Array(2), new Float64Array([NaN, 0, 0]), new Float64Array([0, 0, 0, 1e20, 0, 0])]) {
        expect(() => geometry.update_bar(0, points)).toThrow();
        expect([...geometry.changed_pairs(new Uint32Array([0]))]).toEqual([0, 1]);
      }
      expect(() => geometry.update_bar(2, new Float64Array())).toThrow();
      expect(() => geometry.changed_pairs(new Uint32Array([2]))).toThrow();
    } finally { geometry.free(); }
  });

  it('preserves all repair outputs with layer groups, locked members and rollback', () => {
    for (let variant = 0; variant < 12; variant++) {
      const bars = Array.from({ length: 18 }, (_, i) => bar(String(i), i * (0.015 + variant * 0.002), {
        layerId: i % 3 === 0 ? 'shared' : undefined, locked: i % 4 === 0,
        role: i % 7 === 0 ? 'transverse' : 'longitudinal',
      }));
      expect(repairConflicts(bars, need25, undefined, undefined, { incremental: true }))
        .toEqual(repairConflicts(bars, need25));
    }
  });

  it.each([false, true])('restores original geometry when the first rung worsens it (incremental=%s)', incremental => {
    const bars = [bar('a', 0, { locked: true }), bar('b', 0.04),
      bar('c', 0.086, { locked: true }), bar('d', 0.087, { locked: true })];
    const result = repairConflicts(bars, need25, undefined, undefined, { incremental });
    expect(result.attempts[0].cleared).toBeLessThan(0);
    expect(result.bars).toEqual(bars);
    expect(result.conflicts).toEqual(detectCollisions(result.bars, { requiredClearFor: need25 }).conflicts);
  });

  it('falls back without WASM and releases geometry on early returns and throwing policies', () => {
    const bars = [bar('a', 0), bar('b', 0.04)];
    const reference = repairConflicts(bars, need25);
    registerCollisionKernel(null);
    try {
      expect(prepareCollisionRepair(bars)).toBeNull();
      expect(repairConflicts(bars, need25, undefined, undefined, { incremental: true })).toEqual(reference);
    } finally { registerCollisionKernel(CollisionGeometry); }
    const freed = vi.spyOn(CollisionGeometry.prototype, 'free');
    try {
      repairConflicts([], need25, undefined, undefined, { incremental: true });
      expect(freed).toHaveBeenCalledTimes(1);
      expect(() => repairConflicts(bars, () => { throw new Error('policy failed'); }, undefined, undefined, { incremental: true }))
        .toThrow('policy failed');
      expect(freed).toHaveBeenCalledTimes(2);
      let calls = 0;
      expect(() => repairConflicts(bars, () => {
        if (++calls > 1) throw new Error('update failed');
        return 0.025;
      }, undefined, undefined, { incremental: true })).toThrow('update failed');
      expect(freed).toHaveBeenCalledTimes(3);
    } finally { freed.mockRestore(); }
  });

  it('rejects changed identities/radii and guards use after disposal', () => {
    const bars = [bar('a', 0), bar('b', 0.04)];
    const session = prepareCollisionRepair(bars)!;
    try {
      expect(() => session.update([...bars].reverse(), new Set())).toThrow('fixed bar');
      expect(() => session.update([bars[0], { ...bars[1], diameterMm: 25 }], new Set(['b']))).toThrow('fixed bar');
      expect(() => session.update(bars, new Set(['missing']))).toThrow('Unknown');
      expect(reported(session.update(bars, new Set()))).toEqual(reported(session.initial));
    } finally { session.free(); }
    session.free();
    expect(() => session.update(bars, new Set())).toThrow('closed');
  });

  it('leaves a repair with a bar that is not numbers to the full sweep, which names it instead of throwing', () => {
    const bars = [bar('a', 0), bar('b', 0.03), bar('nan', 0, { segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: Number.NaN, y: 0, z: 0 })] })];
    expect(prepareCollisionRepair(bars)).toBeNull();
    const r = repairConflicts(bars, need25, undefined, undefined, { incremental: true });
    expect(r.conflicts.every((c) => c.barA !== 'nan' && c.barB !== 'nan')).toBe(true);
  });
});
