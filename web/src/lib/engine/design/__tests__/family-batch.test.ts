/** Batch edits on walls, slab panels, footings and stairs: before and after, and limits that block. */
import { describe, it, expect } from 'vitest';
import { planFootingBatch, planSlabBatch, planStairBatch, planWallBatch } from '../family-batch';

const D = [6, 8, 10, 12, 16, 20];

describe('a batch over walls', () => {
  const wall = (id: string, s: number) => ({ id, label: id, thickness: 0.2, current: { vertical: { diameter: 10, spacing: s }, horizontal: { diameter: 8, spacing: 0.2 }, curtains: 2 as const } });
  it('sets the fields asked, keeps the rest, and says what changes', () => {
    const rows = planWallBatch([wall('W1', 0.2), wall('W2', 0.15)], { vertical: { spacing: 0.15 } }, D);
    expect(rows.map((r) => [r.id, !!r.next])).toEqual([['W1', true], ['W2', false]]);
    expect(rows[0]!.next!.vertical).toEqual({ diameter: 10, spacing: 0.15 });
    expect(rows[0]!.next!.horizontal).toEqual({ diameter: 8, spacing: 0.2 });
  });
  it('blocks a spacing past 3 h (0,60 m on a 0,20 m wall, capped at 450 mm)', () => {
    const [r] = planWallBatch([wall('W1', 0.2)], { horizontal: { spacing: 0.5 } }, D);
    expect(r!.next).toBeUndefined();
    expect(r!.blocked!.key).toBe('design.fbatch.spacingRange');
  });
});

describe('a batch over slab panels', () => {
  const panel = { id: 'P1', label: 'P1', thickness: 0.12, current: { base: { bottomX: { diameter: 8, spacing: 0.2 }, topX: { diameter: 8, spacing: 0.2 } }, bands: [{ id: 'b1', face: 'top' as const, dir: 'x' as const, x0: 0, x1: 1, y0: 0, y1: 1, diameter: 10, spacing: 0.2 }] } };
  it('a base mat set, another taken off, every band hooked', () => {
    const [r] = planSlabBatch([panel], { base: { bottomY: { diameter: 8, spacing: 0.2 }, topX: null }, bands: { spacing: 0.15, hooks: true } }, D);
    expect(r!.next!.base).toEqual({ bottomX: { diameter: 8, spacing: 0.2 }, bottomY: { diameter: 8, spacing: 0.2 } });
    expect(r!.next!.bands[0]).toMatchObject({ spacing: 0.15, hookStart: true, hookEnd: true });
  });
  it('a spacing past 2 h on a 0,12 m slab (0,24 m) is blocked', () => {
    expect(planSlabBatch([panel], { bands: { spacing: 0.25 } }, D)[0]!.blocked?.key).toBe('design.fbatch.spacingRange');
  });
});

describe('a batch over footings and stairs', () => {
  it('both bottom mats take the patch, the top mats go', () => {
    const cur = { bottomX: { diameterMm: 12, spacing: 0.2 }, bottomY: { diameterMm: 12, spacing: 0.2 }, topX: { diameterMm: 10, spacing: 0.2 }, topY: { diameterMm: 10, spacing: 0.2 } };
    const [r] = planFootingBatch([{ id: '1', label: 'Z1', current: cur }], { bottom: { diameter: 16, spacing: 0.15 }, top: null }, D);
    expect(r!.next).toEqual({ bottomX: { diameterMm: 16, spacing: 0.15 }, bottomY: { diameterMm: 16, spacing: 0.15 } });
  });
  it('a footing with no mats yet and only a spacing given is listed as incomplete', () => {
    expect(planFootingBatch([{ id: '1', label: 'Z1', current: undefined }], { bottom: { spacing: 0.15 } }, D)[0]!.blocked?.key).toBe('design.fbatch.incomplete');
  });
  it('a stair diameter the project does not use is blocked', () => {
    const rows = planStairBatch([{ id: 's1', label: 'E1', barDia: 10, distDia: 8 }], { barDia: 14 }, D);
    expect(rows[0]!.blocked).toEqual({ key: 'design.fbatch.diameter', params: { d: 14 } });
  });
});
