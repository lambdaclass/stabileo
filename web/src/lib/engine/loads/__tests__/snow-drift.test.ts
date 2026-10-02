import { describe, it, expect } from 'vitest';
import { figure9Hd, stepDrift, slidingSnow } from '../../../codes/cirsoc104/drift';
import { snowDensity } from '../../../codes/cirsoc104/snow';
import { gravityLayout, type GravityModel } from '../plan-gravity';
import { driftAndSlidingLoads } from '../snow-drift-loads';

describe('CIRSOC 104 Figura 9 and §7.1', () => {
  it('reads the figure at its points, and between them', () => {
    expect(figure9Hd(1, 30).hd).toBeCloseTo(0.924, 6);
    expect(figure9Hd(2.5, 120).hd).toBeCloseTo(2.2, 6);
    // l_u below 7,5 m is 7,5 m (the figure's note).
    expect(figure9Hd(1, 3).hd).toBeCloseTo(0.381, 6);
    // Halfway between 1,0 and 1,5 kN/m² at l_u = 15 m.
    expect(figure9Hd(1.25, 15).hd).toBeCloseTo((0.657 + 0.757) / 2, 6);
    // Between 15 and 30 m the reading is linear in log l_u.
    const geo = Math.sqrt(15 * 30);
    expect(figure9Hd(1, geo).hd).toBeCloseTo((0.657 + 0.924) / 2, 6);
    expect(figure9Hd(5, 50).outside).toBe(true);
  });

  it('a 3 m step under 1 kN/m² of ground snow: the leeward drift fits under h_c', () => {
    const g = snowDensity(1);   // 2,626 kN/m³
    const d = stepDrift({ pg: 1, balanced: 0.7, stepHeight: 3, luUpper: 30, luLower: 12 });
    expect(d.gamma).toBeCloseTo(g, 6);
    expect(d.hb).toBeCloseTo(0.7 / g, 6);
    expect(d.governs).toBe('leeward');
    expect(d.height).toBeCloseTo(0.924, 6);
    expect(d.w).toBeCloseTo(4 * 0.924, 6);
    expect(d.pd).toBeCloseTo(0.924 * g, 6);
  });

  it('a low step: the drift is capped at h_c and widens to 4 h_d²/h_c (≤ 8 h_c)', () => {
    const d = stepDrift({ pg: 1, balanced: 0.7, stepHeight: 0.8, luUpper: 60, luLower: 10 });
    const hc = 0.8 - 0.7 / snowDensity(1);
    expect(d.hc).toBeCloseTo(hc, 6);
    expect(d.height).toBeCloseTo(hc, 6);
    expect(d.w).toBeCloseTo(Math.min((4 * 1.255 ** 2) / hc, 8 * hc), 6);
  });

  it('no drift when h_c/h_b < 0,2', () => {
    expect(stepDrift({ pg: 1, balanced: 0.7, stepHeight: 0.3, luUpper: 30, luLower: 10 }).applies).toBe(false);
  });

  it('Cap. 9: 0,4 p_f W over 4,5 m, above 2 % for a smooth roof and 16 % for any other', () => {
    expect(slidingSnow({ pf: 1, slopePercent: 10, slippery: false, W: 6 }).applies).toBe(false);
    const s = slidingSnow({ pf: 1, slopePercent: 10, slippery: true, W: 6 });
    expect(s.perMetre).toBeCloseTo(2.4, 9);
    expect(s.intensity).toBeCloseTo(2.4 / 4.5, 9);
  });
});

/** A 6 × 6 m upper roof at +6 m over x 0–6 and a 6 × 6 m lower roof at +3 m over x 6–12. */
function stepModel(): GravityModel {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number }>();
  let n = 1, e = 1;
  const node = (x: number, y: number, z: number) => { nodes.set(n, { id: n, x, y, z }); return n++; };
  const ring = (c: number[]) => { for (let i = 0; i < c.length; i++) elements.set(e, { id: e++, nodeI: c[i]!, nodeJ: c[(i + 1) % c.length]!, sectionId: 1 }); };
  ring([node(0, 0, 6), node(6, 0, 6), node(6, 6, 6), node(0, 6, 6)]);
  ring([node(6, 0, 3), node(12, 0, 3), node(12, 6, 3), node(6, 6, 3)]);
  return { nodes, elements };
}

const total = (list: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number }>) =>
  list.reduce((s, d) => s + ((d.q + (d.qJ ?? d.q)) / 2) * ((d.b ?? 0) - (d.a ?? 0)), 0);

describe('drifts on the model', () => {
  it('a step: the triangle along it, on the lower roof only, about p_d · w / 2 per metre of step', () => {
    const m = stepModel();
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    const out = driftAndSlidingLoads(m, layout, { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 3 });
    expect(out.derivation.some((x) => x.key === 'snow.derivation.drift')).toBe(true);
    for (const d of out.distributed) expect((m.nodes.get(m.elements.get(d.elementId)!.nodeI)!.z)).toBe(3);
    const d = stepDrift({ pg: 1, balanced: 0.7, stepHeight: 3, luUpper: 6, luLower: 6 });
    // The tributary strips read the triangle at their middle: within a fifth of the exact total.
    const exact = (d.pd * d.w / 2) * 6;
    expect(-total(out.distributed)).toBeGreaterThan(exact * 0.8);
    expect(-total(out.distributed)).toBeLessThan(exact * 1.2);
  });

  it('snow slides off a smooth higher roof whose eave stands over the lower roof', () => {
    const m = stepModel();
    // Replace the upper flat roof with rafters climbing from an eave at x = 6 (+4 m) to x = 0 (+5,5 m).
    for (const id of [1, 2, 3, 4]) m.elements.delete(id);
    let n = 100, e = 100;
    const node = (x: number, y: number, z: number) => { m.nodes.set(n, { id: n, x, y, z }); return n++; };
    for (const y of [0, 6]) m.elements.set(e, { id: e++, nodeI: node(6, y, 4), nodeJ: node(0, y, 5.5), sectionId: 1 });
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    const out = driftAndSlidingLoads(m, layout, { pg: 1, balanced: 0.7, pf: 0.7, slippery: true, tributaryWidth: 3 });
    const msg = out.derivation.find((x) => x.key === 'snow.derivation.sliding')!;
    expect(msg.params?.W).toBeCloseTo(6, 6);
    // 0,4 · 0,7 · 6 = 1,68 kN per metre of eave over the 6 m of eave, all on the lower roof.
    expect(-total(out.distributed)).toBeGreaterThan(1.68 * 6 * 0.8);
    expect(-total(out.distributed)).toBeLessThan(1.68 * 6 * 1.2);
  });
});
