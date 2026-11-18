/** A one-way slab's main bars within §24.3.2's crack-control spacing (§7.7.2.2), which a deep cover makes tighter than §7.7.2.3's 3h and 300 mm; under CIRSOC, the cátedra's 25 cm (FIUBA §13.1) for main and distribution bars. */
import { describe, it, expect } from 'vitest';
import { slabRow, slabRowFor, CIRSOC_SLAB_ROW, ACI_SLAB_ROW, type SlabDemand } from '../slab-row';
import { makeFmt } from '../format';

const f = makeFmt('.');
const d = { key: 'slab:1', name: 'L1', lx: 2, ly: 6, h: 0.14, m: { bottomX: { value: 4 }, bottomY: { value: 1 }, topX: { value: 0 }, topY: { value: 0 } } } as SlabDemand;

describe('crack control of one-way slabs', () => {
  it('limits the main bars to min(380·280/fs − 2.5·cc, 300·280/fs) with fs = ⅔·fy', () => {
    const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.045, diameters: [8, 10, 12] };
    const limit = Math.min(380 - 2.5 * 45, 300) / 1000;
    for (const [code, course] of [[CIRSOC_SLAB_ROW, 0.25], [ACI_SLAB_ROW, Infinity]] as const) {
      const r = slabRowFor(code)(d, ctx, undefined, f);
      expect(r.oneWay).toBe(true);
      expect(r.faces.bottomX.sMax).toBeCloseTo(Math.min(limit, course), 6);
      expect(r.proposed.bottomX.spacing).toBeLessThanOrEqual(limit + 1e-9);
      expect(r.faces.bottomY.sMax).toBeCloseTo(Math.min(5 * 0.14, 0.45, course), 6);
      expect(r.verifications.find((v) => v.label === 'rcSheets.v.slabSpacing')!.clause).toBe(course < 1 ? '§7.7.2.3, §7.7.2.2, §24.3.2, FIUBA §13.1' : '§7.7.2.3, §7.7.2.2, §24.3.2');
    }
    expect(slabRow(d, ctx, undefined, f).faces.bottomX.sMax).toBeCloseTo(0.3, 6);
    expect(slabRowFor(ACI_SLAB_ROW)(d, { ...ctx, cover: 0.02 }, undefined, f).faces.bottomX.sMax).toBeCloseTo(0.3, 6);
    expect(slabRowFor(CIRSOC_SLAB_ROW)(d, { ...ctx, cover: 0.02 }, undefined, f).faces.bottomX.sMax).toBeCloseTo(0.25, 6);
    const failing = slabRowFor(CIRSOC_SLAB_ROW)(d, ctx, { bottomX: { dia: 10, spacing: 0.3 }, bottomY: { dia: 8, spacing: 0.3 }, topX: { dia: 0, spacing: 0 }, topY: { dia: 0, spacing: 0 } }, f);
    expect(failing.verifications.find((v) => v.label === 'rcSheets.v.slabSpacing')!.ok).toBe(false);
  });
});
