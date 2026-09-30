/**
 * §24.3.2 crack control of beam faces, on the production path.
 *
 * The rule alone first: at f_s = 2/3·420 = 280 MPa and c_c = 25 + 8 mm, s,max is the lesser of
 * 380 − 2,5·33 = 297,5 mm and 300 mm. Then the chain: the row-2 fixture's beams widened to
 * 700 mm and lightly loaded. Three Ø25 carry the minimum steel there but sit 300 mm apart,
 * over the limit: the verdict must fail them on bar spacing, and the design must come back with
 * every tension face within it.
 */
import { describe, expect, it } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-qa-row2.json';
import { runDesign } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { solveFixture } from './helpers';
import { crackControlFaceSpacing } from '../crack-spacing';

describe('the rule', () => {
  it('s,max from Table 24.3.2 at the permitted stress, against the spacing of the bars', () => {
    const two = crackControlFaceSpacing('2025', [{ count: 2, diameter: 16, row: 0 }], 0.7, 0.025, 8, 420)!;
    expect(two.limit.maxSpacing).toBeCloseTo(0.2975, 6);
    expect(two.limit.fsSource).toBe('permittedTwoThirdsFy');
    expect(two.spacing).toBeCloseTo(0.7 - 2 * 0.033 - 0.016, 9);
    expect(two.ok).toBe(false);
    const three = crackControlFaceSpacing('2025', [{ count: 3, diameter: 16, row: 0 }, { count: 2, diameter: 16, row: 1 }], 0.7, 0.025, 8, 420)!;
    expect(three.count).toBe(3);
    expect(three.ok).toBe(false);
    expect(crackControlFaceSpacing('2025', [{ count: 4, diameter: 16, row: 0 }], 0.7, 0.025, 8, 420)!.ok).toBe(true);
    expect(crackControlFaceSpacing('2025', [], 0.7, 0.025, 8, 420)).toBeNull();
  });
});

describe('a wide beam, designed', () => {
  const wide = JSON.parse(JSON.stringify(frame));
  const model = wide.model ?? wide;
  const s = model.sections.find((x: { id: number }) => x.id === 2);
  const b = 0.7, h = 0.55;
  Object.assign(s, { name: 'RC Beam 700×550', b, h, a: b * h, iz: (h * b ** 3) / 12, iy: (b * h ** 3) / 12 });
  // Light loads, so the minimum steel governs and few bars would do for strength alone.
  for (const l of model.loads) for (const k of Object.keys(l.data)) if (/^(q|f|m|p)[A-Za-z]*$/.test(k) && typeof l.data[k] === 'number') l.data[k] *= 0.03;
  const solved = solveFixture(wide);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  const beams = [...solved.contexts.entries()].filter(([, c]) => c.elementType === 'beam').map(([id]) => id);

  it('three Ø25 across 700 mm fail on bar spacing; the same area in more bars does not', () => {
    const id = beams[0]!;
    const ctx = solved.contexts.get(id)!;
    const accepted = summary.outcomes.get(id)!.accepted!;
    const withBottom = (count: number, diameter: number) => ({
      ...accepted,
      regions: { ...accepted.regions!, bottomSpanLayers: [{ count, diameter, row: 0 }], bottomSpan: { count, diameter } },
    });
    const crack = (v: ReturnType<typeof cirsoc201Adapter.verify>) => v.checks.filter((c) => c.limiting === 'barSpacing');
    const three = crack(cirsoc201Adapter.verify(ctx, withBottom(3, 25) as never));
    expect(three.length).toBe(1);
    expect(three[0]!.category).toMatch(/^Bottom Span .*§24\.3/);
    expect(three[0]!.status).toBe('fail');
    expect(crack(cirsoc201Adapter.verify(ctx, withBottom(8, 16) as never))).toEqual([]);
  });

  it('comes back verified, with every tension face spaced within §24.3.2', () => {
    expect(beams.length).toBeGreaterThan(0);
    for (const id of beams) {
      const o = summary.outcomes.get(id)!;
      expect(o.outcome, `element ${id}: ${o.reasons.map((r) => r.key).join(',')}`).toBe('VERIFIED');
      const reg = o.accepted?.regions;
      const ctx = solved.contexts.get(id)!;
      expect(reg?.bottomSpanLayers?.length, `element ${id}`).toBeGreaterThan(0);
      for (const layers of [reg?.bottomSpanLayers, reg?.topStartLayers, reg?.topEndLayers]) {
        if (!layers?.length) continue;
        const c = crackControlFaceSpacing('2025', layers, ctx.axes.bFlex, ctx.material.cover, 8, ctx.material.fy)!;
        expect(c.spacing, `element ${id}`).toBeLessThanOrEqual(c.limit.maxSpacing + 0.01);
      }
    }
  });
});
