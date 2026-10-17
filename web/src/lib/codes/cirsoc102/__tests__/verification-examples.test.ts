/**
 * CIRSOC 102: published worked examples, reproduced with the wind modules.
 *
 * Sources, with the exact place each number is printed:
 *
 *   [C19]  CIRSOC 102-2025, Comentario, Tabla C 1.9-1 "Ejemplo de cálculo: factores de efecto de
 *          ráfaga", p. 67 (Cap. 1 - 50). Edition the module implements.
 *   [GUIA] "Reglamento CIRSOC 102, Guía para el uso del Reglamento Argentino de Acción del Viento
 *          sobre las Construcciones", INTI-CIRSOC, edition July 2005, Cap. 3 "Ejemplos"
 *          (https://www.inti.gob.ar/assets/uploads/files/cirsoc/vigencia-2013/area100/guia102-completo.pdf).
 *
 * The guide was written for CIRSOC 102-2005, whose K_z (2,01, other z_g and α), importance factor
 * and C&C roof curves differ from 2025: none of its q_z or K_z is used here. What is used are the
 * parts the 2025 text keeps word for word: the wall and roof C_p of Figura 2.4-1 (Figura 3 in
 * 2005), (GCpi), p = q G Cp − qi (GCpi) given the printed q, the gust factor of Eq. (1.9-6) with
 * the same constants (Tabla 4 of 2005 = Tabla 1.9-1 of 2025 for c, ℓ, ε̄, z_min in exposure B), and
 * the C&C wall curves (Figura 5A of 2005 = Figura 5.3-1 / Tabla C 5.3-1 of 2025). Tolerances are
 * the printed rounding.
 */
import { describe, it, expect } from 'vitest';
import {
  computeWindPressures, cpLeewardWall, flatRoofCp, roofCp, type WindProject,
} from '../wind';
import {
  backgroundResponse, equivalentHeight, gustEffectFactor, integralLengthScale, meanHourlySpeed,
  resonantResponse, turbulenceIntensity,
} from '../gust';
import { claddingPressures } from '../cladding';

/**
 * Tabla C 1.9-1 prints its inputs rounded (h 183 m, B = L = 30 m, V 51 m/s) but computed its
 * values from the unrounded ones of the example it translates (600 ft, 100 ft, 115 mph): V̄ 41,15
 * needs V = 51,4 m/s, the speed Tabla C 1.9-2 prints for the same building, and η_B, η_L need
 * B = L = 30,48 m. With those, every intermediate value is reproduced to the printed rounding.
 * One printed value is not consistent with the others: N₁ = n₁·L_z̄ / V̄ = 0,2 × 217,8 / 41,15 =
 * 1,059, printed 1,053. The module's 1,059 is the expression's.
 */
describe('[C19] Tabla C 1.9-1: gust effect factors, h 183 m, B = L = 30 m, exposure B', () => {
  const h = 182.88, B = 30.48, V = 51.4;
  const zBar = equivalentHeight(h, 'B');
  const iz = turbulenceIntensity(zBar, 'B');
  const lz = integralLengthScale(zBar, 'B');
  const q = backgroundResponse(B, h, lz);
  it('rigid: z̄ 110 m (0,6 h), I_z̄ 0,201, L_z̄ 217,8 m, Q² 0,616, G 0,818', () => {
    expect(zBar).toBeCloseTo(110, 0);
    expect(iz).toBeCloseTo(0.201, 3);
    expect(lz).toBeCloseTo(217.8, 1);
    // 0,6165 and 0,1274: within one unit of the last printed digit (the ft→m conversion).
    expect(Math.abs(q * q - 0.616)).toBeLessThan(0.001);
    const g = gustEffectFactor({ exposure: 'B', V, h, B, L: B, beta: 0.01, rigidG: 'calculated' });
    expect(g.kind).toBe('rigidCalculated');
    expect(g.value.value).toBeCloseTo(0.818, 3);
  });
  it('flexible, n₁ 0,2 Hz, β 0,01: V̄ 41,15, R_n 0,128, η 4,094/0,682/2,285, R 0,214/0,666/0,343, R² 1,261, g_R 3,787, G_f 1,162', () => {
    const vBar = meanHourlySpeed(zBar, V, 'B');
    expect(vBar).toBeCloseTo(41.15, 1);
    const r = resonantResponse({ n1: 0.2, beta: 0.01, B, L: B, h, vBar, lz })!;
    expect(r.n1Reduced).toBeCloseTo((0.2 * 217.8) / 41.15, 3);
    expect(Math.abs(r.rn - 0.128)).toBeLessThan(0.001);
    expect(r.etaH).toBeCloseTo(4.094, 2);
    expect(r.etaB).toBeCloseTo(0.682, 3);
    expect(r.etaL).toBeCloseTo(2.285, 2);
    expect(Math.abs(r.rh - 0.214)).toBeLessThan(0.001);
    expect(r.rb).toBeCloseTo(0.666, 3);
    expect(r.rl).toBeCloseTo(0.343, 3);
    expect(r.r * r.r).toBeCloseTo(1.261, 2);
    expect(r.gR).toBeCloseTo(3.787, 3);
    const g = gustEffectFactor({ exposure: 'B', V, h, B, L: B, n1: 0.2, beta: 0.01, rigidG: 'default' });
    expect(g.kind).toBe('flexible');
    expect(g.value.value).toBeCloseTo(1.162, 3);
  });
  it('with the printed, rounded inputs the factors stay within 0,003', () => {
    expect(gustEffectFactor({ exposure: 'B', V: 51, h: 183, B: 30, L: 30, beta: 0.01, rigidG: 'calculated' }).value.value).toBeCloseTo(0.818, 3);
    expect(Math.abs(gustEffectFactor({ exposure: 'B', V: 51, h: 183, B: 30, L: 30, n1: 0.2, beta: 0.01, rigidG: 'default' }).value.value - 1.162)).toBeLessThan(0.003);
  });
});

/** The pressures of one direction, and the factor that rescales q_h to the guide's printed one. */
function run(p: Partial<WindProject>, printedQh: number) {
  const project: WindProject = {
    basicSpeed: 45, exposure: 'C', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, structureKind: 'building',
    enclosure: 'enclosed', meanRoofHeight: 5, L: 10, B: 20, roofSlopeDeg: 0, rigid: true, ...p,
  };
  const res = computeWindPressures(project);
  const k = printedQh / res.qhNm2;
  /** Net p of a surface at the printed q_h (rows evaluated at h), N/m², for a (GCpi) sign. */
  const at = (surface: string, sign: 1 | -1, cp?: number) =>
    res.pressures.filter((r) => r.surface === surface && r.gcpiSign === sign && (cp === undefined || Math.abs(r.cp - cp) < 0.02))
      .filter((r) => r.zM === project.meanRoofHeight).map((r) => r.pNm2 * k);
  return { res, at };
}

describe('[GUIA] Ejemplo 1, commercial building 10 × 20 × 5 m, flat roof, enclosed (pp. 22-27)', () => {
  it('MWFRS: windward 1037 ± 275, leeward 648 ± 275 (L/B 0,5) and 389 ± 275 (L/B 2), at q_h 1525 N/m², G 0,85', () => {
    const across20 = run({ L: 10, B: 20 }, 1525);
    expect(cpLeewardWall(0.5)).toBe(-0.5);
    expect(cpLeewardWall(2)).toBeCloseTo(-0.3, 12);
    // p = qh G Cp − qh (±0,18): the + case of (GCpi) subtracts 275.
    expect(across20.at('windwardWall', 1)[0]).toBeCloseTo(1037 - 274.5, 0);
    expect(across20.at('windwardWall', -1)[0]).toBeCloseTo(1037 + 274.5, 0);
    expect(across20.at('leewardWall', 1)[0]).toBeCloseTo(-648 - 274.5, 0);
    expect(across20.at('leewardWall', -1)[0]).toBeCloseTo(-648 + 274.5, 0);
    const across10 = run({ L: 20, B: 10 }, 1525);
    expect(across10.at('leewardWall', 1)[0]).toBeCloseTo(-389 - 274.5, 0);
  });
  it('roof, θ < 10°, h/L 0,25 and 0,5: −0,9 to h, −0,5 h to 2h, −0,3 beyond (p = −1167, −648, −389 ± 275)', () => {
    for (const hl of [0.25, 0.5]) {
      expect(flatRoofCp(hl, 2, 5).cp[0]).toBe(-0.9);
      expect(flatRoofCp(hl, 4.9, 5).cp[0]).toBe(-0.9);
      expect(flatRoofCp(hl, 7, 5).cp[0]).toBe(-0.5);
      expect(flatRoofCp(hl, 12, 5).cp[0]).toBe(-0.3);
    }
    expect(1525 * 0.85 * -0.9).toBeCloseTo(-1167, 0);
  });
  it('C&C walls, A = 8,33 m², a = 1,00 m: zone 5 −1743, zone 4 −1565, both +1427 N/m² (GCp −1,07 / −0,94 / +0,84, reduced 10 %)', () => {
    const r = claddingPressures({ qhNm2: 1525, meanRoofHeight: 5, leastDimension: 10, roofSlopeDeg: 0, gcpi: 0.18, areaM2: 8.33 });
    expect(r.aWalls).toBe(1);
    const z4 = r.rows.find((x) => x.surface === 'wall' && x.zone === '4')!;
    const z5 = r.rows.find((x) => x.surface === 'wall' && x.zone === '5')!;
    // The guide prints (GCp) before the reduction of note 5 and applies it in p.
    expect(z5.gcpNeg / 0.9).toBeCloseTo(-1.07, 2);
    expect(z4.gcpNeg / 0.9).toBeCloseTo(-0.94, 2);
    expect(z4.gcpPos! / 0.9).toBeCloseTo(0.84, 2);
    // GCp is printed to two decimals: ±0,005 × 0,9 × 1525 = ±7 N/m² on p.
    expect(Math.abs(z5.pNeg * 1000 + 1743)).toBeLessThan(8);
    expect(Math.abs(z4.pNeg * 1000 + 1565)).toBeLessThan(8);
    expect(Math.abs(z4.pPos * 1000 - 1427)).toBeLessThan(8);
    expect(Math.abs(z5.pPos * 1000 - 1427)).toBeLessThan(8);
  });
});

describe('[GUIA] Ejemplo 3, office building 30 × 60 m, h 47 m, exposure B, rigid (pp. 32-37)', () => {
  it('G by Eq. (1.9-6): z̄ 28,20 m, I_z̄ 0,25, L_z̄ 138,46 m, Q 0,83, G 0,83', () => {
    const zBar = equivalentHeight(47, 'B');
    expect(zBar).toBeCloseTo(28.2, 6);
    expect(turbulenceIntensity(zBar, 'B')).toBeCloseTo(0.25, 2);
    const lz = integralLengthScale(zBar, 'B');
    expect(lz).toBeCloseTo(138.46, 1);
    expect(backgroundResponse(30, 47, lz)).toBeCloseTo(0.83, 2);
    expect(gustEffectFactor({ exposure: 'B', V: 46, h: 47, B: 30, L: 60, beta: 0.02, rigidG: 'calculated' }).value.value).toBeCloseTo(0.83, 2);
  });
  it('MWFRS side walls at q_h 1235 N/m², G 0,83: −940 / −496', () => {
    // The guide takes G with B = 30 m for both directions ("el valor menor conduce a un G mayor");
    // §1.9.4 defines B across the wind, so the module's G is the guide's with the wind along the
    // 60 m face (B = 30 m). The side walls (−0,7 for every L/B) check the assembly there.
    const { at } = run({ exposure: 'B', meanRoofHeight: 47, L: 60, B: 30, gust: { beta: 0.02, rigidG: 'calculated' } }, 1235);
    // G is printed as 0,83 (computed 0,834): ±0,005 × 1235 × 0,7 = ±4 N/m².
    expect(Math.abs(at('sideWall', 1)[0]! + 940)).toBeLessThan(5);
    expect(Math.abs(at('sideWall', -1)[0]! + 496)).toBeLessThan(5);
  });
  it('roof along the 60 m face, h/L 0,8: −0,78 (h/2 to h) and −0,62 (h to 2h) by interpolation (note 2)', () => {
    expect(flatRoofCp(0.8, 30, 47).cp[0]).toBeCloseTo(-0.78, 12);
    expect(flatRoofCp(0.8, 60, 47).cp[0]).toBeCloseTo(-0.62, 12);
  });
  it('0 to h/2: the guide reduces −1,3 by area (** note) to −1,04 and −0,98; the module takes no reduction, so it is never less', () => {
    expect(flatRoofCp(1.6, 10, 47).cp[0]).toBe(-1.3);
    expect(flatRoofCp(1.6, 10, 47).cp[0]).toBeLessThan(-1.04);
    expect(flatRoofCp(0.8, 10, 47).cp[0]).toBeCloseTo(-1.14, 12);
    expect(flatRoofCp(0.8, 10, 47).cp[0]).toBeLessThan(-0.98);
  });
});

describe('[GUIA] Ejemplo 5, house 24 × 12 m, h 3,64 m, roof 15° (pp. 46-51)', () => {
  it('wind B, h/L 0,30: windward roof C_p −0,54 by interpolation in h/L; leeward −0,5', () => {
    // This is the case that rounding h/L up to the 0,5 row got wrong (−0,7).
    const r = roofCp(3.64 / 12, 15);
    expect(Math.min(...r.windward)).toBeCloseTo(-0.54, 2);
    expect(r.leeward[0]).toBeCloseTo(-0.5, 12);
  });
  it('wind A, h/L 0,15: windward −0,5 and leeward −0,5', () => {
    const r = roofCp(3.64 / 24, 15);
    expect(Math.min(...r.windward)).toBeCloseTo(-0.5, 12);
    expect(r.leeward[0]).toBeCloseTo(-0.5, 12);
  });
  it('MWFRS at q_h 517 N/m²: windward 352 ± 93, side −308 ± 93, leeward −132 ± 93 (L/B 2)', () => {
    const { at } = run({ exposure: 'B', meanRoofHeight: 3.64, L: 24, B: 12, roofSlopeDeg: 15 }, 517);
    expect(Math.abs(at('windwardWall', 1)[0]! - (352 - 93))).toBeLessThan(1.5);
    expect(Math.abs(at('sideWall', -1)[0]! - (-308 + 93))).toBeLessThan(1.5);
    expect(Math.abs(at('leewardWall', 1)[0]! - (-132 - 93))).toBeLessThan(1.5);
  });
  it('C&C wall studs, A = 3 m², a = 1,20 m: GCp +0,92, −1,02, −1,23; p +694, −757, −890 N/m² at q_h 631 (2005), raised to the 2025 minimum', () => {
    const r = claddingPressures({ qhNm2: 631, meanRoofHeight: 3.64, leastDimension: 12, roofSlopeDeg: 15, gcpi: 0.18, areaM2: 3 });
    expect(r.aWalls).toBeCloseTo(1.2, 12);
    const z4 = r.rows.find((x) => x.surface === 'wall' && x.zone === '4')!;
    const z5 = r.rows.find((x) => x.surface === 'wall' && x.zone === '5')!;
    expect(z4.gcpPos!).toBeCloseTo(0.92, 2);
    expect(z4.gcpNeg).toBeCloseTo(-1.02, 2);
    expect(z5.gcpNeg).toBeCloseTo(-1.23, 2);
    // ±0,005 × 631 = ±3,2 N/m² from the printed GCp. The 2005 guide's +694 and −757 are below the
    // 0,80 kN/m² minimum that 2025 sets in §5.2.2, so the module gives the minimum there.
    expect(Math.abs(z5.pNeg * 1000 + 890)).toBeLessThan(3.5);
    expect(z4.pPos).toBe(0.8);
    expect(z4.pNeg).toBe(-0.8);
    expect(Math.abs(631 * (z4.gcpPos! + 0.18) - 694)).toBeLessThan(3.5);
    expect(Math.abs(631 * (z4.gcpNeg - 0.18) + 757)).toBeLessThan(3.5);
  });
});

describe('[GUIA] Ejemplo 7, industrial building 60 × 75 m, eave 6 m, slope 1:3, exposure C (pp. 53-58)', () => {
  const theta = (Math.atan(1 / 3) * 180) / Math.PI;
  it('wind along the ridge, L/B 1,25: leeward wall −0,45 by interpolation', () => {
    expect(cpLeewardWall(75 / 60)).toBeCloseTo(-0.45, 2);
  });
  it('wind normal to the ridge, h/L 0,18, θ 18°26\': windward −0,36 and 0,14, leeward −0,57', () => {
    const r = roofCp(11 / 60, theta);
    expect(r.windward[0]).toBeCloseTo(-0.36, 2);
    expect(r.windward[1]).toBeCloseTo(0.14, 2);
    expect(r.leeward[0]).toBeCloseTo(-0.57, 2);
  });
  it('MWFRS at q_h 850 N/m², G 0,85: windward roof −413/−107 and −52/254, leeward roof −565/−259', () => {
    const { at } = run({ meanRoofHeight: 11, L: 60, B: 75, roofSlopeDeg: theta }, 850);
    // C_p printed to two decimals: ±0,005 × 850 × 0,85 = ±3,6 N/m².
    const tol = 4;
    expect(Math.abs(at('windwardRoof', 1, -0.36)[0]! + 413)).toBeLessThan(tol);
    expect(Math.abs(at('windwardRoof', -1, -0.36)[0]! + 107)).toBeLessThan(tol);
    expect(Math.abs(at('windwardRoof', 1, 0.14)[0]! + 52)).toBeLessThan(tol);
    expect(Math.abs(at('windwardRoof', -1, 0.14)[0]! - 254)).toBeLessThan(tol);
    expect(Math.abs(at('leewardRoof', 1)[0]! + 565)).toBeLessThan(tol);
    expect(Math.abs(at('leewardRoof', -1)[0]! + 259)).toBeLessThan(tol);
    expect(Math.abs(at('leewardWall', 1)[0]! + 514)).toBeLessThan(tol);
    expect(Math.abs(at('sideWall', 1)[0]! + 659)).toBeLessThan(tol);
  });
});

describe('[GUIA] Ejemplo 9, monoslope roof 14°, h/L 0,5 (pp. 74-80)', () => {
  it('windward −0,74 (between 10° and 15°), leeward −0,50', () => {
    const r = roofCp(0.5, 14);
    expect(r.windward[0]).toBeCloseTo(-0.74, 12);
    expect(r.leeward[0]).toBeCloseTo(-0.5, 12);
  });
  it('wind across the slope, θ = 0, h/L 0,25: −0,90 (0-6 m), −0,50 (6-12 m), −0,30 (12-24 m), h 6 m', () => {
    expect(flatRoofCp(0.25, 3, 6).cp[0]).toBe(-0.9);
    expect(flatRoofCp(0.25, 9, 6).cp[0]).toBe(-0.5);
    expect(flatRoofCp(0.25, 18, 6).cp[0]).toBe(-0.3);
  });
});
