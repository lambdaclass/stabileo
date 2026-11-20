/**
 * A slab cantilever's deflection: Ie read with the moment of its unit-width strip at the root
 * (FIUBA §5.1, §24.2.3.7), not the largest element moment by a column; a proposal short of the
 * limit adding compression steel, which lowers λΔ (FIUBA §18.3), where tension steel alone would
 * leave the section no longer tension-controlled (§7.3.3.1); and a cantilever reinforced as the
 * one-way slab it is: its distribution steel beside the main bars at the top, its bottom bars the
 * span's carried in (FIUBA §13.1–13.2), its shear read with the top steel in tension.
 */
import { CRITERION } from '../criteria';
import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { slabRowFor, CIRSOC_SLAB_ROW, ACI_SLAB_ROW, type SlabDemand } from '../slab-row';
import { meshArea } from '../bars';
import { makeFmt } from '../format';
import { rootMoment } from '../../store/rc-sheets-service';
import type { Serviceable } from '../deflection';

const f = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.02, diameters: [6, 8, 10, 12, 16], span: { kind: 'cantilever' as const, dir: 'x' as const, length: 1.85 } };
const balcony = (topX: number): SlabDemand => ({ key: 'slab:4', name: 'L4', lx: 2, ly: 10, h: 0.15, m: { bottomX: { value: 0 }, bottomY: { value: 1 }, topX: { value: topX }, topY: { value: 3 } } }) as SlabDemand;
const labels = (r: { verifications: Array<{ label: string; ok: boolean }> }) => r.verifications.filter((v) => !v.ok).map((v) => v.label);

describe('the moment a cantilever strip is read with', () => {
  it('is the mean of the elements along its held edge over their width, a column\'s peak and the elements beyond the root left out', () => {
    const box = (x0: number, y0: number, y1: number) => ({ x0, x1: x0 + 0.5, y0, y1 });
    const d = {
      bounds: { x0: 16, x1: 18, y0: 0, y1: 4, z: 3.5 },
      topField: [
        { x: 16.25, y: 0.25, topX: 30, topY: 9, box: box(16, 0, 0.5) },
        { x: 16.25, y: 1, topX: 10, topY: 1, box: box(16, 0.5, 1.5) },
        { x: 16.25, y: 2.5, topX: 10, topY: 1, box: box(16, 1.5, 3.5) },
        { x: 16.25, y: 3.75, topX: 14, topY: 1, box: box(16, 3.5, 4) },
        { x: 16.75, y: 1, topX: 50, topY: 1, box: box(16.5, 0.5, 1.5) },
      ],
    };
    expect(rootMoment(d, 'x0')).toBeCloseTo((30 * 0.5 + 10 * 1 + 10 * 2 + 14 * 0.5) / 4, 9);
    expect(rootMoment(d, 'x1')).toBeNull();
    expect(rootMoment({ bounds: d.bounds }, 'x0')).toBeNull();
  });
});

describe('a slab under the CIRSOC and ACI rules stays tension-controlled', () => {
  it('fails a face whose steel leaves εt under εty + 3 ‰, by §7.3.3.1 one-way', () => {
    for (const code of [CIRSOC_SLAB_ROW, ACI_SLAB_ROW]) {
      const heavy = { bottomX: { dia: 8, spacing: 0.2 }, bottomY: { dia: 8, spacing: 0.2 }, topX: { dia: 16, spacing: 0.05 }, topY: { dia: 8, spacing: 0.2 } };
      const r = slabRowFor(code)(balcony(20), ctx, heavy, f);
      const line = r.verifications.find((v) => v.label === 'rcSheets.v.ductility')!;
      expect(line.ok).toBe(false);
      expect(line.clause).toBe('§7.3.3.1');
      expect(r.faces.topX.strain!.epsT).toBeLessThan(r.faces.topX.strain!.epsTMin);
      expect(r.status).toBe('fail');
      const fine = slabRowFor(code)(balcony(20), ctx, undefined, f);
      expect(fine.verifications.some((v) => v.label === 'rcSheets.v.ductility')).toBe(false);
      expect(fine.faces.topX.strain!.epsT).toBeGreaterThanOrEqual(fine.faces.topX.strain!.epsTMin);
    }
  });
});

describe('a 15 cm balcony of 1.85 m short of ℓ/240', () => {
  const service: Serviceable['service'] = {
    dead: { k: 12.1, m: 9.0 }, live: { k: 6.7, m: 4.4 }, roof: { k: 0, m: 0 },
    names: { dead: 'D', live: 'L', roof: '' }, strip: { face: 'topX', reference: 'root' },
  };
  it('is proposed with compression steel at the bottom where tension steel alone would not stay tension-controlled, and verifies', () => {
    const d = { ...balcony(20), service } as SlabDemand & Serviceable;
    const rules = rulesFor('cirsoc201-2025');
    const bare = slabRowFor(CIRSOC_SLAB_ROW)(d, ctx, undefined, f);
    const row = rules.slabRow(d, ctx, undefined, f);
    expect(row.status).not.toBe('fail');
    expect(labels(row)).toEqual([]);
    expect(row.verifications.find((v) => v.label === 'rcSheets.v.deflection')!.ok).toBe(true);
    expect(meshArea(row.proposed.bottomX)).toBeGreaterThan(meshArea(bare.proposed.bottomX));
    expect(meshArea(row.proposed.topX)).toBeGreaterThan(meshArea(bare.proposed.topX));
    const icr = row.steps.flatMap((g) => g.steps).find((s) => s.label === 'rcSheets.s.defl.icr')!;
    expect(icr.formula).toContain(`A's = ${f(meshArea(row.proposed.bottomX), 2)} cm²`);
    const tensionOnly = rules.slabRow(d, ctx, { ...row.proposed, bottomX: bare.proposed.bottomX }, f);
    expect(tensionOnly.verifications.find((v) => v.label === 'rcSheets.v.deflection')!.ok).toBe(false);
  });
});

describe('a cantilever is reinforced as a one-way slab with its main bars at the top', () => {
  const quiet = (): SlabDemand => ({ ...balcony(20), m: { bottomX: { value: 0 }, bottomY: { value: 0 }, topX: { value: 20 }, topY: { value: 0 } }, q: { x: { value: 30 }, y: { value: 0 } } }) as SlabDemand;
  it('under CIRSOC: distribution at the top, a fifth of the main bars and no less than shrinkage; bottom bars from the span; bars within 25 cm', () => {
    const r = slabRowFor(CIRSOC_SLAB_ROW)(quiet(), ctx, undefined, f);
    expect(r.oneWay).toBe(true);
    expect(r.faces.topY.asDistribution).toBeCloseTo(0.2 * meshArea(r.adopted.topX), 9);
    expect(r.faces.topY.asReq).toBeGreaterThanOrEqual(r.faces.topY.asMin);
    expect(r.faces.topY.asMin).toBeGreaterThan(0);
    expect(r.faces.bottomY.asDistribution ?? 0).toBe(0);
    for (const face of ['bottomX', 'bottomY', 'topX', 'topY'] as const) expect(r.faces[face].sMax, face).toBeLessThanOrEqual(0.25 + 1e-9);
    const clause = (face: string) => r.verifications.find((v) => v.label === `rcSheets.v.slabMin.${face}`)?.clause;
    expect(clause('bottomX')).toBe(CRITERION);
    expect(clause('topX')).toBe('§7.6.1');
    expect(clause('topY')).toBe('§24.4.3.2');
    expect(meshArea(r.adopted.topY)).toBeLessThan(meshArea(r.adopted.topX));
  });

  it('under ACI: no bottom bars where none is in tension, and its shear read with the top bars that are', () => {
    const r = slabRowFor(ACI_SLAB_ROW)(quiet(), ctx, undefined, f);
    expect(r.faces.bottomX.asReq).toBe(0);
    expect(r.faces.bottomY.asReq).toBe(0);
    expect(r.adopted.bottomX.dia).toBe(0);
    expect(r.shear.x.phiVc).toBeGreaterThan(30);
    expect(r.status).not.toBe('fail');
  });
});
