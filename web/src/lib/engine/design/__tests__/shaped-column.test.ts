/**
 * Columns that are not rectangles, against hand calculation. H-25, ADN 420, 4 cm cover, Ø8 ties.
 *
 * Axial cap, CIRSOC 201-2025: Pn,max = 0,80·Po tied, 0,85·Po spiral (Tabla 22.4.2.1), times the
 * compression-controlled φ, 0,65 tied and 0,75 spiral (Tabla 21.2.2 (b), (a));
 * Po = 0,85·f'c·(Ag − Ast) + fy·Ast (22.4.2.2).
 *   Circle D = 0,50 m, 8Ø16: Ag = 0,19635, Ast = 0,0016085 →
 *     P0 = 0,85·25 000·0,194742 + 420 000·0,0016085 = 4138,3 + 675,6 = 4813,8 kN;
 *     tied 0,65·0,80·P0 = 2503,2 kN; spiral 0,75·0,85·P0 = 3068,8 kN.
 *   L 0,60 × 0,60, legs 0,20: Ag = 0,6·0,2 + 0,2·0,4 = 0,20; with 10Ø16, Ast = 0,0020106 →
 *     P0 = 0,85·25 000·0,197989 + 420 000·0,0020106 = 4207,3 + 844,5 = 5051,8 kN; tied 2626,9 kN.
 *   Rectangle 0,20 × 0,70 (the rectangular path), 8Ø16: P0 = 0,85·25 000·0,138392 + 675,6
 *     = 2940,8 + 675,6 = 3616,4 kN; tied 1880,5 kN.
 *
 * Bending of the circle with no axial load, by its own strain compatibility: the Whitney block on
 * the circular segment (closed form) and each bar's strain, the neutral axis found by bisection,
 * then Mn and φ from εt. The engine works on a polygon; the two agree within 1 %.
 *
 * φ in the transition, Tabla 21.2.2 (d), with ADN 500 (εty = 500/200 000 = 0,0025) at εt = 0,004:
 *   φ = 0,65 + 0,25·(0,004 − 0,0025)/0,003 = 0,775. (The 2005 ramp, from εy to 0,005, gives 0,80.)
 */
import { describe, it, expect } from 'vitest';
import { checkShapedColumn, columnShapeOf, shapedBarPositions, grossAreaOf, outlineOf, minClear } from '../shaped-column';
import { axialRange, momentCapacityAtAxial } from '../../codes/argentina/cirsoc-flex-surface';

/** Tabla 21.2.2, written out here so the tests do not read the function they check. */
const phi2025 = (et: number, fy: number, spiral = false) => {
  const ety = fy / 200000, c = spiral ? 0.75 : 0.65, k = spiral ? 0.15 : 0.25;
  return et <= ety ? c : et >= ety + 0.003 ? 0.9 : c + k * (et - ety) / 0.003;
};

const a16 = Math.PI * 0.016 ** 2 / 4;

describe('shaped columns', () => {
  it('reads the shape of a section', () => {
    expect(columnShapeOf({ shape: 'CHS', a: Math.PI * 0.25 / 4, h: 0.5 } as never)).toEqual({ kind: 'circle', D: 0.5 });
    expect(columnShapeOf({ shape: 'L', a: 0.2, b: 0.6, h: 0.6, tw: 0.2, tf: 0.2 })).toEqual({ kind: 'L', b: 0.6, h: 0.6, tw: 0.2, tf: 0.2 });
    expect(columnShapeOf({ shape: 'rect', a: 0.14, b: 0.2, h: 0.7 })).toBeNull();
  });

  it('places the bars on the inset outline, a ring on the circle and one at each corner of the L', () => {
    const ring = shapedBarPositions({ kind: 'circle', D: 0.5 }, 8, 16, 0.04, 8);
    for (const p of ring) expect(Math.hypot(p.x, p.y)).toBeCloseTo(0.25 - 0.04 - 0.008 - 0.008, 9);
    const L = shapedBarPositions({ kind: 'L', b: 0.6, h: 0.6, tw: 0.2, tf: 0.2 }, 6, 16, 0.04, 8);
    // Six corners, each 0,056 m in from both faces it meets.
    const xs = L.map((p) => p.x).sort((a, b) => a - b), ys = L.map((p) => p.y).sort((a, b) => a - b);
    expect(xs[xs.length - 1]! - xs[0]!).toBeCloseTo(0.6 - 2 * 0.056, 9);
    expect(ys[ys.length - 1]! - ys[0]!).toBeCloseTo(0.6 - 2 * 0.056, 9);
    expect(minClear(L, 16)).toBeGreaterThan(0.04);
  });

  it('caps the axial load as §22.4.2 does, tied and spiral', () => {
    const circle = { kind: 'circle' as const, D: 0.5 };
    const bars = shapedBarPositions(circle, 8, 16, 0.04, 8).map((p) => ({ ...p, area: a16 }));
    const e25 = { edition: '2025' as const };
    expect(axialRange(outlineOf(circle), bars, { fc: 25, fy: 420, ...e25 }).max).toBeCloseTo(2503.2, 0);
    expect(axialRange(outlineOf(circle), bars, { fc: 25, fy: 420, confinement: 'spiral', ...e25 }).max).toBeCloseTo(3068.8, 0);
    const L = { kind: 'L' as const, b: 0.6, h: 0.6, tw: 0.2, tf: 0.2 };
    expect(grossAreaOf(L)).toBeCloseTo(0.2, 12);
    const lb = shapedBarPositions(L, 10, 16, 0.04, 8).map((p) => ({ ...p, area: a16 }));
    expect(axialRange(outlineOf(L), lb, { fc: 25, fy: 420, ...e25 }).max).toBeCloseTo(2626.9, 0);
    // The 20 × 70 rectangle, 8Ø16 at the corners and the middle of each face.
    const rb = [[-0.044, -0.294], [0.044, -0.294], [-0.044, 0.294], [0.044, 0.294], [-0.044, 0], [0.044, 0], [0, -0.294], [0, 0.294]].map(([x, y]) => ({ x: x!, y: y!, area: a16 }));
    expect(axialRange({ kind: 'rect', b: 0.2, h: 0.7 }, rb, { fc: 25, fy: 420, ...e25 }).max).toBeCloseTo(1880.5, 0);
  });

  it('the design check of a spiral column reads the 2025 cap, 0,75·0,85·P0', () => {
    // Pu = 3000 kN with no moment: u = Pu / φPn,max = 3000 / 3068,8 = 0,9776 (2005: 3000 / 2864,2 = 1,047).
    const out = checkShapedColumn({
      shape: { kind: 'circle', D: 0.5 }, bars: { count: 8, diameter: 16, spiral: { diameter: 10, pitch: 0.06 } },
      fc: 25, fy: 420, cover: 0.04, magnifier: 1, maxTieSpacing: 0.25,
      tuples: [{ n: -3000, my: 0, mz: 0, vy: 0, vz: 0, comboName: 'C1', stationX: 0 }],
      shearCapacity: () => 300,
    });
    expect(out.find((c) => c.category.startsWith('Biaxial'))!.utilization).toBeCloseTo(3000 / 3068.8, 3);
  });

  it('bends the circle as its own strain compatibility says', () => {
    const D = 0.5, R = D / 2, fc = 25, fy = 420, Es = 200000, ecu = 0.003, beta1 = 0.85;
    const pts = shapedBarPositions({ kind: 'circle', D }, 8, 16, 0.04, 8);
    // Compression at the top (+y). Segment of depth a from the top: area and centroid, closed form.
    const seg = (a: number) => {
      const t = 2 * Math.acos(Math.max(-1, Math.min(1, (R - a) / R)));
      const A = (R * R / 2) * (t - Math.sin(t));
      const yc = A > 0 ? (4 * R * Math.sin(t / 2) ** 3) / (3 * (t - Math.sin(t))) : R;
      return { A, yc };
    };
    const forces = (c: number) => {
      const s = seg(Math.min(beta1 * c, D));
      let N = 0.85 * fc * 1000 * s.A, M = 0.85 * fc * 1000 * s.A * s.yc, et = 0;
      for (const p of pts) {
        const eps = ecu * (c - (R - p.y)) / c;
        const fs = Math.max(-fy, Math.min(fy, Es * eps)) * 1000;
        const inBlock = R - p.y < beta1 * c;
        N += a16 * (fs - (inBlock ? 0.85 * fc * 1000 : 0));
        M += a16 * (fs - (inBlock ? 0.85 * fc * 1000 : 0)) * p.y;
        et = Math.max(et, -eps);
      }
      return { N, M, et };
    };
    let lo = 0.01, hi = D;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (forces(mid).N > 0) hi = mid; else lo = mid; }
    const f = forces((lo + hi) / 2);
    const ey = fy / Es;
    const phi = f.et >= ey + 0.003 ? 0.9 : f.et <= ey ? 0.65 : 0.65 + 0.25 * (f.et - ey) / 0.003;
    const hand = phi * f.M;
    const bars = pts.map((p) => ({ ...p, area: a16 }));
    const engine = momentCapacityAtAxial(outlineOf({ kind: 'circle', D }), bars, { fc, fy, edition: '2025' }, 0, 1, 1e-9)!;
    expect(engine.phiMn / hand).toBeGreaterThan(0.99);
    expect(engine.phiMn / hand).toBeLessThan(1.01);
  });

  /*
   * A T column, bf 0,60, hf 0,15, bw 0,25, h 0,60, 8Ø16, H-25 and ADN 500, compressed at the end of
   * its web (a negative My). The axial load is the one at which the farthest bar, up in the flange,
   * strains εt = 0,004, by hand:
   *   centroid from the top ȳ = (0,09·0,075 + 0,1125·0,375)/0,2025, so the bottom fibre is at
   *   y = ȳ − 0,60; the top bars 0,544 m above it (cover 0,04 + tie 0,008 + 0,008);
   *   c = 0,003·0,544/0,007; a = 0,85·c, inside the web; Cc = 0,85·25 000·bw·a at y = bottom + a/2;
   *   each bar εs = 0,003·(c − ds)/c, fs = Es·εs within ±fy, the displaced concrete taken out.
   *   φ = 0,775 (Tabla 21.2.2 (d)); Pu = φ·Pn, and the capacity there is φ·|Mn|.
   * (Compressing the flange instead puts Pn near 2400 kN, where φ falls faster than Pn rises and
   * φ·Pn = Pu has two roots; the web side keeps the case to one.)
   */
  it('a T column in the transition zone takes φ from Tabla 21.2.2, fy = 500', () => {
    const fc = 25, fy = 500, Es = 200000, ecu = 0.003, b1 = 0.85, fcd = 0.85 * fc * 1000;
    const bf = 0.6, hf = 0.15, bw = 0.25, h = 0.6;
    const tee = { kind: 'tee' as const, bf, hf, bw, h };
    const pts = shapedBarPositions(tee, 8, 16, 0.04, 8);
    const yTop = (bf * hf * hf / 2 + bw * (h - hf) * (hf + (h - hf) / 2)) / (bf * hf + bw * (h - hf));
    const yBot = yTop - h;
    const ds = pts.map((p) => p.y - yBot);
    const dt = Math.max(...ds);
    expect(dt).toBeCloseTo(0.6 - 0.056, 9);
    const c = ecu * dt / (ecu + 0.004);
    const a = b1 * c;
    expect(a).toBeLessThan(h - hf);
    let N = fcd * bw * a, M = fcd * bw * a * (yBot + a / 2);
    pts.forEach((p, i) => {
      const eps = ecu * (c - ds[i]!) / c;
      const fs = Math.max(-fy, Math.min(fy, Es * eps)) * 1000 - (eps > 0 && ds[i]! <= a ? fcd : 0);
      N += a16 * fs; M += a16 * fs * p.y;
    });
    const phi = 0.65 + 0.25 * (0.004 - 0.0025) / 0.003;
    expect(phi).toBeCloseTo(0.775, 12);
    expect(phi2025(0.004, 500)).toBeCloseTo(0.775, 12);
    const Pu = phi * N;
    const out = checkShapedColumn({
      shape: tee, bars: { count: 8, diameter: 16 }, ties: { diameter: 8, legs: 2, spacing: 0.15 },
      fc, fy, cover: 0.04, magnifier: 1, maxTieSpacing: 0.25,
      tuples: [{ n: -Pu, my: -50, mz: 0, vy: 0, vz: 0, comboName: 'C1', stationX: 0 }],
      shearCapacity: () => 300,
    });
    const pm = out.find((x) => x.category.startsWith('Biaxial'))!;
    expect(pm.capacity!).toBeCloseTo(phi * Math.abs(M), 1);
  });

  it('checks a circular column: P–M, ratio, spacing, shear and the spiral', () => {
    const out = checkShapedColumn({
      shape: { kind: 'circle', D: 0.5 }, bars: { count: 8, diameter: 16, spiral: { diameter: 10, pitch: 0.06 } },
      fc: 25, fy: 420, cover: 0.04, magnifier: 1, maxTieSpacing: 0.25,
      tuples: [{ n: -1500, my: 80, mz: 40, vy: 20, vz: 30, comboName: 'C1', stationX: 0 }],
      shearCapacity: () => 300,
    });
    const pm = out.find((c) => c.category.startsWith('Biaxial'))!;
    expect(pm.utilization).toBeGreaterThan(0);
    expect(pm.utilization).toBeLessThan(1);
    // ρs = 4·Asp/(Dc·s) = 4·78,54e−6/(0,42·0,06) = 1,2467 %; 0,45·(0,19635/0,13854 − 1)·25/420 = 1,1178 %.
    const sr = out.find((c) => c.category === 'Spiral ratio')!;
    expect(sr.provided).toBeCloseTo(1.247, 3);
    expect(sr.required).toBeCloseTo(1.118, 3);
    expect(out.find((c) => c.category === 'Spiral pitch')!.utilization).toBeLessThan(1);
  });
});
